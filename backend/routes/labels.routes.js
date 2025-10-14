// backend/routes/labels.routes.js

const express = require('express');
const db = require('../db');

// Es importante usar { mergeParams: true } para que este router 
// pueda acceder al ':projectId' de la ruta principal en server.js
const router = express.Router({ mergeParams: true });

// GET /api/projects/:projectId/labels
// Obtiene todas las etiquetas para un proyecto específico.
router.get('/', (req, res) => {
  const { projectId } = req.params;
  db.all('SELECT * FROM labels WHERE project_id = ?', [projectId], (err, labels) => {
    if (err) {
      console.error('Error en la base de datos al obtener etiquetas:', err.message);
      return res.status(500).json({ error: 'Error al obtener las etiquetas del proyecto.' });
    }
    res.json(labels);
  });
});

// POST /api/projects/:projectId/labels
// Crea una nueva etiqueta dentro de un proyecto.
router.post('/', (req, res) => {
    const { projectId } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'El nombre de la etiqueta es obligatorio.' });
    }

    const query = 'INSERT INTO labels (name, project_id) VALUES (?, ?)';
    db.run(query, [name.trim(), projectId], function(err) {
        if (err) {
            console.error('Error en la base de datos al crear etiqueta:', err.message);
            return res.status(500).json({ error: 'Error al crear la etiqueta.' });
        }
        res.status(201).json({ id: this.lastID, name: name.trim(), project_id: parseInt(projectId) });
    });
});

// --- ¡LA LÍNEA MÁS IMPORTANTE! ---
// Esto asegura que el router se exporte correctamente.
module.exports = router;