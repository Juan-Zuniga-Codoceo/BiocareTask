// backend/db.js
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs'); // Módulo para interactuar con el sistema de archivos

// === CONFIGURACIÓN DE LA BASE DE DATOS ===

// Esta variable de entorno es creada por Render y contiene la ruta de tu disco (ej: '/data/db')
const dbDir = process.env.RENDER_DISK_MOUNT_PATH || __dirname;

// Nos aseguramos de que el directorio del disco persistente exista antes de usarlo.
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// La ruta final ahora apuntará a '/data/db/database.sqlite' en Render,
// o a la carpeta 'backend/' en tu entorno local.
const dbPath = path.join(dbDir, 'database.sqlite');

let db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error al conectar con la base de datos:', err.message);
    process.exit(1);
  } else {
    // Logueamos la ruta para saber siempre dónde se está guardando la BD.
    console.log(`✅ Conexión a la base de datos establecida en: ${dbPath}`);
  }
});

// === HABILITAR FOREIGN KEYS ===
db.run("PRAGMA foreign_keys = ON", (err) => {
  if (err) {
    console.error('❌ Error al activar foreign keys:', err.message);
  } else {
    console.log('✅ Foreign keys activadas');
  }
});

// === CREAR TABLAS EN ORDEN ===
db.serialize(() => {
  // Tabla users
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    office TEXT,
    role TEXT DEFAULT 'user',
    avatar_url TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    reset_token TEXT,  
    reset_token_expires INTEGER,
    email_notifications INTEGER DEFAULT 1 -- <<< AÑADIR ESTA LÍNEA
  )`, (err) => {
    if (err) {
      console.error('❌ Error al crear tabla users:', err.message);
    } else {
      // Para actualizar la tabla si ya existe, sin borrar datos
      db.run("ALTER TABLE users ADD COLUMN email_notifications INTEGER DEFAULT 1", () => {});
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
    is_archived INTEGER DEFAULT 0, -- <<< AÑADIR ESTA LÍNEA
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`, (err) => {
    if (err) {
      console.error('❌ Error al crear tabla tasks:', err.message);
    } else {
      // Para actualizar la tabla si ya existe, sin borrar datos
      db.run("ALTER TABLE tasks ADD COLUMN is_archived INTEGER DEFAULT 0", () => {});
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
    comment_id INTEGER,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER DEFAULT 0,
    uploaded_by INTEGER,
    uploaded_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
  )`, (err) => {
    if (err) {
      console.error('❌ Error al crear tabla attachments:', err.message);
    } else {
      console.log('✅ Tabla attachments lista');
    }
  });

  // Tabla comments
  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    contenido TEXT NOT NULL,
    autor_id INTEGER,
    fecha_creacion TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (autor_id) REFERENCES users(id)
  )`, (err) => {
    if (err) {
      console.error('❌ Error al crear tabla comments:', err.message);
    } else {
      console.log('✅ Tabla comments lista');
    }
  });

  // Tabla notifications
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    mensaje TEXT NOT NULL,
    leida INTEGER DEFAULT 0,
    tipo TEXT DEFAULT 'info',
    task_id INTEGER, -- <<< AÑADIR ESTA LÍNEA
    fecha_creacion TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (usuario_id) REFERENCES users(id)
  )`, (err) => {
    if (err) {
      console.error('❌ Error al crear tabla notifications:', err.message);
    } else {
      // Para actualizar la tabla si ya existe, sin borrar datos
      db.run("ALTER TABLE notifications ADD COLUMN task_id INTEGER", () => {});
      console.log('✅ Tabla notifications lista');
    }
  });

  // === DATOS INICIALES: SOLO ADMIN ===
  const defaultPassword = bcrypt.hashSync('1234', 10); // Contraseña: 1234

  db.run(
    `INSERT OR IGNORE INTO users (name, email, password, office, role) VALUES (?, ?, ?, ?, ?)`,
    ['Admin', 'admin@biocare.cl', defaultPassword, 'Valparaíso', 'admin'],
    function (err) {
      if (err) {
        console.error('❌ Error al insertar usuario admin:', err.message);
      } else if (this.changes > 0) {
        console.log('✅ Usuario admin creado: admin@biocare.cl / contraseña: 1234');
      } else {
        console.log('ℹ️  El usuario admin ya existe');
      }
    }
  );

  // === ÍNDICES PARA MEJORAR RENDIMIENTO ===
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_attachments_task_id ON attachments(task_id)`);
  console.log('✅ Índices creados para mejor rendimiento');
});

// === EXPORTAR LA BASE DE DATOS ===
module.exports = db;
