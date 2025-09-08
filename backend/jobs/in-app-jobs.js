// backend/jobs/in-app-jobs.js (Hora ajustada)
const schedule = require('node-schedule');
const { sendDailySummaries } = require('./daily-summary');

const initScheduledJobs = () => {
  console.log('🕒 Programando tareas internas...');

  // Cambiamos la hora a las 10:00 UTC, que son las 7:00 AM en Chile (UTC-3)
  schedule.scheduleJob('0 10 * * *', () => { 
    console.log('⏰ ¡Hora de enviar los resúmenes diarios! (7:00 AM Chile)');
    sendDailySummaries().catch(error => {
      console.error('❌ Error durante los resúmenes diarios:', error);
    });
  });

  console.log('✅ Tarea de resúmenes diarios programada para las 10:00 UTC (7:00 AM Chile).'); 
};

module.exports = { initScheduledJobs };