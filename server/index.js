require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const auth = require('./auth');
const sessionRoutes = require('./routes/session');
const productRoutes = require('./routes/products');
const discountRoutes = require('./routes/discounts');
const analyticsRoutes = require('./routes/analytics');

const app = express();
const PORT = process.env.PORT || 4000;
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(express.json());

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

// Admin panel: login page is public, dashboard requires a valid session
app.get('/admin', auth.requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'dashboard.html'));
});
app.get('/admin/dashboard.html', auth.requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'dashboard.html'));
});
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));

app.listen(PORT, () => {
  console.log(`\n[RAWGAT] Sitio público:  http://localhost:${PORT}`);
  console.log(`[RAWGAT] Panel admin:    http://localhost:${PORT}/admin/login.html\n`);
});
