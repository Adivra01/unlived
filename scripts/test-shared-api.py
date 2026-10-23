"""Read-only regression checks for shared API routing."""
import io,json,sys,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server,shared_api
class SharedApiTests(unittest.TestCase):
 def test_origin_rejects_insecure_and_embedded_credentials(self):
  for value in ['http://unlived.club','https://user:pass@unlived.club','https://unlived.club/path','https://unlived.club?x=1']:
   with self.assertRaises(ValueError):shared_api.validate_origin(value)
 def handler(self,path='/api/auth'):
  h=server.Handler.__new__(server.Handler);h.path=path
  h.server=SimpleNamespace(server_port=8081,shared_api_origin='https://unlived.club')
  payload=json.dumps({'action':'session'}).encode();h.rfile=io.BytesIO(payload);h.wfile=io.BytesIO()
  h.headers={'Host':'localhost:8081','Origin':'http://localhost:8081','X-UNLIVED-Request':'1','Content-Length':str(len(payload)),'Cookie':'unlived_session=opaque'}
  h.send_response=lambda status:setattr(h,'status',status);h.send_header=lambda *args:None;h.end_headers=lambda:None
  return h
 def test_request_never_opens_local_database(self):
  h=self.handler()
  with patch('server.database.connect',side_effect=AssertionError('local DB forbidden')),patch('shared_api.forward',return_value=(200,'application/json',b'{"data":{}}',[])) as upstream:
   h.do_POST()
  self.assertEqual(h.status,200);self.assertEqual(upstream.call_args.args[0],'https://unlived.club')
 def test_outage_has_no_local_fallback(self):
  h=self.handler()
  with patch('server.database.connect',side_effect=AssertionError('local DB forbidden')),patch('shared_api.forward',side_effect=OSError('offline')):h.do_POST()
  self.assertEqual(h.status,502);self.assertIn('Aucune donnée',json.loads(h.wfile.getvalue())['error']['message'])
 def test_invalid_origin_does_not_reach_upstream(self):
  h=self.handler();h.headers['Origin']='https://attacker.example'
  with patch('shared_api.forward') as upstream:h.do_POST();upstream.assert_not_called()
  self.assertEqual(h.status,403)
 def test_cookies_filtered_and_no_redirects(self):
  from email.message import Message
  headers=Message();headers.add_header('Content-Type','application/json');headers.add_header('Set-Cookie','unlived_session=secret; Domain=unlived.club; Secure; HttpOnly; SameSite=Lax; Path=/')
  response=SimpleNamespace(status=200,headers=headers,read=lambda _:b'{}')
  class Context:
   def __enter__(self):return response
   def __exit__(self,*args):pass
  opener=SimpleNamespace(open=lambda request,timeout:Context())
  with patch('shared_api.build_opener',return_value=opener):
   result=shared_api.forward('https://unlived.club','/api/auth',b'{}','other=private; unlived_session=secret')
  self.assertIn('HttpOnly',result[3][0]);self.assertNotIn('Domain=',result[3][0]);self.assertNotIn('Secure',result[3][0])
unittest.main()
