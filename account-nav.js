(() => {
  const dashboard=document.querySelector('#customer-dashboard');
  if(!dashboard)return;
  const views=new Set(['apercu','favoris','commandes','affiliation','retraits','profil','account-requests']);
  const sidebar=document.querySelector('#client-sidebar'),menu=document.querySelector('#client-menu'),backdrop=document.querySelector('#client-backdrop');
  const setMenu=show=>{
    sidebar.classList.toggle('is-open',show);
    menu.setAttribute('aria-expanded',String(show));
    backdrop.hidden=!show;
    sidebar.inert=matchMedia('(max-width:800px)').matches&&!show;
    document.body.style.overflow=show?'hidden':'';
    if(show)document.querySelector('#client-menu-close').focus();
  };
  menu.addEventListener('click',()=>setMenu(true));
  document.querySelector('#client-menu-close').addEventListener('click',()=>{setMenu(false);menu.focus();});
  backdrop.addEventListener('click',()=>{setMenu(false);menu.focus();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sidebar.classList.contains('is-open')){setMenu(false);menu.focus();}});
  addEventListener('resize',()=>setMenu(false));
  document.addEventListener('unlived:client-signed-out',()=>setMenu(false));
  const open=()=>{
    const requested=decodeURIComponent(location.hash.slice(1));
    const view=views.has(requested)?requested:'apercu';
    dashboard.querySelectorAll('.account-section').forEach(section=>{section.hidden=section.id!==view;});
    document.querySelectorAll('[data-account-view]').forEach(link=>{
      const active=link.dataset.accountView===view;
      link.classList.toggle('is-active',active);
      if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    });
    setMenu(false);
  };
  addEventListener('hashchange',open);
  document.addEventListener('click',event=>{if(event.target.closest('.account-overview-links a'))setTimeout(open,0);});
  open();
  document.addEventListener('unlived:client-ready',open);
  document.addEventListener('unlived:client-business',event=>{
    const d=event.detail,a=d.affiliate;
    const balance=document.querySelector('#client-commission');
    balance.textContent=new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format((d.balance?.available_cents||0)/100);
    const summary=document.querySelector('#client-affiliate-summary');
    summary.replaceChildren();
    const status=document.createElement('span');status.className='client-affiliate-status';
    status.textContent=a?({pending:'Candidature en cours',active:'Affiliation active',rejected:'Candidature refusée',suspended:'Affiliation suspendue'}[a.status]||a.status):'Pas encore affilié';
    const note=document.createElement('p');note.className='account-muted';note.style.marginTop='16px';
    note.textContent=a?.status==='active'?`Commission : ${a.percent} %. Retrouve ton lien personnel, tes résultats et tes retraits dans les sections du menu.`:a?'Consulte la section Affiliation pour suivre ton statut.':`Le programme prévoit ${d.settings.commission_percent} % de commission sur les commandes éligibles, après validation de ta candidature.`;
    summary.append(status,note);
  });
  const observer=new MutationObserver(open);
  observer.observe(dashboard,{childList:true,subtree:false});
  const favorites=document.querySelector('#favorites-count');
  if(favorites)new MutationObserver(()=>{const count=document.querySelector('#sidebar-favorites-count');if(count)count.textContent=favorites.textContent;}).observe(favorites,{childList:true,characterData:true,subtree:true});
})();
