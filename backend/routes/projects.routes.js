// backend/routes/projects.routes.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const jsonParser = express.json();

// Todas las rutas de proyectos requieren que el usuario esté autenticado
router.use(authenticateToken);

// --- Middleware para verificar membresía en un proyecto ---
const verifyProjectMembership = (req, res, next) => {
    const projectId = req.params.projectId || req.params.id;
    const userId = req.user.id;

    if (req.user.role === 'admin') {
        return next(); // Los administradores tienen acceso a todos los proyectos
    }

    const sql = "SELECT * FROM project_members WHERE project_id = ? AND user_id = ?";
    db.get(sql, [projectId, userId], (err, member) => {
        if (err) {
            return res.status(500).json({ error: "Error al verificar la membresía del proyecto." });
        }
        if (!member) {
            return res.status(403).json({ error: "Acceso denegado. No eres miembro de este proyecto." });
        }
        next();
    });
};


// === RUTAS CRUD PARA PROYECTOS ===

// 📦 OBTENER TODOS LOS PROYECTOS DEL USUARIO LOGUEADO
router.get('/', (req, res) => {
    const userId = req.user.id;
    const sql = `
        SELECT p.* FROM projects p
        JOIN project_members pm ON p.id = pm.project_id
        WHERE pm.user_id = ?
        ORDER BY p.name ASC
    `;
    db.all(sql, [userId], (err, projects) => {
        if (err) return res.status(500).json({ error: 'Error al obtener los proyectos.' });
        res.json(projects || []);
    });
});

// 📦 CREAR UN NUEVO PROYECTO
router.post('/', jsonParser, [
    body('name').trim().notEmpty().withMessage('El nombre del proyecto es obligatorio.')
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { name, description } = req.body;
    const creatorId = req.user.id;

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        
        const projectSql = `INSERT INTO projects (name, description, created_by) VALUES (?, ?, ?)`;
        db.run(projectSql, [name, description || '', creatorId], function(err) {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: 'No se pudo crear el proyecto.' });
            }
            
            const projectId = this.lastID;
            
            // Automáticamente añadir al creador como miembro del proyecto
            const memberSql = `INSERT INTO project_members (project_id, user_id) VALUES (?, ?)`;
            db.run(memberSql, [projectId, creatorId], (err) => {
                if (err) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: 'No se pudo añadir al creador como miembro del proyecto.' });
                }
                
                db.run("COMMIT", (commitErr) => {
                    if (commitErr) {
                         return res.status(500).json({ error: 'Error al confirmar la creación del proyecto.' });
                    }
                    res.status(201).json({ id: projectId, name, description, message: 'Proyecto creado exitosamente.' });
                });
            });
        });
    });
});


// === RUTAS PARA GESTIONAR MIEMBROS ===

// 🙋‍♂️ OBTENER MIEMBROS DE UN PROYECTO
router.get('/:projectId/members', verifyProjectMembership, (req, res) => {
    const { projectId } = req.params;
    const sql = `
        SELECT u.id, u.name, u.email, u.avatar_url FROM users u
        JOIN project_members pm ON u.id = pm.user_id
        WHERE pm.project_id = ?
    `;
    db.all(sql, [projectId], (err, members) => {
        if (err) return res.status(500).json({ error: 'Error al obtener los miembros del proyecto.' });
        res.json(members || []);
    });
});

// 🙋‍♂️ AÑADIR UN MIEMBRO A UN PROYECTO
router.post('/:projectId/members', jsonParser, verifyProjectMembership, [
    body('email').isEmail().withMessage('Debe proporcionar un correo electrónico válido.')
], (req, res) => {
    const { projectId } = req.params;
    const { email } = req.body;

    // 1. Buscar al usuario por su email
    db.get("SELECT id FROM users WHERE email = ?", [email], (err, userToAdd) => {
        if (err) return res.status(500).json({ error: 'Error al buscar el usuario.' });
        if (!userToAdd) return res.status(404).json({ error: 'Usuario no encontrado con ese correo electrónico.' });

        // 2. Insertar al usuario como miembro (ignorando si ya existe)
        const sql = `INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)`;
        db.run(sql, [projectId, userToAdd.id], function(err) {
            if (err) return res.status(500).json({ error: 'Error al añadir el miembro al proyecto.' });
            if (this.changes === 0) {
                return res.status(409).json({ message: 'El usuario ya es miembro de este proyecto.' });
            }
            res.status(201).json({ success: true, message: 'Usuario añadido al proyecto.' });
        });
    });
});

module.exports = router;