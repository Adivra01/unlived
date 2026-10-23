"""One-use email challenges and encrypted, retryable transactional mail outbox."""
import os,json,time,secrets,hashlib,html,threading,re,urllib.request,urllib.error
from pathlib import Path
from urllib.parse import urlsplit,urlencode
import database as d,protection,password_policy

ROOT=Path(__file__).resolve().parent
GENERIC='Si cette adresse correspond à un compte, un e-mail contenant les prochaines étapes sera envoyé.'
def config():
    values={}
    path=ROOT/'.env'
    if path.is_file():
        for line in path.read_text().splitlines():
            line=line.strip()
            if not line or line.startswith('#') or '=' not in line:continue
            key,value=line.split('=',1);values[key.strip()]=value.strip().strip('\"\x27')
    return {key:os.environ.get(key,values.get(key,'')) for key in ('RESEND_API_KEY','RESEND_FROM','EMAIL_PUBLIC_ORIGIN')}
def public_origin():
    value=config()['EMAIL_PUBLIC_ORIGIN'] or os.environ.get('PUBLIC_ORIGIN','http://localhost:8081')
    parts=urlsplit(value)
    if parts.username or parts.password or parts.query or parts.fragment or parts.path not in ('','/') or not parts.netloc or (parts.scheme!='https' and not(parts.scheme=='http' and parts.hostname in ('localhost','127.0.0.1'))):raise ValueError('Origine des e-mails invalide.')
    return value.rstrip('/')
def limit(ip,email,action):
    if action in ('session','logout'):return
    now=time.time();email=str(email or '').strip().lower()[:254]
    policies=[('ip:'+ip,20,900)]
    if action in ('reset_request','resend_verification','signup'):policies=[('ip:'+ip,10,900),('email:'+email,3,3600)]
    elif action=='login':policies.append(('email:'+email,10,900))
    with d.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        db.execute('DELETE FROM auth_limits WHERE updated<?',(now-86400,))
        for subject,max_count,window in policies:
            key=protection.lookup('auth-limit:'+action+':'+subject)
            row=db.execute('SELECT attempts FROM auth_limits WHERE id=?',(key,)).fetchone()
            attempts=[t for t in json.loads(row['attempts']) if t>now-window] if row else []
            if len(attempts)>=max_count:raise ValueError('Trop de tentatives. Réessaie plus tard.')
            attempts.append(now);db.execute('INSERT INTO auth_limits VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET attempts=excluded.attempts,updated=excluded.updated',(key,json.dumps(attempts),now))
def queue(db,email,subject,text,action_url=None,expires=None,challenge=None):
    id=secrets.token_hex(16)
    button=('<p><a style="display:inline-block;padding:14px 22px;background:#7a2e38;color:white;text-decoration:none;border-radius:8px" href="'+html.escape(action_url,quote=True)+'">Continuer en toute sécurité</a></p>') if action_url else ''
    payload=protection.encrypt(json.dumps({'to':[email],'subject':subject,'text':text,'_expires':expires or time.time()+86400,'_challenge':challenge,'html':'<div style="font-family:Arial,sans-serif;max-width:580px;padding:28px"><h2>UNLIVED</h2><p style="white-space:pre-line;line-height:1.8">'+html.escape(text)+'</p>'+button+'</div>'},ensure_ascii=False))
    db.execute('INSERT INTO auth_outbox(id,payload,next_attempt,attempts,status) VALUES (?,?,?,0,\'pending\')',(id,payload,time.time()))
    return id
def issue(db,user,purpose,email=None):
    target=email or protection.decrypt(user['email']);token=secrets.token_urlsafe(32);now=time.time()
    latest=db.execute('SELECT created FROM auth_tokens WHERE user_id=? AND purpose=? ORDER BY created DESC LIMIT 1',(user['id'],purpose)).fetchone()
    if latest and latest['created']>now-60:return
    db.execute('DELETE FROM auth_tokens WHERE user_id=? AND purpose=?',(user['id'],purpose))
    ttl=1800 if purpose=='reset' else 86400
    db.execute('INSERT INTO auth_tokens VALUES (?,?,?,?,?,?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),user['id'],purpose,now+ttl,protection.encrypt(target),user['email_lookup'],now,None))
    link=public_origin()+'/auth.html#'+urlencode({'action':'reset' if purpose=='reset' else 'verify','token':token})
    subject='Réinitialise ton mot de passe' if purpose=='reset' else 'Confirme ton adresse e-mail'
    queue(db,target,subject,f'{subject}\n\nOuvre ce lien pour continuer :\n{link}\n\nCe lien est personnel, utilisable une seule fois et expire dans '+('30 minutes.' if purpose=='reset' else '24 heures.')+'\nSi tu n’es pas à l’origine de cette demande, ignore cet e-mail.',link,now+ttl,hashlib.sha256(token.encode()).hexdigest())
def consume(db,token,purposes,password=None):
    if not isinstance(token,str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}',token):raise ValueError('Lien invalide ou expiré. Demande un nouveau lien.')
    db.execute('DELETE FROM auth_tokens WHERE expires<?',(time.time(),))
    digest=hashlib.sha256(token.encode()).hexdigest()
    row=db.execute('SELECT * FROM auth_tokens WHERE token_hash=?',(digest,)).fetchone()
    if not row or row['purpose'] not in purposes or row['used_at'] is not None:raise ValueError('Lien invalide ou expiré. Demande un nouveau lien.')
    user=db.execute('SELECT * FROM users WHERE id=?',(row['user_id'],)).fetchone()
    if not user or user['email_lookup']!=row['original_lookup']:raise ValueError('Lien invalide ou expiré. Demande un nouveau lien.')
    if row['purpose']=='reset':
        password_policy.validate(password)
        db.execute('UPDATE users SET password_hash=? WHERE id=?',(d.password_hash(password),user['id']))
        queue(db,protection.decrypt(user['email']),'Ton mot de passe a été modifié','Ton mot de passe UNLIVED vient d’être modifié. Si tu n’es pas à l’origine de cette modification, contacte immédiatement notre équipe.')
    else:
        target=protection.decrypt(row['target'])
        existing=d.find_user(db,target)
        if existing and existing['id']!=user['id']:raise ValueError('Cette adresse ne peut pas être utilisée.')
        db.execute('UPDATE users SET email=?,email_lookup=?,email_verified=1 WHERE id=?',(protection.encrypt(target),protection.lookup(target),user['id']))
        if row['purpose']=='email_change':queue(db,protection.decrypt(user['email']),'Ton adresse e-mail a été modifiée','L’adresse e-mail de ton compte UNLIVED vient d’être modifiée. Si tu n’es pas à l’origine de cette modification, contacte notre équipe.')
    db.execute('DELETE FROM sessions WHERE user_id=?',(user['id'],))
    db.execute('DELETE FROM auth_tokens WHERE user_id=?',(user['id'],))
    return 'Mot de passe modifié. Connecte-toi avec ton nouveau mot de passe.' if row['purpose']=='reset' else 'Adresse e-mail confirmée. Tu peux maintenant te connecter.'
def send(payload,id):
    settings=config();key=settings['RESEND_API_KEY'];sender=settings['RESEND_FROM']
    if not key or not sender:return False
    req=urllib.request.Request('https://api.resend.com/emails',data=json.dumps({'from':sender,**{k:v for k,v in payload.items() if not k.startswith('_')}}).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'unlived-auth/'+id,'User-Agent':'UNLIVED/1.0'})
    with urllib.request.urlopen(req,timeout=12) as response:
        result=json.load(response)
        if not result.get('id'):raise ValueError('Réponse e-mail invalide.')
    return True
def pump():
    if not config()['RESEND_API_KEY']:return
    # Claim a job before the network call; crashed jobs can be retried safely.
    with d.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        db.execute("UPDATE auth_outbox SET status='pending' WHERE status='sending' AND next_attempt<?",(time.time()-120,))
        job=db.execute("SELECT * FROM auth_outbox WHERE status='pending' AND next_attempt<=? AND attempts<5 ORDER BY next_attempt LIMIT 1",(time.time(),)).fetchone()
        if not job:return
        db.execute("UPDATE auth_outbox SET status='sending',next_attempt=? WHERE id=?",(time.time(),job['id']))
    try:
        payload=json.loads(protection.decrypt(job['payload']))
        with d.connect() as db:valid=not payload.get('_challenge') or bool(db.execute('SELECT 1 FROM auth_tokens WHERE token_hash=? AND expires>?',(payload['_challenge'],time.time())).fetchone())
        if not valid or payload.get('_expires',0)<time.time():
            with d.connect() as db:db.execute('DELETE FROM auth_outbox WHERE id=?',(job['id'],))
            return
        sent=send(payload,job['id'])
        if not sent:raise ValueError('Configuration e-mail incomplète.')
    except Exception:
        with d.connect() as db:db.execute("UPDATE auth_outbox SET status='pending',attempts=attempts+1,next_attempt=? WHERE id=?",(time.time()+min(3600,30*2**job['attempts']),job['id']))
    else:
        with d.connect() as db:db.execute('DELETE FROM auth_outbox WHERE id=?',(job['id'],))
def start_worker():
    def run():
        while True:
            try:pump()
            except Exception:pass
            time.sleep(2)
    threading.Thread(target=run,name='unlived-mail',daemon=True).start()
