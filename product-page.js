(() => {
  const $=s=>document.querySelector(s),gallery=$('#gallery-main'),thumbs=$('#gallery-thumbs');
  if(!gallery||!thumbs)return;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeMedia=value=>{try{const u=new URL(value,location.href);return ['http:','https:','file:'].includes(u.protocol)?value:''}catch{return ''}};
  const params=new URLSearchParams(location.search),slug=params.get('product')||document.body.dataset.product||'day-one';
  const color=params.get('variant')||(params.get('article')==='tee-noir'?'noir':document.body.dataset.variant||(slug==='day-one-rouge'?'rouge':'blanc'));
  const productUrl=(slug,variant)=>slug==='day-one'&&['blanc','noir'].includes(variant)?`day-one-${variant}.html`:`produit.html?product=${encodeURIComponent(slug)}&variant=${encodeURIComponent(variant)}`;
  const fallback={"blanc": [["assets/edition-blanc.png", "UNLIVED — blanc — vue 1"], ["assets/edition-scene.png", "UNLIVED — blanc — vue 2"], ["assets/edition-dos-trio.png", "UNLIVED — blanc — vue 3"], ["assets/edition-portant.png", "UNLIVED — blanc — vue 4"], ["assets/edition-etiquettes.png", "UNLIVED — blanc — vue 5"]], "noir": [["assets/edition-noir.png", "UNLIVED — noir — vue 1"], ["assets/edition-dos-trio.png", "UNLIVED — noir — vue 2"], ["assets/edition-portant.png", "UNLIVED — noir — vue 3"], ["assets/edition-etiquettes.png", "UNLIVED — noir — vue 4"]], "rouge": [["assets/edition-rouge.png", "UNLIVED — rouge — vue 1"], ["assets/edition-rouge-studio.png", "UNLIVED — rouge — vue 2"], ["assets/edition-rouge-detail.png", "UNLIVED — rouge — vue 3"], ["assets/edition-dos-trio.png", "UNLIVED — rouge — vue 4"], ["assets/edition-etiquettes.png", "UNLIVED — rouge — vue 5"]]};
  const knownColor=['blanc','noir','rouge'].includes(color)?color:'blanc';
  let entries=fallback[knownColor].map(([src,alt])=>({src,alt,type:'image'})),selected=0;
  const lightbox=document.createElement('dialog');lightbox.className='media-lightbox';lightbox.setAttribute('aria-label','Photo du produit agrandie');
  lightbox.innerHTML='<button type="button" aria-label="Fermer la photo">×</button><img alt="">';document.body.append(lightbox);
  lightbox.querySelector('button').addEventListener('click',()=>lightbox.close());
  lightbox.addEventListener('click',e=>{if(e.target===lightbox)lightbox.close()});
  function showEntry(index){
    selected=index;const entry=entries[index];if(!entry)return;
    gallery.replaceChildren();
    const node=document.createElement(entry.type==='video'?'video':'img');
    node.src=safeMedia(entry.src);
    if(entry.type==='video'){node.controls=true;node.playsInline=true;node.preload='metadata';node.poster=entry.poster||'';node.setAttribute('aria-label',entry.alt||'Film de la pièce')}
    else{node.alt=entry.alt||'DAY ONE — UNLIVED';node.decoding='async';node.fetchPriority=index===0?'high':'auto'}
    gallery.append(node);
    if(entry.type!=='video'){
      const zoom=document.createElement('button');zoom.type='button';zoom.className='gallery-zoom';zoom.textContent='Agrandir ';zoom.setAttribute('aria-label','Agrandir la photo du produit');
      const open=()=>{const img=lightbox.querySelector('img');img.src=node.src;img.alt=node.alt;lightbox.showModal()};
      zoom.addEventListener('click',open);node.addEventListener('click',open);gallery.append(zoom);
    }
    [...thumbs.children].forEach((button,i)=>{button.classList.toggle('is-selected',i===index);button.setAttribute('aria-pressed',String(i===index))});
    $('.gallery-note').textContent=`${index+1} / ${entries.length} — ${entry.type==='video'?'Le film de la pièce':entry.alt}`;
  }
  function renderGallery(){
    thumbs.innerHTML=entries.map((entry,i)=>`<button class="gallery-thumb" type="button" data-index="${i}" aria-label="${entry.type==='video'?'Lire la vidéo':'Voir la photo'} ${i+1}" aria-pressed="false"><img src="${escape(safeMedia(entry.type==='video'?entry.poster:entry.src))}" alt="" loading="lazy">${entry.type==='video'?'<span class="thumb-play" aria-hidden="true">▷</span>':''}</button>`).join('');showEntry(0);
  }
  thumbs.addEventListener('click',e=>{const button=e.target.closest('[data-index]');if(button)showEntry(Number(button.dataset.index))});
  thumbs.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
    const index=e.key==='Home'?0:e.key==='End'?entries.length-1:(selected+(e.key==='ArrowRight'?1:-1)+entries.length)%entries.length;
    showEntry(index);thumbs.children[index].focus();
  });
  const variants=$('#product-variants'),other=knownColor==='blanc'?'noir':'blanc';
  variants.innerHTML=['blanc','noir'].map(v=>`<a class="product-variant ${v===knownColor?'is-selected':''}" href="${productUrl('day-one',v)}" ${v===knownColor?'aria-current="page"':''}><i class="swatch swatch-${v==='noir'?'black':'white'}" aria-hidden="true"></i><span>${v==='noir'?'Noir':'Blanc'}</span></a>`).join('');
  $('#product-title').textContent=`${knownColor==='rouge'?'LE DÉCLIC':'DAY ONE'} — ${knownColor==='rouge'?'Rouge':knownColor==='noir'?'Noir':'Blanc'}`;
  $('#breadcrumb-product').textContent=`T-shirt ${knownColor}`;
  $('#related-product').href=productUrl('day-one',other);$('#related-image').src=fallback[other][0][0];$('#related-image').alt=fallback[other][0][1];
  renderGallery();
  if(!['day-one','day-one-rouge'].includes(slug)){entries=[];gallery.innerHTML='<p class="catalog-empty">Chargement de la pièce…</p>';thumbs.replaceChildren();$('.gallery-note').textContent='';$('#product-title').textContent='La pièce';$('.product-lead').hidden=true;document.querySelectorAll('.product-description')[1].hidden=true;}
  const sizeButtons=[...document.querySelectorAll('[data-size]')];
  sizeButtons.forEach(button=>button.addEventListener('click',()=>sizeButtons.forEach(item=>{item.classList.toggle('is-selected',item===button);item.setAttribute('aria-pressed',String(item===button))})));
  $('#size-guide-link').addEventListener('click',()=>{$('#size-help').classList.toggle('is-emphasized');$('#size-help').tabIndex=-1;$('#size-help').focus()});
  $('.product-cta').href='boutique.html#waitlist';
  $('.product-cta').addEventListener('click',event=>{
    if ($('.size-block').hidden) return;
    event.preventDefault();
    const size=sizeButtons.find(b=>b.classList.contains('is-selected'))?.dataset.size;
    if(!size){$('#size-help').textContent='Choisis ta taille pour continuer vers la liste d’attente.';sizeButtons[0]?.focus();return;}
    const next=new URLSearchParams(location.search);next.set('concept',slug==='day-one'?`day-one-${knownColor}`:slug);next.set('size',size);next.delete('product');next.delete('variant');
    location.href=`waitlist.html?${next}`;
  });
  const favorite=$('.product-favorite');favorite.disabled=true;
  const client=window.UNLIVEDCustomer?.client;
  if(!client){if(slug==='day-one-rouge'){gallery.innerHTML='<img src="assets/edition-rouge.png" alt="Étude illustrative du t-shirt rouge">';$('#product-title').textContent='LE DÉCLIC — Rouge';}favorite.title='Les favoris nécessitent une connexion au catalogue.';return}
  client.from('products').select('*, product_variants(*), product_media(*)').eq('slug',slug).eq('status','active').maybeSingle().then(({data,error})=>{
    if(error){$('#product-stock-state').textContent='La disponibilité ne peut pas être actualisée pour le moment.';if(slug!=='day-one')gallery.innerHTML='<p class="catalog-empty">Cette pièce ne peut pas être chargée. Réessaie dans un instant.</p>';return}
    const active=data?.product_variants.find(v=>v.color_slug===color&&v.is_available);
    if(!data||!active){
      $('#product-title').textContent='Cette pièce est indisponible';$('#product-stock-state').textContent='Retrouve les pièces actuellement présentées dans la boutique.';
      $('.product-cta').href='boutique.html';$('.product-cta').textContent='Revenir à la boutique ';$('.product-description').textContent='Cette référence ne fait plus partie du catalogue public.';
      $('.product-price-detail').hidden=true;$('.variant-block').hidden=true;$('.size-block').hidden=true;$('.product-gallery').hidden=true;$('.product-lead').hidden=true;$('.product-favorite').hidden=true;$('.product-accordions').hidden=true;$('.related-products').hidden=true;$('.product-manifesto').hidden=true;document.querySelectorAll('.product-description').forEach(p=>p.hidden=true);$('.product-footnote').hidden=true;const schema=$('#product-schema');if(schema)schema.remove();
      let robots=$('meta[name=robots]');if(!robots){robots=document.createElement('meta');robots.name='robots';document.head.append(robots)}robots.content='noindex, follow';return;
    }
    const available=data.product_variants.filter(v=>v.is_available),baseTitle=data.title.replace(/\s+[—–-]\s*(?:t-shirt|tee)$/i,''),name=`${baseTitle} — ${active.color_name}`;
    $('#product-title').textContent=name;document.title=`${name} | UNLIVED`;
    const desc=data.description||`${data.category} ${active.color_name} — ${data.collection} par UNLIVED.`;
    $('meta[name=description]').content=desc;$('meta[property="og:title"]').content=document.title;$('meta[property="og:description"]').content=desc;
    const site=$('meta[name=site-url]')?.content;
    if(site){const canonical=$('link[rel=canonical]');if(canonical)canonical.href=new URL(productUrl(data.slug,active.color_slug),site).href;const ogUrl=$('meta[property="og:url"]');if(ogUrl)ogUrl.content=new URL(productUrl(data.slug,active.color_slug),site).href;}
    $('#breadcrumb-product').textContent=`${data.category} ${active.color_name}`;
    $('.product-eyebrow').textContent=data.collection;$('.product-type').textContent=`${data.category} · ${active.color_name}`;
    $('.product-price-detail').textContent='Inscription gratuite · Sans achat ni engagement';
    if(data.description && !['day-one','day-one-rouge'].includes(slug))$('.product-description').textContent=data.description;
    const out=active.stock_status==='out_of_stock'||active.stock_quantity===0;
    $('#product-stock-state').textContent=out?'Épuisé — demande à être prévenu·e du retour.':active.stock_status==='in_stock'||active.stock_quantity>0?'Disponible · ouverture des commandes à venir':'Disponibilité annoncée au lancement';
    $('#product-stock-state').classList.toggle('is-out-of-stock',out);
    const cartButton=$('#add-to-cart');
    if(cartButton){
      cartButton.hidden=false;
      cartButton.disabled=out;
      cartButton.innerHTML=out?'<span>Épuisé · indisponible</span><b>×</b>':'<span>Ajouter au panier</span><b>＋</b>';
      Object.assign(cartButton.dataset,{productId:data.id,slug:data.slug,title:name,collection:data.collection,variantId:active.id,variant:active.color_slug,variantName:active.color_name,image:(data.product_media||[]).find(m=>m.variant_id===active.id&&m.media_type==='image')?.url||(slug==='day-one-rouge'?'assets/edition-rouge.png':''),priceCents:data.price_cents==null?'':String(data.price_cents),currency:data.currency||'EUR'});
    }
    $('.product-cta').innerHTML=`<span>${out?'Me prévenir du retour':'Suivant'}</span><b></b>`;
    favorite.disabled=false;favorite.dataset.favoriteProductId=data.id;window.UNLIVEDCustomer.syncButtons();
    variants.innerHTML=available.map(v=>`<a class="product-variant ${v.id===active.id?'is-selected':''}" href="${productUrl(data.slug,v.color_slug)}" ${v.id===active.id?'aria-current="page"':''}><i class="swatch" style="background:${/^#[0-9a-f]{6}$/i.test(v.color_hex)?v.color_hex:'#e8e4dc'}" aria-hidden="true"></i><span>${escape(v.color_name)}</span></a>`).join('');
    const otherVariant=available.find(v=>v.id!==active.id);$('.related-products').hidden=!otherVariant;
    if(otherVariant){$('#related-product').href=productUrl(data.slug,otherVariant.color_slug);const relatedMedia=data.product_media.find(m=>m.variant_id===otherVariant.id&&m.media_type==='image');$('#related-image').hidden=!relatedMedia;if(relatedMedia){$('#related-image').src=fallback[otherVariant.color_slug]?.[0][0]||safeMedia(relatedMedia.url);$('#related-image').alt=`${baseTitle} — ${otherVariant.color_name}`}}
    const media=data.product_media.filter(m=>(!m.variant_id||m.variant_id===active.id)&&safeMedia(m.url)).sort((a,b)=>a.sort_order-b.sort_order);
    if(fallback[color]){entries=fallback[color].map(([src,alt])=>({src,alt,type:'image'}));renderGallery();if(cartButton)cartButton.dataset.image=entries[0].src;}
    else if(media.length){entries=media.map(m=>({type:m.media_type,src:m.url,alt:m.alt_text,poster:media.find(x=>x.media_type==='image')?.url||''}));renderGallery()}
    else if(slug==='day-one-rouge'){
      entries=[{type:'image',src:'assets/edition-rouge.png',alt:'Étude de couleur — t-shirt rouge, visuel non contractuel'}];renderGallery();
      $('.gallery-note').textContent='Étude de couleur. Le modèle définitif sera présenté avant le lancement.';
    } else if(!['day-one','day-one-rouge'].includes(slug)){entries=[];gallery.innerHTML='<p class="catalog-empty">Visuels en préparation.</p>';thumbs.replaceChildren();}
    if(slug==='day-one'||slug==='day-one-rouge'){
      const signature=slug==='day-one-rouge';
      $('.product-lead').hidden=false;
      $('.product-lead').textContent=signature?'Le jour où l’envie devient un geste.':'Un essentiel. Le reste t’appartient.';
      $('.product-info').classList.toggle('signature-product',signature);
      $('.product-type').textContent=signature?'T-SHIRT ROUGE · ÉDITION SIGNATURE':'T-SHIRT · LES ESSENTIELS';
      variants.innerHTML=['blanc','noir','rouge'].map(c=>`<a class="product-variant ${c===color?'is-selected':''}" href="day-one-${c}.html" ${c===color?'aria-current="page"':''}><i class="swatch" style="background:${c==='rouge'?'#7a2e38':c==='noir'?'#140608':'#fff'}" aria-hidden="true"></i><span>${c==='rouge'?'Rouge · signature':c==='noir'?'Noir':'Blanc'}</span></a>`).join('');
      if(signature){
        const benefit=document.createElement('section');benefit.className='signature-benefits';
        benefit.innerHTML='<p class="small-label">DEUX FORMATIONS ENVISAGÉES AVEC LE ROUGE</p><h3>Le déclic, et la suite.</h3><p><b>01 / Faire le premier pas.</b><br>Transformer une envie repoussée en une action concrète.</p><p><b>02 / Donner une suite.</b><br>Trouver ton rythme et continuer après les premiers jours.</p><small>Programmes en préparation. Contenu et accès à confirmer avant toute vente. L’inscription à la liste d’attente ne donne pas encore accès aux formations.</small>';
        $('.product-accordions').before(benefit);
        $('.product-description').textContent='Un rouge profond pour ce moment précis : tu avances, même sans certitude. LE DÉCLIC est la pièce signature de la première collection. Deux formations sont en préparation pour accompagner cette pièce, pour faire un premier pas puis lui donner une suite.';
      }
    }
    const firstImage=entries.find(e=>e.type==='image');if(firstImage)$('meta[property="og:image"]').content=new URL(firstImage.src,location.href).href;
    const schema=$('#product-schema');if(schema){const value=JSON.parse(schema.textContent);value.name=name;value.description=data.description||value.description;value.color=active.color_name;value.category=data.category;if(site)value.url=new URL(productUrl(data.slug,active.color_slug),site).href;value.image=entries.filter(e=>e.type==='image').map(e=>new URL(e.src,location.href).href);schema.textContent=JSON.stringify(value)}
    window.ScrollTrigger?.refresh();
  }).catch(()=>{$('#product-stock-state').textContent='La disponibilité ne peut pas être actualisée pour le moment.'});
})();
