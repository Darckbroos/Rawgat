const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// Descarga un snapshot de productos, descuentos, sucursales y contabilidad
// (sin la cuenta admin, que es propia de cada entorno). Sirve para pasar
// los datos de un entorno a otro, por ejemplo de desarrollo a producción.
router.get('/admin/api/backup/export', requireAuth, (req, res) => {
  const backup = db.exportData();
  const filename = `rawgat-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.json(backup);
});

// Reemplaza productos, descuentos, sucursales y contabilidad del entorno
// actual con lo que traiga el archivo. La cuenta admin del entorno no se toca.
router.post('/admin/api/backup/import', requireAuth, (req, res) => {
  const result = db.importData(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true });
});

module.exports = router;
