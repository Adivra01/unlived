"""Forward development requests to the authoritative HTTPS API; never persist locally."""
from http.cookies import SimpleCookie
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError

PATHS={'/api/auth','/api/data','/api/business','/api/track','/api/waitlist','/waitlist-api.php'}
COOKIES={'unlived_session','unlived_affiliate','unlived_analytics_exclude'}

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None

def validate_origin(origin):
    p=urlsplit(origin)
    if p.scheme!='https' or not p.hostname or p.username or p.password or p.path not in ('','/') or p.query or p.fragment:
        raise ValueError('Le serveur partagé doit être une origine HTTPS sans chemin.')
    return origin.rstrip('/')

def forward(origin,path,body,cookie_header=''):
    origin=validate_origin(origin)
    if path not in PATHS: raise ValueError('Route non autorisée.')
    cookies=SimpleCookie();cookies.load(cookie_header)
    headers={'Content-Type':'application/json','X-UNLIVED-Request':'1','Origin':origin}
    selected=[f'{name}={item.value}' for name,item in cookies.items() if name in COOKIES]
    if selected: headers['Cookie']='; '.join(selected)
    request=Request(origin+path,data=body,headers=headers,method='POST')
    try: response=build_opener(NoRedirect).open(request,timeout=25)
    except HTTPError as error: response=error
    with response as response:
        content=response.read(4*1024*1024+1)
        if len(content)>4*1024*1024: raise ValueError('Réponse trop volumineuse.')
        result_cookies=[]
        for value in response.headers.get_all('Set-Cookie',[]):
            parsed=SimpleCookie();parsed.load(value)
            for name,item in parsed.items():
                if name not in COOKIES:continue
                # Host-only on localhost; the upstream session remains HttpOnly.
                item['domain']='';item['secure']='';item['path']='/'
                result_cookies.append(item.OutputString())
        return response.status,response.headers.get('Content-Type','application/json'),content,result_cookies
