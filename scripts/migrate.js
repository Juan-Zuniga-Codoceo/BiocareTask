// scripts/migrate.js (Versión Corregida)

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('🚀 Iniciando migración: Añadiendo columna attachment_type...');

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
});

const migrationSql = `ALTER TABLE attachments ADD COLUMN attachment_type TEXT DEFAULT 'general'`;

db.run(migrationSql, function(err) {
  if (err) {
    if (err.message.includes('duplicate column name') || err.message.includes('column attachment_type already exists')) {
      console.log('🟡 La columna "attachment_type" ya existe en la tabla attachments.');
    } else {
      console.error('❌ Error en la migración:', err.message);
      db.close();
      process.exit(1);
    }
  } else {
    console.log('✅ ¡Migración exitosa! Columna "attachment_type" añadida a la tabla attachments.');
  }

  // 👇 LA CORRECCIÓN ESTÁ AQUÍ: Usamos db.all() para obtener un array de filas
  db.all("PRAGMA table_info(attachments)", (err, rows) => {
    if (err) {
      console.error('❌ Error al verificar la tabla:', err.message);
    } else if (rows) { // Nos aseguramos de que rows no sea undefined
      const hasAttachmentType = rows.some(col => col.name === 'attachment_type');
      if (hasAttachmentType) {
        console.log('✅ Verificación: La columna attachment_type está presente en la tabla.');
      } else {
        console.log('❌ Verificación: La columna attachment_type NO se encontró en la tabla.');
      }
    }
    
    // Cerrar conexión
    db.close((err) => {
      if (err) {
        console.error('❌ Error al cerrar la conexión:', err.message);
        process.exit(1);
      }
      console.log('🔌 Conexión a la base de datos cerrada.');
      console.log('🎉 ¡Migración completada y verificada! Puedes continuar.');
      process.exit(0);
    });
  });
});