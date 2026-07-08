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
    el.textContent = `${prefix}${value.toLocaleString('es-CL')}${suffix}`;
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
  chalkbag: '<path d="M32 12c8 0 14 6 14 14 0 10-6 16-14 24-8-8-14-14-14-24 0-8 6-14 14-14Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M25 24h14" stroke="currentColor" stroke-width="2.5"/>'
};
const MEDIA_CLASSES = ['product-card__media--1', 'product-card__media--2', 'product-card__media--3', 'product-card__media--4'];
const money = (value) => `$${Number(value || 0).toLocaleString('es-CL')}`;

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

function renderProducts(products) {
  const grid = document.getElementById('collectionGrid');
  if (!grid) return;

  if (!products.length) {
    grid.innerHTML = '<p class="collection__loading">Muy pronto nuevos productos por aquí.</p>';
    return;
  }

  grid.innerHTML = products.map((p, i) => {
    const discount = p.discount;
    const priceHtml = discount
      ? `<span class="price__original">${money(p.price)}</span> ${money(p.finalPrice)}`
      : money(p.price);

    return `
    <article class="product-card" data-tilt>
      <div class="product-card__media ${MEDIA_CLASSES[i % MEDIA_CLASSES.length]}">
        ${p.tag ? `<span class="tag">${escapeHtml(p.tag)}</span>` : ''}
        ${discount ? `<span class="tag tag--discount">-${Number(discount.percent) || 0}%</span>` : ''}
        <svg class="product-card__icon" viewBox="0 0 64 64">${PRODUCT_ICONS[p.icon] || PRODUCT_ICONS.shirt}</svg>
      </div>
      <div class="product-card__body">
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.description || '')}</p>
        <div class="product-card__row">
          <span class="price">${priceHtml}</span>
          <a href="#contacto" class="btn btn--sm btn--outline">Ver producto</a>
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

fetch('/api/products')
  .then(res => res.json())
  .then(renderProducts)
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
      if (topbar) topbar.textContent = 'Envío gratis en Chile por compras sobre $60.000 · Devoluciones dentro de 30 días';
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
