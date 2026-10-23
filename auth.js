(() => {
  const values=new URLSearchParams(location.hash.slice(1)),token=values.get('token'),reset=values.get('action')==='reset';
  history.replaceState(null,'',location.pathname);
  const form=document.querySelector('#challenge-form'),status=document.querySelector('#challenge-status'),button=document.querySelector('#challenge-submit');
  if(!token){form.hidden=true;status.textContent='Lien absent ou invalide. Demande un nouveau lien depuis la page de connexion.';return;}
  if(reset){document.querySelector('#challenge-title').textContent='Nouveau mot de passe';document.querySelector('#challenge-intro').textContent='Choisis un nouveau mot de passe pour ton compte.';document.querySelector('#reset-fields').hidden=false;form.elements.password.required=true;form.elements.confirmation.required=true;button.textContent='Enregistrer le mot de passe';}
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(button.disabled||!form.reportValidity())return;
    const password=form.elements.password.value;
    if(reset&&password!==form.elements.confirmation.value){status.textContent='Les deux mots de passe doivent être identiques.';return;}
    if(reset&&!(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]).{8,256}$/s.test(password))){status.textContent='8 caractères minimum, avec une majuscule, un chiffre et un caractère spécial.';return;}
    button.disabled=true;status.textContent='Vérification…';
    try{const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json','X-UNLIVED-Request':'1'},body:JSON.stringify({action:reset?'reset_password':'verify_email',token,...(reset?{password}:{})})});const result=await response.json();if(result.error)throw Error(result.error.message);form.reset();form.hidden=true;status.textContent=result.data.message;}
    catch(error){status.textContent=error.message||'La demande ne peut pas être traitée. Réessaie.';button.disabled=false;}
  });
})();
