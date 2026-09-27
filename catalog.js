(() => {
  const grid = document.querySelector('#products');
  if (!grid || !window.supabase?.createClient || !window.UNLIVED_SUPABASE_CONFIG) return;
  const client = window.supabase.createClient(window.UNLIVED_SUPABASE_CONFIG.url, window.UNLIVED_SUPABASE_CONFIG.publishableKey);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const priceText = (cents, currency) => cents == null ? 'Prix annoncé au lancement' : new Intl.NumberFormat('fr-FR',{style:'currency',currency:currency || 'EUR'}).format(cents/100);
  const productUrl = (product, variant) => `produit.html?product=${encodeURIComponent(product.slug)}&variant=${encodeURIComponent(variant.color_slug)}`;
  const mediaFor = (product, variant) => (product.product_media || []).find(item=>item.variant_id===variant.id && item.media_type==='image') || (product.product_media || []).find(item=>item.media_type==='image') || null;
  const colorLabel = value => value ? value[0].toUpperCase()+value.slice(1) : '';

  client.from('products').select('*, product_variants(*), product_media(*)').eq('status','active').order('created_at',{ascending:false}).then(({data,error})=>{
    if(error || !data?.length)return;
    const cards = data.flatMap(product => (product.product_variants || []).filter(variant=>variant.is_available).map((variant,index,variants)=>{
      const media=mediaFor(product,variant);
      const image=media?.url || 'assets/atelier-blanc.webp';
      const alt=media?.alt_text || `${product.title} — ${variant.color_name}`;
      const url=productUrl(product,variant);
      return `<article class="product-card reveal" data-color="${escapeHtml(variant.color_slug)}" data-product="${escapeHtml(product.slug)}-${escapeHtml(variant.color_slug)}"><a class="product-image-button" href="${url}" aria-label="Voir ${escapeHtml(product.title)} en ${escapeHtml(variant.color_name)}"><img src="${escapeHtml(image)}" alt="${escapeHtml(alt)}" loading="lazy"><span class="product-tag ${variant.color_slug==='noir'?'product-tag-dark':''}">${escapeHtml(product.collection)}</span><span class="quick-view">Voir la pièce <b>↗</b></span></a><div class="product-meta"><div><p class="product-type">${escapeHtml(product.category)} · ${escapeHtml(variant.color_name)}</p><h3>${escapeHtml(product.title)} — ${escapeHtml(colorLabel(variant.color_name))}</h3></div><a class="product-open" href="${url}" aria-label="Voir la fiche ${escapeHtml(product.title)}">↗</a></div><div class="product-bottom"><span class="product-price">${escapeHtml(priceText(product.price_cents,product.currency))}</span><div class="swatches">${variants.map(item=>`<a class="swatch ${item.id===variant.id?'selected':''} ${item.color_slug==='noir'?'swatch-black':'swatch-white'}" href="${productUrl(product,item)}" aria-label="Voir en ${escapeHtml(item.color_name)}" ${item.id===variant.id?'aria-current="page"':''}></a>`).join('')}</div></div></article>`;
    }));
    if(!cards.length)return;
    grid.innerHTML=cards.join('');
    const filterTabs=[...document.querySelectorAll('.filter-tab')];
    filterTabs.forEach(tab=>tab.addEventListener('click',()=>{
      const filter=tab.dataset.filter;
      const visible=[...grid.querySelectorAll('.product-card')].filter(card=>filter==='all'||card.dataset.color===filter);
      visible.forEach((card,index)=>{card.classList.remove('is-hidden');if(window.gsap&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)gsap.fromTo(card,{autoAlpha:0,y:14},{autoAlpha:1,y:0,duration:.4,delay:index*.04,ease:'power2.out'});});
      [...grid.querySelectorAll('.product-card')].filter(card=>!visible.includes(card)).forEach(card=>card.classList.add('is-hidden'));
    }));
  });
})();
