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

// Scroll reveal
const revealTargets = document.querySelectorAll(
  '.feature-card, .product-card, .testimonial, .story__inner, .section-head'
);
revealTargets.forEach(el => el.setAttribute('data-reveal', ''));

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

revealTargets.forEach(el => observer.observe(el));

// Newsletter form (front-end only placeholder)
const form = document.getElementById('newsletterForm');
const note = document.getElementById('newsletterNote');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  form.reset();
  note.hidden = false;
});

// 3D tilt on cards (mouse-driven perspective)
const prefersFinePointer = window.matchMedia('(pointer: fine)').matches;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (prefersFinePointer && !prefersReducedMotion) {
  document.querySelectorAll('[data-tilt]').forEach(card => {
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
  });

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
