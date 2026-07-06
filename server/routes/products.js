const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// Protected admin CRUD
router.get('/admin/api/products', requireAuth, (req, res) => {
  res.json(db.getProducts());
});

router.post('/admin/api/products', requireAuth, (req, res) => {
  const { name, price } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'name y price son obligatorios' });
  res.status(201).json(db.addProduct(req.body));
});

router.put('/admin/api/products/:id', requireAuth, (req, res) => {
  const updated = db.updateProduct(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(updated);
});

router.delete('/admin/api/products/:id', requireAuth, (req, res) => {
  const ok = db.deleteProduct(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Producto no encontrado' });
  res.status(204).end();
});

// Public read-only
router.get('/api/products', (req, res) => {
  res.json(db.getProducts({ onlyActive: true }));
});

module.exports = router;
