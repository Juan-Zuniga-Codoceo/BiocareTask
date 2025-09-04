// backend/server.js (Versión refactorizada)
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

// <-- NUEVO: Importamos nuestro servicio de WebSocket
const { initializeWebSocket } = require('./services/websocket.service');
const { startScheduledJobs } = require('./jobs/scheduler');

// --- Importar Routers ---
const authRoutes = require('./routes/auth.routes');
const tasksRoutes = require('./routes/tasks.routes');
const usersRoutes = require('./routes/users.routes');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Middlewares y configuración de rutas (sin cambios)
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/api', authRoutes);
app.use('/api', tasksRoutes);
app.use('/api', usersRoutes);
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html')));
// ... y las otras rutas amigables

app.use((err, req, res, next) => {
    console.error('Error no controlado:', err.stack);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// === INICIAR SERVIDOR ===
const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 BiocareTask corriendo en http://${HOST}:${PORT}`);
});

// <-- NUEVO: Inicializamos el WebSocket server pasándole nuestro servidor HTTP
initializeWebSocket(server);
startScheduledJobs(); 
