const bcrypt = require('bcryptjs');
const db = require('./db');

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

// Cada login (admin, cliente) tiene su propio contador por IP: un atacante
// probando contraseñas de clientes no debe poder bloquear el acceso admin, ni viceversa.
function createLoginLimiter() {
  const attemptsByIp = new Map();

  function isLockedOut(ip) {
    const entry = attemptsByIp.get(ip);
    if (!entry) return false;
    if (entry.count < MAX_ATTEMPTS) return false;
    if (Date.now() - entry.lastAttempt > LOCKOUT_MS) {
      attemptsByIp.delete(ip);
      return false;
    }
    return true;
  }

  function registerFailedAttempt(ip) {
    const entry = attemptsByIp.get(ip) || { count: 0, lastAttempt: 0 };
    entry.count++;
    entry.lastAttempt = Date.now();
    attemptsByIp.set(ip, entry);
  }

  function clearAttempts(ip) {
    attemptsByIp.delete(ip);
  }

  return { isLockedOut, registerFailedAttempt, clearAttempts };
}

const adminLimiter = createLoginLimiter();
const customerLimiter = createLoginLimiter();

function verifyLogin(username, password) {
  const admin = db.getAdmin();
  if (!admin || username !== admin.username) return false;
  return bcrypt.compareSync(password, admin.passwordHash);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'No autenticado' });
}

function requireAuthPage(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect('/admin/login');
}

function requireCustomerAuth(req, res, next) {
  if (req.session && req.session.customerId) return next();
  return res.status(401).json({ error: 'Debes iniciar sesión' });
}

module.exports = {
  isLockedOut: adminLimiter.isLockedOut,
  registerFailedAttempt: adminLimiter.registerFailedAttempt,
  clearAttempts: adminLimiter.clearAttempts,
  customerLimiter,
  verifyLogin,
  requireAuth,
  requireAuthPage,
  requireCustomerAuth,
  LOCKOUT_MS
};
