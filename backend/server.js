// backend/server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
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

// 🆕 CREAR TAREA
app.post('/api/tasks', jsonParser, [
  authenticateToken,
  body('title').notEmpty().trim().escape(),
  body('due_date').isISO8601()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { title, description, due_date, priority, assigned_to, label_ids } = req.body;
  const created_by = req.userId;

  db.serialize(() => {
    db.run(
      `INSERT INTO tasks (title, description, due_date, priority, created_by) VALUES (?, ?, ?, ?, ?)`,
      [title, description || '', due_date, priority || 'media', created_by],
      function (err) {
        if (err) return res.status(500).json({ error: 'No se pudo crear la tarea' });

        const taskId = this.lastID;

        // Asignar usuarios
        if (assigned_to && Array.isArray(assigned_to)) {
          const stmt = db.prepare("INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)");
          assigned_to.forEach(id => stmt.run(taskId, id));
          stmt.finalize();
        }

        // Asignar etiquetas
        if (label_ids && Array.isArray(label_ids)) {
          const stmt = db.prepare("INSERT INTO task_labels (task_id, label_id) VALUES (?, ?)");
          label_ids.forEach(id => stmt.run(taskId, id));
          stmt.finalize();
        }

        res.status(201).json({ id: taskId, success: true });
      }
    );
  });
});

// ✅ CAMBIAR ESTADO
app.put('/api/tasks/:id/status', jsonParser, [
  authenticateToken,
  body('status').isIn(['pendiente', 'en_camino', 'completada'])
], async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const completed_at = status === 'completada' ? new Date().toISOString() : null;

  db.get("SELECT id FROM tasks WHERE id = ? AND (created_by = ? OR id IN (SELECT task_id FROM task_assignments WHERE user_id = ?))",
    [id, req.userId, req.userId], (err, task) => {
      if (err) return res.status(500).json({ error: 'Error interno' });
      if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });

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

// 📝 COMENTARIOS
app.get('/api/tasks/:id/comments', authenticateToken, (req, res) => {
  const taskId = req.params.id;
  // ▼▼▼ CONSULTA SQL MODIFICADA ▼▼▼
  const sql = `
    SELECT c.*, u.name as autor_nombre, u.avatar_url as autor_avatar_url 
    FROM comments c 
    JOIN users u ON c.autor_id = u.id 
    WHERE c.task_id = ? 
    ORDER BY c.fecha_creacion ASC
  `;
  // ▲▲▲ FIN DE LA MODIFICACIÓN ▲▲▲
  db.all(sql, [taskId],
    (err, comments) => {
        if (err) {
            console.error("Error fetching comments:", err);
            return res.status(500).json({ error: "Error al obtener comentarios" });
        }
        res.json(comments || [])
    }
  );
});

// 📝 AGREGAR COMENTARIO
app.post('/api/tasks/comments', jsonParser, [
  authenticateToken,
  body('task_id').isInt(),
  body('contenido').trim().isLength({ min: 1 }).withMessage('El contenido es obligatorio')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { task_id, contenido } = req.body;
    const autor_id = req.userId;

    db.run(
      `INSERT INTO comments (task_id, contenido, autor_id) VALUES (?, ?, ?)`,
      [task_id, contenido, autor_id],
      function (err) {
        if (err) return res.status(500).json({ error: 'Error al crear comentario' });
        res.status(201).json({ id: this.lastID, success: true });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
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