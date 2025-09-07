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
// Importamos nuestro nuevo servicio de correo electrónico
const { sendEmail } = require('../services/email.service');
// Importamos la función broadcast desde el servicio de WebSocket
const { broadcast } = require('../services/websocket.service');

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

// 📋 LISTAR TAREAS (CON ADJUNTOS)
router.get('/tasks', authenticateToken, (req, res) => {
  const { assigned_to, created_by, status, due_date, search } = req.query;

  let sql = `
    SELECT 
      t.*, 
      u.name as created_by_name,
      GROUP_CONCAT(DISTINCT ua.name) as assigned_names,
      GROUP_CONCAT(DISTINCT ta.user_id) as assigned_ids,
      GROUP_CONCAT(DISTINCT l.name) as label_names,
      GROUP_CONCAT(
        CASE
          WHEN att.id IS NOT NULL THEN
            att.id || ':' || att.file_name || ':' || att.file_path
          ELSE
            NULL
        END
      ) as attachments_data
    FROM tasks t
    LEFT JOIN users u ON t.created_by = u.id
    LEFT JOIN task_assignments ta ON t.id = ta.task_id
    LEFT JOIN users ua ON ta.user_id = ua.id
    LEFT JOIN task_labels tl ON t.id = tl.task_id
    LEFT JOIN labels l ON tl.label_id = l.id
    LEFT JOIN attachments att ON t.id = att.task_id AND att.comment_id IS NULL
    WHERE t.is_archived = 0 
  `;

  const params = [];

  if (assigned_to) { sql += " AND ta.user_id = ?"; params.push(assigned_to); }
  if (created_by) { sql += " AND t.created_by = ?"; params.push(created_by); }
  if (status) { sql += " AND t.status = ?"; params.push(status); }
  if (due_date) { sql += " AND DATE(t.due_date) = DATE(?)"; params.push(due_date); }
  if (search) { sql += " AND (t.title LIKE ? OR t.description LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }

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

    tasks.forEach(task => {
      if (task.attachments_data) {
        task.attachments = task.attachments_data.split(',').map(attString => {
          const [id, file_name, file_path] = attString.split(':');
          return { id: parseInt(id), file_name, file_path };
        });
      } else {
        task.attachments = [];
      }
      delete task.attachments_data;
    });

    res.json(tasks || []);
  });
});

// 💡 VERIFICAR Y CREAR NOTIFICACIONES DE VENCIMIENTO
router.post('/tasks/check-due-today', authenticateToken, async (req, res) => {
  const hoy = new Date().toISOString().slice(0, 10);
  const sql = `
    SELECT t.id, t.title, t.created_by, GROUP_CONCAT(ta.user_id) as assigned_ids
    FROM tasks t
    LEFT JOIN task_assignments ta ON t.id = ta.task_id
    WHERE DATE(t.due_date) = ? 
      AND t.status = 'pendiente'
      AND NOT EXISTS (
        SELECT 1 FROM notifications 
        WHERE tipo = 'due_today' 
        AND task_id = t.id
        AND DATE(fecha_creacion) = ?
      )
    GROUP BY t.id
  `;
  db.all(sql, [hoy, hoy], (err, tasks) => {
    if (err || !tasks) return res.status(500).json({ error: 'Error al verificar tareas' });
    tasks.forEach(task => {
      const allInvolved = new Set([task.created_by]);
      if (task.assigned_ids) {
        task.assigned_ids.split(',').forEach(id => allInvolved.add(parseInt(id)));
      }
      const mensaje = `La tarea "${task.title.substring(0, 30)}..." vence hoy.`;
      // <-- MODIFICADO: Añadimos task.id para que la notificación sea interactiva
      const stmt = db.prepare(`INSERT INTO notifications (usuario_id, mensaje, tipo, task_id) VALUES (?, ?, ?, ?)`);
      allInvolved.forEach(userId => stmt.run(userId, mensaje, 'due_today', task.id));
      stmt.finalize();
    });
    res.status(200).json({ checked: tasks.length });
  });
});

// 🆕 CREAR TAREA
router.post('/tasks', jsonParser, authenticateToken, [body('title').notEmpty().trim().escape()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { title, description, due_date, priority, assigned_to, label_ids } = req.body;
  const creator = req.user;

  db.run(`INSERT INTO tasks (title, description, due_date, priority, created_by) VALUES (?, ?, ?, ?, ?)`,
    [title, description || '', due_date, priority || 'media', creator.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'No se pudo crear la tarea' });

      const taskId = this.lastID;
      const taskTitle = title.substring(0, 30);
      const taskUrl = `${process.env.APP_URL || 'http://localhost:3000'}/tablero.html`;
      const formattedDueDate = new Date(due_date).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });

      const creatorHtml = `
        <h2>¡Tarea Creada Exitosamente!</h2>
        <p>Hola ${creator.name},</p>
        <p>Tu tarea "<strong>${title}</strong>" ha sido creada en BiocareTask.</p>
        <p><strong>Vencimiento:</strong> ${formattedDueDate}</p>
        <a href="${taskUrl}" style="color: #049DD9; font-weight: bold;">Ver en el tablero</a>
      `;
      sendEmail(creator.email, `✅ Tarea Creada: ${taskTitle}`, creatorHtml);

      if (assigned_to && Array.isArray(assigned_to)) {
        const stmt = db.prepare("INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)");
        assigned_to.forEach(userId => {
          stmt.run(taskId, userId);
          if (userId !== creator.id) {
            const mensaje = `${creator.name} te ha asignado una nueva tarea: "${taskTitle}..."`;
            // <-- MODIFICADO: Añadimos taskId para que la notificación sea interactiva
            db.run(`INSERT INTO notifications (usuario_id, mensaje, tipo, task_id) VALUES (?, ?, ?, ?)`, [userId, mensaje, 'assignment', taskId]);

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
      broadcast({ type: 'TASKS_UPDATED' });
    }
  );
});

// ✏️ EDITAR TAREA
router.put('/tasks/:id', jsonParser, authenticateToken, (req, res) => {
  const taskId = req.params.id;
  const { title, description, due_date, priority, assigned_to, label_ids } = req.body;

  const permissionSql = `
    SELECT t.id FROM tasks t
    LEFT JOIN task_assignments ta ON t.id = ta.task_id
    WHERE t.id = ? AND (t.created_by = ? OR ta.user_id = ?)
    GROUP BY t.id
  `;

  db.get(permissionSql, [taskId, req.userId, req.userId], (err, task) => {
    if (err) return res.status(500).json({ error: 'Error al verificar permisos de la tarea' });
    if (!task) return res.status(403).json({ error: 'No tienes permiso para editar esta tarea o la tarea no existe' });

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
      db.run(`UPDATE tasks SET title = ?, description = ?, due_date = ?, priority = ? WHERE id = ?`, [title, description, due_date, priority, taskId]);
      db.run("DELETE FROM task_assignments WHERE task_id = ?", [taskId]);
      if (assigned_to && Array.isArray(assigned_to) && assigned_to.length > 0) {
        const assignStmt = db.prepare("INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)");
        assigned_to.forEach(userId => assignStmt.run(taskId, userId));
        assignStmt.finalize();
      }
      db.run("DELETE FROM task_labels WHERE task_id = ?", [taskId]);
      if (label_ids && Array.isArray(label_ids) && label_ids.length > 0) {
        const labelStmt = db.prepare("INSERT INTO task_labels (task_id, label_id) VALUES (?, ?)");
        label_ids.forEach(labelId => labelStmt.run(taskId, labelId));
        labelStmt.finalize();
      }
      db.run("COMMIT", (commitErr) => {
        if (commitErr) {
          db.run("ROLLBACK");
          return res.status(500).json({ error: 'Error al guardar los cambios en la base de datos' });
        }
        res.status(200).json({ success: true, message: 'Tarea actualizada' });
        broadcast({ type: 'TASKS_UPDATED' });
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
    db.run("DELETE FROM tasks WHERE id = ?", [taskId], function (err) {
      if (err) return res.status(500).json({ error: 'Error al eliminar la tarea' });
      res.status(200).json({ success: true, message: 'Tarea eliminada' });
      broadcast({ type: 'TASKS_UPDATED' });
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
        broadcast({ type: 'TASKS_UPDATED' });
      });
    });
});

// 📝 OBTENER COMENTARIOS DE UNA TAREA
router.get('/tasks/:id/comments', authenticateToken, (req, res) => {
  const taskId = req.params.id;
  const sql = `
    SELECT c.*, u.name as autor_nombre, u.avatar_url as autor_avatar_url,
           a.id as attachment_id, a.file_path as attachment_path, a.file_name as attachment_name
    FROM comments c 
    JOIN users u ON c.autor_id = u.id 
    LEFT JOIN attachments a ON a.comment_id = c.id
    WHERE c.task_id = ? 
    ORDER BY c.fecha_creacion ASC
  `;
  db.all(sql, [taskId], (err, rows) => {
    if (err) return res.status(500).json({ error: "Error al obtener comentarios" });
    const commentsMap = {};
    rows.forEach(row => {
      if (!commentsMap[row.id]) {
        commentsMap[row.id] = { ...row, attachments: [] };
        delete commentsMap[row.id].attachment_id;
        delete commentsMap[row.id].attachment_path;
        delete commentsMap[row.id].attachment_name;
      }
      if (row.attachment_id) {
        commentsMap[row.id].attachments.push({
          id: row.attachment_id,
          file_path: row.attachment_path,
          file_name: row.attachment_name
        });
      }
    });
    res.json(Object.values(commentsMap));
  });
});

// 📝 AGREGAR COMENTARIO A TAREA (CON ADJUNTO MÚLTIPLE)
router.post('/tasks/comments', authenticateToken, upload.array('attachments', 5), async (req, res) => {
  const { task_id, contenido } = req.body;
  const autor_id = req.userId;
  
  // Verificamos si hay contenido de texto O si se subieron archivos
  if ((!contenido || !contenido.trim()) && (!req.files || req.files.length === 0)) {
    return res.status(400).json({ error: 'El comentario no puede estar vacío si no se adjunta un archivo.' });
  }

  // Usamos una transacción para asegurar que la inserción del comentario y sus adjuntos sean atómicas
  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    
    // 1. Insertar el comentario primero para obtener su ID
    db.run(`INSERT INTO comments (task_id, contenido, autor_id) VALUES (?, ?, ?)`,
      [task_id, contenido || '', autor_id],
      function (err) {
        if (err) {
          db.run("ROLLBACK");
          return res.status(500).json({ error: 'Error al crear comentario' });
        }
        
        const commentId = this.lastID;
        let filesInserted = true;

        // 2. Insertar cada archivo adjunto si existen
        if (req.files && req.files.length > 0) {
          const stmt = db.prepare(
            `INSERT INTO attachments (task_id, comment_id, file_path, file_name, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)`
          );
          
          for (const file of req.files) {
            stmt.run(task_id, commentId, file.filename, file.originalname, file.mimetype, file.size, autor_id, (err) => {
              if (err) {
                console.error('Error al insertar adjunto:', err);
                filesInserted = false;
              }
            });
          }
          stmt.finalize();
        }

        // 3. Confirmar la transacción
        db.run("COMMIT", (commitErr) => {
          if (commitErr || !filesInserted) {
            db.run("ROLLBACK");
            // Adicionalmente, podrías limpiar los archivos del disco aquí.
            return res.status(500).json({ error: 'Error al guardar los adjuntos del comentario' });
          }

          // 4. Si todo es exitoso, enviar notificaciones y respuesta
          db.get("SELECT title, created_by FROM tasks WHERE id = ?", [task_id], (err, taskInfo) => {
            if (taskInfo) {
              db.all("SELECT user_id FROM task_assignments WHERE task_id = ?", [task_id], (err, assignments) => {
                const assignedUserIds = assignments.map(a => a.user_id);
                const usersToNotify = [...new Set([taskInfo.created_by, ...assignedUserIds])].filter(id => id !== autor_id);
                if (usersToNotify.length > 0) {
                  const mensaje = `${req.user.name} comentó en la tarea: "${taskInfo.title.substring(0, 30)}..."`;
                  const stmtNotif = db.prepare(`INSERT INTO notifications (usuario_id, mensaje, tipo, task_id) VALUES (?, ?, ?, ?)`);
                  usersToNotify.forEach(userId => stmtNotif.run(userId, mensaje, 'comment', task_id));
                  stmtNotif.finalize();
                }
              });
            }
          });
          
          res.status(201).json({ id: commentId, success: true });
          broadcast({ type: 'TASKS_UPDATED' });
        });
      }
    );
  });
});

// 📎 OBTENER ADJUNTOS DE UNA TAREA (DIRECTOS)
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

// 📤 SUBIR ARCHIVOS A UNA TAREA (DIRECTO, MÚLTIPLE)
router.post('/upload', authenticateToken, upload.array('files', 5), async (req, res) => {
  // 1. Verificamos que se hayan subido archivos
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No se subieron archivos' });
  }

  const { task_id } = req.body;

  // Función para limpiar los archivos subidos en caso de error
  const cleanupFiles = () => {
    for (const file of req.files) {
      try {
        fs.unlinkSync(file.path);
      } catch (e) {
        console.error(`Error al limpiar el archivo: ${file.path}`, e);
      }
    }
  };

  // 2. Verificamos que se haya proporcionado un ID de tarea
  if (!task_id) {
    cleanupFiles();
    return res.status(400).json({ error: 'ID de tarea requerido' });
  }

  // 3. Verificamos que el usuario tenga permisos sobre la tarea
  db.get("SELECT id FROM tasks WHERE id = ? AND (created_by = ? OR id IN (SELECT task_id FROM task_assignments WHERE user_id = ?))",
    [task_id, req.userId, req.userId], (err, task) => {
      if (err || !task) {
        cleanupFiles();
        return res.status(err ? 500 : 404).json({ error: err ? 'Error al verificar la tarea' : 'Tarea no encontrada o sin permisos' });
      }

      // 4. Preparamos la inserción en la base de datos
      const stmt = db.prepare(`INSERT INTO attachments (task_id, file_path, file_name, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)`);
      const insertedFiles = [];

      // 5. Usamos una transacción para insertar todos los archivos de forma atómica
      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        for (const file of req.files) {
          stmt.run(task_id, file.filename, file.originalname, file.mimetype, file.size, req.userId);
          insertedFiles.push({ file_path: file.filename, file_name: file.originalname });
        }

        db.run("COMMIT", (commitErr) => {
          stmt.finalize(); // Cerramos el statement preparado

          if (commitErr) {
            db.run("ROLLBACK");
            cleanupFiles(); // Limpiamos archivos si la transacción falla
            return res.status(500).json({ error: 'No se pudo guardar la información de los archivos' });
          }

          // 6. Si todo sale bien, enviamos la respuesta y notificamos a los clientes
          res.status(201).json({ success: true, files: insertedFiles });
          broadcast({ type: 'TASKS_UPDATED' });
        });
      });
    }
  );
});

// 📥 DESCARGAR ARCHIVO
router.get('/download/:filename', authenticateToken, (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(uploadsDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });
  db.get(`SELECT a.*, t.id as task_id FROM attachments a JOIN tasks t ON a.task_id = t.id WHERE a.file_path = ? AND (t.created_by = ? OR t.id IN (SELECT task_id FROM task_assignments WHERE user_id = ?))`,
    [filename, req.userId, req.userId], (err, attachment) => {
      if (err || !attachment) return res.status(403).json({ error: 'Sin permisos para descargar este archivo' });
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.file_name}"`);
      res.setHeader('Content-Type', attachment.file_type || 'application/octet-stream');
      fs.createReadStream(filePath).pipe(res);
    });
});

// 🗑️ ELIMINAR UN ADJUNTO ESPECÍFICO
router.delete('/attachments/:id', authenticateToken, (req, res) => {
  const attachmentId = req.params.id;
  const userId = req.userId;

  // 1. Primero, obtenemos la información del adjunto, incluyendo el ID de la tarea a la que pertenece
  db.get("SELECT task_id, file_path FROM attachments WHERE id = ?", [attachmentId], (err, attachment) => {
    if (err) return res.status(500).json({ error: 'Error al buscar el adjunto' });
    if (!attachment) return res.status(404).json({ error: 'Adjunto no encontrado' });

    // 2. Verificamos que el usuario tenga permisos sobre la tarea dueña del adjunto
    db.get("SELECT id FROM tasks WHERE id = ? AND (created_by = ? OR id IN (SELECT task_id FROM task_assignments WHERE user_id = ?))",
      [attachment.task_id, userId, userId], (err, task) => {
        if (err || !task) {
          return res.status(403).json({ error: 'No tienes permiso para eliminar este adjunto' });
        }

        // 3. Si tiene permisos, procedemos a eliminar
        const filePath = path.join(uploadsDir, attachment.file_path);

        // Eliminar de la base de datos
        db.run("DELETE FROM attachments WHERE id = ?", [attachmentId], function(err) {
          if (err) return res.status(500).json({ error: 'Error al eliminar el adjunto de la base de datos' });

          // Eliminar el archivo físico del disco
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          
          res.status(200).json({ success: true, message: 'Adjunto eliminado' });
          broadcast({ type: 'TASKS_UPDATED' }); // Notificamos a todos para que actualicen la vista
        });
      }
    );
  });
});

// 🗓️ RESUMEN DE TAREAS
router.get('/tasks/resumen', authenticateToken, (req, res) => {
  const sql = `
    SELECT 
      (SELECT COUNT(*) FROM tasks WHERE status = 'pendiente' AND due_date < datetime('now', '-4 hours')) as vencidas,
      (SELECT COUNT(*) FROM tasks WHERE status = 'pendiente' AND due_date >= datetime('now', '-4 hours') AND due_date <= datetime('now', '-4 hours', '+3 days')) as proximas,
      (SELECT COUNT(*) FROM tasks WHERE status = 'pendiente') as total_pendientes
  `;
  db.get(sql, [], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error al generar el resumen ' });
    res.json(row || { vencidas: 0, proximas: 0, total_pendientes: 0 });
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
  db.run("INSERT OR IGNORE INTO labels (name, color, created_by) VALUES (?, ?, ?)",
    [name, color || '#00A651', created_by],
    function (err) {
      if (err) return res.status(500).json({ error: 'No se pudo crear la etiqueta' });
      if (this.changes === 0) return res.status(409).json({ error: 'La etiqueta ya existe' });
      res.status(201).json({
        id: this.lastID, name, color: color || '#00A651', created_by, success: true
      });
    }
  );
});

// 🗄️ ARCHIVAR UNA TAREA
router.post('/tasks/:id/archive', authenticateToken, (req, res) => {
  const taskId = req.params.id;
  const userId = req.userId;

  // Solo el creador o un admin puede archivar
  db.get("SELECT created_by FROM tasks WHERE id = ?", [taskId], (err, task) => {
    if (err) return res.status(500).json({ error: 'Error al verificar la tarea' });
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });

    if (task.created_by !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'No tienes permiso para archivar esta tarea' });
    }

    db.run("UPDATE tasks SET is_archived = 1 WHERE id = ?", [taskId], function (err) {
      if (err) return res.status(500).json({ error: 'Error al archivar la tarea' });
      res.status(200).json({ success: true, message: 'Tarea archivada' });

      // Enviamos una actualización a todos los clientes
      broadcast({ type: 'TASKS_UPDATED' });
    });
  });
});

// 🗄️ OBTENER TAREAS ARCHIVADAS
router.get('/tasks/archived', authenticateToken, (req, res) => {
  const sql = `
    SELECT id, title, completed_at
    FROM tasks
    WHERE is_archived = 1
    ORDER BY completed_at DESC
  `;
  db.all(sql, (err, tasks) => {
    if (err) return res.status(500).json({ error: 'Error al obtener tareas archivadas' });
    res.json(tasks || []);
  });
});


module.exports = router;