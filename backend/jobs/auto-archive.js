// backend/jobs/auto-archive.js (Versión Corregida)
require('dotenv').config();
const db = require('../db');
const { broadcast } = require('../services/websocket.service');

const autoArchiveTasks = () => {
  console.log('📦 Ejecutando trabajo de auto-archivado...');

  const sql = `
    UPDATE tasks 
    SET is_archived = 1 
    WHERE 
      status = 'completada'        -- Solo archiva tareas completadas
      AND is_archived = 0          -- Solo si no están ya archivadas
      AND completed_at IS NOT NULL -- Se asegura de que haya una fecha de completado
      AND completed_at < date('now', '-2 days') -- Condición clave: completada hace más de 2 días
  `;
  
  db.run(sql, function(err) {
    if (err) {
      console.error('❌ Error durante el archivado automático:', err.message);
    } else if (this.changes > 0) {
      console.log(`✅ ${this.changes} tarea(s) han sido archivadas automáticamente.`);
      // Notifica a todos los clientes para que sus tableros se actualicen
      broadcast({ type: 'TASKS_UPDATED' });
    }
    // No se muestra nada si no hay tareas para archivar, para mantener la consola limpia.
  });
};

// Exportamos la función para que pueda ser llamada desde otros archivos
module.exports = { autoArchiveTasks };