// frontend/js/perfil.js
const { createApp, ref, computed, onMounted } = Vue;

// Función auxiliar para hacer fetch con autenticación
const authFetch = async (url, options = {}) => {
  const token = localStorage.getItem('auth_token');
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
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

  return fetch(url, mergedOptions);
};

createApp({
  setup() {
    const user = ref({});
    const tareas = ref([]);
    const historial = ref({ creadas: 0, asignadas: 0, completadas: 0, vencidas: 0 });
    const uploading = ref(false);

    // Obtener usuario del localStorage
    const userData = localStorage.getItem('biocare_user');
    if (!userData) {
      window.location.href = '/login';
    } else {
      user.value = JSON.parse(userData);
    }

    // Computed para el estilo del avatar
    const avatarStyle = computed(() => {
      if (user.value.avatar_url) {
        return {
          'background-image': `url('${user.value.avatar_url}')`,
          'background-size': 'cover',
          'background-position': 'center'
        };
      }
      return {
        'background-color': '#04B2D9'
      };
    });

    const cargarTareas = async () => {
      try {
        const [asignadasRes, creadasRes] = await Promise.all([
          authFetch(`/api/tasks?assigned_to=${user.value.id}`),
          authFetch(`/api/tasks?created_by=${user.value.id}`)
        ]);

        if (!asignadasRes.ok || !creadasRes.ok) {
          throw new Error('Error al cargar tareas');
        }

        const tareasAsignadas = await asignadasRes.json();
        const tareasCreadas = await creadasRes.json();

        tareas.value = [...tareasAsignadas, ...tareasCreadas];

        historial.value.asignadas = tareasAsignadas.length;
        historial.value.creadas = tareasCreadas.length;
        historial.value.completadas = tareasAsignadas.filter(t => t.status === 'completada').length;

        // Calcular tareas vencidas (pendientes con fecha pasada)
        historial.value.vencidas = tareasAsignadas.filter(t =>
          t.status !== 'completada' &&
          t.due_date &&
          new Date(t.due_date) < new Date()
        ).length;
      } catch (err) {
        console.error('Error al cargar tareas:', err);
        if (err.message.includes('401')) {
          alert('Sesión expirada. Por favor inicia sesión nuevamente.');
          logout();
        }
      }
    };

    const handleAvatarUpload = async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      // Validaciones frontend
      if (!file.type.startsWith('image/')) {
        alert('Por favor selecciona una imagen válida (JPEG, PNG, GIF)');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        alert('La imagen debe ser menor a 5MB');
        return;
      }

      uploading.value = true;

      try {
        const formData = new FormData();
        formData.append('avatar', file);

        const res = await fetch('/api/user/avatar', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: formData
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Error al subir la imagen');
        }

        // Actualizar avatar y datos del usuario
        user.value = { ...user.value, ...data.user };

        // Actualizar localStorage
        localStorage.setItem('biocare_user', JSON.stringify(user.value));

        alert('Foto de perfil actualizada correctamente');
      } catch (err) {
        console.error('Error al subir avatar:', err);
        alert(err.message || 'Error al subir la imagen. Intenta nuevamente.');
      } finally {
        uploading.value = false;
        event.target.value = '';
      }
    };

    const tareasAsignadas = computed(() => {
      return tareas.value.filter(t =>
        t.assigned_names?.includes(user.value.name) && t.created_by !== user.value.id
      );
    });

    const tareasCreadas = computed(() => {
      return tareas.value.filter(t => t.created_by === user.value.id);
    });

    const formatDate = (isoDate) => {
      if (!isoDate) return 'No especificada';
      try {
        const date = new Date(isoDate);
        return date.toLocaleString('es-CL', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch {
        return isoDate;
      }
    };

    const logout = () => {
      localStorage.removeItem('biocare_user');
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    };

    // Cargar datos cuando el componente se monta
    onMounted(() => {
      cargarTareas();
    });

    return {
      user,
      tareasAsignadas,
      tareasCreadas,
      historial,
      uploading,
      avatarStyle,
      formatDate,
      logout,
      handleAvatarUpload
    };
  }
}).mount('#app');