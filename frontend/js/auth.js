// frontend/js/auth.js
const { createApp, ref } = Vue;

// === LOGIN ===
if (document.getElementById('login-app')) {
  createApp({
    setup() {
      const email = ref('');
      const password = ref('');
      const loading = ref(false);
      const error = ref('');

      const login = async () => {
        error.value = '';
        loading.value = true;

        try {
          const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.value, password: password.value })
          });
          
          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Error en login');
          }
          
          const data = await res.json();
          
          // Guardar tanto el usuario como el token (usamos el ID como token)
          localStorage.setItem('biocare_user', JSON.stringify(data));
          localStorage.setItem('auth_token', data.id.toString());
          
          window.location.href = '/tablero';
        } catch (err) {
          error.value = err.message || 'Error de conexión. Intenta nuevamente.';
          console.error('Error en login:', err);
        } finally {
          loading.value = false;
        }
      };

      return { email, password, loading, error, login };
    }
  }).mount('#login-app');
}

// === REGISTRO ===
if (document.getElementById('register-app')) {
  createApp({
    setup() {
      const name = ref('');
      const email = ref('');
      const password = ref('');
      const office = ref('');
      const loading = ref(false);
      const error = ref('');
      const success = ref('');

      const registrar = async () => {
        error.value = '';
        success.value = '';
        loading.value = true;

        try {
          const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              name: name.value, 
              email: email.value, 
              password: password.value, 
              office: office.value 
            })
          });
          
          const data = await res.json();
          
          if (res.ok) {
            success.value = 'Cuenta creada. Redirigiendo al login...';
            setTimeout(() => {
              window.location.href = '/login';
            }, 2000);
          } else {
            error.value = data.error || 'No se pudo crear la cuenta';
          }
        } catch (err) {
          error.value = 'Error de conexión. Intenta nuevamente.';
          console.error('Error en registro:', err);
        } finally {
          loading.value = false;
        }
      };

      return { name, email, password, office, loading, error, success, registrar };
    }
  }).mount('#register-app');
}