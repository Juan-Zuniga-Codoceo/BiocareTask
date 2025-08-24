const { createApp, ref } = Vue;

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

      // Validación básica
      if (!name.value.trim()) {
        error.value = 'El nombre es obligatorio';
        loading.value = false;
        return;
      }
      if (!email.value.includes('@')) {
        error.value = 'Correo inválido';
        loading.value = false;
        return;
      }
      if (password.value.length < 6) {
        error.value = 'La contraseña debe tener al menos 6 caracteres';
        loading.value = false;
        return;
      }
      if (!office.value) {
        error.value = 'Selecciona una oficina';
        loading.value = false;
        return;
      }

      try {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: name.value,
            email: email.value,
            password: password.value,
            office: office.value
          })
        });

        const data = await res.json();

        if (res.ok) {
          success.value = 'Cuenta creada con éxito. Redirigiendo al login...';
          setTimeout(() => {
            window.location.href = 'login.html';
          }, 2000);
        } else {
          error.value = data.error || 'No se pudo crear la cuenta';
        }
      } catch (err) {
        error.value = 'Error de conexión. Intenta nuevamente.';
        console.error('Error al registrar:', err);
      } finally {
        loading.value = false;
      }
    };

    return {
      name,
      email,
      password,
      office,
      loading,
      error,
      success,
      registrar
    };
  }
}).mount('#app');