// backend/routes/admin.routes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Middleware para parsear JSON
const jsonParser = express.json();

// Middleware para verificar que el usuario sea administrador
const isAdmin = (req, res, next) => {
  // El middleware authenticateToken ya debería haber adjuntado req.user
  if (req.user && req.user.role === 'admin') {
    next(); // El usuario es admin, continuar
  } else {
    res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
  }
};

// ======================================================
// ===       RUTAS DE ADMINISTRACIÓN DE USUARIOS      ===
// ======================================================

// Todas las rutas en este archivo requerirán autenticación y rol de admin
router.use(authenticateToken, isAdmin);

// DENTRO DE admin.routes.js, AÑADE ESTA NUEVA RUTA AL PRINCIPIO DE LA SECCIÓN DE RUTAS

// - - - - - - - - - - - - - - - - - - - -
// 👤 OBTENER TODOS LOS USUARIOS (ACTIVOS E INACTIVOS) - SOLO PARA ADMINS
router.get('/users', (req, res) => {
    db.all("SELECT id, name, email, office, role, is_active FROM users ORDER BY name", (err, users) => {
        if (err) {
            return res.status(500).json({ error: 'Error al obtener la lista completa de usuarios.' });
        }
        res.json(users || []);
    });
});
// - - - - - - - - - - - - - - - - - - - -
// 👤 CREAR UN NUEVO USUARIO (por un admin)
router.post('/users', jsonParser, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().notEmpty(),
  body('role').isIn(['user', 'admin'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
  }

  const { name, email, password, office, role } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(
      `INSERT INTO users (name, email, password, office, role) VALUES (?, ?, ?, ?, ?)`,
      [name, email, hashedPassword, office || '', role],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'El correo ya está registrado' });
          }
          return res.status(500).json({ error: 'Error al crear el usuario' });
        }
        res.status(201).json({ success: true, userId: this.lastID, message: 'Usuario creado correctamente.' });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ✏️ EDITAR UN USUARIO (por un admin)
router.put('/users/:id', jsonParser, [
    body('name').trim().notEmpty(),
    body('email').isEmail().normalizeEmail(),
    body('role').isIn(['user', 'admin'])
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Datos de usuario inválidos', details: errors.array() });
    }

    const { name, email, office, role } = req.body;
    const userId = req.params.id;

    db.run(
        `UPDATE users SET name = ?, email = ?, office = ?, role = ? WHERE id = ?`,
        [name, email, office || '', role, userId],
        function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ error: 'El correo ya pertenece a otro usuario.' });
                }
                return res.status(500).json({ error: 'Error al actualizar el usuario.' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Usuario no encontrado.' });
            }
            res.status(200).json({ success: true, message: 'Usuario actualizado correctamente.' });
        }
    );
});


// 🗑️ ELIMINAR UN USUARIO (por un admin)
router.delete('/users/:id', (req, res) => {
  const userIdToDelete = req.params.id;

  // Evitar que un admin se elimine a sí mismo
  if (parseInt(userIdToDelete, 10) === req.user.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta de administrador.' });
  }

  // --- Lógica de borrado seguro ---
  // Reasignamos las tareas creadas por el usuario a un estado "Sin asignar" o al admin que lo elimina.
  // Aquí las reasignamos al admin que ejecuta la acción (req.user.id)
  const adminId = req.user.id;

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    // 1. Reasignar tareas creadas por el usuario
    db.run(`UPDATE tasks SET created_by = ? WHERE created_by = ?`, [adminId, userIdToDelete]);

    // 2. Eliminar asignaciones de tareas a ese usuario
    db.run(`DELETE FROM task_assignments WHERE user_id = ?`, [userIdToDelete]);

    // 3. (Opcional) Manejar comentarios, adjuntos, etc. Aquí simplemente los dejamos.

    // 4. Finalmente, eliminar al usuario
    db.run(`DELETE FROM users WHERE id = ?`, [userIdToDelete], function(err) {
      if (err) {
        db.run("ROLLBACK");
        return res.status(500).json({ error: 'Error al eliminar el usuario.' });
      }
      if (this.changes === 0) {
        db.run("ROLLBACK");
        return res.status(404).json({ error: 'Usuario no encontrado.' });
      }

      db.run("COMMIT", (commitErr) => {
        if (commitErr) {
          return res.status(500).json({ error: 'Error al confirmar la eliminación.' });
        }
        res.status(200).json({ success: true, message: 'Usuario eliminado y sus tareas han sido reasignadas.' });
      });
    });
  });
});

// AÑADIR ESTE BLOQUE DE CÓDIGO DENTRO DE admin.routes.js

// ⚡ TOGGLE (ACTIVAR/DESACTIVAR) ESTADO DE UN USUARIO
router.put('/users/:id/status', jsonParser, [
    body('is_active').isIn([0, 1])
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Valor de estado inválido. Debe ser 0 o 1.' });
    }

    const userIdToToggle = req.params.id;
    const { is_active } = req.body;

    // Evitar que un admin se desactive a sí mismo
    if (parseInt(userIdToToggle, 10) === req.user.id) {
        return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta de administrador.' });
    }

    db.run(
        `UPDATE users SET is_active = ? WHERE id = ?`,
        [is_active, userIdToToggle],
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Error al cambiar el estado del usuario.' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Usuario no encontrado.' });
            }
            const message = is_active ? 'Usuario activado correctamente.' : 'Usuario desactivado correctamente.';
            res.status(200).json({ success: true, message });
        }
    );
});


module.exports = router;