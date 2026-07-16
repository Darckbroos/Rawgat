const express = require('express');
const db = require('../db');
const { customerLimiter, requireCustomerAuth, requireAuth } = require('../auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Admin: solo lectura + baja de cuentas de cliente (la edición la hace cada cliente desde su cuenta).
router.get('/admin/api/customers', requireAuth, (req, res) => {
  res.json(db.getCustomers());
});

router.delete('/admin/api/customers/:id', requireAuth, (req, res) => {
  const ok = db.deleteCustomer(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.status(204).end();
});

router.post('/api/account/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nombre, correo y contraseña son obligatorios' });
  }
  if (!EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: 'Ingresa un correo válido' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const result = db.createCustomer({ name, email, password });
  if (result.error) return res.status(409).json({ error: result.error });

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Error interno al crear la cuenta' });
    req.session.customerId = result.customer.id;
    res.status(201).json({ ok: true, customer: db.sanitizeCustomer(result.customer) });
  });
});

router.post('/api/account/login', (req, res) => {
  const ip = req.ip;
  if (customerLimiter.isLockedOut(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Intenta de nuevo en unos minutos.' });
  }

  const { email, password } = req.body || {};
  const customer = email && password ? db.verifyCustomerLogin(email, password) : null;
  if (!customer) {
    customerLimiter.registerFailedAttempt(ip);
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }

  customerLimiter.clearAttempts(ip);
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Error interno al iniciar sesión' });
    req.session.customerId = customer.id;
    res.json({ ok: true, customer: db.sanitizeCustomer(customer) });
  });
});

router.post('/api/account/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('rawgat.sid');
    res.json({ ok: true });
  });
});

router.get('/api/account/me', (req, res) => {
  if (!req.session || !req.session.customerId) return res.json({ authenticated: false });
  const customer = db.getCustomerById(req.session.customerId);
  if (!customer) return res.json({ authenticated: false });
  res.json({ authenticated: true, customer: db.sanitizeCustomer(customer) });
});

router.put('/api/account/me', requireCustomerAuth, (req, res) => {
  const updated = db.updateCustomerProfile(req.session.customerId, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Cuenta no encontrada' });
  res.json({ ok: true, customer: db.sanitizeCustomer(updated) });
});

router.get('/api/account/orders', requireCustomerAuth, (req, res) => {
  res.json(db.getCustomerOrders(req.session.customerId));
});

module.exports = router;
