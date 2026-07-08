const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

router.get('/admin/api/discounts', requireAuth, (req, res) => {
  res.json(db.getDiscounts());
});

router.post('/admin/api/discounts', requireAuth, (req, res) => {
  const { code, percent, scope, scopeValue } = req.body;
  if (!code || !percent) return res.status(400).json({ error: 'code y percent son obligatorios' });
  if (scope && scope !== 'all' && !scopeValue) {
    return res.status(400).json({ error: 'Selecciona una categoría o un producto para este descuento' });
  }
  res.status(201).json(db.addDiscount(req.body));
});

router.put('/admin/api/discounts/:id', requireAuth, (req, res) => {
  const { scope, scopeValue } = req.body;
  if (scope && scope !== 'all' && !scopeValue) {
    return res.status(400).json({ error: 'Selecciona una categoría o un producto para este descuento' });
  }
  const updated = db.updateDiscount(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Descuento no encontrado' });
  res.json(updated);
});

router.delete('/admin/api/discounts/:id', requireAuth, (req, res) => {
  const ok = db.deleteDiscount(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Descuento no encontrado' });
  res.status(204).end();
});

// Public read-only: active discount shown on the landing page
router.get('/api/discounts/active', (req, res) => {
  res.json(db.getActiveDiscount());
});

module.exports = router;
