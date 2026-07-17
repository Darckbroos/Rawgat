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
function withPricing(product, isLoggedIn) {
  const discount = db.getEffectiveDiscountForProduct(product);
  const finalPrice = discount ? Math.round(product.price * (1 - discount.percent / 100) * 100) / 100 : product.price;
  return {
    ...product,
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

// Public read-only: incluye el descuento vigente (todo el sitio, categoría o
// producto específico) y el precio final ya calculado para cada producto.
// Los descuentos son solo para clientes registrados: quien no inició sesión
// ve la etiqueta y el precio rebajado como vitrina ("discountLocked"), pero
// el precio que paga (acá y en el checkout) es siempre el de lista.
router.get('/api/products', (req, res) => {
  const isLoggedIn = !!(req.session && req.session.customerId);
  res.json(db.getProducts({ onlyActive: true }).map(p => withPricing(p, isLoggedIn)));
});

// Ficha individual: misma info que el listado, para la página de producto
// propia (/producto/:id). 404 si no existe o está desactivado.
router.get('/api/products/:id', (req, res) => {
  const isLoggedIn = !!(req.session && req.session.customerId);
  const product = db.getProducts({ onlyActive: true }).find(p => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(withPricing(product, isLoggedIn));
});

module.exports = router;
