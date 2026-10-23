"""Local attack/regression suite; temporary users, database, key and mocked email provider."""
import sys,unittest,tempfile,threading,json,uuid,secrets,urllib.request,urllib.error,http.cookiejar,time,io
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import database as d,protection,business,auth_service,server,password_policy
from cryptography.fernet import Fernet

class AuthSecurity(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.old=d.DB;d.DB=Path(self.temp.name)/'auth.sqlite3'
  self.patches=[patch.object(protection,'key',return_value=Fernet.generate_key()),patch.object(auth_service,'config',return_value={'RESEND_API_KEY':'test-not-a-real-key','RESEND_FROM':'Test <test@example.invalid>','EMAIL_PUBLIC_ORIGIN':'http://localhost:8081'}),patch.object(auth_service,'send',return_value=True)]
  for p in self.patches:p.start()
  d.init();business.init()
  with d.connect() as db:
   self.admin=d.create_user(db,'admin@example.invalid','Initial-123!','Admin','admin')
   self.client=d.create_user(db,'client@example.invalid','Initial-123!','Client','client')
  self.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler);self.thread=threading.Thread(target=self.http.serve_forever,daemon=True);self.thread.start()
  self.jar=http.cookiejar.CookieJar();self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
 def tearDown(self):
  self.http.shutdown();self.http.server_close();self.thread.join()
  for p in reversed(self.patches):p.stop()
  d.DB=self.old;self.temp.cleanup()
 def request(self,path,body=None,headers=None):
  req=urllib.request.Request(f'http://127.0.0.1:{self.http.server_port}'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json','X-UNLIVED-Request':'1',**(headers or {})})
  try:
   with self.opener.open(req) as r:return r.status,r.read(),dict(r.headers)
  except urllib.error.HTTPError as e:return e.code,e.read(),dict(e.headers)
 def post(self,action,**v):
  status,body,_=self.request('/api/auth',{'action':action,**v});return status,json.loads(body)
 def login(self,email='client@example.invalid'):return self.post('login',email=email,password='Initial-123!')
 def token(self,purpose):
  with d.connect() as db:
   challenge=db.execute('SELECT * FROM auth_tokens WHERE purpose=? ORDER BY created DESC LIMIT 1',(purpose,)).fetchone();self.assertIsNotNone(challenge)
   for job in db.execute('SELECT payload FROM auth_outbox ORDER BY next_attempt DESC'):
    payload=json.loads(protection.decrypt(job['payload']))
    for line in payload['text'].splitlines():
     if line.startswith('http'):
      token=parse_qs(urlsplit(line).fragment)['token'][0]
      if __import__('hashlib').sha256(token.encode()).hexdigest()==challenge['token_hash']:return token
  self.fail('Challenge email missing')
 def test_password_rules_server_side(self):
  for password in ['Short1!','lowercase1!','UPPERCASE!!','NoSymbol12','A       1']:
   with self.assertRaises(ValueError):password_policy.validate(password)
  password_policy.validate('ABCD123!')
  status,_=self.post('signup',email='weak@example.invalid',password='weak',role='admin');self.assertEqual(status,400)
  with d.connect() as db:self.assertIsNone(d.find_user(db,'weak@example.invalid'))
 def test_signup_verification_replay_and_role_injection(self):
  status,response=self.post('signup',email='new@example.invalid',password='ABCD123!',display_name='<script>alert(1)</script>',role='admin');self.assertEqual(status,200);self.assertIsNone(response['data']['session'])
  self.assertEqual(self.post('login',email='new@example.invalid',password='ABCD123!')[0],403)
  token=self.token('verify')
  self.assertEqual(self.post('reset_password',token=token,password='New-pass123!')[0],400)
  self.assertEqual(self.post('verify_email',token=token)[0],200)
  self.assertEqual(self.post('verify_email',token=token)[0],400)
  status,result=self.post('login',email='new@example.invalid',password='ABCD123!');self.assertEqual(status,200);self.assertEqual(result['data']['user']['role'],'client')
  status,duplicate=self.post('signup',email='new@example.invalid',password='ATTACKER123!');self.assertEqual(status,200);self.assertEqual(duplicate['data']['message'],response['data']['message'])
  self.assertEqual(self.post('login',email='new@example.invalid',password='ATTACKER123!')[0],403)
 def test_reset_non_enumerating_single_use_and_session_revocation(self):
  self.login();old_cookie=next(c.value for c in self.jar if c.name=='unlived_session')
  known=self.post('reset_request',email='client@example.invalid');unknown=self.post('reset_request',email='missing@example.invalid');self.assertEqual(known,unknown)
  token=self.token('reset');self.assertEqual(self.post('verify_email',token=token)[0],400)
  self.assertEqual(self.post('reset_password',token=token,password='weak')[0],400)
  self.assertEqual(self.post('reset_password',token=token,password='Changed123!')[0],200)
  with d.connect() as db:self.assertIsNone(d.user_for(db,old_cookie))
  self.assertEqual(self.post('reset_password',token=token,password='Another123!')[0],400)
  self.assertEqual(self.post('login',email='client@example.invalid',password='Initial-123!')[0],403)
  self.assertEqual(self.post('login',email='client@example.invalid',password='Changed123!')[0],200)
 def test_expired_and_random_tokens_do_not_change_password(self):
  self.post('reset_request',email='client@example.invalid');token=self.token('reset')
  with d.connect() as db:db.execute('UPDATE auth_tokens SET expires=0')
  self.assertEqual(self.post('reset_password',token=token,password='Changed123!')[0],400)
  self.assertEqual(self.post('reset_password',token=secrets.token_urlsafe(32),password='Changed123!')[0],400)
  self.assertEqual(self.login()[0],200)
 def test_email_change_needs_password_then_confirmation(self):
  self.login()
  self.assertEqual(self.post('update',email='new@example.invalid',current_password='wrong')[0],403)
  self.assertEqual(self.post('update',email='new@example.invalid',current_password='Initial-123!')[0],200)
  with d.connect() as db:self.assertIsNone(d.find_user(db,'new@example.invalid'));self.assertIsNotNone(d.find_user(db,'client@example.invalid'))
  self.assertEqual(self.post('verify_email',token=self.token('email_change'))[0],200)
  self.assertIsNone(self.post('session')[1]['data']['session'])
  self.assertEqual(self.post('login',email='new@example.invalid',password='Initial-123!')[0],200)
 def test_failed_login_throttling_is_persistent(self):
  for _ in range(10):self.assertEqual(self.post('login',email='client@example.invalid',password='wrong')[0],403)
  server.Handler.limits.clear()
  status,response=self.login();self.assertEqual(status,400);self.assertIn('Trop de tentatives',response['error']['message'])
 def test_csrf_private_files_and_cross_account_access(self):
  self.login()
  status,_,_=self.request('/api/auth',{'action':'update','password':'Changed123!','current_password':'Initial-123!'},{'Origin':'https://evil.example'});self.assertEqual(status,403)
  for path in ['/.env','/%2eenv','/.data/auth.sqlite3','/server.py','/auth_service.py','/../.env','/assets/../.env']:
   self.assertEqual(self.request(path)[0],404,path)
  status,_,headers=self.request('/auth.html');self.assertEqual(status,200);self.assertEqual(headers['Referrer-Policy'],'no-referrer');self.assertIn("script-src 'self'",headers['Content-Security-Policy'])
  status,data,_=self.request('/api/business',{'action':'mail_status'});self.assertEqual(status,403)
  status,data,_=self.request('/api/data',{'table':'orders','action':'insert','values':{'customer_id':self.admin['id']}});self.assertEqual(status,403)
  status,data,_=self.request('/api/data',{'table':'admin_users','action':'select'});self.assertEqual(json.loads(data)['data'],[])
  status,data,_=self.request('/api/auth',{'action':'update','user_id':self.admin['id'],'password':'Changed123!','current_password':'Initial-123!'})
  self.assertEqual(status,200)
  with d.connect() as db:self.assertTrue(d.password_ok('Initial-123!',d.find_user(db,'admin@example.invalid')['password_hash']))
 def test_outbox_encrypted_retries_idempotency_and_success(self):
  self.post('reset_request',email='client@example.invalid');token=self.token('reset')
  with d.connect() as db:
   job=db.execute('SELECT * FROM auth_outbox LIMIT 1').fetchone();self.assertNotIn(token,job['payload']);self.assertNotIn('client@example.invalid',job['payload'])
  with patch.object(auth_service,'send',side_effect=OSError('simulated network failure')):auth_service.pump()
  with d.connect() as db:
   retry=db.execute('SELECT * FROM auth_outbox LIMIT 1').fetchone();self.assertEqual(retry['attempts'],1);self.assertEqual(retry['id'],job['id']);db.execute('UPDATE auth_outbox SET next_attempt=0')
  with patch.object(auth_service,'send',return_value=True) as send:auth_service.pump();self.assertEqual(send.call_args.args[1],job['id'])
  with d.connect() as db:self.assertEqual(db.execute('SELECT count(*) FROM auth_outbox').fetchone()[0],0)

if __name__=='__main__':unittest.main(verbosity=2)
