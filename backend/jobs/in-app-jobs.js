// backend/jobs/in-app-jobs.js (nombre correcto)
const schedule = require('node-schedule');
const { sendDailySummaries } = require('./daily-summary');

const initScheduledJobs = () => {
  console.log('🕒 Programando tareas internas...');

  // Programar para las 13:00 UTC (9:00 AM Chile)
  schedule.scheduleJob('0 13 * * *', () => {
    console.log('⏰ ¡Hora de enviar los resúmenes diarios! Ejecutando la tarea...');
    sendDailySummaries().catch(error => {
      console.error('❌ Error durante la ejecución programada:', error);
    });
  });

  console.log('✅ Tarea de resúmenes diarios programada para las 13:00 UTC.');
};

module.exports = { initScheduledJobs };