// frontend/js/perfil.js
const { createApp, ref, computed } = Vue;

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
    const user = ref(null);
    const tareas = ref([]);
    const historial = ref({ creadas: 0, asignadas: 0, completadas: 0, vencidas: 0 });

    // Obtener usuario del localStorage
    const userData = localStorage.getItem('biocare_user');
    if (!userData) {
      window.location.href = '/login';
    } else {
      user.value = JSON.parse(userData);
    }

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
        historial.value.vencidas = tareasAsignadas.filter(t => t.status !== 'completada' && new Date(t.due_date) < new Date()).length;
      } catch (err) {
        console.error('Error al cargar tareas:', err);
        if (err.message.includes('401')) {
          alert('Sesión expirada. Por favor inicia sesión nuevamente.');
          logout();
        }
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
      if (!isoDate) return '';
      const date = new Date(isoDate);
      return date.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
    };

    const logout = () => {
      localStorage.removeItem('biocare_user');
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    };

    cargarTareas();

    return {
      user,
      tareasAsignadas,
      tareasCreadas,
      historial,
      formatDate,
      logout
    };
  }
}).mount('#app');