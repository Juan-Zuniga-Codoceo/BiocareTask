// backend/jobs/scheduler.js
const cron = require('node-cron');
const db = require('../db');
const { broadcast } = require('../services/websocket.service');

// Tarea para archivar tareas viejas. Se ejecuta todos los días a las 9:00 AM de Chile.
const startAutoArchive = () => {
  // Usamos el formato cron. El '0 13 * * *' se traduce a las 13:00 UTC, que son las 9:00 AM en Chile (UTC-4)
  cron.schedule('0 13 * * *', () => {
    console.log('📦 Ejecutando tarea programada: Archivando tareas completadas antiguas...');

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
    });
  }, {
    scheduled: true,
    timezone: "UTC"
  });

  console.log('✅ Tarea de archivado automático programada para ejecutarse todos los días a las 13:00 UTC.');
};

// Exportamos la función para que pueda ser llamada desde server.js
module.exports = { startScheduledJobs: startAutoArchive };