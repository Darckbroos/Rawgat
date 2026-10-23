// Lógica común a todas las páginas del sitio (home y ficha de producto):
// menú móvil, utilidades de producto, carrito, cuenta de cliente y buscador.
// Cada página carga este archivo antes de su propio script y comparte el
// mismo ámbito global (sin módulos) — así el carrito es siempre el mismo
// carrito, esté la persona en la portada o en una ficha de producto.

// ---------------- Menú móvil ----------------
const navToggle = document.getElementById('navToggle');
const nav = document.getElementById('nav');

navToggle?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('is-open');
  navToggle.classList.toggle('is-active', isOpen);
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

nav?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    nav.classList.remove('is-open');
    navToggle.classList.remove('is-active');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

// ---------------- Scroll reveal / tilt (utilidades reusables) ----------------
const prefersFinePointer = window.matchMedia('(pointer: fine)').matches;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Aparición al hacer scroll. El contenido es visible por defecto: solo se
// oculta (vía CSS) cuando este script ya marcó el elemento como
// "pendiente" Y el sistema no pide reducir movimiento. Antes el texto
// quedaba casi blanco a mitad de scroll porque la transición dependía de un
// umbral del 15 % del elemento (en bloques altos tardaba en dispararse);
// ahora basta con que asome y la animación es corta.
const revealObserver = ('IntersectionObserver' in window && !prefersReducedMotion)
  ? new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.remove('is-pending');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0, rootMargin: '0px 0px -8% 0px' })
  : null;

function attachReveal(el) {
  if (!revealObserver) return;
  const rect = el.getBoundingClientRect();
  // Lo que ya está en pantalla al cargar no se anima: se ve tal cual.
  if (rect.top < window.innerHeight && rect.bottom > 0) return;
  el.setAttribute('data-reveal', '');
  el.classList.add('is-pending');
  revealObserver.observe(el);
}
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
document.querySelectorAll('[data-reveal-on-scroll]').forEach(attachReveal);

// Enlaces del pie sin página todavía (FAQ, Contact): no saltan al inicio.
document.addEventListener('click', (e) => {
  if (e.target.closest('a[data-pending-page]')) e.preventDefault();
});

// ---------------- Newsletter (si la página tiene el formulario) ----------------
const newsletterForm = document.getElementById('newsletterForm');
const newsletterNote = document.getElementById('newsletterNote');
if (newsletterForm) {
  newsletterForm.addEventListener('submit', (e) => {
    e.preventDefault();
    newsletterForm.reset();
    if (newsletterNote) newsletterNote.hidden = false;
  });
}

// ---------------- Utilidades de producto ----------------

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
const money = (value) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const CLOTHING_CATEGORIES = ['Pants', 'T-Shirts'];
const LOW_STOCK_THRESHOLD = 5;

// El descuento guarda solo "AAAA-MM-DD"; lo tratamos como vigente hasta el
// final de ese día (mismo criterio que usa el servidor) y devolvemos un
// texto corto tipo "2 days left" / "1 minute left" / "" si ya no queda tiempo.
function formatRemaining(expiresAt) {
  if (!expiresAt) return '';
  const end = new Date(expiresAt);
  end.setUTCHours(23, 59, 59, 999);
  const diffMs = end.getTime() - Date.now();
  if (diffMs <= 0) return '';

  const days = Math.floor(diffMs / 86400000);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`;

  const hours = Math.floor(diffMs / 3600000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'} left`;

  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  return `${minutes} minute${minutes === 1 ? '' : 's'} left`;
}

function updateCountdowns() {
  document.querySelectorAll('.countdown[data-expires]').forEach(el => {
    const remaining = formatRemaining(el.dataset.expires);
    el.textContent = remaining ? `· ${remaining}` : '';
  });
}
setInterval(updateCountdowns, 60000);

// Sin tildes ni mayúsculas: así "pantalon" encuentra "Pantalón" igual.
function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .trim();
}

function matchesSearch(product, query) {
  const needle = normalizeText(query);
  if (!needle) return false;
  const haystack = normalizeText(`${product.name} ${product.description || ''} ${product.category}`);
  return haystack.includes(needle);
}

// ---------------- Huecos de maqueta ----------------
// Hueco de imagen: rectángulo con la proporción final y su ID visible
// (ej. "IMG-07 · 16:9"). Cuando llegue la foto se reemplaza el hueco por la
// imagen sin tocar el layout. tone: 'light' (crema) o 'dark' (carbón).
function imageSlotHtml(id, ratio, tone = 'light', extraClass = '') {
  return `<div class="img-slot img-slot--${tone} ${extraClass}" style="--ratio:${ratio.replace(':', '/')}" role="img" aria-label="Image placeholder ${escapeHtml(id)}"><span>${escapeHtml(id)} · ${escapeHtml(ratio)}</span></div>`;
}

// Las 5 filas fijas de especificaciones (informe de maquetación). Los
// valores vienen del producto (p.specs.<clave>); una fila sin dato no se
// muestra.
const SPEC_ROWS = [
  ['edges', 'Edges'],
  ['dimensions', 'Dimensions'],
  ['weight', 'Weight'],
  ['material', 'Material'],
  ['mounting', 'Mounting']
];

function specsTableHtml(p, { placeholder = false } = {}) {
  if (placeholder) {
    return `<dl class="specs specs--placeholder">${SPEC_ROWS.map(([, label]) => `<div class="specs__row"><dt>${label}</dt><dd><span class="skeleton skeleton--short"></span></dd></div>`).join('')}</dl>`;
  }
  const specs = (p && p.specs) || {};
  const rows = SPEC_ROWS.filter(([key]) => specs[key] !== undefined && specs[key] !== null && String(specs[key]).trim() !== '');
  if (!rows.length) return '';
  return `<dl class="specs">${rows.map(([key, label]) => `<div class="specs__row"><dt>${label}</dt><dd>${escapeHtml(specs[key])}</dd></div>`).join('')}</dl>`;
}

// Línea de stock conectada al admin: "[X] left in this first batch". Su
// implementación (número real por lote) espera la estimación de coste del
// entregable 4 — por ahora se maqueta solo su lugar, marcado como hueco.
function stockLineHtml() {
  return '<p class="stock-line slot" data-slot="stock-line">[X] left in this first batch</p>';
}

function priceHtml(p) {
  const discount = p.discount;
  const locked = !!p.discountLocked;
  return discount && !locked
    ? `<span class="price__original">${money(p.price)}</span> ${money(p.finalPrice)}`
    : money(p.price);
}

// Tarjeta de producto de la Collection. Sin selector de talla ni filtros
// (informe): imagen 1:1, nombre, descripción, tabla de 5 especificaciones,
// precio + "Add to cart" y la línea de stock.
function productCardHtml(p, slotIndex = 0) {
  const outOfStock = !p.inStock;
  return `
    <article class="product-card">
      <a class="product-card__media" href="/producto/${p.id}">
        ${p.image
          ? `<img class="product-card__photo" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}">`
          : imageSlotHtml('IMG-01', '1:1', 'light')}
      </a>
      <div class="product-card__body">
        <h3><a href="/producto/${p.id}">${escapeHtml(p.name)}</a></h3>
        <p class="product-card__desc">${escapeHtml(p.description || '')}</p>
        ${specsTableHtml(p)}
        <div class="product-card__buy">
          <div class="product-card__row">
            <span class="price">${priceHtml(p)}</span>
            <button type="button" class="btn btn--primary" data-add-to-cart="${p.id}" ${outOfStock ? 'disabled' : ''}>${outOfStock ? 'Sold out' : 'Add to cart'}</button>
          </div>
          ${stockLineHtml()}
        </div>
      </div>
    </article>
  `;
}

// Hueco de producto: misma estructura que la tarjeta, sin datos. Se muestra
// mientras no haya un producto activo cargado desde el admin para ese lugar.
function productPlaceholderHtml() {
  return `
    <article class="product-card product-card--placeholder" aria-label="Product coming soon">
      <div class="product-card__media">${imageSlotHtml('IMG-01', '1:1', 'light')}</div>
      <div class="product-card__body">
        <h3><span class="skeleton skeleton--title"></span></h3>
        <p class="product-card__desc"><span class="skeleton"></span><span class="skeleton skeleton--mid"></span></p>
        ${specsTableHtml(null, { placeholder: true })}
        <div class="product-card__buy">
          <div class="product-card__row">
            <span class="price"><span class="skeleton skeleton--price"></span></span>
            <button type="button" class="btn btn--primary" disabled>Coming soon</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

// Columna "Shop" del pie de página: un enlace por producto (2 lugares),
// vacíos hasta cargar los productos desde el admin.
const FOOTER_SHOP_SLOTS = 2;
function renderFooterShop(products) {
  const col = document.getElementById('footerShopLinks');
  if (!col) return;
  const list = Array.isArray(products) ? products.slice(0, FOOTER_SHOP_SLOTS) : [];
  const links = [];
  for (let i = 0; i < FOOTER_SHOP_SLOTS; i++) {
    const p = list[i];
    links.push(p
      ? `<a href="/producto/${p.id}">${escapeHtml(p.name)}</a>`
      : '<span class="footer__link-slot" aria-hidden="true"><span class="skeleton skeleton--footer"></span></span>');
  }
  col.innerHTML = links.join('');
}
renderFooterShop([]);
document.addEventListener('rawgat:products', (e) => renderFooterShop(e.detail));

// ---------------- Catálogo (compartido entre carrito, búsqueda y vitrina) ----------------

let PRODUCTS = [];

function findProduct(id) {
  return PRODUCTS.find(p => p.id === Number(id));
}

fetch('/api/products')
  .then(res => res.json())
  .then(products => {
    PRODUCTS = products;
    document.dispatchEvent(new CustomEvent('rawgat:products', { detail: products }));
    renderCart();
  })
  .catch(() => {
    document.dispatchEvent(new CustomEvent('rawgat:products-error'));
  });

// El descuento activo ya no reescribe la barra superior (su texto es fijo
// según el informe). Se sigue emitiendo el evento por si alguna página lo
// necesita; el código de la newsletter llegará con el entregable 4.
fetch('/api/discounts/active')
  .then(res => res.json())
  .then(discount => {
    document.dispatchEvent(new CustomEvent('rawgat:discount', { detail: discount || null }));
  })
  .catch(() => {});

fetch('/api/track-visit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: window.location.pathname })
}).catch(() => {});

// ---------------- Carrito (localStorage, compartido entre páginas) ----------------

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
let currentCustomer = null;

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

function unitPrice(product) {
  const base = product.discount ? product.finalPrice : product.price;
  if (currentCustomer && !currentCustomer.welcomeDiscountRedeemed) {
    return Math.round(base * (1 - currentCustomer.welcomeDiscountPercent / 100) * 100) / 100;
  }
  return base;
}

function hasActiveWelcomeDiscount() {
  return !!(currentCustomer && !currentCustomer.welcomeDiscountRedeemed);
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

// El servidor ya no manda el número exacto de stock al cliente (solo un
// booleano "available" por talla) — acá se traduce a un tope de cantidad
// razonable para la UI del carrito; el número real siempre se revalida en el
// servidor al confirmar la compra (checkout.js).
const CART_QTY_CAP = 20;

function sizeAvailable(product, size) {
  if (!product) return false;
  const entry = (product.sizes || []).find(s => s.size === size);
  return entry ? !!entry.available : false;
}

function sizeStock(product, size) {
  return sizeAvailable(product, size) ? CART_QTY_CAP : 0;
}

function renderCart() {
  const keys = Object.keys(cart).filter(key => cart[key] > 0);

  if (!keys.length) {
    cartBody.innerHTML = '<p class="cart-drawer__empty">Your cart is empty.</p>';
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
    const sizeLabel = size && size !== 'Única' ? ` · Size ${escapeHtml(size)}` : '';
    return `
      <div class="cart-item" data-key="${escapeHtml(key)}">
        <div class="cart-item__info">
          <strong>${escapeHtml(product.name)}</strong>
          <span>${money(price)} each${sizeLabel}</span>
        </div>
        <div class="cart-item__qty">
          <button type="button" data-qty-down="${escapeHtml(key)}" aria-label="Remove one unit">−</button>
          <span>${qty}</span>
          <button type="button" data-qty-up="${escapeHtml(key)}" aria-label="Add one unit">+</button>
        </div>
        <button type="button" class="cart-item__remove" data-remove="${escapeHtml(key)}" aria-label="Remove product">&times;</button>
      </div>
    `;
  }).join('');

  cartTotalEl.textContent = money(total);
  cartFooter.hidden = false;
  const existingNote = cartFooter.querySelector('.cart-drawer__discount-note');
  if (existingNote) existingNote.remove();
  if (hasActiveWelcomeDiscount()) {
    const note = document.createElement('p');
    note.className = 'cart-drawer__demo-note cart-drawer__discount-note';
    note.textContent = `Your ${currentCustomer.welcomeDiscountPercent}% welcome discount is already applied to these prices.`;
    cartFooter.insertBefore(note, cartFooter.firstChild);
  }
  updateCartBadge();
  scheduleRenderPaypalButtons(total, keys);
}

function addToCart(id, size) {
  const key = cartKey(id, size);
  const product = findProduct(id);
  const maxStock = product ? sizeStock(product, size || 'Única') : Infinity;
  const next = (cart[key] || 0) + 1;
  if (next > maxStock) {
    alert('No more stock available in this size.');
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
    alert('No more stock available in this size.');
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
  closeSearch();
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
    const card = addBtn.closest('.product-card, .pdp');
    const sizeSelect = card ? card.querySelector('[data-size-select]') : null;
    addToCart(addBtn.dataset.addToCart, sizeSelect ? sizeSelect.value : 'Única');
  }
  if (e.target.closest('[data-open-account]')) {
    accountError = '';
    accountGuestTab = 'register';
    renderAccountDrawer();
    openAccount();
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
          cartBody.innerHTML = '<p class="cart-drawer__empty">Thank you for your purchase! (test payment, no real charge)</p>';
          cartFooter.hidden = true;
          updateCartBadge();
          if (currentCustomer) fetchAccount();
        }),
      onError: (err) => {
        console.error('PayPal error', err);
        alert('There was an error with the test payment. Please try again.');
      }
    }).render('#paypalButtons');
  });
}

// ---------------- Cuenta de cliente ----------------

const accountBtn = document.getElementById('accountBtn');
const accountNameEl = document.getElementById('accountName');
const accountOverlay = document.getElementById('accountOverlay');
const accountDrawer = document.getElementById('accountDrawer');
const accountClose = document.getElementById('accountClose');
const accountBody = document.getElementById('accountBody');

let accountGuestTab = 'login';
let accountError = '';
let accountErrorCode = '';
let accountSuccess = '';
// Mensaje informativo (no error) en la vista de invitado — p. ej. "revisá tu
// correo" después de registrarse, o el aviso de link vencido/inválido.
let accountNotice = '';
// Si el último intento de login falló por email sin confirmar, acá queda el
// correo para poder ofrecer "Reenviar email de confirmación" con un clic.
let accountUnverifiedEmail = '';

function openAccount() {
  accountDrawer.classList.add('is-open');
  accountOverlay.classList.add('is-open');
  accountDrawer.setAttribute('aria-hidden', 'false');
}

function closeAccount() {
  accountDrawer.classList.remove('is-open');
  accountOverlay.classList.remove('is-open');
  accountDrawer.setAttribute('aria-hidden', 'true');
}

function renderGuestView() {
  const loginActive = accountGuestTab === 'login';
  accountBody.innerHTML = `
    <div class="account-tabs">
      <button type="button" class="account-tab ${loginActive ? 'is-active' : ''}" data-account-tab="login">Log in</button>
      <button type="button" class="account-tab ${!loginActive ? 'is-active' : ''}" data-account-tab="register">Create account</button>
    </div>
    ${loginActive ? `
      <form class="account-form" id="loginForm">
        <label>Email<input type="email" name="email" required autocomplete="email" value="${escapeHtml(accountUnverifiedEmail)}"></label>
        <label>Password<input type="password" name="password" required autocomplete="current-password"></label>
        ${accountNotice ? `<p class="account-form__note">${escapeHtml(accountNotice)}</p>` : ''}
        ${accountError ? `<p class="account-form__error">${escapeHtml(accountError)}</p>` : ''}
        ${accountUnverifiedEmail ? `<button type="button" class="btn btn--ghost btn--sm" id="resendVerificationBtn">Resend confirmation email</button>` : ''}
        <button type="submit" class="btn btn--primary">Log in</button>
      </form>
    ` : `
      <form class="account-form" id="registerForm">
        <label>Name<input type="text" name="name" required autocomplete="name"></label>
        <label>Email<input type="email" name="email" required autocomplete="email"></label>
        <label>Password<input type="password" name="password" required minlength="6" autocomplete="new-password"></label>
        <p class="account-form__note">Sign up and get <strong>10% off</strong> your first purchase. We'll email you a confirmation link before you can sign in.</p>
        ${accountError ? `<p class="account-form__error">${escapeHtml(accountError)}</p>` : ''}
        <button type="submit" class="btn btn--primary">Create account</button>
      </form>
    `}
  `;
}

function renderAccountView(orders) {
  const discountBanner = hasActiveWelcomeDiscount()
    ? `<div class="account-discount-banner">You have ${currentCustomer.welcomeDiscountPercent}% off your first purchase. It's applied automatically at checkout.</div>`
    : '';

  const ordersHtml = orders.length
    ? orders.map(o => `
      <div class="account-order">
        <div class="account-order__info">
          <strong>${escapeHtml(o.productName)}</strong>
          <span>${new Date(o.createdAt).toLocaleDateString('en-GB')}${o.size && o.size !== 'Única' ? ` · Size ${escapeHtml(o.size)}` : ''} · x${o.qty}</span>
        </div>
        <span class="account-order__amount">${money(o.amount)}</span>
      </div>
    `).join('')
    : '<p class="cart-drawer__empty" style="margin-top:0">You don\'t have any orders yet.</p>';

  accountBody.innerHTML = `
    <div class="account-welcome">
      <p><strong>Hi, ${escapeHtml(currentCustomer.name)}</strong></p>
      <p><span>${escapeHtml(currentCustomer.email)}</span></p>
    </div>
    ${discountBanner}
    <form class="account-form" id="profileForm">
      <label>Name<input type="text" name="name" value="${escapeHtml(currentCustomer.name)}" required></label>
      <label>Phone<input type="tel" name="phone" value="${escapeHtml(currentCustomer.phone || '')}"></label>
      <label>Shipping address<input type="text" name="address" value="${escapeHtml(currentCustomer.address || '')}"></label>
      ${accountError ? `<p class="account-form__error">${escapeHtml(accountError)}</p>` : ''}
      ${accountSuccess ? `<p class="account-form__success">${escapeHtml(accountSuccess)}</p>` : ''}
      <button type="submit" class="btn btn--ghost btn--sm">Save changes</button>
    </form>
    <div class="account-section">
      <h4>Your orders</h4>
      ${ordersHtml}
    </div>
    <button type="button" class="btn btn--ghost btn--sm account-logout" id="accountLogoutBtn">Log out</button>
  `;
}

function renderAccountDrawer() {
  if (!currentCustomer) {
    renderGuestView();
    return;
  }
  fetch('/api/account/orders')
    .then(res => res.json())
    .then(orders => renderAccountView(Array.isArray(orders) ? orders : []))
    .catch(() => renderAccountView([]));
}

function updateAccountBadge() {
  if (currentCustomer) {
    accountNameEl.textContent = currentCustomer.name.trim().split(/\s+/)[0];
    accountNameEl.hidden = false;
    accountBtn.classList.add('has-name');
  } else {
    accountNameEl.hidden = true;
    accountBtn.classList.remove('has-name');
  }
  // Otras páginas (como la ficha de producto) escuchan esto para mostrar u
  // ocultar cosas que dependen de si hay sesión de cliente, como el
  // formulario de reseñas.
  document.dispatchEvent(new CustomEvent('rawgat:account'));
}

function fetchAccount() {
  return fetch('/api/account/me')
    .then(res => res.json())
    .then(data => {
      currentCustomer = data.authenticated ? data.customer : null;
      updateAccountBadge();
      renderCart();
      return currentCustomer;
    })
    .catch(() => null);
}

accountBtn.addEventListener('click', () => {
  closeSearch();
  accountError = '';
  accountSuccess = '';
  renderAccountDrawer();
  openAccount();
});

function resendVerificationEmail(email) {
  const btn = document.getElementById('resendVerificationBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  fetch('/api/account/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  })
    .then(res => res.json().catch(() => ({})))
    .then(body => {
      accountNotice = body.message || 'If that email has a pending account, a new confirmation link is on its way.';
      accountError = '';
      renderGuestView();
    })
    .catch(() => {
      accountError = 'Could not connect to the server. Check your connection and try again.';
      renderGuestView();
    });
}
accountClose.addEventListener('click', closeAccount);
accountOverlay.addEventListener('click', closeAccount);

accountBody.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-account-tab]');
  if (tab) {
    accountGuestTab = tab.dataset.accountTab;
    accountError = '';
    accountNotice = '';
    renderGuestView();
  }
  if (e.target.id === 'resendVerificationBtn') {
    resendVerificationEmail(accountUnverifiedEmail);
  }
  if (e.target.id === 'accountLogoutBtn') {
    fetch('/api/account/logout', { method: 'POST' })
      .catch(() => {})
      .then(() => {
        currentCustomer = null;
        updateAccountBadge();
        accountGuestTab = 'login';
        accountError = '';
        accountSuccess = '';
        accountNotice = '';
        accountUnverifiedEmail = '';
        renderCart();
        renderAccountDrawer();
      });
  }
});

// Toda petición pasa por acá: si la red falla o el servidor devuelve algo
// que no es JSON, antes quedaba como una promesa rechazada sin manejar y el
// formulario no hacía nada visible (ni error ni éxito). Ahora siempre hay
// una respuesta en pantalla, y el botón se bloquea mientras viaja el pedido
// para que un doble clic no dispare la petición dos veces.
function submitAccountForm(form, url, method, payload, onSuccess) {
  const btn = form.querySelector('button[type="submit"]');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving...';

  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(res => res.json().catch(() => ({})).then(body => ({ ok: res.ok, body })))
    .then(({ ok, body }) => {
      if (!ok) {
        accountError = body.error || 'Could not complete the request';
        accountErrorCode = body.code || '';
        return false;
      }
      accountError = '';
      accountErrorCode = '';
      onSuccess(body);
      return true;
    })
    .catch(() => {
      accountError = 'Could not connect to the server. Check your connection and try again.';
      return false;
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = originalLabel;
    });
}

accountBody.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);

  if (form.id === 'loginForm') {
    const email = formData.get('email');
    accountNotice = '';
    submitAccountForm(form, '/api/account/login', 'POST', {
      email, password: formData.get('password')
    }, (body) => {
      currentCustomer = body.customer;
      accountUnverifiedEmail = '';
      updateAccountBadge();
      renderCart();
    }).then(ok => {
      if (!ok) {
        accountUnverifiedEmail = accountErrorCode === 'EMAIL_NOT_VERIFIED' ? email : '';
        renderGuestView();
      } else {
        renderAccountDrawer();
      }
    });
  }

  if (form.id === 'registerForm') {
    accountNotice = '';
    submitAccountForm(form, '/api/account/register', 'POST', {
      name: formData.get('name'), email: formData.get('email'), password: formData.get('password')
    }, (body) => {
      // La cuenta queda creada pero sin sesión: primero hay que confirmar el
      // email (ver server/routes/customers.js). Se manda a la pestaña de
      // login con el aviso, en vez de dejarlo adentro como si ya hubiese
      // iniciado sesión.
      accountGuestTab = 'login';
      accountNotice = body.message || 'Check your inbox to confirm your account before signing in.';
    }).then(() => renderGuestView());
  }

  if (form.id === 'profileForm') {
    submitAccountForm(form, '/api/account/me', 'PUT', {
      name: formData.get('name'), phone: formData.get('phone'), address: formData.get('address')
    }, (body) => {
      currentCustomer = body.customer;
      updateAccountBadge();
      accountSuccess = 'Changes saved.';
    }).then(() => renderAccountDrawer());
  }
});

fetchAccount().then(() => {
  // Al volver del link de confirmación del email (server/routes/customers.js
  // redirige acá con ?verified=1 o ?verify_error=...), se muestra el aviso
  // correspondiente y se limpia la URL para que no se repita al recargar.
  const params = new URLSearchParams(window.location.search);
  const verified = params.get('verified');
  const verifyError = params.get('verify_error');
  const emailParam = params.get('email');

  if (verified) {
    accountSuccess = 'Your email has been confirmed — welcome!';
    renderAccountDrawer();
    openAccount();
  } else if (verifyError === 'expired') {
    accountGuestTab = 'login';
    accountUnverifiedEmail = emailParam || '';
    accountNotice = 'That confirmation link has expired. Request a new one below.';
    renderGuestView();
    openAccount();
  } else if (verifyError === 'invalid') {
    accountGuestTab = 'login';
    accountNotice = 'That confirmation link is invalid or was already used.';
    renderGuestView();
    openAccount();
  }

  if (verified || verifyError) {
    params.delete('verified');
    params.delete('verify_error');
    params.delete('email');
    const query = params.toString();
    const newUrl = window.location.pathname + (query ? `?${query}` : '') + window.location.hash;
    window.history.replaceState({}, '', newUrl);
  }
});

// ---------------- Búsqueda ----------------

// El buscador se eliminó de la cabecera nueva (con 2 productos no aporta).
// Las páginas antiguas que aún lo tengan lo siguen usando; en las nuevas
// closeSearch() queda como no-op.
const searchBtn = document.getElementById('searchBtn');
const searchOverlay = document.getElementById('searchOverlay');
const searchPanel = document.getElementById('searchPanel');
const searchClose = document.getElementById('searchClose');
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const searchResultsEl = document.getElementById('searchResults');

const SEARCH_PREVIEW_LIMIT = 5;

function openSearch() {
  if (!searchPanel) return;
  searchPanel.classList.add('is-open');
  searchOverlay.classList.add('is-open');
  searchBtn.classList.add('is-active');
  searchPanel.setAttribute('aria-hidden', 'false');
  searchInput.focus();
}

function closeSearch() {
  if (!searchPanel) return;
  searchPanel.classList.remove('is-open');
  searchOverlay.classList.remove('is-open');
  searchBtn.classList.remove('is-active');
  searchPanel.setAttribute('aria-hidden', 'true');
}

function renderSearchPreview(query) {
  const trimmed = query.trim();
  if (!trimmed) {
    searchResultsEl.hidden = true;
    searchResultsEl.innerHTML = '';
    return;
  }

  const matches = PRODUCTS.filter(p => matchesSearch(p, trimmed));
  searchResultsEl.hidden = false;

  if (!matches.length) {
    searchResultsEl.innerHTML = `<p class="search-panel__empty">We couldn't find products for "${escapeHtml(trimmed)}".</p>`;
    return;
  }

  const preview = matches.slice(0, SEARCH_PREVIEW_LIMIT);
  const rowsHtml = preview.map(p => `
    <button type="button" class="search-result" data-search-result="${p.id}">
      <span class="search-result__media">
        ${p.image
          ? `<img src="${escapeHtml(p.image)}" alt="">`
          : `<svg viewBox="0 0 64 64">${PRODUCT_ICONS[p.icon] || PRODUCT_ICONS.shirt}</svg>`}
      </span>
      <span class="search-result__info">
        <strong>${escapeHtml(p.name)}</strong>
        <span>${escapeHtml(p.category)}</span>
      </span>
      <span class="search-result__price">${money(p.discount && !p.discountLocked ? p.finalPrice : p.price)}</span>
    </button>
  `).join('');

  const moreHtml = matches.length > SEARCH_PREVIEW_LIMIT
    ? `<button type="button" class="search-panel__more" id="searchSeeAll">See all ${matches.length} results for "${escapeHtml(trimmed)}"</button>`
    : '';

  searchResultsEl.innerHTML = rowsHtml + moreHtml;
}

// La colección solo existe en la portada: si estás en otra página (p. ej. la
// ficha de un producto), buscar te lleva a la portada con el resultado ya
// aplicado en vez de intentar filtrar una grilla que no está en esta página.
function applySearchFilter(query) {
  const trimmed = query.trim();
  if (!trimmed) return;
  if (document.getElementById('collectionGrid')) {
    window.rawgatApplySearch(trimmed);
    closeSearch();
  } else {
    window.location.href = `/index.html?buscar=${encodeURIComponent(trimmed)}#coleccion`;
  }
}

if (searchBtn && searchPanel) {
searchBtn.addEventListener('click', () => {
  if (searchPanel.classList.contains('is-open')) closeSearch();
  else openSearch();
});
searchClose.addEventListener('click', closeSearch);
searchOverlay.addEventListener('click', closeSearch);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && searchPanel.classList.contains('is-open')) closeSearch();
});

searchInput.addEventListener('input', () => renderSearchPreview(searchInput.value));

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  applySearchFilter(searchInput.value);
});

searchResultsEl.addEventListener('click', (e) => {
  if (e.target.closest('[data-search-result], #searchSeeAll')) {
    applySearchFilter(searchInput.value);
  }
});
}
