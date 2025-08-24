// js/auth.js
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
          const data = await res.json();

          if (res.ok) {
            localStorage.setItem('biocare_user', JSON.stringify(data));
            window.location.href = '/tablero';
          } else {
            error.value = data.error || 'Usuario o clave incorrectos';
          }
        } catch (err) {
          error.value = 'Error de conexión. Intenta nuevamente.';
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

        if (!name.value || !email.value || !password.value || !office.value) {
          error.value = 'Todos los campos son obligatorios';
          loading.value = false;
          return;
        }

        try {
          const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.value, email: email.value, password: password.value, office: office.value })
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
          error.value = 'Error de conexión';
        } finally {
          loading.value = false;
        }
      };

      return { name, email, password, office, loading, error, success, registrar };
    }
  }).mount('#register-app');
}