import asyncio
import hashlib
import hmac
import json
import os
import re
import time
from uuid import UUID
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
    expected=hmac.new(secret.encode(),timestamp.encode()+b'.'+body,hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected,request.headers.get('x-signature','')):
        raise HTTPException(401, 'Invalid signature')
    try: return json.loads(body)
    except (ValueError, UnicodeDecodeError): raise HTTPException(400, 'Invalid JSON')

@app.get('/health')
def health(): return {'status':'ok'}

@app.post('/attribution')
async def attribution(request:Request):
    data=await verified_body(request);events=data.get('events',[])
    if not isinstance(events,list) or len(events)>10000: raise HTTPException(400,'At most 10000 events per bounded analysis')
    lookback=int(data.get('lookbackDays',30))
    if not 1<=lookback<=365: raise HTTPException(400,'Invalid lookback')
    try:
        return await asyncio.to_thread(lambda:markov(paths_from_events(events,lookback,data.get('periodStart'),data.get('periodEnd'))))
    except (ValueError,KeyError,TypeError):
        raise HTTPException(400,'Invalid event or reporting period')

@app.post('/execute-job')
async def execute_job(request:Request):
    data=await verified_body(request)
    try: job_id=str(UUID(data.get('jobId','')))
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
