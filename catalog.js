(() => {
  const grid = document.querySelector('#products');
  if (!grid || !window.UNLIVEDLocal) return;
  const client = window.UNLIVEDLocal;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const priceText = (cents, currency) => cents == null ? 'Prix annoncé au lancement' : `Prix envisagé · ${new Intl.NumberFormat('fr-FR',{style:'currency',currency:currency || 'EUR'}).format(cents/100)}`;
  const productUrl = (product, variant) => product.slug==='day-one'&&['blanc','noir'].includes(variant.color_slug) ? `day-one-${variant.color_slug}.html` : `produit.html?product=${encodeURIComponent(product.slug)}&variant=${encodeURIComponent(variant.color_slug)}`;
  const mediaFor = (product, variant) => [...(product.product_media || [])].sort((a,b)=>a.sort_order-b.sort_order).find(item=>item.variant_id===variant.id && item.media_type==='image') || [...(product.product_media || [])].sort((a,b)=>a.sort_order-b.sort_order).find(item=>item.media_type==='image') || null;
  const colorLabel = value => value ? value[0].toUpperCase()+value.slice(1) : '';

  client.from('products').select('*, product_variants(*), product_media(*)').eq('status','active').order('created_at',{ascending:false}).then(async({data,error})=>{
    if(error)return;
    if(!data?.length){grid.innerHTML='<p class="catalog-empty">La collection se prépare. Reviens bientôt découvrir les pièces.</p>';window.dispatchEvent(new Event('unlived:catalog-loaded'));return;}
    const favoriteIds = window.UNLIVEDCustomer?.state.favoriteIds || new Set();
    const conceptOrder=['day-one','in-between-pull','do-it-afraid-hoodie'];
    const intentions={'day-one':'Le jour où tu commences.','in-between-pull':'Ta vie. Ton propre rythme.','do-it-afraid-hoodie':'La peur est là. Toi aussi.'};
    const values={'day-one':'ACTION','in-between-pull':'LIBERTÉ','do-it-afraid-hoodie':'COURAGE'};
    data.sort((a,b)=>(conceptOrder.indexOf(a.slug)<0?99:conceptOrder.indexOf(a.slug))-(conceptOrder.indexOf(b.slug)<0?99:conceptOrder.indexOf(b.slug)));
    grid.classList.add('editorial-catalog');
    const cards = data.flatMap((product,index) => {
      const available=(product.product_variants || []).filter(variant=>variant.is_available);
      const variant=available.find(v=>v.stock_status!=='out_of_stock'&&v.stock_quantity!==0)||available[0];
      if(!variant)return [];
      const media=mediaFor(product,variant),image=media?.url||'';
      const alt=media?.alt_text || `${product.title} — ${variant.color_name}`;
      const url=productUrl(product,variant);
      const outOfStock=available.every(v=>v.stock_status==='out_of_stock'||v.stock_quantity===0);
      const favorite=favoriteIds.has(product.id);
      const title=product.title.split('—')[0].trim();
      const category=product.category==='Pull à capuche'?'hoodie':/pull/i.test(product.category)?'pull':'tee';
      const visual=image?`<img src="${escape(image)}" alt="${escape(alt)}" loading="lazy" decoding="async">`:`<span class="concept-product-art ${category==='hoodie'?'is-hoodie':'is-pull'}"><small>ÉTUDE ${String(index+1).padStart(2,'0')} / ${escape(product.category)}</small><strong>${escape(title)}</strong><i>CONCEPT EN PRÉPARATION</i></span>`;
      const join=`boutique.html?concept=${encodeURIComponent(product.slug)}#waitlist`;
      return [`<article class="product-card" data-color="${escape(variant.color_slug)}" data-category="${category}" data-product="${escape(product.slug)}">
        <a class="product-image-button" href="${url}" aria-label="Découvrir ${escape(product.title)}">${visual}<span class="product-tag">ACTE I / ${String(index+1).padStart(2,'0')}</span><span class="quick-view">Explorer le concept <b></b></span></a>
        <div class="catalog-story"><p class="catalog-chapter"><span>${String(index+1).padStart(2,'0')}</span>${escape(product.category.toUpperCase())} / ${values[product.slug]||'UNLIVED'}</p>
        <h3>${escape(title)}</h3><p class="catalog-intention">${escape(intentions[product.slug]||'La décision reste la tienne.')}</p><p class="catalog-description">${escape(product.description||'Une pièce, une intention. Découvre ce qu’elle vient te rappeler.')}</p>
        ${outOfStock?'<span class="stock-badge">Épuisé</span>':''}
        <div class="product-bottom"><span class="product-price">${product.price_cents==null?'Prix à confirmer':escape(new Intl.NumberFormat('fr-FR',{style:'currency',currency:product.currency||'EUR',maximumFractionDigits:0}).format(product.price_cents/100))}<small>Prix envisagé · concept en préparation</small></span><div class="swatches">${available.map(item=>`<a class="swatch ${item.id===variant.id?'selected':''}" style="background:${/^#[0-9a-f]{6}$/i.test(item.color_hex)?item.color_hex:'#e8e4dc'}" href="${productUrl(product,item)}" aria-label="Voir en ${escape(item.color_name)}"></a>`).join('')}</div></div>
        <div class="catalog-actions"><a class="button button-dark" href="${join}">Ce concept me parle <b></b></a><button class="favorite-button ${favorite?'is-favorite':''}" type="button" data-favorite-product-id="${escape(product.id)}" aria-pressed="${favorite}" aria-label="${favorite?'Retirer des':'Ajouter aux'} favoris"><span aria-hidden="true"><svg class="ui-icon icon-heart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg></span></button></div>
        <div class="catalog-secondary"><a class="text-link" href="${url}">Découvrir la pièce <span></span></a><button class="catalog-add-cart" type="button" data-add-to-cart data-product-id="${escape(product.id)}" data-slug="${escape(product.slug)}" data-title="${escape(product.title)}" data-collection="${escape(product.collection)}" data-variant-id="${escape(variant.id)}" data-variant="${escape(variant.color_slug)}" data-variant-name="${escape(variant.color_name)}" data-image="${escape(image)}" data-price-cents="${product.price_cents==null?'':escape(product.price_cents)}" data-currency="${escape(product.currency||'EUR')}" ${outOfStock?'disabled':''}>${outOfStock?'Épuisé':'Garder au panier'} <span>＋</span></button></div></div></article>`];
    });
    if(!cards.length){grid.innerHTML='<p class="catalog-empty">Les pièces seront bientôt disponibles ici.</p>';window.dispatchEvent(new Event('unlived:catalog-loaded'));return;}
    grid.innerHTML=cards.join('');
    window.UNLIVEDCustomer?.syncButtons();
    window.dispatchEvent(new Event('unlived:catalog-loaded'));
  });
})();
