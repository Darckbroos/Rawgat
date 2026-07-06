const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// Public: called by the landing page once per visit
router.post('/api/track-visit', (req, res) => {
  const pagePath = typeof req.body.path === 'string' ? req.body.path.slice(0, 200) : '/';
  db.recordVisit(pagePath);
  res.status(204).end();
});

// Protected: dashboard data
router.get('/admin/api/analytics/summary', requireAuth, (req, res) => {
  res.json(db.getSummary());
});

router.get('/admin/api/analytics/series', requireAuth, (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 90);
  res.json({
    visits: db.getVisitsSeries(days),
    purchases: db.getPurchasesSeries(days)
  });
});

module.exports = router;
