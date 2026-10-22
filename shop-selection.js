(() => {
 const cards=[...document.querySelectorAll('.choice-card')], form=document.querySelector('#selection-step');
 if(!form)return;
 let selected='';
 const names = {'day-one-blanc':'DAY ONE — Blanc','day-one-noir':'DAY ONE — Noir','day-one-rouge':'LE DÉCLIC — Rouge'};
 function choose(card){selected=card.dataset.concept;cards.forEach(c=>{const active=c===card;c.classList.toggle('is-chosen',active);const b=c.querySelector('.choose-concept');b.setAttribute('aria-pressed',String(active));b.innerHTML=active?'Pièce sélectionnée <span>✓</span>':'Choisir cette pièce <span>＋</span>';});document.querySelector('#chosen-piece').textContent=names[selected];document.querySelector('#selection-status').textContent='';}
 cards.forEach(card=>{card.querySelector('.choose-concept').addEventListener('click',()=>{choose(card);form.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});});const preview=card.querySelector('.choice-preview');if(preview.tagName!=='A')preview.addEventListener('click',()=>{location.href=card.querySelector('.choice-details').getAttribute('href')});});
 const params=new URLSearchParams(location.search); if(params.get('concept')==='day-one')params.set('concept','day-one-blanc'); const initial=cards.find(c=>c.dataset.concept===params.get('concept'));if(initial)choose(initial);
 const size=[...form.elements.size].find(r=>r.value===params.get('size'));if(size)size.checked=true;
 form.addEventListener('submit',e=>{e.preventDefault();if(!selected){document.querySelector('#selection-status').textContent='Choisis une pièce avant de continuer.';cards.find(c=>!c.hidden)?.querySelector('.choose-concept').focus();return;}if(!form.reportValidity())return;params.set('concept',selected);params.set('size',new FormData(form).get('size'));location.href=`waitlist.html?${params}`;});
})();
