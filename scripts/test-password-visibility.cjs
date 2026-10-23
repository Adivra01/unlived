const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require(process.env.UNLIVED_JSDOM_MODULE||'jsdom');
const root=path.dirname(__dirname);
(async()=>{
 for(const file of ['compte.html','admin.html','auth.html']){
  const dom=new JSDOM(fs.readFileSync(path.join(root,file),'utf8'),{url:'https://unlived.club/'+file,runScripts:'outside-only'}),w=dom.window;
  const inputs=[...w.document.querySelectorAll('input[type=password]')];
  w.eval(fs.readFileSync(path.join(root,'password-visibility.js'),'utf8'));
  assert.equal(w.document.querySelectorAll('.password-visibility').length,inputs.length);
  let submitted=0;w.document.addEventListener('submit',()=>submitted++);
  for(const input of inputs){
   const button=input.parentElement.querySelector('.password-visibility');input.value='FixturePassword123!';
   assert.equal(button.type,'button');assert.equal(button.getAttribute('aria-controls'),input.id);
   button.click();assert.equal(input.type,'text');assert.equal(input.value,'FixturePassword123!');assert.equal(button.getAttribute('aria-pressed'),'true');
   button.click();assert.equal(input.type,'password');assert.equal(submitted,0);
   button.click();input.form?.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(input.type,'password');submitted=0;
  }
  const dynamic=w.document.createElement('input');dynamic.type='password';w.document.body.append(dynamic);await new Promise(r=>setTimeout(r,0));
  assert.equal(dynamic.parentElement.className,'password-field');assert.equal(dynamic.parentElement.querySelectorAll('button').length,1);
  console.log(file+': afficher/masquer, valeur conservée, aucune soumission au clic, masquage à la soumission, champs dynamiques OK');dom.window.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
