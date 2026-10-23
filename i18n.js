/* Bundled, editable i18n. No text is sent to a translation service. */
(() => {
  const languages = {fr:'Français', en:'English', es:'Español', it:'Italiano', ar:'العربية'};
  const storage = {get(k){try{return localStorage.getItem(k)}catch{return null}},set(k,v){try{localStorage.setItem(k,v)}catch{}}};
  const normalize = value => value.replace(/\s+/g,' ').trim();
  const originals = new WeakMap(), attributes = new WeakMap(), bundles = new Map();
  let dictionary = {}, language = 'fr', revision = 0, scheduled = false, observer;
  const blocked = 'script,style,svg,code,textarea,[translate="no"],[data-no-translate],#customer-name,#customer-email,#waitlist-thanks-name';
  function t(value) {
    const key = normalize(String(value));
    if (Object.hasOwn(dictionary,key)) return dictionary[key];
    const values=[];
    const template=key.replace(/\d+(?:[.,]\d+)?(?:\s?[€$£])?/g,value=>{
      values.push(value);
      return `{{${values.length-1}}}`;
    });
    if(values.length && Object.hasOwn(dictionary,template))
      return dictionary[template].replace(/\{\{(\d+)\}\}/g,(_,index)=>values[Number(index)]??'');
    // Compose runtime labels without changing identifiers, sizes, names or numbers.
    const parts = key.split(/( · | — | \| | — | #)/);
    if(parts.length>1) return parts.map(part=>/^( · | — | \| | #)$/.test(part)?part:t(part)).join('');
    let match = key.match(/^(Taille|Commande|Voir la photo|Lire la vidéo|Prix envisagé) (.+)$/);
    if(match) return (dictionary[match[1]]||match[1])+' '+match[2];
    match=key.match(/^(\d+) pièces? affichées?$/);
    if(match) return {fr:`${match[1]} pièce(s) affichée(s)`,en:`${match[1]} pieces shown`,es:`${match[1]} prendas mostradas`,it:`${match[1]} capi mostrati`,ar:`${match[1]} قطع معروضة`}[language];
    match=key.match(/^(\d+ \/ \d+ — )(.+)$/);
    if(match) return match[1]+t(match[2]);
    return key;
  }
  function translateNode(node) {
    if(!node.parentElement || node.parentElement.closest(blocked))return;
    const current=node.nodeValue;
    let state=originals.get(node);
    if(!state || current!==state.output)state={source:current,output:current};
    if(!normalize(state.source))return;
    const lead=state.source.match(/^\s*/)[0],trail=state.source.match(/\s*$/)[0];
    const output=lead+t(state.source)+trail;
    state.output=output; originals.set(node,state);
    if(current!==output)node.nodeValue=output;
  }
  function translateTree() {
    observer?.disconnect();
    const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT);
    while(walker.nextNode())translateNode(walker.currentNode);
    document.querySelectorAll('[aria-label],[placeholder],[alt],[title],meta[name="description"],meta[property="og:title"],meta[property="og:description"]').forEach(el=>{
      if(el.closest(blocked))return;
      let saved=attributes.get(el)||{};
      for(const attr of ['aria-label','placeholder','alt','title',...(el.tagName==='META'?['content']:[])]){
        if(!el.hasAttribute(attr))continue;
        const current=el.getAttribute(attr);let state=saved[attr];
        if(!state||state.output!==current)state={source:current};
        state.output=t(state.source);saved[attr]=state;
        if(current!==state.output)el.setAttribute(attr,state.output);
      }
      attributes.set(el,saved);
    });
    document.documentElement.lang=language;
    document.documentElement.dir=language==='ar'?'rtl':'ltr';
    document.querySelectorAll('[data-language-select]').forEach(el=>el.value=['auto',null].includes(storage.get('unlived-language'))&&!new URLSearchParams(location.search).has('lang')?'auto':language);
    observer?.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','placeholder','alt','title','content']});
  }
  async function load(lang){
    if(bundles.has(lang))return bundles.get(lang);
    let response;
    try{response=await fetch(`/api/translations/${lang}?v=20261023r`,{signal:AbortSignal.timeout(1800)});if(!response.ok)throw Error();const data=await response.json();bundles.set(lang,data);return data}catch{}
    response=await fetch(`locales/${lang}.json?v=20261023r`);if(!response.ok)throw Error('Missing language');
    const data=await response.json();bundles.set(lang,data);return data;
  }
  async function setLanguage(lang,manual=false){
    if(!Object.hasOwn(languages,lang))return;
    const request=++revision;
    try{
      const next=await load(lang);if(request!==revision)return;
      language=lang;dictionary=next;
      if(manual){storage.set('unlived-language',lang);const u=new URL(location.href);u.searchParams.set('lang',lang);history.replaceState(null,'',u);}
      translateTree();window.dispatchEvent(new CustomEvent('unlived:language',{detail:{language}}));
      requestAnimationFrame(()=>window.ScrollTrigger?.refresh());
    }catch{document.querySelectorAll('[data-language-select]').forEach(el=>el.value=language);}
  }
  const browserLanguage=()=>navigator.languages?.map(l=>l.split('-')[0]).find(l=>languages[l])||'en';
  let countryRequest;
  function detectCountry(){return countryRequest ||= fetchCountry()}
  async function fetchCountry(){
    try{
      const cached=JSON.parse(sessionStorage.getItem('unlived-country')||'null');
      if(cached?.country&&Date.now()-cached.at<86400000)return cached.country;
    }catch{}
    try{
      const response=await fetch('https://api.country.is/',{signal:AbortSignal.timeout(2500),credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok)return null;const data=await response.json();
      if(!/^[A-Z]{2}$/.test(data.country))return null;
      try{sessionStorage.setItem('unlived-country',JSON.stringify({country:data.country,at:Date.now()}))}catch{}
      return data.country;
    }catch{return null}
  }
  function countryLanguage(country){
    if('FR ML SN CI BF NE BJ TG GN CD CG GA CM'.split(' ').includes(country))return 'fr';
    if('ES MX AR BO CL CO CR CU DO EC GT HN NI PA PE PY SV UY VE'.split(' ').includes(country))return 'es';
    if('IT SM VA'.split(' ').includes(country))return 'it';
    if('DZ BH EG IQ JO KW LB LY MA MR OM PS QA SA SD SY TN AE YE'.split(' ').includes(country))return 'ar';
    if('US GB AU NZ IE CA'.split(' ').includes(country))return 'en';
    return browserLanguage();
  }
  async function automatic(){
    const mark=revision;
    const country=await detectCountry();
    if(mark===revision && !new URLSearchParams(location.search).has('lang') && ['auto',null].includes(storage.get('unlived-language')))await setLanguage(countryLanguage(country));
  }
  function picker(locationNode,compact){
    if(!locationNode)return;
    const label=document.createElement('label');label.className='language-picker'+(compact?' language-picker-compact':'');
    const span=document.createElement('span');span.textContent='Langue';label.append(span);if(compact){const mark=document.createElement('span');mark.className='locale-country';mark.setAttribute('translate','no');mark.textContent='⌄ 🌐';label.append(mark);detectCountry().then(country=>{if(/^[A-Z]{2}$/.test(country||'')){mark.textContent='⌄ '+[...country].map(c=>String.fromCodePoint(127397+c.charCodeAt())).join('');mark.title=country;}});}
    const select=document.createElement('select');select.dataset.languageSelect='';select.setAttribute('aria-label','Langue');
    Object.entries(languages).forEach(([value,text])=>{const o=new Option(compact?value.toUpperCase():text,value);o.setAttribute('translate','no');select.add(o)});
    const auto=new Option(compact?'AUTO':'Langue automatique','auto');select.add(auto);label.append(select);locationNode.append(label);if(compact){const fav=locationNode.querySelector('.header-favorites');if(fav)fav.after(label);}
    select.addEventListener('change',()=>{
      if(select.value==='auto'){
        storage.set('unlived-language','auto');const u=new URL(location.href);u.searchParams.delete('lang');history.replaceState(null,'',u);
        setLanguage(browserLanguage()).then(automatic);
      }else setLanguage(select.value,true);
    });
  }
  window.UNLIVEDI18n={t,setLanguage,getCountry:detectCountry,get language(){return language}};
  picker(document.querySelector('.site-header'),true);picker(document.querySelector('.footer-bottom'),false);
  observer=new MutationObserver(()=>{if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;translateTree()})}});
  const explicit=new URLSearchParams(location.search).get('lang');
  const preference=storage.get('unlived-language');
  const initial=languages[explicit]?explicit:languages[preference]?preference:browserLanguage();
  setLanguage(initial).then(()=>{if(!languages[explicit]&&!languages[preference])automatic()});
})();
