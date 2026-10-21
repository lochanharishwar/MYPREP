import hashlib
import hmac
import json
import os
import time
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
import httpx
from media import encoding_spec, process_job, storage_buckets
from main import app

class ProcessorBoundaryTests(unittest.TestCase):
    def test_storage_namespace_configuration(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(storage_buckets(), {'media':'media','published':'published-media'})
        with patch.dict(os.environ, {'SUPABASE_DB_SCHEMA':'brandcurrent'}, clear=True):
            with self.assertRaisesRegex(ValueError, 'SUPABASE_MEDIA_BUCKET must be configured'):
                storage_buckets()
        with patch.dict(os.environ, {'SUPABASE_MEDIA_BUCKET':'../media'}, clear=True):
            with self.assertRaisesRegex(ValueError, 'valid storage bucket identifier'):
                storage_buckets()
        with patch.dict(os.environ, {'SUPABASE_MEDIA_BUCKET':'same','SUPABASE_PUBLISHED_MEDIA_BUCKET':'same'}, clear=True):
            with self.assertRaisesRegex(ValueError, 'separate storage buckets'):
                storage_buckets()

    def test_processor_reads_and_writes_the_configured_private_bucket(self):
        requests = []
        def transport(request):
            requests.append((request.method, request.url.path))
            return httpx.Response(200, content=b'fixture' if request.method == 'GET' else b'{}')
        client_type = httpx.Client
        def client(**kwargs):
            return client_type(transport=httpx.MockTransport(transport), **kwargs)
        def prepare(source, output, spec, is_video):
            output.write_bytes(b'prepared fixture')
            return {'mimeType':spec['mimeType'], 'sha256':'fixture-checksum'}
        settings = {'SUPABASE_URL':'https://storage-fixture.supabase.co',
                    'SUPABASE_SERVICE_ROLE_KEY':'fixture-key',
                    'SUPABASE_DB_SCHEMA':'brandcurrent',
                    'SUPABASE_MEDIA_BUCKET':'brandcurrent-media',
                    'SUPABASE_PUBLISHED_MEDIA_BUCKET':'brandcurrent-published-media'}
        job = {'id':'job','workspace_id':'workspace','brand_id':'brand',
               'input':{'format':'image','platform':'instagram','assetPath':'workspace/brand/existing.png'}}
        with patch.dict(os.environ, settings, clear=True), patch('media.httpx.Client', side_effect=client), patch('media.prepare_file', side_effect=prepare), patch('media.upload_review_file', return_value={'state':'ACTIVE'}):
            result = process_job(job)
        self.assertEqual(requests, [
            ('GET','/storage/v1/object/authenticated/brandcurrent-media/workspace/brand/existing.png'),
            ('POST','/storage/v1/object/brandcurrent-media/workspace/brand/job.jpg')])
        self.assertEqual(result['assetPath'], 'workspace/brand/job.jpg')

    def test_instagram_images_are_jpeg(self):
        self.assertEqual(encoding_spec('image','instagram'),{'width':1080,'height':1350,'extension':'jpg','mimeType':'image/jpeg'})

    def test_invalid_timestamp_even_with_valid_signature(self):
        body=json.dumps({'events':[]});timestamp='not-a-number';signature=hmac.new(b'fixture-secret',(timestamp+'.'+body).encode(),hashlib.sha256).hexdigest()
        with patch.dict(os.environ,{'PROCESSOR_SECRET':'fixture-secret'}),TestClient(app) as client:
            response=client.post('/attribution',content=body,headers={'x-timestamp':timestamp,'x-signature':signature})
        self.assertEqual(response.status_code,401)

    def test_modified_body_fails_signature(self):
        timestamp=str(int(time.time()));signature=hmac.new(b'fixture-secret',(timestamp+'.{}').encode(),hashlib.sha256).hexdigest()
        with patch.dict(os.environ,{'PROCESSOR_SECRET':'fixture-secret'}),TestClient(app) as client:
            response=client.post('/attribution',content='{"events":[]}',headers={'x-timestamp':timestamp,'x-signature':signature})
        self.assertEqual(response.status_code,401)

    def test_oversized_stream_rejected_before_parsing(self):
        with patch.dict(os.environ,{'PROCESSOR_SECRET':'fixture-secret'}),TestClient(app) as client:
            response=client.post('/attribution',content=b'x'*8_000_001,headers={'x-timestamp':str(int(time.time())),'x-signature':'a'*64})
        self.assertEqual(response.status_code,413)

if __name__=='__main__':unittest.main()
