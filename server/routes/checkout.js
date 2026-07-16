const express = require('express');
const db = require('../db');

const router = express.Router();

// Público: el front-end carga el SDK de PayPal con este client-id. "sb" es el
// client-id de pruebas oficial de PayPal (modo demo, sin cuenta real).
// El sitio cobra en EUR, moneda que PayPal admite de forma nativa.
router.get('/api/checkout/config', (req, res) => {
  res.json({
    clientId: process.env.PAYPAL_CLIENT_ID || 'sb',
    currency: process.env.PAYPAL_CURRENCY || 'EUR'
  });
});

// El precio nunca se confía al cliente: se recalcula acá con el mismo motor
// de descuentos que usa /api/products, y solo entonces se registra la compra.
router.post('/api/checkout/confirm', (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const products = db.getProducts({ onlyActive: true });

  const customerId = req.session && req.session.customerId ? req.session.customerId : null;
  const customer = customerId ? db.getCustomerById(customerId) : null;
  const welcomeDiscountPercent = customer && !customer.welcomeDiscountRedeemed ? customer.welcomeDiscountPercent : 0;

  let total = 0;
  const lines = [];

  for (const item of items) {
    const product = products.find(p => p.id === Number(item.id));
    if (!product) continue;
    const qty = Math.min(Math.max(Number(item.qty) || 0, 1), 20);
    const size = product.sizes.find(s => s.size === item.size) ? item.size : 'Única';
    const sizeEntry = product.sizes.find(s => s.size === size);
    if (!sizeEntry || qty > sizeEntry.stock) {
      const label = size === 'Única' ? '' : ` (talla ${size})`;
      return res.status(409).json({ error: `Sin stock suficiente de "${product.name}"${label} (disponible: ${sizeEntry ? sizeEntry.stock : 0})` });
    }
    // Los descuentos (de admin y de bienvenida) son un beneficio exclusivo de
    // clientes registrados; sin sesión iniciada siempre se cobra precio de lista.
    const discount = customerId ? db.getEffectiveDiscountForProduct(product) : null;
    let unitPrice = discount ? Math.round(product.price * (1 - discount.percent / 100) * 100) / 100 : product.price;
    if (welcomeDiscountPercent) {
      unitPrice = Math.round(unitPrice * (1 - welcomeDiscountPercent / 100) * 100) / 100;
    }
    const amount = unitPrice * qty;
    total += amount;
    lines.push({ productId: product.id, amount, qty, size });
  }

  if (!lines.length) return res.status(400).json({ error: 'Ningún producto válido en el carrito' });

  const orderId = typeof req.body.paypalOrderId === 'string' ? req.body.paypalOrderId.slice(0, 64) : null;
  lines.forEach(line => {
    db.recordPurchase(line.productId, line.amount, { qty: line.qty, reference: orderId, size: line.size, customerId });
    db.decrementSizeStock(line.productId, line.size, line.qty);
  });
  if (welcomeDiscountPercent) db.redeemWelcomeDiscount(customerId);

  res.json({ ok: true, total, orderId });
});

module.exports = router;
