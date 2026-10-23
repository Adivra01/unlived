(() => {
  let STORAGE_KEY = 'unlived-cart-guest';
  let cartUser=null;
  let cartVersion=0;
  let saveQueue=Promise.resolve();
  const read = () => {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value.filter(item => item && item.key && item.title) : [];
    } catch { return []; }
  };
  let items = read();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const save = () => {
    if(!cartUser){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(items));}catch{}}
    render();
    const userId=cartUser,version=cartVersion,snapshot=items.map(item=>({...item}));
    if(userId)saveQueue=saveQueue.catch(()=>{}).then(async()=>{
      if(cartUser!==userId||cartVersion!==version)return;
      try{const response=await fetch('/api/business',{method:'POST',headers:{'Content-Type':'application/json','X-UNLIVED-Request':'1'},body:JSON.stringify({action:'cart_save',values:{items:snapshot,expected_user_id:userId}})});const result=await response.json();if(result.error)throw Error();}
      catch{if(cartUser===userId&&cartVersion===version)window.UNLIVEDCustomer?.toast('Ton panier n’a pas pu être synchronisé. Réessaie.');}
    });
  };
  const drawer = document.createElement('dialog');
  drawer.className = 'cart-drawer';
  drawer.setAttribute('aria-labelledby', 'cart-title');
  drawer.innerHTML = `<div class="cart-drawer-head"><div><p class="small-label">ACTE I: DAY ONE</p><h2 id="cart-title">Ton panier <span id="cart-count">(0)</span></h2></div><button class="cart-close" type="button" aria-label="Fermer le panier">×</button></div><div class="cart-lines" id="cart-lines"></div><div class="cart-drawer-foot"><p class="cart-total"><span>Total provisoire</span><strong id="cart-total">À annoncer</strong></p><p class="cart-note">Les prix et l’ouverture des commandes seront confirmés au lancement. Ton panier reste enregistré sur cet appareil.</p><button class="button button-dark cart-checkout" type="button" disabled aria-disabled="true">Commandes bientôt ouvertes <span></span></button><a class="cart-continue" href="boutique.html">Continuer à explorer </a></div>`;
  document.body.append(drawer);
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'header-cart'; trigger.setAttribute('aria-label', 'Ouvrir le panier');
  trigger.innerHTML = '<span class="header-cart-icon" aria-hidden="true"><svg class="ui-icon icon-cart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h2l3 12h12l3-9H5"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg></span><span>Panier</span><b class="cart-trigger-count" hidden>0</b>';
  const header=document.querySelector('.site-header');
  const favorites=header?.querySelector('.header-favorites');
  if(favorites){const actions=document.createElement('div');actions.className='header-actions';favorites.before(actions);actions.append(favorites);const lang=header.querySelector(".language-picker-compact");if(lang)actions.append(lang);actions.append(trigger)}
  else header?.append(trigger);
  const count = () => items.reduce((total, item) => total + item.quantity, 0);
  function render() {
    const totalCount = count();
    drawer.querySelector('#cart-count').textContent = `(${totalCount})`;
    trigger.querySelector('.cart-trigger-count').textContent = String(totalCount);
    trigger.querySelector('.cart-trigger-count').hidden = totalCount === 0;
    const lines = drawer.querySelector('#cart-lines');
    lines.innerHTML = items.length ? items.map(item => `<article class="cart-line">${item.image ? `<img src="${escape(item.image)}" alt="">` : `<div class="cart-line-concept ${/hoodie|capuche/i.test(item.title) ? 'is-hoodie' : ''}" aria-hidden="true"><span>${escape(item.title.split('—')[0].trim())}</span></div>`}<div class="cart-line-info"><p class="cart-line-collection">${escape(item.collection || 'ACTE I: DAY ONE')}</p><h3>${escape(item.title)}</h3><p class="cart-line-variant">${escape(item.variantName || '')}${item.size ? ` · Taille ${escape(item.size)}` : ''}</p><strong class="cart-line-price">Prix annoncé au lancement</strong><div class="cart-line-controls"><button type="button" data-cart-qty="-1" data-key="${escape(item.key)}" aria-label="Retirer une unité">−</button><span>${item.quantity}</span><button type="button" data-cart-qty="1" data-key="${escape(item.key)}" aria-label="Ajouter une unité">＋</button><button class="cart-remove" type="button" data-cart-remove="${escape(item.key)}">Retirer</button></div></div></article>`).join('') : '<div class="cart-empty"><span aria-hidden="true"><svg class="ui-icon icon-cart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h2l3 12h12l3-9H5"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg></span><p>Il reste de la place pour le premier pas.</p><a href="boutique.html">Découvrir DAY ONE </a></div>';
    const hasUnknownPrice = items.some(item => item.priceCents == null);
    const total = items.reduce((sum, item) => sum + (Number(item.priceCents) || 0) * item.quantity, 0);
    drawer.querySelector('#cart-total').textContent = 'Annoncé au lancement';
  }
  function open() { if (!drawer.open) drawer.showModal(); }
  trigger.addEventListener('click', open);
  drawer.querySelector('.cart-close').addEventListener('click', () => drawer.close());
  drawer.addEventListener('click', event => { if (event.target === drawer) drawer.close(); });
  drawer.addEventListener('click', event => {
    const remove = event.target.closest('[data-cart-remove]');
    if (remove) { items = items.filter(item => item.key !== remove.dataset.cartRemove); save(); return; }
    const qtyButton = event.target.closest('[data-cart-qty]');
    if (!qtyButton) return;
    const item = items.find(entry => entry.key === qtyButton.dataset.key);
    if (!item) return;
    item.quantity = Math.max(1, Math.min(10, item.quantity + Number(qtyButton.dataset.cartQty)));
    save();
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-add-to-cart]');
    if (!button || button.disabled) return;
    const size = document.querySelector('[data-size].is-selected')?.dataset.size || '';
    const productId = button.dataset.productId || button.dataset.slug || 'day-one';
    const variantId = button.dataset.variantId || button.dataset.variant || document.body.dataset.variant || 'blanc';
    const key = [button.dataset.slug || productId, button.dataset.variant || variantId, size].join(':');
    const prior = items.find(item => item.key === key);
    if (prior) prior.quantity = Math.min(10, prior.quantity + 1);
    else items.push({key, productId, variantId, title:button.dataset.title || 'DAY ONE', collection:button.dataset.collection || 'ACTE I: DAY ONE', variantName:button.dataset.variantName || (variantId === 'noir' ? 'Noir' : 'Blanc'), size, image:button.dataset.image || '', priceCents:button.dataset.priceCents ? Number(button.dataset.priceCents) : null, currency:button.dataset.currency || 'EUR', quantity:1});
    save(); open();
    document.dispatchEvent(new CustomEvent('unlived:cart-added',{detail:{product:button.dataset.slug||productId}}));
    document.querySelector('.toast')?.classList.add('show');
    const toast = document.querySelector('.toast'); if (toast) { toast.textContent = 'La pièce a rejoint ton panier.'; clearTimeout(toast._cartTimer); toast._cartTimer = setTimeout(() => toast.classList.remove('show'), 2600); }
  });
  window.UNLIVEDCart = {open, getItems:() => items.slice()};
  function clearCart(){cartVersion++;cartUser=null;STORAGE_KEY='unlived-cart-guest';items=read();render();}
  async function switchCart(){
    const version=++cartVersion;
    const r=await window.UNLIVEDLocal?.auth.getSession();
    if(version!==cartVersion)return;
    const id=r?.data?.session?.user?.id||null;
    cartUser=id;STORAGE_KEY=id?'unlived-cart-'+id:'unlived-cart-guest';items=id?[]:read();render();
    drawer.querySelector('.cart-note').textContent='Les prix et l’ouverture des commandes seront confirmés au lancement. '+(id?'Ton panier est enregistré dans ton compte.':'Ton panier reste enregistré sur cet appareil.');
    if(id){try{
      localStorage.removeItem(STORAGE_KEY);
      const response=await fetch('/api/business',{method:'POST',headers:{'Content-Type':'application/json','X-UNLIVED-Request':'1'},body:JSON.stringify({action:'cart_load'})});const result=await response.json();
      if(cartUser!==id||version!==cartVersion)return;
      if(result.error||!Array.isArray(result.data))throw Error();items=result.data;render();
    }catch{if(version===cartVersion)window.UNLIVEDCustomer?.toast('Ton panier n’a pas pu être chargé. Réessaie.');}}
  }
  window.UNLIVEDLocal?.auth.onAuthStateChange(event=>{if(event==='USER_UPDATED')return;clearCart();if(event!=='SIGNED_OUT')switchCart();});switchCart();
  render();
})();
