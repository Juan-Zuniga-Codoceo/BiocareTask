// backend/jobs/daily-summary.js
require('dotenv').config();
const db = require('../db');
const { sendEmail } = require('../services/email.service');

const sendDailySummaries = async () => {
  console.log('📦 Iniciando trabajo: Envío de resúmenes diarios...');
  const today = new Date().toISOString().slice(0, 10); // Formato YYYY-MM-DD

  try {
    // 1. Obtener todos los usuarios que SÍ quieren recibir correos
    const users = await new Promise((resolve, reject) => {
      db.all("SELECT id, name, email FROM users WHERE email_notifications = 1", (err, rows) => {
        if (err) reject(err);
        resolve(rows);
      });
    });

    if (users.length === 0) {
      console.log('ℹ️ No hay usuarios suscritos a las notificaciones. Trabajo finalizado.');
      return;
    }

    // 2. Para cada usuario, buscar sus tareas de hoy
    for (const user of users) {
      const tasks = await new Promise((resolve, reject) => {
        const sql = `
          SELECT t.title, t.priority FROM tasks t
          LEFT JOIN task_assignments ta ON t.id = ta.task_id
          WHERE (t.created_by = ? OR ta.user_id = ?)
            AND date(t.due_date) = date(?)
            AND t.status != 'completada'
          ORDER BY CASE t.priority WHEN 'alta' THEN 1 WHEN 'media' THEN 2 WHEN 'baja' THEN 3 ELSE 4 END ASC, t.title ASC
        `;
        db.all(sql, [user.id, user.id, today], (err, rows) => {
          if (err) reject(err);
          resolve(rows);
        });
      });

      if (tasks.length > 0) {
        // 3. Si tiene tareas, construir y enviar el correo
        let taskListHtml = tasks.map(task => 
          `<li style="margin-bottom: 10px;">
             <strong style="color: ${task.priority === 'alta' ? '#E74C3C' : '#34495E'};">[${task.priority.toUpperCase()}]</strong> ${task.title}
           </li>`
        ).join('');

        const emailHtml = `
          <h2>Resumen de Tareas para Hoy</h2>
          <p>Hola ${user.name}, aquí tienes tus tareas que vencen hoy en BiocareTask:</p>
          <ul style="padding-left: 20px;">${taskListHtml}</ul>
          <p>¡Que tengas un día productivo!</p>
          <a href="${process.env.APP_URL || 'http://localhost:3000'}/tablero.html" style="color: #049DD9; font-weight: bold;">Ir a mi tablero</a>
        `;
        
        await sendEmail(user.email, `📋 Tu resumen de BiocareTask para hoy`, emailHtml);
      }
    }
    console.log('✅ Proceso de resúmenes diarios finalizado.');
  } catch (error) {
    console.error('❌ Error fatal en el trabajo de resúmenes diarios:', error);
  } finally {
    
  }
};

sendDailySummaries();