const { createApp, ref, computed } = Vue;

createApp({
  setup() {
    // Estado
    const user = ref(null);
    const email = ref('');
    const password = ref('');
    const loading = ref(false);
    const tasks = ref([]);
    const users = ref([]);
    const labels = ref([]);
    const resumen = ref({ vencidas: 0, proximas: 0, total_pendientes: 0 });
    const misTareas = ref(false);
    const filtroFecha = ref('');
    const showModal = ref(false);
    const mostrarRegistro = ref(false);

    // Registro
    const registro = ref({
      email: '',
      password: '',
      name: '',
      office: ''
    });

    // Nueva tarea
    const newTask = ref({
      title: '',
      description: '',
      due_date: '',
      priority: 'media',
      assigned_to: [],
      label_ids: []
    });

    // Nueva etiqueta
    const nuevaEtiqueta = ref('');

    // Funciones auxiliares
    const getPriorityText = (priority) => {
      switch(priority) {
        case 'alta': return 'Alta';
        case 'media': return 'Media';
        case 'baja': return 'Baja';
        default: return '';
      }
    };

    const getPriorityClass = (priority) => {
      return priority;
    };

    const getColor = (labelName) => {
      const colors = {
        'Entrega': '#006837',
        'Express': '#00A651',
        'Factura': '#00BFFF',
        'Santiago': '#FF6B6B',
        'Valparaíso': '#FFD166',
        'Viña del Mar': '#6C5CE7'
      };
      return colors[labelName] || '#00A651';
    };

    // === FUNCIONES ===

    const login = async () => {
      loading.value = true;
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.value, password: password.value })
        });
        const data = await res.json();
        if (res.ok) {
          user.value = data;
          cargarDatos();
        } else {
          alert(data.error || 'Error en login');
        }
      } catch (err) {
        alert('Error de conexión');
      } finally {
        loading.value = false;
      }
    };

    const logout = () => {
      user.value = null;
      email.value = '';
      password.value = '';
    };

    const registrar = async () => {
      if (!registro.value.email || !registro.value.password || !registro.value.name) {
        alert('Por favor completa todos los campos');
        return;
      }
      try {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registro.value)
        });
        if (res.ok) {
          mostrarRegistro.value = false;
          alert('Cuenta creada exitosamente. Puedes iniciar sesión.');
        } else {
          const err = await res.json();
          alert('Error: ' + (err.error || 'No se pudo crear la cuenta'));
        }
      } catch (err) {
        alert('Error de conexión');
      }
    };

    const cargarDatos = async () => {
      try {
        const [tasksRes, usersRes, labelsRes, resumenRes] = await Promise.all([
          fetch('/api/tasks'),
          fetch('/api/users'),          fetch('/api/labels'),          fetch('/api/tasks/resumen')
        ]);
        tasks.value = await tasksRes.json();
        users.value = await usersRes.json();
        labels.value = await labelsRes.json();
        resumen.value = await resumenRes.json();
      } catch (err) {
        console.error('Error al cargar datos:', err);
      }
    };

    const crearTarea = async () => {
      const taskData = {
        ...newTask.value,
        created_by: user.value.id
      };

      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(taskData)
        });
        if (res.ok) {
          showModal.value = false;
          newTask.value = { title: '', description: '', due_date: '', priority: 'media', assigned_to: [], label_ids: [] };
          cargarDatos();
        } else {
          const err = await res.json();
          alert('Error: ' + (err.error || 'No se pudo crear'));
        }
      } catch (err) {
        alert('Error de conexión');
      }
    };

    const crearEtiqueta = async () => {
      if (!nuevaEtiqueta.value.trim()) return;
      try {
        const res = await fetch('/api/labels', {
          method: 'POST',          headers: { 'Content-Type': 'application/json' },          body: JSON.stringify({ name: nuevaEtiqueta.value.trim(), created_by: user.value.id })
        });
        if (res.ok) {
          nuevaEtiqueta.value = '';
          cargarDatos();
        } else {
          alert('Error al crear etiqueta');
        }
      } catch (err) {
        alert('Error de conexión');
      }
    };

    const agregarEtiqueta = (id) => {
      if (!newTask.value.label_ids.includes(id)) {
        newTask.value.label_ids.push(id);
      }
    };

    const moverACamino = async (id) => {
      try {
        const res = await fetch(`/api/tasks/${id}/status`, {
          method: 'PUT',          headers: { 'Content-Type': 'application/json' },          body: JSON.stringify({ status: 'en_camino' })
        });
        if (res.ok) {
          cargarDatos();
        } else {
          alert('Error al actualizar');
        }
      } catch (err) {
        alert('Error de conexión');
      }
    };

    const completar = async (id) => {
      try {
        const res = await fetch(`/api/tasks/${id}/status`, {
          method: 'PUT',          headers: { 'Content-Type': 'application/json' },          body: JSON.stringify({ status: 'completada' })
        });
        if (res.ok) {
          cargarDatos();
        } else {
          alert('Error al actualizar');
        }
      } catch (err) {
        alert('Error de conexión');
      }
    };

    // Filtrar tareas
    const tareasFiltradas = computed(() => {
      let filtered = tasks.value;
      if (misTareas.value && user.value) {
        filtered = filtered.filter(t => 
          t.assigned_names?.includes(user.value.name) ||
          t.created_by === user.value.id
        );
      }
      if (filtroFecha.value) {
        filtered = filtered.filter(t => 
          t.due_date.includes(filtroFecha.value)
        );
      }
      return filtered;
    });

    const tareasPendientes = computed(() => {
      return tareasFiltradas.value.filter(t => t.status === 'pendiente');
    });

    const tareasEnCamino = computed(() => {
      return tareasFiltradas.value.filter(t => t.status === 'en_camino');
    });

    const tareasCompletadas = computed(() => {
      return tareasFiltradas.value.filter(t => t.status === 'completada');
    });

    const formatDate = (isoDate) => {
      if (!isoDate) return '';
      const date = new Date(isoDate);
      return date.toLocaleString('es-CL', { 
        dateStyle: 'short', 
        timeStyle: 'short' 
      });
    };

    // Si ya hay sesión, cargar datos
    if (user.value) cargarDatos();

    return {
      user, email, password, loading,
      tasks, users, labels, resumen,
      misTareas, filtroFecha, showModal, mostrarRegistro, registro, nuevaEtiqueta,
      newTask,
      tareasPendientes, tareasEnCamino, tareasCompletadas,
      login, logout, registrar, crearTarea, crearEtiqueta, agregarEtiqueta, moverACamino, completar, formatDate,
      getPriorityText, getPriorityClass, getColor
    };
  }
}).mount('#app');