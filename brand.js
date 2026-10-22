(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const intro = document.querySelector('.brand-intro');
  let opening;
  const finish = () => {
    opening?.kill();
    document.documentElement.classList.remove('brand-entering');
    if (intro) { intro.hidden = true; intro.removeAttribute('aria-modal'); }
    document.querySelectorAll('[data-intro-inert]').forEach(el => {el.inert = false;el.removeAttribute('data-intro-inert');});
    try {sessionStorage.setItem('unlived-entry-v2','1');} catch {}
    window.ScrollTrigger?.refresh();
  };
  if (intro && document.documentElement.classList.contains('brand-entering') && !reduce.matches) {
    for (const el of document.body.children) if(el !== intro && !['SCRIPT','STYLE'].includes(el.tagName) && !el.inert){el.inert=true;el.setAttribute('data-intro-inert','');}
    const skip = intro.querySelector('.intro-skip');
    skip.focus({preventScroll:true});
    const close = () => {finish();document.querySelector('.site-header .wordmark')?.focus({preventScroll:true});};
    skip.addEventListener('click',close);
    intro.addEventListener('keydown',event=>{if(event.key==='Escape'){close();}if(event.key==='Tab'){event.preventDefault();skip.focus();}});
    setTimeout(finish,4200); // Never hold the site behind an unavailable asset or library.
    if (window.gsap) {
      opening = gsap.timeline({onComplete:finish})
        .from('.intro-logo-mask img',{yPercent:105,opacity:0,duration:.85,ease:'power3.out'},0)
        .from('.intro-message span,.intro-message em',{y:20,opacity:0,duration:.65,stagger:.12,ease:'power2.out'},.3)
        .from('.intro-rule',{scaleX:0,duration:1.5,ease:'power2.inOut'},.4)
        .to(intro,{yPercent:-100,duration:.85,ease:'power3.inOut'},2.05);
    } else setTimeout(finish,2200);
  } else if (intro) intro.hidden=true;
  // Only enhance real content; scrolling and links work without GSAP.
  if (!window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);
  const mm = gsap.matchMedia();
  let catalogContext;
  function animateCatalog(){
    catalogContext?.revert();
    catalogContext = gsap.context(()=>{
      if(reduce.matches)return;
      document.querySelectorAll('.editorial-catalog .product-card').forEach(card=>{
        const art=card.querySelector('.product-image-button');
        const copy=card.querySelector('.catalog-story');
        gsap.fromTo(art,{clipPath:'inset(7% 0% 7% 0%)'},{clipPath:'inset(0% 0% 0% 0%)',duration:1.15,ease:'power3.out',scrollTrigger:{trigger:card,start:'top 88%',once:true},clearProps:'clipPath'});
        if(copy)gsap.from(copy.children,{y:24,opacity:0,duration:.75,stagger:.07,ease:'power3.out',scrollTrigger:{trigger:copy,start:'top 90%',once:true},clearProps:'transform,opacity'});
      });
    });
    ScrollTrigger.refresh();
  }
  addEventListener('unlived:catalog-loaded',animateCatalog);
  reduce.addEventListener('change',()=>{if(reduce.matches)finish();animateCatalog();});
  animateCatalog();
  mm.add('(min-width: 1000px) and (prefers-reduced-motion: no-preference)',()=>{
    document.querySelectorAll('.waitlist-heading h2,.footer-statement').forEach(el=>gsap.fromTo(el,{y:26},{y:-10,ease:'none',scrollTrigger:{trigger:el,start:'top bottom',end:'bottom 30%',scrub:1.2}}));
    document.querySelectorAll('.intro-index').forEach(el=>gsap.to(el,{y:55,ease:'none',scrollTrigger:{trigger:el.parentElement,start:'top top',end:'bottom top',scrub:1}}));
  });
  // Scroll reveals follow the reading order; no scroll hijacking or required animation.
  mm.add({desktop:'(min-width: 1000px)',reduce:'(prefers-reduced-motion: reduce)'}, context=>{
    if(context.conditions.reduce)return;
    const desktop=context.conditions.desktop;
    const reveal=(elements,trigger)=>gsap.from(elements,{y:desktop?36:18,opacity:0,duration:.9,stagger:.1,ease:'power3.out',scrollTrigger:{trigger,start:'top 91%',once:true},clearProps:'transform,opacity'});
    document.querySelectorAll('.launch-card,.choice-card').forEach(card=>{
      const image=card.querySelector('.launch-art,.choice-preview');
      if(image)gsap.fromTo(image,{clipPath:'inset(8% 0 8% 0)'},{clipPath:'inset(0% 0 0% 0)',duration:1.2,ease:'power3.out',scrollTrigger:{trigger:card,start:'top 92%',once:true},clearProps:'clipPath'});
      const copy=card.querySelector('.launch-meta,.choice-meta');if(copy)reveal(copy.children,copy);
    });
    document.querySelectorAll('.red-chapter-copy,.learning-section>div:first-child,.learning-list article,.collection-roadmap article,.signature-benefits').forEach(el=>reveal(el.children,el));
    document.querySelectorAll('.page-intro h1,.signup-page h1,.legal-page h1').forEach(el=>reveal(el,el));
    if(desktop){
      const index=document.querySelector('.red-index');if(index)gsap.to(index,{y:28,ease:'none',scrollTrigger:{trigger:'.red-chapter',start:'top bottom',end:'bottom top',scrub:1.5}});
    }
  });
})();
