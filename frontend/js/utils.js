// frontend/js/utils.js - Utilidades generales
const Utils = {
  // Formatear fecha
  formatDate: (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const options = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    };
    return date.toLocaleDateString('es-CL', options);
  },

  // Formatear tamaño de archivo
  formatFileSize: (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  },

  // Obtener nombre de archivo desde ruta
  getFileName: (path) => {
    if (!path) return '';
    return path.split('/').pop().split('\\').pop();
  },

  // Generar color basado en texto (para etiquetas)
  generateColor: (text) => {
    const colors = [
      '#049DD9', '#04B2D9', '#97BF04', '#83A603', '#E30613',
      '#9C27B0', '#607D8B', '#FF9800', '#795548', '#009688'
    ];
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  },

  // Validar email
  validateEmail: (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  },

  // Descargar archivo
  downloadFile: (url, fileName) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  // Mostrar notificación
  showNotification: (message, type = 'info') => {
    // Eliminar notificación anterior si existe
    const oldNotification = document.getElementById('global-notification');
    if (oldNotification) {
      oldNotification.remove();
    }

    const notification = document.createElement('div');
    notification.id = 'global-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      border-radius: 5px;
      color: white;
      z-index: 10000;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideIn 0.3s ease;
    `;

    const colors = {
      success: '#4CAF50',
      error: '#F44336',
      warning: '#FF9800',
      info: '#2196F3'
    };

    notification.style.backgroundColor = colors[type] || colors.info;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Auto-eliminar después de 5 segundos
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
          }
        }, 300);
      }
    }, 5000);
  }
};

// Añadir estilos para las animaciones
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

// Hacer utilidades disponibles globalmente
window.Utils = Utils;