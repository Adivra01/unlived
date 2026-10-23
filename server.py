#!/usr/bin/env python3
"""Local UNLIVED server: static assets and SQLite-backed language catalogues.
Development forwards all data requests to the shared HTTPS API by default.
"""
import argparse
import os,time,hashlib
from http.cookies import SimpleCookie
from collections import defaultdict
from threading import Lock
import database
import protection
import business
import auth_service,password_policy
import json
import sqlite3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import ipaddress
import shared_api

def client_ip(peer,headers):
    trusted=[ipaddress.ip_network(value.strip()) for value in os.environ.get('TRUSTED_PROXIES','').split(',') if value.strip()]
    def is_trusted(value):return any(ipaddress.ip_address(value) in network for network in trusted)
    if not is_trusted(peer):return peer
    chain=[value.strip() for value in headers.get('X-Forwarded-For','').split(',') if value.strip()]+[peer]
    try:
        for value in reversed(chain):
            ipaddress.ip_address(value)
            if not is_trusted(value):return value
    except ValueError:return peer
    return peer

ROOT = Path(__file__).resolve().parent
DB = ROOT / '.data' / 'unlived.sqlite3'
LANGUAGES = ('fr', 'en', 'es', 'it', 'ar')
DUMMY_PASSWORD_HASH=database.password_hash('dummy-password-never-used-8!')

def seed():
    database.init()
    business.init()
    DB.parent.mkdir(exist_ok=True, mode=0o700)
    with sqlite3.connect(DB) as db:
        db.execute('CREATE TABLE IF NOT EXISTS translations (language TEXT NOT NULL, source TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(language,source))')
        for language in LANGUAGES:
            content = json.loads((ROOT / 'locales' / f'{language}.json').read_text())
            db.execute('DELETE FROM translations WHERE language=?', (language,))
            db.executemany('INSERT INTO translations VALUES (?,?,?)', ((language,k,v) for k,v in content.items()))
    DB.chmod(0o600)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def respond_json(self, content, head=False, status=200, cookie=None):
        data=json.dumps(content,ensure_ascii=False).encode()
        self.send_response(status)
        if cookie:
            for value in cookie if isinstance(cookie,list) else [cookie]:self.send_header('Set-Cookie',value)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.end_headers()
        if not head:self.wfile.write(data)

    def end_headers(self):
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('X-Frame-Options','DENY')
        self.send_header('X-Content-Type-Options','nosniff')
        if urlsplit(self.path).path=='/auth.html':
            self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        if os.environ.get('PUBLIC_ORIGIN','').startswith('https://'):self.send_header('Strict-Transport-Security','max-age=31536000')
        super().end_headers()

    limits=defaultdict(list)
    limit_lock=Lock()
    def do_POST(self):
        try:
            host=self.headers.get('Host','')
            allowed={f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
            origin=os.environ.get('PUBLIC_ORIGIN','').rstrip('/')
            if origin:allowed.add(urlsplit(origin).netloc)
            if host not in allowed or self.headers.get('X-UNLIVED-Request')!='1':raise PermissionError('Origine interdite.')
            incoming=self.headers.get('Origin')
            if incoming and incoming not in {f'http://{host}',origin}:raise PermissionError('Origine interdite.')
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=65536:raise ValueError('Requête trop grande.')
            raw_body=self.rfile.read(length)
            upstream=getattr(self.server,'shared_api_origin',None)
            if upstream:
                path=urlsplit(self.path).path
                if path not in shared_api.PATHS:raise ValueError('Route API inconnue.')
                try:
                    status,content_type,content,cookies=shared_api.forward(upstream,path,raw_body,self.headers.get('Cookie',''))
                except Exception:
                    self.respond_json({'data':None,'error':{'message':'Le serveur partagé est indisponible. Aucune donnée enregistrée localement.'}},status=502);return
                if 'application/json' not in content_type:
                    self.respond_json({'data':None,'error':{'message':'Cette fonction API n’est pas disponible sur le serveur partagé.'}},status=502);return
                self.send_response(status)
                self.send_header('Content-Type',content_type)
                self.send_header('Content-Length',str(len(content)))
                self.send_header('Cache-Control','no-store')
                for cookie in cookies:self.send_header('Set-Cookie',cookie)
                self.end_headers();self.wfile.write(content);return
            body=json.loads(raw_body)
            if not isinstance(body,dict):raise ValueError('Requête invalide.')
            path=urlsplit(self.path).path
            if path=='/waitlist-api.php':
                action=body.pop('action',None)
                if action not in ('signup','feedback'):raise ValueError('Action inconnue.')
                if action=='signup':
                    import uuid
                    body['feedback_token']=str(uuid.uuid4())
                table='launch_waitlist' if action=='signup' else 'launch_waitlist_feedback'
                with database.connect() as db:
                    database.query(db,{'table':table,'action':'insert','values':body},None)
                self.respond_json({'ok':True,'feedback_token':body.get('feedback_token')});return
            cookie=SimpleCookie();cookie.load(self.headers.get('Cookie',''))
            token=cookie['unlived_session'].value if 'unlived_session' in cookie else ''
            ip=client_ip(self.client_address[0],self.headers)
            ref_token=cookie['unlived_affiliate'].value if 'unlived_affiliate' in cookie else ''
            response_cookies=[]
            def persistent_cookie(name,value,age):return f'{name}={value}; HttpOnly; SameSite=Lax; Path=/; Max-Age={age}'+('; Secure' if origin.startswith('https://') else '')
            if path=='/api/auth':auth_service.limit(ip,body.get('email'),str(body.get('action','')))
            with database.connect() as db:
                user=database.user_for(db,token)
                if user:business.attribution(db,user,ref_token)
                if path=='/api/data' and body.get('action')=='insert' and not user:
                    bucket=(self.client_address[0],path)
                    with self.limit_lock:
                        recent=[t for t in self.limits[bucket] if t>time.time()-300]
                        if len(recent)>=25:raise ValueError('Trop de tentatives. Réessaie dans quelques minutes.')
                        recent.append(time.time());self.limits[bucket]=recent
                if path in ('/api/business','/api/track'):
                    with self.limit_lock:
                        bucket=(self.client_address[0],path)
                        recent=[t for t in self.limits[bucket] if t>time.time()-60]
                        if len(recent)>=180:raise ValueError('Trop de requêtes. Réessaie dans une minute.')
                        recent.append(time.time());self.limits[bucket]=recent
                    if not db.in_transaction:db.execute('BEGIN IMMEDIATE')
                    if path=='/api/track':
                        if cookie.get('unlived_analytics_exclude') and cookie['unlived_analytics_exclude'].value=='1':self.respond_json({'data':{'excluded':True},'error':None});return
                        previous,_=business.attribution(db,user,ref_token)
                        active_codes={a['code'] for a in database.rows(db,'affiliates') if a['status']=='active'}
                        if body.get('affiliate') not in active_codes and previous:body['affiliate']=previous['code']
                        data=business.track(db,body,user,ip,self.headers.get('User-Agent',''))
                        if data.get('recorded') or data.get('duplicate'):
                            ref,new_token=business.attribution(db,user,ref_token,body.get('affiliate'))
                            if new_token:response_cookies.append(persistent_cookie('unlived_affiliate',new_token,30*86400))
                    elif body.get('action')=='exclude_tracking':
                        business.require(user,True);business.exclude_ip(db,ip);response_cookies.append(persistent_cookie('unlived_analytics_exclude','1',365*86400));data={'excluded':True}
                    else:data=business.handle(db,body,user)
                    db.commit();self.respond_json({'data':data,'error':None},cookie=response_cookies);return
                if path=='/api/data':
                    data=database.query(db,body,user);db.commit();self.respond_json({'data':data,'error':None});return
                if path!='/api/auth':self.send_error(404);return
                action=body.get('action');new_cookie=None
                def make_cookie(value,age=604800):
                    return f'unlived_session={value}; HttpOnly; SameSite=Lax; Path=/; Max-Age={age}'+('; Secure' if origin.startswith('https://') else '')
                auth_message=None
                if not db.in_transaction:db.execute('BEGIN IMMEDIATE')
                user=database.user_for(db,token)
                if action=='login':
                    user=database.find_user(db,str(body.get('email','')))
                    # Compute a password hash even when the account does not exist.
                    valid=database.password_ok(str(body.get('password','')),user['password_hash'] if user else DUMMY_PASSWORD_HASH)
                    if not user or not valid:raise PermissionError('Identifiants incorrects.')
                    if not user['email_verified']:raise PermissionError('Confirme ton adresse e-mail avant de te connecter. Tu peux demander un nouveau lien.')
                    new_cookie=make_cookie(database.new_session(db,user['id']))
                elif action=='signup':
                    password_policy.validate(body.get('password'))
                    email=body.get('email')
                    if not isinstance(email,str) or len(email)>254 or not __import__('re').fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email):raise ValueError('Adresse e-mail invalide.')
                    existing=database.find_user(db,email)
                    if not existing:
                        created=database.create_user(db,email,body['password'],body.get('display_name',''))
                        db.execute('UPDATE users SET email_verified=0 WHERE id=?',(created['id'],))
                        auth_service.issue(db,created,'verify')
                    elif not existing['email_verified']:auth_service.issue(db,existing,'verify')
                    user=None;auth_message=auth_service.GENERIC
                elif action in ('reset_request','resend_verification'):
                    existing=database.find_user(db,str(body.get('email','')))
                    if existing and (action=='reset_request' or not existing['email_verified']):auth_service.issue(db,existing,'reset' if action=='reset_request' else 'verify')
                    user=None;auth_message=auth_service.GENERIC
                elif action in ('verify_email','reset_password'):
                    auth_message=auth_service.consume(db,body.get('token'),('reset',) if action=='reset_password' else ('verify','email_change'),body.get('password'))
                    user=None;new_cookie=make_cookie('',0)
                elif action=='logout':
                    db.execute('DELETE FROM sessions WHERE token_hash=?',(hashlib.sha256(token.encode()).hexdigest(),));user=None;new_cookie=make_cookie('',0)
                elif action=='update':
                    if not user or not database.password_ok(str(body.get('current_password','')),user['password_hash']):raise PermissionError('Mot de passe actuel incorrect.')
                    if 'email' in body and 'password' in body:raise ValueError('Modifie ton adresse et ton mot de passe séparément.')
                    if 'email' in body:
                        email=str(body['email']).strip().lower()
                        import re
                        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email) or len(email)>254:raise ValueError('E-mail invalide.')
                        if email!=protection.decrypt(user['email']):
                            other=database.find_user(db,email)
                            if other and other['id']!=user['id']:raise ValueError('Cette adresse ne peut pas être utilisée.')
                            auth_service.issue(db,user,'email_change',email)
                            auth_message='Un lien de vérification sera envoyé à la nouvelle adresse. Ton adresse actuelle reste active jusqu’à confirmation.'
                    if 'password' in body:
                        password=password_policy.validate(body['password'])
                        db.execute('UPDATE users SET password_hash=? WHERE id=?',(database.password_hash(password),user['id']))
                        db.execute('DELETE FROM sessions WHERE user_id=?',(user['id'],))
                        db.execute('DELETE FROM auth_tokens WHERE user_id=?',(user['id'],))
                        new_cookie=make_cookie(database.new_session(db,user['id']))
                        auth_service.queue(db,protection.decrypt(user['email']),'Ton mot de passe a été modifié','Ton mot de passe UNLIVED a été modifié. Si tu n’es pas à l’origine de cette modification, contacte notre équipe.')
                    user=db.execute('SELECT * FROM users WHERE id=?',(user['id'],)).fetchone()
                elif action!='session':raise ValueError('Action inconnue.')
                db.commit()
                if user and user['role']=='admin':
                    business.exclude_ip(db,ip);db.commit();response_cookies.append(persistent_cookie('unlived_analytics_exclude','1',365*86400))
                if user:business.attribution(db,user,ref_token);db.commit()
                public=database.public_user(user) if user else None
                if new_cookie:response_cookies.insert(0,new_cookie)
                self.respond_json({'data':{'user':public,'session':{'user':public} if public else None,'message':auth_message},'error':None},cookie=response_cookies)
        except sqlite3.IntegrityError:
            self.respond_json({'data':None,'error':{'code':'23505','message':'Cette entrée existe déjà.'}},status=409)
        except PermissionError as error:
            self.respond_json({'data':None,'error':{'message':str(error)}},status=403)
        except (ValueError,KeyError,TypeError) as error:
            self.respond_json({'data':None,'error':{'message':'Données invalides. '+str(error)[:120]}},status=400)
        except Exception:
            self.respond_json({'data':None,'error':{'message':'Le serveur ne peut pas traiter la demande.'}},status=500)

    def route(self, head=False):
        route=unquote(urlsplit(self.path).path)
        if route.startswith('/api/translations/'):
            language=route.rsplit('/',1)[-1]
            if language not in LANGUAGES:self.send_error(404);return
            if getattr(self.server,'shared_api_origin',None):
                self.respond_json(json.loads((ROOT/'locales'/f'{language}.json').read_text()),head);return
            with sqlite3.connect(f'file:{DB}?mode=ro', uri=True) as db:
                rows=db.execute('SELECT source,value FROM translations WHERE language=?',(language,)).fetchall()
            self.respond_json(dict(rows),head);return
        relative=Path(route.lstrip('/') or 'index.html')
        target=(ROOT / relative).resolve()
        # Do not expose credentials, databases, source tooling, or directory listings.
        if not target.is_relative_to(ROOT) or any(p.startswith('.') for p in relative.parts):self.send_error(404);return
        public_root = len(relative.parts)==1 and relative.suffix in ('.html','.css','.js','.txt','.ico','.svg','.xml') and relative.name not in ('server.py',)
        public_asset = relative.parts[0]=='assets' and relative.suffix.lower() in ('.png','.jpg','.jpeg','.webp','.svg','.gif','.mp4','.webm','.mp3','.m4a','.wav','.woff','.woff2','.ico')
        public_locale = len(relative.parts)==2 and relative.parts[0]=='locales' and relative.name in [f'{l}.json' for l in LANGUAGES]
        if not (public_root or public_asset or public_locale) or not target.is_file():self.send_error(404);return
        if route=='/':self.path='/index.html'
        if head:super().do_HEAD()
        else:super().do_GET()

    def do_GET(self):self.route()
    def do_HEAD(self):self.route(True)
    def list_directory(self,path):self.send_error(404);return None
    def log_message(self,format,*args):pass # No visitor IPs or personal query strings in access logs.

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=int(os.environ.get('PORT','8081')))
    parser.add_argument('--host',default=os.environ.get('HOST','127.0.0.1'))
    parser.add_argument('--upstream',default=os.environ.get('UNLIVED_API_ORIGIN','https://unlived.club'))
    parser.add_argument('--standalone',action='store_true',help='Serveur de données autonome (VPS uniquement)')
    args=parser.parse_args()
    upstream=None if args.standalone else shared_api.validate_origin(args.upstream)
    if upstream and args.host not in ('localhost','127.0.0.1','::1'):
        parser.error('Le proxy de développement doit rester lié à localhost.')
    if not upstream:
        seed()
        auth_service.start_worker()
    if os.environ.get("PUBLIC_ORIGIN"):
        import runpy
        runpy.run_path(str(ROOT/"scripts"/"prepare-seo.py"))["prepare"](os.environ["PUBLIC_ORIGIN"])
    server=ThreadingHTTPServer((args.host,args.port),Handler)
    server.shared_api_origin=upstream
    print(f'UNLIVED: http://{args.host}:{args.port}/index.html — données : {upstream or "serveur autonome"}',flush=True)
    server.serve_forever()
