const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'assets', 'img', 'products');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    // Nunca se confía en el nombre que manda el navegador: se genera uno
    // aleatorio con la extensión que corresponde al tipo real del archivo.
    filename: (req, file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}${ALLOWED_TYPES[file.mimetype]}`)
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES[file.mimetype]) return cb(new Error('Formato no permitido. Usa JPG, PNG, WEBP o GIF.'));
    cb(null, true);
  }
});

// Protected admin CRUD
router.get('/admin/api/products', requireAuth, (req, res) => {
  res.json(db.getProducts());
});

router.post('/admin/api/products/upload', requireAuth, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'No se pudo subir la imagen' });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
    res.status(201).json({ url: `/assets/img/products/${req.file.filename}` });
  });
});

router.post('/admin/api/products', requireAuth, (req, res) => {
  const { name, price } = req.body;
  if (!name || price === undefined || price === null || price === '' || Number.isNaN(Number(price)) || Number(price) < 0) {
    return res.status(400).json({ error: 'name y price (número válido) son obligatorios' });
  }
  res.status(201).json(db.addProduct(req.body));
});

router.put('/admin/api/products/:id', requireAuth, (req, res) => {
  const updated = db.updateProduct(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(updated);
});

router.delete('/admin/api/products/:id', requireAuth, (req, res) => {
  const ok = db.deleteProduct(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Producto no encontrado' });
  res.status(204).end();
});

// Mismo cálculo para el listado y para la ficha individual: un producto no
// puede mostrar un precio en la vitrina y otro distinto en su propia página.
//
// El stock exacto es información interna del negocio: el cliente nunca debe
// verlo (ni en pantalla ni inspeccionando la respuesta JSON de esta ruta).
// Por eso acá se reemplaza el número real por "available"/"inStock"/"lowStock"
// booleanos. El número real solo sigue viviendo en db.json y en las rutas
// /admin/api/* (products.js admin, y checkout.js que consulta db.getProducts
// directamente para validar y descontar stock al confirmar una compra).
const LOW_STOCK_THRESHOLD = 5;

function withPricing(product, isLoggedIn) {
  const discount = db.getEffectiveDiscountForProduct(product);
  const finalPrice = discount ? Math.round(product.price * (1 - discount.percent / 100) * 100) / 100 : product.price;
  const totalStock = product.stock;
  return {
    ...product,
    sizes: product.sizes.map(s => ({ size: s.size, available: s.stock > 0 })),
    stock: undefined,
    inStock: totalStock > 0,
    lowStock: totalStock > 0 && totalStock <= LOW_STOCK_THRESHOLD,
    discount: discount ? {
      code: discount.code,
      percent: discount.percent,
      expiresAt: discount.expiresAt,
      scope: discount.scope || 'all'
    } : null,
    finalPrice: isLoggedIn ? finalPrice : product.price,
    memberPrice: discount ? finalPrice : null,
    discountLocked: !!discount && !isLoggedIn
  };
}

// Public read-only: includes the active discount (site-wide, by category or
// by specific product) and the final price already calculated for each
// product. Discounts are a registered-customer-only perk: a guest sees the
// badge and the discounted price as a preview ("discountLocked"), but the
// price actually charged (here and at checkout) is always the list price.
router.get('/api/products', (req, res) => {
  const isLoggedIn = !!(req.session && req.session.customerId);
  res.json(db.getProducts({ onlyActive: true }).map(p => withPricing(p, isLoggedIn)));
});

// Single product page: same data as the listing, for its own page
// (/producto/:id). 404 if it doesn't exist or is disabled.
router.get('/api/products/:id', (req, res) => {
  const isLoggedIn = !!(req.session && req.session.customerId);
  const product = db.getProducts({ onlyActive: true }).find(p => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(withPricing(product, isLoggedIn));
});

module.exports = router;
