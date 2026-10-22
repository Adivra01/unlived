(() => {
  const client = window.UNLIVEDLocal;
  if (!client) return;
  const state = { user: null, favoriteIds: new Set() };
  const pendingFavorites = new Set();
  const navLink = document.querySelector('.account-nav-link');
  const favoriteButtons = () => [...document.querySelectorAll('[data-favorite-product-id]')];
  const toast = message => {
    const element = document.querySelector('.toast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => element.classList.remove('show'), 3000);
  };
  const syncButtons = () => {
    favoriteButtons().forEach(button => {
      const selected = state.favoriteIds.has(button.dataset.favoriteProductId);
      button.classList.toggle('is-favorite', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', selected ? 'Retirer des favoris' : 'Ajouter aux favoris');
      const symbol = button.querySelector('[aria-hidden="true"]');
      const label = button.querySelector('[data-favorite-label], span:last-child:not([aria-hidden="true"])');
      if (symbol) symbol.innerHTML = '<svg class="ui-icon icon-heart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
      if (label) label.textContent = selected ? 'Retirer des favoris' : 'Ajouter aux favoris';
    });
    if (navLink) {
      const label = navLink.querySelector('span');
      if (label) label.textContent = state.user ? 'Mon compte' : 'Connexion';
      navLink.setAttribute('aria-label', state.user ? 'Ouvrir mon compte client' : 'Se connecter ou créer un compte');
      let count = navLink.querySelector('.favorite-nav-count');
      if (state.user && state.favoriteIds.size) {
        if (!count) { count = document.createElement('i'); count.className = 'favorite-nav-count'; navLink.append(count); }
        count.textContent = String(state.favoriteIds.size);
        count.hidden = false;
      } else if (count) count.hidden = true;
    }
  };
  let authLoadVersion=0;
  async function loadUser() {
    const version=++authLoadVersion;
    const { data } = await client.auth.getUser();
    if(version!==authLoadVersion)return state.user;
    state.user = data.user || null;
    state.favoriteIds.clear();
    if (state.user) {
      const { data: rows, error } = await client.from('customer_favorites').select('product_id').eq('user_id', state.user.id);
      if(version!==authLoadVersion)return state.user;
      if (!error) (rows || []).forEach(row => state.favoriteIds.add(row.product_id));
    }
    syncButtons();
    return state.user;
  }
  async function toggleFavorite(productId) {
    if (!productId || pendingFavorites.has(productId)) return;
    pendingFavorites.add(productId);
    try {
    if (!state.user) await loadUser();
    if (!state.user) {
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.href = `compte.html?return=${encodeURIComponent(returnTo)}&favorite=${encodeURIComponent(productId)}`;
      return;
    }
    const exists = state.favoriteIds.has(productId);
    const result = exists
      ? await client.from('customer_favorites').delete().eq('user_id', state.user.id).eq('product_id', productId)
      : await client.from('customer_favorites').insert({ user_id: state.user.id, product_id: productId });
    if (result.error) { toast('Cette action n’a pas pu être enregistrée. Réessaie.'); return; }
    if (exists) state.favoriteIds.delete(productId); else state.favoriteIds.add(productId);
    syncButtons();
    window.dispatchEvent(new CustomEvent('unlived:favorites-changed', { detail: { productId, favorite: !exists } }));
    toast(exists ? 'Retiré de tes favoris.' : 'Enregistré dans tes favoris.');
    } catch { toast('La connexion est indisponible. Réessaie dans un instant.'); }
    finally { pendingFavorites.delete(productId); }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-favorite-product-id]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    toggleFavorite(button.dataset.favoriteProductId);
  });
  client.auth.onAuthStateChange((event) => {
    if(event==='SIGNED_OUT'){authLoadVersion++;state.user=null;state.favoriteIds.clear();syncButtons();return;}
    if(['INITIAL_SESSION','SIGNED_IN','USER_UPDATED'].includes(event))window.setTimeout(() => loadUser().catch(() => syncButtons()), 0);
  });
  loadUser().catch(() => syncButtons());
  window.UNLIVEDCustomer = { client, state, loadUser, syncButtons, toggleFavorite, toast };
})();
