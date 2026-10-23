"""Read-only checks of browser policies and packaged executable scripts."""
from pathlib import Path
from urllib.parse import urlsplit
import re,base64,hashlib,sys
ROOT=Path(__file__).resolve().parent.parent
config=(ROOT/'.htaccess').read_text();issues=[]
for policy in ["script-src 'self'", "script-src-attr 'none'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'",'Strict-Transport-Security','Permissions-Policy']:
 if policy not in config:issues.append('Directive absente : '+policy)
for path in list(ROOT.glob('*.html'))+[ROOT/'waitlist-admin.php']:
 text=path.read_text()
 for attrs,body in re.findall(r'<script\b([^>]*)>(.*?)</script>',text,re.S|re.I):
  src=re.search(r'\bsrc=["\']([^"\']+)',attrs)
  if src:
   url=urlsplit(src[1])
   if url.scheme or url.netloc:issues.append(path.name+': script tiers '+src[1])
   elif not (ROOT/url.path.lstrip('/')).is_file():issues.append(path.name+': script introuvable '+url.path)
  elif 'application/ld+json' not in attrs and 'application/json' not in attrs:
   digest=base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()
   if "'sha256-"+digest+"'" not in config:issues.append(path.name+': script inline sans empreinte CSP')
 for attrs in re.findall(r'<[A-Za-z][^>]*>',text):
  if re.search(r'\son[a-z]+\s*=',attrs,re.I):issues.append(path.name+': gestionnaire inline incompatible CSP')
expected={'gsap.min.js':'96c01b81f44a3290e2b4532f55e2c9534b2adc43273a19f3756b2cb41f0fd0b6','ScrollTrigger.min.js':'308219390e5e3b84cda0c481e70caa9820883ae10bda44e6e9a149a81aac4b3f'}
for name,digest in expected.items():
 p=ROOT/'assets'/'vendor'/name
 if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=digest:issues.append('Bibliothèque GSAP inattendue : '+name)
for issue in issues:print(issue)
print(f'{len(issues)} erreur(s) de configuration : CSP, scripts, empreintes GSAP et en-têtes contrôlés.')
sys.exit(bool(issues))
