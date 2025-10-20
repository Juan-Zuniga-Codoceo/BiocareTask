const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const jsonParser = express.json();

router.get('/', authenticateToken, (req, res) => {
  const sql = `
    SELECT c.*, u.name as created_by_name 
    FROM categories c 
    LEFT JOIN users u ON c.created_by = u.id 
    ORDER BY c.name
  `;
  db.all(sql, [], (err, categories) => {
    if (err) {
      console.error('❌ Error al obtener categorías:', err);
      return res.status(500).json({ error: 'Error al obtener categorías' });
    }
    res.json(categories || []);
  });
});

router.post('/', jsonParser, authenticateToken, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre de la categoría es requerido' });
  }
  const sql = `INSERT INTO categories (name, created_by) VALUES (?, ?)`;
  db.run(sql, [name.trim(), req.userId], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
      }
      return res.status(500).json({ error: 'Error al crear categoría' });
    }
    res.status(201).json({ id: this.lastID, name: name.trim(), created_by: req.userId });
  });
});

module.exports = router;
