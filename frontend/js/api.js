// frontend/js/api.js
class API {
  static async request(url, options = {}) {
  const token = localStorage.getItem('auth_token');
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    }
  };
  
  const mergedOptions = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers
    }
  };
  
  try {
    const response = await fetch(url, mergedOptions);
    
    if (response.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('biocare_user');
      window.location.href = '/login';
      throw new Error('Sesión expirada');
    }
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error ${response.status}`);
    }
    
    // ✅ Manejar respuestas sin contenido
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return {};
    }
    
    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

  static async get(url) {
    return this.request(url);
  }

  static async post(url, data) {
    return this.request(url, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  static async put(url, data) {
    return this.request(url, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  static async delete(url) {
    return this.request(url, {
      method: 'DELETE'
    });
  }

  // ✅ CORREGIDO: Usa API.request, no this.request
  static async upload(url, formData) {
  const token = localStorage.getItem('auth_token');
  
  // ✅ NO establecer Content-Type, el navegador lo hará automáticamente
  return fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
      // ⚠️ Dejar que el navegador establezca el Content-Type con boundary
    },
    body: formData
  }).then(async response => {
    if (response.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('biocare_user');
      window.location.href = '/login';
      throw new Error('Sesión expirada');
    }
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error ${response.status}`);
    }
    
    return await response.json();
  });
}

  // ✅ NOTIFICACIONES: Mejorada con anti-duplicado y animaciones
  static showNotification(message, type = 'info') {
    // Evitar múltiples notificaciones idénticas
    const existing = Array.from(document.querySelectorAll('.api-notification'))
      .find(el => el.textContent === message);
    
    if (existing) return;

    const notification = document.createElement('div');
    notification.className = 'api-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      border-radius: 8px;
      color: white;
      z-index: 10000;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      background: ${type === 'error' ? '#E30613' : 
                   type === 'success' ? '#00A651' : 
                   type === 'warning' ? '#FF9800' : '#049DD9'};
      border-left: 5px solid white;
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease;
      max-width: 300px;
      cursor: pointer;
    `;
    notification.textContent = message;

    // Animación de entrada
    document.body.appendChild(notification);
    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateX(0)';
    }, 100);

    // Eliminar con fade-out
    const remove = () => {
      if (!notification.parentNode) return;
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    };

    // Auto-eliminar después de 4 segundos
    const timeout = setTimeout(remove, 4000);

    // Permitir cerrar al hacer clic
    notification.addEventListener('click', () => {
      clearTimeout(timeout);
      remove();
    });
  }
}