const express = require('express');
const db = require('../db');
const { customerLimiter, registrationLimiter, requireCustomerAuth, requireAuth } = require('../auth');
const { sendVerificationEmail } = require('../lib/email');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function verifyUrlFor(req, token) {
  return `${req.protocol}://${req.get('host')}/api/account/verify?token=${encodeURIComponent(token)}`;
}

// Admin: solo lectura + baja de cuentas de cliente (la edición la hace cada cliente desde su cuenta).
router.get('/admin/api/customers', requireAuth, (req, res) => {
  res.json(db.getCustomers());
});

router.delete('/admin/api/customers/:id', requireAuth, (req, res) => {
  const ok = db.deleteCustomer(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.status(204).end();
});

// La cuenta nace sin verificar y sin sesión iniciada: hasta que el cliente no
// confirme el email (link enviado acá), no puede iniciar sesión ni comprar.
// Esto es lo que impide cuentas falsas/bots dejando reseñas o farmeando el
// descuento de bienvenida.
router.post('/api/account/register', (req, res) => {
  const ip = req.ip;
  if (registrationLimiter.isLockedOut(ip)) {
    return res.status(429).json({ error: 'Too many accounts created from here. Please try again in a few minutes.' });
  }
  registrationLimiter.registerFailedAttempt(ip);

  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (!EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const result = db.createCustomer({ name, email, password });
  if (result.error) return res.status(409).json({ error: result.error });

  sendVerificationEmail({
    to: result.customer.email,
    name: result.customer.name,
    verifyUrl: verifyUrlFor(req, result.customer.verificationToken)
  }).catch(() => {});

  res.status(201).json({
    ok: true,
    pendingVerification: true,
    email: result.customer.email,
    message: 'Check your inbox to confirm your account before signing in.'
  });
});

router.post('/api/account/login', (req, res) => {
  const ip = req.ip;
  if (customerLimiter.isLockedOut(ip)) {
    return res.status(429).json({ error: 'Too many failed attempts. Please try again in a few minutes.' });
  }

  const { email, password } = req.body || {};
  const customer = email && password ? db.verifyCustomerLogin(email, password) : null;
  if (!customer) {
    customerLimiter.registerFailedAttempt(ip);
    return res.status(401).json({ error: 'Incorrect email or password' });
  }

  if (!customer.emailVerified) {
    customerLimiter.clearAttempts(ip);
    return res.status(403).json({
      error: 'Confirm your email before signing in. Check your inbox for the confirmation link.',
      code: 'EMAIL_NOT_VERIFIED'
    });
  }

  customerLimiter.clearAttempts(ip);
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Internal error logging in' });
    req.session.customerId = customer.id;
    res.json({ ok: true, customer: db.sanitizeCustomer(customer) });
  });
});

// Link de confirmación que llega por email. Es un GET porque se abre
// directo desde el correo, no desde una llamada fetch — por eso responde
// con un redirect a la landing en vez de JSON.
router.get('/api/account/verify', (req, res) => {
  const result = db.verifyEmailToken(req.query.token);

  if (result.error === 'expired') {
    return res.redirect(`/index.html?verify_error=expired&email=${encodeURIComponent(result.customer.email)}`);
  }
  if (result.error) {
    return res.redirect('/index.html?verify_error=invalid');
  }

  req.session.regenerate((err) => {
    if (err) return res.redirect('/index.html?verify_error=invalid');
    req.session.customerId = result.customer.id;
    res.redirect('/index.html?verified=1');
  });
});

// Reenvía el email de confirmación (cuenta creada pero el link venció o se
// perdió). No confirma si el correo existe o no en la respuesta, para no
// dar pistas a quien esté probando emails al azar.
router.post('/api/account/resend-verification', (req, res) => {
  const ip = req.ip;
  if (registrationLimiter.isLockedOut(ip)) {
    return res.status(429).json({ error: 'Too many requests from here. Please try again in a few minutes.' });
  }
  registrationLimiter.registerFailedAttempt(ip);

  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const customer = email ? db.getCustomerByEmail(email) : null;

  if (customer && !customer.emailVerified) {
    const updated = db.regenerateVerificationToken(customer.id);
    sendVerificationEmail({
      to: updated.email,
      name: updated.name,
      verifyUrl: verifyUrlFor(req, updated.verificationToken)
    }).catch(() => {});
  }

  res.json({ ok: true, message: 'If that email has a pending account, a new confirmation link is on its way.' });
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
  if (!updated) return res.status(404).json({ error: 'Account not found' });
  res.json({ ok: true, customer: db.sanitizeCustomer(updated) });
});

router.get('/api/account/orders', requireCustomerAuth, (req, res) => {
  res.json(db.getCustomerOrders(req.session.customerId));
});

module.exports = router;
