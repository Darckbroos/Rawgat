const express = require('express');
const db = require('../db');
const { requireAuth, requireCustomerAuth } = require('../auth');

const router = express.Router();

const MAX_REVIEW_LENGTH = 1000;

// Público: reseñas de un producto, para su ficha.
router.get('/api/products/:id/reviews', (req, res) => {
  res.json(db.getReviews(req.params.id));
});

// Cliente autenticado: si ya dejó una reseña de este producto, la trae para
// que el formulario se abra en modo "editar" en vez de crear una duplicada.
router.get('/api/products/:id/my-review', requireCustomerAuth, (req, res) => {
  res.json(db.getReviewByCustomerAndProduct(req.session.customerId, Number(req.params.id)));
});

// Cliente autenticado: escribe o actualiza su propia reseña de un producto.
// Solo puede tener una por producto — reenviar el formulario actualiza la
// existente en vez de duplicarla. El nombre se toma de la cuenta, nunca de
// lo que mande el formulario.
router.post('/api/products/:id/reviews', requireCustomerAuth, (req, res) => {
  const productId = Number(req.params.id);
  const product = db.getProducts().find(p => p.id === productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const rating = Math.round(Number(req.body.rating));
  const text = String(req.body.text || '').trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Choose a rating between 1 and 5 stars' });
  }
  if (!text) {
    return res.status(400).json({ error: 'Write a few words before submitting your review' });
  }
  if (text.length > MAX_REVIEW_LENGTH) {
    return res.status(400).json({ error: `Reviews can be at most ${MAX_REVIEW_LENGTH} characters` });
  }

  const customer = db.getCustomerById(req.session.customerId);
  if (!customer) return res.status(401).json({ error: 'You must be logged in to leave a review' });

  const existing = db.getReviewByCustomerAndProduct(customer.id, productId);
  const saved = existing
    ? db.updateReview(existing.id, { rating, text })
    : db.addReview({ productId, customerId: customer.id, customerName: customer.name, rating, text });

  res.status(existing ? 200 : 201).json(saved);
});

// Admin: solo puede ver y borrar reseñas — no crearlas ni editarlas, porque
// son la opinión real de un cliente, no un texto que el negocio redacte.
router.get('/admin/api/reviews', requireAuth, (req, res) => {
  res.json(db.getAllReviews());
});

router.delete('/admin/api/reviews/:id', requireAuth, (req, res) => {
  const ok = db.deleteReview(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Reseña no encontrada' });
  res.status(204).end();
});

module.exports = router;
