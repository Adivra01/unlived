(() => {
  const dashboard=document.querySelector('#customer-dashboard');
  if(!dashboard)return;
  const views=new Set(['apercu','favoris','commandes','affiliation','retraits','profil','account-requests']);
  const open=()=>{
    const requested=decodeURIComponent(location.hash.slice(1));
    const view=views.has(requested)?requested:'apercu';
    dashboard.querySelectorAll('.account-section').forEach(section=>{section.hidden=section.id!==view;});
    document.querySelectorAll('[data-account-view]').forEach(link=>{
      const active=link.dataset.accountView===view;
      link.classList.toggle('is-active',active);
      if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    });
  };
  addEventListener('hashchange',open);
  document.addEventListener('click',event=>{if(event.target.closest('.account-overview-links a'))setTimeout(open,0);});
  open();
  const observer=new MutationObserver(open);
  observer.observe(dashboard,{childList:true,subtree:false});
  const favorites=document.querySelector('#favorites-count');
  if(favorites)new MutationObserver(()=>{const count=document.querySelector('#sidebar-favorites-count');if(count)count.textContent=favorites.textContent;}).observe(favorites,{childList:true,characterData:true,subtree:true});
})();
