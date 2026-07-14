const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// ---------- Branches ----------
router.get('/admin/api/branches', requireAuth, (req, res) => {
  res.json(db.getBranches());
});

router.post('/admin/api/branches', requireAuth, (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name es obligatorio' });
  res.status(201).json(db.addBranch(req.body));
});

router.put('/admin/api/branches/:id', requireAuth, (req, res) => {
  const updated = db.updateBranch(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Sucursal no encontrada' });
  res.json(updated);
});

router.delete('/admin/api/branches/:id', requireAuth, (req, res) => {
  const result = db.deleteBranch(req.params.id);
  if (result.error) return res.status(400).json({ error: result.error });
  if (!result.ok) return res.status(404).json({ error: 'Sucursal no encontrada' });
  res.status(204).end();
});

// ---------- Accounting categories ----------
router.get('/admin/api/accounting/categories', requireAuth, (req, res) => {
  res.json(db.ACCOUNTING_CATEGORIES);
});

// ---------- Transactions ----------
router.get('/admin/api/transactions', requireAuth, (req, res) => {
  const { branchId, type, from, to, category } = req.query;
  res.json(db.getTransactions({ branchId, type, from, to, category }));
});

router.post('/admin/api/transactions', requireAuth, (req, res) => {
  const { branchId, amount } = req.body;
  if (!branchId || !amount) return res.status(400).json({ error: 'branchId y amount son obligatorios' });
  res.status(201).json(db.addTransaction(req.body));
});

router.put('/admin/api/transactions/:id', requireAuth, (req, res) => {
  const updated = db.updateTransaction(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Movimiento no encontrado' });
  res.json(updated);
});

router.delete('/admin/api/transactions/:id', requireAuth, (req, res) => {
  const ok = db.deleteTransaction(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Movimiento no encontrado' });
  res.status(204).end();
});

// ---------- Reports ----------
router.get('/admin/api/accounting/summary', requireAuth, (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 90);
  res.json(db.getAccountingSummary({ branchId: req.query.branchId, days }));
});

router.get('/admin/api/accounting/series', requireAuth, (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 90);
  res.json(db.getAccountingSeries({ branchId: req.query.branchId, days }));
});

module.exports = router;
