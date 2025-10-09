// backend/routes/tasks.routes.js (Versión Final y Completa para Proyectos)
const express = require('express');
const router = express.Router({ mergeParams: true }); // Esencial para acceder a :projectId
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { broadcast } = require('../services/websocket.service');
const { createEmailTemplate } = require('../services/email-template.service');
const { sendEmail } = require('../services/email.service');

// --- Configuración de Multer ---
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_'));
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });
const jsonParser = express.json();

// --- Middleware de Seguridad: Verificar Membresía en el Proyecto ---
const verifyProjectMembership = (req, res, next) => {
    const { projectId } = req.params;
    const userId = req.user.id;

    if (req.user.role === 'admin') {
        return next(); // Los administradores tienen acceso global.
    }

    const sql = "SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?";
    db.get(sql, [projectId, userId], (err, member) => {
        if (err) return res.status(500).json({ error: "Error al verificar la membresía." });
        if (!member) return res.status(403).json({ error: "Acceso denegado. No eres miembro de este proyecto." });
        next();
    });
};

// Aplicamos el middleware a todas las rutas de este archivo.
router.use(verifyProjectMembership);

// ======================================================
// ===          RUTAS DE TAREAS (por Proyecto)        ===
// ======================================================

// 📋 LISTAR TAREAS
router.get('/tasks', (req, res) => {
    const { projectId } = req.params;
    const { assigned_to, search } = req.query;

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
        WHERE t.is_archived = 0 AND t.project_id = ?
    `;
    const params = [projectId];

    if (assigned_to) { sql += " AND ta.user_id = ?"; params.push(assigned_to); }
    if (search) { sql += " AND (t.title LIKE ? OR t.description LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }

    sql += ` GROUP BY t.id ORDER BY CASE t.priority WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, t.due_date ASC`;

    db.all(sql, params, (err, tasks) => {
        if (err) return res.status(500).json({ error: 'Error al obtener tareas del proyecto' });
        res.json(tasks || []);
    });
});

// ➕ CREAR TAREA
router.post('/tasks', jsonParser, (req, res) => {
    const { projectId } = req.params;
    const { title, description, due_date, priority, assigned_to, label_ids } = req.body;
    const creator = req.user;

    const sql = `INSERT INTO tasks (title, description, due_date, priority, created_by, project_id) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(sql, [title, description || '', due_date, priority || 'media', creator.id, projectId], function (err) {
        if (err) return res.status(500).json({ error: 'No se pudo crear la tarea' });
        
        const taskId = this.lastID;
        
        if (assigned_to && Array.isArray(assigned_to)) {
            const stmt = db.prepare("INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)");
            assigned_to.forEach(userId => {
                stmt.run(taskId, userId);
                if (userId !== creator.id) {
                    const mensaje = `${creator.name} te ha asignado una nueva tarea: "${title.substring(0, 30)}..."`;
                    db.run(`INSERT INTO notifications (usuario_id, mensaje, tipo, task_id) VALUES (?, ?, ?, ?)`, [userId, mensaje, 'assignment', taskId]);
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
        broadcast({ type: 'TASKS_UPDATED', projectId });
    });
});

// ✏️ EDITAR TAREA
router.put('/tasks/:id', jsonParser, (req, res) => {
    const { projectId, id } = req.params;
    const { title, description, due_date, priority, assigned_to, label_ids } = req.body;

    db.get("SELECT created_by FROM tasks WHERE id = ? AND project_id = ?", [id, projectId], (err, task) => {
        if (err) return res.status(500).json({ error: 'Error al verificar la tarea.' });
        if (!task) return res.status(404).json({ error: 'Tarea no encontrada en este proyecto.' });

        if (task.created_by !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'No tienes permiso para editar esta tarea.' });
        }

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            db.run(`UPDATE tasks SET title = ?, description = ?, due_date = ?, priority = ? WHERE id = ?`, [title, description, due_date, priority, id]);
            
            db.run("DELETE FROM task_assignments WHERE task_id = ?", [id]);
            if (assigned_to && Array.isArray(assigned_to) && assigned_to.length > 0) {
                const assignStmt = db.prepare("INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)");
                assigned_to.forEach(userId => assignStmt.run(id, userId));
                assignStmt.finalize();
            }

            db.run("DELETE FROM task_labels WHERE task_id = ?", [id]);
            if (label_ids && Array.isArray(label_ids) && label_ids.length > 0) {
                const labelStmt = db.prepare("INSERT INTO task_labels (task_id, label_id) VALUES (?, ?)");
                label_ids.forEach(labelId => labelStmt.run(id, labelId));
                labelStmt.finalize();
            }

            db.run("COMMIT", (commitErr) => {
                if (commitErr) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: 'Error al guardar los cambios.' });
                }
                res.status(200).json({ success: true, message: 'Tarea actualizada' });
                broadcast({ type: 'TASKS_UPDATED', projectId });
            });
        });
    });
});

// 🗑️ ELIMINAR TAREA
router.delete('/tasks/:id', (req, res) => {
    const { projectId, id } = req.params;

    db.get("SELECT created_by FROM tasks WHERE id = ? AND project_id = ?", [id, projectId], (err, task) => {
        if (err) return res.status(500).json({ error: 'Error al verificar la tarea.' });
        if (!task) return res.status(404).json({ error: 'Tarea no encontrada en este proyecto.' });

        if (task.created_by !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'No tienes permiso para eliminar esta tarea.' });
        }

        db.run("DELETE FROM tasks WHERE id = ?", [id], function (err) {
            if (err) return res.status(500).json({ error: 'Error al eliminar la tarea.' });
            res.status(200).json({ success: true, message: 'Tarea eliminada' });
            broadcast({ type: 'TASKS_UPDATED', projectId });
        });
    });
});

// ✅ CAMBIAR ESTADO DE TAREA
router.put('/tasks/:id/status', jsonParser, (req, res) => {
    const { projectId, id } = req.params;
    const { status } = req.body;
    const completed_at = status === 'completada' ? new Date().toISOString() : null;

    const sql = `UPDATE tasks SET status = ?, completed_at = ? WHERE id = ? AND project_id = ?`;

    db.run(sql, [status, completed_at, id, projectId], function(err) {
        if (err) return res.status(500).json({ error: 'Error al actualizar el estado.' });
        if (this.changes === 0) return res.status(404).json({ error: 'Tarea no encontrada.' });
        
        res.json({ success: true });
        broadcast({ type: 'TASKS_UPDATED', projectId });
    });
});

// 📝 OBTENER COMENTARIOS DE UNA TAREA
router.get('/tasks/:id/comments', (req, res) => {
    const { id } = req.params;
    const sql = `
      SELECT c.*, u.name as autor_nombre, u.avatar_url as autor_avatar_url
      FROM comments c 
      JOIN users u ON c.autor_id = u.id 
      WHERE c.task_id = ? 
      ORDER BY c.fecha_creacion ASC
    `;
    db.all(sql, [id], (err, comments) => {
        if (err) return res.status(500).json({ error: "Error al obtener comentarios" });
        res.json(comments || []);
    });
});

// 📝 AGREGAR COMENTARIO A TAREA
router.post('/tasks/:id/comments', upload.array('attachments', 5), (req, res) => {
    const { id: task_id, projectId } = req.params;
    const { contenido, mentioned_user_ids } = req.body;
    const autor_id = req.user.id;
    
    let mentionedIds = [];
    if (mentioned_user_ids) {
        try {
            mentionedIds = JSON.parse(mentioned_user_ids);
        } catch (e) {
            console.error("Error al parsear IDs de menciones:", e);
        }
    }

    if ((!contenido || !contenido.trim()) && (!req.files || req.files.length === 0)) {
        return res.status(400).json({ error: 'El comentario no puede estar vacío.' });
    }

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run(`INSERT INTO comments (task_id, contenido, autor_id) VALUES (?, ?, ?)`, [task_id, contenido || '', autor_id], function(err) {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: 'Error al crear comentario' });
            }
            const commentId = this.lastID;

            if (req.files && req.files.length > 0) {
                const stmt = db.prepare(`INSERT INTO attachments (task_id, comment_id, file_path, file_name, uploaded_by) VALUES (?, ?, ?, ?, ?)`);
                for (const file of req.files) {
                    stmt.run(task_id, commentId, file.filename, file.originalname, autor_id);
                }
                stmt.finalize();
            }
            
            db.run("COMMIT", (commitErr) => {
                if (commitErr) return res.status(500).json({ error: 'Error al guardar el comentario.' });

                // Lógica de notificaciones
                db.get("SELECT title FROM tasks WHERE id = ?", [task_id], (err, task) => {
                    if (task) {
                        const mentionMsg = `${req.user.name} te ha mencionado en: "${task.title}"`;
                        const commentMsg = `${req.user.name} comentó en: "${task.title}"`;
                        
                        const stmt = db.prepare(`INSERT INTO notifications (usuario_id, mensaje, tipo, task_id) VALUES (?, ?, ?, ?)`);
                        mentionedIds.forEach(userId => {
                            if (userId !== autor_id) stmt.run(userId, mentionMsg, 'mention', task_id);
                        });
                        stmt.finalize();
                    }
                });

                res.status(201).json({ id: commentId, success: true });
                broadcast({ type: 'TASKS_UPDATED', projectId: projectId, taskId: task_id });
            });
        });
    });
});

// 📤 SUBIR ARCHIVOS A UNA TAREA (DIRECTO)
router.post('/tasks/:id/attachments', upload.array('files', 5), (req, res) => {
    const { id: task_id, projectId } = req.params;
    const uploader_id = req.user.id;

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No se subieron archivos.' });
    }

    const stmt = db.prepare(`INSERT INTO attachments (task_id, file_path, file_name, file_type, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)`);
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        for (const file of req.files) {
            stmt.run(task_id, file.filename, file.originalname, file.mimetype, file.size, uploader_id);
        }
        db.run("COMMIT", (commitErr) => {
            stmt.finalize();
            if (commitErr) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: 'No se pudo guardar la información de los archivos.' });
            }
            res.status(201).json({ success: true, message: `${req.files.length} archivo(s) subidos.` });
            broadcast({ type: 'TASKS_UPDATED', projectId, taskId: task_id });
        });
    });
});

// 🗄️ ARCHIVAR UNA TAREA
router.post('/tasks/:id/archive', (req, res) => {
    const { projectId, id } = req.params;

    db.get("SELECT created_by FROM tasks WHERE id = ? AND project_id = ?", [id, projectId], (err, task) => {
        if (err) return res.status(500).json({ error: 'Error al verificar la tarea' });
        if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });

        if (task.created_by !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'No tienes permiso para archivar esta tarea' });
        }

        db.run("UPDATE tasks SET is_archived = 1 WHERE id = ?", [id], function (err) {
            if (err) return res.status(500).json({ error: 'Error al archivar la tarea' });
            res.status(200).json({ success: true, message: 'Tarea archivada' });
            broadcast({ type: 'TASKS_UPDATED', projectId });
        });
    });
});

module.exports = router;