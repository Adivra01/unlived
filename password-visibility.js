/* Passwords remain masked until the user explicitly toggles their own field. */
(() => {
  let nextId=0;
  const eye='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  function conceal(input,button){input.type='password';button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','Afficher le mot de passe');button.title='Afficher le mot de passe';}
  function enhance(root=document){
    if(!root?.querySelectorAll)return;
    root.querySelectorAll('input[type="password"]').forEach(input=>{
      if(input.closest('.password-field'))return;
      if(!input.id){do{input.id='password-visibility-'+(++nextId);}while(document.querySelectorAll('[id="'+input.id+'"]').length>1);}
      const wrapper=document.createElement('span');wrapper.className='password-field';input.before(wrapper);wrapper.append(input);
      const button=document.createElement('button');button.type='button';button.className='password-visibility';button.setAttribute('aria-controls',input.id);button.innerHTML=eye;conceal(input,button);
      button.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();
        const visible=input.type==='password';input.type=visible?'text':'password';button.setAttribute('aria-pressed',String(visible));
        const label=visible?'Masquer le mot de passe':'Afficher le mot de passe';button.setAttribute('aria-label',label);button.title=label;input.focus({preventScroll:true});
      });wrapper.append(button);
      input.form?.addEventListener('submit',()=>conceal(input,button));
    });
  }
  enhance();
  new MutationObserver(()=>enhance()).observe(document.body,{childList:true,subtree:true});
  function concealAll(){document.querySelectorAll('.password-field').forEach(wrapper=>{const input=wrapper.querySelector('input'),button=wrapper.querySelector('.password-visibility');if(input&&button)conceal(input,button);});}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)concealAll();});
  window.UNLIVEDLocal?.auth.onAuthStateChange(concealAll);
})();
