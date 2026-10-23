const express = require('express');
const db = require('../db');

const router = express.Router();

const PAYPAL_API_BASE = process.env.PAYPAL_ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

let cachedToken = null;

async function getPayPalAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  if (!res.ok) throw new Error('No se pudo autenticar con PayPal');
  const data = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.value;
}

// Confirma con la API de PayPal — no con lo que el navegador reporta — que
// la orden existe, está pagada, y que el monto coincide con lo que el
// servidor calculó. Sin esto, cualquiera podía llamar a /confirm con un
// orderId inventado y llevarse el pedido sin haber pagado.
async function verifyPayPalOrder(orderId, expectedTotal, currency) {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return { ok: false, error: 'Could not verify the payment with PayPal' };

  const order = await res.json();
  const unit = order.purchase_units && order.purchase_units[0];
  const paidAmount = unit ? Number(unit.amount.value) : NaN;
  const paidCurrency = unit ? unit.amount.currency_code : null;

  if (order.status !== 'COMPLETED' || Math.abs(paidAmount - expectedTotal) > 0.01 || paidCurrency !== currency) {
    return { ok: false, error: 'The payment recorded with PayPal does not match this order' };
  }
  return { ok: true };
}

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
router.post('/api/checkout/confirm', async (req, res) => {
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
      const label = size === 'Única' ? '' : ` (size ${size})`;
      return res.status(409).json({ error: `Not enough stock of "${product.name}"${label}` });
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

  if (!lines.length) return res.status(400).json({ error: 'No valid products in the cart' });

  const orderId = typeof req.body.paypalOrderId === 'string' ? req.body.paypalOrderId.slice(0, 64) : null;
  const currency = process.env.PAYPAL_CURRENCY || 'EUR';

  // Sin PAYPAL_CLIENT_SECRET no hay con qué autenticarse contra la API de
  // PayPal (pasa hoy, en modo demo con client-id "sb") — se avisa en el log
  // en vez de fallar, para no romper las pruebas sin cuenta real todavía.
  if (process.env.PAYPAL_CLIENT_SECRET) {
    if (!orderId) return res.status(400).json({ error: 'Missing the PayPal order identifier' });
    try {
      const verification = await verifyPayPalOrder(orderId, total, currency);
      if (!verification.ok) return res.status(402).json({ error: verification.error });
    } catch (err) {
      console.error('[RAWGAT] Error verificando el pago con PayPal', err);
      return res.status(502).json({ error: 'Could not confirm the payment with PayPal. Please try again.' });
    }
  } else {
    console.warn('[RAWGAT] PAYPAL_CLIENT_SECRET no configurado: el pago NO se está verificando con PayPal (modo demo).');
  }

  lines.forEach(line => {
    db.recordPurchase(line.productId, line.amount, { qty: line.qty, reference: orderId, size: line.size, customerId });
    db.decrementSizeStock(line.productId, line.size, line.qty);
  });
  if (welcomeDiscountPercent) db.redeemWelcomeDiscount(customerId);

  res.json({ ok: true, total, orderId });
});

module.exports = router;
