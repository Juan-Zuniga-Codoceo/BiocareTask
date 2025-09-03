// backend/routes/tasks.routes.js
const express = require('express'); 
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { body, validationResult } = require('express-validator');

// Importamos la conexión a la base de datos y el middleware de autenticación
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
// <-- CAMBIO: Importamos nuestro nuevo servicio de correo electrónico
const { sendEmail } = require('../services/email.service');

// --- Middlewares específicos para este router ---

// Middleware para parsear JSON
const jsonParser = express.json({ limit: '10mb' });

// --- Configuración de Multer para la subida de archivos ---
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const originalName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, uniqueSuffix + '-' + originalName);
  }
});

const fileFilter = (req, file, cb) => {
  if (req.originalUrl.endsWith('/user/avatar')) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes para el avatar'), false);
    }
  } else {
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/gif',
      'application/pdf', 'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'), false);
    }
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter
});

// ======================================================
// ===          DEFINICIÓN DE RUTAS DE TAREAS         ===
// ======================================================

// 📋 LISTAR TAREAS
router.get('/tasks', authenticateToken, (req, res) => {
  const { assigned_to, created_by, status, due_date, search } = req.query;
  let sql = `
    SELECT t.*, u.name as created_by_name,
           GROUP_CONCAT(DISTINCT ua.name) as assigned_names,
           GROUP_CONCAT(DISTINCT ta.user_id) as assigned_ids,
           GROUP_CONCAT(DISTINCT l.name) as label_names
    FROM tasks t
    LEFT JOIN users u ON t.created_by = u.id
    LEFT JOIN task_assignments ta ON t.id = ta.task_id
    LEFT JOIN users ua ON ta.user_id = ua.id
    LEFT JOIN task_labels tl ON t.id = tl.task_id
    LEFT JOIN labels l ON tl.label_id = l.id
    WHERE 1=1
  `;
  const params = [];

  if (assigned_to) { sql += " AND ta.user_id = ?"; params.push(assigned_to); }
  if (created_by) { sql += " AND t.created_by = ?"; params.push(created_by); }
  if (status) { sql += " AND t.status = ?"; params.push(status); }
  if (due_date) { sql += " AND DATE(t.due_date) = DATE(?)"; params.push(due_date); }
  if (search) { sql += " AND (t.title LIKE ? OR t.description LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }

  // <-- CAMBIO: Actualizamos el orden para priorizar por urgencia y luego por fecha
  sql += `
    GROUP BY t.id 
    ORDER BY 
      CASE t.priority 
        WHEN 'alta' THEN 1 
        WHEN 'media' THEN 2 
        WHEN 'baja' THEN 3 
        ELSE 4 
      END ASC, 
      t.due_date ASC
  `;
  
  db.all(sql, params, (err, tasks) => {
    if (err) return res.status(500).json({ error: 'Error al obtener tareas' });
    res.json(tasks || []);
  });
});

// 💡 VERIFICAR Y CREAR NOTIFICACIONES DE VENCIMIENTO
router.post('/tasks/check-due-today', authenticateToken, async (req, res) => {
    // ... (código sin cambios)
});

// 🆕 CREAR TAREA
router.post('/tasks', jsonParser, authenticateToken, [body('title').notEmpty().trim().escape()], async (req, res) => {
  // <-- CAMBIO: Lógica de correos añadida aquí
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
  }
    
  const { title, description, due_date, priority, assigned_to, label_ids } = req.body;
  const creator = req.user; // Obtenemos el objeto completo del usuario creador

  db.run(`INSERT INTO tasks (title, description, due_date, priority, created_by) VALUES (?, ?, ?, ?, ?)`,
    [title, description || '', due_date, priority || 'media', creator.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'No se pudo crear la tarea' });

      const taskId = this.lastID;
      const taskTitle = title.substring(0, 30);
      const taskUrl = `${process.env.APP_URL || 'http://localhost:3000'}/tablero.html`;
      const formattedDueDate = new Date(due_date).toLocaleDateString('es-CL', {day: '2-digit', month: 'long', year: 'numeric'});

      // Notificación por correo para el creador
      const creatorHtml = `
        <h2>¡Tarea Creada Exitosamente!</h2>
        <p>Hola ${creator.name},</p>
        <p>Tu tarea "<strong>${title}</strong>" ha sido creada en BiocareTask.</p>
        <p><strong>Vencimiento:</strong> ${formattedDueDate}</p>
        <a href="${taskUrl}" style="color: #049DD9; font-weight: bold;">Ver en el tablero</a>
      `;
      sendEmail(creator.email, `✅ Tarea Creada: ${taskTitle}`, creatorHtml);

      // Notificaciones para los usuarios asignados
      if (assigned_to && Array.isArray(assigned_to)) {
        const stmt = db.prepare("INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)");
        assigned_to.forEach(userId => {
          stmt.run(taskId, userId);
          if (userId !== creator.id) {
            // 1. Notificación interna (como ya estaba)
            const mensaje = `${creator.name} te ha asignado una nueva tarea: "${taskTitle}..."`;
            db.run(`INSERT INTO notifications (usuario_id, mensaje, tipo) VALUES (?, ?, ?)`, [userId, mensaje, 'assignment']);
            
            // 2. Notificación por correo
            db.get("SELECT name, email FROM users WHERE id = ?", [userId], (err, assignedUser) => {
              if (assignedUser) {
                const assigneeHtml = `
                  <h2>¡Nueva Tarea Asignada!</h2>
                  <p>Hola ${assignedUser.name},</p>
                  <p>${creator.name} te ha asignado una nueva tarea: "<strong>${title}</strong>".</p>
                  <p><strong>Vencimiento:</strong> ${formattedDueDate}</p>
                  <p>Por favor, revísala en el tablero de BiocareTask.</p>
                  <a href="${taskUrl}" style="color: #049DD9; font-weight: bold;">Ir al tablero</a>
                `;
                sendEmail(assignedUser.email, `🔔 Nueva Tarea Asignada: ${taskTitle}`, assigneeHtml);
              }
            });
          }
        });
        stmt.finalize();
      }

      if (label_ids && Array.isArray(label_ids)) {
        const stmt = db.prepare("INSERT INTO task_labels (task_id, label_id) VALUES (?, ?)");
        label_ids.forEach(id => stmt.run(taskId, id));
        stmt.finalize();
      }

      res.status(201).json({ id: taskId, success: true });
    }
  );
});

// ✏️ EDITAR TAREA
router.put('/tasks/:id', jsonParser, authenticateToken, (req, res) => {
  const taskId = req.params.id;
  const { title, description, due_date, priority, assigned_to, label_ids } = req.body;

  // Consulta que busca una tarea si el usuario es el creador O está asignado a ella.
  const permissionSql = `
    SELECT t.id
    FROM tasks t
    LEFT JOIN task_assignments ta ON t.id = ta.task_id
    WHERE t.id = ? AND (t.created_by = ? OR ta.user_id = ?)
    GROUP BY t.id
  `;

  db.get(permissionSql, [taskId, req.userId, req.userId], (err, task) => {
    if (err) return res.status(500).json({ error: 'Error al verificar permisos de la tarea' });
    
    // Si la consulta no devuelve nada, es porque la tarea no existe o el usuario no tiene permisos.
    if (!task) {
      return res.status(403).json({ error: 'No tienes permiso para editar esta tarea o la tarea no existe' });
    }

    // Si se encontró la tarea y el usuario tiene permiso, procedemos con la actualización.
    // Usamos una transacción para asegurar que todas las operaciones se completen.
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      // 1. Actualizar la tarea principal
      const taskSql = `UPDATE tasks SET title = ?, description = ?, due_date = ?, priority = ? WHERE id = ?`;
      db.run(taskSql, [title, description, due_date, priority, taskId]);

      // 2. Actualizar asignaciones
      db.run("DELETE FROM task_assignments WHERE task_id = ?", [taskId]);
      if (assigned_to && Array.isArray(assigned_to) && assigned_to.length > 0) {
        const assignStmt = db.prepare("INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)");
        assigned_to.forEach(userId => assignStmt.run(taskId, userId));
        assignStmt.finalize();
      }

      // 3. Actualizar etiquetas
      db.run("DELETE FROM task_labels WHERE task_id = ?", [taskId]);
      if (label_ids && Array.isArray(label_ids) && label_ids.length > 0) {
        const labelStmt = db.prepare("INSERT INTO task_labels (task_id, label_id) VALUES (?, ?)");
        label_ids.forEach(labelId => labelStmt.run(taskId, labelId));
        labelStmt.finalize();
      }

      // 4. Confirmar la transacción y solo entonces enviar la respuesta
      db.run("COMMIT", (commitErr) => {
        if (commitErr) {
          console.error("Error al hacer COMMIT:", commitErr);
          // Si algo falla, revertimos los cambios
          db.run("ROLLBACK");
          return res.status(500).json({ error: 'Error al guardar los cambios en la base de datos' });
        }
        res.status(200).json({ success: true, message: 'Tarea actualizada' });
      });
    });
  });
});

// 🗑️ ELIMINAR TAREA
router.delete('/tasks/:id', authenticateToken, (req, res) => {
  const taskId = req.params.id;

  db.get("SELECT created_by FROM tasks WHERE id = ?", [taskId], (err, task) => {
    if (err) return res.status(500).json({ error: 'Error al verificar la tarea' });
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
    if (task.created_by !== req.userId) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar esta tarea' });
    }

    db.run("DELETE FROM tasks WHERE id = ?", [taskId], function(err) {
      if (err) return res.status(500).json({ error: 'Error al eliminar la tarea' });
      res.status(200).json({ success: true, message: 'Tarea eliminada' });
    });
  });
});

// ✅ CAMBIAR ESTADO DE TAREA
router.put('/tasks/:id/status', jsonParser, authenticateToken, [body('status').isIn(['pendiente', 'en_camino', 'completada'])], async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const completed_at = status === 'completada' ? new Date().toISOString() : null;

  db.get("SELECT id FROM tasks WHERE id = ? AND (created_by = ? OR id IN (SELECT task_id FROM task_assignments WHERE user_id = ?))",
    [id, req.userId, req.userId], (err, task) => {
      
      if (err) return res.status(500).json({ error: 'Error interno' });
      if (!task) return res.status(404).json({ error: 'Tarea no encontrada o sin permisos' });

      db.run("UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?", [status, completed_at, id], function (err) {
        if (err) return res.status(500).json({ error: 'Error al actualizar' });
        res.json({ success: true, changed: this.changes });
      });
    });
});

// 📝 OBTENER COMENTARIOS DE UNA TAREA
router.get('/tasks/:id/comments', authenticateToken, (req, res) => {
  const taskId = req.params.id;
  const sql = `
    SELECT 
      c.id, c.contenido, c.autor_id, c.fecha_creacion,
      u.name as autor_nombre, 
      u.avatar_url as autor_avatar_url,
      a.id as attachment_id,
      a.file_path as attachment_path,
      a.file_name as attachment_name
    FROM comments c 
    JOIN users u ON c.autor_id = u.id 
    LEFT JOIN attachments a ON a.comment_id = c.id
    WHERE c.task_id = ? 
    ORDER BY c.fecha_creacion ASC
  `;

  db.all(sql, [taskId], (err, rows) => {
    if (err) {
      console.error("Error fetching comments:", err);
      return res.status(500).json({ error: "Error al obtener comentarios" });
    }
    const commentsMap = {};
    rows.forEach(row => {
      if (!commentsMap[row.id]) {
        commentsMap[row.id] = {
          id: row.id,
          contenido: row.contenido,
          autor_id: row.autor_id,
          fecha_creacion: row.fecha_creacion,
          autor_nombre: row.autor_nombre,
          autor_avatar_url: row.autor_avatar_url,
          attachments: []
        };
      }
      if (row.attachment_id) {
        commentsMap[row.id].attachments.push({
          id: row.attachment_id,
          file_path: row.attachment_path,
          file_name: row.attachment_name
        });
      }
    });
    const structuredComments = Object.values(commentsMap);
    res.json(structuredComments);
  });
});

// 📝 AGREGAR COMENTARIO A TAREA (CON ADJUNTO)
router.post('/tasks/comments', authenticateToken, upload.single('attachment'), async (req, res) => {
  const { task_id, contenido } = req.body;
  const autor_id = req.userId;

  if ((!contenido || !contenido.trim()) && !req.file) {
    return res.status(400).json({ error: 'El comentario no puede estar vacío si no se adjunta un archivo.' });
  }

  db.run(`INSERT INTO comments (task_id, contenido, autor_id) VALUES (?, ?, ?)`,
    [task_id, contenido || '', autor_id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Error al crear comentario' });
      
      const commentId = this.lastID;
      
      if (req.file) {
        db.run(
          `INSERT INTO attachments (task_id, comment_id, file_path, file_name, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [task_id, commentId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, autor_id]
        );
      }
      
      db.get("SELECT title, created_by FROM tasks WHERE id = ?", [task_id], (err, taskInfo) => {
        if (taskInfo) {
          db.all("SELECT user_id FROM task_assignments WHERE task_id = ?", [task_id], (err, assignments) => {
            const assignedUserIds = assignments.map(a => a.user_id);
            const allInvolvedIds = [...new Set([taskInfo.created_by, ...assignedUserIds])];
            const usersToNotify = allInvolvedIds.filter(id => id !== autor_id);

            if (usersToNotify.length > 0) {
              const taskTitle = taskInfo.title.substring(0, 30);
              const mensaje = `${req.user.name} comentó en la tarea: "${taskTitle}..."`;
              const stmt = db.prepare(`INSERT INTO notifications (usuario_id, mensaje, tipo) VALUES (?, ?, ?)`);
              usersToNotify.forEach(userId => stmt.run(userId, mensaje, 'comment'));
              stmt.finalize();
            }
          });
        }
      });
      
      res.status(201).json({ id: commentId, success: true });
    }
  );
});


// 📎 OBTENER ADJUNTOS DE UNA TAREA
router.get('/attachments/task/:taskId', authenticateToken, (req, res) => {
  const { taskId } = req.params;
  db.get("SELECT id FROM tasks WHERE id = ? AND (created_by = ? OR id IN (SELECT task_id FROM task_assignments WHERE user_id = ?))",
    [taskId, req.userId, req.userId], (err, task) => {
      if (!task) return res.status(404).json({ error: 'Sin permisos o tarea no encontrada' });

      db.all(`SELECT a.*, u.name as uploaded_by_name FROM attachments a JOIN users u ON a.uploaded_by = u.id WHERE a.task_id = ? AND a.comment_id IS NULL`, [taskId],
        (err, attachments) => {
            if (err) return res.status(500).json({ error: 'Error al obtener adjuntos' });
            res.json(attachments || []);
        }
      );
    });
});

// 📤 SUBIR ARCHIVO A UNA TAREA
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });

  const { task_id, file_name } = req.body;
  if (!task_id) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'ID de tarea requerido' });
  }

  db.get("SELECT id FROM tasks WHERE id = ? AND (created_by = ? OR id IN (SELECT task_id FROM task_assignments WHERE user_id = ?))",
    [task_id, req.userId, req.userId], (err, task) => {
      if (err) {
        fs.unlinkSync(req.file.path);
        return res.status(500).json({ error: 'Error al verificar la tarea' });
      }
      if (!task) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Tarea no encontrada o sin permisos' });
      }

      db.run(
        `INSERT INTO attachments (task_id, file_path, file_name, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)`,
        [task_id, req.file.filename, file_name || req.file.originalname, req.file.mimetype, req.file.size, req.userId],
        function (err) {
          if (err) {
            fs.unlinkSync(req.file.path);
            console.error('Error al guardar adjunto en la BD:', err.message);
            return res.status(500).json({ error: 'No se pudo guardar la información del archivo' });
          }
          res.status(201).json({ id: this.lastID, file_path: req.file.filename });
        }
      );
    });
});

// 📥 DESCARGAR ARCHIVO
router.get('/download/:filename', authenticateToken, (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(uploadsDir, filename);

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });

  db.get(`SELECT a.*, t.id as task_id FROM attachments a JOIN tasks t ON a.task_id = t.id WHERE a.file_path = ? AND (t.created_by = ? OR t.id IN (SELECT task_id FROM task_assignments WHERE user_id = ?))`,
    [filename, req.userId, req.userId], (err, attachment) => {
      if (err || !attachment) return res.status(404).json({ error: 'Sin permisos para descargar este archivo' });

      res.setHeader('Content-Disposition', `attachment; filename="${attachment.file_name}"`);
      res.setHeader('Content-Type', attachment.file_type || 'application/octet-stream');
      fs.createReadStream(filePath).pipe(res);
    });
});

// 🗓️ RESUMEN DE TAREAS
router.get('/tasks/resumen', authenticateToken, (req, res) => {
  // La lógica de fechas ahora se maneja directamente en SQL para mayor precisión.
  const sql = `
  SELECT 
    (SELECT COUNT(*) FROM tasks WHERE status = 'pendiente' AND due_date < datetime('now', '-4 hours')) as vencidas,
    (SELECT COUNT(*) FROM tasks WHERE status = 'pendiente' AND due_date >= datetime('now', '-4 hours') AND due_date <= datetime('now', '-4 hours', '+3 days')) as proximas,
    (SELECT COUNT(*) FROM tasks WHERE status = 'pendiente') as total_pendientes
`;

  // Ya no se necesitan parámetros, SQLite calcula la fecha actual por sí mismo.
  db.get(sql, [], (err, row) => {
      if(err) return res.status(500).json({ error: 'Error al generar el resumen '});
      res.json(row || { vencidas: 0, proximas: 0, total_pendientes: 0 })
  });
});

// 🏷️ OBTENER TODAS LAS ETIQUETAS
router.get('/labels', authenticateToken, (req, res) => {
  db.all("SELECT * FROM labels ORDER BY name", (err, labels) => {
    if (err) return res.status(500).json({ error: 'Error al obtener etiquetas' });
    res.json(labels || []);
  });
});

// 🏷️ CREAR UNA NUEVA ETIQUETA
router.post('/labels', jsonParser, [
  authenticateToken,
  body('name').trim().isLength({ min: 1 }).escape().withMessage('El nombre es requerido')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, color } = req.body;
  const created_by = req.userId;

  db.run(
    "INSERT OR IGNORE INTO labels (name, color, created_by) VALUES (?, ?, ?)",
    [name, color || '#00A651', created_by],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'No se pudo crear la etiqueta' });
      }
      if (this.changes === 0) {
        return res.status(409).json({ error: 'La etiqueta ya existe' });
      }
      res.status(201).json({
        id: this.lastID,
        name,
        color: color || '#00A651',
        created_by,
        success: true
      });
    }
  );
});


module.exports = router;