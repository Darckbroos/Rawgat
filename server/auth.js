const bcrypt = require('bcryptjs');
const db = require('./db');

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
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

module.exports = { isLockedOut, registerFailedAttempt, clearAttempts, verifyLogin, requireAuth, requireAuthPage, LOCKOUT_MS };
