// backend/server.js - VERSIÓN FINAL
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const fs = require('fs');

const app = express();

// Definir PORT y HOST al inicio
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// === MIDDLEWARE ===
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Configuración de uploads
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuración de multer
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

app.use('/uploads', express.static(uploadsDir));

// === INICIALIZAR BASE DE DATOS ===
let db;
const dbPath = path.join(__dirname, 'database.sqlite');

db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error al conectar con la base de datos:', err.message);
    process.exit(1);
  }

  console.log('✅ Base de datos conectada correctamente');
  console.log('🚀 Inicializando tablas y datos...');

  // === CREAR TABLAS ===
  db.serialize(() => {
    // Tabla users con avatar_url
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      office TEXT,
      role TEXT DEFAULT 'user',
      avatar_url TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )`, (err) => {
      if (err) console.error('❌ users:', err.message);
      else console.log('✅ Tabla users lista');
    });

    // Tabla tasks
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      priority TEXT DEFAULT 'media',
      status TEXT DEFAULT 'pendiente',
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      completed_at TEXT,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('❌ tasks:', err.message);
      else console.log('✅ Tabla tasks lista');
    });

    // Tabla labels
    db.run(`CREATE TABLE IF NOT EXISTS labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#006837',
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('❌ labels:', err.message);
      else console.log('✅ Tabla labels lista');
    });

    // Tabla task_assignments
    db.run(`CREATE TABLE IF NOT EXISTS task_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      user_id INTEGER,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(task_id, user_id)
    )`, (err) => {
      if (err) console.error('❌ task_assignments:', err.message);
      else console.log('✅ Tabla task_assignments lista');
    });

    // Tabla task_labels
    db.run(`CREATE TABLE IF NOT EXISTS task_labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      label_id INTEGER,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (label_id) REFERENCES labels(id),
      UNIQUE(task_id, label_id)
    )`, (err) => {
      if (err) console.error('❌ task_labels:', err.message);
      else console.log('✅ Tabla task_labels lista');
    });

    // Tabla attachments
    db.run(`CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT,
      uploaded_by INTEGER,
      uploaded_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )`, (err) => {
      if (err) console.error('❌ attachments:', err.message);
      else console.log('✅ Tabla attachments lista');
    });

    // === DATOS INICIALES ===
    const defaultPassword = bcrypt.hashSync('1234', 10);

    // Admin
    db.run(`INSERT OR IGNORE INTO users (name, email, password, office, role) VALUES (?, ?, ?, ?, ?)`,
      ['Admin', 'admin@biocare.cl', defaultPassword, 'Valparaíso', 'admin'],
      (err) => {
        if (err) console.error('❌ admin:', err.message);
        else console.log('✅ Usuario admin creado');
      });

    // Usuarios de ejemplo
    const users = [
      ['Paulo', 'paulo@biocare.cl', 'Quilpué'],
      ['Ana', 'ana@biocare.cl', 'Viña del Mar'],
      ['Luis', 'luis@biocare.cl', 'Quilpué'],
      ['Carla', 'carla@biocare.cl', 'Valparaíso'],
      ['Marta', 'marta@biocare.cl', 'Santiago']
    ];

    const userStmt = db.prepare("INSERT OR IGNORE INTO users (name, email, password, office) VALUES (?, ?, ?, ?)");
    users.forEach(([name, email, office]) => {
      userStmt.run(name, email, defaultPassword, office);
    });
    userStmt.finalize(() => {
      console.log('✅ Usuarios de ejemplo insertados');
    });

    // Etiquetas iniciales
    const labels = ['Viña del Mar', 'Valparaíso', 'Express', 'Factura', 'Entrega'];
    const labelStmt = db.prepare("INSERT OR IGNORE INTO labels (name, created_by) VALUES (?, 1)");
    labels.forEach(name => {
      labelStmt.run(name);
    });
    labelStmt.finalize(() => {
      console.log('✅ Etiquetas iniciales insertadas');
    });
  });
});

// === MIDDLEWARE PERSONALIZADO ===
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Validar autenticación
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

// Manejo de errores
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
// 🔐 LOGIN
app.post('/api/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: errors.array() });
    }

    const { email, password } = req.body;

    db.get(
      "SELECT id, name, email, office, role, password FROM users WHERE email = ?",
      [email],
      async (err, user) => {
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

// 🆕 REGISTRO DE USUARIOS
app.post('/api/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('name').trim().isLength({ min: 2 }).escape().withMessage('El nombre debe tener al menos 2 caracteres'),
  body('office').optional().trim().escape()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', detalles: errors.array() });
    }

    const { name, email, password, office } = req.body;

    db.get("SELECT id FROM users WHERE email = ?", [email], async (err, user) => {
      if (err) {
        console.error('Error al verificar usuario existente:', err);
        return res.status(500).json({ error: 'Error interno en la base de datos' });
      }
      
      if (user) {
        return res.status(409).json({ error: 'El correo ya está registrado' });
      }

      try {
        const hashedPassword = await bcrypt.hash(password, 12);

        db.run(
          `INSERT INTO users (name, email, password, office, role) VALUES (?, ?, ?, ?, 'user')`,
          [name, email, hashedPassword, office || ''],
          function (err) {
            if (err) {
              console.error('Error al insertar usuario:', err);
              return res.status(500).json({ error: 'No se pudo crear el usuario' });
            }
            
            res.status(201).json({ 
              success: true, 
              message: 'Usuario creado exitosamente',
              userId: this.lastID 
            });
          }
        );
      } catch (hashError) {
        console.error('Error al encriptar contraseña:', hashError);
        return res.status(500).json({ error: 'Error interno al crear usuario' });
      }
    });
  } catch (error) {
    console.error('Error en proceso de registro:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 📋 LISTAR TAREAS
app.get('/api/tasks', authenticateToken, (req, res) => {
  try {
    const { assigned_to, created_by, status, due_date, search } = req.query;
    
    let sql = `
      SELECT t.*, 
             u.name as created_by_name,
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
  } catch (error) {
    console.error('Error al listar tareas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 🆕 CREAR TAREA
app.post('/api/tasks', [
  authenticateToken,
  body('title').notEmpty().trim().escape().withMessage('El título es requerido'),
  body('due_date').isISO8601().withMessage('La fecha de entrega debe ser válida'),
  body('priority').optional().isIn(['alta', 'media', 'baja']).withMessage('Prioridad inválida')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, description, due_date, priority, assigned_to, label_ids } = req.body;
    const created_by = req.userId;

    db.serialize(() => {
      db.run(
        `INSERT INTO tasks (title, description, due_date, priority, created_by) 
         VALUES (?, ?, ?, ?, ?)`,
        [title, description || '', due_date, priority || 'media', created_by],
        function (err) {
          if (err) {
            console.error('Error al crear tarea:', err);
            return res.status(500).json({ error: 'No se pudo crear la tarea' });
          }

          const taskId = this.lastID;

          // Asignar usuarios
          if (assigned_to && Array.isArray(assigned_to)) {
            const stmt = db.prepare("INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)");
            assigned_to.forEach(userId => {
              if (userId) stmt.run(taskId, userId);
            });
            stmt.finalize();
          }

          // Asignar etiquetas
          if (label_ids && Array.isArray(label_ids)) {
            const stmt = db.prepare("INSERT INTO task_labels (task_id, label_id) VALUES (?, ?)");
            label_ids.forEach(labelId => {
              if (labelId) stmt.run(taskId, labelId);
            });
            stmt.finalize();
          }

          res.status(201).json({ 
            id: taskId, 
            success: true,
            message: 'Tarea creada exitosamente'
          });
        }
      );
    });
  } catch (error) {
    console.error('Error al crear tarea:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ✅ ACTUALIZAR ESTADO DE TAREA
app.put('/api/tasks/:id/status', [
  authenticateToken,
  body('status').isIn(['pendiente', 'en_camino', 'completada']).withMessage('Estado inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status } = req.body;
    const completed_at = status === 'completada' ? new Date().toISOString() : null;

    db.get("SELECT id FROM tasks WHERE id = ? AND (created_by = ? OR id IN (SELECT task_id FROM task_assignments WHERE user_id = ?))", 
    [id, req.userId, req.userId], (err, task) => {
      if (err) {
        console.error('Error al verificar tarea:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }
      
      if (!task) {
        return res.status(404).json({ error: 'Tarea no encontrada o no tienes permisos' });
      }

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
          
          res.json({ 
            success: true, 
            changedRows: this.changes,
            message: `Tarea marcada como ${status}`
          });
        }
      );
    });
  } catch (error) {
    console.error('Error al actualizar estado:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 👥 LISTAR USUARIOS
app.get('/api/users', authenticateToken, (req, res) => {
  try {
    db.all("SELECT id, name, email, office, role FROM users ORDER BY name", (err, users) => {
      if (err) {
        console.error('Error al obtener usuarios:', err);
        return res.status(500).json({ error: 'Error al obtener usuarios' });
      }
      res.json(users || []);
    });
  } catch (error) {
    console.error('Error al listar usuarios:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 🏷️ LISTAR ETIQUETAS
app.get('/api/labels', authenticateToken, (req, res) => {
  try {
    db.all("SELECT * FROM labels ORDER BY name", (err, labels) => {
      if (err) {
        console.error('Error al obtener etiquetas:', err);
        return res.status(500).json({ error: 'Error al obtener etiquetas' });
      }
      res.json(labels || []);
    });
  } catch (error) {
    console.error('Error al listar etiquetas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 🏷️ CREAR ETIQUETA
app.post('/api/labels', [
  authenticateToken,
  body('name').trim().isLength({ min: 1 }).escape().withMessage('El nombre de la etiqueta es requerido')
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
          success: true,
          message: 'Etiqueta creada exitosamente'
        });
      }
    );
  } catch (error) {
    console.error('Error al crear etiqueta:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 📎 LISTAR ADJUNTOS
app.get('/api/attachments/task/:taskId', authenticateToken, (req, res) => {
  try {
    const { taskId } = req.params;
    
    db.get("SELECT id FROM tasks WHERE id = ? AND (created_by = ? OR id IN (SELECT task_id FROM task_assignments WHERE user_id = ?))", 
    [taskId, req.userId, req.userId], (err, task) => {
      if (err) {
        console.error('Error al verificar tarea:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }
      
      if (!task) {
        return res.status(404).json({ error: 'Tarea no encontrada o no tienes permisos' });
      }

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
  } catch (error) {
    console.error('Error al listar adjuntos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 📤 SUBIR ARCHIVO
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se subió ningún archivo o tipo no válido' });
    }

    const { task_id, file_name } = req.body;
    
    if (!task_id) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'ID de tarea es requerido' });
    }

    db.get("SELECT id FROM tasks WHERE id = ? AND (created_by = ? OR id IN (SELECT task_id FROM task_assignments WHERE user_id = ?))", 
    [task_id, req.userId, req.userId], (err, task) => {
      if (err) {
        fs.unlinkSync(req.file.path);
        console.error('Error al verificar tarea:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }
      
      if (!task) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Tarea no encontrada o no tienes permisos' });
      }

      db.run(
        `INSERT INTO attachments (task_id, file_path, file_name, file_type, uploaded_by, file_size)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [task_id, req.file.filename, file_name || req.file.originalname, req.file.mimetype, req.userId, req.file.size],
        function (err) {
          if (err) {
            console.error('Error al guardar archivo en BD:', err);
            fs.unlinkSync(req.file.path);
            return res.status(500).json({ error: 'No se pudo guardar el archivo' });
          }
          
          res.status(201).json({ 
            id: this.lastID, 
            success: true,
            file_path: req.file.filename,
            message: 'Archivo subido exitosamente'
          });
        }
      );
    });
  } catch (err) {
    console.error('Error en upload:', err);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Error al subir archivo' });
  }
});

// 📥 DESCARGAR ARCHIVO
app.get('/api/download/:filename', authenticateToken, (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(uploadsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    
    db.get(
      `SELECT a.*, t.id as task_id 
       FROM attachments a
       JOIN tasks t ON a.task_id = t.id
       WHERE a.file_path = ? AND (t.created_by = ? OR t.id IN (SELECT task_id FROM task_assignments WHERE user_id = ?))`,
      [filename, req.userId, req.userId],
      (err, attachment) => {
        if (err) {
          console.error('Error al verificar archivo:', err);
          return res.status(500).json({ error: 'Error interno del servidor' });
        }
        
        if (!attachment) {
          return res.status(404).json({ error: 'Archivo no encontrado o no tienes permisos' });
        }
        
        res.setHeader('Content-Disposition', `attachment; filename="${attachment.file_name}"`);
        res.setHeader('Content-Type', attachment.file_type || 'application/octet-stream');
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
        fileStream.on('error', (err) => {
          console.error('Error al leer archivo:', err);
          res.status(500).json({ error: 'Error al descargar archivo' });
        });
      }
    );
  } catch (error) {
    console.error('Error en descarga:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 🗓️ RESUMEN DE TAREAS
app.get('/api/tasks/resumen', authenticateToken, (req, res) => {
  try {
    const now = new Date().toISOString();
    const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const sql = `
      SELECT 
        (SELECT COUNT(*) FROM tasks WHERE status = 'pendiente' AND due_date < ?) as vencidas,
        (SELECT COUNT(*) FROM tasks WHERE status = 'pendiente' AND due_date >= ? AND due_date <= ?) as proximas,
        (SELECT COUNT(*) FROM tasks WHERE status = 'pendiente') as total_pendientes
    `;

    db.get(sql, [now, now, threeDaysLater], (err, row) => {
      if (err) {
        console.error('Error en resumen de tareas:', err);
        return res.status(500).json({ error: 'Error al obtener resumen' });
      }
      res.json(row || { vencidas: 0, proximas: 0, total_pendientes: 0 });
    });
  } catch (error) {
    console.error('Error al obtener resumen:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 👤 PERFIL DE USUARIO
app.get('/api/user/profile', authenticateToken, (req, res) => {
  try {
    db.get(
      `SELECT id, name, email, office, role, created_at 
       FROM users WHERE id = ?`,
      [req.userId],
      (err, user) => {
        if (err) {
          console.error('Error al obtener perfil:', err);
          return res.status(500).json({ error: 'Error al obtener perfil' });
        }
        
        if (!user) {
          return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        res.json(user);
      }
    );
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 🖼️ SUBIR FOTO DE PERFIL
app.post('/api/user/avatar', [
  authenticateToken,
  upload.single('avatar')
], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se subió ninguna imagen' });
    }

    if (!req.file.mimetype.startsWith('image/')) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'El archivo debe ser una imagen' });
    }

    if (req.file.size > 5 * 1024 * 1024) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'La imagen debe ser menor a 5MB' });
    }

    const filePath = `/uploads/${req.file.filename}`;

    db.run(
      "UPDATE users SET avatar_url = ? WHERE id = ?",
      [filePath, req.userId],
      function (err) {
        if (err) {
          console.error('Error al actualizar avatar:', err);
          fs.unlinkSync(req.file.path);
          return res.status(500).json({ error: 'No se pudo actualizar la foto de perfil' });
        }

        db.get(
          "SELECT id, name, email, office, role, avatar_url FROM users WHERE id = ?",
          [req.userId],
          (err, user) => {
            if (err) console.error('Error al obtener usuario actualizado:', err);
            
            res.json({ 
              success: true,
              avatar_url: filePath,
              user: user,
              message: 'Foto de perfil actualizada correctamente'
            });
          }
        );
      }
    );
  } catch (err) {
    console.error('Error en subida de avatar:', err);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Error al subir la foto' });
  }
});

// Ruta de salud
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Manejo de rutas no encontradas
app.use('*', (req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    res.status(404).json({ error: 'Endpoint no encontrado' });
  } else {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html'));
  }
});

// ✅ Middleware de manejo de errores (DEBE IR AL FINAL)
app.use(errorHandler);

// Manejo de cierre graceful
process.on('SIGINT', () => {
  console.log('\n🛑 Apagando servidor gracefulmente...');
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Error al cerrar la base de datos:', err);
      } else {
        console.log('✅ Base de datos cerrada correctamente');
      }
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Iniciar servidor
app.listen(PORT, HOST, () => {
  console.log(`🚀 BiocareTask API ejecutándose en http://${HOST}:${PORT}`);
  console.log(`📁 Base de datos: ${path.resolve(__dirname, 'database.sqlite')}`);
  console.log(`📂 Directorio de uploads: ${uploadsDir}`);
  console.log(`🌐 Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏰ Iniciado: ${new Date().toLocaleString('es-CL')}`);
});