// backend/routes/sheets.routes.js

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// --- Configuración de Multer para Fichas Técnicas (solo PDFs) ---
const uploadsDir = process.env.RENDER_UPLOADS_PATH || path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const originalName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, uniqueSuffix + '-' + originalName);
  }
});

const pdfFileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Formato de archivo no válido. Solo se permiten PDFs.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // Límite de 15MB para PDFs
  fileFilter: pdfFileFilter
});

// --- RUTAS PARA FICHAS TÉCNICAS ---

/**
 * @route   POST /api/sheets
 * @desc    Sube una nueva ficha técnica (PDF) y sus metadatos
 * @access  Privado
 */
router.post('/', authenticateToken, upload.single('sheetFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'El archivo PDF es requerido.' });
  }

  const { product_name, model, category_id, tags } = req.body;

  if (!product_name) {
    // Si falta el nombre, eliminamos el archivo subido para no dejar basura
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'El nombre del producto es requerido.' });
  }

  const sql = `
    INSERT INTO technical_sheets (product_name, model, category_id, tags, file_path, file_name, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    product_name,
    model || null,
    category_id || null,
    tags || null,
    req.file.filename,
    req.file.originalname,
    req.userId
  ];

  db.run(sql, params, function (err) {
    if (err) {
      console.error('❌ Error al guardar la ficha técnica:', err.message);
      fs.unlinkSync(req.file.path); // Limpiar archivo si la BD falla
      return res.status(500).json({ error: 'Error al guardar la información de la ficha.' });
    }
    res.status(201).json({ success: true, sheetId: this.lastID, message: 'Ficha técnica subida correctamente.' });
  });
});

/**
 * @route   GET /api/sheets/:id/download
 * @desc    Descarga el PDF de una ficha técnica
 * @access  Privado
 */
router.get('/:id/download', authenticateToken, (req, res) => {
  const sheetId = req.params.id;

  db.get(
    "SELECT file_path, file_name FROM technical_sheets WHERE id = ?", 
    [sheetId], 
    (err, sheet) => {
      if (err || !sheet) {
        return res.status(404).json({ error: 'Ficha técnica no encontrada.' });
      }

      const filePath = path.join(uploadsDir, sheet.file_path);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'El archivo PDF no se encuentra en el servidor.' });
      }

      res.setHeader('Content-Disposition', `attachment; filename="${sheet.file_name}"`);
      res.setHeader('Content-Type', 'application/pdf');
      fs.createReadStream(filePath).pipe(res);
    }
  );
});

/**
 * @route   GET /api/sheets
 * @desc    Obtiene y busca fichas técnicas
 * @access  Privado
 */
router.get('/', authenticateToken, (req, res) => {
  const { search, category } = req.query;

  let sql = `
    SELECT ts.*, c.name as category_name, u.name as uploaded_by_name
    FROM technical_sheets ts
    LEFT JOIN categories c ON ts.category_id = c.id
    LEFT JOIN users u ON ts.uploaded_by = u.id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    sql += ` AND (ts.product_name LIKE ? OR ts.model LIKE ? OR ts.tags LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (category) {
    sql += ` AND ts.category_id = ?`;
    params.push(category);
  }
  
  sql += ` ORDER BY ts.product_name ASC`;

  db.all(sql, params, (err, sheets) => {
    if (err) {
      console.error('❌ Error al obtener fichas técnicas:', err.message);
      return res.status(500).json({ error: 'Error al obtener las fichas técnicas.' });
    }
    res.json(sheets || []);
  });
});

/**
 * @route   DELETE /api/sheets/:id
 * @desc    Elimina una ficha técnica
 * @access  Privado
 */
router.delete('/:id', authenticateToken, (req, res) => {
  const sheetId = req.params.id;

  // Primero, obtenemos el path del archivo para poder borrarlo del disco
  db.get("SELECT file_path FROM technical_sheets WHERE id = ?", [sheetId], (err, sheet) => {
    if (err) {
      return res.status(500).json({ error: 'Error al buscar la ficha.' });
    }
    if (!sheet) {
      return res.status(404).json({ error: 'Ficha técnica no encontrada.' });
    }

    // Si encontramos la ficha, la eliminamos de la base de datos
    db.run("DELETE FROM technical_sheets WHERE id = ?", [sheetId], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Error al eliminar la ficha de la base de datos.' });
      }

      // Una vez eliminada de la BD, borramos el archivo físico
      const filePath = path.join(uploadsDir, sheet.file_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      res.json({ success: true, message: 'Ficha técnica eliminada correctamente.' });
    });
  });
});

module.exports = router;