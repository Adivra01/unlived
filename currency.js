/* Display-only conversion. Stored product prices and order currencies remain unchanged. */
(() => {
  const codes=['EUR','XOF','XAF','USD','GBP','CAD','CHF','MAD','DZD','TND','NGN','GHS','AED','SAR','QAR','EGP','JPY','AUD','BRL','MXN'];
  const labels={fr:['Devise','Automatique','Conversion indicative','Taux indisponible : prix en EUR'],en:['Currency','Automatic','Estimated conversion','Rate unavailable: prices in EUR'],es:['Moneda','Automática','Conversión orientativa','Tipo no disponible: precios en EUR'],it:['Valuta','Automatica','Conversione indicativa','Tasso non disponibile: prezzi in EUR'],ar:['العملة','تلقائي','تحويل تقديري','سعر الصرف غير متاح: الأسعار باليورو']};
  const countries={ML:'XOF',SN:'XOF',CI:'XOF',BF:'XOF',BJ:'XOF',TG:'XOF',NE:'XOF',GW:'XOF',CM:'XAF',GA:'XAF',CG:'XAF',TD:'XAF',CF:'XAF',GQ:'XAF',US:'USD',GB:'GBP',CA:'CAD',CH:'CHF',MA:'MAD',DZ:'DZD',TN:'TND',NG:'NGN',GH:'GHS',AE:'AED',SA:'SAR',QA:'QAR',EG:'EGP',JP:'JPY',AU:'AUD',BR:'BRL',MX:'MXN'};
  const get=k=>{try{return localStorage.getItem(k)}catch{return null}};
  const put=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};
  let choice=get('unlived-currency')||'auto', auto='EUR', current='EUR', rate=1, date='', failed=false, request=0, queued=false;
  const locale=()=>window.UNLIVEDI18n?.language||document.documentElement.lang||'fr';
  const words=()=>labels[locale()]||labels.en;
  const format=(value,currency)=>new Intl.NumberFormat(locale(),{style:'currency',currency,currencyDisplay:'code'}).format(value);
  const selectors='.launch-meta>span,.choice-price,.red-price strong,.product-price-detail,.cart-line-price,#cart-total,.favorite-card-info>span';
  function capture(){
    document.querySelectorAll(selectors).forEach(root=>{
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT), nodes=[];
      while(walker.nextNode())if(!walker.currentNode.parentElement.closest('[data-eur-price]'))nodes.push(walker.currentNode);
      for(const node of nodes){
        const value=node.nodeValue, regex=/(\d+(?:[\s\u00a0\u202f]\d{3})*(?:[,.]\d{1,2})?)\s*€/g;
        let match,last=0,found=false;const fragment=document.createDocumentFragment();
        while((match=regex.exec(value))){
          found=true;fragment.append(document.createTextNode(value.slice(last,match.index)));
          const span=document.createElement('span');span.dataset.eurPrice=String(Number(match[1].replace(/\s/g,'').replace(',','.')));span.setAttribute('translate','no');fragment.append(span);last=regex.lastIndex;
        }
        if(found){fragment.append(document.createTextNode(value.slice(last)));node.replaceWith(fragment)}
      }
    });
  }
  function paint(){
    observer.disconnect();capture();
    document.querySelectorAll('[data-eur-price]').forEach(node=>{
      const value=Number(node.dataset.eurPrice);if(!Number.isFinite(value))return;
      const text=(current==='EUR'?'':'≈ ')+format(value*rate,current);
      if(node.textContent!==text)node.textContent=text;
      node.title=current==='EUR'?'':`${words()[2]} · ${date} · ${format(value,'EUR')}`;
    });
    document.querySelectorAll('[data-currency-select]').forEach(select=>{select.value=choice;select.setAttribute('aria-label',words()[0]);select.options[0].textContent=`${words()[1]} (${auto})`;select.parentElement.querySelector('span').textContent=words()[0]});
    document.querySelectorAll('.currency-note').forEach(node=>node.textContent=failed?words()[3]:current==='EUR'?'':`${words()[2]} · ${date} · EUR  ${current}`);
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  }
  const observer=new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;paint()})}});
  async function selectCurrency(){
    const id=++request,target=choice==='auto'?auto:choice;
    failed=false;
    if(target==='EUR'){current='EUR';rate=1;date='';paint();return}
    // Never display amounts calculated with the previously selected currency's rate.
    current='EUR';rate=1;paint();
    let quote;
    try{const cached=JSON.parse(get('unlived-fx-'+target)||'null');if(cached&&Date.now()-cached.saved<86400000&&cached.rate>0)quote=cached}catch{}
    if(!quote)try{
      const response=await fetch(`https://api.frankfurter.dev/v2/rate/EUR/${target}`,{signal:AbortSignal.timeout(4500),credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok)throw Error();const data=await response.json();
      if(!Number.isFinite(data.rate)||data.rate<=0||!/^\d{4}-\d{2}-\d{2}$/.test(data.date))throw Error();
      quote={rate:data.rate,date:data.date,saved:Date.now()};put('unlived-fx-'+target,JSON.stringify(quote));
    }catch{}
    if(id!==request)return;
    if(quote){current=target;rate=quote.rate;date=quote.date}else failed=true;
    paint();
  }
  function addPicker(host){
    if(!host)return;
    const label=document.createElement('label');label.className='language-picker currency-picker';label.setAttribute('translate','no');
    label.innerHTML='<span></span><select data-currency-select></select>';
    const select=label.querySelector('select');select.add(new Option('','auto'));codes.forEach(code=>select.add(new Option(code,code)));
    select.addEventListener('change',()=>{choice=select.value;put('unlived-currency',choice);selectCurrency()});host.append(label);
  }
  if(!codes.includes(choice)&&choice!=='auto')choice='auto';
  addPicker(document.querySelector('.footer-bottom'));
  // Keep the main header uncluttered: currency is beside the shop filters and in every footer.
  addPicker(document.querySelector('.shop-toolbar'));
  const foot=document.querySelector('.footer-bottom');if(foot){const note=document.createElement('small');note.className='currency-note';note.setAttribute('translate','no');note.setAttribute('role','status');foot.append(note)}
  window.addEventListener('unlived:language',paint);
  selectCurrency();
  window.UNLIVEDI18n?.getCountry().then(country=>{auto=countries[country]||'EUR';if(choice==='auto')selectCurrency();else paint()});
})();
