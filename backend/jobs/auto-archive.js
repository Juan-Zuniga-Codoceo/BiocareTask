// backend/jobs/auto-archive.js (Modificado)
require('dotenv').config();
const db = require('../db');
const { broadcast } = require('../services/websocket.service');

const autoArchiveTasks = async () => {
  console.log('📦 Verificando tareas para archivar...');
  
  const query = `
    UPDATE tasks 
    SET is_archived = 1 
    WHERE status = 'completada' 
      AND is_archived = 0
      AND completed_at IS NOT NULL 
      AND completed_at < date('now', '-2 days')
  `;
  
  db.run(query, function(err) {
    if (err) {
      console.error('❌ Error durante el archivado automático:', err.message);
    } else if (this.changes > 0) {
      console.log(`✅ ${this.changes} tarea(s) han sido archivadas automáticamente.`);
      broadcast({ type: 'TASKS_UPDATED' });
    } else {
      // No mostramos nada si no hay tareas para archivar, para no llenar la consola.
    }
  });
};

// Exportamos la función para que pueda ser llamada desde otros archivos
module.exports = { autoArchiveTasks };