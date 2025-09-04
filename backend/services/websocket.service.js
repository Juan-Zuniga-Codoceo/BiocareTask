// backend/services/websocket.service.js
const { WebSocketServer } = require('ws');

// Usamos un Set para guardar todos los clientes conectados
const clients = new Set();

/**
 * Función para enviar un mensaje a TODOS los clientes conectados
 * @param {object} message - El objeto a enviar (se convertirá a JSON)
 */
const broadcast = (message) => {
  const data = JSON.stringify(message);
  for (const client of clients) {
    // Verificamos que la conexión del cliente esté abierta antes de enviar
    if (client.readyState === 1) { 
      client.send(data);
    }
  }
};

/**
 * Inicializa el servidor de WebSockets y lo adjunta al servidor HTTP
 * @param {http.Server} server - La instancia del servidor HTTP creada por Express
 */
const initializeWebSocket = (server) => {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    console.log('🔌 Nuevo cliente conectado vía WebSocket.');
    clients.add(ws);

    ws.on('close', () => {
      console.log('🔌 Cliente WebSocket desconectado.');
      clients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('❌ Error en un cliente WebSocket:', error);
    });
  });

  console.log('✅ Servidor de WebSockets iniciado y escuchando.');
};

// Exportamos las funciones que necesitaremos en otros archivos
module.exports = { initializeWebSocket, broadcast };