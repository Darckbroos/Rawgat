const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function nextId(list) {
  return list.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

function seedDemoPurchases() {
  const purchases = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const productIds = [1, 2, 3, 4];
  const amounts = { 1: 42990, 2: 54990, 3: 21990, 4: 17990 };

  for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
    const count = Math.floor(Math.random() * 6) + 1; // 1-6 compras demo por día
    for (let i = 0; i < count; i++) {
      const productId = productIds[Math.floor(Math.random() * productIds.length)];
      const ts = now - daysAgo * dayMs - Math.floor(Math.random() * dayMs);
      purchases.push({
        id: purchases.length + 1,
        productId,
        amount: amounts[productId],
        createdAt: new Date(ts).toISOString(),
        demo: true
      });
    }
  }
  return purchases;
}

function buildDefaultData() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin1234';

  return {
    admin: {
      username: adminUsername,
      passwordHash: bcrypt.hashSync(adminPassword, 10)
    },
    products: [
      { id: 1, name: 'Pantalón Gastón', description: 'Elastano 4 vías, corte cónico, refuerzo en rodilla.', price: 42990, category: 'Pantalones', tag: 'Más vendido', icon: 'pants', active: true, createdAt: new Date().toISOString() },
      { id: 2, name: 'Polerón Muro', description: 'Softshell liviano, capucha compatible con casco.', price: 54990, category: 'Poleras', tag: 'Nuevo', icon: 'hoodie', active: true, createdAt: new Date().toISOString() },
      { id: 3, name: 'Camiseta Roca Seca', description: 'Tejido técnico anti-olor, secado ultra rápido.', price: 21990, category: 'Poleras', tag: '', icon: 'shirt', active: true, createdAt: new Date().toISOString() },
      { id: 4, name: 'Chalk Bag Cóndor', description: 'Cierre de cordón, cepillo integrado, correa ajustable.', price: 17990, category: 'Accesorios', tag: '', icon: 'chalkbag', active: true, createdAt: new Date().toISOString() }
    ],
    discounts: [
      { id: 1, code: 'PRIMERAVEZ10', description: '10% de descuento en tu primera compra', percent: 10, active: true, expiresAt: null, createdAt: new Date().toISOString() }
    ],
    visits: [],
    purchases: seedDemoPurchases(),
    _seq: { product: 5, discount: 2, visit: 1, purchase: seedDemoPurchases().length + 1 }
  };
}

let data;

function load() {
  if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    data = buildDefaultData();
    save();
    console.log('\n[RAWGAT] Base de datos creada con usuario admin:', data.admin.username);
    if (!process.env.ADMIN_PASSWORD) {
      console.log('[RAWGAT] ADVERTENCIA: no definiste ADMIN_PASSWORD en .env, se usó una contraseña por defecto insegura.');
    }
  } else {
    data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  }
  return data;
}

function save() {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

load();

// ---------- Admin ----------
function getAdmin() {
  return data.admin;
}

// ---------- Products ----------
function getProducts({ onlyActive = false } = {}) {
  return data.products.filter(p => !onlyActive || p.active);
}

function addProduct(input) {
  const product = {
    id: data._seq.product++,
    name: input.name,
    description: input.description || '',
    price: Number(input.price) || 0,
    category: input.category || 'General',
    tag: input.tag || '',
    icon: input.icon || 'shirt',
    active: input.active !== false,
    createdAt: new Date().toISOString()
  };
  data.products.push(product);
  save();
  return product;
}

function updateProduct(id, input) {
  const product = data.products.find(p => p.id === Number(id));
  if (!product) return null;
  Object.assign(product, {
    name: input.name ?? product.name,
    description: input.description ?? product.description,
    price: input.price !== undefined ? Number(input.price) : product.price,
    category: input.category ?? product.category,
    tag: input.tag ?? product.tag,
    icon: input.icon ?? product.icon,
    active: input.active !== undefined ? !!input.active : product.active
  });
  save();
  return product;
}

function deleteProduct(id) {
  const before = data.products.length;
  data.products = data.products.filter(p => p.id !== Number(id));
  save();
  return data.products.length < before;
}

// ---------- Discounts ----------
function getDiscounts() {
  return data.discounts;
}

// Los campos <input type="date"> guardan solo "AAAA-MM-DD". Si lo comparamos
// tal cual, JS lo interpreta como medianoche UTC de ese día y el descuento
// quedaría vencido desde el primer minuto del día elegido. En vez de eso, lo
// tratamos como válido hasta el final de ese día.
function endOfDay(dateStr) {
  const end = new Date(dateStr);
  end.setUTCHours(23, 59, 59, 999);
  return end.getTime();
}

function getActiveDiscount() {
  const now = Date.now();
  return data.discounts.find(d => d.active && (!d.expiresAt || endOfDay(d.expiresAt) >= now)) || null;
}

function addDiscount(input) {
  const discount = {
    id: data._seq.discount++,
    code: (input.code || '').toUpperCase(),
    description: input.description || '',
    percent: Number(input.percent) || 0,
    active: input.active !== false,
    expiresAt: input.expiresAt || null,
    createdAt: new Date().toISOString()
  };
  data.discounts.push(discount);
  save();
  return discount;
}

function updateDiscount(id, input) {
  const discount = data.discounts.find(d => d.id === Number(id));
  if (!discount) return null;
  Object.assign(discount, {
    code: input.code ? input.code.toUpperCase() : discount.code,
    description: input.description ?? discount.description,
    percent: input.percent !== undefined ? Number(input.percent) : discount.percent,
    active: input.active !== undefined ? !!input.active : discount.active,
    expiresAt: input.expiresAt !== undefined ? input.expiresAt : discount.expiresAt
  });
  save();
  return discount;
}

function deleteDiscount(id) {
  const before = data.discounts.length;
  data.discounts = data.discounts.filter(d => d.id !== Number(id));
  save();
  return data.discounts.length < before;
}

// ---------- Analytics ----------
function recordVisit(pagePath) {
  data.visits.push({ id: data._seq.visit++, path: pagePath || '/', createdAt: new Date().toISOString() });
  save();
}

function recordPurchase(productId, amount) {
  const purchase = { id: data._seq.purchase++, productId: productId || null, amount: Number(amount) || 0, createdAt: new Date().toISOString(), demo: false };
  data.purchases.push(purchase);
  save();
  return purchase;
}

function dailySeries(items, days) {
  const dayMs = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = today.getTime() - i * dayMs;
    buckets.push({ date: new Date(dayStart).toISOString().slice(0, 10), count: 0 });
  }
  items.forEach(item => {
    const key = item.createdAt.slice(0, 10);
    const bucket = buckets.find(b => b.date === key);
    if (bucket) bucket.count++;
  });
  return buckets;
}

function getVisitsSeries(days = 30) {
  return dailySeries(data.visits, days);
}

function getPurchasesSeries(days = 30) {
  return dailySeries(data.purchases, days);
}

function getSummary() {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const last7 = now - 7 * dayMs;
  const last30 = now - 30 * dayMs;

  const visits30 = data.visits.filter(v => new Date(v.createdAt).getTime() >= last30).length;
  const visits7 = data.visits.filter(v => new Date(v.createdAt).getTime() >= last7).length;
  const purchases30 = data.purchases.filter(p => new Date(p.createdAt).getTime() >= last30);
  const purchases7 = data.purchases.filter(p => new Date(p.createdAt).getTime() >= last7);
  const revenue30 = purchases30.reduce((sum, p) => sum + p.amount, 0);

  return {
    visits30,
    visits7,
    purchases30: purchases30.length,
    purchases7: purchases7.length,
    revenue30,
    // Con muy pocas visitas reales la tasa no es representativa (podría superar el 100%
    // porque las compras son datos de ejemplo). Se exige un mínimo de tráfico real.
    conversionRate30: visits30 >= 20 ? Math.round((purchases30.length / visits30) * 1000) / 10 : null,
    totalProducts: data.products.length,
    activeDiscounts: data.discounts.filter(d => d.active).length
  };
}

module.exports = {
  getAdmin,
  getProducts, addProduct, updateProduct, deleteProduct,
  getDiscounts, getActiveDiscount, addDiscount, updateDiscount, deleteDiscount,
  recordVisit, recordPurchase, getVisitsSeries, getPurchasesSeries, getSummary
};
