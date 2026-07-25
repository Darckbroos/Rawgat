const express = require('express');
const auth = require('../auth');
const db = require('../db');

const router = express.Router();

router.post('/admin/api/login', (req, res) => {
  const ip = req.ip;

  if (auth.isLockedOut(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Intenta de nuevo en unos minutos.' });
  }

  const { username, password } = req.body || {};
  if (!username || !password || !auth.verifyLogin(username, password)) {
    auth.registerFailedAttempt(ip);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }

  auth.clearAttempts(ip);
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Error interno al iniciar sesión' });
    req.session.isAdmin = true;
    req.session.username = username;
    res.json({ ok: true, username });
  });
});

router.post('/admin/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('rawgat.sid');
    res.json({ ok: true });
  });
});

router.get('/admin/api/me', (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.json({ authenticated: true, username: req.session.username });
  }
  res.json({ authenticated: false });
});

router.put('/admin/api/password', auth.requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Ingresa la contraseña actual y la nueva' });
  }
  if (!auth.verifyLogin(db.getAdmin().username, currentPassword)) {
    return res.status(401).json({ error: 'La contraseña actual no es correcta' });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  }
  db.updateAdminPassword(newPassword);
  res.json({ ok: true });
});

module.exports = router;
