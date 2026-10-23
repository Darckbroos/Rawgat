// Ficha de producto individual. El id viene de la URL (/producto/:id); el
// carrito, la cuenta y el buscador ya están resueltos por shared.js.

const productId = window.location.pathname.split('/').filter(Boolean).pop();

const pdpLoading = document.getElementById('pdpLoading');
const pdpNotFound = document.getElementById('pdpNotFound');
const pdpSection = document.getElementById('pdp');

let currentProduct = null;

// Galería: principal 1:1 + 5 miniaturas 1:1 (IMG-01 a IMG-06). Las fotos
// vienen de p.gallery (lista de URLs) o, mientras el admin solo tenga una
// imagen por producto, de p.image como principal. Lo que falta queda como
// hueco con su ID.
const GALLERY_SIZE = 6;

function galleryUrls(p) {
  if (!p) return [];
  const list = Array.isArray(p.gallery) ? p.gallery.filter(Boolean) : [];
  if (!list.length && p.image) list.push(p.image);
  return list.slice(0, GALLERY_SIZE);
}

function slotId(n) {
  return `IMG-${String(n).padStart(2, '0')}`;
}

function renderGallery(p) {
  const urls = galleryUrls(p);
  const name = p ? p.name : '';
  const main = document.getElementById('pdpMain');
  const thumbs = document.getElementById('pdpThumbs');

  const showMain = (i) => {
    main.innerHTML = urls[i]
      ? `<img src="${escapeHtml(urls[i])}" alt="${escapeHtml(name)}">`
      : imageSlotHtml(slotId(1), '1:1', 'light');
    thumbs.querySelectorAll('button').forEach(btn => btn.classList.toggle('is-active', Number(btn.dataset.index) === i));
  };

  // Miniaturas = IMG-02 a IMG-06; si hay fotos, la primera también es miniatura
  // para poder volver a ella.
  const thumbHtml = [];
  for (let n = 2; n <= GALLERY_SIZE; n++) {
    const i = n - 1;
    thumbHtml.push(urls[i]
      ? `<button type="button" data-index="${i}" aria-label="Show image ${n}"><img src="${escapeHtml(urls[i])}" alt=""></button>`
      : imageSlotHtml(slotId(n), '1:1', 'light'));
  }
  thumbs.innerHTML = thumbHtml.join('');
  thumbs.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-index]');
    if (btn) showMain(Number(btn.dataset.index));
  });
  showMain(0);
}

// p === null → plantilla vacía (vista previa en /producto.html): huecos de
// imagen, líneas grises y botón desactivado "Coming soon".
function renderProduct(p) {
  currentProduct = p;
  const isTemplate = !p;

  if (!isTemplate) {
    document.title = `${p.name} — RAWGAT`;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', p.description || document.title);
  }

  renderGallery(p);

  const nameEl = document.getElementById('pdpName');
  const descEl = document.getElementById('pdpDescription');
  const priceEl = document.getElementById('pdpPrice');
  const addBtn = document.getElementById('pdpAddBtn');
  const specsEl = document.getElementById('pdpSpecs');
  const stockEl = document.getElementById('pdpStockLine');

  if (isTemplate) {
    nameEl.innerHTML = '<span class="skeleton skeleton--title"></span>';
    descEl.innerHTML = '<span class="skeleton"></span><span class="skeleton"></span><span class="skeleton skeleton--mid"></span>';
    priceEl.innerHTML = '<span class="skeleton skeleton--price"></span>';
    addBtn.disabled = true;
    addBtn.textContent = 'Coming soon';
    addBtn.removeAttribute('data-add-to-cart');
    specsEl.innerHTML = specsTableHtml(null, { placeholder: true });
    stockEl.innerHTML = '';
  } else {
    const outOfStock = !p.inStock;
    nameEl.textContent = p.name;
    descEl.textContent = p.description || '';
    priceEl.innerHTML = priceHtml(p);
    addBtn.dataset.addToCart = String(p.id);
    addBtn.disabled = outOfStock;
    addBtn.textContent = outOfStock ? 'Sold out' : 'Add to cart';
    specsEl.innerHTML = specsTableHtml(p);
    stockEl.innerHTML = stockLineHtml();
  }

  pdpLoading.hidden = true;
  pdpSection.hidden = false;
  document.getElementById('pdpReviews').hidden = false;
  if (!isTemplate) loadReviews(p.id);
}

// Estrellas simples (texto, no íconos) para no depender de una fuente de
// iconos aparte solo para esto.
function starString(rating) {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

function loadReviewsList(id) {
  return fetch(`/api/products/${id}/reviews`)
    .then(res => res.json())
    .then(reviews => {
      const empty = document.getElementById('reviewsEmpty');
      const list = document.getElementById('reviewsList');
      if (!reviews.length) {
        empty.hidden = false;
        list.hidden = true;
        list.innerHTML = '';
        return;
      }
      // Tarjeta de reseña: nombre, fecha, producto, valoración, texto y
      // etiqueta "Verified purchase". La etiqueta solo aparece si el
      // servidor marca la reseña como compra verificada (r.verifiedPurchase);
      // hoy el servidor aún no lo calcula, así que no se muestra a nadie.
      list.innerHTML = reviews.map(r => `
        <blockquote class="review-card">
          <p class="review-card__stars" aria-label="${r.rating} out of 5">${starString(r.rating)}</p>
          <p>${escapeHtml(r.text)}</p>
          <footer class="review-card__meta"><strong>${escapeHtml(r.customerName)}</strong> · ${new Date(r.createdAt).toLocaleDateString('en-GB')} · ${escapeHtml(currentProduct ? currentProduct.name : '')}</footer>
          ${r.verifiedPurchase ? '<span class="review-card__verified">Verified purchase</span>' : ''}
        </blockquote>
      `).join('');
      empty.hidden = true;
      list.hidden = false;
    })
    .catch(() => {});
}

// La reseña que el cliente que tiene la sesión abierta ya dejó en este
// producto, si existe — se usa para abrir el formulario en modo "editar" en
// vez de dejarlo crear una segunda.
let myReview = null;

// Formulario de reseña: solo se muestra el editor a un cliente con sesión
// iniciada; a un visitante sin cuenta se le invita a iniciar sesión. Del
// lado del servidor esto también se exige (requireCustomerAuth) — esto es
// solo para no mostrar un formulario que igual va a rechazar el envío.
function renderReviewForm(productId, successMessage) {
  const container = document.getElementById('pdpReviewForm');
  if (!container) return;

  if (!currentCustomer) {
    container.innerHTML = `
      <p class="pdp-review-form__prompt">Bought this product? <button type="button" data-open-account>Sign in</button> to leave a review.</p>
    `;
    return;
  }

  const initialRating = myReview ? myReview.rating : 5;
  container.innerHTML = `
    <form class="account-form pdp-review-form__form" id="reviewForm">
      <p class="pdp-review-form__title">${myReview ? 'Update your review' : 'Leave a review'}</p>
      <div class="star-rating" id="reviewStars" role="radiogroup" aria-label="Rating">
        ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="star-rating__star" data-star="${n}" aria-label="${n} star${n === 1 ? '' : 's'}">★</button>`).join('')}
      </div>
      <input type="hidden" name="rating" id="reviewRatingInput" value="${initialRating}">
      <label>Your review
        <textarea name="text" rows="3" maxlength="1000" required placeholder="What did you think of this product?">${myReview ? escapeHtml(myReview.text) : ''}</textarea>
      </label>
      <p class="account-form__error" id="reviewFormError" hidden></p>
      <p class="account-form__success" id="reviewFormSuccess" ${successMessage ? '' : 'hidden'}>${successMessage ? escapeHtml(successMessage) : ''}</p>
      <button type="submit" class="btn btn--primary btn--sm">${myReview ? 'Update review' : 'Submit review'}</button>
    </form>
  `;

  const starsWrap = document.getElementById('reviewStars');
  const ratingInput = document.getElementById('reviewRatingInput');
  function paintStars(value) {
    starsWrap.querySelectorAll('[data-star]').forEach(btn => {
      btn.classList.toggle('is-active', Number(btn.dataset.star) <= value);
    });
  }
  paintStars(Number(ratingInput.value));
  starsWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-star]');
    if (!btn) return;
    ratingInput.value = btn.dataset.star;
    paintStars(Number(btn.dataset.star));
  });

  document.getElementById('reviewForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const errorEl = document.getElementById('reviewFormError');
    errorEl.hidden = true;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    fetch(`/api/products/${productId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: ratingInput.value, text: form.text.value })
    })
      .then(async res => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Could not save your review');
        myReview = body;
        renderReviewForm(productId, 'Thanks — your review has been posted.');
        loadReviewsList(productId);
      })
      .catch(err => {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      });
  });
}

function loadReviews(id) {
  loadReviewsList(id);
  renderReviewForm(id);
  if (!currentCustomer) { myReview = null; return; }
  fetch(`/api/products/${id}/my-review`)
    .then(res => (res.ok ? res.json() : null))
    .then(review => {
      myReview = review;
      renderReviewForm(id);
    })
    .catch(() => {});
}

// Cambios de sesión (iniciar/cerrar sesión, cambiar de cuenta) hechos desde
// el cajón de cuenta de shared.js también deben actualizar este formulario.
document.addEventListener('rawgat:account', () => {
  if (currentProduct) loadReviews(currentProduct.id);
});

// Vista previa de la plantilla vacía: /producto.html (sin id).
const isTemplatePreview = /producto\.html$/.test(window.location.pathname);

if (isTemplatePreview) {
  renderProduct(null);
} else fetch(`/api/products/${encodeURIComponent(productId)}`)
  .then(res => {
    if (!res.ok) throw new Error('not-found');
    return res.json();
  })
  .then(renderProduct)
  .catch(() => {
    pdpLoading.hidden = true;
    pdpNotFound.hidden = false;
  });
