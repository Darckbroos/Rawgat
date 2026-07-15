// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const nav = document.getElementById('nav');

navToggle.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('is-open');
  navToggle.classList.toggle('is-active', isOpen);
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

nav.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    nav.classList.remove('is-open');
    navToggle.classList.remove('is-active');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

// Scroll reveal (reusable so dynamically-rendered product cards get it too)
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

function attachReveal(el) {
  el.setAttribute('data-reveal', '');
  revealObserver.observe(el);
}

document.querySelectorAll('.feature-card, .testimonial, .story__inner, .section-head')
  .forEach(attachReveal);

// Newsletter form (front-end only placeholder)
const form = document.getElementById('newsletterForm');
const note = document.getElementById('newsletterNote');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  form.reset();
  note.hidden = false;
});

// 3D tilt on cards (mouse-driven perspective) — reusable for dynamic cards
const prefersFinePointer = window.matchMedia('(pointer: fine)').matches;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const tiltEnabled = prefersFinePointer && !prefersReducedMotion;

function attachTilt(card) {
  if (!tiltEnabled) return;
  const strength = 12;

  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const rotateY = (px - 0.5) * strength;
    const rotateX = (0.5 - py) * strength;
    card.style.transform = `translateY(-6px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    card.style.boxShadow = `${-rotateY * 1.5}px ${18 - rotateX}px 34px rgba(18,24,29,0.18)`;
  });

  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
    card.style.boxShadow = '';
  });
}

document.querySelectorAll('[data-tilt]').forEach(attachTilt);

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

// ---------------- Dynamic content from the admin API ----------------

// El nombre/descripción/código vienen del panel admin y se insertan con
// innerHTML (para poder combinarlos con markup como <strong>/<span>), así
// que se escapan primero para que nunca se interpreten como HTML/script.
function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

const PRODUCT_ICONS = {
  pants: '<path d="M22 8h20l3 10-7 3v35h-6V27l-4-2-4 2v29h-6V21l-7-3 3-10Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>',
  hoodie: '<path d="M20 14 12 20v8h6v26h28V28h6v-8l-8-6h-6a6 6 0 0 1-12 0Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>',
  shirt: '<path d="M22 10h20l6 8-8 6v30H24V24l-8-6 6-8Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>',
  chalkbag: '<path d="M32 12c8 0 14 6 14 14 0 10-6 16-14 24-8-8-14-14-14-24 0-8 6-14 14-14Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M25 24h14" stroke="currentColor" stroke-width="2.5"/>',
  tech: '<circle cx="32" cy="36" r="18" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M32 36 32 24 M32 36 40 41" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M24 10h16l-3 8H27Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>'
};
const MEDIA_CLASSES = ['product-card__media--1', 'product-card__media--2', 'product-card__media--3', 'product-card__media--4'];
const money = (value) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);

// El descuento guarda solo "AAAA-MM-DD"; lo tratamos como vigente hasta el
// final de ese día (mismo criterio que usa el servidor) y devolvemos un
// texto corto tipo "Quedan 2 días" / "Último día" / "" si ya no queda tiempo.
function formatRemaining(expiresAt) {
  if (!expiresAt) return '';
  const end = new Date(expiresAt);
  end.setUTCHours(23, 59, 59, 999);
  const diffMs = end.getTime() - Date.now();
  if (diffMs <= 0) return '';

  const days = Math.floor(diffMs / 86400000);
  if (days >= 1) return `Quedan ${days} día${days === 1 ? '' : 's'}`;

  const hours = Math.floor(diffMs / 3600000);
  if (hours >= 1) return `Quedan ${hours} hora${hours === 1 ? '' : 's'}`;

  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  return `Quedan ${minutes} minuto${minutes === 1 ? '' : 's'}`;
}

function updateCountdowns() {
  document.querySelectorAll('.countdown[data-expires]').forEach(el => {
    const remaining = formatRemaining(el.dataset.expires);
    el.textContent = remaining ? `· ${remaining}` : '';
  });
}
setInterval(updateCountdowns, 60000);

const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const CLOTHING_CATEGORIES = ['Pantalones', 'Poleras'];

function renderProducts(products) {
  const grid = document.getElementById('collectionGrid');
  if (!grid) return;

  const filtered = products.filter(p => {
    if (currentFilter.type === 'category') return p.category === currentFilter.value;
    if (currentFilter.value === 'Todos') return true;
    return p.audience === currentFilter.value || p.audience === 'Unisex';
  });

  if (!filtered.length) {
    grid.innerHTML = '<p class="collection__loading">No hay productos para este filtro todavía.</p>';
    return;
  }

  grid.innerHTML = filtered.map((p, i) => {
    const discount = p.discount;
    const priceHtml = discount
      ? `<span class="price__original">${money(p.price)}</span> ${money(p.finalPrice)}`
      : money(p.price);
    const outOfStock = Number(p.stock) <= 0;
    const sizes = Array.isArray(p.sizes) ? p.sizes : [];
    const showSizePicker = CLOTHING_CATEGORIES.includes(p.category) && !outOfStock;
    const sizeOptions = CLOTHING_SIZES.map(size => {
      const entry = sizes.find(s => s.size === size);
      const stock = entry ? entry.stock : 0;
      return `<option value="${size}" ${stock <= 0 ? 'disabled' : ''}>${size}${stock <= 0 ? ' (agotado)' : ''}</option>`;
    }).join('');

    return `
    <article class="product-card" data-tilt>
      <div class="product-card__media ${MEDIA_CLASSES[i % MEDIA_CLASSES.length]}">
        ${outOfStock ? `<span class="tag tag--stock">Agotado</span>` : (p.tag ? `<span class="tag">${escapeHtml(p.tag)}</span>` : '')}
        ${discount ? `<span class="tag tag--discount">-${Number(discount.percent) || 0}%</span>` : ''}
        ${p.image
          ? `<img class="product-card__photo" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}">`
          : `<svg class="product-card__icon" viewBox="0 0 64 64">${PRODUCT_ICONS[p.icon] || PRODUCT_ICONS.shirt}</svg>`}
      </div>
      <div class="product-card__body">
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.description || '')}</p>
        ${showSizePicker ? `<select class="size-select" data-size-select="${p.id}">${sizeOptions}</select>` : ''}
        <div class="product-card__row">
          <span class="price">${priceHtml}</span>
          <button type="button" class="btn btn--sm btn--primary" data-add-to-cart="${p.id}" ${outOfStock ? 'disabled' : ''}>${outOfStock ? 'Agotado' : 'Agregar'}</button>
        </div>
        ${discount ? `<p class="product-card__countdown">Código ${escapeHtml(discount.code)} <span class="countdown" data-expires="${escapeHtml(discount.expiresAt || '')}"></span></p>` : ''}
      </div>
    </article>
  `;
  }).join('');

  grid.querySelectorAll('.product-card').forEach(card => {
    attachTilt(card);
    attachReveal(card);
  });
  updateCountdowns();
}

let PRODUCTS = [];
let currentFilter = { type: 'audience', value: 'Todos' };

document.getElementById('audienceFilters')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-audience], [data-category]');
  if (!btn) return;
  currentFilter = btn.dataset.category
    ? { type: 'category', value: btn.dataset.category }
    : { type: 'audience', value: btn.dataset.audience };
  document.querySelectorAll('#audienceFilters button').forEach(b => {
    b.classList.toggle('is-active', b === btn);
  });
  renderProducts(PRODUCTS);
});

fetch('/api/products')
  .then(res => res.json())
  .then(products => {
    PRODUCTS = products;
    renderProducts(products);
    renderCart();
  })
  .catch(() => {
    const grid = document.getElementById('collectionGrid');
    if (grid) grid.innerHTML = '<p class="collection__loading">No se pudo cargar la colección. Intenta de nuevo más tarde.</p>';
  });

fetch('/api/discounts/active')
  .then(res => res.json())
  .then(discount => {
    const topbar = document.getElementById('topbar');
    const heading = document.getElementById('newsletterHeading');

    if (!discount) {
      if (topbar) topbar.textContent = 'Envío gratis en Europa por compras sobre 60€ · Devoluciones dentro de 30 días';
      if (heading) heading.textContent = 'Súmate y entérate primero de nuestros descuentos';
      return;
    }

    const percent = Number(discount.percent) || 0;
    const code = escapeHtml(discount.code);
    const countdownSpan = `<span class="countdown" data-expires="${escapeHtml(discount.expiresAt || '')}"></span>`;
    if (topbar) {
      topbar.innerHTML = `Usa el código <strong>${code}</strong> y llévate ${percent}% de descuento ${countdownSpan}`;
    }
    if (heading) {
      heading.innerHTML = `${percent}% de descuento con el código ${code} ${countdownSpan}`;
    }
    updateCountdowns();
  })
  .catch(() => {});

fetch('/api/track-visit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: window.location.pathname })
}).catch(() => {});

// ---------------- Shopping cart (localStorage, sin página aparte) ----------------

const CART_KEY = 'rawgat_cart';

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || {};
  } catch {
    return {};
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

let cart = loadCart();

const cartBtn = document.getElementById('cartBtn');
const cartCount = document.getElementById('cartCount');
const cartOverlay = document.getElementById('cartOverlay');
const cartDrawer = document.getElementById('cartDrawer');
const cartClose = document.getElementById('cartClose');
const cartBody = document.getElementById('cartBody');
const cartFooter = document.getElementById('cartFooter');
const cartTotalEl = document.getElementById('cartTotal');

function cartItemCount() {
  return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
}

function updateCartBadge() {
  const count = cartItemCount();
  cartCount.textContent = count;
  cartCount.hidden = count === 0;
}

function findProduct(id) {
  return PRODUCTS.find(p => p.id === Number(id));
}

function unitPrice(product) {
  return product.discount ? product.finalPrice : product.price;
}

// El carrito distingue por talla: dos tallas del mismo producto son líneas
// separadas, cada una con su propio stock disponible.
function cartKey(id, size) {
  return `${id}::${size || 'Única'}`;
}

function parseCartKey(key) {
  const [id, size] = key.split('::');
  return { id, size };
}

function sizeStock(product, size) {
  if (!product) return 0;
  const entry = (product.sizes || []).find(s => s.size === size);
  return entry ? entry.stock : 0;
}

function renderCart() {
  const keys = Object.keys(cart).filter(key => cart[key] > 0);

  if (!keys.length) {
    cartBody.innerHTML = '<p class="cart-drawer__empty">Tu carrito está vacío.</p>';
    cartFooter.hidden = true;
    updateCartBadge();
    return;
  }

  let total = 0;
  cartBody.innerHTML = keys.map(key => {
    const { id, size } = parseCartKey(key);
    const product = findProduct(id);
    if (!product) return '';
    const qty = cart[key];
    const price = unitPrice(product);
    total += price * qty;
    const sizeLabel = size && size !== 'Única' ? ` · Talla ${escapeHtml(size)}` : '';
    return `
      <div class="cart-item" data-key="${escapeHtml(key)}">
        <div class="cart-item__info">
          <strong>${escapeHtml(product.name)}</strong>
          <span>${money(price)} c/u${sizeLabel}</span>
        </div>
        <div class="cart-item__qty">
          <button type="button" data-qty-down="${escapeHtml(key)}" aria-label="Restar unidad">−</button>
          <span>${qty}</span>
          <button type="button" data-qty-up="${escapeHtml(key)}" aria-label="Sumar unidad">+</button>
        </div>
        <button type="button" class="cart-item__remove" data-remove="${escapeHtml(key)}" aria-label="Quitar producto">&times;</button>
      </div>
    `;
  }).join('');

  cartTotalEl.textContent = money(total);
  cartFooter.hidden = false;
  updateCartBadge();
  scheduleRenderPaypalButtons(total, keys);
}

function addToCart(id, size) {
  const key = cartKey(id, size);
  const product = findProduct(id);
  const maxStock = product ? sizeStock(product, size || 'Única') : Infinity;
  const next = (cart[key] || 0) + 1;
  if (next > maxStock) {
    alert('No queda más stock disponible de esta talla.');
    return;
  }
  cart[key] = next;
  saveCart();
  renderCart();
  openCart();
}

function changeQty(key, delta) {
  const { id, size } = parseCartKey(key);
  const product = findProduct(id);
  const maxStock = product ? sizeStock(product, size) : Infinity;
  const next = (cart[key] || 0) + delta;
  if (delta > 0 && next > maxStock) {
    alert('No queda más stock disponible de esta talla.');
    return;
  }
  if (next <= 0) delete cart[key];
  else cart[key] = next;
  saveCart();
  renderCart();
}

function removeFromCart(key) {
  delete cart[key];
  saveCart();
  renderCart();
}

function openCart() {
  cartDrawer.classList.add('is-open');
  cartOverlay.classList.add('is-open');
  cartDrawer.setAttribute('aria-hidden', 'false');
}

function closeCart() {
  cartDrawer.classList.remove('is-open');
  cartOverlay.classList.remove('is-open');
  cartDrawer.setAttribute('aria-hidden', 'true');
}

cartBtn.addEventListener('click', () => {
  renderCart();
  openCart();
});
cartClose.addEventListener('click', closeCart);
cartOverlay.addEventListener('click', closeCart);

cartBody.addEventListener('click', (e) => {
  const upId = e.target.dataset.qtyUp;
  const downId = e.target.dataset.qtyDown;
  const removeId = e.target.dataset.remove;
  if (upId) changeQty(upId, 1);
  if (downId) changeQty(downId, -1);
  if (removeId) removeFromCart(removeId);
});

document.addEventListener('click', (e) => {
  const addBtn = e.target.closest('[data-add-to-cart]');
  if (addBtn) {
    const card = addBtn.closest('.product-card');
    const sizeSelect = card ? card.querySelector('[data-size-select]') : null;
    addToCart(addBtn.dataset.addToCart, sizeSelect ? sizeSelect.value : 'Única');
  }
});

updateCartBadge();

// ---------------- PayPal checkout (sandbox/demo, sin cobros reales) ----------------

let paypalConfig = null;
let paypalSdkPromise = null;
let paypalRenderTimeout = null;

function loadPaypalSdk() {
  if (paypalSdkPromise) return paypalSdkPromise;
  paypalSdkPromise = fetch('/api/checkout/config')
    .then(res => res.json())
    .then(config => {
      paypalConfig = config;
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(config.clientId)}&currency=${encodeURIComponent(config.currency)}&intent=capture`;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    });
  return paypalSdkPromise;
}

function scheduleRenderPaypalButtons(total, keys) {
  clearTimeout(paypalRenderTimeout);
  paypalRenderTimeout = setTimeout(() => renderPaypalButtons(total, keys), 250);
}

function renderPaypalButtons(total, keys) {
  const container = document.getElementById('paypalButtons');
  if (!container || !total) return;

  loadPaypalSdk().then(() => {
    container.innerHTML = '';
    window.paypal.Buttons({
      style: { shape: 'pill', color: 'black', layout: 'vertical', label: 'paypal' },
      createOrder: (data, actions) => actions.order.create({
        purchase_units: [{ amount: { currency_code: paypalConfig.currency, value: total.toFixed(2) } }]
      }),
      onApprove: (data, actions) => actions.order.capture()
        .then(() => fetch('/api/checkout/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: keys.map(key => { const { id, size } = parseCartKey(key); return { id, qty: cart[key], size }; }),
            paypalOrderId: data.orderID
          })
        }))
        .then(() => {
          cart = {};
          saveCart();
          cartBody.innerHTML = '<p class="cart-drawer__empty">¡Gracias por tu compra! (pago de prueba, sin cobro real)</p>';
          cartFooter.hidden = true;
          updateCartBadge();
        }),
      onError: (err) => {
        console.error('PayPal error', err);
        alert('Ocurrió un error con el pago de prueba. Intenta de nuevo.');
      }
    }).render('#paypalButtons');
  });
}
