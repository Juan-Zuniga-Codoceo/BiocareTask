// scripts/backup-db.js
const fs = require('fs');
const path = require('path');

// === CONFIGURACIÓN ===
const DB_PATH = path.join(__dirname, '../backend/database.sqlite');
const BACKUP_DIR = path.join(__dirname, '../backups');
const MAX_DAYS = 7; // Mantener solo los últimos 7 días

// === FUNCIONES ===
function createBackup() {
  // Verificar si existe la base de datos
  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ Base de datos no encontrada:', DB_PATH);
    return;
  }

  // Crear carpeta de respaldos si no existe
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log('✅ Carpeta de respaldos creada:', BACKUP_DIR);
  }

  // Generar nombre del respaldo con fecha y hora
  const now = new Date();
  const dateStr = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const timeStr = String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0');
  const backupName = `backup_${dateStr}_${timeStr}.db`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  // Crear copia de seguridad
  fs.copyFileSync(DB_PATH, backupPath);
  console.log(`✅ Respaldo creado: ${backupPath}`);

  // Limpiar respaldos antiguos
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

      // Si el archivo es más viejo que el límite, eliminarlo
      if (stats.isFile() && stats.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        console.log(`🗑️  Respaldo eliminado (más de ${MAX_DAYS} días): ${file}`);
      }
    });
  } catch (err) {
    console.error('❌ Error al limpiar respaldos antiguos:', err);
  }
}

// === EJECUCIÓN ===
console.log('📦 Iniciando respaldo de base de datos...');
createBackup();
console.log('✅ Proceso de respaldo finalizado.\n');
