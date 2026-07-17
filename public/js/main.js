// Lógica exclusiva de la portada: hero, contadores, vitrina de colección y
// sus filtros. El carrito, la cuenta y el buscador viven en shared.js (se
// carga antes que este archivo) porque también los usa la ficha de producto.

document.querySelectorAll('.feature-card, .testimonial, .story__inner, .section-head')
  .forEach(attachReveal);

// 3D tilt en el hero/story (los de las tarjetas de producto se activan en
// productCardHtml/renderProducts, vía attachTilt de shared.js)
if (tiltEnabled) {
  // Hero parallax: cursor moves mountains, badge and floating shapes on different depths
  const hero = document.getElementById('inicio');
  const heroGlow = document.getElementById('heroGlow');
  const heroLayers = hero.querySelectorAll('[data-depth]');

  hero.addEventListener('mousemove', (e) => {
    const rect = hero.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;

    heroGlow.style.setProperty('--mx', `${px * 100}%`);
    heroGlow.style.setProperty('--my', `${py * 100}%`);

    heroLayers.forEach(layer => {
      const depth = parseFloat(layer.dataset.depth) || 10;
      const x = (px - 0.5) * depth;
      const y = (py - 0.5) * depth;
      layer.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    });
  });

  hero.addEventListener('mouseleave', () => {
    heroLayers.forEach(layer => { layer.style.transform = ''; });
  });
}

// Count-up animation for hero stats
const counters = document.querySelectorAll('[data-count]');

const animateCount = (el) => {
  const target = parseFloat(el.dataset.count);
  const prefix = el.dataset.prefix || '';
  const suffix = el.dataset.suffix || '';
  const duration = 1400;
  const start = performance.now();

  const step = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.floor(target * eased);
    el.textContent = `${prefix}${value.toLocaleString('es-ES')}${suffix}`;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animateCount(entry.target);
      counterObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.4 });

counters.forEach(el => counterObserver.observe(el));

// ---------------- Vitrina de colección ----------------

// El precio "efectivo" para ordenar: el rebajado si el descuento ya está
// desbloqueado (con sesión iniciada), el de lista si no — el mismo que ve
// la persona en la tarjeta, para que "menor a mayor" no la contradiga.
function effectivePrice(p) {
  return p.discount && !p.discountLocked ? p.finalPrice : p.price;
}

let currentSort = 'relevancia';

function sortProducts(list) {
  if (currentSort === 'novedad') {
    return [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  if (currentSort === 'precio-asc') {
    return [...list].sort((a, b) => effectivePrice(a) - effectivePrice(b));
  }
  if (currentSort === 'precio-desc') {
    return [...list].sort((a, b) => effectivePrice(b) - effectivePrice(a));
  }
  return list;
}

// Filtros secundarios: se combinan con el filtro principal (nav/búsqueda)
// en vez de reemplazarlo, para poder cruzar por ejemplo "Mujer" + "Solo
// rebajas" + talla M al mismo tiempo.
const activeSizeFilters = new Set();
let activePriceBucket = '';
let onlyDiscounted = false;

function priceInBucket(price, bucket) {
  if (bucket === '0-25') return price < 25;
  if (bucket === '25-50') return price >= 25 && price < 50;
  if (bucket === '50-75') return price >= 50 && price < 75;
  if (bucket === '75+') return price >= 75;
  return true;
}

function hasSecondaryFilters() {
  return activeSizeFilters.size > 0 || !!activePriceBucket || onlyDiscounted;
}

function applySecondaryFilters(list) {
  return list.filter(p => {
    if (onlyDiscounted && !p.discount) return false;
    if (activePriceBucket && !priceInBucket(effectivePrice(p), activePriceBucket)) return false;
    if (activeSizeFilters.size) {
      const sizes = Array.isArray(p.sizes) ? p.sizes : [];
      const hasStock = [...activeSizeFilters].some(size => {
        const entry = sizes.find(s => s.size === size);
        return entry && entry.stock > 0;
      });
      if (!hasStock) return false;
    }
    return true;
  });
}

function renderProducts(products) {
  const grid = document.getElementById('collectionGrid');
  if (!grid) return;

  const filtered = products.filter(p => {
    if (currentFilter.type === 'search') return matchesSearch(p, currentFilter.value);
    if (currentFilter.type === 'sale') return !!p.discount;
    if (currentFilter.type === 'category') return p.category === currentFilter.value;
    if (currentFilter.value === 'Todos') return true;
    return p.audience === currentFilter.value || p.audience === 'Unisex';
  });

  const refined = applySecondaryFilters(filtered);

  if (!refined.length) {
    if (!filtered.length) {
      grid.innerHTML = currentFilter.type === 'search'
        ? `<p class="collection__loading">No encontramos productos para “${escapeHtml(currentFilter.value)}”.</p>`
        : '<p class="collection__loading">No hay productos para este filtro todavía.</p>';
    } else {
      grid.innerHTML = '<p class="collection__loading">Ningún producto combina estos filtros. Probá quitando alguno.</p>';
    }
    return;
  }

  const sorted = sortProducts(refined);
  grid.innerHTML = sorted.map((p, i) => productCardHtml(p, i)).join('');

  grid.querySelectorAll('.product-card').forEach(card => {
    attachTilt(card);
    attachReveal(card);
  });
  updateCountdowns();
}

let currentFilter = { type: 'audience', value: 'Todos' };

const collectionEyebrowEl = document.getElementById('collectionEyebrow');
const collectionHeadingEl = document.getElementById('collectionHeading');
const DEFAULT_COLLECTION_EYEBROW = collectionEyebrowEl ? collectionEyebrowEl.textContent : 'Colección';
const DEFAULT_COLLECTION_HEADING = collectionHeadingEl ? collectionHeadingEl.textContent : 'Equípate para la aventura';

function resetCollectionHeading() {
  if (collectionEyebrowEl) collectionEyebrowEl.textContent = DEFAULT_COLLECTION_EYEBROW;
  if (collectionHeadingEl) collectionHeadingEl.textContent = DEFAULT_COLLECTION_HEADING;
}

function showSearchHeading(query) {
  if (collectionEyebrowEl) collectionEyebrowEl.textContent = 'Resultados de búsqueda';
  if (collectionHeadingEl) collectionHeadingEl.textContent = `“${query}”`;
}

// Las mismas categorías se eligen desde el menú superior (como en las tiendas
// de la competencia) y desde los chips sobre la colección — un solo lugar
// decide el filtro, para que ambos queden sincronizados.
function applyCollectionFilter(el) {
  closeSearch();
  if (el.dataset.sale) currentFilter = { type: 'sale', value: true };
  else if (el.dataset.category) currentFilter = { type: 'category', value: el.dataset.category };
  else currentFilter = { type: 'audience', value: el.dataset.audience };

  resetCollectionHeading();
  document.querySelectorAll('#nav [data-audience], #nav [data-category], #nav [data-sale]').forEach(link => {
    const sameFilter = el.dataset.sale
      ? !!link.dataset.sale
      : el.dataset.category
        ? link.dataset.category === el.dataset.category
        : link.dataset.audience === el.dataset.audience;
    link.classList.toggle('is-active', sameFilter);
  });
  renderProducts(PRODUCTS);
}

document.querySelectorAll('#nav [data-audience], #nav [data-category], #nav [data-sale]').forEach(link => {
  link.addEventListener('click', () => applyCollectionFilter(link));
});

const collectionSortEl = document.getElementById('collectionSort');
if (collectionSortEl) {
  collectionSortEl.addEventListener('change', () => {
    currentSort = collectionSortEl.value;
    renderProducts(PRODUCTS);
  });
}

const clearFiltersBtn = document.getElementById('clearFiltersBtn');

function updateClearFiltersVisibility() {
  if (clearFiltersBtn) clearFiltersBtn.hidden = !hasSecondaryFilters();
}

document.getElementById('sizeFilterChips')?.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-size-filter]');
  if (!chip) return;
  const size = chip.dataset.sizeFilter;
  if (activeSizeFilters.has(size)) {
    activeSizeFilters.delete(size);
    chip.classList.remove('is-active');
  } else {
    activeSizeFilters.add(size);
    chip.classList.add('is-active');
  }
  updateClearFiltersVisibility();
  renderProducts(PRODUCTS);
});

document.getElementById('priceFilterSelect')?.addEventListener('change', (e) => {
  activePriceBucket = e.target.value;
  updateClearFiltersVisibility();
  renderProducts(PRODUCTS);
});

document.getElementById('discountFilterCheckbox')?.addEventListener('change', (e) => {
  onlyDiscounted = e.target.checked;
  updateClearFiltersVisibility();
  renderProducts(PRODUCTS);
});

clearFiltersBtn?.addEventListener('click', () => {
  activeSizeFilters.clear();
  activePriceBucket = '';
  onlyDiscounted = false;
  document.querySelectorAll('#sizeFilterChips [data-size-filter]').forEach(chip => chip.classList.remove('is-active'));
  const priceSelect = document.getElementById('priceFilterSelect');
  if (priceSelect) priceSelect.value = '';
  const discountCheckbox = document.getElementById('discountFilterCheckbox');
  if (discountCheckbox) discountCheckbox.checked = false;
  updateClearFiltersVisibility();
  renderProducts(PRODUCTS);
});

// Gancho que usa shared.js: cuando alguien busca desde cualquier página, si
// ya está en la portada filtra la vitrina en el sitio; si no, lo trae acá
// con el término en la URL (ver más abajo, ?buscar=).
window.rawgatApplySearch = function applySearch(query) {
  currentFilter = { type: 'search', value: query };
  document.querySelectorAll('#nav [data-audience], #nav [data-category], #nav [data-sale]').forEach(link => {
    link.classList.remove('is-active');
  });
  showSearchHeading(query);
  renderProducts(PRODUCTS);
  document.getElementById('coleccion').scrollIntoView({ behavior: 'smooth' });
};

document.addEventListener('rawgat:products', (e) => {
  renderProducts(e.detail);

  // Filtro o búsqueda iniciados desde otra página (ej. el menú de la ficha
  // de producto): se aplica apenas llega el catálogo, sin recargar de nuevo.
  const params = new URLSearchParams(window.location.search);
  const query = params.get('buscar');
  const audiencia = params.get('audiencia');
  const categoria = params.get('categoria');
  if (query) {
    window.rawgatApplySearch(query);
  } else if (audiencia) {
    const link = document.querySelector(`#nav [data-audience="${CSS.escape(audiencia)}"]`);
    if (link) applyCollectionFilter(link);
  } else if (categoria) {
    const link = document.querySelector(`#nav [data-category="${CSS.escape(categoria)}"]`);
    if (link) applyCollectionFilter(link);
  } else if (params.get('rebajas')) {
    const link = document.querySelector('#nav [data-sale]');
    if (link) applyCollectionFilter(link);
  }
});

document.addEventListener('rawgat:products-error', () => {
  const grid = document.getElementById('collectionGrid');
  if (grid) grid.innerHTML = '<p class="collection__loading">No se pudo cargar la colección. Intenta de nuevo más tarde.</p>';
});

document.addEventListener('rawgat:discount', (e) => {
  const heading = document.getElementById('newsletterHeading');
  if (!heading) return;
  const discount = e.detail;
  if (!discount) {
    heading.textContent = 'Súmate y entérate primero de nuestros descuentos';
    return;
  }
  const percent = Number(discount.percent) || 0;
  const code = escapeHtml(discount.code);
  heading.innerHTML = `Regístrate y obtén ${percent}% de descuento con el código ${code} <span class="countdown" data-expires="${escapeHtml(discount.expiresAt || '')}"></span>`;
  updateCountdowns();
});
