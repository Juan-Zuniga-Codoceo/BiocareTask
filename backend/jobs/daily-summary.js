// backend/jobs/daily-summary.js (Versión Final)
require('dotenv').config();
const db = require('../db');
const { sendEmail } = require('../services/email.service');
const { createEmailTemplate } = require('../services/email-template.service'); // Importamos la plantilla centralizada

const dbQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const sendDailySummaries = async () => {
  console.log('📦 Iniciando trabajo: Envío de resúmenes diarios...');
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayFormatted = yesterday.toISOString().slice(0, 10);

  try {
    // Quitamos el filtro "WHERE email_notifications = 1" para incluir a todos los usuarios
    const users = await dbQuery("SELECT id, name, email FROM users");

    if (users.length === 0) {
      console.log('ℹ️ No hay usuarios registrados. Trabajo finalizado.');
      return;
    }

    for (const user of users) {
      const tasksDueToday = await dbQuery(`
        SELECT t.title, t.priority FROM tasks t
        LEFT JOIN task_assignments ta ON t.id = ta.task_id
        WHERE (t.created_by = ? OR ta.user_id = ?) AND date(t.due_date) = date(?) AND t.status != 'completada'
      `, [user.id, user.id, today]);

      const tasksCompletedYesterday = await dbQuery(`
        SELECT title FROM tasks 
        LEFT JOIN task_assignments ta ON tasks.id = ta.task_id
        WHERE (tasks.created_by = ? OR ta.user_id = ?) AND date(completed_at) = date(?)
      `, [user.id, user.id, yesterdayFormatted]);

      if (tasksDueToday.length > 0 || tasksCompletedYesterday.length > 0) {
        let dueTodayHtml = '';
        if (tasksDueToday.length > 0) {
          const taskList = tasksDueToday.map(task => 
            `<li style="margin-bottom: 8px; color: #34495E;">
               <strong style="color: ${task.priority === 'alta' ? '#E74C3C' : '#34495E'};">[${task.priority.toUpperCase()}]</strong> ${task.title}
             </li>`
          ).join('');
          dueTodayHtml = `
            <h3 style="color: #049DD9; border-bottom: 1px solid #EAECEE; padding-bottom: 5px; margin-top: 20px;">📅 Tareas que vencen hoy</h3>
            <ul style="padding-left: 20px; list-style-type: '→ ';">${taskList}</ul>
          `;
        }

        let completedYesterdayHtml = '';
        if (tasksCompletedYesterday.length > 0) {
          const taskList = tasksCompletedYesterday.map(task => `<li style="margin-bottom: 8px; color: #34495E;">${task.title}</li>`).join('');
          completedYesterdayHtml = `
            <h3 style="color: #2ECC71; border-bottom: 1px solid #EAECEE; padding-bottom: 5px; margin-top: 20px;">✅ Tareas completadas ayer</h3>
            <ul style="padding-left: 20px; list-style-type: '✓ ';">${taskList}</ul>
          `;
        }

        // Usamos la nueva plantilla para generar el HTML
        const mainContentHtml = `
          <p style="color: #34495E; font-size: 16px;">Aquí está tu actividad reciente en la plataforma:</p>
          ${completedYesterdayHtml}
          ${dueTodayHtml}
        `;
        
        const emailHtml = createEmailTemplate({
            title: '📊 Resumen Diario de Actividad',
            recipientName: user.name,
            mainContentHtml: mainContentHtml,
            buttonUrl: `${process.env.APP_URL || 'http://localhost:3000'}/tablero`,
            buttonText: 'Ir a mi Tablero'
        });
        
        await sendEmail(user.email, `📋 Tu resumen diario de BiocareTask`, emailHtml);
        console.log(`✅ Correo enviado a: ${user.email}`);
      }
    }

    console.log('✅ Proceso de resúmenes diarios finalizado.');

  } catch (error) {
    console.error('❌ Error fatal en el trabajo de resúmenes diarios:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  sendDailySummaries();
}

module.exports = { sendDailySummaries };