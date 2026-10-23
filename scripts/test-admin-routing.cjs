const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require(process.env.UNLIVED_JSDOM_MODULE||'jsdom');const root=path.dirname(__dirname);
async function test(role,existing){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));const dom=new JSDOM(fs.readFileSync(path.join(root,'admin.html'),'utf8'),{url:'https://unlived.club/admin.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 w.matchMedia=()=>({matches:false,addEventListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const user={id:'fixture-'+role,role,email:role+'@example.com'};let adminQueries=0,events=[];const redirects=[];w.__redirect=value=>redirects.push(value);
 w.UNLIVEDLocal={auth:{getSession:async()=>({data:{session:existing?{user}:null},error:null}),onAuthStateChange:fn=>events.push(fn),signInWithPassword:async()=>{events.forEach(fn=>fn('SIGNED_IN',{user}));return {data:{user,session:{user}},error:null};}},from(table){if(table==='admin_users')adminQueries++;const q={then:resolve=>Promise.resolve({data:[],error:null}).then(resolve)};for(const method of ['select','eq','order','range','maybeSingle'])q[method]=()=>q;return q;}};
 w.addEventListener('error',e=>errors.push(e.error?.stack||e.message));
 w.eval(fs.readFileSync(path.join(root,'admin.js'),'utf8').replace("location.replace('compte.html#apercu')","window.__redirect('compte.html#apercu')"));
 await new Promise(r=>setTimeout(r,15));
 if(!existing){w.document.querySelector('#login-email').value=user.email;w.document.querySelector('#login-password').value='FixturePassword123!';w.document.querySelector('#login-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,30));}
 if(role==='client'){assert.deepEqual(redirects,['compte.html#apercu']);assert.equal(w.document.querySelector('#admin-app').hidden,true);assert.ok(!w.document.querySelector('#login-message').textContent.includes('autorisé'));}
 else{assert.equal(w.document.querySelector('#admin-app').hidden,false);assert.deepEqual(redirects,[]);}
 assert.equal(adminQueries,0);assert.deepEqual(errors,[]);w.close();console.log(role+' / '+(existing?'session existante':'connexion')+' : routage par rôle OK');
}
(async()=>{for(const role of ['client','admin'])for(const existing of [false,true])await test(role,existing);})().catch(e=>{console.error(e);process.exitCode=1;});
