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
    def signed_request(self, path, body):
        timestamp=str(int(time.time()))
        signature=hmac.new(b'fixture-secret',(timestamp+'.'+body).encode(),hashlib.sha256).hexdigest()
        with patch.dict(os.environ,{'PROCESSOR_SECRET':'fixture-secret'}),TestClient(app) as client:
            return client.post(path,content=body,headers={'x-timestamp':timestamp,'x-signature':signature})

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

    def test_signed_invalid_shapes_return_client_errors(self):
        invalid = [None, [], {'lookbackDays':'bad'}, {'lookbackDays':True},
                   {'lookbackDays':1.5}, {'events':[None]}, {'periodStart':{}},
                   {'events':[{'anonymous_id':'a','occurred_at':None}]}]
        for value in invalid:
            with self.subTest(value=value):
                body=json.dumps(value);timestamp=str(int(time.time()))
                signature=hmac.new(b'fixture-secret',(timestamp+'.'+body).encode(),hashlib.sha256).hexdigest()
                with patch.dict(os.environ,{'PROCESSOR_SECRET':'fixture-secret'}),TestClient(app) as client:
                    response=client.post('/attribution',content=body,headers={'x-timestamp':timestamp,'x-signature':signature})
                self.assertEqual(response.status_code,400)

    def test_invalid_event_fields_and_reporting_periods_are_rejected(self):
        event={'anonymous_id':'visitor','occurred_at':'2026-10-01T12:00:00Z','type':'click','channel':'social'}
        invalid=[
            {'events':[{**event,'channel':['social']}]},
            {'events':[{**event,'channel':'__conversion__'}]},
            {'events':[{**event,'type':'invented'}]},
            {'events':[{**event,'anonymous_id':{}}]},
            {'events':[{**event,'occurred_at':'2026-10-01T12:00:00'}]},
            {'events':[{**event,'type':'purchase'}]},
            {'events':[{**event,'source':'untrusted'}]},
            {'periodStart':'2026-10-02T00:00:00Z','periodEnd':'2026-10-01T00:00:00Z'},
        ]
        for value in invalid:
            with self.subTest(value=value):
                self.assertEqual(self.signed_request('/attribution',json.dumps(value)).status_code,400)

    def test_trusted_events_and_browser_nonconversions_remain_supported(self):
        events=[]
        for index in range(20):
            events.append({'anonymous_id':str(index),'occurred_at':'2026-10-01T12:00:00Z','type':'click','channel':'social','source':'browser'})
            if index<10:
                events.append({'anonymous_id':str(index),'occurred_at':'2026-10-01T12:01:00Z','type':'purchase','source':'server'})
        response=self.signed_request('/attribution',json.dumps({'events':events}))
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['status'],'completed')
        self.assertEqual(response.json()['conversions'],10)
        self.assertEqual(response.json()['journeys'],20)

    def test_nonstandard_and_over_nested_json_are_rejected(self):
        for body in ('{"events":NaN}', '{"events":Infinity}', '{"events":'+('['*1100)+(']'*1100)+'}'):
            self.assertEqual(self.signed_request('/attribution',body).status_code,400)

    def test_invalid_job_ids_do_not_reach_the_database(self):
        with patch('main.database') as database:
            for value in (None, [], {}, True, 12, 'not-a-uuid'):
                with self.subTest(value=value):
                    response=self.signed_request('/execute-job',json.dumps({'jobId':value}))
                    self.assertEqual(response.status_code,400)
            database.assert_not_called()

    def test_processing_errors_do_not_leak_provider_details(self):
        calls=[]
        def database(method,path,payload=None):
            calls.append((method,path,payload))
            return {'id':'11111111-1111-4111-8111-111111111111'} if method=='POST' else None
        secret='provider-secret-in-failed-url'
        with patch('main.database',side_effect=database),patch('main.process_job',side_effect=RuntimeError(secret)):
            response=self.signed_request('/execute-job',json.dumps({'jobId':'11111111-1111-4111-8111-111111111111'}))
        self.assertEqual(response.status_code,422)
        self.assertNotIn(secret,response.text)
        self.assertNotIn(secret,json.dumps(calls))
        self.assertEqual(calls[-1][2]['status'],'failed')

if __name__=='__main__':unittest.main()
