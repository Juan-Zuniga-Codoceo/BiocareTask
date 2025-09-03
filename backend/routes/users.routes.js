// backend/routes/users.routes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const path = require('path');
const multer = require('multer');
const { body, validationResult } = require('express-validator');

// Importamos la conexión a la base de datos y el middleware de autenticación
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Middleware para parsear JSON
const jsonParser = express.json({ limit: '10mb' });

// --- Configuración de Multer para la subida de AVATAR ---
// Es la misma configuración de server.js, pero filtrando solo para la subida de avatar
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const originalName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, uniqueSuffix + '-' + originalName);
  }
});

const avatarFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten imágenes para el avatar'), false);
  }
};

const uploadAvatar = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Límite de 10MB
  fileFilter: avatarFileFilter
});


// ======================================================
// ===       DEFINICIÓN DE RUTAS DE USUARIOS          ===
// ======================================================

// 👥 OBTENER LISTA DE USUARIOS (Añadir el nuevo campo)
router.get('/users', authenticateToken, (req, res) => {
  
  db.all("SELECT id, name, email, office, role, email_notifications FROM users ORDER BY name", (err, users) => {
    if (err) return res.status(500).json({ error: 'Error al obtener usuarios' });
    res.json(users || []);
  });
});

// ⚙️ ACTUALIZAR PREFERENCIAS DEL USUARIO  // 
router.put('/user/preferences', jsonParser, authenticateToken, async (req, res) => {
  const { email_notifications } = req.body;
  const userId = req.userId;

  // Validamos que el valor sea 0 o 1
  if (email_notifications === undefined || ![0, 1].includes(email_notifications)) {
    return res.status(400).json({ error: 'Valor para email_notifications inválido.' });
  }

  db.run(
    "UPDATE users SET email_notifications = ? WHERE id = ?",
    [email_notifications, userId],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'No se pudieron actualizar las preferencias.' });
      }
      res.status(200).json({ success: true, message: 'Preferencias actualizadas.' });
    }
  );
});

// 🔐 CAMBIAR CONTRASEÑA DEL USUARIO AUTENTICADO
router.put('/user/password', jsonParser, authenticateToken, [
  body('currentPassword').isLength({ min: 1 }),
  body('newPassword').isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  const { currentPassword, newPassword } = req.body;
  const userId = req.userId;

  db.get("SELECT password FROM users WHERE id = ?", [userId], async (err, user) => {
    if (err || !user) {
      return res.status(500).json({ error: 'Error al obtener datos del usuario' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(403).json({ error: 'La contraseña actual es incorrecta' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);
    db.run("UPDATE users SET password = ? WHERE id = ?", [hashedNewPassword, userId], (err) => {
      if (err) {
        return res.status(500).json({ error: 'No se pudo actualizar la contraseña' });
      }
      res.status(200).json({ success: true, message: 'Contraseña actualizada' });
    });
  });
});

// 🖼️ SUBIR AVATAR DE USUARIO
router.post('/user/avatar', authenticateToken, uploadAvatar.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
  }

  const avatarUrl = `/uploads/${req.file.filename}`;
  const userId = req.userId;

  db.run("UPDATE users SET avatar_url = ? WHERE id = ?", [avatarUrl, userId], function(err) {
    if (err) {
      console.error("Error al actualizar el avatar en la BD:", err);
      return res.status(500).json({ error: 'No se pudo actualizar la imagen de perfil.' });
    }
    res.status(200).json({ 
        success: true, 
        message: 'Avatar actualizado correctamente.',
        avatar_url: avatarUrl 
    });
  });
});


// ======================================================
// ===     DEFINICIÓN DE RUTAS DE NOTIFICACIONES      ===
// ======================================================

// 🔔 OBTENER NOTIFICACIONES DEL USUARIO
router.get('/notifications', authenticateToken, (req, res) => {
  db.all("SELECT * FROM notifications WHERE usuario_id = ? ORDER BY fecha_creacion DESC", [req.userId], (err, notifs) => {
    if (err) return res.status(500).json({ error: 'Error al obtener notificaciones' });
    res.json(notifs || []);
  });
});

// 🔔 MARCAR UNA NOTIFICACIÓN COMO LEÍDA
router.put('/notifications/:id/read', authenticateToken, (req, res) => {
  const notificationId = req.params.id;
  const userId = req.userId;

  const sql = "UPDATE notifications SET leida = 1 WHERE id = ? AND usuario_id = ?";
  db.run(sql, [notificationId, userId], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Error al actualizar la notificación' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Notificación no encontrada o sin permisos' });
    }
    res.status(200).json({ success: true });
  });
});

// 🔔 MARCAR TODAS LAS NOTIFICACIONES COMO LEÍDAS
router.put('/notifications/read-all', authenticateToken, (req, res) => {
  const userId = req.userId;
  const sql = "UPDATE notifications SET leida = 1 WHERE usuario_id = ? AND leida = 0";
  db.run(sql, [userId], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Error al actualizar las notificaciones' });
    }
    res.status(200).json({ success: true, changes: this.changes });
  });
});

// 🔔 ELIMINAR UNA NOTIFICACIÓN
router.delete('/notifications/:id', authenticateToken, (req, res) => {
  const notificationId = req.params.id;
  const userId = req.userId;

  const sql = "DELETE FROM notifications WHERE id = ? AND usuario_id = ?";
  db.run(sql, [notificationId, userId], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Error al eliminar la notificación' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Notificación no encontrada o sin permisos' });
    }
    res.status(200).json({ success: true });
  });
});


module.exports = router;