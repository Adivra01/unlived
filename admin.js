(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const client = window.UNLIVEDLocal;
  const state = { products: [], orders: [], messages: [], waitlist: [], waitlistFeedback: [], activeMessage: null, view: 'overview', toastTimer: null, preview: false, addingVariant: false };
  const loginScreen = $('#login-screen');
  const app = $('#admin-app');
  const loginMessage = $('#login-message');
  const dialog = $('#product-dialog');
  const form = $('#product-form');
  const currentLocale=()=>window.UNLIVEDI18n?.language||'fr';
  const renderAdminDate=()=>{$('#admin-date').textContent=new Intl.DateTimeFormat(currentLocale(),{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date()).toLocaleUpperCase(currentLocale());};
  renderAdminDate();
  window.addEventListener('unlived:language',renderAdminDate);

  if (!client) {loginMessage.textContent='Le serveur local est indisponible. Recharge la page.';return;}
  const html = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money = (cents, currency = 'EUR') => cents == null ? 'À confirmer' : new Intl.NumberFormat(currentLocale(), {style:'currency',currency,maximumFractionDigits:2}).format(cents / 100);
  const date = value => new Intl.DateTimeFormat(currentLocale(),{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value));
  const shortDate = value => new Intl.DateTimeFormat(currentLocale(),{day:'2-digit',month:'short'}).format(new Date(value));
  const slugify = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const toast = message => {
    const element = $('#toast');
    element.textContent = message;
    element.classList.add('is-visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => element.classList.remove('is-visible'), 3200);
  };
  const statusLabel = status => ({active:'En boutique',draft:'Brouillon',archived:'Archivé',pending:'À traiter',processing:'En préparation',shipped:'Expédiée',delivered:'Livrée',cancelled:'Annulée',refunded:'Remboursée',new:'Nouveau',read:'Lu',out_of_stock:'Épuisé',in_stock:'Disponible',unknown:'À confirmer'}[status] || status);
  const statusClass = status => `status-pill is-${html(status)}`;

  function showApp(user, preview = false) {
    state.preview = preview;
    state.products=[];state.orders=[];state.messages=[];state.waitlist=[];state.waitlistFeedback=[];state.activeMessage=null;
    renderAll();
    loginScreen.hidden = true;
    app.hidden = false;
    const email = preview ? 'Aperçu en lecture seule' : (user.email || 'Compte UNLIVED');
    $('#account-email').textContent = email;
    $('#account-avatar').textContent = (email[0] || 'U').toUpperCase();
    $$('.user-pill .account-avatar').forEach(avatar => avatar.textContent = (email[0] || 'U').toUpperCase());
    $('#add-product').hidden = preview;
    $('#account-email').nextElementSibling.textContent = preview ? 'Aperçu public' : 'Administrateur';
    $('#preview-banner').hidden = !preview;
    $('#sign-out').setAttribute('aria-label', preview ? 'Quitter l’aperçu' : 'Se déconnecter');
    const requestedView=location.hash.slice(1);
    if(['overview','products','orders','customers','waitlist','messages','settings','analytics','marketing','affiliates','affiliate-applications','affiliate-detail','affiliate-withdrawals','affiliate-settings','requests'].includes(requestedView))openView(requestedView);
    loadData();
  }

  let accessVersion=0,authorizedUser=null,clientRedirecting=false;
  async function authorize(user) {
    const version=++accessVersion;
    if(!user)return false;
    if(user.role==='client'){app.hidden=true;loginScreen.hidden=true;if(!clientRedirecting){clientRedirecting=true;location.replace('compte.html#apercu');}return false;}
    if(user.role==='admin'){if(authorizedUser===user.id&&!app.hidden&&!state.preview)return true;authorizedUser=user.id;showApp(user);return true;}
    const { data, error } = await client.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
    if(version!==accessVersion)return false;
    if (error || !data) {
      app.hidden = true;
      loginScreen.hidden = false;
      loginMessage.textContent = error ? 'Impossible de vérifier cet accès. Réessaie dans un instant.' : 'Ce compte n’a pas encore été autorisé comme administrateur.';
      return false;
    }
    showApp(user);
    return true;
  }

  async function loadAllWaitlist(table, columns) {
    const all=[];let offset=0;
    while(true){
      const result=await client.from(table).select(columns).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);
      if(result.error)return result;
      all.push(...(result.data||[]));
      if(!result.data?.length)return {data:all,error:null};
      offset+=result.data.length;
    }
  }

  async function loadData() {
    if(state.loading)return;state.loading=true;
    const requestPreview=state.preview;const catalogRevision=state.catalogRevision||0;
    try {
    $('#refresh-data')?.classList.add('is-loading');
    $('#refresh-data').disabled=true;
    $('#data-status').hidden=true;
    $('#connection-label').textContent='Actualisation…';
    if (state.preview) {
      const {data,error}=await client.from('products').select('*, product_variants(*), product_media(*)').eq('status','active').order('created_at',{ascending:false});
      $('#refresh-data')?.classList.remove('is-loading');
    $('#refresh-data').disabled=false;
      if(error){showDataError();return;}
      if(requestPreview!==state.preview || app.hidden)return;
      state.products=data || [];
      state.orders=[];
      state.messages=[];
      state.waitlist=[];
      state.waitlistFeedback=[];
      renderAll();
      $('#connection-label').textContent='Catalogue actualisé';
      $('#connection-detail').textContent='Aperçu · lecture seule';
      return;
    }
    const results = await Promise.all([
      client.from('products').select('*, product_variants(*), product_media(*)').order('created_at',{ascending:false}),
      client.from('orders').select('*, order_items(*)').order('created_at',{ascending:false}),
      client.from('contact_messages').select('*').order('created_at',{ascending:false}),
      loadAllWaitlist('launch_waitlist','id,first_name,last_name,email,phone,concept_slug,selected_size,feedback_token,created_at,consent_at,utm_source,utm_campaign,utm_content'),
      loadAllWaitlist('launch_waitlist_feedback','id,feedback_token,interest_level,what_appealed,what_to_improve,created_at')
    ]);
    const failed = results.find(result => result.error);
    $('#refresh-data')?.classList.remove('is-loading');
    $('#refresh-data').disabled=false;
    if (failed) {
      console.error('UNLIVED dashboard data error:', failed.error);
      showDataError();
      return;
    }
    if(requestPreview!==state.preview || app.hidden)return;
    $('#connection-label').textContent='Données actualisées';
    $('#connection-detail').textContent='À '+new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(new Date());
    const currentProducts=state.products;
    [state.products, state.orders, state.messages, state.waitlist, state.waitlistFeedback] = results.map(result => result.data || []);
    if(catalogRevision!==(state.catalogRevision||0))state.products=currentProducts;
    renderAll();
    }catch{showDataError();}finally{state.loading=false;$('#refresh-data').disabled=false;$('#refresh-data').classList.remove('is-loading');}
  }

  function showDataError() {
    $('#connection-label').textContent='Connexion indisponible';
    $('#data-status').hidden=false;
    $('#data-status').textContent='Les données n’ont pas pu être actualisées. Les informations affichées peuvent dater de ta dernière visite. Utilise le bouton Actualiser pour réessayer.';
  }

  function totalStock(product) {
    const values = (product.product_variants || []).map(variant => variant.stock_quantity).filter(value => value !== null && value !== undefined);
    return values.length ? values.reduce((sum,value) => sum + value,0) : null;
  }
  function stockSummary(product) {
    const variants = product.product_variants || [];
    const soldOut = variants.filter(variant => variant.stock_status === 'out_of_stock' || variant.stock_quantity === 0);
    const quantity = totalStock(product);
    if (soldOut.length === variants.length && variants.length) return `<span class="status-pill is-out-of-stock">Toutes épuisées</span>`;
    return `${quantity == null ? 'À renseigner' : quantity}${soldOut.length ? ` <span class="stock-inline-alert">· ${soldOut.length} épuisée${soldOut.length > 1 ? 's' : ''}</span>` : ''}`;
  }
  function firstMedia(product, variant) {
    const media = (product.product_media || []).filter(item=>item.media_type==='image').sort((a,b)=>a.sort_order-b.sort_order);
    return media.find(item => item.variant_id === variant?.id) || media[0] || null;
  }
  function imageSource(media) {
    if (!media?.url) return 'assets/atelier-blanc.webp';
    return media.url.startsWith('http') || media.url.startsWith('/') ? media.url : media.url;
  }
  function productCell(product, selectedVariant = null) {
    const variant = selectedVariant || (product.product_variants || [])[0];
    const media = firstMedia(product,variant);
    return `<div class="piece-cell"><img class="piece-thumb" src="${html(imageSource(media))}" alt="" loading="lazy"><span class="piece-copy"><b>${html(product.title)}</b><small>${html(variant?.color_name || product.category || 'Pièce')} · ${html(product.slug)}</small></span></div>`;
  }

  function renderOverview() {
    const liveProducts = state.products.filter(product => product.status === 'active').reduce((n,p)=>n+Math.max(1,(p.product_variants||[]).length),0);
    const unread = state.messages.filter(message => message.status === 'new').length;
    $('#nav-product-count').textContent = String(liveProducts).padStart(2,'0');
    $('#nav-order-count').textContent = state.orders.length;
    $('#message-dot').hidden = unread === 0;
  }

  function renderProducts() {
    const query = ($('#product-search')?.value || '').trim().toLowerCase();
    const filter = $('#product-filter')?.value || 'all';
    const stockFilter=$('#stock-filter').value;
    const products = state.products.filter(product => {
      const variants=product.product_variants || [];
      const soldOut=v=>v.stock_status==='out_of_stock'||v.stock_quantity===0;
      const stockMatch=stockFilter==='all'||(stockFilter==='out_of_stock'&&variants.some(soldOut))||(stockFilter==='unknown'&&(!variants.length||variants.some(v=>v.stock_quantity==null&&v.stock_status==='unknown')))||(stockFilter==='in_stock'&&variants.length&&variants.every(v=>!soldOut(v)&&(v.stock_status==='in_stock'||v.stock_quantity>0)));
      return stockMatch&&(filter==='all'||product.status===filter)&&`${product.title} ${product.slug} ${product.collection}`.toLowerCase().includes(query);
    });
    const rows=products.flatMap(product=>((product.product_variants||[]).length?product.product_variants:[null]).map(variant=>({product,variant})));
    $('#product-count').textContent = `${rows.length} pièce${rows.length===1?'':'s'}`;
    $('#products-table').innerHTML = rows.map(({product,variant}) => {
      const availability=variant?.stock_status==='out_of_stock'||variant?.stock_quantity===0?'Épuisé':variant?.stock_status==='in_stock'?'Disponible'+(variant.stock_quantity==null?'':` · ${variant.stock_quantity}`):variant?.stock_quantity==null?'À confirmer':String(variant.stock_quantity);
      return `<tr><td>${productCell(product,variant)}</td><td>${html(product.collection)}</td><td><span class="${statusClass(product.status)}">${statusLabel(product.status)}</span></td><td>${availability}</td><td class="price-cell">${product.price_cents!=null?money(product.price_cents,product.currency):product.planned_price_cents!=null?money(product.planned_price_cents,product.currency)+' · prévu':'À confirmer'}</td><td>${state.preview?'':`<button class="row-action" data-edit-product="${product.id}" data-edit-variant="${variant?.id||''}">Modifier</button>`}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="table-empty">Aucun résultat dans ce filtre.</td></tr>';
  }

  function renderOrders() {
    if(state.preview){$('#orders-table').innerHTML='<tr><td colspan="6" class="table-empty">Les commandes sont privées. Connecte-toi pour les consulter.</td></tr>';$('#order-count').textContent='Accès privé';return;}
    const query = ($('#order-search')?.value || '').trim().toLowerCase();
    const filter = $('#order-filter')?.value || 'all';
    const orders = state.orders.filter(order => (filter === 'all' || order.status === filter) && `${order.order_number} ${order.customer_name} ${order.customer_email}`.toLowerCase().includes(query));
    $('#order-count').textContent = `${orders.length} commande${orders.length===1?'':'s'}`;
    $('#orders-table').innerHTML = orders.map(order => `<tr><td><b>#${String(order.order_number).padStart(4,'0')}</b></td><td><span class="piece-copy"><b>${html(order.customer_name)}</b><small>${html(order.customer_email)}</small></span></td><td>${date(order.created_at)}</td><td><select class="order-status" data-order-status="${order.id}" aria-label="Statut de la commande ${order.order_number}">${['pending','processing','shipped','delivered','cancelled','refunded'].map(status=>`<option value="${status}" ${order.status===status?'selected':''}>${statusLabel(status)}</option>`).join('')}</select></td><td class="price-cell">${money(order.total_cents,order.currency)}</td><td><button class="row-action" data-order-detail="${order.id}">Détails</button></td></tr>`).join('') || '<tr><td colspan="6" class="table-empty">Aucune commande enregistrée. La boutique est encore en pré-lancement.</td></tr>';
  }

  document.addEventListener("unlived:users",()=>renderCustomers());
  function renderCustomers() {
    if(state.preview){$('#customers-table').innerHTML='<tr><td colspan="4" class="table-empty">Les données clients sont privées. Connecte-toi pour les consulter.</td></tr>';$('#customer-count').textContent='Accès privé';return;}
    const people = new Map();
    (window.UNLIVEDRegisteredUsers||[]).forEach(u=>people.set(u.email.toLowerCase(),{name:u.user_metadata?.display_name||u.email,email:u.email,count:0,total:0,first:u.created_at}));
    state.orders.forEach(order => {
      const key = order.customer_email.toLowerCase();
      const entry = people.get(key) || {name:order.customer_name,email:order.customer_email,count:0,total:0,first:order.created_at};
      entry.count++;
      if(!['cancelled','refunded'].includes(order.status))entry.total += order.total_cents || 0;
      if (new Date(order.created_at) < new Date(entry.first)) entry.first = order.created_at;
      people.set(key,entry);
    });
    const query = ($('#customer-search')?.value || '').trim().toLowerCase();
    const rows = [...people.values()].filter(person=>`${person.name} ${person.email}`.toLowerCase().includes(query)).sort((a,b)=>b.total-a.total);
    $('#customer-count').textContent = `${rows.length} personne${rows.length===1?'':'s'}`;
    $('#customers-table').innerHTML = rows.map(person=>`<tr><td><div class="piece-cell"><span class="inbox-avatar">${html(person.name[0]?.toUpperCase() || 'U')}</span><span class="piece-copy"><b>${html(person.name)}</b><small>${html(person.email)}</small></span></div></td><td>${date(person.first)}</td><td>${person.count}</td><td class="price-cell">${money(person.total)}</td></tr>`).join('') || '<tr><td colspan="4" class="table-empty">Aucun compte client enregistré.</td></tr>';
  }

  function filteredWaitlist() {
    const query=($('#waitlist-search')?.value||'').trim().toLowerCase();
    const filter=$('#waitlist-filter')?.value||'all', response=$('#waitlist-response')?.value||'all';
    const answered=new Set(state.waitlistFeedback.map(item=>item.feedback_token));
    return state.waitlist.filter(item=>(filter==='all'||item.concept_slug===filter)&&
      (response==='all'||answered.has(item.feedback_token)===(response==='answered'))&&
      `${item.first_name} ${item.last_name} ${item.email} ${item.phone||''}`.toLowerCase().includes(query));
  }

  function renderWaitlist() {
    if(state.preview){$('#waitlist-table').innerHTML='<tr><td colspan="5" class="table-empty">Les inscriptions et coordonnées sont privées. Connecte-toi comme administrateur.</td></tr>';$('#waitlist-count').textContent='Accès privé';$('#waitlist-summary').replaceChildren();return;}
    const labels={'day-one-blanc':'DAY ONE · Blanc','day-one-noir':'DAY ONE · Noir','day-one-rouge':'LE DÉCLIC · Rouge','day-one':'DAY ONE · T-shirt','in-between-pull':'IN-BETWEEN · Pull','do-it-afraid-hoodie':'DO IT AFRAID · Hoodie'};
    const feedbackByToken=new Map(state.waitlistFeedback.map(entry=>[entry.feedback_token,entry]));
    const counts=Object.fromEntries(Object.keys(labels).map(key=>[key,state.waitlist.filter(item=>item.concept_slug===key).length]));
    $('#nav-waitlist-count').textContent=String(state.waitlist.length);
    $('#waitlist-summary').innerHTML=Object.entries(labels).map(([key,label])=>`<article class="waitlist-stat"><span>${html(label)}</span><strong>${counts[key]}</strong><small>${counts[key]===1?'inscription':'inscriptions'}</small></article>`).join('');
    const rows=filteredWaitlist();
    $('#waitlist-count').textContent=`${rows.length} inscription${rows.length===1?'':'s'}`;
    $('#waitlist-table').innerHTML=rows.map(item=>{
      const feedback=feedbackByToken.get(item.feedback_token);
      const contact=`<a href="mailto:${encodeURIComponent(item.email)}">${html(item.email)}</a>${item.phone?`<small><a href="tel:${encodeURIComponent(item.phone)}">${html(item.phone)}</a></small>`:'<small>Pas de téléphone</small>'}`;
      const answer=feedback?`<details class="waitlist-feedback"><summary>${feedback.interest_level}/5 · Lire l’avis</summary><small>Reçu le ${date(feedback.created_at)}</small><p><b>Ce qui a plu</b>${html(feedback.what_appealed)}</p><p><b>À améliorer</b>${html(feedback.what_to_improve)}</p></details>`:'<span class="waitlist-no-feedback">Avis non envoyé</span>';
      return `<tr><td><div class="piece-copy"><b>${html(item.first_name)} ${html(item.last_name)}</b><small>Consentement · ${date(item.consent_at||item.created_at)}</small></div></td><td class="waitlist-contact">${contact}</td><td><span class="waitlist-concept-label">${html(labels[item.concept_slug]||item.concept_slug)}</span><small class="waitlist-attribution">Taille ${html(item.selected_size||"non renseignée")}</small></td><td>${date(item.created_at)}<small class="waitlist-attribution">${html([item.utm_source,item.utm_campaign].filter(Boolean).join(' · ')||'Site')}</small></td><td>${answer}</td></tr>`;
    }).join('')||'<tr><td colspan="5" class="table-empty">Aucune inscription ne correspond à cette sélection.</td></tr>';
  }

  function exportWaitlist(mode='combined') {
    if(state.preview){toast('Connecte-toi comme administrateur pour exporter.');return;}
    const feedbackByToken=new Map(state.waitlistFeedback.map(item=>[item.feedback_token,item]));
    const selected=filteredWaitlist().filter(item=>mode!=='feedback'||feedbackByToken.has(item.feedback_token));
    if(!selected.length){toast('Aucune donnée à exporter pour ces filtres.');return;}
    const contacts=['Prénom','Nom','E-mail','Téléphone','Concept','Taille','Inscription UTC','Consentement UTC','Source','Campagne','Contenu campagne'];
    const feedbackColumns=['Réponse reçue','Intérêt / 5','Ce qui a attiré la personne','Améliorations recommandées','Réponse UTC'];
    const headers=mode==='contacts'?contacts:[...contacts,...feedbackColumns];
    const rows=selected.map(item=>{
      const reply=feedbackByToken.get(item.feedback_token);
      const values=[item.first_name,item.last_name,item.email,item.phone||'',item.concept_slug,item.selected_size||'',item.created_at,item.consent_at||'',item.utm_source||'',item.utm_campaign||'',item.utm_content||''];
      return mode==='contacts'?values:[...values,reply?'Oui':'Non',reply?.interest_level??'',reply?.what_appealed||'',reply?.what_to_improve||'',reply?.created_at||''];
    });
    // CSV formula protection for customer-entered text (including phone numbers).
    const cell=value=>{let text=String(value??'');if(/^[\s\u0000-\u001f]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"'};
    const csv=[headers,...rows].map(row=>row.map(cell).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`unlived-${mode}-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast(`${selected.length} ligne(s) exportée(s). Import compatible Excel et Google Sheets.`);
  }

  function renderMessages() {
    if(state.preview){$('#messages-list').innerHTML='<p class="table-empty">Les messages sont accessibles aux administrateurs connectés.</p>';$('#inbox-total').textContent='Accès privé';renderMessageDetail();return;}
    const unread = state.messages.filter(message=>message.status==='new').length;
    $('#inbox-total').textContent = `${state.messages.length} message${state.messages.length===1?'':'s'}`;
    $('#message-dot').hidden = unread === 0;
    const query=($('#message-search').value||'').trim().toLowerCase();
    const filter=$('#message-filter').value;
    const messages=state.messages.filter(m=>(filter==='all'||m.status===filter)&&`${m.name} ${m.email} ${m.message}`.toLowerCase().includes(query));
    $('#messages-list').innerHTML = messages.map(message=>`<button class="message-row ${message.status==='new'?'is-new':''} ${state.activeMessage===message.id?'is-selected':''}" data-message-id="${message.id}"><span class="inbox-avatar">${html((message.name||'U')[0].toUpperCase())}</span><span class="message-row-copy"><span class="message-row-name">${html(message.name)}</span><span class="message-row-email">${html(message.email)}</span><span class="message-row-preview">${html(message.message.slice(0,84))}</span></span><time>${shortDate(message.created_at)}</time></button>`).join('') || '<p class="table-empty">Aucun message dans cette sélection.</p>';
    renderMessageDetail();
  }

  function renderMessageDetail() {
    const message = state.messages.find(item=>item.id===state.activeMessage);
    if (!message) {
      $('#message-detail').innerHTML = '<div class="message-placeholder"><span>✉</span><h2>Un message, un premier pas.</h2><p>Sélectionne une conversation pour la lire ici.</p></div>';
      return;
    }
    $('#message-detail').innerHTML = `<header class="message-header"><div><h2>${html(message.name)}</h2><a href="mailto:${html(message.email)}">${html(message.email)}</a></div><p>${date(message.created_at)}</p></header><p class="message-body">${html(message.message)}</p><div class="message-actions"><a class="primary-button" href="mailto:${html(message.email)}?subject=${encodeURIComponent('Re: votre message à UNLIVED')}"><span>Répondre par e-mail</span><b></b></a><button class="secondary-button" data-message-action="${message.id}" data-status="archived">Archiver</button><button class="secondary-button" data-delete-message="${message.id}">Supprimer</button></div>`;
  }

  function renderAll() {
    document.dispatchEvent(new CustomEvent("unlived:admin-ready",{detail:{preview:state.preview}}));renderOverview();renderProducts();renderOrders();renderCustomers();renderWaitlist();renderMessages();
    if(state.preview){
      ['#nav-order-count'].forEach(id=>$(id).textContent='—');
      $('#orders-table').innerHTML='<tr><td colspan="6" class="table-empty">Les commandes sont privées. Connecte-toi pour les consulter.</td></tr>';
      $('#customers-table').innerHTML='<tr><td colspan="4" class="table-empty">Les données clients sont privées. Connecte-toi pour les consulter.</td></tr>';
      $('#waitlist-table').innerHTML='<tr><td colspan="5" class="table-empty">Les inscriptions et avis sont privés aux administrateurs.</td></tr>';
      $('#messages-list').innerHTML='<p class="table-empty">Les messages sont accessibles aux administrateurs connectés.</p>';
      $('#inbox-total').textContent='Accès privé';$('#order-count').textContent='Accès privé';$('#customer-count').textContent='Accès privé';$('#waitlist-count').textContent='Accès privé';
    }
  }

  function openView(view) {
    if(!['overview','products','orders','customers','waitlist','messages','settings','analytics','marketing','affiliates','affiliate-applications','affiliate-detail','affiliate-withdrawals','affiliate-settings','requests'].includes(view))return;
    state.view = view;
    history.replaceState(null,'',location.pathname+location.search+'#'+view);
    $$('.view-panel').forEach(panel=>panel.classList.toggle('is-visible',panel.id===`view-${view}`));
    $$('.nav-item[data-view]').forEach(button=>{
      const selected=button.dataset.view===view&&(view!=='waitlist'||(button.dataset.waitlistResponse||'all')===$('#waitlist-response').value);
      button.classList.toggle('is-current',selected);
      if(selected){button.setAttribute('aria-current','page');const group=button.closest('.sidebar-group');if(group)group.open=true;}else button.removeAttribute('aria-current');
    });
    $$('.sidebar-group').forEach(group=>group.classList.toggle('has-current',Boolean(group.querySelector('.is-current'))));
    setSidebar(false);
    window.scrollTo({top:0,behavior:'instant'});
    const heading=$(`#view-${view} h1`);heading.tabIndex=-1;heading.focus({preventScroll:true});
  }

  function openProductDialog(product = null, variantId = null) {
    $('#dialog-title').textContent = product ? 'Modifier la pièce' : 'Ajouter une pièce';
    $('#edit-product-id').value = product?.id || '';
    $('#field-title').value = product?.title || '';
    $('#field-collection').value = product?.collection || 'ACTE I: DAY ONE';
    $('#field-category').value = product?.category || 'T-shirt oversize';
    $('#field-description').value = product?.description || '';
    $('#field-planned-price').value = product?.planned_price_cents == null ? '' : (product.planned_price_cents/100).toFixed(2);
    $('#field-price').value = product?.price_cents == null ? '' : (product.price_cents/100).toFixed(2);
    $('#field-status').value = product?.status || 'draft';
    const variants = product?.product_variants || [];
    const variant = variants.find(item=>item.id===variantId) || variants[0];
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
    $('#field-stock-status').value = variant?.stock_status || (variant?.stock_quantity === 0 ? 'out_of_stock' : variant?.stock_quantity > 0 ? 'in_stock' : 'unknown');
    $('#field-media').value = (product?.product_media || []).filter(item=>item.variant_id===variant?.id).sort((a,b)=>a.sort_order-b.sort_order).map(item=>item.url).join('\n');
    $('#dialog-error').textContent = '';
    dialog.showModal();
  }

  async function saveProduct(event) {
    event.preventDefault();
    if(state.preview||state.savingProduct)return;
    state.savingProduct=true;
    const submit = $('button[type="submit"]',form);
    submit.disabled = true;
    const submitLabel=submit.querySelector('span'),originalLabel=submitLabel?.textContent;
    if(submitLabel)submitLabel.textContent='Enregistrement…';
    $('#dialog-error').textContent = '';
    try {
    if(!form.reportValidity()){submit.disabled=false;return;}
    const title = $('#field-title').value.trim();
    const productId = $('#edit-product-id').value;
    const mediaInput=$('#field-media').value.split('\n').map(v=>v.trim()).filter(Boolean);
    if(!title || mediaInput.some(v=>{try{return !(v.startsWith('assets/')||v.startsWith('https://'))}catch{return true}})){
      $('#dialog-error').textContent='Indique un nom et des liens de médias valides (HTTPS ou fichiers du site).';submit.disabled=false;return;
    }
    const values = {
      title,
      slug: state.products.find(item=>item.id===productId)?.slug || slugify(title),
      collection: $('#field-collection').value.trim(),
      category: $('#field-category').value.trim(),
      description: $('#field-description').value.trim(),
      status: $('#field-status').value,
      price_cents: $('#field-price').value === '' ? null : Math.round(Number($('#field-price').value)*100),
      planned_price_cents: $('#field-planned-price').value === '' ? null : Math.round(Number($('#field-planned-price').value)*100),
      currency: 'EUR'
    };
    const saved=await window.UNLIVEDBusiness.request('product_save',{
      product_id:productId||null,product:values,
      variant_id:state.addingVariant?null:($('#field-variant').value||null),
      variant:{color_name:$('#field-color').value.trim(),color_slug:slugify($('#field-color').value),color_hex:$('#field-hex').value,sku:$('#field-sku').value.trim()||null,stock_quantity:$('#field-stock').value===''?null:Number($('#field-stock').value),stock_status:$('#field-stock-status').value,is_available:true},
      media:[...new Set(mediaInput)]
    });
    state.catalogRevision=(state.catalogRevision||0)+1;
    const index=state.products.findIndex(p=>p.id===saved.id);
    if(index<0)state.products.unshift(saved);else state.products[index]=saved;
    state.addingVariant=false;
    renderProducts();renderOverview();
    document.dispatchEvent(new CustomEvent('unlived:catalog-updated',{detail:saved}));
    dialog.close();
    toast(productId?'La pièce a été mise à jour.':'La pièce a été ajoutée au catalogue.');
    } catch(error) { $('#dialog-error').textContent=error.message||'L’enregistrement a été interrompu. Réessaie.'; } finally {submit.disabled=false;state.savingProduct=false;if(submitLabel)submitLabel.textContent=originalLabel;}
  }

  $('#login-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const button = $('.login-submit');
    button.disabled = true;
    loginMessage.textContent = 'Connexion en cours…';
    const {data,error} = await client.auth.signInWithPassword({email:$('#login-email').value.trim(),password:$('#login-password').value});
    button.disabled = false;
    if (error) { loginMessage.textContent = error.message||'Connexion impossible. Vérifie tes identifiants et réessaie.'; return; }
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
  client.auth.onAuthStateChange((event,session)=>{
    if(event==='USER_UPDATED'&&session?.user){$('#account-email').textContent=session.user.email;$('#account-avatar').textContent=session.user.email[0].toUpperCase();}
    if(['SIGNED_IN','USER_UPDATED'].includes(event)&&session?.user)authorize(session.user);
    if (event === 'SIGNED_OUT') { accessVersion++;authorizedUser=null;if(dialog.open)dialog.close();form.reset();app.hidden=true;loginScreen.hidden=false;state.products=[];state.orders=[];state.messages=[];state.waitlist=[];state.waitlistFeedback=[];state.activeMessage=null;setSidebar(false); }
  });

  $$('.nav-item[data-view]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.view==='waitlist'){$('#waitlist-response').value=button.dataset.waitlistResponse||'all';renderWaitlist();}openView(button.dataset.view);}));
  $$('[data-open-view]').forEach(button=>button.addEventListener('click',()=>openView(button.dataset.openView)));
  function setSidebar(open){
    $('#sidebar').classList.toggle('is-open',open);
    $('#sidebar-backdrop').hidden=!open;
    $('#mobile-menu').setAttribute('aria-expanded',String(open));
    $('#sidebar').inert=matchMedia('(max-width:800px)').matches&&!open;
    document.body.style.overflow=open?'hidden':'';
    if(open)$('#sidebar-close').focus();
  }
  $('#mobile-menu').addEventListener('click',()=>setSidebar(true));
  $('#sidebar-close').addEventListener('click',()=>{setSidebar(false);$('#mobile-menu').focus()});
  $('#sidebar-backdrop').addEventListener('click',()=>{setSidebar(false);$('#mobile-menu').focus()});
  document.addEventListener('keydown',event=>{
    if(!$('#sidebar').classList.contains('is-open'))return;
    if(event.key==='Escape'){setSidebar(false);$('#mobile-menu').focus()}
    if(event.key==='Tab'){
      const elements=$$('a,button', $('#sidebar')).filter(el=>el.offsetParent!==null),first=elements[0],last=elements.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    }
  });
  matchMedia('(max-width:800px)').addEventListener('change',()=>setSidebar(false));setSidebar(false);
  $('#preview-sign-in').addEventListener('click',showLoginFromPreview);
  $('#order-dialog-close').addEventListener('click',()=>$('#order-dialog').close());
  $('#stock-filter').addEventListener('change',renderProducts);
  $('#message-search').addEventListener('input',renderMessages);
  $('#message-filter').addEventListener('change',renderMessages);
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
    $('#field-stock-status').value='unknown';
    $('#field-media').value='';
    $('#field-color').focus();
  });
  $('#dialog-close').addEventListener('click',()=>dialog.close());
  $('#cancel-product').addEventListener('click',()=>dialog.close());
  form.addEventListener('submit',saveProduct);
  $('#product-search').addEventListener('input',renderProducts);
  $('#product-filter').addEventListener('change',renderProducts);
  $('#field-stock-status').addEventListener('change',()=>{if($('#field-stock-status').value==='in_stock'&&$('#field-stock').value==='0')$('#field-stock').value='';});
  $('#field-stock').addEventListener('change',()=>{if($('#field-stock').value==='0')$('#field-stock-status').value='out_of_stock';});
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
    $('#field-stock-status').value=variant.stock_status || (variant.stock_quantity === 0 ? 'out_of_stock' : variant.stock_quantity > 0 ? 'in_stock' : 'unknown');
    $('#field-media').value=(current.product_media || []).filter(item=>item.variant_id===variant.id).sort((a,b)=>a.sort_order-b.sort_order).map(item=>item.url).join('\n');
  });
  $('#order-search').addEventListener('input',renderOrders);
  $('#order-filter').addEventListener('change',renderOrders);
  $('#customer-search').addEventListener('input',renderCustomers);
  $('#waitlist-search').addEventListener('input',renderWaitlist);
  $('#waitlist-filter').addEventListener('change',renderWaitlist);
  $('#waitlist-export').addEventListener('click',()=>exportWaitlist('combined'));
  $('#waitlist-export-contacts').addEventListener('click',()=>exportWaitlist('contacts'));
  $('#waitlist-export-feedback').addEventListener('click',()=>exportWaitlist('feedback'));
  $('#waitlist-response').addEventListener('change',renderWaitlist);

  function showLoginFromPreview(){state.preview=false;app.hidden=true;loginScreen.hidden=false;setSidebar(false);const url=new URL(location.href);url.searchParams.delete('preview');history.replaceState(null,'',url.pathname+url.search);$('#login-email').focus();}

  document.addEventListener('click',async event=>{
    const edit = event.target.closest('[data-edit-product]');
    if (edit && !state.preview) {
      let product=state.products.find(item=>item.id===edit.dataset.editProduct);
      if(!product){
        if(state.loadingEditor)return;
        state.loadingEditor=true;edit.disabled=true;
        try{
          const {data,error}=await client.from('products').select('*, product_variants(*), product_media(*)').eq('id',edit.dataset.editProduct).maybeSingle();
          if(error||!data){toast('La fiche ne peut pas être chargée. Réessaie.');return;}
          if(state.preview||app.hidden)return;
          product=data;
          if(!state.products.some(item=>item.id===data.id))state.products.push(data);
        }finally{state.loadingEditor=false;edit.disabled=false;}
      }
      openProductDialog(product,edit.dataset.editVariant);
    }
    const messageButton = event.target.closest('[data-message-id]');
    if (messageButton && !state.preview) {
      state.activeMessage=messageButton.dataset.messageId;
      const message=state.messages.find(item=>item.id===state.activeMessage);
      if (message?.status==='new') {const {error}=await client.from('contact_messages').update({status:'read'}).eq('id',message.id);if(error){toast('Le message n’a pas pu être marqué comme lu.');renderMessageDetail();return;}}
      if(message && message.status==='new') message.status='read';
      renderOverview();renderMessages();
      if (state.view !== 'messages') openView('messages');
    }
    const orderButton = event.target.closest('[data-order-detail]');
    if (orderButton) {
      const order=state.orders.find(item=>item.id===orderButton.dataset.orderDetail);
      if(order){
        $('#order-dialog-title').textContent=`Commande #${String(order.order_number).padStart(4,'0')}`;
        $('#order-dialog-content').innerHTML=`<div class="order-detail-summary"><p><small>Client</small>${html(order.customer_name)}<br>${html(order.customer_email)}</p><p><small>Date</small>${date(order.created_at)}</p><p><small>Statut</small>${statusLabel(order.status)}</p></div>${(order.order_items||[]).map(item=>`<div class="order-detail-item"><span>${html(item.product_title)}<br><small>${html(item.variant_name)} · Quantité : ${item.quantity}</small></span><b>${money(item.unit_price_cents==null?null:item.unit_price_cents*item.quantity,order.currency)}</b></div>`).join('')||'<p>Aucun article renseigné.</p>'}<div class="order-detail-total"><span>Total</span><strong>${money(order.total_cents,order.currency)}</strong></div>${order.notes?`<p class="order-detail-notes">${html(order.notes)}</p>`:''}`;
        $('#order-dialog').showModal();
      }
    }
    const archive = event.target.closest('[data-message-action]');
    if (archive && !state.preview) {
      const {error}=await client.from('contact_messages').update({status:archive.dataset.status}).eq('id',archive.dataset.messageAction);
      if(error) toast('Impossible d’archiver ce message.');
      else {state.messages=state.messages.map(item=>item.id===archive.dataset.messageAction?{...item,status:archive.dataset.status}:item);renderAll();toast('Message archivé.');}
    }
    const remove = event.target.closest('[data-delete-message]');
    if (remove && !state.preview && window.confirm('Supprimer définitivement ce message ?')) {
      const {error}=await client.from('contact_messages').delete().eq('id',remove.dataset.deleteMessage);
      if(error) toast('Impossible de supprimer ce message.');
      else {state.messages=state.messages.filter(item=>item.id!==remove.dataset.deleteMessage);state.activeMessage=null;renderAll();toast('Message supprimé.');}
    }
  });

  document.addEventListener('change',async event=>{
    const select=event.target.closest('[data-order-status]');
    if(!select||state.preview)return;
    select.disabled=true;
    const {error}=await client.from('orders').update({status:select.value}).eq('id',select.dataset.orderStatus);
    select.disabled=false;
    if(error){renderOrders();toast('Le statut de cette commande n’a pas pu être mis à jour.');return;}
    const order=state.orders.find(item=>item.id===select.dataset.orderStatus);
    if(order)order.status=select.value;
    renderOverview();renderOrders();renderCustomers();toast('Statut de commande mis à jour.');
  });
})();
