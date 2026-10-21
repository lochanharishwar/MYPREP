"""Bounded file processing. Source and output stay in private object storage."""
import hashlib
import json
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import quote, urlparse
import httpx

MAX_BYTES = 18_000_000

def storage_buckets():
    custom_schema = (os.environ.get('SUPABASE_DB_SCHEMA') or 'public') != 'public'
    def setting(key, fallback):
        value = os.environ.get(key)
        if custom_schema and not value:
            raise ValueError(key+' must be configured for a custom database schema')
        name = value or fallback
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,62}', name):
            raise ValueError(key+' must be a valid storage bucket identifier')
        return name
    media = setting('SUPABASE_MEDIA_BUCKET', 'media')
    published = setting('SUPABASE_PUBLISHED_MEDIA_BUCKET', 'published-media')
    if media == published:
        raise ValueError('Private and published media must use separate storage buckets')
    return {'media': media, 'published': published}

def encoding_spec(media_format, platform):
    if media_format not in ('image', 'video') or platform not in ('instagram', 'youtube', 'x', 'linkedin', 'reddit'):
        raise ValueError('Unsupported format/platform')
    return {'width': 1080 if media_format == 'video' or platform == 'instagram' else 1200,
            'height': 1920 if media_format == 'video' else 1350 if platform == 'instagram' else 1200,
            'extension': 'mp4' if media_format == 'video' else 'jpg',
            'mimeType': 'video/mp4' if media_format == 'video' else 'image/jpeg'}

def database(method, path, payload=None):
    origin = os.environ['SUPABASE_URL'].rstrip('/')
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    with httpx.Client(timeout=30, follow_redirects=False) as client:
        schema = os.environ.get('SUPABASE_DB_SCHEMA', 'public')
        response = client.request(method, origin+'/rest/v1/'+path, headers={'apikey':key,'Authorization':'Bearer '+key,'Prefer':'return=representation','Accept-Profile':schema,'Content-Profile':schema}, json=payload)
        response.raise_for_status()
        return response.json() if response.content else None

def prepare_file(source, output, spec, is_video):
    graph=f"scale={spec['width']}:{spec['height']}:force_original_aspect_ratio=decrease,pad={spec['width']}:{spec['height']}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1"
    command=['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-protocol_whitelist','file,pipe','-i',str(source),'-vf',graph]
    command += ['-t','60','-c:v','libx264','-preset','fast','-crf','22','-maxrate','2M','-bufsize','4M','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart'] if is_video else ['-frames:v','1','-q:v','2']
    subprocess.run(command+['-y',str(output)],check=True,timeout=180,capture_output=True)
    if output.stat().st_size>MAX_BYTES:
        raise ValueError('Prepared media exceeds 18 MB. Reduce duration or complexity.')
    raw=subprocess.run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(output)],check=True,timeout=15,capture_output=True)
    probe=json.loads(raw.stdout)
    video=next(s for s in probe['streams'] if s['codec_type']=='video')
    audio=next((s for s in probe['streams'] if s['codec_type']=='audio'),None)
    checksum=hashlib.sha256()
    with output.open('rb') as file:
        for chunk in iter(lambda:file.read(65536),b''):checksum.update(chunk)
    return {'mimeType':spec['mimeType'],'width':video['width'],'height':video['height'],'duration':float(probe['format']['duration']) if is_video else None,'bytes':output.stat().st_size,'sha256':checksum.hexdigest(),'videoCodec':video['codec_name'] if is_video else None,'audioCodec':audio['codec_name'] if audio else None}

def upload_review_file(client, output, mime):
    key=os.environ['GEMINI_API_KEY']
    start=client.post('https://generativelanguage.googleapis.com/upload/v1beta/files',headers={'x-goog-api-key':key,'X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start','X-Goog-Upload-Header-Content-Length':str(output.stat().st_size),'X-Goog-Upload-Header-Content-Type':mime},json={'file':{'display_name':'brandcurrent-reviewed-media'}})
    start.raise_for_status();url=start.headers['x-goog-upload-url'];parsed=urlparse(url)
    if parsed.scheme!='https' or parsed.hostname!='generativelanguage.googleapis.com':raise ValueError('Unexpected review upload origin')
    with output.open('rb') as file:
        response=client.post(url,headers={'Content-Length':str(output.stat().st_size),'X-Goog-Upload-Offset':'0','X-Goog-Upload-Command':'upload, finalize'},content=file)
    response.raise_for_status();result=response.json()['file']
    for _ in range(30):
        if result.get('state')=='ACTIVE':return {'uri':result['uri'],'name':result['name'],'state':'ACTIVE'}
        if result.get('state')=='FAILED':raise ValueError('Review file processing failed')
        time.sleep(2)
        response=client.get('https://generativelanguage.googleapis.com/v1beta/'+result['name'],headers={'x-goog-api-key':key});response.raise_for_status();result=response.json()
    raise ValueError('Review file is still processing. Retry the durable job.')

def process_job(job):
    # Paths are relative to the deployment's configured private bucket. Changing
    # configuration never moves or rewrites existing objects.
    bucket = storage_buckets()['media']
    spec=encoding_spec(job['input']['format'],job['input']['platform'])
    prefix=f"{job['workspace_id']}/{job['brand_id']}/"
    path=job['input']['assetPath']
    if not path.startswith(prefix) or '..' in path:raise ValueError('Invalid asset scope')
    origin=os.environ['SUPABASE_URL'].rstrip('/');key=os.environ['SUPABASE_SERVICE_ROLE_KEY'];headers={'Authorization':'Bearer '+key,'apikey':key}
    with tempfile.TemporaryDirectory(prefix='brandcurrent-') as folder, httpx.Client(timeout=60,follow_redirects=False) as client:
        source=Path(folder)/'input';size=0
        with client.stream('GET',origin+'/storage/v1/object/authenticated/'+bucket+'/'+quote(path,safe='/'),headers=headers) as response:
            response.raise_for_status()
            with source.open('wb') as file:
                for chunk in response.iter_bytes(65536):
                    size+=len(chunk)
                    if size>MAX_BYTES:raise ValueError('Source media exceeds the supported 18 MB limit')
                    file.write(chunk)
        output=Path(folder)/('prepared.'+spec['extension']);metadata=prepare_file(source,output,spec,job['input']['format']=='video')
        target=prefix+job['id']+'.'+spec['extension']
        with output.open('rb') as file:
            response=client.post(origin+'/storage/v1/object/'+bucket+'/'+quote(target,safe='/'),headers={**headers,'Content-Type':spec['mimeType'],'Content-Length':str(output.stat().st_size),'x-upsert':'true'},content=file)
        response.raise_for_status()
        review=upload_review_file(client,output,spec['mimeType'])
        return {'assetPath':target,'mimeType':spec['mimeType'],'media':metadata,'reviewFile':review}
