const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function nextId(list) {
  return list.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

// "Única" cubre productos sin talla real (accesorios): así todo producto
// usa la misma estructura de stock por talla, sin dos caminos de código.
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Única'];
const AUDIENCES = ['Hombre', 'Mujer', 'Niños', 'Unisex'];

function normalizeSizes(input) {
  const bySize = new Map();
  if (Array.isArray(input)) {
    input.forEach(entry => {
      if (entry && SIZES.includes(entry.size)) {
        bySize.set(entry.size, Math.max(0, Math.floor(Number(entry.stock)) || 0));
      }
    });
  }
  return SIZES.map(size => ({ size, stock: bySize.get(size) || 0 }));
}

function totalStock(product) {
  return (product.sizes || []).reduce((sum, s) => sum + s.stock, 0);
}

// Elige un producto con probabilidades distintas (no todos venden igual),
// para que el comparador de productos tenga una señal de "gustos" real
// que mostrar en vez de ruido uniforme.
function weightedProductPick(weights) {
  const roll = Math.random();
  let acc = 0;
  for (const [productId, weight] of weights) {
    acc += weight;
    if (roll <= acc) return productId;
  }
  return weights[weights.length - 1][0];
}

function seedDemoPurchases() {
  const purchases = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const amounts = { 1: 44.90, 2: 59.90, 3: 24.90, 4: 19.90 };
  const weights = [[1, 0.4], [2, 0.25], [3, 0.2], [4, 0.15]];

  for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
    const count = Math.floor(Math.random() * 6) + 1; // 1-6 compras demo por día
    for (let i = 0; i < count; i++) {
      const productId = weightedProductPick(weights);
      const ts = now - daysAgo * dayMs - Math.floor(Math.random() * dayMs);
      purchases.push({
        id: purchases.length + 1,
        productId,
        qty: 1,
        amount: amounts[productId],
        createdAt: new Date(ts).toISOString(),
        demo: true
      });
    }
  }
  return purchases;
}

// Movimientos contables de ejemplo: los ingresos online replican las compras
// demo ya generadas, para que el módulo de contabilidad no arranque vacío.
// RAWGAT opera 100% online, por lo que no se generan sucursales físicas.
function seedDemoTransactions(purchases, branches) {
  const transactions = [];
  let id = 1;
  const push = (t) => transactions.push({ id: id++, demo: true, ...t });

  const onlineBranch = branches.find(b => b.type === 'online');
  purchases.forEach(p => push({
    branchId: onlineBranch.id,
    type: 'income',
    category: 'Ventas online',
    description: 'Venta en línea',
    amount: p.amount,
    method: 'tarjeta',
    date: p.createdAt.slice(0, 10),
    createdAt: p.createdAt
  }));

  return transactions;
}

function buildDefaultData() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin1234';
  const purchases = seedDemoPurchases();
  const branches = [
    { id: 1, name: 'RAWGAT Online', address: 'Tienda en línea', type: 'online', active: true, createdAt: new Date().toISOString() }
  ];
  const transactions = seedDemoTransactions(purchases, branches);

  return {
    admin: {
      username: adminUsername,
      passwordHash: bcrypt.hashSync(adminPassword, 10)
    },
    products: [
      { id: 1, name: 'Pantalón Gastón', description: 'Elastano 4 vías, corte cónico, refuerzo en rodilla.', price: 44.90, category: 'Pantalones', tag: 'Más vendido', icon: 'pants', audience: 'Hombre', sizes: normalizeSizes([{ size: 'S', stock: 4 }, { size: 'M', stock: 8 }, { size: 'L', stock: 7 }, { size: 'XL', stock: 5 }]), active: true, createdAt: new Date().toISOString() },
      { id: 2, name: 'Polerón Muro', description: 'Softshell liviano, capucha compatible con casco.', price: 59.90, category: 'Poleras', tag: 'Nuevo', icon: 'hoodie', audience: 'Unisex', sizes: normalizeSizes([{ size: 'S', stock: 3 }, { size: 'M', stock: 5 }, { size: 'L', stock: 4 }, { size: 'XL', stock: 3 }]), active: true, createdAt: new Date().toISOString() },
      { id: 3, name: 'Camiseta Roca Seca', description: 'Tejido técnico anti-olor, secado ultra rápido.', price: 24.90, category: 'Poleras', tag: '', icon: 'shirt', audience: 'Mujer', sizes: normalizeSizes([{ size: 'XS', stock: 5 }, { size: 'S', stock: 9 }, { size: 'M', stock: 10 }, { size: 'L', stock: 8 }]), active: true, createdAt: new Date().toISOString() },
      { id: 4, name: 'Chalk Bag Cóndor', description: 'Cierre de cordón, cepillo integrado, correa ajustable.', price: 19.90, category: 'Accesorios', tag: '', icon: 'chalkbag', audience: 'Unisex', sizes: normalizeSizes([{ size: 'Única', stock: 40 }]), active: true, createdAt: new Date().toISOString() }
    ],
    discounts: [
      { id: 1, code: 'PRIMERAVEZ10', description: '10% de descuento en tu primera compra', percent: 10, active: true, expiresAt: null, scope: 'all', scopeValue: null, createdAt: new Date().toISOString() }
    ],
    visits: [],
    purchases,
    branches,
    transactions,
    customers: [],
    _seq: {
      product: 5, discount: 2, visit: 1, purchase: purchases.length + 1,
      branch: branches.length + 1, transaction: transactions.length + 1, customer: 1
    }
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
    migrateAccountingData();
    migrateProductSizes();
    migrateCustomers();
  }
  return data;
}

// Productos creados antes de las tallas tenían un solo número de stock: ese
// número pasa íntegro a la talla "Única" para no perder lo que ya había
// cargado, y el admin lo redistribuye por talla cuando quiera.
function migrateProductSizes() {
  let changed = false;
  data.products.forEach(product => {
    if (!Array.isArray(product.sizes)) {
      product.sizes = normalizeSizes([{ size: 'Única', stock: product.stock || 0 }]);
      changed = true;
    }
    if (!AUDIENCES.includes(product.audience)) {
      product.audience = 'Unisex';
      changed = true;
    }
  });
  if (changed) save();
}

// Añade sucursales/movimientos a bases de datos creadas antes de que
// existiera el módulo de contabilidad, sin tocar el resto de los datos.
function migrateAccountingData() {
  let changed = false;
  if (!data.branches) {
    data.branches = [
      { id: 1, name: 'RAWGAT Online', address: 'Tienda en línea', type: 'online', active: true, createdAt: new Date().toISOString() }
    ];
    changed = true;
  }
  if (!data.transactions) {
    data.transactions = [];
    changed = true;
  }
  if (!data._seq.branch) {
    data._seq.branch = data.branches.reduce((max, b) => Math.max(max, b.id), 0) + 1;
    changed = true;
  }
  if (!data._seq.transaction) {
    data._seq.transaction = data.transactions.reduce((max, t) => Math.max(max, t.id), 0) + 1;
    changed = true;
  }
  data.transactions.forEach(t => {
    if (t.bankReference === undefined) {
      t.bankReference = t.reference || '';
      delete t.reference;
      changed = true;
    }
    if (t.invoiceNumber === undefined) {
      t.invoiceNumber = '';
      changed = true;
    }
  });
  if (changed) save();
}

// Añade la tabla de clientes a bases de datos creadas antes de que existiera
// el registro/login de usuarios, sin tocar el resto de los datos.
function migrateCustomers() {
  let changed = false;
  if (!data.customers) {
    data.customers = [];
    changed = true;
  }
  if (!data._seq.customer) {
    data._seq.customer = data.customers.reduce((max, c) => Math.max(max, c.id), 0) + 1;
    changed = true;
  }
  if (changed) save();
}

function save() {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

load();

// ---------- Admin ----------
function getAdmin() {
  return data.admin;
}

// ---------- Customers ----------
// Cuenta separada de la del admin: es la que usan los clientes en la tienda
// para iniciar sesión, ver su historial y recibir el descuento de bienvenida.
function sanitizeCustomer(customer) {
  if (!customer) return null;
  const { passwordHash, ...safe } = customer;
  return safe;
}

function getCustomerByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return data.customers.find(c => c.email === normalized) || null;
}

function getCustomerById(id) {
  return data.customers.find(c => c.id === Number(id)) || null;
}

function createCustomer({ name, email, password }) {
  if (getCustomerByEmail(email)) {
    return { error: 'Ya existe una cuenta con ese correo' };
  }
  const customer = {
    id: data._seq.customer++,
    name: String(name || '').trim(),
    email: String(email).trim().toLowerCase(),
    passwordHash: bcrypt.hashSync(password, 10),
    phone: '',
    address: '',
    welcomeDiscountPercent: 10,
    welcomeDiscountRedeemed: false,
    createdAt: new Date().toISOString()
  };
  data.customers.push(customer);
  save();
  return { customer };
}

function verifyCustomerLogin(email, password) {
  const customer = getCustomerByEmail(email);
  if (!customer) return null;
  return bcrypt.compareSync(password, customer.passwordHash) ? customer : null;
}

function updateCustomerProfile(id, input) {
  const customer = getCustomerById(id);
  if (!customer) return null;
  Object.assign(customer, {
    name: input.name !== undefined ? String(input.name).trim() : customer.name,
    phone: input.phone !== undefined ? String(input.phone).trim() : customer.phone,
    address: input.address !== undefined ? String(input.address).trim() : customer.address
  });
  save();
  return customer;
}

function redeemWelcomeDiscount(id) {
  const customer = getCustomerById(id);
  if (!customer || customer.welcomeDiscountRedeemed) return;
  customer.welcomeDiscountRedeemed = true;
  save();
}

function getCustomers() {
  return data.customers.map(sanitizeCustomer).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function deleteCustomer(id) {
  const before = data.customers.length;
  data.customers = data.customers.filter(c => c.id !== Number(id));
  save();
  return data.customers.length < before;
}

function getCustomerOrders(customerId) {
  return data.purchases
    .filter(p => p.customerId === Number(customerId))
    .map(p => {
      const product = data.products.find(prod => prod.id === p.productId);
      return {
        id: p.id,
        productName: product ? product.name : 'Producto eliminado',
        size: p.size || null,
        qty: p.qty,
        amount: p.amount,
        createdAt: p.createdAt
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ---------- Products ----------
// El stock total (suma de tallas) se agrega calculado en cada respuesta:
// "sizes" sigue siendo la fuente de verdad, nunca un número aparte que se
// pueda desincronizar.
function withTotalStock(product) {
  return { ...product, stock: totalStock(product) };
}

function getProducts({ onlyActive = false } = {}) {
  return data.products.filter(p => !onlyActive || p.active).map(withTotalStock);
}

function addProduct(input) {
  const product = {
    id: data._seq.product++,
    name: input.name,
    description: input.description || '',
    price: Number(input.price) || 0,
    category: input.category || 'General',
    audience: AUDIENCES.includes(input.audience) ? input.audience : 'Unisex',
    tag: input.tag || '',
    icon: input.icon || 'shirt',
    image: input.image || null,
    sizes: normalizeSizes(input.sizes),
    active: input.active !== false,
    createdAt: new Date().toISOString()
  };
  data.products.push(product);
  save();
  return withTotalStock(product);
}

function updateProduct(id, input) {
  const product = data.products.find(p => p.id === Number(id));
  if (!product) return null;
  Object.assign(product, {
    name: input.name ?? product.name,
    description: input.description ?? product.description,
    price: input.price !== undefined ? Number(input.price) : product.price,
    category: input.category ?? product.category,
    audience: input.audience !== undefined ? (AUDIENCES.includes(input.audience) ? input.audience : 'Unisex') : product.audience,
    tag: input.tag ?? product.tag,
    icon: input.icon ?? product.icon,
    image: input.image !== undefined ? (input.image || null) : product.image,
    sizes: input.sizes !== undefined ? normalizeSizes(input.sizes) : product.sizes,
    active: input.active !== undefined ? !!input.active : product.active
  });
  save();
  return withTotalStock(product);
}

// Descuenta stock de una talla puntual tras una venta confirmada; nunca baja
// de 0 aunque llegue a fallar alguna validación previa (defensivo).
function decrementSizeStock(productId, size, qty) {
  const product = data.products.find(p => p.id === Number(productId));
  if (!product) return;
  const entry = product.sizes.find(s => s.size === size) || product.sizes.find(s => s.size === 'Única');
  if (!entry) return;
  entry.stock = Math.max(0, entry.stock - qty);
  save();
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

function isLive(d, now = Date.now()) {
  if (!d.active) return false;
  if (!d.expiresAt) return true;
  return endOfDay(d.expiresAt) >= now;
}

const DISCOUNT_SCOPES = ['all', 'category', 'product'];
function normalizeScope(scope) {
  return DISCOUNT_SCOPES.includes(scope) ? scope : 'all';
}

// Solo puede haber un descuento "todo el sitio" activo a la vez: si se activa
// uno nuevo, los demás de ese mismo alcance se desactivan automáticamente.
// Los descuentos por categoría/producto no compiten entre sí de esta forma.
function deactivateOtherSitewide(exceptId) {
  data.discounts.forEach(d => {
    if (d.id !== exceptId && (d.scope || 'all') === 'all' && d.active) {
      d.active = false;
    }
  });
}

// Descuento "todo el sitio" vigente, el que se anuncia en la barra superior.
function getActiveDiscount() {
  const now = Date.now();
  return data.discounts.find(d => (d.scope || 'all') === 'all' && isLive(d, now)) || null;
}

// Mejor descuento vigente aplicable a un producto puntual: considera los
// descuentos de todo el sitio, los de su categoría y los del producto en sí,
// y se queda con el porcentaje más alto (el más beneficioso para el cliente).
function getEffectiveDiscountForProduct(product) {
  const now = Date.now();
  const candidates = data.discounts.filter(d => {
    if (!isLive(d, now)) return false;
    const scope = d.scope || 'all';
    if (scope === 'all') return true;
    if (scope === 'category') return d.scopeValue === product.category;
    if (scope === 'product') return Number(d.scopeValue) === product.id;
    return false;
  });
  if (!candidates.length) return null;
  return candidates.reduce((best, d) => (d.percent > best.percent ? d : best));
}

function addDiscount(input) {
  const scope = normalizeScope(input.scope);
  const discount = {
    id: data._seq.discount++,
    code: (input.code || '').toUpperCase(),
    description: input.description || '',
    percent: Number(input.percent) || 0,
    active: input.active !== false,
    expiresAt: input.expiresAt || null,
    scope,
    scopeValue: scope === 'all' ? null : (input.scopeValue || null),
    createdAt: new Date().toISOString()
  };
  data.discounts.push(discount);
  if (scope === 'all' && discount.active) deactivateOtherSitewide(discount.id);
  save();
  return discount;
}

function updateDiscount(id, input) {
  const discount = data.discounts.find(d => d.id === Number(id));
  if (!discount) return null;
  const scope = input.scope !== undefined ? normalizeScope(input.scope) : (discount.scope || 'all');
  Object.assign(discount, {
    code: input.code ? input.code.toUpperCase() : discount.code,
    description: input.description ?? discount.description,
    percent: input.percent !== undefined ? Number(input.percent) : discount.percent,
    active: input.active !== undefined ? !!input.active : discount.active,
    expiresAt: input.expiresAt !== undefined ? input.expiresAt : discount.expiresAt,
    scope,
    scopeValue: scope === 'all' ? null : (input.scopeValue !== undefined ? input.scopeValue : discount.scopeValue)
  });
  if (scope === 'all' && discount.active) deactivateOtherSitewide(discount.id);
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

function recordPurchase(productId, amount, { qty = 1, reference = null, size = null, customerId = null } = {}) {
  const purchase = { id: data._seq.purchase++, productId: productId || null, qty: Number(qty) || 1, size, amount: Number(amount) || 0, customerId: customerId || null, createdAt: new Date().toISOString(), demo: false };
  data.purchases.push(purchase);

  const onlineBranch = data.branches.find(b => b.type === 'online');
  if (onlineBranch) {
    const product = data.products.find(p => p.id === Number(productId));
    const sizeLabel = size && size !== 'Única' ? ` (talla ${size})` : '';
    data.transactions.push({
      id: data._seq.transaction++,
      branchId: onlineBranch.id,
      type: 'income',
      category: 'Ventas online',
      description: product ? `Venta en línea: ${product.name}${sizeLabel}` : 'Venta en línea (checkout)',
      amount: purchase.amount,
      method: 'paypal',
      invoiceNumber: '',
      bankReference: reference || '',
      productId: productId || null,
      qty: purchase.qty,
      date: purchase.createdAt.slice(0, 10),
      createdAt: purchase.createdAt,
      demo: false
    });
  }

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

// Compara ventas entre productos: unidades, ingresos y % del total, para
// detectar qué se vende más (producción) y qué promocionar (marketing).
function getProductPerformance({ days = 90 } = {}) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const inRange = data.purchases.filter(p => new Date(p.createdAt).getTime() >= since);
  const totalRevenue = inRange.reduce((sum, p) => sum + p.amount, 0);

  const statsByProduct = {};
  inRange.forEach(p => {
    const key = p.productId || 'unknown';
    if (!statsByProduct[key]) statsByProduct[key] = { unitsSold: 0, revenue: 0, orders: 0 };
    statsByProduct[key].unitsSold += p.qty || 1;
    statsByProduct[key].revenue += p.amount;
    statsByProduct[key].orders += 1;
  });

  // Se muestra todo el catálogo, no solo lo que tuvo ventas en el período,
  // agrupado por categoría — así se ve también qué no se está vendiendo.
  return data.products
    .map(product => {
      const stats = statsByProduct[product.id] || { unitsSold: 0, revenue: 0, orders: 0 };
      return {
        productId: product.id,
        name: product.name,
        category: product.category,
        icon: product.icon,
        active: product.active,
        unitsSold: stats.unitsSold,
        revenue: stats.revenue,
        orders: stats.orders,
        revenueShare: totalRevenue > 0 ? Math.round((stats.revenue / totalRevenue) * 1000) / 10 : 0
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category, 'es') || b.unitsSold - a.unitsSold);
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

// ---------- Branches ----------
function getBranches() {
  return data.branches;
}

function addBranch(input) {
  const branch = {
    id: data._seq.branch++,
    name: input.name,
    address: input.address || '',
    type: 'physical',
    active: input.active !== false,
    createdAt: new Date().toISOString()
  };
  data.branches.push(branch);
  save();
  return branch;
}

function updateBranch(id, input) {
  const branch = data.branches.find(b => b.id === Number(id));
  if (!branch) return null;
  Object.assign(branch, {
    name: input.name ?? branch.name,
    address: input.address ?? branch.address,
    active: input.active !== undefined ? !!input.active : branch.active
  });
  save();
  return branch;
}

function deleteBranch(id, { cascade = false } = {}) {
  const branch = data.branches.find(b => b.id === Number(id));
  if (!branch) return { ok: false };
  if (branch.type === 'online') return { error: 'La sucursal en línea no se puede eliminar' };
  const transactionCount = data.transactions.filter(t => t.branchId === branch.id).length;
  if (transactionCount > 0 && !cascade) {
    return { error: 'Esta sucursal tiene movimientos contables asociados', transactionCount };
  }
  if (cascade) {
    data.transactions = data.transactions.filter(t => t.branchId !== branch.id);
  }
  data.branches = data.branches.filter(b => b.id !== branch.id);
  save();
  return { ok: true };
}

// ---------- Accounting ----------
const ACCOUNTING_CATEGORIES = {
  income: ['Ventas tienda', 'Ventas online', 'Otros ingresos'],
  expense: ['Arriendo', 'Sueldos', 'Insumos y materiales', 'Marketing', 'Logística y envíos', 'Servicios básicos', 'Otros gastos']
};

function getTransactions({ branchId, type, from, to, category } = {}) {
  return data.transactions
    .filter(t => !branchId || t.branchId === Number(branchId))
    .filter(t => !type || t.type === type)
    .filter(t => !category || t.category === category)
    .filter(t => !from || t.date >= from)
    .filter(t => !to || t.date <= to)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

function addTransaction(input) {
  const type = input.type === 'expense' ? 'expense' : 'income';
  const defaultCategory = ACCOUNTING_CATEGORIES[type][ACCOUNTING_CATEGORIES[type].length - 1];
  const transaction = {
    id: data._seq.transaction++,
    branchId: Number(input.branchId),
    type,
    category: ACCOUNTING_CATEGORIES[type].includes(input.category) ? input.category : defaultCategory,
    description: input.description || '',
    amount: Math.abs(Number(input.amount)) || 0,
    method: input.method || 'transferencia',
    invoiceNumber: input.invoiceNumber || '',
    bankReference: input.bankReference || '',
    date: input.date || new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
    demo: false
  };
  data.transactions.push(transaction);
  save();
  return transaction;
}

function updateTransaction(id, input) {
  const transaction = data.transactions.find(t => t.id === Number(id));
  if (!transaction) return null;
  const type = input.type === 'expense' || input.type === 'income' ? input.type : transaction.type;
  Object.assign(transaction, {
    branchId: input.branchId !== undefined ? Number(input.branchId) : transaction.branchId,
    type,
    category: input.category && ACCOUNTING_CATEGORIES[type].includes(input.category) ? input.category : transaction.category,
    description: input.description ?? transaction.description,
    amount: input.amount !== undefined ? (Math.abs(Number(input.amount)) || 0) : transaction.amount,
    method: input.method ?? transaction.method,
    invoiceNumber: input.invoiceNumber ?? transaction.invoiceNumber,
    bankReference: input.bankReference ?? transaction.bankReference,
    date: input.date ?? transaction.date
  });
  save();
  return transaction;
}

function deleteTransaction(id) {
  const before = data.transactions.length;
  data.transactions = data.transactions.filter(t => t.id !== Number(id));
  save();
  return data.transactions.length < before;
}

function accountingTotals(transactions) {
  const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expenses = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  return { income, expenses, net: income - expenses };
}

function getAccountingSummary({ branchId, days = 30 } = {}) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const inRange = data.transactions.filter(t => {
    if (branchId && t.branchId !== Number(branchId)) return false;
    return new Date(t.date).getTime() >= since;
  });

  const byBranch = data.branches
    .filter(b => !branchId || b.id === Number(branchId))
    .map(b => ({ branchId: b.id, branchName: b.name, ...accountingTotals(inRange.filter(t => t.branchId === b.id)) }));

  const categoryTotals = {};
  inRange.forEach(t => {
    const key = `${t.type}:${t.category}`;
    categoryTotals[key] = (categoryTotals[key] || 0) + t.amount;
  });
  const byCategory = Object.entries(categoryTotals)
    .map(([key, amount]) => {
      const [type, category] = key.split(':');
      return { type, category, amount };
    })
    .sort((a, b) => b.amount - a.amount);

  return { ...accountingTotals(inRange), byBranch, byCategory };
}

function getAccountingSeries({ branchId, days = 30 } = {}) {
  const dayMs = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    buckets.push({ date: new Date(today.getTime() - i * dayMs).toISOString().slice(0, 10), income: 0, expenses: 0 });
  }
  data.transactions
    .filter(t => !branchId || t.branchId === Number(branchId))
    .forEach(t => {
      const bucket = buckets.find(b => b.date === t.date);
      if (!bucket) return;
      if (t.type === 'income') bucket.income += t.amount;
      else bucket.expenses += t.amount;
    });
  return buckets;
}

// ---------- Backup / restore ----------
// Todo lo que no sea la cuenta admin: así un respaldo se puede pasar de un
// entorno a otro (dev -> producción) sin pisar la contraseña de ese entorno.
const BACKUP_KEYS = ['products', 'discounts', 'visits', 'purchases', 'branches', 'transactions', 'customers', '_seq'];

function exportData() {
  const snapshot = {};
  BACKUP_KEYS.forEach(key => { snapshot[key] = data[key]; });
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    data: snapshot
  };
}

// "customers" es opcional al importar: un respaldo generado antes de que
// existieran las cuentas de cliente no debe rechazarse por eso.
const OPTIONAL_BACKUP_KEYS = ['customers'];

function importData(backup) {
  if (!backup || typeof backup !== 'object' || !backup.data || typeof backup.data !== 'object') {
    return { error: 'Archivo de respaldo inválido' };
  }
  const missing = BACKUP_KEYS.filter(key => !OPTIONAL_BACKUP_KEYS.includes(key) && !(key in backup.data));
  if (missing.length) {
    return { error: `Faltan datos en el respaldo: ${missing.join(', ')}` };
  }
  BACKUP_KEYS.forEach(key => {
    data[key] = key in backup.data ? backup.data[key] : (key === 'customers' ? [] : data[key]);
  });
  migrateCustomers();
  save();
  return { ok: true };
}

module.exports = {
  getAdmin,
  sanitizeCustomer, getCustomerByEmail, getCustomerById, createCustomer, verifyCustomerLogin,
  updateCustomerProfile, redeemWelcomeDiscount, getCustomerOrders, getCustomers, deleteCustomer,
  getProducts, addProduct, updateProduct, deleteProduct, decrementSizeStock,
  SIZES, AUDIENCES,
  getDiscounts, getActiveDiscount, getEffectiveDiscountForProduct, addDiscount, updateDiscount, deleteDiscount,
  recordVisit, recordPurchase, getVisitsSeries, getPurchasesSeries, getProductPerformance, getSummary,
  getBranches, addBranch, updateBranch, deleteBranch,
  ACCOUNTING_CATEGORIES,
  getTransactions, addTransaction, updateTransaction, deleteTransaction,
  getAccountingSummary, getAccountingSeries,
  exportData, importData
};
