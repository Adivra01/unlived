(() => {
  const customer = window.UNLIVEDCustomer;
  if (!customer) { document.querySelector('#auth-message').textContent='La connexion est indisponible. Recharge la page pour réessayer.'; return; }
  const { client } = customer;
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const statusLabel = status => ({pending:'À traiter',processing:'En préparation',shipped:'Expédiée',delivered:'Livrée',cancelled:'Annulée',refunded:'Remboursée'}[status] || 'En cours');
  let mode = 'login';
  let currentUser = null;
  let pendingFavoriteHandled=false;
  let dashboardLoading=null;
  let adminRedirecting=false;
  const accountRoles=new Map();
  const accountUrl=new URL('compte.html',location.href).href.split(/[?#]/)[0];
  const message = (selector, text, error = false) => {
    const target = $(selector);
    if (!target) return;
    target.textContent = text;
    target.classList.toggle('is-error', error);
  };
  const setMode = next => {
    mode = next;
    const signup = mode === 'signup';
    $('#auth-title').innerHTML = signup ? 'Le premier pas<br><em>t’appartient.</em>' : 'Reviens à<br><em>ce qui compte.</em>';
    $('#auth-submit span').textContent = signup ? 'Créer mon compte' : 'Me connecter';
    $('#auth-password').autocomplete = signup ? 'new-password' : 'current-password';
    $('#auth-password').minLength = signup ? 8 : 1;
    $('#auth-password').placeholder = signup ? '8 caractères · majuscule, chiffre, symbole' : 'Ton mot de passe';
    $('#name-field').hidden = !signup;
    $('#forgot-password').hidden = signup;
    $('#signup-password-help').hidden = !signup;
    document.querySelectorAll('[data-auth-mode]').forEach(button => {
      const selected = button.dataset.authMode === mode;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    message('#auth-message', '');
  };
  const productMedia = product => product?.product_media?.find(item => item.media_type === 'image')?.url || 'assets/atelier-blanc.webp';
  async function renderFavorites() {
    const grid = $('#account-favorites');
    if (!grid || !currentUser) return;
    const userId=currentUser.id;
    const { data, error } = await client.from('customer_favorites')
      .select('product_id, created_at, products(id, title, slug, collection, price_cents, currency, product_variants(id, color_name, color_slug, color_hex, stock_status, stock_quantity), product_media(url, media_type, alt_text, sort_order))')
      .eq('user_id', currentUser.id).order('created_at', { ascending: false });
    if(currentUser?.id!==userId)return;
    if (error) { grid.innerHTML = '<p class="account-empty">Tes favoris ne sont pas disponibles pour le moment.</p>'; return; }
    const favorites = (data || []).filter(row => row.products);
    $('#favorites-count').textContent = String(favorites.length);
    $('#client-favorites-total').textContent=String(favorites.length);
    grid.innerHTML = favorites.length ? favorites.map(row => {
      const product = row.products;
      const variants=product.product_variants || [];
      const variant = variants[0];
      const unavailable = variants.length>0 && variants.every(item=>item.stock_status === 'out_of_stock' || item.stock_quantity === 0);
      const img = product.product_media?.sort((a,b)=>a.sort_order-b.sort_order).find(item=>item.media_type==='image');
      const href = product.slug==='day-one' && ['blanc','noir'].includes(variant?.color_slug) ? `day-one-${variant.color_slug}.html` : `produit.html?product=${encodeURIComponent(product.slug)}${variant ? `&variant=${encodeURIComponent(variant.color_slug)}` : ''}`;
      const price = 'Prix annoncé au lancement';
      return `<article class="favorite-card"><a class="favorite-card-image" href="${href}"><img src="${escape(img?.url || (product.slug==='day-one-rouge'?'assets/tee-rouge-study.svg':productMedia(product)))}" alt="${escape(img?.alt_text || product.title)}" loading="lazy">${unavailable?'<span class="stock-badge">Épuisé</span>':''}</a><div class="favorite-card-info"><p>${escape(product.collection || 'UNLIVED')}</p><h4><a href="${href}">${escape(product.title)}</a></h4><span>${escape(price)}</span><button class="favorite-remove" type="button" data-favorite-product-id="${escape(product.id)}" aria-pressed="true"><span aria-hidden="true"><svg class="ui-icon icon-heart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg></span> Retirer</button></div></article>`;
    }).join('') : '<div class="account-empty-state"><span><svg class="ui-icon icon-heart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg></span><p>Pas encore de pièce gardée de côté.</p><a class="text-link" href="boutique.html">Découvrir la collection <b></b></a></div>';
    customer.syncButtons();
  }
  async function renderOrders() {
    const list = $('#account-orders');
    if (!list || !currentUser) return;
    const userId=currentUser.id;
    const { data, error } = await client.from('orders').select('id, order_number, status, total_cents, currency, created_at, order_items(id, product_title, variant_name, quantity, unit_price_cents)')
      .eq('customer_id', currentUser.id).order('created_at', { ascending: false });
    if(currentUser?.id!==userId)return;
    if (error) { list.innerHTML = '<p class="account-empty">L’historique n’est pas disponible pour le moment.</p>'; return; }
    const orders=data||[];
    $('#client-orders-total').textContent=String(orders.length);
    $('#client-orders-active').textContent=String(orders.filter(o=>['pending','processing','shipped'].includes(o.status)).length);
    $('#client-recent-orders').innerHTML=orders.length?orders.slice(0,4).map(o=>`<div class="client-recent-order"><div><strong>Commande #${escape(String(o.order_number).padStart(4,'0'))}</strong><small>${escape(new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric'}).format(new Date(o.created_at)))}</small></div><span class="order-status-pill">${escape(statusLabel(o.status))}</span></div>`).join(''):'<p class="account-muted">Aucune commande pour le moment. Tes prochaines commandes et leur suivi apparaîtront ici.</p>';
    list.innerHTML = data?.length ? data.map(order => `<article class="order-card"><div class="order-card-top"><b>Commande #${String(order.order_number).padStart(4,'0')}</b><span class="order-status-pill">${statusLabel(order.status)}</span></div><div class="order-card-lines">${(order.order_items || []).map(item=>`<p><span>${escape(item.product_title)} · ${escape(item.variant_name)} × ${item.quantity}</span><small>${item.unit_price_cents == null ? 'Prix à confirmer' : new Intl.NumberFormat('fr-FR',{style:'currency',currency:order.currency || 'EUR'}).format(item.unit_price_cents/100)}</small></p>`).join('')}</div><div class="order-card-bottom"><time>${new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric'}).format(new Date(order.created_at))}</time><strong>${order.total_cents == null ? 'Total à confirmer' : new Intl.NumberFormat('fr-FR',{style:'currency',currency:order.currency || 'EUR'}).format(order.total_cents/100)}</strong></div></article>`) : '<div class="account-empty-state order-empty"><span>01</span><p>Aucune commande pour le moment.</p><a class="text-link" href="boutique.html">La première commence ici <b></b></a></div>';
  }
  async function showDashboard(user) {
    document.body.classList.add('client-workspace');
    $('.account-sidebar').hidden = false;
    if(currentUser?.id!==user.id){$('#account-favorites').innerHTML='<p class="account-empty">Chargement de tes favoris…</p>';$('#account-orders').innerHTML='<p class="account-empty">Chargement de tes commandes…</p>';$('#favorites-count').textContent='0';}
    currentUser = user;
    $('#auth-panel').hidden = true;
    $('#customer-dashboard').hidden = false;
    const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'toi';
    $('#customer-name').textContent = `${displayName}.`;
    $('#client-sidebar-name').textContent=displayName;
    $('#client-avatar').textContent=displayName[0].toUpperCase();
    $('#customer-email').textContent = user.email || '';
    $('#new-email').value = user.email || '';
    if(!location.hash)history.replaceState(null,'',location.pathname+location.search+'#apercu');
    document.dispatchEvent(new Event('unlived:client-ready'));
    await Promise.all([renderFavorites(), renderOrders()]);
    if(currentUser?.id!==user.id)return;
    const query = new URLSearchParams(location.search);
    const pendingFavorite = query.get('favorite');
    if (pendingFavorite && !pendingFavoriteHandled && !customer.state.favoriteIds.has(pendingFavorite)) {
      pendingFavoriteHandled=true;
      const { error } = await client.from('customer_favorites').upsert({user_id:user.id, product_id:pendingFavorite},{onConflict:'user_id,product_id',ignoreDuplicates:true});
      if (!error) { await customer.loadUser(); await renderFavorites(); customer.toast('La pièce a rejoint tes favoris.'); }
    }
  }
  async function showAuth() {
    document.body.classList.remove('client-workspace');
    document.dispatchEvent(new Event('unlived:client-signed-out'));
    currentUser = null;
    $('.account-sidebar').hidden = true;
    $('#customer-dashboard').hidden = true;
    $('#auth-panel').hidden = false;
    ['#client-favorites-total','#client-orders-total','#client-orders-active','#client-commission'].forEach(id=>$(id).textContent='—');
    $('#client-recent-orders').textContent='Chargement…';
    $('#client-affiliate-summary').textContent='Chargement…';
  }
  document.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.authMode)));
  $('#auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    const submit = $('#auth-submit');
    if (!event.currentTarget.reportValidity()) return;
    submit.disabled = true;
    try {
    message('#auth-message', 'Connexion en cours…');
    const email = $('#auth-email').value.trim();
    const password = $('#auth-password').value;
    let response;
    if (mode === 'signup') {
      response = await client.auth.signUp({email, password, options:{emailRedirectTo:accountUrl,data:{display_name:$('#auth-name').value.trim()}}});
      if (!response.error && !response.data.session) {
        message('#auth-message', response.data.message||'Consulte ta boîte mail pour confirmer ton adresse.');
        submit.disabled = false;
        return;
      }
    } else response = await client.auth.signInWithPassword({email, password});
    submit.disabled = false;
    if (response.error) { message('#auth-message', response.error.message || 'Connexion impossible. Vérifie les informations saisies et réessaie.', true); return; }
    message('#auth-message', '');
    if (response.data.user && await syncSession('SIGNED_IN',response.data.user)) return;
    const destination = new URLSearchParams(location.search).get('return');
    if (destination) {
      const safeUrl = new URL(destination, location.origin);
      if (safeUrl.origin === location.origin && safeUrl.pathname !== location.pathname) location.assign(safeUrl.href);
    }
    } catch { message('#auth-message', 'La connexion est indisponible. Réessaie dans un instant.', true); } finally { submit.disabled=false; }
  });
  $('#resend-verification').addEventListener('click',async()=>{const email=$('#auth-email').value.trim();if(!email||!$('#auth-email').reportValidity()){message('#auth-message','Indique ton adresse e-mail.',true);return;}const button=$('#resend-verification');button.disabled=true;try{const {error}=await client.auth.resendVerification(email);message('#auth-message',error?.message||'Si une confirmation est nécessaire, un nouveau lien sera envoyé.',Boolean(error));}finally{button.disabled=false;}});
  $('#forgot-password').addEventListener('click', async () => {
    const email = $('#auth-email').value.trim();
    if (!email) { message('#auth-message', 'Indique ton adresse e-mail pour recevoir le lien.', true); $('#auth-email').focus(); return; }
    if(!$('#auth-email').reportValidity())return;
    const button=$('#forgot-password');button.disabled=true;
    const { error } = await client.auth.resetPasswordForEmail(email, {redirectTo:accountUrl+'?recovery=1'}).catch(()=>({error:true}));
    button.disabled=false;
    message('#auth-message', error ? (error.message||'La demande n’a pas abouti. Réessaie.') : 'Si cette adresse correspond à un compte, un lien de réinitialisation sera envoyé.', Boolean(error));
  });
  $('#sign-out').addEventListener('click', async () => { const {error}=await client.auth.signOut();if(error){customer.toast('La déconnexion a échoué. Réessaie.');return;} showAuth(); });
  $('#email-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button=event.currentTarget.querySelector('button[type=submit]');button.disabled=true;
    const { error, data } = await client.auth.updateUser({email:$('#new-email').value.trim(),current_password:$('#current-password-email').value}, {emailRedirectTo:accountUrl}).catch(()=>({error:true}));
    button.disabled=false;
    if(!error)$('#current-password-email').value='';
    message('#email-message', error ? (error.message||'La mise à jour n’a pas abouti. Réessaie.') : (data?.message||'Consulte la nouvelle adresse pour confirmer la modification.'), Boolean(error));
  });
  $('#password-form').addEventListener('submit', async event => {
    event.preventDefault();
    if($('#new-password').value!==$('#confirm-password').value){message('#password-message','Les deux mots de passe doivent être identiques.',true);return;}
    const button=event.currentTarget.querySelector('button[type=submit]');button.disabled=true;
    const { error } = await client.auth.updateUser({password:$('#new-password').value,current_password:$('#current-password-change').value}).catch(()=>({error:true}));
    button.disabled=false;
    if (!error) {$('#new-password').value = '';$('#confirm-password').value='';$('#recovery-note').hidden=true;const url=new URL(location.href);url.searchParams.delete('recovery');history.replaceState(null,'',url.pathname+url.search+'#profil');}
    if(!error)$('#current-password-change').value='';
    message('#password-message', error ? (error.message||'Le mot de passe n’a pas pu être modifié.') : 'Ton mot de passe a été mis à jour.', Boolean(error));
  });
  document.addEventListener('click', event => {
    const tab = event.target.closest('.account-tabs a');
    if (tab) { document.querySelectorAll('.account-tabs a').forEach(item=>item.classList.toggle('is-active',item===tab)); }
  });
  window.addEventListener('unlived:favorites-changed', renderFavorites);
  const syncSession = async (event, user) => {
    if(!user){showAuth();return;}
    if(adminRedirecting)return true;
    if(!accountRoles.has(user.id)){
      accountRoles.set(user.id,user.role?Promise.resolve({data:user.role==='admin'?{user_id:user.id}:null,error:null}):client.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle());
    }
    const access=await accountRoles.get(user.id);
    if(access.error){accountRoles.delete(user.id);message('#auth-message','Impossible de vérifier ton compte. Réessaie.',true);return true;}
    if(access.data){
      adminRedirecting=true;
      $('#auth-panel').hidden=true;
      $('#customer-dashboard').hidden=true;
      $('.account-sidebar').hidden=true;
      location.replace('admin.html?v=20261023c#overview');
      return true;
    }
    if(currentUser?.id!==user.id || event==='USER_UPDATED'){
      if(!dashboardLoading){dashboardLoading=showDashboard(user).catch(()=>message('#auth-message','Ton espace ne peut pas être chargé. Réessaie.',true)).finally(()=>{dashboardLoading=null});}
      await dashboardLoading;
    }
    if(event==='PASSWORD_RECOVERY' || new URLSearchParams(location.search).get('recovery')==='1'){
      $('#recovery-note').hidden=false;
      $('#profil').scrollIntoView({block:'start'});$('#new-password').focus({preventScroll:true});
    }
  };
  client.auth.onAuthStateChange((event,session) => {
    window.setTimeout(()=>syncSession(event,session?.user),0);
  });
  client.auth.getSession().then(({data})=>syncSession('INITIAL_SESSION',data.session?.user)).catch(()=>message('#auth-message','La connexion est indisponible.',true));
})();
