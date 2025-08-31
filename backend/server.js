// backend/server.js (Versión Final Refactorizada)
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

// --- Importar Routers ---
const authRoutes = require('./routes/auth.routes');
const tasksRoutes = require('./routes/tasks.routes');
const usersRoutes = require('./routes/users.routes');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// === MIDDLEWARE GLOBAL ===
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// === SERVIR ARCHIVOS ESTÁTICOS ===
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/uploads', express.static(uploadsDir));


// === REGISTRO DE RUTAS API ===
// Todas las rutas importadas se agruparán bajo el prefijo /api
app.use('/api', authRoutes);
app.use('/api', tasksRoutes);
app.use('/api', usersRoutes);


// === RUTAS AMIGABLES Y MANEJO DE ERRORES ===
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html')));
app.get('/registro', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'registro.html')));
app.get('/tablero', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'tablero.html')));
app.get('/perfil', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'perfil.html')));

// Ruta de salud
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Manejador para rutas 404
app.use('*', (req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    res.status(404).json({ error: 'Endpoint no encontrado' });
  } else {
    res.status(404).sendFile(path.join(__dirname, '..', 'frontend', 'login.html')); // O una página 404.html
  }
});

// Manejador de errores global (debe ir al final)
app.use((err, req, res, next) => {
    console.error('Error no controlado:', err.stack);
    // Manejo de errores de Multer
    if (err instanceof require('multer').MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'El archivo es demasiado grande (máx 10MB).' });
        }
    }
    res.status(500).json({ error: 'Error interno del servidor' });
});


// === INICIAR SERVIDOR ===
app.listen(PORT, HOST, () => {
  console.log(`🚀 BiocareTask corriendo en http://${HOST}:${PORT}`);
  console.log(`⏰ Iniciado: ${new Date().toLocaleString('es-CL')}`);
});