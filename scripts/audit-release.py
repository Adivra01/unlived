"""Read-only checks of assets, metadata, indexing and deployment readiness."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
from xml.etree import ElementTree as ET
import json,re,sys
ROOT=Path(__file__).resolve().parent.parent
issues=[]
class Scan(HTMLParser):
 def __init__(self):super().__init__();self.canonicals=[];self.description=[];self.robots=''
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='link' and a.get('rel')=='canonical':self.canonicals.append(a.get('href',''))
  if tag=='meta' and a.get('name')=='description':self.description.append(a.get('content',''))
  if tag=='meta' and a.get('name')=='robots':self.robots=a.get('content','')
  for key in ('href','src','poster'):
   value=a.get(key,'');u=urlsplit(value)
   if value and not u.scheme and u.path and not (ROOT/unquote(u.path).lstrip('/')).exists():issues.append(f'{self.file}: fichier manquant {value}')
scans={};titles={}
for path in ROOT.glob('*.html'):
 content=path.read_text();scan=Scan();scan.file=path.name;scan.feed(content);scans[path.name]=scan
 title=re.findall(r'<title>(.*?)</title>',content,re.S)
 if len(title)!=1 or not title[0].strip():issues.append(f'{path.name}: title absent ou multiple')
 else:titles[path.name]=title[0]
 if 'noindex' not in scan.robots and (len(scan.description)!=1 or not scan.description[0].strip()):issues.append(f'{path.name}: description absente ou multiple')
 for block in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',content,re.S):
  try:json.loads(block)
  except ValueError:issues.append(f'{path.name}: JSON-LD invalide')
 if path.name in ('admin.html','compte.html','waitlist.html','produit.html','auth.html') and 'noindex' not in scan.robots:issues.append(f'{path.name}: noindex absent')
public=[]
try:
 for url in ET.parse(ROOT/'sitemap.xml').getroot().findall('{*}url/{*}loc'):
  u=urlsplit(url.text);name=u.path.lstrip('/') or 'index.html';public.append(name)
  if u.scheme!='https' or u.netloc!='unlived.club':issues.append(f'Sitemap : origine incorrecte {url.text}')
  if name not in scans:issues.append(f'Sitemap : page manquante {name}');continue
  scan=scans[name]
  if scan.canonicals!=[url.text]:issues.append(f'{name}: canonique incohérente avec le sitemap')
  if 'noindex' in scan.robots:issues.append(f'{name}: page noindex présente au sitemap')
 if len(public)!=len(set(public)):issues.append('Sitemap : doublons')
except (OSError,ET.ParseError) as e:issues.append(f'Sitemap invalide : {e}')
for name in public:
 if sum(titles.get(other)==titles.get(name) for other in public)>1:issues.append(f'{name}: titre identique à une autre page publique')
for issue in issues:print(issue)
print(f'{len(issues)} erreur(s) ; {len(scans)} pages HTML et {len(public)} URL publiques contrôlées.')
print('Contrôles : fichiers liés, titres/descriptions, JSON-LD, canoniques, sitemap et noindex des espaces privés.')
legal=re.sub('<[^>]+>',' ',(ROOT/'mentions-legales.html').read_text())
if 'Informations en cours de finalisation' in legal:print('Reste à renseigner : identité légale, adresse professionnelle, immatriculation applicable et hébergeur dans mentions-legales.html.')
print('Sur Hostinger après déploiement : vérifier la connexion, les autorisations, les e-mails Resend et la tâche cron.')
sys.exit(bool(issues))
