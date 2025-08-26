// backend/db.js
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

// Ruta absoluta para evitar problemas
const dbPath = path.join(__dirname, 'database.sqlite');

// Crear conexión a la base de datos
let db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error al conectar con la base de datos:', err.message);
    process.exit(1);
  } else {
    console.log('✅ Conexión a la base de datos establecida');
  }
});

// Habilitar verbose para ver errores detallados
db.on('trace', console.log);

// Usar serialize para ejecutar comandos en orden
db.serialize(() => {
  // === CREAR TABLAS ===

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
    if (err) {
      console.error('❌ Error al crear tabla users:', err.message);
    } else {
      console.log('✅ Tabla users lista');
    }
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
    if (err) {
      console.error('❌ Error al crear tabla tasks:', err.message);
    } else {
      console.log('✅ Tabla tasks lista');
    }
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
    if (err) {
      console.error('❌ Error al crear tabla labels:', err.message);
    } else {
      console.log('✅ Tabla labels lista');
    }
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
    if (err) {
      console.error('❌ Error al crear tabla task_assignments:', err.message);
    } else {
      console.log('✅ Tabla task_assignments lista');
    }
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
    if (err) {
      console.error('❌ Error al crear tabla task_labels:', err.message);
    } else {
      console.log('✅ Tabla task_labels lista');
    }
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
    if (err) {
      console.error('❌ Error al crear tabla attachments:', err.message);
    } else {
      console.log('✅ Tabla attachments lista');
    }
  });

  // === DATOS INICIALES ===

  const defaultPassword = bcrypt.hashSync('1234', 10);

  // Admin
  db.run(`INSERT OR IGNORE INTO users (name, email, password, office, role) VALUES (?, ?, ?, ?, ?)`,
    ['Admin', 'admin@biocare.cl', defaultPassword, 'Valparaíso', 'admin'],
    function (err) {
      if (err) {
        console.error('❌ Error al insertar admin:', err.message);
      } else if (this.changes > 0) {
        console.log('✅ Usuario admin creado');
      } else {
        console.log('ℹ️  Usuario admin ya existe');
      }
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

// Exportar la base de datos para usar en server.js
module.exports = db;