// backend/jobs/daily-summary.js (Versión Final Corregida)
require('dotenv').config();
const db = require('../db');
const { sendEmail } = require('../services/email.service');
const { createEmailTemplate } = require('../services/email-template.service');

// Función helper para usar promesas con la base de datos
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

  try {
    const users = await dbQuery("SELECT id, name, email FROM users WHERE email_notifications = 1");

    if (users.length === 0) {
      console.log('ℹ️ No hay usuarios suscritos a las notificaciones. Trabajo finalizado.');
      return;
    }

    for (const user of users) {
      // 1. Tareas COMPLETADAS AYER (usando la fecha local de la BD)
      const tareasCompletadasAyer = await dbQuery(`
        SELECT title, priority 
        FROM tasks 
        WHERE (created_by = ? OR id IN (SELECT task_id FROM task_assignments WHERE user_id = ?))
          AND date(completed_at) = date('now', '-1 day', 'localtime')
          AND status = 'completada'
      `, [user.id, user.id]);

      // 2. Tareas PENDIENTES HOY (usando la fecha local de la BD)
      const tareasPendientesHoy = await dbQuery(`
        SELECT title, priority 
        FROM tasks 
        LEFT JOIN task_assignments ta ON tasks.id = ta.task_id
        WHERE (tasks.created_by = ? OR ta.user_id = ?)
          AND date(due_date) = date('now', 'localtime')
          AND status != 'completada'
      `, [user.id, user.id]);

      if (tareasCompletadasAyer.length > 0 || tareasPendientesHoy.length > 0) {
        
        // --- CONSTRUCCIÓN DEL CONTENIDO DEL CORREO ---
        let completedYesterdayHtml = '';
        if (tareasCompletadasAyer.length > 0) {
          const taskList = tareasCompletadasAyer.map(task => 
            `<li style="margin-bottom: 8px; color: #34495E;">✅ ${task.title}</li>`
          ).join('');
          completedYesterdayHtml = `
            <h3 style="color: #2ECC71; border-bottom: 1px solid #EAECEE; padding-bottom: 5px; margin-top: 20px;">Tareas completadas ayer</h3>
            <ul style="padding-left: 20px; list-style: none;">${taskList}</ul>
          `;
        }
        
        let dueTodayHtml = '';
        if (tareasPendientesHoy.length > 0) {
          const taskList = tareasPendientesHoy.map(task => 
            `<li style="margin-bottom: 8px; color: #34495E;">
               <strong style="color: ${task.priority === 'alta' ? '#E74C3C' : '#34495E'};">[${task.priority.toUpperCase()}]</strong> ${task.title}
             </li>`
          ).join('');
          dueTodayHtml = `
            <h3 style="color: #049DD9; border-bottom: 1px solid #EAECEE; padding-bottom: 5px; margin-top: 20px;">Tareas que vencen hoy</h3>
            <ul style="padding-left: 20px; list-style: none;">${taskList}</ul>
          `;
        }

        const mainContentHtml = `
          <p style="color: #34495E; font-size: 16px;">Aquí está tu actividad reciente en la plataforma:</p>
          ${completedYesterdayHtml}
          ${dueTodayHtml}
        `;
        
        // Usamos la plantilla centralizada para generar el correo final
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