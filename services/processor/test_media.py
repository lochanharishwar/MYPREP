import hashlib
import hmac
import json
import os
import time
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from media import encoding_spec
from main import app

class ProcessorBoundaryTests(unittest.TestCase):
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
