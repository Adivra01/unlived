(() => {
  function render(settings){
    const dashboard=document.querySelector('#customer-dashboard');
    if(dashboard&&!dashboard.querySelector('.account-announcement')){const bar=document.createElement('div');bar.className='announcement-bar account-announcement';dashboard.prepend(bar);}
    document.querySelectorAll('.announcement,.announcement-bar,[data-announcement-preview]').forEach(bar=>{
      const text=String(settings.announcement||'').trim(),code=String(settings.announcement_code||'').trim();
      bar.replaceChildren();bar.hidden=settings.announcement_enabled===false||(!text&&!code);if(bar.hidden)return;
      const link=/^[a-z0-9-]+\.html(?:#[a-z0-9-]+)?$/.test(settings.announcement_link||'')?settings.announcement_link:'boutique.html';
      const animated=settings.announcement_scroll!==false;
      bar.classList.add('configured-announcement');bar.classList.toggle('is-scrolling',animated);bar.classList.remove('is-paused');bar.setAttribute('aria-label','Informations UNLIVED');
      const seconds=Number(settings.announcement_duration);bar.style.setProperty('--announcement-duration',(Number.isInteger(seconds)&&seconds>=5&&seconds<=180?seconds:25)+'s');
      const viewport=document.createElement('div');viewport.className='announcement-viewport';
      const track=document.createElement('div');track.className='announcement-track';
      for(let i=0;i<(animated?2:1);i++){
        const group=document.createElement('div');group.className='announcement-group';const a=document.createElement('a');a.href=link;a.textContent=text;
        if(code){const badge=document.createElement('strong');badge.className='announcement-code';badge.textContent='Code : '+code;a.append(' ',badge);}
        if(i){group.setAttribute('aria-hidden','true');a.tabIndex=-1;}group.append(a);track.append(group);
      }
      viewport.append(track);bar.append(viewport);
      if(animated){const pause=document.createElement('button');pause.type='button';pause.className='announcement-pause';pause.textContent='Pause';pause.setAttribute('aria-label','Mettre le défilement en pause');pause.setAttribute('aria-pressed','false');pause.addEventListener('click',()=>{const paused=bar.classList.toggle('is-paused');pause.textContent=paused?'Reprendre':'Pause';pause.setAttribute('aria-label',paused?'Reprendre le défilement':'Mettre le défilement en pause');pause.setAttribute('aria-pressed',String(paused));});bar.append(pause);}
    });
  }
  window.UNLIVEDAnnouncement={render};
})();
