require('dotenv').config();
const db = require('../db');
const { broadcast } = require('../services/websocket.service');

const autoArchiveTasks = async () => {
  console.log('📦 Iniciando trabajo: Archivando tareas completadas antiguas...');

  // Tareas completadas hace más de 2 días
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
      // Avisamos a todos los clientes para que sus tableros se actualicen
      broadcast({ type: 'TASKS_UPDATED' });
    } else {
      console.log('ℹ️ No hay tareas nuevas para archivar.');
    }
    db.close();
  });
};

autoArchiveTasks();