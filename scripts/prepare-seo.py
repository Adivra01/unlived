"""Build canonical metadata, breadcrumbs and sitemap for the actual HTTPS domain.
Usage: python3 scripts/prepare-seo.py https://your-real-domain.tld
"""
import argparse,html,json,re
from pathlib import Path
from urllib.parse import urlsplit,urljoin
ROOT=Path(__file__).resolve().parent.parent
PUBLIC_PAGES={'index.html':'Accueil','histoire.html':'Notre histoire','boutique.html':'La boutique','day-one-blanc.html':'DAY ONE — Blanc','day-one-noir.html':'DAY ONE — Noir','day-one-rouge.html':'LE DÉCLIC — Rouge','contact.html':'Contact','livraison.html':'Livraison','retours.html':'Retours et remboursements','confidentialite.html':'Confidentialité','conditions.html':'Conditions d’utilisation','mentions-legales.html':'Mentions légales'}
def prepare(origin):
 p=urlsplit(origin)
 if p.scheme!='https' or not p.hostname or p.username or p.password or p.query or p.fragment or p.path not in ('','/') or p.hostname in ('localhost','127.0.0.1','example.com','your-real-domain.tld') or p.hostname.endswith(('.test','.invalid','.localhost','.example')):raise ValueError('Indique le véritable domaine public HTTPS, sans chemin.')
 base=origin.rstrip('/')+'/'
 for filename,label in PUBLIC_PAGES.items():
  path=ROOT/filename;s=path.read_text();url=urljoin(base,'' if filename=='index.html' else filename)
  s=re.sub(r'\s*<link rel="canonical"[^>]*>','',s);s=re.sub(r'\s*<meta (?:property="og:url"|name="site-url")[^>]*>','',s)
  s=re.sub(r'\s*<script type="application/ld\+json" id="site-schema">.*?</script>','',s,flags=re.S)
  s=re.sub(r'(<meta property="og:image" content=")([^"]+)(")',lambda m:m[1]+urljoin(base,m[2] if not urlsplit(m[2]).scheme else 'assets/'+urlsplit(m[2]).path.rsplit('/',1)[-1])+m[3],s)
  crumbs=[{'@type':'ListItem','position':1,'name':'Accueil','item':base}]
  if filename.startswith('day-one'):crumbs.append({'@type':'ListItem','position':2,'name':'La boutique','item':urljoin(base,'boutique.html')})
  if filename!='index.html':crumbs.append({'@type':'ListItem','position':len(crumbs)+1,'name':label,'item':url})
  graph=[{'@type':'Organization','@id':base+'#organization','name':'UNLIVED','url':base,'logo':urljoin(base,'assets/unlived-logo.svg')},{'@type':'WebSite','@id':base+'#website','name':'UNLIVED','url':base,'inLanguage':'fr','publisher':{'@id':base+'#organization'}},{'@type':'WebPage','@id':url+'#page','url':url,'name':label,'isPartOf':{'@id':base+'#website'},'inLanguage':'fr'}]
  if filename!='index.html':graph.append({'@type':'BreadcrumbList','itemListElement':crumbs})
  def product(m):
   d=json.loads(m[1]);d['url']=url;d['image']=[urljoin(base,'assets/'+urlsplit(x).path.rsplit('/',1)[-1]) for x in d.get('image',[])];d.pop('offers',None)
   return '<script type="application/ld+json" id="product-schema">'+json.dumps(d,ensure_ascii=False).replace('<','\\u003c')+'</script>'
  s=re.sub(r'<script type="application/ld\+json" id="product-schema">(.*?)</script>',product,s,flags=re.S)
  markup='\n<link rel="canonical" href="'+html.escape(url,quote=True)+'">\n<meta property="og:url" content="'+html.escape(url,quote=True)+'">\n<meta name="site-url" content="'+html.escape(base,quote=True)+'">\n<script type="application/ld+json" id="site-schema">'+json.dumps({'@context':'https://schema.org','@graph':graph},ensure_ascii=False).replace('<','\\u003c')+'</script>\n'
  path.write_text(s.replace('</head>',markup+'</head>'))
 urls=[urljoin(base,'' if f=='index.html' else f) for f in PUBLIC_PAGES]
 (ROOT/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+''.join('  <url><loc>'+html.escape(u)+'</loc></url>\n' for u in urls)+'</urlset>\n')
 (ROOT/'robots.txt').write_text('User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: '+base+'sitemap.xml\n')
 print('SEO et sitemap : '+str(len(urls))+' pages publiques, domaine '+base)
if __name__=='__main__':
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('origin');args=a.parse_args()
 try:prepare(args.origin)
 except ValueError as e:a.error(str(e))
