"""Read-only release checks: python3 scripts/audit-release.py"""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import json,re,sys
ROOT=Path(__file__).resolve().parent.parent
issues=[]
class Scan(HTMLParser):
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  for key in ('href','src','poster'):
   value=a.get(key,'');u=urlsplit(value)
   if value and not u.scheme and u.path and not (ROOT/unquote(u.path).lstrip('/')).exists():issues.append(f'{self.file}: fichier manquant {value}')
for path in ROOT.glob('*.html'):
 content=path.read_text();scan=Scan();scan.file=path.name;scan.feed(content)
 for block in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',content,re.S):
  try:json.loads(block)
  except ValueError:issues.append(f'{path.name}: JSON-LD invalide')
 if path.name in ('admin.html','compte.html','waitlist.html','produit.html') and 'noindex' not in content:issues.append(f'{path.name}: noindex absent')
for issue in issues:print(issue)
print(f'{len(issues)} erreur(s) de structure détectée(s).')
if not (ROOT/'sitemap.xml').exists():print('À CONFIGURER : domaine public et sitemap via scripts/prepare-seo.py.')
print('À COMPLÉTER : identité légale, hébergeur, contact professionnel. E-mails automatiques désactivés.')
sys.exit(bool(issues))
