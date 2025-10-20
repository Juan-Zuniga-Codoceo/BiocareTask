// scripts/migrate-fichas-tecnicas.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('🚀 Iniciando migración: Creando tablas para módulo de fichas técnicas...');

const dbDir = process.env.RENDER_DISK_MOUNT_PATH || path.join(__dirname, '..', 'backend');
const dbPath = path.join(dbDir, 'database.sqlite');

if (!fs.existsSync(dbPath)) {
  console.error('❌ Error: No se encontró la base de datos en:', dbPath);
  process.exit(1);
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error al conectar con la base de datos:', err.message);
    process.exit(1);
  }
  console.log('✅ Conectado a la base de datos en:', dbPath);
  
  // Habilitar foreign keys
  db.run("PRAGMA foreign_keys = ON");
});

// Función para ejecutar SQL de forma segura
const runMigration = (sql, description) => {
  return new Promise((resolve, reject) => {
    console.log(`🔄 Ejecutando: ${description}`);
    db.run(sql, function(err) {
      if (err) {
        // Si el error es porque la tabla ya existe, lo consideramos éxito
        if (err.message.includes('already exists') || err.message.includes('duplicate')) {
          console.log(`✅ ${description} - Ya existe`);
          resolve();
        } else {
          console.error(`❌ Error en ${description}:`, err.message);
          reject(err);
        }
      } else {
        console.log(`✅ ${description} - Completado`);
        resolve();
      }
    });
  });
};

// Migración principal
const migrate = async () => {
  try {
    console.log('\n📦 Iniciando migración de fichas técnicas...\n');

    // 1. Crear tabla de categorías
    await runMigration(
      `CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_by INTEGER,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )`,
      'Crear tabla categories'
    );

    // 2. Crear tabla de fichas técnicas
    await runMigration(
      `CREATE TABLE IF NOT EXISTS technical_sheets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_name TEXT NOT NULL,
        model TEXT,
        description TEXT,
        category_id INTEGER,
        tags TEXT,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER,
        uploaded_by INTEGER,
        uploaded_at TEXT DEFAULT (datetime('now', 'localtime')),
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
        FOREIGN KEY (uploaded_by) REFERENCES users(id)
      )`,
      'Crear tabla technical_sheets'
    );

    // 3. Insertar categorías por defecto (si no existen)
    await runMigration(
      `INSERT OR IGNORE INTO categories (name) VALUES 
        ('Colchones'),
        ('Camas'),
        ('Sillones'),
        ('Comedores'),
        ('Textiles')`,
      'Insertar categorías por defecto'
    );

    console.log('\n🎉 ¡MIGRACIÓN COMPLETADA EXITOSAMENTE!');
    console.log('✅ Tablas del módulo de fichas técnicas creadas/verificadas');
    console.log('✅ Categorías por defecto insertadas');
    console.log('✅ Base de datos lista para el nuevo módulo\n');

  } catch (error) {
    console.error('\n💥 ERROR EN LA MIGRACIÓN:', error.message);
    process.exit(1);
  } finally {
    // Cerrar conexión
    db.close((err) => {
      if (err) {
        console.error('❌ Error al cerrar conexión:', err.message);
        process.exit(1);
      }
      console.log('🔌 Conexión a la base de datos cerrada.');
    });
  }
};

// Ejecutar migración
migrate();