require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');

const auth = require('./auth');
const sessionRoutes = require('./routes/session');
const productRoutes = require('./routes/products');
const discountRoutes = require('./routes/discounts');
const analyticsRoutes = require('./routes/analytics');

const app = express();
const PORT = process.env.PORT || 4000;
const isProd = process.env.NODE_ENV === 'production';

if (isProd && (!process.env.SESSION_SECRET || !process.env.ADMIN_PASSWORD)) {
  console.error('[RAWGAT] Faltan SESSION_SECRET o ADMIN_PASSWORD en el entorno. No se puede arrancar en producción con valores por defecto.');
  process.exit(1);
}

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: isProd ? [] : null
    }
  },
  hsts: isProd
}));

app.use(express.json({ limit: '100kb' }));

app.use(session({
  name: 'rawgat.sid',
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 12 * 60 * 60 * 1000 // 12h
  }
}));

// Public landing page
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes (public + protected, guarded internally with requireAuth)
app.use(sessionRoutes);
app.use(productRoutes);
app.use(discountRoutes);
app.use(analyticsRoutes);

// Admin panel: login page is public, dashboard requires a valid session.
// Clean URLs (no ".html") so the admin surface doesn't look like a bare static page.
app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'login.html'));
});
app.get('/admin/login.html', (req, res) => res.redirect(301, '/admin/login'));

app.get('/admin', auth.requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'dashboard.html'));
});
app.get('/admin/dashboard.html', auth.requireAuthPage, (req, res) => res.redirect(302, '/admin'));

app.use('/admin', express.static(path.join(__dirname, '..', 'admin'), { index: false }));

// No leftover debug/stack-trace responses for unhandled errors.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`\n[RAWGAT] Sitio público:  http://localhost:${PORT}`);
  console.log(`[RAWGAT] Panel admin:    http://localhost:${PORT}/admin/login\n`);
});
