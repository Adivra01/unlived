"""Authenticated encryption for personal fields; key stored outside SQLite."""
import os,hashlib,hmac
from pathlib import Path
from cryptography.fernet import Fernet
ROOT=Path(__file__).resolve().parent
keypath=ROOT/'.data'/'encryption.key'
def key():
 env=os.environ.get('UNLIVED_ENCRYPTION_KEY')
 if env:return env.encode()
 if not keypath.exists():
  keypath.parent.mkdir(mode=0o700,exist_ok=True)
  fd=os.open(keypath,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
  with os.fdopen(fd,'wb') as f:f.write(Fernet.generate_key())
 return keypath.read_bytes().strip()
def encrypt(value):
 if value is None or str(value).startswith('enc:v1:'):return value
 return 'enc:v1:'+Fernet(key()).encrypt(str(value).encode()).decode()
def decrypt(value):
 if not isinstance(value,str) or not value.startswith('enc:v1:'):return value
 return Fernet(key()).decrypt(value[7:].encode()).decode()
def lookup(value):return hmac.new(key(),str(value).strip().lower().encode(),hashlib.sha256).hexdigest()
FIELDS={'first_name','last_name','email','phone','customer_name','customer_email','name','message','what_appealed','what_to_improve','reason','address','display_name'}
def encode(row):return {k:encrypt(v) if k in FIELDS else v for k,v in row.items()}
def decode(row):return {k:decrypt(v) if k in FIELDS else v for k,v in row.items()}
