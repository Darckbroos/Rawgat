const express = require('express');
const db = require('../db');

const router = express.Router();

// Público: el front-end carga el SDK de PayPal con este client-id. "sb" es el
// client-id de pruebas oficial de PayPal (modo demo, sin cuenta real).
// PayPal no admite CLP como moneda de checkout, así que el total se cobra en
// USD usando un tipo de cambio fijo aproximado (clpPerUsd) solo para la demo.
router.get('/api/checkout/config', (req, res) => {
  res.json({
    clientId: process.env.PAYPAL_CLIENT_ID || 'sb',
    currency: process.env.PAYPAL_CURRENCY || 'USD',
    clpPerUsd: Number(process.env.CLP_PER_USD) || 950
  });
});

// El precio nunca se confía al cliente: se recalcula acá con el mismo motor
// de descuentos que usa /api/products, y solo entonces se registra la compra.
router.post('/api/checkout/confirm', (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const products = db.getProducts({ onlyActive: true });

  let total = 0;
  const lines = [];

  items.forEach(item => {
    const product = products.find(p => p.id === Number(item.id));
    if (!product) return;
    const qty = Math.min(Math.max(Number(item.qty) || 0, 1), 20);
    const discount = db.getEffectiveDiscountForProduct(product);
    const unitPrice = discount ? Math.round(product.price * (1 - discount.percent / 100)) : product.price;
    const amount = unitPrice * qty;
    total += amount;
    lines.push({ productId: product.id, amount, qty });
  });

  if (!lines.length) return res.status(400).json({ error: 'Ningún producto válido en el carrito' });

  const orderId = typeof req.body.paypalOrderId === 'string' ? req.body.paypalOrderId.slice(0, 64) : null;
  lines.forEach(line => db.recordPurchase(line.productId, line.amount, { qty: line.qty, reference: orderId }));

  res.json({ ok: true, total, orderId });
});

module.exports = router;
