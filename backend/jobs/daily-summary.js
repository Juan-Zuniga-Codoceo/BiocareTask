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
  const today = new Date().toISOString().slice(0, 10);

  try {
    // Pequeña pausa para asegurar que la conexión esté lista
    await new Promise(resolve => setTimeout(resolve, 100));

    // 1. Obtener usuarios
    const users = await dbQuery("SELECT id, name, email FROM users WHERE email_notifications = 1");

    if (users.length === 0) {
      console.log('ℹ️ No hay usuarios suscritos a las notificaciones. Trabajo finalizado.');
      return;
    }

    console.log(`📧 Enviando resúmenes a ${users.length} usuario(s)...`);

    // 2. Para cada usuario, buscar sus tareas de hoy
    for (const user of users) {
      try {
        const tasks = await dbQuery(`
          SELECT t.title, t.priority FROM tasks t
          LEFT JOIN task_assignments ta ON t.id = ta.task_id
          WHERE (t.created_by = ? OR ta.user_id = ?)
            AND date(t.due_date) = date(?)
            AND t.status != 'completada'
          ORDER BY CASE t.priority 
            WHEN 'alta' THEN 1 
            WHEN 'media' THEN 2 
            WHEN 'baja' THEN 3 
            ELSE 4 
          END ASC, t.title ASC
        `, [user.id, user.id, today]);

        if (tasks.length > 0) {
          console.log(`📋 ${user.name} tiene ${tasks.length} tarea(s) para hoy`);
          
          // 3. Construir y enviar el correo
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
            <a href="${process.env.APP_URL || 'http://localhost:3000'}/tablero" style="color: #049DD9; font-weight: bold;">Ir a mi tablero</a>
          `;
          
          await sendEmail(user.email, `📋 Tu resumen de BiocareTask para hoy`, emailHtml);
          console.log(`✅ Correo enviado a: ${user.email}`);
        } else {
          console.log(`ℹ️ ${user.name} no tiene tareas para hoy`);
        }
      } catch (userError) {
        console.error(`❌ Error procesando usuario ${user.email}:`, userError.message);
        // Continuamos con el siguiente usuario
      }
    }

    console.log('✅ Proceso de resúmenes diarios finalizado.');

  } catch (error) {
    console.error('❌ Error fatal en el trabajo de resúmenes diarios:', error.message);
    process.exit(1);
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