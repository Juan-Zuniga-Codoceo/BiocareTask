// backend/middleware/auth.js
const db = require('../db');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  // La base de datos espera un número, así que nos aseguramos de que lo sea.
  const userId = parseInt(token, 10);
  if (isNaN(userId)) {
      return res.status(401).json({ error: 'Formato de token inválido' });
  }

  db.get("SELECT id, name, email, office, role FROM users WHERE id = ?", [userId], (err, user) => {
    if (err) {
      console.error('Error en autenticación:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }

    if (!user) {
      return res.status(403).json({ error: 'Token inválido o la sesión ha expirado' });
    }

    req.userId = user.id;
    req.user = user;
    next();
  });
};

module.exports = { authenticateToken };