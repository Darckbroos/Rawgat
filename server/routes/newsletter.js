const express = require('express');
const db = require('../db');
const { requireAuth, newsletterLimiter } = require('../auth');
const { sendNewsletterConfirmEmail, sendNewsletterCodeEmail } = require('../lib/email');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Texto que la persona aceptó al suscribirse (se guarda como prueba de
// consentimiento junto con la fecha).
const CONSENT_TEXT = 'By signing up you agree to our Privacy policy. Unsubscribe anytime.';

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function confirmUrlFor(req, token) {
  return `${baseUrl(req)}/api/newsletter/confirm?token=${encodeURIComponent(token)}`;
}

function unsubscribeUrlFor(req, token) {
  return `${baseUrl(req)}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

// Envía el código del descuento configurado en el admin. Solo se marca como
// enviado si el email salió de verdad (en modo demo, sin RESEND_API_KEY, no).
async function sendCodeTo(req, subscriber) {
  const discount = db.getNewsletterDiscount();
  if (!discount) return { sent: false, reason: 'no-discount' };
  const result = await sendNewsletterCodeEmail({
    to: subscriber.email,
    code: discount.code,
    percent: discount.percent,
    unsubscribeUrl: unsubscribeUrlFor(req, subscriber.unsubscribeToken),
    shopUrl: `${baseUrl(req)}/#shop`
  });
  if (result.sent) db.markCodeSent(subscriber.id, discount.code);
  return result;
}

// ---------------- Público ----------------

// Respuesta siempre igual (ya suscrito o no) para no revelar qué emails
// están en la lista.
router.post('/api/newsletter/subscribe', (req, res) => {
  const ip = req.ip;
  if (newsletterLimiter.isLockedOut(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Please try again in a few minutes.' });
  }
  newsletterLimiter.registerFailedAttempt(ip);

  const email = String((req.body && req.body.email) || '').trim();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }

  const { subscriber, needsConfirmation } = db.upsertPendingSubscriber(email, { consentText: CONSENT_TEXT });
  if (needsConfirmation) {
    sendNewsletterConfirmEmail({
      to: subscriber.email,
      confirmUrl: confirmUrlFor(req, subscriber.confirmToken),
      unsubscribeUrl: unsubscribeUrlFor(req, subscriber.unsubscribeToken)
    }).catch(() => {});
  }
  res.status(202).json({ ok: true });
});

router.get('/api/newsletter/confirm', async (req, res) => {
  const result = db.confirmSubscriber(String(req.query.token || ''));
  if (!result) return res.redirect('/?newsletter=invalid#newsletter');
  if (result.expired) return res.redirect('/?newsletter=expired#newsletter');
  await sendCodeTo(req, result.subscriber).catch(() => {});
  res.redirect('/?newsletter=confirmed#newsletter');
});

router.get('/api/newsletter/unsubscribe', (req, res) => {
  const sub = db.unsubscribe(String(req.query.token || ''));
  res.redirect(sub ? '/?newsletter=unsubscribed#newsletter' : '/?newsletter=invalid#newsletter');
});

// ---------------- Admin ----------------

function publicSubscriber(s) {
  return {
    id: s.id,
    email: s.email,
    status: s.status,
    createdAt: s.createdAt,
    confirmedAt: s.confirmedAt,
    unsubscribedAt: s.unsubscribedAt,
    consentAt: s.consentAt || null,
    codeSentAt: s.codeSentAt,
    codeSent: s.codeSent
  };
}

router.get('/admin/api/newsletter', requireAuth, (req, res) => {
  const subscribers = db.getSubscribers().map(publicSubscriber);
  const discount = db.getNewsletterDiscount();
  const settings = db.getNewsletterSettings();
  res.json({
    subscribers,
    settings,
    discount: discount ? { id: discount.id, code: discount.code, percent: discount.percent } : null,
    discountConfiguredButInactive: !!settings.discountId && !discount,
    emailConfigured: !!process.env.RESEND_API_KEY,
    counts: {
      confirmed: subscribers.filter(s => s.status === 'confirmed').length,
      pending: subscribers.filter(s => s.status === 'pending').length,
      unsubscribed: subscribers.filter(s => s.status === 'unsubscribed').length,
      awaitingCode: subscribers.filter(s => s.status === 'confirmed' && !s.codeSentAt).length
    }
  });
});

router.put('/admin/api/newsletter/settings', requireAuth, (req, res) => {
  const result = db.updateNewsletterSettings(req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result.settings);
});

// Envía el código a quienes confirmaron pero aún no lo recibieron (por
// ejemplo, si confirmaron antes de que hubiera un descuento asignado).
router.post('/admin/api/newsletter/send-pending-codes', requireAuth, async (req, res) => {
  if (!db.getNewsletterDiscount()) {
    return res.status(400).json({ error: 'Asigna primero un descuento activo a la newsletter' });
  }
  const pending = db.getSubscribers().filter(s => s.status === 'confirmed' && !s.codeSentAt);
  let sent = 0;
  let failed = 0;
  for (const sub of pending) {
    // eslint-disable-next-line no-await-in-loop
    const result = await sendCodeTo(req, sub).catch(() => ({ sent: false }));
    if (result.sent) sent++; else failed++;
  }
  res.json({ total: pending.length, sent, failed, emailConfigured: !!process.env.RESEND_API_KEY });
});

router.delete('/admin/api/newsletter/subscribers/:id', requireAuth, (req, res) => {
  const ok = db.deleteSubscriber(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Suscriptor no encontrado' });
  res.status(204).end();
});

function csvCell(value) {
  const str = value === null || value === undefined ? '' : String(value);
  // Evita inyección de fórmulas al abrir el CSV en Excel/Sheets.
  const safe = /^[=+\-@]/.test(str) ? `'${str}` : str;
  return `"${safe.replace(/"/g, '""')}"`;
}

router.get('/admin/api/newsletter/export.csv', requireAuth, (req, res) => {
  const rows = [['email', 'estado', 'alta', 'confirmado', 'baja', 'consentimiento', 'codigo_enviado', 'codigo']];
  db.getSubscribers().forEach(s => rows.push([s.email, s.status, s.createdAt, s.confirmedAt, s.unsubscribedAt, s.consentAt, s.codeSentAt, s.codeSent]));
  const csv = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="rawgat-newsletter-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + csv);
});

module.exports = router;
