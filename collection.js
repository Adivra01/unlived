(() => {
  const client=window.UNLIVEDCustomer?.client;
  if(!client)return;
  const price=value=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:value.currency||'EUR',maximumFractionDigits:0}).format(value.price_cents/100);
  client.from('products').select('id,slug,status,price_cents,currency,product_variants(*)').in('slug',['day-one','day-one-rouge']).then(({data,error})=>{
    if(error||!data)return;
    document.querySelectorAll('.launch-card,.choice-card').forEach(card=>{
      const color=card.dataset.category,product=data.find(p=>p.slug===(color==='rouge'?'day-one-rouge':'day-one'));
      const variant=product?.product_variants.find(v=>v.color_slug===color&&v.is_available);
      const unavailable=!product||product.status!=='active'||!variant;
      if(unavailable){card.hidden=true;return;}
      const node=card.querySelector('.choice-price,.launch-meta>span');
      if(node)node.remove();
      if(variant.stock_status==='out_of_stock'||variant.stock_quantity===0){const badge=document.createElement('span');badge.className='collection-stock';badge.textContent='Épuisé · liste d’attente ouverte';card.querySelector('.choice-meta,.launch-meta').before(badge);}
      const favorite=document.createElement('button');favorite.type='button';favorite.className='favorite-button collection-favorite';favorite.dataset.favoriteProductId=product.id;favorite.setAttribute('aria-pressed','false');favorite.setAttribute('aria-label','Ajouter aux favoris');
      favorite.innerHTML='<span aria-hidden="true"><svg class="ui-icon icon-heart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg></span>';
      card.append(favorite);
    });
    window.UNLIVEDCustomer?.syncButtons();window.ScrollTrigger?.refresh();
  }).catch(()=>{});
})();
