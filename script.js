(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const storage = {get: k => {try{return sessionStorage.getItem(k)}catch{return null}},set:(k,v)=>{try{sessionStorage.setItem(k,v)}catch{}},remove:k=>{try{sessionStorage.removeItem(k)}catch{}}};
  function announce(text) {
    const target = $('.toast'); if (!target) return;
    target.textContent = text; target.classList.add('show');
    clearTimeout(announce.timer); announce.timer = setTimeout(()=>target.classList.remove('show'),4500);
  }
  // One owner for navigation on every public page, independent of Auth availability.
  const menu = $('.menu-toggle'), nav = $('.main-nav');
  if (menu && nav) {
    const backdrop = document.createElement('button');
    backdrop.className='nav-backdrop'; backdrop.tabIndex=-1; backdrop.setAttribute('aria-label','Fermer le menu');
    document.body.append(backdrop);
    const mobile = matchMedia('(max-width: 800px)');
    const setMenu = open => {
      menu.setAttribute('aria-expanded',String(open));
      menu.setAttribute('aria-label',open?'Fermer le menu':'Ouvrir le menu');
      nav.classList.toggle('open',open); document.body.classList.toggle('menu-open',open);
      nav.inert=mobile.matches&&!open;
    };
    menu.addEventListener('click',()=>setMenu(menu.getAttribute('aria-expanded')!=='true'));
    backdrop.addEventListener('click',()=>{setMenu(false);menu.focus()});
    nav.addEventListener('click',event=>{if(event.target.closest('a'))setMenu(false)});
    document.addEventListener('keydown',event=>{
      if(menu.getAttribute('aria-expanded')!=='true')return;
      if(event.key==='Escape'){setMenu(false);menu.focus()}
      if(event.key==='Tab'){
        const items=[menu,...$$('a',nav)],first=items[0],last=items.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
      }
    });
    mobile.addEventListener('change',()=>setMenu(false)); setMenu(false);
  }
  const header=$('.site-header'); let scrollQueued=false;
  const updateScroll=()=>{
    header?.classList.toggle('is-scrolled',scrollY>40);
    const bar=$('.reading-progress span'),max=document.documentElement.scrollHeight-innerHeight;
    if(bar)bar.style.transform=`scaleX(${max>0?Math.min(1,scrollY/max):0})`;
    scrollQueued=false;
  };
  addEventListener('scroll',()=>{if(!scrollQueued){scrollQueued=true;requestAnimationFrame(updateScroll)}},{passive:true});updateScroll();

  const film=$('.hero-video'),filmButton=$('.film-toggle');
  if(film){
    let pausedByUser=reduce.matches,inViewport=true;
    const sync=()=>{if(pausedByUser||!inViewport||document.hidden)film.pause();else film.play().catch(()=>{})};
    const label=()=>{if(!filmButton)return;filmButton.setAttribute('aria-label',film.paused?'Lire le film':'Mettre le film en pause');$('[data-film-label]',filmButton).textContent=film.paused?'Lire le film':'Pause';filmButton.firstElementChild.textContent=film.paused?'▷':'Ⅱ'};
    filmButton?.addEventListener('click',()=>{pausedByUser=!film.paused;sync()});
    film.addEventListener('play',label);film.addEventListener('pause',label);
    film.addEventListener('timeupdate',()=>{const rail=$('.hero-rail-line i');if(rail&&film.duration)rail.style.transform=`scaleY(${film.currentTime/film.duration})`});
    film.addEventListener('error',()=>{if(filmButton)filmButton.hidden=true});
    new IntersectionObserver(entries=>{inViewport=entries[0].isIntersecting;sync()},{threshold:.05}).observe(film);
    document.addEventListener('visibilitychange',sync);
    reduce.addEventListener('change',()=>{pausedByUser=reduce.matches;sync()});sync();label();
  }

  const track=$('#brand-track'),sound=$('#sound-toggle');
  if(track&&sound){
    let requested=false;track.volume=.45;
    const soundState=playing=>{sound.classList.toggle('is-playing',playing);sound.setAttribute('aria-pressed',String(playing));sound.setAttribute('aria-label',playing?'Mettre la bande-son en pause':'Lancer la bande-son');$('.sound-label b',sound).textContent=playing?'ON':'OFF'};
    track.addEventListener('loadedmetadata',()=>{const time=Number(storage.get('unlived-sound-time'));if(time>0&&time<track.duration)track.currentTime=time},{once:true});
    sound.addEventListener('click',async()=>{
      if(!track.paused){track.pause();return}
      requested=true;sound.disabled=true;
      try{await track.play()}catch{announce('La bande-son est indisponible pour le moment. Tu peux continuer ta visite.')}finally{sound.disabled=false}
    });
    track.addEventListener('play',()=>soundState(true));track.addEventListener('pause',()=>soundState(false));
    track.addEventListener('error',()=>{soundState(false);if(requested)announce('La bande-son est indisponible pour le moment.')});
    addEventListener('pagehide',()=>storage.set('unlived-sound-time',String(track.currentTime)));
  }

  // Filtering remains deterministic, even after the live catalog replaces the cards.
  function filterCatalog(animate=false){
    const active=$('.filter-tab.active'),filter=active?.dataset.filter||'all';
    const cards=$$('#products .product-card');let visible=0;
    cards.forEach(card=>{const show=filter==='all'||card.dataset.category===filter;card.hidden=!show;card.classList.remove('is-hidden');if(show)visible++});
    $$('.filter-tab').forEach(tab=>tab.setAttribute('aria-pressed',String(tab===active)));
    const count=$('.filter-tab[data-filter="all"] span');if(count)count.textContent=String(cards.length).padStart(2,'0');
    const status=$('#catalog-status');if(status)status.textContent=`${visible} pièce${visible>1?'s':''} affichée${visible>1?'s':''}`;
    if(animate&&window.gsap&&!reduce.matches)gsap.fromTo(cards.filter(c=>!c.hidden),{y:12,opacity:.45},{y:0,opacity:1,duration:.4,stagger:.06,overwrite:true});
    window.ScrollTrigger?.refresh();
  }
  $$('.filter-tab').forEach(tab=>tab.addEventListener('click',()=>{$$('.filter-tab').forEach(t=>t.classList.toggle('active',t===tab));filterCatalog(true)}));
  addEventListener('unlived:catalog-loaded',()=>filterCatalog());filterCatalog();

  const contact=$('#contact-form');
  if(contact){
    const item=storage.get('unlived-waitlist-product'),size=storage.get('unlived-waitlist-size');
    if(item){$('#message').value=`Bonjour UNLIVED,\n\nJ’aimerais recevoir les informations de lancement pour « ${item} »${size?` en taille ${size}`:''}.\n\nMerci !`;storage.remove('unlived-waitlist-product');storage.remove('unlived-waitlist-size')}
    contact.addEventListener('submit',async event=>{
      event.preventDefault();if(!contact.reportValidity())return;
      const button=$('[type=submit]',contact),original=button.innerHTML,status=$('#contact-status');
      const name=$('#name').value.trim(),email=$('#email').value.trim(),message=$('#message').value.trim();
      if(!name||!email||!message)return;
      const subject=encodeURIComponent('Message depuis UNLIVED — '+name);
      const body=encodeURIComponent(`Bonjour UNLIVED,\n\n${message}\n\n${name}\n${email}`);
      window.location.href=`mailto:contact@unlived.club?subject=${subject}&body=${body}`;
      if(status){status.classList.remove('is-error');status.textContent='Ton application e-mail va s’ouvrir. Vérifie le message, puis appuie sur Envoyer.'}
    });
  }

  $$('input[type=password]').forEach(input=>{
    const wrapper=document.createElement('span');wrapper.className='password-control';
    input.replaceWith(wrapper);wrapper.append(input);
    const toggle=document.createElement('button');toggle.type='button';toggle.className='password-toggle';toggle.textContent='Afficher';toggle.setAttribute('aria-label','Afficher le mot de passe');toggle.setAttribute('aria-pressed','false');wrapper.append(toggle);
    toggle.addEventListener('click',()=>{const show=input.type==='password';input.type=show?'text':'password';toggle.textContent=show?'Masquer':'Afficher';toggle.setAttribute('aria-pressed',String(show));toggle.setAttribute('aria-label',show?'Masquer le mot de passe':'Afficher le mot de passe')});
  });
  // Progressive enhancement: content is visible when animation libraries are absent.
  if(!window.gsap||!window.ScrollTrigger)return;
  gsap.registerPlugin(ScrollTrigger);
  const mm=gsap.matchMedia();
  mm.add({desktop:'(min-width: 1000px)',mobile:'(max-width: 999px)',reduce:'(prefers-reduced-motion: reduce)'},context=>{
    if(context.conditions.reduce)return;
    const desktop=context.conditions.desktop;
    if($('.hero-copy'))gsap.from('.hero-copy > *',{y:28,opacity:0,duration:1.1,stagger:.15,ease:'power3.out',clearProps:'all'});
    $$('.reveal').filter(el=>!el.closest('.product-grid')).forEach(el=>gsap.from(el,{y:desktop?36:20,opacity:.2,duration:.85,ease:'power3.out',scrollTrigger:{trigger:el,start:'top 94%',once:true},clearProps:'all'}));
    if(desktop){
      // Photos retain their full framing; only the hero video uses depth.
      if($('.hero-scene'))gsap.fromTo('.hero-scene',{yPercent:-4.5,scale:1.12},{yPercent:4.5,ease:'none',scrollTrigger:{trigger:'.hero-cinema',start:'top bottom',end:'bottom top',scrub:1}});
      if($('.editorial-intro h2'))gsap.from('.editorial-intro h2',{x:-35,ease:'none',scrollTrigger:{trigger:'.editorial-intro',start:'top bottom',end:'center center',scrub:1}});
      if($('.invitation-orbit'))gsap.fromTo('.invitation-orbit',{scale:.65},{scale:1.2,ease:'none',scrollTrigger:{trigger:'.home-invitation',start:'top bottom',end:'bottom top',scrub:1}});
    }
  });
  mm.add('(min-width: 1000px) and (min-height: 800px) and (prefers-reduced-motion: no-preference)',()=>{
    const section=$('.direction-section');if(!section)return;
    section.classList.add('is-pinned-story');
    const steps=$$('.direction-step'),images=$$('.direction-image');
    gsap.set(steps.slice(1),{autoAlpha:0,y:16});gsap.set(images.slice(1),{autoAlpha:0,scale:.95,rotation:3});
    const timeline=gsap.timeline({scrollTrigger:{trigger:section,start:'top 78px',end:'+=1300',pin:'.direction-pin',scrub:1,invalidateOnRefresh:true,onUpdate:self=>{const index=Math.min(2,Math.floor(self.progress*3));$('.direction-photo-index b').textContent=String(index+1).padStart(2,'0')}}});
    for(let i=1;i<3;i++)timeline.to(steps[i-1],{autoAlpha:0,y:-18,duration:.3},i-.2).to(steps[i],{autoAlpha:1,y:0,duration:.5},i).to(images[i-1],{scale:.92,rotation:-3,autoAlpha:0,duration:.7},i-.2).to(images[i],{autoAlpha:1,scale:1,rotation:0,duration:.8},i-.1);
    timeline.to({}, {duration:.4});
    return()=>{section.classList.remove('is-pinned-story');$('.direction-photo-index b').textContent='01'};
  });
  document.fonts?.ready.then(()=>ScrollTrigger.refresh());
  addEventListener('load',()=>ScrollTrigger.refresh(),{once:true});
})();
