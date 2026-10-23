// Ficha de producto individual. El id viene de la URL (/producto/:id); el
// carrito, la cuenta y el buscador ya están resueltos por shared.js.

const productId = window.location.pathname.split('/').filter(Boolean).pop();

const pdpLoading = document.getElementById('pdpLoading');
const pdpNotFound = document.getElementById('pdpNotFound');
const pdpSection = document.getElementById('pdp');

let currentProduct = null;

function renderProduct(p) {
  currentProduct = p;

  document.title = `${p.name} — RAWGAT`;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', p.description || document.title);

  const media = document.getElementById('pdpMedia');
  const outOfStock = !p.inStock;
  media.innerHTML = `
    ${outOfStock ? `<span class="tag tag--stock">Sold out</span>` : (p.tag ? `<span class="tag">${escapeHtml(p.tag)}</span>` : '')}
    ${p.discount ? `<span class="tag tag--discount">-${Number(p.discount.percent) || 0}%</span>` : ''}
    ${p.image
      ? `<img class="product-card__photo" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}">`
      : `<svg class="product-card__icon" viewBox="0 0 64 64">${PRODUCT_ICONS[p.icon] || PRODUCT_ICONS.shirt}</svg>`}
  `;

  document.getElementById('pdpCategory').textContent = `${p.category} · ${p.audience}`;
  document.getElementById('pdpName').textContent = p.name;
  document.getElementById('pdpDescription').textContent = p.description || '';

  const priceEl = document.getElementById('pdpPrice');
  const locked = !!p.discountLocked;
  priceEl.innerHTML = p.discount && !locked
    ? `<span class="price__original">${money(p.price)}</span> ${money(p.finalPrice)}`
    : money(p.price);

  const memberNote = document.getElementById('pdpMemberNote');
  if (locked) {
    memberNote.hidden = false;
    memberNote.innerHTML = `Member price ${money(p.memberPrice)} · <button type="button" data-open-account>Sign up to unlock</button>`;
  } else {
    memberNote.hidden = true;
  }

  const sizes = Array.isArray(p.sizes) ? p.sizes : [];
  const showSizePicker = CLOTHING_CATEGORIES.includes(p.category) && !outOfStock;
  const sizeLabel = document.getElementById('pdpSizeLabel');
  const sizeSelect = document.getElementById('pdpSizeSelect');
  const stockNote = document.getElementById('pdpStockNote');

  if (showSizePicker) {
    sizeLabel.hidden = false;
    sizeSelect.dataset.sizeSelect = String(p.id);
    sizeSelect.innerHTML = CLOTHING_SIZES.map(size => {
      const entry = sizes.find(s => s.size === size);
      const available = entry ? entry.available : false;
      return `<option value="${size}" ${available ? '' : 'disabled'}>${size}${available ? '' : ' (sold out)'}</option>`;
    }).join('');
  } else {
    sizeLabel.hidden = true;
  }

  // El servidor ya no manda cantidades exactas de stock, solo el booleano
  // "lowStock" del producto (no distingue por talla) — se usa como aviso
  // genérico, sin número, para no revelar cuánto queda exactamente.
  function updateStockNote() {
    const size = showSizePicker ? sizeSelect.value : 'Única';
    const available = showSizePicker ? sizeAvailable(p, size) : !outOfStock;
    if (!outOfStock && available && p.lowStock) {
      stockNote.hidden = false;
      stockNote.textContent = 'Low stock — order soon!';
    } else {
      stockNote.hidden = true;
    }
  }
  if (showSizePicker) sizeSelect.addEventListener('change', updateStockNote);
  updateStockNote();

  const addBtn = document.getElementById('pdpAddBtn');
  addBtn.dataset.addToCart = String(p.id);
  addBtn.disabled = outOfStock;
  addBtn.textContent = outOfStock ? 'Sold out' : 'Add to cart';

  pdpLoading.hidden = true;
  pdpSection.hidden = false;
  updateCountdowns();
  renderRelated();
  loadReviews(p.id);
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
      const section = document.getElementById('pdpReviews');
      const summary = document.getElementById('reviewsSummary');
      const list = document.getElementById('reviewsList');

      if (!reviews.length) {
        summary.textContent = 'No reviews yet for this product.';
        list.innerHTML = '';
        section.hidden = false;
        return;
      }

      const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      summary.innerHTML = `<strong>${starString(Math.round(avg))}</strong> ${avg.toFixed(1)} out of 5 · ${reviews.length} review${reviews.length === 1 ? '' : 's'}`;

      list.innerHTML = reviews.map(r => `
        <blockquote class="testimonial pdp-review">
          <p class="pdp-review__stars">${starString(r.rating)}</p>
          <p>"${escapeHtml(r.text)}"</p>
          <footer><strong>${escapeHtml(r.customerName)}</strong> — ${new Date(r.createdAt).toLocaleDateString('en-GB')}</footer>
        </blockquote>
      `).join('');
      section.hidden = false;
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

// Relacionados: misma categoría, sin el producto actual, hasta 4. La ficha
// individual y el catálogo completo (PRODUCTS, en shared.js) llegan de dos
// peticiones independientes — esto se llama desde ambas, así que no importa
// cuál termine primero.
function renderRelated() {
  if (!currentProduct || !PRODUCTS.length) return;
  const related = PRODUCTS
    .filter(p => p.category === currentProduct.category && p.id !== currentProduct.id)
    .slice(0, 4);
  if (!related.length) return;

  const grid = document.getElementById('relatedGrid');
  grid.innerHTML = related.map((p, i) => productCardHtml(p, i)).join('');
  grid.querySelectorAll('.product-card').forEach(card => {
    attachTilt(card);
    attachReveal(card);
  });
  document.getElementById('pdpRelated').hidden = false;
  updateCountdowns();
}

document.addEventListener('rawgat:products', renderRelated);

fetch(`/api/products/${encodeURIComponent(productId)}`)
  .then(res => {
    if (!res.ok) throw new Error('not-found');
    return res.json();
  })
  .then(renderProduct)
  .catch(() => {
    pdpLoading.hidden = true;
    pdpNotFound.hidden = false;
  });
