// scripts/backup-db.js (VERSIÓN SEGURA - NO BORRA NADA)
const fs = require('fs');
const path = require('path');

// === CONFIGURACIÓN SEGURA ===
const dbDir = process.env.RENDER_DISK_MOUNT_PATH || path.join(__dirname, '../backend');
const DB_PATH = path.join(dbDir, 'database.sqlite');
const BACKUP_DIR = path.join(dbDir, 'backups');

// === VERIFICACIÓN EXTRA DE SEGURIDAD ===
console.log('🔍 Verificando base de datos...');

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ ERROR CRÍTICO: Base de datos no encontrada en:', DB_PATH);
  console.log('📁 Contenido del directorio:');
  try {
    const files = fs.readdirSync(dbDir);
    files.forEach(file => console.log('   -', file));
  } catch (err) {
    console.error('   No se pudo leer el directorio');
  }
  process.exit(1);
}

// Verificar tamaño de la BD
const stats = fs.statSync(DB_PATH);
const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
console.log(`📊 Tamaño de la BD: ${fileSizeMB} MB`);

if (stats.size === 0) {
  console.error('❌ ALERTA: La base de datos está vacía (0 bytes)');
  process.exit(1);
}

// === CREAR BACKUP ===
function createSafeBackup() {
  try {
    // Crear directorio de backups si no existe
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      console.log('✅ Carpeta de respaldos creada:', BACKUP_DIR);
    }

    // Timestamp para el nombre del backup
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const backupName = `backup_${dateStr}_${timeStr}.sqlite`;
    const backupPath = path.join(BACKUP_DIR, backupName);
    
    console.log(`📦 Creando respaldo: ${backupName}`);
    
    // Crear backup (copia segura)
    fs.copyFileSync(DB_PATH, backupPath);
    
    // Verificar que el backup se creó correctamente
    const backupStats = fs.statSync(backupPath);
    if (backupStats.size === stats.size) {
      console.log(`✅ Respaldo creado exitosamente: ${backupPath}`);
      console.log(`📊 Tamaño del respaldo: ${(backupStats.size / (1024 * 1024)).toFixed(2)} MB`);
    } else {
      console.error('❌ ALERTA: El respaldo tiene tamaño diferente al original');
    }
    
    return backupPath;
    
  } catch (error) {
    console.error('❌ Error creando respaldo:', error.message);
    process.exit(1);
  }
}

// === LISTAR BACKUPS EXISTENTES ===
function listExistingBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      console.log('📁 No hay backups anteriores');
      return;
    }
    
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.startsWith('backup_') && file.endsWith('.sqlite'))
      .sort()
      .reverse();
    
    console.log(`📁 Backups existentes (${files.length}):`);
    files.slice(0, 5).forEach(file => {
      const filePath = path.join(BACKUP_DIR, file);
      const fileStats = fs.statSync(filePath);
      const sizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
      console.log(`   📄 ${file} (${sizeMB} MB)`);
    });
    
    if (files.length > 5) {
      console.log(`   ... y ${files.length - 5} más`);
    }
    
  } catch (error) {
    console.log('ℹ️ No se pudieron listar backups anteriores');
  }
}

// === EJECUCIÓN PRINCIPAL ===
console.log('\n🚀 INICIANDO RESPALDO DE EMERGENCIA');
console.log('====================================');
console.log(`📍 Ruta BD original: ${DB_PATH}`);
console.log(`📍 Directorio backups: ${BACKUP_DIR}`);

// Listar backups existentes
listExistingBackups();

// Crear nuevo backup
console.log('\n🔄 Creando nuevo respaldo...');
const newBackupPath = createSafeBackup();

console.log('\n✅ RESPALDO COMPLETADO EXITOSAMENTE');
console.log('====================================');
console.log(`💾 Nuevo backup: ${path.basename(newBackupPath)}`);
console.log('🔒 La base de datos original NO fue modificada');
console.log('📋 Backups disponibles para recuperación si es necesario');
console.log('\n⚠️  IMPORTANTE: Este backup NO repara problemas de tablas.');
console.log('   Si hay errores, necesitamos diagnosticar el problema específico.');