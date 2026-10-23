"""Regression tests. Only temporary databases and generated credentials are used."""
import sys,json,tempfile,unittest,threading,urllib.request,urllib.error,http.cookiejar,uuid,os
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import database as d,business as b,protection,server
from cryptography.fernet import Fernet

class Workflows(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.old_db=d.DB;d.DB=Path(self.temp.name)/'test.sqlite3'
  self.keypatch=patch.object(protection,'key',return_value=Fernet.generate_key());self.keypatch.start()
  d.init();b.init()
  with d.connect() as db:
   self.admin=d.create_user(db,'admin@example.invalid','Initial-password-123','Admin','admin')
   self.client=d.create_user(db,'client@example.invalid','Initial-password-123','Client','client')
   self.partner=d.create_user(db,'partner@example.invalid','Initial-password-123','Partner','client')
 def tearDown(self):
  d.DB=self.old_db;self.keypatch.stop();self.temp.cleanup()
 def apply(self,db,action,values=None,user=None):return b.handle(db,{'action':action,'values':values or {}},user or self.admin)
 def affiliate(self,db):
  row=self.apply(db,'affiliate_apply',{'accept':True},self.partner)
  return self.apply(db,'affiliate_update',{'id':row['id'],'status':'active','percent':20})
 def product_values(self,db):
  product=next(p for p in d.rows(db,'products') if p['slug']=='day-one')
  variants=[v for v in d.rows(db,'product_variants') if v['product_id']==product['id']]
  variant=next(v for v in variants if v['color_slug']=='noir')
  return {'product_id':product['id'],'product':{k:product.get(k) for k in ('title','slug','status','collection','category','description','price_cents','planned_price_cents','currency')},'variant_id':variant['id'],'variant':{k:variant.get(k) for k in ('color_name','color_slug','color_hex','sku','stock_quantity','stock_status','is_available')},'media':[m['url'] for m in d.rows(db,'product_media') if m.get('variant_id')==variant['id']]}
 def test_product_atomic_correct_variant(self):
  with d.connect() as db:
   v=self.product_values(db);before=d.rows(db,'product_variants');v['product']['price_cents']=3500;v['variant'].update(stock_quantity=None,stock_status='in_stock')
   result=self.apply(db,'product_save',v)
   self.assertEqual(result['price_cents'],3500)
   changed=next(x for x in result['product_variants'] if x['id']==v['variant_id']);self.assertEqual(changed['stock_status'],'in_stock')
   for old in before:
    if old['id']!=v['variant_id']:self.assertEqual(old,next(x for x in d.rows(db,'product_variants') if x['id']==old['id']))
   v['variant']['stock_status']='out_of_stock';self.apply(db,'product_save',v)
   self.assertEqual(next(x for x in d.rows(db,'product_variants') if x['id']==v['variant_id'])['stock_status'],'out_of_stock')
  with d.connect() as db:v=self.product_values(db);original=v['product']['price_cents']
  v['product']['price_cents']=9999;v['variant'].update(stock_status='in_stock',stock_quantity=0)
  with self.assertRaises(ValueError):
   with d.connect() as db:self.apply(db,'product_save',v)
  with d.connect() as db:self.assertEqual(next(x for x in d.rows(db,'products') if x['id']==v['product_id'])['price_cents'],original)
 def test_attribution_return_account_cart_and_order(self):
  with d.connect() as db:
   aff=self.affiliate(db);ref,token=b.attribution(db,None,'',aff['code']);self.assertTrue(token)
   returning,new_token=b.attribution(db,None,token);self.assertEqual(returning['code'],aff['code']);self.assertIsNone(new_token)
   bound,_=b.attribution(db,self.client,token);self.assertEqual(bound['user_id'],self.client['id'])
   later,_=b.attribution(db,self.client);self.assertEqual(later['expires'],ref['expires'])
   self.apply(db,'cart_save',{'items':[]},self.client)
   self.assertEqual(d.rows(db,'carts')[0]['affiliate_code'],aff['code'])
   order=d.query(db,{'table':'orders','action':'insert','values':{'customer_id':self.client['id'],'status':'pending'}},self.admin)[0]
   self.assertEqual(order['affiliate_code'],aff['code']);self.assertEqual(order['commission_percent'],20)
   self.assertIsNone(b.attribution(db,self.partner,token)[0])
   self.assertIsNone(b.attribution(db,self.admin,token)[0])
   d.save(db,'affiliate_attributions',{**bound,'expires':0})
   self.assertIsNone(b.attribution(db,self.client,token)[0])
 def test_pending_suspended_and_unique_links(self):
  with d.connect() as db:
   pending=self.apply(db,'affiliate_apply',{'accept':True},self.partner)
   self.assertIsNone(b.attribution(db,None,'',pending['code'])[0])
   active=self.apply(db,'affiliate_update',{'id':pending['id'],'status':'active','percent':20})
   self.assertEqual(pending['code'],active['code'])
   other=self.apply(db,'affiliate_apply',{'accept':True},self.client);self.assertNotEqual(other['code'],active['code'])
   _,token=b.attribution(db,None,'',active['code'])
   self.apply(db,'affiliate_update',{'id':active['id'],'status':'suspended','percent':20})
   self.assertIsNone(b.attribution(db,None,token)[0])
 def test_tracking_owner_exclusion_and_useful_data(self):
  body={'consent':True,'event':'page_view','path':'/boutique.html','visitor':str(uuid.uuid4()),'session':str(uuid.uuid4()),'source':'newsletter','device':'mobile'}
  with d.connect() as db:
   self.assertTrue(b.track(db,body,self.admin,'198.51.100.10','Browser')['excluded'])
   b.exclude_ip(db,'198.51.100.10')
   self.assertTrue(b.track(db,body,None,'198.51.100.10','Browser')['excluded'])
   self.assertNotIn('198.51.100.10',json.dumps(d.rows(db,'analytics_exclusions')))
   self.assertTrue(b.track(db,body,None,'198.51.100.11','Browser')['recorded'])
   self.assertTrue(b.track(db,body,None,'198.51.100.11','Browser')['duplicate'])
   event=d.rows(db,'analytics_events')[0];self.assertEqual(event['source'],'newsletter');self.assertEqual(event['device'],'mobile');self.assertNotIn('ip',event)
   self.assertEqual(b.stats(db)['views'],1)
   body['event_id']=str(uuid.uuid4());self.assertTrue(b.track(db,body,None,'198.51.100.11','Browser')['recorded'])
   self.assertTrue(b.track(db,body,None,'198.51.100.11','Browser')['duplicate'])
   body['event_id']=str(uuid.uuid4());self.assertTrue(b.track(db,body,None,'198.51.100.11','Browser')['recorded'])
   self.assertEqual(b.stats(db)['views'],3)
 def test_trusted_proxy_does_not_trust_spoofed_ip(self):
  with patch.dict(os.environ,{'TRUSTED_PROXIES':'127.0.0.1/32'}):
   self.assertEqual(server.client_ip('198.51.100.20',{'X-Forwarded-For':'1.2.3.4'}),'198.51.100.20')
   self.assertEqual(server.client_ip('127.0.0.1',{'X-Forwarded-For':'198.51.100.20'}),'198.51.100.20')
 def test_http_affiliate_cookie_return_login_and_cart(self):
  with d.connect() as db:aff=self.affiliate(db)
  http_server=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler);thread=threading.Thread(target=http_server.serve_forever,daemon=True);thread.start()
  jar=http.cookiejar.CookieJar();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
  def post(path,body):
   req=urllib.request.Request(f'http://127.0.0.1:{http_server.server_port}{path}',data=json.dumps(body).encode(),headers={'Content-Type':'application/json','X-UNLIVED-Request':'1','X-Forwarded-For':'198.51.100.30'})
   with opener.open(req) as r:return json.load(r)
  try:
   with patch.dict(os.environ,{'TRUSTED_PROXIES':'127.0.0.1/32'}):
    event={'consent':True,'event':'page_view','path':'/boutique.html','visitor':str(uuid.uuid4()),'session':str(uuid.uuid4()),'affiliate':aff['code']}
    self.assertTrue(post('/api/track',event)['data']['recorded'])
    self.assertTrue(any(c.name=='unlived_affiliate' and c.has_nonstandard_attr('HttpOnly') for c in jar))
    event.pop('affiliate');event['path']='/index.html'
    self.assertTrue(post('/api/track',event)['data']['recorded'])
    result=post('/api/auth',{'action':'login','email':'client@example.invalid','password':'Initial-password-123'});self.assertIsNone(result['error'])
    post('/api/business',{'action':'cart_save','values':{'items':[]}})
    with d.connect() as db:
     self.assertTrue(all(e['affiliate']==aff['code'] for e in d.rows(db,'analytics_events')))
     self.assertEqual(d.rows(db,'carts')[0]['affiliate_code'],aff['code'])
  finally:http_server.shutdown();http_server.server_close();thread.join()
 def test_credentials_http_and_persistent_admin_exclusion(self):
  http_server=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler);thread=threading.Thread(target=http_server.serve_forever,daemon=True);thread.start()
  jar=http.cookiejar.CookieJar();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
  def post(action,**values):
   req=urllib.request.Request(f'http://127.0.0.1:{http_server.server_port}/api/auth',data=json.dumps({'action':action,**values}).encode(),headers={'Content-Type':'application/json','X-UNLIVED-Request':'1'})
   try:
    with opener.open(req) as r:return json.load(r)
   except urllib.error.HTTPError as error:return json.load(error)
  try:
   self.assertIsNone(post('login',email='admin@example.invalid',password='Initial-password-123')['error'])
   self.assertTrue(any(c.name=='unlived_analytics_exclude' for c in jar))
   self.assertIsNotNone(post('update',email='new@example.invalid',current_password='wrong')['error'])
   self.assertIsNone(post('update',email='new@example.invalid',current_password='Initial-password-123')['error'])
   with d.connect() as db:
    self.assertIsNotNone(d.find_user(db,'admin@example.invalid'))
    self.assertIsNone(d.find_user(db,'new@example.invalid'))
    job=db.execute('SELECT payload FROM auth_outbox ORDER BY next_attempt DESC LIMIT 1').fetchone()
    from urllib.parse import urlsplit,parse_qs
    payload=json.loads(protection.decrypt(job['payload']))
    link=next(line for line in payload['text'].splitlines() if line.startswith('http'))
    verify_token=parse_qs(urlsplit(link).fragment)['token'][0]
   self.assertIsNone(post('verify_email',token=verify_token)['error'])
   self.assertIsNone(post('login',email='new@example.invalid',password='Initial-password-123')['error'])
   self.assertIsNone(post('update',password='Updated-password-456',current_password='Initial-password-123')['error'])
   post('logout');self.assertTrue(any(c.name=='unlived_analytics_exclude' for c in jar))
   self.assertIsNotNone(post('login',email='admin@example.invalid',password='Initial-password-123')['error'])
   self.assertIsNone(post('login',email='new@example.invalid',password='Updated-password-456')['error'])
  finally:http_server.shutdown();http_server.server_close();thread.join()

if __name__=='__main__':unittest.main(verbosity=2)
