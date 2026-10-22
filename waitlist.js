(() => {
  const form = document.querySelector('#waitlist-form');
  if (!form) return;
  const client = window.UNLIVEDCustomer?.client;
  const select = document.querySelector('#waitlist-concept-select');
  const conceptRadios = [...document.querySelectorAll('[name="waitlist-concept"]')];
  const names = {'day-one-blanc':'DAY ONE — Blanc','day-one-noir':'DAY ONE — Noir','day-one-rouge':'LE DÉCLIC — Rouge'};
  let feedbackToken = null;
  const setStatus = (node, text, error = false) => { node.textContent = text; node.classList.toggle('is-error', error); };
  const syncConcept = value => {
    if (value && select.value !== value) select.value = value;
    conceptRadios.forEach(radio => { radio.checked = radio.value === value; radio.closest('.concept-card')?.classList.toggle('is-selected', radio.checked); });
  };
  conceptRadios.forEach(radio => radio.addEventListener('change', () => { syncConcept(radio.value); document.querySelector('#waitlist-form-wrap').scrollIntoView({behavior:'smooth',block:'start'}); }));
  select.addEventListener('change', () => syncConcept(select.value));
  const params = new URLSearchParams(location.search);
  const requestedConcept = params.get('concept'), selectedSize = params.get('size');
  const validSelection = Object.hasOwn(names, requestedConcept) && ['XS','S','M','L','XL','XXL'].includes(selectedSize);
  if (!validSelection) {
    document.querySelector('#selection-missing').hidden = false;
    form.closest('.waitlist-form-wrap').hidden = true;
    return;
  }
  select.value = requestedConcept;
  document.querySelector('#waitlist-size').value = selectedSize;
  document.querySelector('#selection-summary').textContent = `${names[requestedConcept]} · Taille ${selectedSize} · Inscription gratuite`;
  document.querySelector('#change-selection').href = `boutique.html?${params.toString()}#waitlist`;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const status = document.querySelector('#waitlist-status');
    const submit = document.querySelector('#waitlist-submit');
    if (form.elements.website.value) { setStatus(status, 'Merci, ton intérêt est noté.'); return; }
    if (!client) { setStatus(status, 'La liste ne répond pas pour le moment. Réessaie dans quelques instants.', true); return; }
    submit.disabled = true;
    setStatus(status, 'Enregistrement de ton intérêt…');
    const data = new FormData(form);
    const params = new URLSearchParams(location.search);
    feedbackToken = crypto.randomUUID();
    const row = {
      consent: true,
      first_name: String(data.get('first_name')).trim(),
      last_name: String(data.get('last_name')).trim(),
      email: String(data.get('email')).trim().toLowerCase(),
      phone: String(data.get('phone')).trim() || null,
      concept_slug: String(data.get('concept')),
      selected_size: selectedSize,
      feedback_token: feedbackToken,
      utm_source: params.get('utm_source'),
      utm_campaign: params.get('utm_campaign'),
      utm_content: params.get('utm_content')
    };
    try {
      const { error } = await client.from('launch_waitlist').insert(row);
      if (error) {
        if (error.code === '23505') setStatus(status, 'Cette adresse est déjà inscrite pour ce concept. Merci de ton intérêt.', true);
        else setStatus(status, 'On n’a pas pu enregistrer ton inscription. Vérifie ta connexion puis réessaie.', true);
        submit.disabled = false;
        return;
      }
      document.dispatchEvent(new Event('unlived:waitlist-success'));
      document.querySelector('#waitlist-thanks-name').textContent = `${row.first_name}.`;
      document.querySelector('#waitlist-thanks-concept').textContent = names[row.concept_slug] || 'le concept choisi';
      form.closest('.waitlist-form-wrap').hidden = true;
      document.querySelector('#change-selection').hidden = true;
      document.querySelector('.waitlist-thanks').hidden = false;
      document.querySelector('.waitlist-thanks').scrollIntoView({behavior:'smooth',block:'center'});
    } catch {
      setStatus(status, 'La liste ne répond pas pour le moment. Réessaie dans quelques instants.', true);
      submit.disabled = false;
    }
  });

  document.querySelector('#waitlist-feedback-form').addEventListener('submit', async event => {
    event.preventDefault();
    const feedbackForm = event.currentTarget;
    if (!feedbackForm.reportValidity()) return;
    const status = document.querySelector('#feedback-status');
    const button = feedbackForm.querySelector('button[type="submit"]');
    if (!client || !feedbackToken) { setStatus(status, 'Cet avis ne peut pas être envoyé. Inscris-toi à nouveau pour continuer.', true); return; }
    button.disabled = true;
    setStatus(status, 'Envoi de ton avis…');
    const data = new FormData(feedbackForm);
    try {
      const { error } = await client.from('launch_waitlist_feedback').insert({
        feedback_token: feedbackToken,
        interest_level: Number(data.get('interest_level')),
        what_appealed: String(data.get('what_appealed')).trim(),
        what_to_improve: String(data.get('what_to_improve')).trim()
      });
      if (error) {
        setStatus(status, error.code === '23505' ? 'Ton avis a déjà été enregistré. Merci !' : 'On n’a pas pu enregistrer ton avis. Réessaie dans un instant.', error.code !== '23505');
        if (error.code === '23505') button.hidden = true; else button.disabled = false;
        return;
      }
      feedbackForm.hidden = true;
      const thanks = document.createElement('p');
      thanks.className = 'feedback-received';
      thanks.textContent = 'Merci d’avoir pris le temps de répondre. Ton avis compte dans la suite du projet.';
      feedbackForm.after(thanks);
    } catch {
      setStatus(status, 'L’envoi a échoué. Vérifie ta connexion puis réessaie.', true);
      button.disabled = false;
    }
  });
})();
