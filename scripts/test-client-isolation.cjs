/* Functional UI checks with an in-memory API; never connects to the site. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require(process.env.UNLIVED_JSDOM_MODULE||'jsdom');
const root=path.dirname(__dirname),delay=ms=>new Promise(r=>setTimeout(r,ms));
const users={a:{id:'client-a',role:'client',email:'alice@example.com',user_metadata:{display_name:'Alice'}},b:{id:'client-b',role:'client',email:'bruno@example.com',user_metadata:{display_name:'Bruno'}}};
let active='a',held=[];const hold={favorites:false,account:false,cart:false};
const products={a:{id:'piece-a',title:'Pièce Alice',slug:'alice',product_variants:[],product_media:[]},b:{id:'piece-b',title:'Pièce Bruno',slug:'bruno',product_variants:[],product_media:[]}};
const favorites={a:[{product_id:'piece-a',products:products.a}],b:[{product_id:'piece-b',products:products.b}]};
const savedCarts={a:[{key:'a',productId:'piece-a',variantId:'variant-a',title:'Panier Alice',quantity:1,size:'M'}],b:[]};
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync(path.join(root,'compte.html'),'utf8'),{url:'https://unlived.club/compte.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window;w.matchMedia=()=>({matches:false,addEventListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
w.addEventListener('error',e=>errors.push(e.error?.stack||e.message));
const settings={commission_percent:20,commission_hold_days:30,withdrawal_min_cents:2000,withdrawal_methods:['bank_transfer']};
w.fetch=async(url,options={})=>{
 const body=JSON.parse(options.body||'{}'),owner=active,route=new URL(url,w.location.href).pathname;let data=null;
 if(route==='/api/auth'){
  if(body.action==='logout')active=null;
  if(body.action==='login')active=body.email.startsWith('alice')?'a':'b';
  data={user:active?users[active]:null,session:active?{user:users[active]}:null};
 }else if(route==='/api/data'){
  if(body.table==='customer_favorites'){
   data=favorites[owner]||[];
   if(body.action==='delete')favorites[owner]=[];
   if(owner==='a'&&hold.favorites)await new Promise(resolve=>held.push(resolve));
  }else if(body.table==='orders')data=owner?[{id:'order-'+owner,order_number:owner==='a'?'ALICE-ORDER':'BRUNO-ORDER',status:'pending',total_cents:2500,currency:'EUR',created_at:'2026-10-23',order_items:[]}]:[];
  else data=[];
 }else if(route==='/api/business'){
  if(body.action==='public_settings')data={};
  if(body.action==='account'){
   data={user_id:owner?users[owner].id:null,role:'client',affiliate:null,balance:null,stats:null,settings,closure:owner==='a'?[{status:'ALICE-CLOSURE'}]:[],cart:[]};
   if(owner==='a'&&hold.account)await new Promise(resolve=>held.push(resolve));
  }
  if(body.action==='cart_load'){data=savedCarts[owner]||[];if(owner==='a'&&hold.cart)await new Promise(resolve=>held.push(resolve));}
  if(body.action==='cart_save'){assert.equal(body.values.expected_user_id,users[owner].id);savedCarts[owner]=body.values.items;data=body.values.items;}
 }
 return {ok:true,json:async()=>({data,error:null})};
};
async function settle(predicate){for(let i=0;i<100;i++){await delay(10);if(predicate())return;}throw Error('UI did not settle');}
(async()=>{
 for(const file of ['local-client.js','customer.js','cart.js','account.js','business-client.js','account-nav.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
 await settle(()=>w.document.querySelector('#account-favorites').textContent.includes('Pièce Alice')&&w.document.querySelector('#closure-form').textContent.includes('ALICE-CLOSURE'));
 assert.equal(w.document.body.classList.contains('client-workspace'),true);
 for(const id of ['apercu','favoris','commandes','affiliation','retraits','profil','account-requests']){w.location.hash=id;await delay(15);assert.equal(w.document.getElementById(id).hidden,false);assert.equal(w.document.querySelectorAll('#customer-dashboard>.account-section:not([hidden])').length,1);}
 w.document.querySelector('#client-menu').click();assert.equal(w.document.querySelector('#client-backdrop').hidden,false);w.document.querySelector('#client-menu-close').click();assert.equal(w.document.querySelector('#client-backdrop').hidden,true);
 hold.favorites=true;hold.account=true;hold.cart=true;
 w.dispatchEvent(new w.CustomEvent('unlived:favorites-changed'));
 await w.UNLIVEDLocal.auth.signInWithPassword({email:'alice@example.com',password:'FixtureOnly123!'});await delay(15);
 await w.UNLIVEDLocal.auth.signOut();await delay(20);
 assert.equal(w.document.querySelector('#customer-dashboard').hidden,true);assert.equal(w.document.querySelector('#account-favorites').textContent,'');assert.equal(w.document.querySelector('#account-orders').textContent,'');
 await w.UNLIVEDLocal.auth.signInWithPassword({email:'bruno@example.com',password:'FixtureOnly123!'});
 await settle(()=>w.document.querySelector('#account-favorites').textContent.includes('Pièce Bruno'));
 hold.favorites=false;hold.account=false;hold.cart=false;held.forEach(resolve=>resolve());held=[];await delay(80);
 const text=w.document.querySelector('#customer-dashboard').textContent;
 assert.ok(!text.includes('Alice')&&!text.includes('ALICE-ORDER')&&!text.includes('ALICE-CLOSURE'));
 assert.ok(text.includes('Pièce Bruno'));assert.ok(w.document.querySelector('#closure-form textarea'));
 assert.equal(w.UNLIVEDCart.getItems().length,0);assert.equal(w.UNLIVEDCustomer.state.user.id,'client-b');
 assert.ok(!w.localStorage.getItem('unlived-cart-client-a'));
 await w.UNLIVEDLocal.auth.signOut();await delay(20);
 assert.equal(w.document.querySelector('#auth-panel').hidden,false);assert.equal(w.document.querySelector('#account-favorites').textContent,'');
 assert.deepEqual(errors,[]);console.log('Client UI: sections, mobile menu, logout clearing, account switch, stale responses, private favorites and empty server cart passed.');w.close();
})().catch(e=>{console.error(e);w.close();process.exitCode=1;});
