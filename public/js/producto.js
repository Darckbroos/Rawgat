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
  const outOfStock = Number(p.stock) <= 0;
  media.innerHTML = `
    ${outOfStock ? `<span class="tag tag--stock">Agotado</span>` : (p.tag ? `<span class="tag">${escapeHtml(p.tag)}</span>` : '')}
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
    memberNote.innerHTML = `Precio socio ${money(p.memberPrice)} · <button type="button" data-open-account>Regístrate para acceder</button>`;
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
      const stock = entry ? entry.stock : 0;
      return `<option value="${size}" ${stock <= 0 ? 'disabled' : ''}>${size}${stock <= 0 ? ' (agotado)' : ''}</option>`;
    }).join('');
  } else {
    sizeLabel.hidden = true;
  }

  function updateStockNote() {
    const size = showSizePicker ? sizeSelect.value : 'Única';
    const remaining = sizeStock(p, size);
    if (!outOfStock && remaining > 0 && remaining <= LOW_STOCK_THRESHOLD) {
      stockNote.hidden = false;
      stockNote.textContent = `¡Últimas ${remaining} unidades!`;
    } else {
      stockNote.hidden = true;
    }
  }
  if (showSizePicker) sizeSelect.addEventListener('change', updateStockNote);
  updateStockNote();

  const addBtn = document.getElementById('pdpAddBtn');
  addBtn.dataset.addToCart = String(p.id);
  addBtn.disabled = outOfStock;
  addBtn.textContent = outOfStock ? 'Agotado' : 'Agregar al carrito';

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

function loadReviews(id) {
  fetch(`/api/products/${id}/reviews`)
    .then(res => res.json())
    .then(reviews => {
      const section = document.getElementById('pdpReviews');
      const summary = document.getElementById('reviewsSummary');
      const list = document.getElementById('reviewsList');

      if (!reviews.length) {
        summary.textContent = 'Todavía no hay reseñas para este producto.';
        list.innerHTML = '';
        section.hidden = false;
        return;
      }

      const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      summary.innerHTML = `<strong>${starString(Math.round(avg))}</strong> ${avg.toFixed(1)} de 5 · ${reviews.length} reseña${reviews.length === 1 ? '' : 's'}`;

      list.innerHTML = reviews.map(r => `
        <blockquote class="testimonial pdp-review">
          <p class="pdp-review__stars">${starString(r.rating)}</p>
          <p>"${escapeHtml(r.text)}"</p>
          <footer><strong>${escapeHtml(r.customerName)}</strong> — ${new Date(r.createdAt).toLocaleDateString('es-ES')}</footer>
        </blockquote>
      `).join('');
      section.hidden = false;
    })
    .catch(() => {});
}

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
