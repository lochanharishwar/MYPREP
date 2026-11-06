import asyncio
import hashlib
import hmac
import json
import os
import re
import time
from uuid import UUID
from datetime import datetime
from fastapi import FastAPI, HTTPException, Request
from attribution import markov, paths_from_events
from media import database, process_job

app = FastAPI(title='BrandCurrent processor', docs_url=None, redoc_url=None, openapi_url=None)
media_slots = asyncio.Semaphore(1)

async def verified_body(request):
    secret = os.environ.get('PROCESSOR_SECRET')
    if not secret: raise HTTPException(503, 'Processor secret is not configured')
    timestamp = request.headers.get('x-timestamp', '')
    if not re.fullmatch(r'[0-9]{10}', timestamp) or abs(time.time()-int(timestamp))>300:
        raise HTTPException(401, 'Invalid or expired timestamp')
    body=bytearray()
    async for chunk in request.stream():
        if len(body)+len(chunk)>8_000_000: raise HTTPException(413, 'Payload too large')
        body.extend(chunk)
    signature = request.headers.get('x-signature','')
    if not re.fullmatch(r'[a-fA-F0-9]{64}', signature):
        raise HTTPException(401, 'Invalid signature')
    expected=hmac.new(secret.encode(),timestamp.encode()+b'.'+body,hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature.lower()):
        raise HTTPException(401, 'Invalid signature')
    try:
        def invalid_constant(value):
            raise ValueError('Invalid JSON constant')
        parsed = json.loads(body, parse_constant=invalid_constant)
        if not isinstance(parsed, dict): raise ValueError('Expected an object')
        return parsed
    except (ValueError, UnicodeDecodeError, RecursionError): raise HTTPException(400, 'Invalid JSON')

def event_time(value):
    if not isinstance(value, str) or len(value)>40:
        raise ValueError('Invalid timestamp')
    parsed=datetime.fromisoformat(value.replace('Z','+00:00'))
    if parsed.tzinfo is None: raise ValueError('Timestamp must include a timezone')
    return parsed

def validate_events(events):
    for event in events:
        if not isinstance(event,dict): raise ValueError('Invalid event')
        event_time(event.get('occurred_at'))
        if event.get('type') not in ('page_view','engaged','click','video_progress','purchase','refund','identify'):
            raise ValueError('Invalid event type')
        for name in ('id','journey_id','customer_id','anonymous_id','channel'):
            value=event.get(name)
            if value is not None and (not isinstance(value,str) or len(value)>200):
                raise ValueError('Invalid event field')
        if not (event.get('journey_id') or event.get('customer_id') or event.get('anonymous_id')):
            raise ValueError('An event identity is required')
        if event.get('channel') in ('__start__','__conversion__','__null__'):
            raise ValueError('Reserved channel name')
        # Verified monetary/identity events must carry an explicit trusted source.
        # Browser purchase events are accepted as input but never counted as conversions.
        if event.get('source') not in (None,'server','import','browser') or (
            event['type'] in ('purchase','refund','identify') and event.get('source') is None
        ):
            raise ValueError('Invalid event source')

@app.get('/health')
def health(): return {'status':'ok'}

@app.post('/attribution')
async def attribution(request:Request):
    data=await verified_body(request);events=data.get('events',[])
    if not isinstance(events,list) or len(events)>10000: raise HTTPException(400,'At most 10000 events per bounded analysis')
    lookback=data.get('lookbackDays',30)
    if type(lookback) is not int or not 1<=lookback<=365: raise HTTPException(400,'Invalid lookback')
    try:
        validate_events(events)
        start=event_time(data['periodStart']) if data.get('periodStart') is not None else None
        end=event_time(data['periodEnd']) if data.get('periodEnd') is not None else None
        if start and end and start>=end: raise ValueError('Invalid reporting period')
        return await asyncio.to_thread(lambda:markov(paths_from_events(events,lookback,data.get('periodStart'),data.get('periodEnd'))))
    except (ValueError,KeyError,TypeError,AttributeError,OverflowError):
        raise HTTPException(400,'Invalid event or reporting period')

@app.post('/execute-job')
async def execute_job(request:Request):
    data=await verified_body(request)
    raw_job_id=data.get('jobId')
    if not isinstance(raw_job_id,str): raise HTTPException(400,'Invalid job ID')
    try: job_id=str(UUID(raw_job_id))
    except (ValueError,TypeError): raise HTTPException(400,'Invalid job ID')
    async with media_slots:
        job=await asyncio.to_thread(database,'POST','rpc/claim_media',{'p_id':job_id})
        if not job:
            rows=await asyncio.to_thread(database,'GET','media_jobs?id=eq.'+job_id+'&select=status,result')
            if not rows: raise HTTPException(404,'Media job not found')
            return rows[0]
        try:
            result=await asyncio.to_thread(process_job,job)
            await asyncio.to_thread(database,'PATCH','media_jobs?id=eq.'+job_id,{'status':'completed','result':result,'lease_until':None,'error':None,'updated_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})
            return {'status':'completed','result':result}
        except Exception as error:
            # Do not persist provider payloads, signed URLs, headers, or local file paths.
            message='Media processing failed: '+type(error).__name__+'. Inspect processor logs using the job ID.'
            await asyncio.to_thread(database,'PATCH','media_jobs?id=eq.'+job_id,{'status':'failed','error':message,'lease_until':None})
            raise HTTPException(422,message)
