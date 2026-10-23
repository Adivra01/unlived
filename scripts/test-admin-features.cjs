const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require(process.env.UNLIVED_JSDOM_MODULE||'jsdom');const root=path.dirname(__dirname),errors=[];
const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));const dom=new JSDOM(fs.readFileSync(path.join(root,'admin.html'),'utf8'),{url:'https://unlived.club/admin.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
const callbacks=[];w.UNLIVEDLocal={auth:{onAuthStateChange:fn=>callbacks.push(fn)}};
const stats={views:0,visitors:0,sessions:0,daily:[],pages:[],countries:[],products:[],events:[],sources:[],devices:[]};
const data={stats,users:[{id:'client',role:'client',email:'private-client@example.com',user_metadata:{display_name:'Private client'}}],products:[],variants:[],media:[],affiliates:[],campaigns:[],discounts:[],withdrawals:[],audit:[],closures:[{id:'closure',user_id:'client',reason:'Private closure reason',status:'requested',created_at:'2026-10-23'}],settings:{announcement:'Message initial',announcement_link:'boutique.html',announcement_enabled:true,announcement_scroll:true,announcement_duration:25,announcement_code:'',commission_percent:20,withdrawal_min_cents:2000,commission_hold_days:30,withdrawal_methods:['bank_transfer']}};
let saved=null,hold=false,release=null;
w.UNLIVEDBusiness={esc:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),request:async(action,values)=>{
 if(action==='settings_save'){saved=values;Object.assign(data.settings,values);return data.settings;}
 if(action==='dashboard'){const snapshot=JSON.parse(JSON.stringify(data));if(hold)await new Promise(resolve=>release=resolve);return snapshot;}
 if(action==='requests_summary')return {pending:1};throw Error('Unexpected action '+action);
}};
async function until(predicate){for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,5));if(predicate())return;}throw Error('UI timeout');}
(async()=>{
 w.eval(fs.readFileSync(path.join(root,'announcement.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'business-admin.js'),'utf8'));
 await until(()=>w.document.querySelector('[name=announcement_duration]'));
 assert.equal(w.document.querySelector('.request-count').textContent,'1');
 const form=w.document.querySelector('[name=announcement_duration]').form;
 form.elements.announcement.value='Notre nouvelle édition';form.elements.announcement_code.value='SAVE20';form.elements.announcement_duration.value='55';form.elements.announcement_enabled.value='true';form.elements.announcement_scroll.value='false';
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await until(()=>saved&&w.document.querySelector('[name=announcement_duration]').value==='55');
 assert.equal(saved.announcement_duration,55);assert.equal(saved.announcement_scroll,false);assert.equal(saved.announcement_enabled,true);assert.equal(saved.announcement_code,'SAVE20');
 assert.ok(w.document.querySelector('[data-announcement-preview]').textContent.includes('SAVE20'));
 hold=true;w.document.dispatchEvent(new w.CustomEvent('unlived:admin-ready',{detail:{preview:false}}));await until(()=>release);
 callbacks.forEach(fn=>fn('SIGNED_OUT',null));w.document.dispatchEvent(new w.CustomEvent('unlived:admin-ready',{detail:{preview:true}}));release();await new Promise(r=>setTimeout(r,20));
 assert.equal(w.UNLIVEDRegisteredUsers.length,0);assert.ok(!w.document.querySelector('#business-requests').textContent.includes('Private closure reason'));assert.ok(w.document.querySelector('.request-count').hidden);
 assert.deepEqual(errors,[]);console.log('Admin : réglages du bandeau, aperçu, demandes reçues et effacement des données en déconnexion/aperçu OK');w.close();
})().catch(e=>{console.error(e);w.close();process.exitCode=1;});
