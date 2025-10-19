// scripts/backup-db.js (Versión Corregida)
const fs = require('fs');
const path = require('path');

// === LÍNEAS MODIFICADAS ===
// Se usa la variable de entorno de Render si existe, si no, se usa la ruta local.
// Esto asegura que el script funcione tanto en Render como en tu computador.
const dbDir = process.env.RENDER_DISK_MOUNT_PATH || path.join(__dirname, '../backend');
const DB_PATH = path.join(dbDir, 'database.sqlite');
// === FIN DE LA MODIFICACIÓN ===

// Se recomienda guardar los respaldos en el disco persistente también
const BACKUP_DIR = path.join(dbDir, 'backups'); 
const MAX_DAYS = 7; 

// === El resto de las funciones no necesitan cambios ===
function createBackup() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ Base de datos no encontrada:', DB_PATH);
    return;
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log('✅ Carpeta de respaldos creada:', BACKUP_DIR);
  }

  const now = new Date();
  const dateStr = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const timeStr = String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0');
  const backupName = `backup_${dateStr}_${timeStr}.db`;
  const backupPath = path.join(BACKUP_DIR, backupName);
  
  fs.copyFileSync(DB_PATH, backupPath);
  console.log(`✅ Respaldo creado: ${backupPath}`);

  cleanupOldBackups();
}

function cleanupOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const cutoff = now - (MAX_DAYS * 24 * 60 * 60 * 1000);

    files.forEach(file => {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);

      if (stats.isFile() && stats.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        console.log(`🗑️  Respaldo eliminado (más de ${MAX_DAYS} días): ${file}`);
      }
    });
  } catch (err) {
    console.error('❌ Error al limpiar respaldos antiguos:', err);
  }
}

console.log('📦 Iniciando respaldo de base de datos...');
createBackup();
console.log('✅ Proceso de respaldo finalizado.\n');