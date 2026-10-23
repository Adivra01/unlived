(() => {
  const host=document.querySelector('#view-settings');
  host.insertAdjacentHTML('beforeend',`<section class="business-panel" id="admin-credentials"><h2>Mes identifiants</h2><p>Confirme ton mot de passe actuel. Le nouveau mot de passe doit contenir au moins 8 caractères, une majuscule, un chiffre et un caractère spécial.</p><div class="business-columns"><form id="admin-email-form"><h3>Adresse e-mail</h3><label>Nouvelle adresse e-mail<input type="email" name="email" autocomplete="email" required></label><label>Mot de passe actuel<input type="password" name="current_password" autocomplete="current-password" required></label><button type="submit">Mettre à jour l’e-mail</button><p role="status" aria-live="polite"></p></form><form id="admin-password-form"><h3>Mot de passe</h3><label>Mot de passe actuel<input type="password" name="current_password" autocomplete="current-password" required></label><label>Nouveau mot de passe<input type="password" name="password" autocomplete="new-password" minlength="8" maxlength="256" required></label><label>Confirmer le nouveau mot de passe<input type="password" name="confirmation" autocomplete="new-password" minlength="8" maxlength="256" required></label><button type="submit">Modifier le mot de passe</button><p role="status" aria-live="polite"></p></form></div></section>`);
  host.insertAdjacentHTML('beforeend','<section class="business-panel"><h2>E-mails automatiques</h2><p id="mail-service-status" role="status">Vérification de la configuration…</p><button type="button" id="mail-service-refresh">Actualiser le statut</button> <button type="button" id="mail-service-retry">Relancer les envois en échec</button></section>');
  async function refreshMail(){try{const s=await window.UNLIVEDBusiness.request('mail_status');document.querySelector('#mail-service-status').textContent=(s.configured?'Configuration Resend renseignée.':'Clé ou adresse d’envoi manquante dans .env.')+` ${s.pending} e-mail(s) en attente. ${s.failed} envoi(s) à vérifier après échecs.`;}catch{document.querySelector('#mail-service-status').textContent='Connecte-toi pour consulter le statut des e-mails.';}}
  document.querySelector('#mail-service-refresh').addEventListener('click',refreshMail);
  document.querySelector('#mail-service-retry').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{await window.UNLIVEDBusiness.request('mail_retry');await refreshMail();}catch(error){document.querySelector('#mail-service-status').textContent=error.message;}finally{button.disabled=false;}});
  document.addEventListener('unlived:admin-ready',refreshMail);
  const client=window.UNLIVEDLocal;
  client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')host.querySelectorAll('#admin-credentials form').forEach(form=>{form.reset();form.querySelector('[role=status]').textContent='';});});
  host.addEventListener('submit',async event=>{
    const form=event.target;
    if(!['admin-email-form','admin-password-form'].includes(form.id))return;
    event.preventDefault();
    const fields=Object.fromEntries(new FormData(form)),status=form.querySelector('[role=status]'),button=form.querySelector('button');
    if(form.id==='admin-password-form'&&fields.password!==fields.confirmation){status.textContent='Les deux mots de passe doivent être identiques.';return;}
    if(!form.reportValidity())return;
    button.disabled=true;status.textContent='Enregistrement…';
    const values={current_password:fields.current_password,...(form.id==='admin-email-form'?{email:fields.email.trim()}:{password:fields.password})};
    try{const {error,data}=await client.auth.updateUser(values);if(error)throw Error(error.message);form.reset();status.textContent=form.id==='admin-email-form'?(data?.message||'Confirme la modification depuis ta nouvelle adresse e-mail.'):'Mot de passe mis à jour. Les autres sessions ont été déconnectées.';}
    catch(error){status.textContent=error.message||'La modification n’a pas abouti. Réessaie.';}
    finally{button.disabled=false;}
  });
})();
