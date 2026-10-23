// Lógica exclusiva de la portada. El carrito, la cuenta y las utilidades de
// producto/huecos viven en shared.js (se carga antes que este archivo).

// Aparición al hacer scroll (ver attachReveal en shared.js: el contenido es
// visible por defecto y se respeta "reducir movimiento").
document.querySelectorAll('.section-head, .design-card, .made-step, .story__inner, .reviews__empty, .newsletter__inner')
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
