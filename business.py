"""Account-scoped business services. No card collection or payment execution."""
import json,uuid,re,secrets
from datetime import datetime,timedelta,timezone
from collections import Counter
import database as d
import protection
TABLES=('affiliates','withdrawals','campaigns','discounts','settings','carts','closure_requests','audit_events','analytics_events')
def init():
 with d.connect() as db:
  for t in TABLES:db.execute(f'CREATE TABLE IF NOT EXISTS {t}(id TEXT PRIMARY KEY,data TEXT NOT NULL CHECK(json_valid(data)))')
  if not d.rows(db,'settings'):d.save(db,'settings',{'id':'site','announcement':'ACTE I: DAY ONE — Le premier chapitre.','announcement_link':'boutique.html','commission_percent':20,'withdrawal_min_cents':2000,'commission_hold_days':30,'withdrawal_methods':['mobile_money','bank_transfer']})
def add(db,table,values):
 row={'id':str(uuid.uuid4()),'created_at':d.now(),**values};d.save(db,table,row);return row
def audit(db,user,action,entity):add(db,'audit_events',{'user_id':user['id'],'action':action,'entity':entity})
def config(db):return d.rows(db,'settings')[0]
def require(user,admin=False):
 if not user or (admin and user['role']!='admin'):raise PermissionError('Accès non autorisé.')
def owned(db,table,user):return [r for r in d.rows(db,table) if r.get('user_id')==user['id']]
def text(v,n=250):return str(v or '').strip()[:n]
def money(v):
 if isinstance(v,bool) or not isinstance(v,int) or v<0:raise ValueError('Montant invalide.')
 return v
def stats(db,days=30,affiliate=None,campaign=None):
 start=(datetime.now(timezone.utc)-timedelta(days=days-1)).date().isoformat()
 events=[e for e in d.rows(db,'analytics_events') if e['created_at'][:10]>=start and (not affiliate or e.get('affiliate')==affiliate) and (not campaign or e.get('campaign')==campaign)]
 visits=[e for e in events if e.get('event')=='page_view'];visitors={e['visitor'] for e in visits}
 daily=[]
 for i in range(days):
  day=(datetime.now(timezone.utc)-timedelta(days=days-1-i)).date().isoformat();items=[e for e in visits if e['created_at'][:10]==day];daily.append({'day':day,'views':len(items),'visitors':len({e['visitor'] for e in items})})
 def counts(key,items):return [{'name':k,'count':v} for k,v in Counter(e.get(key) or 'Inconnu' for e in items).most_common(30)]
 return {'views':len(visits),'visitors':len(visitors),'sessions':len({e['session'] for e in visits}),'daily':daily,'pages':counts('path',visits),'countries':counts('country',visits),'products':counts('product',[e for e in events if e.get('event')=='product_view']),'events':counts('event',events)}
def balance(db,affiliate):
 # Only server-confirmed paid orders enter the commission balance; no client can confirm payment.
 orders=[o for o in d.rows(db,'orders') if o.get('affiliate_code')==affiliate['code'] and o.get('payment_verified') is True and o.get('payment_status')=='paid' and o.get('customer_id')!=affiliate['user_id'] and o.get('currency','EUR')=='EUR' and o.get('status') not in ('cancelled','refunded')]
 hold=config(db).get('commission_hold_days',30);pending=available=0
 for o in orders:
  value=int(o.get('commission_cents',0));paid=o.get('paid_at','')
  if paid and datetime.fromisoformat(paid)<datetime.now(timezone.utc)-timedelta(days=hold):available+=value
  else:pending+=value
 withdrawals=[w for w in d.rows(db,'withdrawals') if w['user_id']==affiliate['user_id']]
 reserved=sum(w['amount_cents'] for w in withdrawals if w['status'] in ('requested','approved','paid'))
 return {'sales_cents':sum(o.get('total_cents',0) for o in orders),'orders':len(orders),'pending_cents':pending,'earned_cents':available+pending,'available_cents':max(0,available-reserved),'withdrawals':withdrawals}
def handle(db,body,user):
 action=body.get('action');v=body.get('values') or {}
 if action=='public_settings':
  s=config(db);return {k:s[k] for k in ('announcement','announcement_link','commission_percent','withdrawal_min_cents','commission_hold_days')}
 if action=='coupon':
  code=text(v.get('code'),40).upper();row=next((r for r in d.rows(db,'discounts') if r['code']==code and r['active']),None)
  if not row or row.get('expires') and row['expires']<datetime.now(timezone.utc).date().isoformat():raise ValueError('Code invalide ou expiré.')
  return {'code':code,'percent':row['percent'],'note':'Applicable à une future commande éligible ; aucun paiement actuellement.'}
 require(user)
 if action=='account':
  aff=next(iter(owned(db,'affiliates',user)),None)
  return {'role':user['role'],'affiliate':aff,'balance':balance(db,aff) if aff else None,'stats':stats(db,30,aff['code']) if aff else None,'cart':next(iter(owned(db,'carts',user)),{}).get('items',[]),'closure':owned(db,'closure_requests',user),'settings':config(db)}
 if action=='cart_load':
  cart=next(iter(owned(db,'carts',user)),{}).get('items',[]);products={p['id']:p for p in d.rows(db,'products')};variants={p['id']:p for p in d.rows(db,'product_variants')};media=d.rows(db,'product_media');result=[]
  for x in cart:
   p=products.get(x['productId']);variant=variants.get(x['variantId'])
   if not p or not variant or p.get('status')!='active':continue
   photo=next((m.get('url','') for m in media if m.get('product_id')==p['id'] and m.get('media_type')=='image'),'')
   result.append({**x,'title':p['title'],'collection':p.get('collection',''),'variantName':variant.get('color_name',''),'image':photo,'priceCents':None,'currency':p.get('currency','EUR')})
  return result
 if action=='cart_save':
  items=v.get('items',[])
  if not isinstance(items,list) or len(items)>40:raise ValueError('Panier trop grand.')
  clean=[];variants={x['id']:x for x in d.rows(db,'product_variants')};products={x['id']:x for x in d.rows(db,'products')}
  for x in items:
   variant=variants.get(x.get('variantId'));product=products.get(x.get('productId'))
   if not variant or not product or variant['product_id']!=product['id'] or product['status']!='active':continue
   qty=x.get('quantity',1)
   if type(qty)!=int or not 1<=qty<=20 or x.get('size') not in ('XS','S','M','L','XL','XXL'):raise ValueError('Taille ou quantité invalide.')
   clean.append({k:x.get(k) for k in ('key','productId','variantId','size','quantity')})
  row={'id':user['id'],'user_id':user['id'],'items':clean,'updated_at':d.now()};d.save(db,'carts',row);return clean
 if action=='affiliate_apply':
  if user['role']!='client':raise PermissionError('Seuls les clients peuvent demander à rejoindre le programme.')
  if owned(db,'affiliates',user):raise ValueError('Demande déjà enregistrée.')
  if v.get('accept') is not True:raise ValueError('Accepte les conditions du programme.')
  return add(db,'affiliates',{'user_id':user['id'],'code':secrets.token_hex(5),'status':'pending','percent':config(db)['commission_percent'],'terms_accepted_at':d.now(),'terms_version':'2026-10-19'})
 if action=='withdraw':
  if user['role']!='client':raise PermissionError('Seuls les clients peuvent demander un retrait.')
  aff=next(iter(owned(db,'affiliates',user)),None)
  if not aff or aff['status']!='active':raise ValueError('Affiliation non active.')
  method=text(v.get('method'),30)
  if method not in config(db).get('withdrawal_methods',['mobile_money','bank_transfer']):raise ValueError('Mode de retrait non autorisé.')
  amount=money(v.get('amount_cents'));b=balance(db,aff)
  if amount<config(db)['withdrawal_min_cents'] or amount>b['available_cents']:raise ValueError('Solde disponible insuffisant ou seuil non atteint.')
  return add(db,'withdrawals',{'user_id':user['id'],'amount_cents':amount,'currency':'EUR','method':method,'status':'requested'})
 if action=='close_request':
  if owned(db,'closure_requests',user):raise ValueError('Une demande existe déjà.')
  return add(db,'closure_requests',{'user_id':user['id'],'reason':text(v.get('reason'),1000),'status':'requested'})
 require(user,True)
 if action=='dashboard':
  days=int(v.get('days',30));days=max(1,min(366,days));affs=d.rows(db,'affiliates')
  users=[{**d.public_user(u),'role':u['role'],'created_at':u['created_at']} for u in db.execute('SELECT * FROM users')]
  return {'stats':stats(db,days,v.get('affiliate') or None,v.get('campaign') or None),'users':users,'products':d.rows(db,'products'),'variants':d.rows(db,'product_variants'),'media':d.rows(db,'product_media'),'affiliates':[{**a,'balance':balance(db,a),'stats':stats(db,days,a['code'])} for a in affs],'campaigns':d.rows(db,'campaigns'),'discounts':d.rows(db,'discounts'),'settings':config(db),'withdrawals':d.rows(db,'withdrawals'),'closures':d.rows(db,'closure_requests'),'audit':d.rows(db,'audit_events')[-100:][::-1]}
 if action=='settings_save':
  s=config(db);percent=int(v.get('commission_percent',s['commission_percent']))
  if not 0<=percent<=100:raise ValueError('Commission entre 0 et 100 %.')
  link=text(v.get('announcement_link',s['announcement_link']),250)
  if not re.fullmatch(r'[a-z0-9-]+\.html(?:#[a-z0-9-]+)?',link):raise ValueError('Lien interne attendu.')
  methods=v.get('withdrawal_methods',s.get('withdrawal_methods',['mobile_money','bank_transfer']))
  if not isinstance(methods,list) or not methods or len(methods)>3 or any(m not in ('mobile_money','bank_transfer','paypal') for m in methods):raise ValueError('Choisis au moins un mode de retrait autorisé.')
  s.update(announcement=text(v.get('announcement',s['announcement']),200),announcement_link=link,commission_percent=percent,withdrawal_min_cents=money(v.get('withdrawal_min_cents',s['withdrawal_min_cents'])),commission_hold_days=max(0,min(365,int(v.get('commission_hold_days',s['commission_hold_days'])))),withdrawal_methods=list(dict.fromkeys(methods)))
  d.save(db,'settings',s);audit(db,user,action,'site');return s
 if action=='campaign_create':
  slug=text(v.get('slug'),60).lower()
  if not re.fullmatch(r'[a-z0-9-]{3,60}',slug):raise ValueError('Utilise lettres minuscules, chiffres et tirets.')
  if any(c['slug']==slug for c in d.rows(db,'campaigns')):raise ValueError('Identifiant déjà utilisé.')
  row=add(db,'campaigns',{'name':text(v.get('name'),100),'slug':slug,'source':text(v.get('source'),80),'url':'https://unlived.club/boutique.html?utm_source='+slug+'&utm_campaign='+slug});audit(db,user,action,row['id']);return row
 if action=='discount_create':
  code=text(v.get('code'),40).upper();percent=int(v.get('percent',0));expires=text(v.get('expires'),10)
  if not re.fullmatch('[A-Z0-9-]{3,40}',code) or not 1<=percent<=100:raise ValueError('Code ou pourcentage invalide.')
  if expires:datetime.strptime(expires,'%Y-%m-%d')
  if any(c['code']==code for c in d.rows(db,'discounts')):raise ValueError('Code déjà utilisé.')
  row=add(db,'discounts',{'code':code,'percent':percent,'expires':expires,'active':True});audit(db,user,action,row['id']);return row
 if action=='affiliate_update':
  row=next((r for r in d.rows(db,'affiliates') if r['id']==v.get('id')),None)
  if not row:raise ValueError('Affilié introuvable.')
  status=v.get('status');percent=int(v.get('percent',20))
  if status not in ('active','rejected','suspended','pending') or not 0<=percent<=100:raise ValueError('Statut invalide.')
  row.update(status=status,percent=percent);d.save(db,'affiliates',row);audit(db,user,action,row['id']);return row
 if action=='request_update':
  table=v.get('table')
  if table not in ('withdrawals','closure_requests','discounts'):raise ValueError('Action invalide.')
  row=next((r for r in d.rows(db,table) if r['id']==v.get('id')),None)
  if not row:raise ValueError('Demande introuvable.')
  if table=='discounts':row['active']=bool(v.get('active'))
  else:
   allowed=('approved','rejected') if table=='withdrawals' else ('reviewing','rejected')
   if v.get('status') not in allowed:raise ValueError('Statut invalide. Le règlement et la suppression nécessitent une opération distincte.')
   row['status']=v['status']
  d.save(db,table,row);audit(db,user,action,row['id']);return row
 raise ValueError('Action inconnue.')
def track(db,body,user,ip,ua):
 if ip in ('127.0.0.1','::1') or user and user['role']=='admin' or re.search('bot|crawler|spider',ua,re.I):return {'excluded':True}
 if body.get('consent') is not True:return {'excluded':True}
 event=body.get('event');path=text(body.get('path'),100)
 if event not in ('page_view','product_view','waitlist_success') or not re.fullmatch(r'/[a-z0-9-]*\.?[a-z]*',path):raise ValueError('Événement invalide.')
 visitor=text(body.get('visitor'),40);session=text(body.get('session'),40);uuid.UUID(visitor);uuid.UUID(session)
 # No raw IP or user account is stored; visitor pseudonyms rotate monthly.
 month=d.now()[:7];visitor=protection.lookup(month+visitor);session=protection.lookup(session)
 recent=[r for r in d.rows(db,'analytics_events') if r.get('session')==session and r.get('path')==path and r.get('event')==event and r['created_at'][:16]==d.now()[:16]]
 if recent:return {'duplicate':True}
 aff=text(body.get('affiliate'),20)
 if not any(a['code']==aff and a['status']=='active' for a in d.rows(db,'affiliates')):aff=''
 country=text(body.get('country'),2).upper();country=country if re.fullmatch('[A-Z]{2}',country) else '??'
 add(db,'analytics_events',{'event':event,'path':path,'visitor':visitor,'session':session,'country':country,'product':text(body.get('product'),60),'affiliate':aff,'campaign':text(body.get('campaign'),60)})
 cutoff=(datetime.now(timezone.utc)-timedelta(days=395)).isoformat();db.execute("DELETE FROM analytics_events WHERE json_extract(data,'$.created_at')<?",(cutoff,))
 return {'recorded':True}
