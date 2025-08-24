// backend/server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const { body, validationResult } = require('express-validator');
const app = express();
const PORT = 3000;


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

// === SERVIR ARCHIVOS ESTÁTICOS ===
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// === MIDDLEWARE ===
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Conexión a la base de datos
const db = require('./db');

// === RUTAS API ===

// 🔐 LOGIN
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  // Validación básica
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }

  db.get(
    "SELECT id, name, email, office, role, password FROM users WHERE email = ?",
    [email],
    async (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: 'Usuario o clave incorrectos' });
      }

      try {
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
          return res.status(401).json({ error: 'Usuario o clave incorrectos' });
        }

        // Eliminar la contraseña antes de enviar
        const { password: _, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
      } catch (compareError) {
        console.error('Error al comparar contraseñas:', compareError);
        return res.status(500).json({ error: 'Error interno al validar credenciales' });
      }
    }
  );
});

// 🆕 REGISTRO DE USUARIOS
app.post('/api/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().notEmpty().escape(),
  body('office').optional().trim().escape()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: errors.array() });
  }

  const { name, email, password, office } = req.body;

  // Verificar si el usuario ya existe
  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Error interno en la base de datos' });
    }
    if (user) {
      return res.status(400).json({ error: 'El correo ya está registrado' });
    }

    try {
      // Encriptar contraseña
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insertar nuevo usuario
      db.run(
        `INSERT INTO users (name, email, password, office, role) VALUES (?, ?, ?, ?, 'user')`,
        [name, email, hashedPassword, office || ''],
        function (err) {
          if (err) {
            console.error('Error al insertar usuario:', err);
            return res.status(500).json({ error: 'No se pudo crear el usuario' });
          }
          res.json({ success: true, message: 'Usuario creado exitosamente' });
        }
      );
    } catch (hashError) {
      console.error('Error al encriptar contraseña:', hashError);
      return res.status(500).json({ error: 'Error interno al crear usuario' });
    }
  });
});

// 📋 LISTAR TAREAS (con filtros)
app.get('/api/tasks', (req, res) => {
  const { assigned_to, created_by, status, due_date, search } = req.query;
  let sql = `
    SELECT t.*, 
           u.name as created_by_name,
           GROUP_CONCAT(ua.name, ', ') as assigned_names,
           GROUP_CONCAT(l.name, ', ') as label_names
    FROM tasks t
    LEFT JOIN users u ON t.created_by = u.id
    LEFT JOIN task_assignments ta ON t.id = ta.task_id
    LEFT JOIN users ua ON ta.user_id = ua.id
    LEFT JOIN task_labels tl ON t.id = tl.task_id
    LEFT JOIN labels l ON tl.label_id = l.id
    WHERE 1=1
  `;
  const params = [];

  if (assigned_to) {
    sql += " AND ta.user_id = ?";
    params.push(assigned_to);
  }
  if (created_by) {
    sql += " AND t.created_by = ?";
    params.push(created_by);
  }
  if (status) {
    sql += " AND t.status = ?";
    params.push(status);
  }
  if (due_date) {
    sql += " AND DATE(t.due_date) = DATE(?)";
    params.push(due_date);
  }
  if (search) {
    sql += " AND (t.title LIKE ? OR t.description LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += " GROUP BY t.id ORDER BY t.due_date ASC";

  db.all(sql, params, (err, tasks) => {
    if (err) {
      console.error('Error en consulta de tareas:', err);
      return res.status(500).json({ error: 'Error al obtener tareas' });
    }
    res.json(tasks || []);
  });
});

// 🆕 CREAR TAREA
app.post('/api/tasks', [
  body('title').notEmpty().trim().escape(),
  body('due_date').isISO8601(),
  body('priority').optional().isIn(['alta', 'media', 'baja'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { title, description, due_date, priority, assigned_to, label_ids } = req.body;
  const created_by = req.body.created_by || 1; // Temporal

  db.serialize(() => {
    db.run(
      `INSERT INTO tasks (title, description, due_date, priority, created_by) 
       VALUES (?, ?, ?, ?, ?)`,
      [title, description, due_date, priority || 'media', created_by],
      function (err) {
        if (err) {
          console.error('Error al crear tarea:', err);
          return res.status(500).json({ error: 'No se pudo crear la tarea' });
        }

        const taskId = this.lastID;

        // Asignar usuarios
        if (assigned_to && Array.isArray(assigned_to) && assigned_to.length > 0) {
          const stmt = db.prepare("INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)");
          assigned_to.forEach(userId => stmt.run(taskId, userId));
          stmt.finalize();
        }

        // Asignar etiquetas
        if (label_ids && Array.isArray(label_ids) && label_ids.length > 0) {
          const stmt = db.prepare("INSERT INTO task_labels (task_id, label_id) VALUES (?, ?)");
          label_ids.forEach(labelId => stmt.run(taskId, labelId));
          stmt.finalize();
        }

        res.json({ id: taskId, success: true });
      }
    );
  });
});

// ✅ MARCAR COMO COMPLETADA (o cambiar estado)
app.put('/api/tasks/:id/status', [
  body('status').isIn(['pendiente', 'en_camino', 'completada'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { status } = req.body;
  const completed_at = status === 'completada' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;

  db.run(
    "UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?",
    [status, completed_at, id],
    function (err) {
      if (err) {
        console.error('Error al actualizar estado:', err);
        return res.status(500).json({ error: 'No se pudo actualizar el estado' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Tarea no encontrada' });
      }
      res.json({ success: true, changedRows: this.changes });
    }
  );
});

// 👥 LISTAR USUARIOS
app.get('/api/users', (req, res) => {
  db.all("SELECT id, name, email, office FROM users ORDER BY name", (err, users) => {
    if (err) {
      console.error('Error al obtener usuarios:', err);
      return res.status(500).json({ error: 'Error al obtener usuarios' });
    }
    res.json(users || []);
  });
});

// 🏷️ LISTAR ETIQUETAS
app.get('/api/labels', (req, res) => {
  db.all("SELECT * FROM labels ORDER BY name", (err, labels) => {
    if (err) {
      console.error('Error al obtener etiquetas:', err);
      return res.status(500).json({ error: 'Error al obtener etiquetas' });
    }
    res.json(labels || []);
  });
});

// 🏷️ CREAR ETIQUETA
app.post('/api/labels', [
  body('name').trim().notEmpty().escape()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, color, created_by } = req.body;
  const userId = created_by || 1;

  db.run(
    "INSERT OR IGNORE INTO labels (name, color, created_by) VALUES (?, ?, ?)",
    [name, color || '#00A651', userId],
    function (err) {
      if (err) {
        console.error('Error al crear etiqueta:', err);
        return res.status(500).json({ error: 'No se pudo crear la etiqueta' });
      }
      res.json({ id: this.lastID, success: true });
    }
  );
});

// 📎 SUBIR ADJUNTO (simulación)
app.post('/api/attachments', [
  body('task_id').isInt(),
  body('file_name').trim().notEmpty(),
  body('file_path').trim().notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { task_id, file_path, file_name, file_type, uploaded_by } = req.body;

  db.run(
    `INSERT INTO attachments (task_id, file_path, file_name, file_type, uploaded_by)
     VALUES (?, ?, ?, ?, ?)`,
    [task_id, file_path, file_name, file_type || 'application/octet-stream', uploaded_by],
    function (err) {
      if (err) {
        console.error('Error al subir adjunto:', err);
        return res.status(500).json({ error: 'No se pudo guardar el adjunto' });
      }
      res.json({ id: this.lastID, success: true });
    }
  );
});

// 📎 LISTAR ADJUNTOS DE UNA TAREA
app.get('/api/attachments/task/:taskId', (req, res) => {
  const { taskId } = req.params;
  db.all(
    `SELECT a.*, u.name as uploaded_by_name 
     FROM attachments a
     JOIN users u ON a.uploaded_by = u.id
     WHERE a.task_id = ?`,
    [taskId],
    (err, attachments) => {
      if (err) {
        console.error('Error al obtener adjuntos:', err);
        return res.status(500).json({ error: 'Error al obtener adjuntos' });
      }
      res.json(attachments || []);
    }
  );
});

// 🗓️ TAREAS VENCIDAS / PRÓXIMAS
app.get('/api/tasks/resumen', (req, res) => {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const sql = `
    SELECT 
      (SELECT COUNT(*) FROM tasks WHERE status = 'pendiente' AND due_date < ?) as vencidas,
      (SELECT COUNT(*) FROM tasks WHERE status = 'pendiente' AND due_date >= ? AND due_date <= datetime('now', '+3 days')) as proximas,
      (SELECT COUNT(*) FROM tasks WHERE status = 'pendiente') as total_pendientes
  `;

  db.get(sql, [now, now], (err, row) => {
    if (err) {
      console.error('Error en resumen de tareas:', err);
      return res.status(500).json({ error: 'Error al obtener resumen' });
    }
    res.json(row || { vencidas: 0, proximas: 0, total_pendientes: 0 });
  });
});

// 🏠 Ruta raíz (opcional, para redirigir o debug)
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 BiocareTask API lista en http://localhost:${PORT}`);
  console.log(`📁 Base de datos: ${path.resolve(__dirname, 'database.sqlite')}`);
  console.log(`🌐 Accesible desde cualquier dispositivo en la red`);
});