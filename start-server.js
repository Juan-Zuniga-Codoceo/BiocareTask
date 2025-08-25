// start-server.js - Script de inicio optimizado para producción
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Verificar que la base de datos existe
const dbPath = path.join(__dirname, 'backend', 'database.sqlite');
if (!fs.existsSync(dbPath)) {
  console.log('⚠️  Creando base de datos inicial...');
  // Ejecutar el script de inicialización de la base de datos
  require('./backend/db.js');
}

// Configurar variables de entorno para producción
process.env.NODE_ENV = 'production';
process.env.HOST = '0.0.0.0';
process.env.PORT = process.env.PORT || 3000;

console.log('🚀 Iniciando BiocareTask en modo producción...');
console.log(`📂 Directorio: ${__dirname}`);
console.log(`🌐 Host: ${process.env.HOST}`);
console.log(`🔄 Puerto: ${process.env.PORT}`);

// Iniciar el servidor
const server = spawn('node', ['backend/server.js'], {
  stdio: 'inherit',
  cwd: __dirname
});

server.on('error', (err) => {
  console.error('❌ Error al iniciar el servidor:', err);
  process.exit(1);
});

server.on('close', (code) => {
  console.log(`🔴 Servidor cerrado con código: ${code}`);
});