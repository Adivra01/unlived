#!/usr/bin/env python3
"""Local UNLIVED server: static assets and SQLite-backed language catalogues.
Accounts, catalogue and waitlist are stored locally in SQLite.
"""
import argparse
import os,time,hashlib
from http.cookies import SimpleCookie
from collections import defaultdict
from threading import Lock
import database
import protection
import business
import json
import sqlite3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
DB = ROOT / '.data' / 'unlived.sqlite3'
LANGUAGES = ('fr', 'en', 'es', 'it', 'ar')

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
        if cookie:self.send_header('Set-Cookie',cookie)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.end_headers()
        if not head:self.wfile.write(data)

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
            body=json.loads(self.rfile.read(length))
            if not isinstance(body,dict):raise ValueError('Requête invalide.')
            path=urlsplit(self.path).path
            cookie=SimpleCookie();cookie.load(self.headers.get('Cookie',''))
            token=cookie['unlived_session'].value if 'unlived_session' in cookie else ''
            with database.connect() as db:
                user=database.user_for(db,token)
                if path=='/api/auth' and body.get('action') in ('login','signup') or path=='/api/data' and body.get('action')=='insert' and not user:
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
                    db.execute('BEGIN IMMEDIATE')
                    data=business.handle(db,body,user) if path=='/api/business' else business.track(db,body,user,self.client_address[0],self.headers.get('User-Agent',''))
                    db.commit();self.respond_json({'data':data,'error':None});return
                if path=='/api/data':
                    data=database.query(db,body,user);db.commit();self.respond_json({'data':data,'error':None});return
                if path!='/api/auth':self.send_error(404);return
                action=body.get('action');new_cookie=None
                def make_cookie(value,age=604800):
                    return f'unlived_session={value}; HttpOnly; SameSite=Lax; Path=/; Max-Age={age}'+('; Secure' if origin.startswith('https://') else '')
                if action=='login':
                    user=database.find_user(db,str(body.get('email','')))
                    if not user or not database.password_ok(str(body.get('password','')),user['password_hash']):raise PermissionError('Identifiants incorrects.')
                    new_cookie=make_cookie(database.new_session(db,user['id']))
                elif action=='signup':
                    user=database.create_user(db,body.get('email'),body.get('password'),body.get('display_name',''))
                    new_cookie=make_cookie(database.new_session(db,user['id']))
                elif action=='logout':
                    db.execute('DELETE FROM sessions WHERE token_hash=?',(hashlib.sha256(token.encode()).hexdigest(),));user=None;new_cookie=make_cookie('',0)
                elif action=='update':
                    if not user or not database.password_ok(str(body.get('current_password','')),user['password_hash']):raise PermissionError('Mot de passe actuel incorrect.')
                    if 'email' in body:
                        email=str(body['email']).strip().lower()
                        import re
                        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email) or len(email)>254:raise ValueError('E-mail invalide.')
                        db.execute('UPDATE users SET email=?,email_lookup=? WHERE id=?',(protection.encrypt(email),protection.lookup(email),user['id']))
                    if 'password' in body:
                        password=body['password']
                        if not isinstance(password,str) or not 10<=len(password)<=256:raise ValueError('10 caractères minimum.')
                        db.execute('UPDATE users SET password_hash=? WHERE id=?',(database.password_hash(password),user['id']))
                        db.execute('DELETE FROM sessions WHERE user_id=?',(user['id'],))
                        new_cookie=make_cookie(database.new_session(db,user['id']))
                    user=db.execute('SELECT * FROM users WHERE id=?',(user['id'],)).fetchone()
                elif action!='session':raise ValueError('Action inconnue.')
                db.commit()
                public=database.public_user(user) if user else None
                self.respond_json({'data':{'user':public,'session':{'user':public} if public else None},'error':None},cookie=new_cookie)
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
    args=parser.parse_args()
    seed()
    if os.environ.get("PUBLIC_ORIGIN"):
        import runpy
        runpy.run_path(str(ROOT/"scripts"/"prepare-seo.py"))["prepare"](os.environ["PUBLIC_ORIGIN"])
    server=ThreadingHTTPServer((args.host,args.port),Handler)
    print(f'UNLIVED: http://{args.host}:{args.port}/index.html — SQLite translations ready',flush=True)
    server.serve_forever()
