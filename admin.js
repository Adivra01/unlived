(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const config = window.UNLIVED_SUPABASE_CONFIG;
  const state = { products: [], orders: [], messages: [], activeMessage: null, view: 'overview', toastTimer: null, preview: false, addingVariant: false };
  const loginScreen = $('#login-screen');
  const app = $('#admin-app');
  const loginMessage = $('#login-message');
  const dialog = $('#product-dialog');
  const form = $('#product-form');
  $('#admin-date').textContent = new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date()).toLocaleUpperCase('fr-FR');

  if (!window.supabase?.createClient || !config?.url || !config?.publishableKey) {
    loginMessage.textContent = 'La connexion Supabase ne s’est pas chargée. Vérifie ta connexion Internet puis recharge la page.';
    return;
  }

  const client = window.supabase.createClient(config.url, config.publishableKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  });
  const html = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money = (cents, currency = 'EUR') => cents == null ? 'À confirmer' : new Intl.NumberFormat('fr-FR', {style:'currency',currency,maximumFractionDigits:2}).format(cents / 100);
  const date = value => new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value));
  const shortDate = value => new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short'}).format(new Date(value));
  const slugify = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const toast = message => {
    const element = $('#toast');
    element.textContent = message;
    element.classList.add('is-visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => element.classList.remove('is-visible'), 3200);
  };
  const statusLabel = status => ({active:'En boutique',draft:'Brouillon',archived:'Archivé',pending:'À traiter',processing:'En préparation',shipped:'Expédiée',delivered:'Livrée',cancelled:'Annulée',refunded:'Remboursée',new:'Nouveau',read:'Lu'}[status] || status);
  const statusClass = status => `status-pill is-${html(status)}`;

  function showApp(user, preview = false) {
    state.preview = preview;
    loginScreen.hidden = true;
    app.hidden = false;
    const email = preview ? 'Aperçu en lecture seule' : (user.email || 'Compte UNLIVED');
    $('#account-email').textContent = email;
    $('#top-email').textContent = email;
    $('#account-avatar').textContent = (email[0] || 'U').toUpperCase();
    $$('.user-pill .account-avatar').forEach(avatar => avatar.textContent = (email[0] || 'U').toUpperCase());
    $('#add-product').hidden = preview;
    $('#account-email').nextElementSibling.textContent = preview ? 'Aperçu public' : 'Administrateur';
    loadData();
  }

  async function authorize(user) {
    const { data, error } = await client.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
    if (error || !data) {
      await client.auth.signOut();
      app.hidden = true;
      loginScreen.hidden = false;
      loginMessage.textContent = error ? 'Impossible de vérifier cet accès. Réessaie dans un instant.' : 'Ce compte n’a pas encore été autorisé comme administrateur.';
      return false;
    }
    showApp(user);
    return true;
  }

  async function loadData() {
    $('#refresh-data')?.classList.add('is-loading');
    if (state.preview) {
      const {data,error}=await client.from('products').select('*, product_variants(*), product_media(*)').eq('status','active').order('created_at',{ascending:false});
      $('#refresh-data')?.classList.remove('is-loading');
      if(error){toast('Impossible de charger l’aperçu du catalogue.');return;}
      state.products=data || [];
      state.orders=[];
      state.messages=[];
      renderAll();
      toast('Aperçu en lecture seule · seules les pièces publiques sont affichées.');
      return;
    }
    const results = await Promise.all([
      client.from('products').select('*, product_variants(*), product_media(*)').order('created_at',{ascending:false}),
      client.from('orders').select('*, order_items(*)').order('created_at',{ascending:false}),
      client.from('contact_messages').select('*').order('created_at',{ascending:false})
    ]);
    const failed = results.find(result => result.error);
    $('#refresh-data')?.classList.remove('is-loading');
    if (failed) {
      console.error('UNLIVED dashboard data error:', failed.error);
      toast('Les données ne sont pas disponibles. Vérifie les règles RLS et l’API Data du projet.');
      return;
    }
    [state.products, state.orders, state.messages] = results.map(result => result.data || []);
    renderAll();
  }

  function totalStock(product) {
    const values = (product.product_variants || []).map(variant => variant.stock_quantity).filter(value => value !== null && value !== undefined);
    return values.length ? values.reduce((sum,value) => sum + value,0) : null;
  }
  function firstMedia(product, variant) {
    const media = product.product_media || [];
    return media.find(item => item.variant_id === variant?.id) || media[0] || null;
  }
  function imageSource(media) {
    if (!media?.url) return 'assets/atelier-blanc.webp';
    return media.url.startsWith('http') || media.url.startsWith('/') ? media.url : media.url;
  }
  function productCell(product) {
    const variant = (product.product_variants || [])[0];
    const media = firstMedia(product,variant);
    return `<div class="piece-cell"><img class="piece-thumb" src="${html(imageSource(media))}" alt="" loading="lazy"><span class="piece-copy"><b>${html(product.title)}</b><small>${html(variant?.color_name || product.category || 'Pièce')} · ${html(product.slug)}</small></span></div>`;
  }

  function renderOverview() {
    const liveProducts = state.products.filter(product => product.status === 'active').length;
    const unread = state.messages.filter(message => message.status === 'new').length;
    const revenue = state.orders.filter(order => !['cancelled','refunded'].includes(order.status)).reduce((sum,order) => sum + (order.total_cents || 0),0);
    $('#metric-revenue').textContent = state.orders.length ? money(revenue) : '—';
    $('#metric-orders').textContent = state.orders.length.toLocaleString('fr-FR');
    $('#metric-products').textContent = state.products.length.toLocaleString('fr-FR');
    $('#metric-live').innerHTML = `<i></i> ${liveProducts} visible${liveProducts > 1 ? 's' : ''} dans la boutique`;
    $('#metric-messages').textContent = unread.toLocaleString('fr-FR');
    $('#nav-product-count').textContent = String(state.products.length).padStart(2,'0');
    $('#nav-order-count').textContent = state.orders.length;
    $('#message-dot').hidden = unread === 0;
    $('#overview-products').innerHTML = state.products.slice(0,4).map(product => {
      const stock = totalStock(product);
      return `<tr><td>${productCell(product)}</td><td><span class="${statusClass(product.status)}">${statusLabel(product.status)}</span></td><td>${stock == null ? '—' : stock}</td><td class="price-cell">${money(product.price_cents,product.currency)}</td></tr>`;
    }).join('') || '<tr><td colspan="4" class="table-empty">Aucune pièce au catalogue.</td></tr>';
    const messages = state.messages.slice(0,3);
    $('#overview-messages').innerHTML = messages.length ? messages.map(message => `<button data-message-id="${message.id}"><span class="inbox-avatar">${html((message.name || 'U')[0].toUpperCase())}</span><span><b>${html(message.name)}</b><small>${html(message.message.slice(0,70))}</small></span><time>${shortDate(message.created_at)}</time></button>`).join('') : '<p class="table-empty">Aucun message pour le moment.</p>';
    renderChart();
    const ready = state.products.some(product => product.price_cents != null) + state.products.some(product => (product.product_variants || []).some(variant => variant.stock_quantity != null)) + state.products.some(product => product.description?.length > 20) + state.products.some(product => product.product_media?.length) + (state.products.length > 0);
    const readyCount = Number(ready);
    const progressLabel = $('#launch-progress-label');
    if (progressLabel) progressLabel.textContent = `${String(readyCount).padStart(2,'0')} / 05`;
    const progressBar = $('.progress-track i');
    if (progressBar) progressBar.style.width = `${readyCount * 20}%`;
  }

  function renderChart() {
    const now = new Date();
    const days = Array.from({length:7},(_,index) => {
      const day = new Date(now);
      day.setDate(now.getDate() - (6-index));
      day.setHours(0,0,0,0);
      const next = new Date(day); next.setDate(day.getDate()+1);
      const amount = state.orders.filter(order => {
        const created = new Date(order.created_at);
        return created >= day && created < next && !['cancelled','refunded'].includes(order.status);
      }).reduce((sum,order) => sum+(order.total_cents || 0),0);
      return {day,amount};
    });
    const max = Math.max(...days.map(item => item.amount),1);
    $('#sales-chart').innerHTML = days.map((item,index) => `<span class="chart-bar ${index===6?'is-today':''}" style="--bar-height:${item.amount ? Math.max(9,item.amount/max*100) : 3}%;--bar-index:${index}" title="${html(shortDate(item.day))} · ${html(money(item.amount))}"></span>`).join('');
    $('#chart-total').textContent = money(days.reduce((sum,item)=>sum+item.amount,0));
    $('#chart-empty').hidden = state.orders.some(order => order.total_cents != null);
    const labels = $$('.chart-days span');
    days.forEach((item,index) => labels[index].textContent = new Intl.DateTimeFormat('fr-FR',{weekday:'short'}).format(item.day).replace('.','').toUpperCase());
  }

  function renderProducts() {
    const query = ($('#product-search')?.value || '').trim().toLowerCase();
    const filter = $('#product-filter')?.value || 'all';
    const products = state.products.filter(product => (filter === 'all' || product.status === filter) && `${product.title} ${product.slug} ${product.collection}`.toLowerCase().includes(query));
    $('#product-count').textContent = `${products.length} pièce${products.length===1?'':'s'}`;
    $('#products-table').innerHTML = products.map(product => {
      const stock = totalStock(product);
      return `<tr><td>${productCell(product)}</td><td>${html(product.collection)}</td><td><span class="${statusClass(product.status)}">${statusLabel(product.status)}</span></td><td>${stock == null ? 'À renseigner' : stock}</td><td class="price-cell">${money(product.price_cents,product.currency)}</td><td>${state.preview?'':`<button class="row-action" data-edit-product="${product.id}">Modifier</button>`}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="table-empty">Aucun résultat dans ce filtre.</td></tr>';
  }

  function renderOrders() {
    const query = ($('#order-search')?.value || '').trim().toLowerCase();
    const filter = $('#order-filter')?.value || 'all';
    const orders = state.orders.filter(order => (filter === 'all' || order.status === filter) && `${order.order_number} ${order.customer_name} ${order.customer_email}`.toLowerCase().includes(query));
    $('#order-count').textContent = `${orders.length} commande${orders.length===1?'':'s'}`;
    $('#orders-table').innerHTML = orders.map(order => `<tr><td><b>#${String(order.order_number).padStart(4,'0')}</b></td><td><span class="piece-copy"><b>${html(order.customer_name)}</b><small>${html(order.customer_email)}</small></span></td><td>${date(order.created_at)}</td><td><select class="order-status" data-order-status="${order.id}" aria-label="Statut de la commande ${order.order_number}">${['pending','processing','shipped','delivered','cancelled','refunded'].map(status=>`<option value="${status}" ${order.status===status?'selected':''}>${statusLabel(status)}</option>`).join('')}</select></td><td class="price-cell">${money(order.total_cents,order.currency)}</td><td><button class="row-action" data-order-detail="${order.id}">Détails</button></td></tr>`).join('') || '<tr><td colspan="6" class="table-empty">Aucune commande enregistrée. La boutique est encore en pré-lancement.</td></tr>';
  }

  function renderCustomers() {
    const people = new Map();
    state.orders.forEach(order => {
      const key = order.customer_email.toLowerCase();
      const entry = people.get(key) || {name:order.customer_name,email:order.customer_email,count:0,total:0,first:order.created_at};
      entry.count++;
      entry.total += order.total_cents || 0;
      if (new Date(order.created_at) < new Date(entry.first)) entry.first = order.created_at;
      people.set(key,entry);
    });
    const query = ($('#customer-search')?.value || '').trim().toLowerCase();
    const rows = [...people.values()].filter(person=>`${person.name} ${person.email}`.toLowerCase().includes(query)).sort((a,b)=>b.total-a.total);
    $('#customer-count').textContent = `${rows.length} personne${rows.length===1?'':'s'}`;
    $('#customers-table').innerHTML = rows.map(person=>`<tr><td><div class="piece-cell"><span class="inbox-avatar">${html(person.name[0]?.toUpperCase() || 'U')}</span><span class="piece-copy"><b>${html(person.name)}</b><small>${html(person.email)}</small></span></div></td><td>${date(person.first)}</td><td>${person.count}</td><td class="price-cell">${money(person.total)}</td></tr>`).join('') || '<tr><td colspan="4" class="table-empty">Les clients apparaîtront après la première commande.</td></tr>';
  }

  function renderMessages() {
    const unread = state.messages.filter(message=>message.status==='new').length;
    $('#inbox-total').textContent = `${state.messages.length} message${state.messages.length===1?'':'s'}`;
    $('#message-dot').hidden = unread === 0;
    $('#messages-list').innerHTML = state.messages.map(message=>`<button class="message-row ${message.status==='new'?'is-new':''} ${state.activeMessage===message.id?'is-selected':''}" data-message-id="${message.id}"><span class="inbox-avatar">${html((message.name||'U')[0].toUpperCase())}</span><span class="message-row-copy"><span class="message-row-name">${html(message.name)}</span><span class="message-row-email">${html(message.email)}</span><span class="message-row-preview">${html(message.message.slice(0,84))}</span></span><time>${shortDate(message.created_at)}</time></button>`).join('') || '<p class="table-empty">Ta boîte de réception est encore calme.</p>';
    renderMessageDetail();
  }

  function renderMessageDetail() {
    const message = state.messages.find(item=>item.id===state.activeMessage);
    if (!message) {
      $('#message-detail').innerHTML = '<div class="message-placeholder"><span>✉</span><h2>Un message, un premier pas.</h2><p>Sélectionne une conversation pour la lire ici.</p></div>';
      return;
    }
    $('#message-detail').innerHTML = `<header class="message-header"><div><h2>${html(message.name)}</h2><a href="mailto:${html(message.email)}">${html(message.email)}</a></div><p>${date(message.created_at)}</p></header><p class="message-body">${html(message.message)}</p><div class="message-actions"><a class="primary-button" href="mailto:${html(message.email)}?subject=${encodeURIComponent('Re: votre message à UNLIVED')}"><span>Répondre par e-mail</span><b>↗</b></a><button class="secondary-button" data-message-action="${message.id}" data-status="archived">Archiver</button><button class="secondary-button" data-delete-message="${message.id}">Supprimer</button></div>`;
  }

  function renderAll() {
    renderOverview();renderProducts();renderOrders();renderCustomers();renderMessages();
  }

  function openView(view) {
    state.view = view;
    $$('.view-panel').forEach(panel=>panel.classList.toggle('is-visible',panel.id===`view-${view}`));
    $$('.nav-item[data-view]').forEach(button=>button.classList.toggle('is-current',button.dataset.view===view));
    $('#topbar-title').textContent = ({overview:'Vue d’ensemble',products:'Produits',orders:'Commandes',customers:'Clients',messages:'Messages',settings:'Configuration'}[view] || 'Administration');
    $('#sidebar').classList.remove('is-open');
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function openProductDialog(product = null) {
    $('#dialog-title').textContent = product ? 'Modifier la pièce' : 'Ajouter une pièce';
    $('#edit-product-id').value = product?.id || '';
    $('#field-title').value = product?.title || '';
    $('#field-collection').value = product?.collection || 'ACTE I: DAY ONE';
    $('#field-category').value = product?.category || 'T-shirt oversize';
    $('#field-description').value = product?.description || '';
    $('#field-price').value = product?.price_cents == null ? '' : (product.price_cents/100).toFixed(2);
    $('#field-status').value = product?.status || 'draft';
    const variants = product?.product_variants || [];
    const variant = variants[0];
    state.addingVariant = false;
    $('#variant-picker-wrap').hidden = variants.length < 2;
    $('#add-variant').hidden = !product;
    $('#add-variant').textContent = '＋ Ajouter une couleur';
    $('#field-variant').innerHTML = variants.map(item=>`<option value="${item.id}">${html(item.color_name)}</option>`).join('');
    $('#field-variant').value = variant?.id || '';
    $('#field-color').value = variant?.color_name || 'Noir';
    $('#field-hex').value = variant?.color_hex || '#0e1520';
    $('#field-sku').value = variant?.sku || '';
    $('#field-stock').value = variant?.stock_quantity ?? '';
    $('#field-media').value = (product?.product_media || []).filter(item=>item.variant_id===variant?.id).sort((a,b)=>a.sort_order-b.sort_order).map(item=>item.url).join('\n');
    $('#dialog-error').textContent = '';
    dialog.showModal();
  }

  async function saveProduct(event) {
    event.preventDefault();
    const submit = $('button[type="submit"]',form);
    submit.disabled = true;
    $('#dialog-error').textContent = '';
    const title = $('#field-title').value.trim();
    const productId = $('#edit-product-id').value;
    const values = {
      title,
      slug: slugify(title),
      collection: $('#field-collection').value.trim(),
      category: $('#field-category').value.trim(),
      description: $('#field-description').value.trim(),
      status: $('#field-status').value,
      price_cents: $('#field-price').value === '' ? null : Math.round(Number($('#field-price').value)*100),
      currency: 'EUR'
    };
    const {data:productData,error:productError} = productId
      ? await client.from('products').update(values).eq('id',productId).select('*').single()
      : await client.from('products').insert(values).select('*').single();
    if (productError) {
      $('#dialog-error').textContent = productError.code === '23505' ? 'Ce nom génère une adresse déjà utilisée. Modifie le nom de la pièce.' : productError.message;
      submit.disabled = false;
      return;
    }
    const existing = state.products.find(item=>item.id===productId);
    const priorVariant = state.addingVariant ? null : existing?.product_variants?.find(variant=>variant.id===$('#field-variant').value);
    const variantValues = {
      product_id:productData.id,
      color_name:$('#field-color').value.trim(),
      color_slug:slugify($('#field-color').value),
      color_hex:$('#field-hex').value,
      sku:$('#field-sku').value.trim() || null,
      stock_quantity:$('#field-stock').value === '' ? null : Number($('#field-stock').value),
      is_available:true
    };
    const variantResult = priorVariant
      ? await client.from('product_variants').update(variantValues).eq('id',priorVariant.id).select('*').single()
      : await client.from('product_variants').insert(variantValues).select('*').single();
    if (variantResult.error) {
      $('#dialog-error').textContent = `Pièce enregistrée, mais variante non enregistrée : ${variantResult.error.message}`;
      submit.disabled = false;
      await loadData();
      return;
    }
    const mediaUrls = [...new Set($('#field-media').value.split('\n').map(url=>url.trim()).filter(Boolean))];
    const priorMedia = (existing?.product_media || []).filter(item=>item.variant_id===priorVariant?.id).sort((a,b)=>a.sort_order-b.sort_order);
    for (const [index,url] of mediaUrls.entries()) {
      const mediaValues = {product_id:productData.id,variant_id:variantResult.data.id,media_type:url.match(/\.mp4(?:\?|$)/i)?'video':'image',url,alt_text:`${title} — ${$('#field-color').value.trim()}`,sort_order:index};
      const mediaResult = priorMedia[index]
        ? await client.from('product_media').update(mediaValues).eq('id',priorMedia[index].id)
        : await client.from('product_media').insert(mediaValues);
      if (mediaResult.error) { toast(`Pièce enregistrée, média à vérifier : ${mediaResult.error.message}`); break; }
    }
    if (priorMedia.length > mediaUrls.length) {
      const obsolete = priorMedia.slice(mediaUrls.length).map(item=>item.id);
      const {error} = await client.from('product_media').delete().in('id',obsolete);
      if (error) toast(`Certains médias retirés du formulaire n’ont pas pu être supprimés : ${error.message}`);
    }
    submit.disabled = false;
    state.addingVariant = false;
    dialog.close();
    toast(productId ? 'La pièce a été mise à jour.' : 'La pièce a été ajoutée au catalogue.');
    await loadData();
  }

  $('#login-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const button = $('.login-submit');
    button.disabled = true;
    loginMessage.textContent = 'Connexion en cours…';
    const {data,error} = await client.auth.signInWithPassword({email:$('#login-email').value.trim(),password:$('#login-password').value});
    button.disabled = false;
    if (error) { loginMessage.textContent = 'Connexion impossible. Vérifie tes identifiants et réessaie.'; return; }
    loginMessage.textContent = '';
    await authorize(data.user);
  });
  $('#preview-dashboard').addEventListener('click',()=>showApp({email:'Aperçu en lecture seule'},true));

  if (new URLSearchParams(window.location.search).get('preview') === '1') {
    showApp({email:'Aperçu en lecture seule'},true);
  } else {
    client.auth.getSession().then(async({data,error})=>{
      if (error) return;
      if (data.session?.user) await authorize(data.session.user);
    });
  }
  client.auth.onAuthStateChange((event)=>{
    if (event === 'SIGNED_OUT') { app.hidden=true;loginScreen.hidden=false; }
  });

  $$('.nav-item[data-view]').forEach(button=>button.addEventListener('click',()=>openView(button.dataset.view)));
  $$('[data-open-view]').forEach(button=>button.addEventListener('click',()=>openView(button.dataset.openView)));
  $('#mobile-menu').addEventListener('click',()=>$('#sidebar').classList.add('is-open'));
  $('#sidebar-close').addEventListener('click',()=>$('#sidebar').classList.remove('is-open'));
  $('#sign-out').addEventListener('click',()=>state.preview?showLoginFromPreview():client.auth.signOut());
  $('#refresh-data').addEventListener('click',loadData);
  $('#add-product').addEventListener('click',()=>openProductDialog());
  $('#add-variant').addEventListener('click',()=>{
    if(state.addingVariant){
      state.addingVariant=false;
      const first=state.products.find(product=>product.id===$('#edit-product-id').value)?.product_variants?.[0];
      $('#field-variant').value=first?.id || '';
      $('#variant-picker-wrap').hidden=(state.products.find(product=>product.id===$('#edit-product-id').value)?.product_variants?.length || 0)<2;
      $('#add-variant').textContent='＋ Ajouter une couleur';
      $('#field-variant').dispatchEvent(new Event('change'));
      return;
    }
    state.addingVariant=true;
    $('#variant-picker-wrap').hidden=true;
    $('#add-variant').textContent='× Annuler cette couleur';
    $('#field-variant').value='';
    $('#field-color').value='';
    $('#field-hex').value='#e8e4dc';
    $('#field-sku').value='';
    $('#field-stock').value='';
    $('#field-media').value='';
    $('#field-color').focus();
  });
  $('#dialog-close').addEventListener('click',()=>dialog.close());
  $('#cancel-product').addEventListener('click',()=>dialog.close());
  form.addEventListener('submit',saveProduct);
  $('#product-search').addEventListener('input',renderProducts);
  $('#product-filter').addEventListener('change',renderProducts);
  $('#field-variant').addEventListener('change',()=>{
    state.addingVariant=false;
    $('#add-variant').textContent='＋ Ajouter une couleur';
    const current=state.products.find(product=>product.id===$('#edit-product-id').value);
    const variant=current?.product_variants?.find(item=>item.id===$('#field-variant').value);
    if(!variant)return;
    $('#field-color').value=variant.color_name;
    $('#field-hex').value=variant.color_hex;
    $('#field-sku').value=variant.sku || '';
    $('#field-stock').value=variant.stock_quantity ?? '';
    $('#field-media').value=(current.product_media || []).filter(item=>item.variant_id===variant.id).sort((a,b)=>a.sort_order-b.sort_order).map(item=>item.url).join('\n');
  });
  $('#order-search').addEventListener('input',renderOrders);
  $('#order-filter').addEventListener('change',renderOrders);
  $('#customer-search').addEventListener('input',renderCustomers);

  function showLoginFromPreview(){state.preview=false;app.hidden=true;loginScreen.hidden=false;}

  document.addEventListener('click',async event=>{
    const edit = event.target.closest('[data-edit-product]');
    if (edit && !state.preview) openProductDialog(state.products.find(product=>product.id===edit.dataset.editProduct));
    const messageButton = event.target.closest('[data-message-id]');
    if (messageButton) {
      state.activeMessage=messageButton.dataset.messageId;
      const message=state.messages.find(item=>item.id===state.activeMessage);
      if (message?.status==='new') await client.from('contact_messages').update({status:'read'}).eq('id',message.id);
      if(message) message.status='read';
      renderOverview();renderMessages();
      if (state.view !== 'messages') openView('messages');
    }
    const orderButton = event.target.closest('[data-order-detail]');
    if (orderButton) {
      const order=state.orders.find(item=>item.id===orderButton.dataset.orderDetail);
      if (order) toast(`Commande #${String(order.order_number).padStart(4,'0')} · ${order.order_items?.map(item=>`${item.quantity} × ${item.product_title}`).join(', ') || 'Détail article à venir'}`);
    }
    const archive = event.target.closest('[data-message-action]');
    if (archive) {
      const {error}=await client.from('contact_messages').update({status:archive.dataset.status}).eq('id',archive.dataset.messageAction);
      if(error) toast('Impossible d’archiver ce message.');
      else {state.messages=state.messages.map(item=>item.id===archive.dataset.messageAction?{...item,status:archive.dataset.status}:item);renderAll();toast('Message archivé.');}
    }
    const remove = event.target.closest('[data-delete-message]');
    if (remove && window.confirm('Supprimer définitivement ce message ?')) {
      const {error}=await client.from('contact_messages').delete().eq('id',remove.dataset.deleteMessage);
      if(error) toast('Impossible de supprimer ce message.');
      else {state.messages=state.messages.filter(item=>item.id!==remove.dataset.deleteMessage);state.activeMessage=null;renderAll();toast('Message supprimé.');}
    }
  });

  document.addEventListener('change',async event=>{
    const select=event.target.closest('[data-order-status]');
    if(!select)return;
    select.disabled=true;
    const {error}=await client.from('orders').update({status:select.value}).eq('id',select.dataset.orderStatus);
    select.disabled=false;
    if(error){toast('Le statut de cette commande n’a pas pu être mis à jour.');return;}
    const order=state.orders.find(item=>item.id===select.dataset.orderStatus);
    if(order)order.status=select.value;
    renderOverview();renderOrders();renderCustomers();toast('Statut de commande mis à jour.');
  });
})();
