// backend/server.js
require('dotenv').config();

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const fs = require('fs');

const app = express();
// === CONFIGURACIÓN DE PUERTO Y HOST ===
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
// === DIRECTORIOS ===
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
// --- CONFIGURACIÓN DE NODEMAILER (USA VARIABLES DE ENTORNO EN PRODUCCIÓN) ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS  
  }
});


// Middleware para parsear JSON. Se aplicará selectivamente a las rutas que lo necesiten.
const jsonParser = express.json({ limit: '10mb' });

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/uploads', express.static(uploadsDir));

// === CONFIGURACIÓN DE MULTER (subida de archivos) ===
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
const fileFilter = (req, file, cb) => {
  if (req.originalUrl === '/api/user/avatar') {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes para el avatar'), false);
    }
  } else {
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/gif',
      'application/pdf', 'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'), false);
    }
  }
};
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter
});
// === CONEXIÓN A LA BASE DE DATOS ===
const db = require('./db');
// === MIDDLEWARE PERSONALIZADO ===
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});
// === AUTENTICACIÓN ===
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  db.get("SELECT id, name, email, office, role FROM users WHERE id = ?", [token], (err, user) => {
    if (err) {
      console.error('Error en autenticación:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }

    if (!user) {
      return res.status(403).json({ error: 'Token inválido o usuario no existe' });
    }

    req.userId = user.id;
    req.user = user;
    next();
  });
};

/// backend/server.js

// 🔑 1. SOLICITAR RESETEO DE CONTRASEÑA
app.post('/api/forgot-password', jsonParser, [
    body('email').isEmail().normalizeEmail() 
], async (req, res) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(200).json({ message: 'Si existe una cuenta, se ha enviado un correo de recuperación.' });
    }

    const { email } = req.body;
  
    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (err || !user) {
            if (err) {
                console.error("🔥🔥🔥 ERROR DE BASE DE DATOS:", err.message);
            }
            if (!user) {
                console.log(`ℹ️ No se encontró usuario con el correo normalizado: ${email}`);
            }
            return res.status(200).json({ message: 'Si existe una cuenta, se ha enviado un correo de recuperación.' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 3600000;

        db.run("UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?", [token, expires, user.id], async (err) => {
            if (err) {
                console.error("Error al guardar el token:", err.message);
                return res.status(500).json({ error: 'Error al guardar el token de reseteo' });
            }

            const resetLink = `http://localhost:3000/reset-password.html?token=${token}`;
            
            const mailOptions = {
                from: `"BiocareTask" <${process.env.EMAIL_USER}>`, 
                to: user.email,
                subject: 'Recuperación de Contraseña - BiocareTask',
                html: `
                  <p>Hola ${user.name},</p>
                  <p>Has solicitado restablecer tu contraseña. Haz clic en el siguiente enlace para continuar:</p>
                  <a href="${resetLink}" style="color: #049DD9; font-weight: bold;">Restablecer mi contraseña</a>
                  <p>Este enlace es válido por 1 hora. Si no solicitaste esto, puedes ignorar este correo.</p>
                `
            };

            try {
                await transporter.sendMail(mailOptions);
                console.log(`✅ Correo de recuperación enviado a ${user.email}`);
                res.status(200).json({ message: 'Si existe una cuenta, se ha enviado un correo de recuperación.' });
            } catch (emailError) {
                console.error("🔥🔥🔥 ERROR AL ENVIAR CORREO:", emailError);
                res.status(500).json({ error: 'No se pudo enviar el correo de recuperación' });
            }
        });
    });
});

// 🔑 2. REALIZAR EL RESETEO DE CONTRASEÑA
app.post('/api/reset-password', jsonParser, [body('newPassword').isLength({ min: 6 })], async (req, res) => {
  const { token, newPassword } = req.body;

  const sql = "SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > ?";
  db.get(sql, [token, Date.now()], async (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'El token es inválido o ha expirado. Por favor, solicita uno nuevo.' });
    }

    // Hashear la nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Actualizar la contraseña y limpiar el token
    const updateSql = "UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?";
    db.run(updateSql, [hashedPassword, user.id], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Error al actualizar la contraseña' });
      }
      res.status(200).json({ success: true, message: '¡Contraseña actualizada con éxito!' });
    });
  });
});

// === MANEJO DE ERRORES ===
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err.message);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'El archivo es demasiado grande' });
    }
  }

  res.status(500).json({ error: 'Error interno del servidor' });
};
// === RUTAS AMIGABLES ===
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html'));
});
app.get('/registro', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'registro.html'));
});
app.get('/tablero', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'tablero.html'));
});
app.get('/perfil', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'perfil.html'));
});
// === RUTAS API ===

/// 🔐 LOGIN
app.post('/api/login', jsonParser, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: errors.array() });
    }

    const { email, password } = req.body;

    // ▼▼▼ INICIO DE LA SOLUCIÓN (LÍNEA MODIFICADA) ▼▼▼
    const sql = "SELECT id, name, email, office, role, password, avatar_url FROM users WHERE email = ?";
    // ▲▲▲ FIN DE LA SOLUCIÓN ▲▲▲

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
          res.json(userWithoutPassword);
        } catch (compareError) {
          console.error('Error al comparar contraseñas:', compareError);
          return res.status(500).json({ error: 'Error interno al validar credenciales' });
        }
      }
    );
  } catch (error) {
    console.error('Error en proceso de login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 🆕 REGISTRO
app.post('/api/register', jsonParser, [
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

// 📋 LISTAR TAREAS
app.get('/api/tasks', authenticateToken, (req, res) => {
  const { assigned_to, created_by, status, due_date, search } = req.query;
  let sql = `
    SELECT t.*, u.name as created_by_name,
           GROUP_CONCAT(DISTINCT ua.name) as assigned_names,
           GROUP_CONCAT(DISTINCT l.name) as label_names
    FROM tasks t
    LEFT JOIN users u ON t.created_by = u.id
    LEFT JOIN task_assignments ta ON t.id = ta.task_id
    LEFT JOIN users ua ON ta.user_id = ua.id
    LEFT JOIN task_labels tl ON t.id = tl.task_id
    LEFT JOIN labels l ON tl.label_id = l.id
    WHERE 1=1
  `;
  const params = [];

  if (assigned_to) { sql += " AND ta.user_id = ?"; params.push(assigned_to); }
  if (created_by) { sql += " AND t.created_by = ?"; params.push(created_by); }
  if (status) { sql += " AND t.status = ?"; params.push(status); }
  if (due_date) { sql += " AND DATE(t.due_date) = DATE(?)"; params.push(due_date); }
  if (search) { sql += " AND (t.title LIKE ? OR t.description LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }

  sql += " GROUP BY t.id ORDER BY t.due_date ASC";
  db.all(sql, params, (err, tasks) => {
    if (err) return res.status(500).json({ error: 'Error al obtener tareas' });
    res.json(tasks || []);
  });
});

// 💡 VERIFICAR Y CREAR NOTIFICACIONES DE VENCIMIENTO
app.post('/api/tasks/check-due-today', authenticateToken, async (req, res) => {
  const userId = req.userId;
  const today = new Date().toISOString().slice(0, 10); // Formato YYYY-MM-DD

  // Busca tareas pendientes para el usuario (asignadas o creadas por él) que vencen hoy
  const sqlTasks = `
    SELECT DISTINCT t.id, t.title
    FROM tasks t
    LEFT JOIN task_assignments ta ON t.id = ta.task_id
    WHERE (t.created_by = ? OR ta.user_id = ?)
      AND date(t.due_date) = date(?)
      AND t.status = 'pendiente'
  `;
  
  db.all(sqlTasks, [userId, userId, today], (err, tasks) => {
    if (err) {
      console.error('Error al buscar tareas que vencen hoy:', err);
      return res.status(500).json({ error: 'Error al buscar tareas' });
    }
    if (tasks.length === 0) {
      return res.status(200).json({ message: 'No hay tareas que venzan hoy.' });
    }

    // Preparamos una única consulta para insertar múltiples notificaciones evitando duplicados
    const stmt = db.prepare(`
      INSERT INTO notifications (usuario_id, mensaje, tipo)
      SELECT ?, ?, 'due_today'
      WHERE NOT EXISTS (
        SELECT 1 FROM notifications 
        WHERE usuario_id = ? 
          AND tipo = 'due_today' 
          AND date(fecha_creacion) = date('now', 'localtime')
          AND mensaje = ?
      )
    `);

    let newNotificationsCount = 0;
    tasks.forEach(task => {
      const mensaje = `La tarea "${task.title.substring(0, 25)}..." vence hoy.`;
      stmt.run(userId, mensaje, userId, mensaje, function(err) {
        if (err) {
          console.error('Error al insertar notificación de vencimiento:', err.message);
        } else if (this.changes > 0) {
          newNotificationsCount++;
        }
      });
    });

    stmt.finalize((err) => {
      if (err) {
        return res.status(500).json({ error: 'Error al finalizar la creación de notificaciones' });
      }
      res.status(200).json({ success: true, new_notifications: newNotificationsCount });
    });
  });
});


// 🆕 CREAR TAREA (CON NOTIFICACIÓN POR ASIGNACIÓN)
app.post('/api/tasks', jsonParser, [authenticateToken, body('title').notEmpty().trim().escape()], async (req, res) => {
  const { title, description, due_date, priority, assigned_to, label_ids } = req.body;
  const created_by = req.userId;

  db.run(`INSERT INTO tasks (title, description, due_date, priority, created_by) VALUES (?, ?, ?, ?, ?)`,
    [title, description || '', due_date, priority || 'media', created_by],
    function (err) {
      if (err) return res.status(500).json({ error: 'No se pudo crear la tarea' });

      const taskId = this.lastID;
      const taskTitle = title.substring(0, 30); // Acortamos el título para la notificación

      // Asignar usuarios y crear notificaciones
      if (assigned_to && Array.isArray(assigned_to)) {
        const stmt = db.prepare("INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)");
        assigned_to.forEach(userId => {
          stmt.run(taskId, userId);
          // --- Lógica de Notificación ---
          if (userId !== req.userId) { // No te notifica si te auto-asignas la tarea
            const mensaje = `${req.user.name} te ha asignado una nueva tarea: "${taskTitle}..."`;
            db.run(`INSERT INTO notifications (usuario_id, mensaje, tipo) VALUES (?, ?, ?)`, [userId, mensaje, 'assignment']);
          }
        });
        stmt.finalize();
      }

      // Asignar etiquetas (sin cambios)
      if (label_ids && Array.isArray(label_ids)) {
        const stmt = db.prepare("INSERT INTO task_labels (task_id, label_id) VALUES (?, ?)");
        label_ids.forEach(id => stmt.run(taskId, id));
        stmt.finalize();
      }

      res.status(201).json({ id: taskId, success: true });
    }
  );
});

// ✏️ EDITAR TAREA
app.put('/api/tasks/:id', jsonParser, authenticateToken, async (req, res) => {
  const taskId = req.params.id;
  const { title, description, due_date, priority, assigned_to, label_ids } = req.body;

  // 1. Verificación de permisos: ¿El usuario es el creador de la tarea?
  db.get("SELECT created_by FROM tasks WHERE id = ?", [taskId], (err, task) => {
    if (err) return res.status(500).json({ error: 'Error al verificar la tarea' });
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
    if (task.created_by !== req.userId) {
      return res.status(403).json({ error: 'No tienes permiso para editar esta tarea' });
    }

    // 2. Si tiene permiso, actualizamos la tarea principal
    db.run(
      `UPDATE tasks SET title = ?, description = ?, due_date = ?, priority = ? WHERE id = ?`,
      [title, description, due_date, priority, taskId],
      function (err) {
        if (err) return res.status(500).json({ error: 'Error al actualizar la tarea' });

        // 3. Actualizamos asignaciones (borrar y volver a crear es lo más simple)
        db.run("DELETE FROM task_assignments WHERE task_id = ?", [taskId], () => {
          if (assigned_to && Array.isArray(assigned_to)) {
            const stmt = db.prepare("INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)");
            assigned_to.forEach(userId => stmt.run(taskId, userId));
            stmt.finalize();
          }
        });

        // 4. Actualizamos etiquetas (mismo método)
        db.run("DELETE FROM task_labels WHERE task_id = ?", [taskId], () => {
          if (label_ids && Array.isArray(label_ids)) {
            const stmt = db.prepare("INSERT INTO task_labels (task_id, label_id) VALUES (?, ?)");
            label_ids.forEach(labelId => stmt.run(taskId, labelId));
            stmt.finalize();
          }
        });
        
        res.status(200).json({ success: true, message: 'Tarea actualizada' });
      }
    );
  });
});

// 🗑️ ELIMINAR TAREA
app.delete('/api/tasks/:id', authenticateToken, (req, res) => {
  const taskId = req.params.id;

  // 1. Verificación de permisos: ¿El usuario es el creador de la tarea?
  db.get("SELECT created_by FROM tasks WHERE id = ?", [taskId], (err, task) => {
    if (err) return res.status(500).json({ error: 'Error al verificar la tarea' });
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
    if (task.created_by !== req.userId) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar esta tarea' });
    }

    // 2. Si tiene permiso, eliminamos la tarea. ON DELETE CASCADE se encargará del resto.
    db.run("DELETE FROM tasks WHERE id = ?", [taskId], function(err) {
      if (err) return res.status(500).json({ error: 'Error al eliminar la tarea' });
      res.status(200).json({ success: true, message: 'Tarea eliminada' });
    });
  });
});

// ✅ CAMBIAR ESTADO
// ▼▼▼ SOLUCIÓN: Añadir 'jsonParser' aquí para que el servidor pueda leer el body de la petición ▼▼▼
app.put('/api/tasks/:id/status', jsonParser, [
  authenticateToken,
  body('status').isIn(['pendiente', 'en_camino', 'completada'])
], async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // Esta línea ahora funcionará
  const completed_at = status === 'completada' ? new Date().toISOString() : null;

  db.get("SELECT id FROM tasks WHERE id = ? AND (created_by = ? OR id IN (SELECT task_id FROM task_assignments WHERE user_id = ?))",
    [id, req.userId, req.userId], (err, task) => {
      
      if (err) return res.status(500).json({ error: 'Error interno' });
      
      if (!task) return res.status(404).json({ error: 'Tarea no encontrada o sin permisos' });

      db.run("UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?", [status, completed_at, id], function (err) {
        if (err) return res.status(500).json({ error: 'Error al actualizar' });
        res.json({ success: true, changed: this.changes });
      });
    });
});

// 👥 USUARIOS
app.get('/api/users', authenticateToken, (req, res) => {
  db.all("SELECT id, name, email, office, role FROM users ORDER BY name", (err, users) => {
    if (err) return res.status(500).json({ error: 'Error al obtener usuarios' });
    res.json(users || []);
  });
});

// 🏷️ ETIQUETAS
app.get('/api/labels', authenticateToken, (req, res) => {
  db.all("SELECT * FROM labels ORDER BY name", (err, labels) => {
    if (err) return res.status(500).json({ error: 'Error al obtener etiquetas' });
    res.json(labels || []);
  });
});

// 🏷️ CREAR ETIQUETA
app.post('/api/labels', jsonParser, [
  authenticateToken,
  body('name').trim().isLength({ min: 1 }).escape().withMessage('El nombre es requerido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, color } = req.body;
    const created_by = req.userId;

    db.run(
      "INSERT OR IGNORE INTO labels (name, color, created_by) VALUES (?, ?, ?)",
      [name, color || '#00A651', created_by],
      function (err) {
        if (err) {
          console.error('Error al crear etiqueta:', err);
          return res.status(500).json({ error: 'No se pudo crear la etiqueta' });
        }

        if (this.changes === 0) {
          return res.status(409).json({ error: 'La etiqueta ya existe' });
        }

        res.status(201).json({
          id: this.lastID,
          name,
          color: color || '#00A651',
          created_by,
          success: true
        });
      }
    );
  } catch (error) {
    console.error('Error al crear etiqueta:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 🔐 CAMBIAR CONTRASEÑA
app.put('/api/user/password', jsonParser, [
  authenticateToken,
  body('currentPassword').isLength({ min: 1 }),
  body('newPassword').isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  const { currentPassword, newPassword } = req.body;
  const userId = req.userId;

  // 1. Obtener el hash actual de la contraseña del usuario
  db.get("SELECT password FROM users WHERE id = ?", [userId], async (err, user) => {
    if (err || !user) {
      return res.status(500).json({ error: 'Error al obtener datos del usuario' });
    }

    // 2. Verificar si la contraseña actual es correcta
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(403).json({ error: 'La contraseña actual es incorrecta' });
    }

    // 3. Hashear la nueva contraseña y actualizarla en la BD
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
app.post('/api/user/avatar', authenticateToken, upload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
  }

  // Construimos la URL pública del archivo
  const avatarUrl = `/uploads/${req.file.filename}`;
  const userId = req.userId;

  // Actualizamos la URL en la base de datos para el usuario
  db.run("UPDATE users SET avatar_url = ? WHERE id = ?", [avatarUrl, userId], function(err) {
    if (err) {
      console.error("Error al actualizar el avatar en la BD:", err);
      return res.status(500).json({ error: 'No se pudo actualizar la imagen de perfil.' });
    }

    // Devolvemos la nueva URL para que el frontend se actualice al instante
    res.status(200).json({ 
        success: true, 
        message: 'Avatar actualizado correctamente.',
        avatar_url: avatarUrl 
    });
  });
});

// 📎 ADJUNTOS
app.get('/api/attachments/task/:taskId', authenticateToken, (req, res) => {
  const { taskId } = req.params;
  db.get("SELECT id FROM tasks WHERE id = ? AND (created_by = ? OR id IN (SELECT task_id FROM task_assignments WHERE user_id = ?))",
    [taskId, req.userId, req.userId], (err, task) => {
      if (!task) return res.status(404).json({ error: 'Sin permisos' });

      db.all(`SELECT a.*, u.name as uploaded_by_name FROM attachments a JOIN users u ON a.uploaded_by = u.id WHERE a.task_id = ?`, [taskId],
        (err, attachments) => res.json(attachments || [])
      );
    });
});

// 📤 SUBIR ARCHIVO
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });

  const { task_id, file_name } = req.body;
  if (!task_id) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'ID de tarea requerido' });
  }

  db.get("SELECT id FROM tasks WHERE id = ? AND (created_by = ? OR id IN (SELECT task_id FROM task_assignments WHERE user_id = ?))",
    [task_id, req.userId, req.userId], (err, task) => {
      if (err) {
        fs.unlinkSync(req.file.path);
        console.error("Error al buscar la tarea durante la subida:", err.message);
        return res.status(500).json({ error: 'Error al verificar la tarea' });
      }
      if (!task) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Tarea no encontrada o sin permisos' });
      }

      db.run(
        `INSERT INTO attachments (task_id, file_path, file_name, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)`,
        [task_id, req.file.filename, file_name || req.file.originalname, req.file.mimetype, req.file.size, req.userId],
        function (err) {
          if (err) {
            fs.unlinkSync(req.file.path);
            // Mensaje de error mejorado en la consola del servidor
            console.error('Error al guardar adjunto en la BD:', err.message);
            return res.status(500).json({ error: 'No se pudo guardar la información del archivo' });
          }
          res.status(201).json({ id: this.lastID, file_path: req.file.filename });
        }
      );
    });
});

// 📥 DESCARGAR ARCHIVO
app.get('/api/download/:filename', authenticateToken, (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(uploadsDir, filename);

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });

  db.get(`SELECT a.*, t.id as task_id FROM attachments a JOIN tasks t ON a.task_id = t.id WHERE a.file_path = ? AND (t.created_by = ? OR t.id IN (SELECT task_id FROM task_assignments WHERE user_id = ?))`,
    [filename, req.userId, req.userId], (err, attachment) => {
      if (!attachment) return res.status(404).json({ error: 'Sin permisos' });

      res.setHeader('Content-Disposition', `attachment; filename="${attachment.file_name}"`);
      res.setHeader('Content-Type', attachment.file_type || 'application/octet-stream');
      fs.createReadStream(filePath).pipe(res);
    });
});

// 🗓️ RESUMEN
app.get('/api/tasks/resumen', authenticateToken, (req, res) => {
  const now = new Date().toISOString();
  const threeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const sql = `
    SELECT 
      (SELECT COUNT(*) FROM tasks WHERE status = 'pendiente' AND due_date < ?) as vencidas,
      (SELECT COUNT(*) FROM tasks WHERE status = 'pendiente' AND due_date >= ? AND due_date <= ?) as proximas,
      (SELECT COUNT(*) FROM tasks WHERE status = 'pendiente') as total_pendientes
  `;
  db.get(sql, [now, now, threeDays], (err, row) => res.json(row || { vencidas: 0, proximas: 0, total_pendientes: 0 }));
});

// 🔔 NOTIFICACIONES
app.get('/api/notifications', authenticateToken, (req, res) => {
  db.all("SELECT * FROM notifications WHERE usuario_id = ? ORDER BY fecha_creacion DESC", [req.userId], (err, notifs) => {
    res.json(notifs || []);
  });
});

// MARCAR UNA NOTIFICACIÓN COMO LEÍDA
app.put('/api/notifications/:id/read', authenticateToken, (req, res) => {
  const notificationId = req.params.id;
  const userId = req.userId;

  // Se asegura de que solo puedas marcar como leídas TUS notificaciones
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

// MARCAR TODAS LAS NOTIFICACIONES COMO LEÍDAS
app.put('/api/notifications/read-all', authenticateToken, (req, res) => {
  const userId = req.userId;
  const sql = "UPDATE notifications SET leida = 1 WHERE usuario_id = ? AND leida = 0";
  db.run(sql, [userId], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Error al actualizar las notificaciones' });
    }
    res.status(200).json({ success: true, changes: this.changes });
  });
});

// ELIMINAR UNA NOTIFICACIÓN
app.delete('/api/notifications/:id', authenticateToken, (req, res) => {
  const notificationId = req.params.id;
  const userId = req.userId;

  // Se asegura de que solo puedas eliminar TUS notificaciones
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

// ▼▼▼ REEMPLAZA ESTA RUTA EN backend/server.js ▼▼▼

// 📝 COMENTARIOS (CON ADJUNTOS AGRUPADOS)
app.get('/api/tasks/:id/comments', authenticateToken, (req, res) => {
  const taskId = req.params.id;
  const sql = `
    SELECT 
      c.id, c.contenido, c.autor_id, c.fecha_creacion,
      u.name as autor_nombre, 
      u.avatar_url as autor_avatar_url,
      a.id as attachment_id,
      a.file_path as attachment_path,
      a.file_name as attachment_name
    FROM comments c 
    JOIN users u ON c.autor_id = u.id 
    LEFT JOIN attachments a ON a.comment_id = c.id
    WHERE c.task_id = ? 
    ORDER BY c.fecha_creacion ASC
  `;

  db.all(sql, [taskId], (err, rows) => {
    if (err) {
      console.error("Error fetching comments:", err);
      return res.status(500).json({ error: "Error al obtener comentarios" });
    }

    // --- Lógica para agrupar adjuntos por comentario ---
    const commentsMap = {};
    rows.forEach(row => {
      // Si no hemos visto este comentario, lo creamos
      if (!commentsMap[row.id]) {
        commentsMap[row.id] = {
          id: row.id,
          contenido: row.contenido,
          autor_id: row.autor_id,
          fecha_creacion: row.fecha_creacion,
          autor_nombre: row.autor_nombre,
          autor_avatar_url: row.autor_avatar_url,
          attachments: [] // Creamos un array para sus adjuntos
        };
      }
      // Si la fila tiene datos de un adjunto, lo agregamos al array
      if (row.attachment_id) {
        commentsMap[row.id].attachments.push({
          id: row.attachment_id,
          file_path: row.attachment_path,
          file_name: row.attachment_name
        });
      }
    });

    // Convertimos el mapa de vuelta a un array de comentarios
    const structuredComments = Object.values(commentsMap);
    res.json(structuredComments);
  });
});

// 📝 AGREGAR COMENTARIO (CON NOTIFICACIÓN Y ARCHIVO ADJUNTO)
app.post('/api/tasks/comments', authenticateToken, upload.single('attachment'), async (req, res) => {
  const { task_id, contenido } = req.body;
  const autor_id = req.userId;

  if (!contenido || !contenido.trim()) {
    return res.status(400).json({ error: 'El contenido del comentario no puede estar vacío.' });
  }

  db.run(`INSERT INTO comments (task_id, contenido, autor_id) VALUES (?, ?, ?)`,
    [task_id, contenido, autor_id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Error al crear comentario' });
      
      const commentId = this.lastID;
      
      // Si se adjuntó un archivo, lo guardamos en la tabla 'attachments'
      if (req.file) {
        db.run(
          `INSERT INTO attachments (task_id, comment_id, file_path, file_name, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [task_id, commentId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, autor_id]
        );
      }
      
      // --- Lógica de Notificación (sin cambios) ---
      db.get("SELECT title, created_by FROM tasks WHERE id = ?", [task_id], (err, taskInfo) => {
        if (taskInfo) {
          db.all("SELECT user_id FROM task_assignments WHERE task_id = ?", [task_id], (err, assignments) => {
            const assignedUserIds = assignments.map(a => a.user_id);
            const allInvolvedIds = [...new Set([taskInfo.created_by, ...assignedUserIds])];
            const usersToNotify = allInvolvedIds.filter(id => id !== autor_id);

            if (usersToNotify.length > 0) {
              const taskTitle = taskInfo.title.substring(0, 30);
              const mensaje = `${req.user.name} comentó en la tarea: "${taskTitle}..."`;
              const stmt = db.prepare(`INSERT INTO notifications (usuario_id, mensaje, tipo) VALUES (?, ?, ?)`);
              usersToNotify.forEach(userId => stmt.run(userId, mensaje, 'comment'));
              stmt.finalize();
            }
          });
        }
      });
      
      res.status(201).json({ id: commentId, success: true });
    }
  );
});

// Ruta de salud
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Rutas no encontradas
app.use('*', (req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    res.status(404).json({ error: 'Endpoint no encontrado' });
  } else {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html'));
  }
});

// Manejo de errores (DEBE IR AL FINAL)
app.use(errorHandler);

// Cierre graceful
process.on('SIGINT', () => {
  console.log('\n🛑 Apagando servidor...');
  db.close((err) => {
    if (err) console.error('Error al cerrar BD:', err);
    else console.log('✅ BD cerrada');
    process.exit(0);
  });
});

// Iniciar servidor
app.listen(PORT, HOST, () => {
  console.log(`🚀 BiocareTask corriendo en http://${HOST}:${PORT}`);
  console.log(`📁 Base de datos: ${path.resolve(__dirname, 'database.sqlite')}`);
  console.log(`📂 Uploads: ${uploadsDir}`);
  console.log(`🌐 Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏰ Iniciado: ${new Date().toLocaleString('es-CL')}`);
});