"""SQLite storage and server-side access rules for UNLIVED."""
import sqlite3,json,uuid,secrets,hashlib,hmac,time,re
import protection,password_policy
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parent
DB=ROOT/'.data'/'unlived.sqlite3'
TABLES=('products','product_variants','product_media','orders','order_items','contact_messages','customer_favorites','launch_waitlist','launch_waitlist_feedback')
def now():return datetime.now(timezone.utc).isoformat()
def connect():
    db=sqlite3.connect(DB,timeout=15);db.row_factory=sqlite3.Row;return db
def password_hash(password,salt=None):
    salt=salt or secrets.token_hex(16)
    return salt+':'+hashlib.scrypt(password.encode(),salt=bytes.fromhex(salt),n=16384,r=8,p=1).hex()
def password_ok(password,hashed):
    try:return hmac.compare_digest(password_hash(password,hashed.split(':')[0]),hashed)
    except (ValueError,TypeError):return False
def public_user(row):return {'id':row['id'],'email':protection.decrypt(row['email']),'role':row['role'],'user_metadata':{'display_name':protection.decrypt(row['display_name'])}}
def init():
    DB.parent.mkdir(mode=0o700,exist_ok=True)
    with connect() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,display_name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN (\'admin\',\'client\')),created_at TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires REAL NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY)')
        if 'email_verified' not in [r[1] for r in db.execute('PRAGMA table_info(users)')]:db.execute('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1')
        db.execute('CREATE TABLE IF NOT EXISTS auth_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,purpose TEXT NOT NULL,expires REAL NOT NULL,target TEXT NOT NULL,original_lookup TEXT NOT NULL,created REAL NOT NULL,used_at REAL)')
        db.execute('CREATE TABLE IF NOT EXISTS auth_outbox(id TEXT PRIMARY KEY,payload TEXT NOT NULL,next_attempt REAL NOT NULL,attempts INTEGER NOT NULL,status TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS auth_limits(id TEXT PRIMARY KEY,attempts TEXT NOT NULL,updated REAL NOT NULL)')
        for table in TABLES:db.execute(f'CREATE TABLE IF NOT EXISTS {table}(id TEXT PRIMARY KEY,data TEXT NOT NULL CHECK(json_valid(data)))')
        for table,name,cols in [('products','product_slug',"json_extract(data,'$.slug')"),('customer_favorites','favorite_owner',"json_extract(data,'$.user_id'),json_extract(data,'$.product_id')"),('launch_waitlist','waitlist_email_concept',"lower(json_extract(data,'$.email')),json_extract(data,'$.concept_slug')"),('launch_waitlist','waitlist_token',"json_extract(data,'$.feedback_token')"),('launch_waitlist_feedback','feedback_token',"json_extract(data,'$.feedback_token')")]:
            db.execute(f'CREATE UNIQUE INDEX IF NOT EXISTS {name} ON {table}({cols})')
        if not db.execute("SELECT 1 FROM migrations WHERE name='catalog-import-v1'").fetchone():
            catalog=json.loads((ROOT/'data'/'catalog.json').read_text())
            for table,seed_rows in catalog.items():
                if table in ('products','product_variants','product_media'):
                    for row in seed_rows:save(db,table,row)
            db.execute("INSERT INTO migrations VALUES ('catalog-import-v1')")
        if 'email_lookup' not in [r[1] for r in db.execute('PRAGMA table_info(users)')]:db.execute('ALTER TABLE users ADD COLUMN email_lookup TEXT')
        for u in db.execute('SELECT * FROM users').fetchall():
            db.execute('UPDATE users SET email=?,display_name=?,email_lookup=? WHERE id=?',(protection.encrypt(u['email']),protection.encrypt(u['display_name']),protection.lookup(protection.decrypt(u['email'])),u['id']))
        db.execute('CREATE UNIQUE INDEX IF NOT EXISTS user_email_lookup ON users(email_lookup)')
        db.execute('DROP INDEX IF EXISTS waitlist_email_concept')
        for table in TABLES:
            for row in rows(db,table):save(db,table,row)
    DB.chmod(0o600)
def save(db,table,row):
    db.execute(f'INSERT INTO {table}(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',(row['id'],json.dumps(protection.encode(row),ensure_ascii=False)))
def rows(db,table):return [protection.decode(json.loads(r['data'])) for r in db.execute(f'SELECT data FROM {table}')]
def user_for(db,token):
    if not token:return None
    return db.execute('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>? AND u.email_verified=1',(hashlib.sha256(token.encode()).hexdigest(),time.time())).fetchone()
def new_session(db,user_id):
    token=secrets.token_urlsafe(32)
    db.execute('DELETE FROM sessions WHERE expires<?',(time.time(),))
    db.execute('INSERT INTO sessions VALUES (?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),user_id,time.time()+604800));return token
def create_user(db,email,password,name,role='client'):
    if not isinstance(email,str) or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email) or len(email)>254:raise ValueError('Adresse e-mail invalide.')
    password_policy.validate(password)
    uid=str(uuid.uuid4());db.execute('INSERT INTO users(id,email,password_hash,display_name,role,created_at,email_lookup) VALUES (?,?,?,?,?,?,?)',(uid,protection.encrypt(email.strip().lower()),password_hash(password),protection.encrypt(str(name)[:100]),role,now(),protection.lookup(email)));return db.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()

def query(db,body,user):
    table=body.get('table');action=body.get('action','select');admin=user and user['role']=='admin'
    if table=='admin_users':
        return [{'user_id':user['id']}] if admin else []
    if table not in TABLES or action not in ('select','insert','upsert','update','delete'):raise PermissionError('Accès interdit.')
    all_rows=rows(db,table)
    public_tables=('products','product_variants','product_media')
    active={p['id'] for p in rows(db,'products') if p.get('status')=='active'}
    if action=='select':
        if table in public_tables and not admin:
            all_rows=[r for r in all_rows if (r['id'] if table=='products' else r.get('product_id')) in active]
            if table=='product_variants':all_rows=[r for r in all_rows if r.get('is_available')]
        elif table=='customer_favorites' and user:all_rows=[r for r in all_rows if r.get('user_id')==user['id']]
        elif table=='orders' and user and not admin:all_rows=[r for r in all_rows if r.get('customer_id')==user['id']]
        elif table=='order_items' and user and not admin:
            own={r['id'] for r in rows(db,'orders') if r.get('customer_id')==user['id']};all_rows=[r for r in all_rows if r.get('order_id') in own]
        elif table not in public_tables and not admin:raise PermissionError('Connexion administrateur requise.')
    elif table=='customer_favorites':
        if not user:raise PermissionError('Connexion requise.')
        all_rows=[r for r in all_rows if r.get('user_id')==user['id']]
    elif table in ('launch_waitlist','launch_waitlist_feedback','contact_messages') and action=='insert':pass
    elif not admin:raise PermissionError('Connexion administrateur requise.')
    filters=body.get('filters',[])
    if not isinstance(filters,list) or len(filters)>20:raise ValueError('Filtres invalides.')
    def matches(row):
        for f in filters:
            if f.get('op')=='eq' and row.get(f.get('key'))!=f.get('value'):return False
            if f.get('op')=='in' and row.get(f.get('key')) not in f.get('value',[]):return False
        return True
    selected=[r for r in all_rows if matches(r)]
    if action in ('insert','upsert','update'):
        incoming=body.get('values',{})
        incoming=incoming if isinstance(incoming,list) else [incoming]
        if len(incoming)>100:raise ValueError('Trop de lignes.')
        result=[]
        for values in incoming:
            if not isinstance(values,dict):raise ValueError('Données invalides.')
            if table=='orders':
                if any(k in values for k in ('payment_verified','payment_status','paid_at','commission_cents','commission_percent','total_cents','affiliate_code')):raise PermissionError('La confirmation des paiements nécessite le prestataire de paiement.')
                if values.get('status') in ('processing','shipped','delivered') and any(r.get('payment_verified') is not True for r in selected):raise ValueError('Le paiement doit être confirmé avant la production.')
            if action=='update':
                if not filters:raise ValueError('Identifiant requis.')
                candidates=[{**row,**{k:v for k,v in values.items() if k not in ('id','created_at')}} for row in selected]
            else:candidates=[{**values,'id':str(uuid.uuid4()),'created_at':now()}]
            for row in candidates:
                if table=='orders' and action in ('insert','upsert'):
                    import business
                    customer=db.execute('SELECT * FROM users WHERE id=?',(row.get('customer_id'),)).fetchone()
                    ref,_=business.attribution(db,customer) if customer else (None,None)
                    affiliate=next((a for a in rows(db,'affiliates') if ref and a['code']==ref['code']),None)
                    row['affiliate_code']=affiliate['code'] if affiliate else None
                    row['commission_percent']=affiliate['percent'] if affiliate else 0
                if table=='customer_favorites':
                    if row.get('product_id') not in active:raise ValueError('Produit indisponible.')
                    row={k:row[k] for k in ('id','created_at','product_id')};row['user_id']=user['id']
                    prior=next((r for r in all_rows if r.get('product_id')==row['product_id']),None)
                    if prior and action=='upsert':result.append(prior);continue
                if table=='launch_waitlist':
                    allowed={'id','created_at','first_name','last_name','email','phone','concept_slug','selected_size','feedback_token','utm_source','utm_campaign','utm_content','consent'}
                    row={k:v for k,v in row.items() if k in allowed}
                    for key,limit in [('first_name',80),('last_name',100)]:
                        if not isinstance(row.get(key),str) or not 1<=len(row[key].strip())<=limit:raise ValueError('Nom invalide.')
                    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',str(row.get('email',''))) or len(row['email'])>254:raise ValueError('E-mail invalide.')
                    row['email']=row['email'].strip().lower()
                    if any(r.get('email')==row['email'] and r.get('concept_slug')==row.get('concept_slug') and r['id']!=row['id'] for r in all_rows):raise sqlite3.IntegrityError('duplicate signup')
                    if row.get('consent') is not True:raise ValueError('Consentement requis.')
                    row.pop('consent');row['consent_at']=now()
                    if row.get('concept_slug') not in ('day-one-blanc','day-one-noir','day-one-rouge') or row.get('selected_size') not in ('XS','S','M','L','XL','XXL'):raise ValueError('Sélection invalide.')
                    uuid.UUID(row.get('feedback_token',''))
                    if row.get('phone') and len(str(row['phone']))>40:raise ValueError('Téléphone trop long.')
                    if any(len(str(row.get(k) or ''))>160 for k in ('utm_source','utm_campaign','utm_content')):raise ValueError('Campagne invalide.')
                if table=='launch_waitlist_feedback':
                    row={k:v for k,v in row.items() if k in ('id','created_at','feedback_token','interest_level','what_appealed','what_to_improve')}
                    if not any(r.get('feedback_token')==row.get('feedback_token') for r in rows(db,'launch_waitlist')):raise ValueError('Inscription introuvable.')
                    if type(row.get('interest_level'))!=int or not 1<=row['interest_level']<=5:raise ValueError('Note invalide.')
                    for k in ('what_appealed','what_to_improve'):
                        if not isinstance(row.get(k),str) or not 5<=len(row[k].strip())<=2000:raise ValueError('Réponse invalide.')
                if table=='contact_messages' and not admin:
                    row={k:v for k,v in row.items() if k in ('id','created_at','name','email','message')};row['status']='new'
                    if not all(isinstance(row.get(k),str) and 1<=len(row[k])<=5000 for k in ('name','email','message')):raise ValueError('Message invalide.')
                if table=='products':
                    if not row.get('title') or row.get('status') not in ('active','draft','archived'):raise ValueError('Produit invalide.')
                    if row.get('price_cents') is not None and (type(row['price_cents'])!=int or row['price_cents']<0):raise ValueError('Prix invalide.')
                    if row.get('planned_price_cents') is not None and (type(row['planned_price_cents'])!=int or row['planned_price_cents']<0):raise ValueError('Prix prévu invalide.')
                    row.setdefault('featured',False)
                if table=='product_variants':
                    if not any(r['id']==row.get('product_id') for r in rows(db,'products')):raise ValueError('Produit introuvable.')
                    if row.get('stock_quantity') is not None and (type(row['stock_quantity'])!=int or row['stock_quantity']<0):raise ValueError('Stock invalide.')
                    if row.get('stock_status') not in ('in_stock','out_of_stock','unknown'):raise ValueError('Disponibilité invalide.')
                    if row.get('stock_quantity')==0 and row.get('stock_status')=='in_stock':raise ValueError('Pour rendre cette variante disponible, augmente le stock ou laisse la quantité vide.')
                if table=='product_media':
                    url=str(row.get('url',''))
                    if not (url.startswith('assets/') or url.startswith('https://')):raise ValueError('URL de média invalide.')
                row['updated_at']=now();save(db,table,row);result.append(row)
        return result if admin or table=='customer_favorites' else []
    if action=='delete':
        if not filters:raise ValueError('Identifiant requis.')
        for row in selected:db.execute(f'DELETE FROM {table} WHERE id=?',(row['id'],))
        return []
    for order in reversed(body.get('orders',[])):
        selected.sort(key=lambda r:(r.get(order['key']) is None,r.get(order['key']) or ''),reverse=not order.get('ascending',True))
    offset=max(0,int(body.get('offset',0)));limit=min(1000,max(1,int(body.get('limit',1000))))
    selected=selected[offset:offset+limit]
    def product_join(p):
        return {**{k:v for k,v in p.items() if admin or k!='planned_price_cents'},'product_variants':[v for v in rows(db,'product_variants') if v.get('product_id')==p['id'] and (admin or v.get('is_available'))],'product_media':[m for m in rows(db,'product_media') if m.get('product_id')==p['id']]}
    if table=='products':selected=[product_join(p) for p in selected]
    if table=='customer_favorites':
        products={p['id']:product_join(p) for p in rows(db,'products') if admin or p['id'] in active}
        selected=[{**r,'products':products.get(r['product_id'])} for r in selected]
    if table=='orders':selected=[{**r,'order_items':[i for i in rows(db,'order_items') if i.get('order_id')==r['id']]} for r in selected]
    if not admin and table=='products':
        selected=[{k:v for k,v in row.items() if k!='planned_price_cents'} for row in selected]
    return selected

def find_user(db,email):return db.execute("SELECT * FROM users WHERE email_lookup=?",(protection.lookup(email),)).fetchone()
