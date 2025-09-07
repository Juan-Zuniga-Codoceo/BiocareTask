// backend/jobs/daily-summary.js (Versión Mejorada)
require('dotenv').config();
const db = require('../db');
const { sendEmail } = require('../services/email.service');

// Función helper para usar promesas con la base de datos
const dbQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('❌ Error en consulta SQL:', err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

const sendDailySummaries = async () => {
  console.log('📦 Iniciando trabajo: Envío de resúmenes diarios...');
  const hoy = new Date().toISOString().slice(0, 10);
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const ayerFormateado = ayer.toISOString().slice(0, 10);

  try {
    const users = await dbQuery("SELECT id, name, email FROM users WHERE email_notifications = 1");

    for (const user of users) {
      // 1. Tareas COMPLETADAS AYER
      const tareasCompletadasAyer = await dbQuery(`
        SELECT title, priority 
        FROM tasks 
        WHERE (created_by = ? OR id IN (SELECT task_id FROM task_assignments WHERE user_id = ?))
          AND date(completed_at) = date(?)
          AND status = 'completada'
      `, [user.id, user.id, ayerFormateado]);

      // 2. Tareas PENDIENTES HOY
      const tareasPendientesHoy = await dbQuery(`
        SELECT title, priority 
        FROM tasks 
        LEFT JOIN task_assignments ta ON tasks.id = ta.task_id
        WHERE (tasks.created_by = ? OR ta.user_id = ?)
          AND date(due_date) = date(?)
          AND status != 'completada'
      `, [user.id, user.id, hoy]);

      if (tareasCompletadasAyer.length > 0 || tareasPendientesHoy.length > 0) {
        let emailHtml = `<h2>📊 Resumen Diario de BiocareTask</h2>`;
        
        // Tareas completadas ayer
        if (tareasCompletadasAyer.length > 0) {
          emailHtml += `<h3>✅ Completadas Ayer:</h3><ul>`;
          tareasCompletadasAyer.forEach(task => {
            emailHtml += `<li><strong>[${task.priority.toUpperCase()}]</strong> ${task.title}</li>`;
          });
          emailHtml += `</ul>`;
        }

        // Tareas pendientes hoy
        if (tareasPendientesHoy.length > 0) {
          emailHtml += `<h3>📅 Pendientes para Hoy:</h3><ul>`;
          tareasPendientesHoy.forEach(task => {
            emailHtml += `<li><strong style="color: ${task.priority === 'alta' ? '#E74C3C' : '#34495E'};">[${task.priority.toUpperCase()}]</strong> ${task.title}</li>`;
          });
          emailHtml += `</ul>`;
        }

        emailHtml += `<p><a href="${process.env.APP_URL}/tablero" style="color: #049DD9; font-weight: bold;">➡️ Ir a mi tablero</a></p>`;
        
        await sendEmail(user.email, `📋 Tu resumen diario de BiocareTask`, emailHtml);
      }
    }

    console.log('✅ Resúmenes diarios enviados correctamente');
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

// Ejecutar solo si es el script principal
if (require.main === module) {
  sendDailySummaries().catch(error => {
    console.error('❌ Error no controlado:', error.message);
    process.exit(1);
  });
}

module.exports = { sendDailySummaries };