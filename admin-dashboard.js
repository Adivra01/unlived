(() => {
  const root = document.querySelector('#dashboard-insights');
  const {request, esc} = window.UNLIVEDBusiness;
  let days = 30, report = null, generation = 0, previewMode = false;
  const number = n => new Intl.NumberFormat('fr-FR').format(n);
  const money = n => new Intl.NumberFormat('fr-FR', {style:'currency', currency:'EUR'}).format(n / 100);
  const card = (label, value, note, accent = '') => `<article class="insight-card ${accent}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
  function ranking(title, rows, unit) {
    const max = Math.max(1, ...rows.map(r => r.count));
    return `<section class="insight-panel"><div class="insight-panel-heading"><h2>${title}</h2><span>${days} jours</span></div>${rows.length ? `<ol class="insight-ranking">${rows.slice(0,5).map(r => `<li><div><span>${esc(r.name)}</span><b>${number(r.count)} ${unit}</b></div><div class="rank-track"><i style="width:${100*r.count/max}%"></i></div></li>`).join('')}</ol>` : '<p class="insight-empty">Les premières données apparaîtront ici.</p>'}</section>`;
  }
  function waitlistPanel(r,preview) {
    const w=r?.waitlist;
    const labels={'day-one-blanc':'DAY ONE · Blanc','day-one-noir':'DAY ONE · Noir','day-one-rouge':'LE DÉCLIC · Rouge','day-one':'DAY ONE · T-shirt'};
    return `<section class="insight-panel waitlist-dashboard"><div class="insight-panel-heading"><div><span class="panel-eyebrow">INSCRIPTIONS & QUESTIONNAIRES</span><h2>Liste d’attente</h2></div><button type="button" class="secondary-button" id="overview-waitlist">Voir toutes les inscriptions →</button></div><div class="waitlist-kpis"><div>Total des inscriptions<strong>${w?number(w.total):'—'}</strong></div><div>Sur la période<strong>${w?number(w.period):'—'}</strong></div><div>Questionnaires reçus<strong>${w?number(w.answered):'—'}</strong></div><div>Avis en attente<strong>${w?number(w.total-w.answered):'—'}</strong></div></div>${w?.recent.length?`<p class="business-note">Les 5 dernières inscriptions · toutes périodes</p><div class="business-table-wrap"><table class="business-table"><thead><tr><th>Personne</th><th>Pièce</th><th>Inscription</th><th>Questionnaire</th></tr></thead><tbody>${w.recent.map(item=>`<tr><td>${esc([item.first_name,item.last_name].filter(Boolean).join(' '))}<small>${esc(item.email)}</small></td><td>${esc(labels[item.concept_slug]||item.concept_slug)}<small>Taille ${esc(item.selected_size||'Non précisée')}</small></td><td>${esc(item.created_at?.slice(0,10)||'')}</td><td>${item.feedback?`<details><summary>${esc(item.feedback.interest_level)}/5 · Lire l’avis</summary><p><b>Ce qui a plu</b><br>${esc(item.feedback.what_appealed||'Non renseigné')}</p><p><b>À améliorer</b><br>${esc(item.feedback.what_to_improve||'Non renseigné')}</p></details>`:'En attente'}</td></tr>`).join('')}</tbody></table></div>`:`<p class="business-note">${preview?'Connecte-toi comme administrateur pour consulter les inscriptions.':'Aucune inscription enregistrée sur le serveur partagé.'}</p>`}</section>`;
  }
  function chart(title, rows, value, format, total) {
    const max = Math.max(1,...rows.map(value));
    return `<section class="insight-panel"><div class="insight-panel-heading"><div><span class="panel-eyebrow">${days} DERNIERS JOURS</span><h2>${title}</h2></div><strong>${total}</strong></div><div class="insight-chart" role="img" aria-label="${title} par jour">${rows.map(d=>`<div title="${d.day} : ${format(value(d))}"><i style="height:${value(d)?Math.max(2,100*value(d)/max):0}%"></i></div>`).join('')}</div>${rows.some(d=>value(d)>0)?'':'<p class="chart-empty-state">Aucune activité enregistrée sur cette période.</p>'}<div class="insight-chart-labels"><span>${rows[0]?.day||''}</span><span>${rows.at(-1)?.day||''}</span></div><details><summary>Détail quotidien</summary><div class="business-table-wrap"><table class="business-table"><thead><tr><th>Date</th><th>${title}</th></tr></thead><tbody>${rows.map(d=>`<tr><td>${d.day}</td><td>${format(value(d))}</td></tr>`).join('')}</tbody></table></div></details></section>`;
  }
  function render(preview = false, error = '') {
    const r = report;
    root.innerHTML = `<div class="insight-toolbar"><div class="report-status"><i class="${error?'is-error':''}"></i><span>${preview?'Aperçu · connexion requise pour les statistiques':error?'Actualisation indisponible':r?`Mis à jour à ${new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(new Date())}`:'Chargement des statistiques…'}</span></div><div class="insight-actions"><label for="overview-days">Période<select id="overview-days">${[1,7,30,90,365].map(n=>`<option value="${n}" ${n===days?'selected':''}>${n===1?"Aujourd’hui":`${n} derniers jours`}</option>`).join('')}</select></label><button class="secondary-button" id="overview-export" ${!r?'disabled':''}>Exporter le rapport ↓</button></div></div>
    ${error ? `<p class="insight-error" role="status">${esc(error)}</p>` : ''}
    <div class="insight-metrics">${card('Visiteurs totaux',r?number(r.total_visitors):'—','Sur l’historique disponible','insight-featured')}${card('Visiteurs sur la période',r?number(r.traffic.visitors):'—',`${days} jours sélectionnés`)}${card('Chiffre d’affaires total',r?money(r.revenue_cents):'—','Paiements confirmés · EUR')}${card('Chiffre d’affaires sur la période',r?money(r.period_revenue_cents):'—',`${r?number(r.paid_orders):'—'} commandes payées`)}</div>
    <div class="insight-secondary">${card('Pages vues',r?number(r.traffic.views):'—','Sur la période')}${card('Sessions',r?number(r.traffic.sessions):'—','Sur la période')}${card('Panier moyen payé',r?money(r.average_order_cents):'—','Commandes confirmées')}${card('Nouveaux clients',r?number(r.registrations):'—','Comptes créés')}${card('Inscriptions d’intérêt',r?number(r.interest_count):'—','Sur la période')}</div>
    ${waitlistPanel(r,preview)}<div class="insight-charts">${chart('Visiteurs',r?.traffic.daily||[],d=>d.visitors,number,r?number(r.traffic.visitors):'—')}${chart('Chiffre d’affaires',r?.daily_revenue||[],d=>d.revenue_cents,money,r?money(r.period_revenue_cents):'—')}</div>
    <div class="insight-leaders">${ranking('Pages les plus consultées',r?.traffic.pages||[],'vues')}${ranking('Produits les plus vendus',r?.best_sellers||[],'vendus')}${ranking('Produits les plus demandés',r?.interest||[],'inscriptions')}${ranking('Produits les plus consultés',r?.traffic.products||[],'vues')}${ranking('Pays des visiteurs',r?.traffic.countries||[],'vues')}</div><details class="measurement-details"><summary>Comprendre les mesures</summary><p>Audience mesurée avec consentement. Visites locales, robots identifiés et administrateurs exclus. Historique des visites : 395 jours maximum. Les identifiants visiteurs changent chaque mois : un même visiteur peut être recompté. Le CA correspond aux paiements confirmés en EUR et exclut les commandes annulées et remboursées. Les pays sont estimés. Le paiement en ligne reste à connecter.</p></details>`;
  }
  async function load() {
    const id = ++generation;
    if (previewMode) {report=null;render(true);return;}
    try {const result = await request('overview', {days});if(id!==generation)return;report=result;render();}
    catch (e) {if(id!==generation)return;report=null;render(false,e.message);}
  }
  root.addEventListener('change',e=>{if(e.target.id==='overview-days'){days=Number(e.target.value);load();}});
  root.addEventListener('click',e=>{
    if(e.target.closest('#overview-waitlist')){document.querySelector('.nav-item[data-view=waitlist]:not([data-waitlist-response])').click();return;}
    if(e.target.id!=='overview-export'||!report)return;
    const r=report;
    const rows=[['Rapport UNLIVED',`${days} jours`],['Indicateur','Valeur'],['Visiteurs historique disponible',r.total_visitors],['Visiteurs période',r.traffic.visitors],['Pages vues période',r.traffic.views],['CA général EUR',r.revenue_cents/100],['CA période EUR',r.period_revenue_cents/100],['Commandes payées période',r.paid_orders],['Sessions',r.traffic.sessions],['Panier moyen EUR',r.average_order_cents/100],['Nouveaux clients',r.registrations],['Inscriptions intérêt',r.interest_count],[],['Date','Visiteurs','Pages vues'],...r.traffic.daily.map(d=>[d.day,d.visitors,d.views])];
    rows.push([],['Liste d’attente','Valeur'],['Inscriptions total',r.waitlist.total],['Inscriptions période',r.waitlist.period],['Questionnaires reçus',r.waitlist.answered]);
    rows.push([],['Date','CA EUR'],...r.daily_revenue.map(d=>[d.day,d.revenue_cents/100]));
    for(const [title,items] of [['Pages',r.traffic.pages],['Produits vendus',r.best_sellers],['Inscriptions intérêt',r.interest],['Produits vus',r.traffic.products],['Pays estimés',r.traffic.countries],['Événements',r.traffic.events],['Sources',r.traffic.sources],['Appareils',r.traffic.devices]])rows.push([],[title,'Nombre'],...items.map(i=>[i.name,i.count]));
    const cell=v=>'"'+String(v??'').replace(/^[\s]*[=+@-]/,"'").replace(/"/g,'""')+'"';
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`unlived-performance-${days}j-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  document.addEventListener('unlived:admin-ready',e=>{previewMode=Boolean(e.detail?.preview);load();});
  document.querySelector('#refresh-data').addEventListener('click',load);
  document.querySelector('#preview-dashboard').addEventListener('click',()=>{previewMode=true;report=null;render(true);});
  window.UNLIVEDLocal.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){report=null;generation++;render();}});
  setInterval(()=>{if(!document.hidden&&!document.querySelector('#admin-app').hidden&&!previewMode)load();},60000);
  render();
})();
