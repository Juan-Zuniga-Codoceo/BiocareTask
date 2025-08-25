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
        // Token inválido o expirado
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

  static async upload(url, formData) {
    const token = localStorage.getItem('auth_token');
    return this.request(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
  }
}