const jwt = require('jsonwebtoken'); // <-- 1. IMPORTAMOS JWT
const db = require('../db');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  // <-- 2. VERIFICAMOS EL TOKEN JWT EN LUGAR DE UN NÚMERO
  jwt.verify(token, process.env.JWT_SECRET, (err, tokenPayload) => {
    if (err) {
      // Si el token es inválido o expiró
      return res.status(403).json({ error: 'Token inválido o la sesión ha expirado' });
    }

    // El token es válido, extraemos el ID del payload
    const userId = tokenPayload.id;
    
    // Buscamos al usuario para asegurarnos de que todavía existe
    db.get("SELECT id, name, email, office, role FROM users WHERE id = ?", [userId], (err, user) => {
      if (err || !user) {
        // Este caso cubre si el usuario fue eliminado mientras su token aún era válido
        return res.status(403).json({ error: 'El usuario del token ya no existe' });
      }

      // <-- 3. ADJUNTAMOS EL USUARIO A LA PETICIÓN
      req.userId = user.id; // Mantenemos userId por consistencia
      req.user = user;     // Adjuntamos el objeto de usuario completo
      next();              // Damos paso a la ruta solicitada
    });
  });
};

module.exports = { authenticateToken };