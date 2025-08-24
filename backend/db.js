// backend/db.js
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const db = new sqlite3.Database('./backend/database.sqlite');

db.serialize(() => {
  // === TABLAS ===
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    office TEXT,
    role TEXT DEFAULT 'user',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`);

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
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#006837',
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS task_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    user_id INTEGER,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(task_id, user_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS task_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    label_id INTEGER,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (label_id) REFERENCES labels(id),
    UNIQUE(task_id, label_id)
  )`);

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
  )`);

  // === DATOS INICIALES ===

  // Contraseña por defecto: "1234"
  const defaultPassword = bcrypt.hashSync('1234', 10);

  // Admin
  db.run(`INSERT OR IGNORE INTO users (name, email, password, office, role) VALUES 
    ('Admin', 'admin@biocare.cl', ?, 'Valparaíso', 'admin')`, [defaultPassword]);

  // Usuarios de ejemplo
  const users = [
    ['Paulo', 'paulo@biocare.cl', 'Quilpué'],
    ['Ana', 'ana@biocare.cl', 'Viña del Mar'],
    ['Luis', 'luis@biocare.cl', 'Quilpué'],
    ['Carla', 'carla@biocare.cl', 'Valparaíso'],
    ['Marta', 'marta@biocare.cl', 'Santiago']
  ];

  const stmt = db.prepare("INSERT OR IGNORE INTO users (name, email, password, office) VALUES (?, ?, ?, ?)");
  users.forEach(([name, email, office]) => {
    stmt.run(name, email, defaultPassword, office);
  });
  stmt.finalize();

  // Etiquetas iniciales
  const labels = ['Viña del Mar', 'Valparaíso', 'Express', 'Factura', 'Entrega'];
  const labelStmt = db.prepare("INSERT OR IGNORE INTO labels (name, created_by) VALUES (?, 1)");
  labels.forEach(name => labelStmt.run(name));
  labelStmt.finalize();

  console.log('✅ Base de datos inicializada con tablas y datos de ejemplo');
});

module.exports = db;