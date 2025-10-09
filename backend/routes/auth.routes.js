// backend/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken'); 
const { sendEmail } = require('../services/email.service');
const { createEmailTemplate } = require('../services/email-template.service');
const { body, validationResult } = require('express-validator');

// Importamos la conexión a la base de datos
const db = require('../db');

// --- Middleware para parsear JSON ---
const jsonParser = express.json({ limit: '10mb' });

// ======================================================
// ===      DEFINICIÓN DE RUTAS DE AUTENTICACIÓN      ===
// ======================================================

// 🔐 LOGIN (VERSIÓN MODIFICADA)
router.post('/login', jsonParser, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: errors.array() });
    }

    const { email, password } = req.body;

    const sql = "SELECT id, name, email, office, role, password, avatar_url, email_notifications FROM users WHERE email = ? AND is_active = 1";
 
    db.get(sql, [email], async (err, user) => {
      if (err) {
        console.error('Error en consulta de login:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }
      if (!user) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }
      try {
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
          return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        
        const { password: _, ...userWithoutPassword } = user;

        // <-- 2. GENERAMOS EL TOKEN SEGURO
        const token = jwt.sign(
          { id: user.id, name: user.name, role: user.role }, // Payload del token
          process.env.JWT_SECRET,                            // Nuestra clave secreta del .env
          { expiresIn: '8h' }                                // Duración del token
        );

        // <-- 3. ENVIAMOS EL USUARIO Y EL TOKEN
        res.json({ user: userWithoutPassword, token });

      } catch (compareError) {
        console.error('Error al comparar contraseñas:', compareError);
        return res.status(500).json({ error: 'Error interno al validar credenciales' });
      }
    });
  } catch (error) {
    console.error('Error en proceso de login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 🆕 REGISTRO
router.post('/register', jsonParser, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().isLength({ min: 2 }).escape()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: errors.array() });
    }

    const { name, email, password, office } = req.body;
    const hashedPassword = await bcrypt.hash(password, 12);

    db.run(
      `INSERT INTO users (name, email, password, office, role) VALUES (?, ?, ?, ?, 'user')`,
      [name, email, hashedPassword, office || ''],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'El correo ya está registrado' });
          }
          return res.status(500).json({ error: 'Error al crear usuario' });
        }
        res.status(201).json({ success: true, userId: this.lastID });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 🔑 SOLICITAR RESETEO DE CONTRASEÑA
router.post('/forgot-password', jsonParser, [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Aún si el email es inválido, damos una respuesta genérica por seguridad
    return res.status(200).json({ message: 'Si existe una cuenta, se ha enviado un correo de recuperación.' });
  }

  const { email } = req.body;

  db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
    if (err || !user) {
      // No revelamos si el usuario no existe.
      return res.status(200).json({ message: 'Si existe una cuenta, se ha enviado un correo de recuperación.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 3600000; // 1 hora

    db.run("UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?", [token, expires, user.id], async (err) => {
      if (err) {
        console.error("Error al guardar el token de reseteo:", err.message);
        return res.status(500).json({ error: 'Error al procesar la solicitud' });
      }

      const baseUrl = process.env.APP_URL || 'http://localhost:3000';
      const resetLink = `${baseUrl}/reset-password.html?token=${token}`;

      // Código NUEVO y CORRECTO:
      const subject = 'Recuperación de Contraseña - BiocareTask';

      // 1. Creamos el contenido principal del correo
      const mainContentHtml = `
        <p style="color: #34495E; font-size: 16px; line-height: 1.5;">Has solicitado restablecer tu contraseña para tu cuenta en BiocareTask. Haz clic en el botón de abajo para continuar con el proceso.</p>
        <p style="color: #7F8C8D; font-size: 14px;">Este enlace es válido por 1 hora.</p>
      `;

      // 2. Usamos la plantilla para generar el HTML final
      const finalHtml = createEmailTemplate({
          title: 'Recuperación de Contraseña',
          recipientName: user.name,
          mainContentHtml: mainContentHtml,
          buttonUrl: resetLink,
          buttonText: 'Restablecer mi Contraseña'
      });

      try {
        // 3. Enviamos el correo con el HTML formateado
        await sendEmail(user.email, subject, finalHtml);
        res.status(200).json({ message: 'Si existe una cuenta, se ha enviado un correo de recuperación.' });
      } catch (emailError) {
        console.error("Error al enviar correo de recuperación:", emailError);
        res.status(500).json({ error: 'No se pudo enviar el correo de recuperación' });
      }
    });
  });
});

// 🔑 REALIZAR EL RESETEO DE CONTRASEÑA
router.post('/reset-password', jsonParser, [body('newPassword').isLength({ min: 6 })], async (req, res) => {
  const { token, newPassword } = req.body;

  const sql = "SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > ?";
  db.get(sql, [token, Date.now()], async (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'El token es inválido o ha expirado. Por favor, solicita uno nuevo.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    const updateSql = "UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?";
    db.run(updateSql, [hashedPassword, user.id], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Error al actualizar la contraseña' });
      }
      res.status(200).json({ success: true, message: '¡Contraseña actualizada con éxito!' });
    });
  });
});


module.exports = router;