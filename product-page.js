(() => {
  const storage = {
    set: (key, value) => { try { sessionStorage.setItem(key, value); } catch {} },
    remove: key => { try { sessionStorage.removeItem(key); } catch {} }
  };
  const galleryMain = document.querySelector('#gallery-main');
  const thumbs = document.querySelector('#gallery-thumbs');
  if (!galleryMain || !thumbs) return;

  const media = {
    'tee-blanc': {
      name: 'DAY ONE — Blanc',
      color: 'blanc',
      base: 'assets/atelier-blanc.webp',
      alt: 'T-shirt DAY ONE blanc, vues avant et arrière',
      images: [
        {src: 'assets/atelier-blanc.webp', alt: 'Le t-shirt blanc UNLIVED présenté de face et de dos'},
        {src: 'assets/editorial-blanc.webp', alt: 'Le t-shirt blanc UNLIVED porté en situation'},
        {src: 'assets/look-detente.webp', alt: 'Le t-shirt blanc DAY ONE dans un look quotidien'}
      ],
      videos: [
        {type: 'video', src: '', poster: 'assets/editorial-blanc.webp', alt: 'Film éditorial du t-shirt blanc DAY ONE', label: 'Le film éditorial'},
        {type: 'video', src: '', poster: 'assets/atelier-blanc.webp', alt: 'Détails vidéo du t-shirt blanc DAY ONE', label: 'Les détails en mouvement'}
      ]
    },
    'tee-noir': {
      name: 'DAY ONE — Noir',
      color: 'noir',
      base: 'assets/tee-noir-editorial.webp',
      alt: 'T-shirt DAY ONE noir porté dans la campagne UNLIVED',
      images: [
        {src: 'assets/tee-noir-editorial.webp', alt: 'Le t-shirt noir UNLIVED porté'},
        {src: 'assets/atelier-noir.webp', alt: 'Le t-shirt noir UNLIVED présenté de face et de dos'},
        {src: 'assets/look-noir.webp', alt: 'Le t-shirt noir DAY ONE dans un look éditorial'},
        {src: 'assets/look-editorial-noir.webp', alt: 'Détail du t-shirt noir UNLIVED porté'}
      ],
      videos: [
        {type: 'video', src: '', poster: 'assets/look-noir.webp', alt: 'Film éditorial du t-shirt noir DAY ONE', label: 'Le film éditorial'},
        {type: 'video', src: '', poster: 'assets/atelier-noir.webp', alt: 'Détails vidéo du t-shirt noir DAY ONE', label: 'Les détails en mouvement'}
      ]
    }
  };

  const requested = new URLSearchParams(window.location.search).get('article');
  const currentId = media[requested] ? requested : 'tee-blanc';
  const product = media[currentId];
  const otherId = currentId === 'tee-blanc' ? 'tee-noir' : 'tee-blanc';
  const otherProduct = media[otherId];

  document.title = `${product.name} — Acte I: DAY ONE | UNLIVED`;
  document.querySelector('#product-title').textContent = product.name;
  document.querySelector('#breadcrumb-product').textContent = `T-shirt ${product.color}`;
  document.querySelector('#related-product').href = `produit.html?article=${otherId}`;
  document.querySelector('#related-image').src = otherProduct.base;
  document.querySelector('#related-image').alt = otherProduct.alt;

  const variantLinks = document.querySelector('#product-variants');
  variantLinks.innerHTML = [
    ['tee-blanc', 'Blanc', 'swatch-white'],
    ['tee-noir', 'Noir', 'swatch-black']
  ].map(([id, label, swatch]) => `<a class="product-variant ${id === currentId ? 'is-selected' : ''}" href="produit.html?article=${id}" ${id === currentId ? 'aria-current="page"' : ''}><i class="swatch ${swatch}" aria-hidden="true"></i><span>${label}</span></a>`).join('');

  const entries = [...product.images, ...product.videos];
  const showEntry = (index) => {
    const entry = entries[index];
    galleryMain.replaceChildren();
    galleryMain.classList.toggle('is-video', entry.type === 'video');

    if (entry.type === 'video' && !entry.src) {
      const placeholder = document.createElement('div');
      placeholder.className = 'product-video-placeholder';
      placeholder.style.setProperty('--video-poster', `url("${entry.poster}")`);
      placeholder.innerHTML = `<span class="video-play-mark" aria-hidden="true">▷</span><span class="video-kicker">ACTE I: DAY ONE / FILM PRODUIT</span><strong>${entry.label}<br>arrivera bientôt.</strong><span class="video-caption">EMPLACEMENT PRÉVU POUR LA VIDÉO DE LA PIÈCE</span>`;
      galleryMain.append(placeholder);
    } else if (entry.type === 'video') {
      const video = document.createElement('video');
      video.controls = true;
      video.playsInline = true;
      video.poster = entry.poster;
      video.src = entry.src;
      video.setAttribute('aria-label', entry.alt);
      galleryMain.append(video);
    } else {
      const image = document.createElement('img');
      image.src = entry.src;
      image.alt = entry.alt;
      image.fetchPriority = index === 0 ? 'high' : 'auto';
      galleryMain.append(image);
    }
    [...thumbs.children].forEach((button, i) => {
      button.classList.toggle('is-selected', i === index);
      button.setAttribute('aria-pressed', String(i === index));
    });
  };

  thumbs.innerHTML = entries.map((entry, index) => {
    const isVideo = entry.type === 'video';
    const label = isVideo ? `Voir ${entry.label.toLowerCase()} (à venir)` : `Voir la photo ${index + 1} : ${entry.alt}`;
    const image = isVideo ? entry.poster : entry.src;
    return `<button class="gallery-thumb ${isVideo ? 'gallery-thumb-video' : ''}" type="button" data-index="${index}" aria-label="${label}" aria-pressed="false"><img src="${image}" alt="" loading="lazy">${isVideo ? '<span class="thumb-play" aria-hidden="true">▷</span><small>FILM</small>' : ''}</button>`;
  }).join('');
  thumbs.addEventListener('click', event => {
    const button = event.target.closest('button[data-index]');
    if (button) showEntry(Number(button.dataset.index));
  });
  showEntry(0);

  const sizeButtons = [...document.querySelectorAll('.product-sizes button')];
  sizeButtons.forEach(button => button.addEventListener('click', () => {
    sizeButtons.forEach(size => {
      const selected = size === button;
      size.classList.toggle('is-selected', selected);
      size.setAttribute('aria-pressed', String(selected));
    });
  }));
  document.querySelector('#size-guide-link').addEventListener('click', () => {
    const help = document.querySelector('#size-help');
    help.classList.add('is-emphasized');
    help.scrollIntoView({behavior: 'smooth', block: 'center'});
    window.setTimeout(() => help.classList.remove('is-emphasized'), 1600);
  });
  document.querySelector('.product-cta').addEventListener('click', () => {
    storage.set('unlived-waitlist-product', product.name);
    const size = sizeButtons.find(button => button.classList.contains('is-selected'))?.dataset.size;
    if (size) storage.set('unlived-waitlist-size', size);
    else storage.remove('unlived-waitlist-size');
  });
})();
