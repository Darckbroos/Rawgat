const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// Público: reseñas de un producto, para su ficha.
router.get('/api/products/:id/reviews', (req, res) => {
  res.json(db.getReviews(req.params.id));
});

// Admin: se cargan a mano (todavía no hay formulario público de reseñas).
router.get('/admin/api/reviews', requireAuth, (req, res) => {
  res.json(db.getAllReviews());
});

router.post('/admin/api/reviews', requireAuth, (req, res) => {
  const { productId, customerName, text } = req.body;
  if (!productId || !customerName || !text) {
    return res.status(400).json({ error: 'productId, customerName y text son obligatorios' });
  }
  res.status(201).json(db.addReview(req.body));
});

router.put('/admin/api/reviews/:id', requireAuth, (req, res) => {
  const updated = db.updateReview(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Reseña no encontrada' });
  res.json(updated);
});

router.delete('/admin/api/reviews/:id', requireAuth, (req, res) => {
  const ok = db.deleteReview(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Reseña no encontrada' });
  res.status(204).end();
});

module.exports = router;
