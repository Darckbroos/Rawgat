// Lógica exclusiva de la portada. El carrito, la cuenta y las utilidades de
// producto/huecos viven en shared.js (se carga antes que este archivo).

// Aparición al hacer scroll (ver attachReveal en shared.js: el contenido es
// visible por defecto y se respeta "reducir movimiento").
document.querySelectorAll('.section-head, .design-card, .made-step, .made__closing, .story__inner, .reviews__empty, .newsletter__inner')
  .forEach(attachReveal);

// ---------------- Collection: 2 lugares fijos ----------------
// La maqueta no lleva productos escritos a mano: cada lugar se llena con un
// producto activo cargado desde el admin. Mientras no lo haya, queda el
// hueco de producto ("Coming soon").
const COLLECTION_SLOTS = 2;

function renderCollection(products) {
  const grid = document.getElementById('collectionGrid');
  if (!grid) return;
  const list = Array.isArray(products) ? products.slice(0, COLLECTION_SLOTS) : [];
  const cards = [];
  for (let i = 0; i < COLLECTION_SLOTS; i++) {
    cards.push(list[i] ? productCardHtml(list[i], i) : productPlaceholderHtml());
  }
  grid.innerHTML = cards.join('');
  grid.querySelectorAll('.product-card').forEach(attachReveal);
}

// Estado inicial (antes de que responda el API): huecos.
renderCollection([]);

document.addEventListener('rawgat:products', (e) => {
  renderCollection(e.detail);
});

document.addEventListener('rawgat:products-error', () => {
  renderCollection([]);
});

// ---------------- How it's made: loops de vídeo (IMG-11, IMG-12) ----------------
// Requisitos del informe: sin sonido, en bucle, sin controles, carga diferida
// (preload="none" y reproducción solo mientras la tarjeta está en pantalla),
// póster fijo con "reducir movimiento" y póster —nunca negro— si el vídeo
// falla. Sin librerías: IntersectionObserver nativo.
(function setupLoops() {
  const videos = document.querySelectorAll('video[data-loop]');
  if (!videos.length) return;

  // Si el vídeo no se puede reproducir, se cambia por su póster como imagen.
  const showPoster = (video) => {
    if (!video.isConnected) return;
    const img = document.createElement('img');
    img.className = 'make-step__media make-step__media--fallback';
    img.src = video.getAttribute('poster');
    img.alt = video.getAttribute('aria-label') || '';
    video.replaceWith(img);
  };

  videos.forEach(video => {
    // iPhone solo reproduce sin gesto si está silenciado e inline: se fuerza
    // también por propiedad, no solo por atributo.
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    const sources = video.querySelectorAll('source');
    const lastSource = sources[sources.length - 1];
    if (lastSource) lastSource.addEventListener('error', () => showPoster(video));
    video.addEventListener('error', () => showPoster(video));
  });

  // Con "reducir movimiento" no se reproduce nada: queda el póster.
  if (prefersReducedMotion || !('IntersectionObserver' in window)) return;

  const tryPlay = (video) => {
    const result = video.play();
    // Si el navegador bloquea la reproducción (modo ahorro, etc.) se queda el
    // póster visible: el vídeo nunca empezó, así que no hay recuadro negro.
    if (result && typeof result.catch === 'function') result.catch(() => {});
  };

  const loopObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const video = entry.target;
      if (entry.isIntersecting) tryPlay(video);
      else if (!video.paused) video.pause();
    });
  }, { threshold: 0.25 });

  videos.forEach(video => loopObserver.observe(video));

  // Pestaña en segundo plano: pausar; al volver, reanudar los visibles.
  document.addEventListener('visibilitychange', () => {
    videos.forEach(video => {
      if (!video.isConnected) return;
      if (document.hidden) video.pause();
    });
    if (!document.hidden) {
      videos.forEach(video => {
        if (!video.isConnected) return;
        const rect = video.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < window.innerHeight) tryPlay(video);
      });
    }
  });
})();
