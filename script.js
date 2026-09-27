(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const storage = {
    get: key => { try { return sessionStorage.getItem(key); } catch { return null; } },
    set: (key, value) => { try { sessionStorage.setItem(key, value); } catch {} },
    remove: key => { try { sessionStorage.removeItem(key); } catch {} }
  };
  const toast = $('.toast');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let toastTimer;
  const heroVideo = $('.hero-video');
  const syncHeroPlayback = () => {
    if (!heroVideo) return;
    if (reducedMotion.matches) { heroVideo.pause(); return; }
    heroVideo.play().catch(() => {});
  };
  if (heroVideo) {
    if (heroVideo.readyState >= 2) syncHeroPlayback();
    else heroVideo.addEventListener('canplay', syncHeroPlayback, {once: true});
    heroVideo.addEventListener('timeupdate', () => {
      if (!heroVideo.duration) return;
      const progress = heroVideo.currentTime / heroVideo.duration;
      const rail = $('.hero-rail-line i');
      if (rail) rail.style.transform = `scaleY(${Math.max(.08, progress)})`;
    });
    window.addEventListener('resize', syncHeroPlayback);
    reducedMotion.addEventListener?.('change', syncHeroPlayback);
  }
  const announce = (message) => {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  };

  const waitlistProduct = storage.get('unlived-waitlist-product');
  const waitlistSize = storage.get('unlived-waitlist-size');
  const contactMessage = $('#message');
  if (waitlistProduct && contactMessage) {
    contactMessage.value = `Bonjour UNLIVED,\n\nJ’aimerais être prévenu·e du lancement de « ${waitlistProduct} »${waitlistSize ? ` en taille ${waitlistSize}` : ''}.\n\nMerci !`;
    storage.remove('unlived-waitlist-product');
    storage.remove('unlived-waitlist-size');
  }

  const soundtrack = $('#brand-track');
  const soundButton = $('#sound-toggle');
  if (soundtrack && soundButton) {
    soundtrack.volume = .48;
    const savedSoundTime = Number(storage.get('unlived-sound-time'));
    if (Number.isFinite(savedSoundTime) && savedSoundTime > 0) soundtrack.currentTime = savedSoundTime;
    const setSoundState = (isPlaying) => {
      soundButton.classList.toggle('is-playing', isPlaying);
      soundButton.setAttribute('aria-pressed', String(isPlaying));
      soundButton.setAttribute('aria-label', isPlaying ? 'Couper la bande-son' : 'Lancer la bande-son');
      $('.sound-label', soundButton).innerHTML = `Bande-son <b>${isPlaying ? 'ON' : 'OFF'}</b>`;
      storage.set('unlived-sound-playing', isPlaying ? 'on' : 'off');
    };
    soundButton.addEventListener('click', async () => {
      if (!soundtrack.paused) { soundtrack.pause(); return; }
      try {
        await soundtrack.play();
        setSoundState(true);
      } catch {
        setSoundState(false);
        announce('Le fichier Drive ne peut pas être lu. Vérifie que le lien est accessible à toute personne disposant du lien.');
      }
    });
    soundtrack.addEventListener('play', () => setSoundState(true));
    soundtrack.addEventListener('pause', () => setSoundState(false));
    soundtrack.addEventListener('timeupdate', () => storage.set('unlived-sound-time', String(soundtrack.currentTime)));
    window.addEventListener('pagehide', () => {
      storage.set('unlived-sound-playing', soundtrack.paused ? 'off' : 'on');
      storage.set('unlived-sound-time', String(soundtrack.currentTime));
    });
    if (storage.get('unlived-sound-playing') === 'on') {
      soundtrack.play().then(() => setSoundState(true)).catch(() => setSoundState(false));
    }
    soundtrack.addEventListener('error', () => {
      setSoundState(false);
      announce('La bande-son Drive est inaccessible pour le moment.');
    });
  }

  const hasGSAP = typeof window.gsap !== 'undefined';
  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);
    document.documentElement.classList.add('js-motion');
    const mm = gsap.matchMedia();

    if (!reducedMotion.matches) {
      // A quiet editorial opening, then the stills breathe like a temporary film loop.
      const intro = gsap.timeline({defaults: {ease: 'power3.out'}});
      intro.from('.hero-copy .eyebrow', {y: 16, autoAlpha: 0, duration: .7})
        .from('.hero-title span, .hero-title em', {yPercent: 115, autoAlpha: 0, stagger: .16, duration: 1.05, ease: 'power4.out'}, '-=.28')
        .from('.hero-description, .hero-down', {y: 20, autoAlpha: 0, stagger: .12, duration: .75}, '-=.48')
        .from('.hero-rail, .hero-caption', {autoAlpha: 0, duration: .8}, '-=.4');

      const heroVideo = $('.hero-video');
      if (heroVideo) {
        gsap.fromTo(heroVideo, {scale: 1.035}, {scale: 1.09, duration: 18, ease: 'none', repeat: -1, yoyo: true});
      }

      // Reveal with real depth on scroll: images drift at a different speed to their copy.
      $$('.reveal').forEach((element, index) => {
        gsap.fromTo(element, {autoAlpha: 0, y: 32, rotateX: 2}, {
          autoAlpha: 1, y: 0, rotateX: 0, duration: .9, delay: (index % 3) * .07,
          ease: 'power3.out',
          scrollTrigger: {trigger: element, start: 'top 88%', once: true}
        });
      });
      if (heroVideo) gsap.to(heroVideo, {yPercent: 7, ease: 'none', scrollTrigger: {trigger: '.hero-cinema', start: 'top top', end: 'bottom top', scrub: .7}});
      if ($('.history-intro')) gsap.to('.history-intro > img', {yPercent: -9, scale: 1.1, ease: 'none', scrollTrigger: {trigger: '.history-intro', start: 'top top', end: 'bottom top', scrub: .8}});
      if ($('.manifesto-image-wrap')) gsap.to('.manifesto-image-wrap img', {yPercent: -13, scale: 1.16, ease: 'none', scrollTrigger: {trigger: '.manifesto-image-wrap', start: 'top bottom', end: 'bottom top', scrub: .8}});
      if ($('.quote-band')) gsap.to('.quote-band > img', {yPercent: -11, scale: 1.23, ease: 'none', scrollTrigger: {trigger: '.quote-band', start: 'top bottom', end: 'bottom top', scrub: .8}});
      if ($('.campaign-photo')) gsap.to('.campaign-photo img', {yPercent: -12, scale: 1.17, ease: 'none', scrollTrigger: {trigger: '.campaign-photo', start: 'top bottom', end: 'bottom top', scrub: .7}});
      if ($('.quote-content')) gsap.fromTo('.quote-content blockquote', {scale: .84, y: 45, autoAlpha: .35}, {scale: 1, y: 0, autoAlpha: 1, ease: 'none', scrollTrigger: {trigger: '.quote-band', start: 'top 80%', end: 'center center', scrub: .8}});
      if ($('.lookbook-panel')) gsap.to('.lookbook-art img', {yPercent: -7, scale: 1.16, ease: 'none', scrollTrigger: {trigger: '.lookbook-panel', start: 'top bottom', end: 'bottom top', scrub: .7}});
      if ($('.proof-strip')) gsap.fromTo('.proof-seal', {rotation: -28, scale: .65}, {rotation: 9, scale: 1, ease: 'none', scrollTrigger: {trigger: '.proof-strip', start: 'top 85%', end: 'center center', scrub: .7}});
      ScrollTrigger.create({start: 0, end: 'max', onUpdate: self => gsap.set('.reading-progress span', {scaleX: self.progress})});

      // The story pauses for a moment: three inner objections give way to a decision.
      if ($('.direction-section')) mm.add('(min-width: 761px)', () => {
        const steps = $$('.direction-step');
        const images = $$('.direction-image');
        gsap.set(steps.slice(1), {autoAlpha: 0, y: 20});
        gsap.set(images.slice(1), {autoAlpha: 0, scale: .94, clipPath: 'inset(8% 8% 8% 8%)'});
        const story = gsap.timeline({scrollTrigger: {
          trigger: '.direction-section', start: 'top top', end: '+=190%', scrub: .8,
          pin: '.direction-pin', pinSpacing: true, anticipatePin: 1, invalidateOnRefresh: true
        }});
        for (let i = 1; i < steps.length; i++) {
          const at = (i - 1) * .9;
          story.to(steps[i - 1], {autoAlpha: 0, y: -18, duration: .35}, at)
            .to(steps[i], {autoAlpha: 1, y: 0, duration: .4}, at + .12)
            .to(images[i - 1], {autoAlpha: 0, scale: .96, duration: .6}, at)
            .to(images[i], {autoAlpha: 1, scale: 1, clipPath: 'inset(0% 0% 0% 0%)', duration: .7}, at + .08);
          story.fromTo(images[i].querySelector('img'), {scale: 1.12}, {scale: 1, duration: .7}, at + .08)
            .call(() => { $('.direction-photo-index b').textContent = String(i + 1).padStart(2, '0'); }, null, at + .08);
        }
        return () => story.scrollTrigger?.kill();
      });

      // A little tactile depth on product cards for mouse users only.
      mm.add('(pointer: fine) and (min-width: 761px)', () => {
        $$('.product-card').forEach(card => {
          const image = $('.product-image-button img', card);
          const moveX = gsap.quickTo(image, 'x', {duration: .5, ease: 'power3.out'});
          const moveY = gsap.quickTo(image, 'y', {duration: .5, ease: 'power3.out'});
          const scale = gsap.quickTo(image, 'scale', {duration: .5, ease: 'power3.out'});
          card.addEventListener('pointermove', event => {
            const rect = card.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width - .5;
            const y = (event.clientY - rect.top) / rect.height - .5;
            moveX(x * 11); moveY(y * 9); scale(1.045);
          });
          card.addEventListener('pointerleave', () => { moveX(0); moveY(0); scale(1); });
        });
      });
    } else {
      // Reduced motion keeps the full story visible without pinned or looping movement.
      gsap.set('.hero-scene', {autoAlpha: 1});
      heroVideo?.pause();
      gsap.set('.reveal', {autoAlpha: 1, y: 0, rotateX: 0});
      gsap.set('.direction-step', {autoAlpha: 1, y: 0});
      gsap.set('.direction-image', {autoAlpha: 0});
      gsap.set('.direction-image:first-child', {autoAlpha: 1});
      gsap.set('.reading-progress span', {scaleX: 0});
    }
  } else {
    // Graceful fallback if the CDN is unavailable.
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
    }), {threshold: .12});
    $$('.reveal').forEach(element => observer.observe(element));
  }

  // Mobile navigation.
  const menuButton = $('.menu-toggle');
  const nav = $('.main-nav');
  menuButton.addEventListener('click', () => {
    const expanded = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!expanded));
    nav.classList.toggle('open', !expanded);
  });
  $$('.main-nav a').forEach(link => link.addEventListener('click', () => {
    menuButton.setAttribute('aria-expanded', 'false');
    nav.classList.remove('open');
  }));

  // Collection filters.
  $$('.filter-tab').forEach(button => button.addEventListener('click', () => {
    $$('.filter-tab').forEach(tab => tab.classList.toggle('active', tab === button));
    const filter = button.dataset.filter;
    $$('.product-card').forEach(card => {
      const shouldHide = filter !== 'all' && card.dataset.color !== filter;
      if (hasGSAP && !reducedMotion.matches) {
        gsap.killTweensOf(card);
        if (shouldHide) gsap.to(card, {autoAlpha: 0, scale: .97, duration: .22, onComplete: () => card.classList.add('is-hidden')});
        else { card.classList.remove('is-hidden'); gsap.fromTo(card, {autoAlpha: 0, y: 16, scale: .98}, {autoAlpha: 1, y: 0, scale: 1, duration: .38, ease: 'power2.out'}); }
      } else card.classList.toggle('is-hidden', shouldHide);
    });
  }));

  $('.bag-button')?.addEventListener('click', () => {
    announce('La collection sera bientôt disponible. Écris-nous pour être prévenu·e.');
    const contact = $('#contact');
    if (contact) setTimeout(() => contact.scrollIntoView({behavior: reducedMotion.matches ? 'auto' : 'smooth'}), 450);
    else window.location.href = 'index.html#contact';
  });

  $('#contact-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const name = $('#name').value.trim();
    const email = $('#email').value.trim();
    const message = $('#message').value.trim();
    const subject = encodeURIComponent(`Message de ${name} — site UNLIVED`);
    const body = encodeURIComponent(`${message}\n\n— ${name}\n${email}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  });
})();
