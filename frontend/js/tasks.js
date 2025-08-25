// frontend/js/tasks.js
const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    // Estado
    const user = ref(null);
    const tasks = ref([]);
    const users = ref([]);
    const labels = ref([]);
    const resumen = ref({ vencidas: 0, proximas: 0, total_pendientes: 0 });
    const misTareas = ref(false);
    const filtroFecha = ref('');
    const showModal = ref(false);
    const tareaSeleccionada = ref(null);
    const creandoTarea = ref(false);
    const loading = ref(true);
    const error = ref('');

    // Nueva tarea
    const newTask = ref({
      title: '',
      description: '',
      due_date: '',
      priority: 'media',
      assigned_to: [],
      label_ids: [],
      file_path: ''
    });

    // Nueva etiqueta
    const nuevaEtiqueta = ref('');
    const archivoAdjunto = ref(null);

    // Cargar datos del usuario
    const userData = localStorage.getItem('biocare_user');
    if (!userData) {
      window.location.href = '/login';
    } else {
      user.value = JSON.parse(userData);
    }

    const logout = () => {
      localStorage.removeItem('biocare_user');
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    };

    const cargarDatos = async () => {
      try {
        loading.value = true;
        error.value = '';
        
        const [tasksData, usersData, labelsData, resumenData] = await Promise.all([
          API.get('/api/tasks'),
          API.get('/api/users'),
          API.get('/api/labels'),
          API.get('/api/tasks/resumen')
        ]);
        
        tasks.value = tasksData || [];
        users.value = usersData || [];
        labels.value = labelsData || [];
        resumen.value = resumenData || { vencidas: 0, proximas: 0, total_pendientes: 0 };
        
      } catch (err) {
        console.error('Error al cargar datos:', err);
        error.value = err.message || 'Error al cargar datos';
        
        if (err.message.includes('Sesión expirada')) {
          logout();
        }
      } finally {
        loading.value = false;
      }
    };

    const handleFileUpload = (event) => {
      const file = event.target.files[0];
      if (file) {
        archivoAdjunto.value = file;
        newTask.value.file_path = file.name;
      }
    };

    const removeFile = () => {
      archivoAdjunto.value = null;
      newTask.value.file_path = '';
      document.getElementById('fileInput').value = '';
    };

    const crearTarea = async () => {
      if (!newTask.value.title.trim()) {
        alert('El título es obligatorio');
        return;
      }
      
      if (!newTask.value.due_date) {
        alert('La fecha de entrega es obligatoria');
        return;
      }
      
      creandoTarea.value = true;
      
      try {
        const taskData = {
          title: newTask.value.title.trim(),
          description: newTask.value.description || '',
          due_date: newTask.value.due_date,
          priority: newTask.value.priority || 'media',
          assigned_to: newTask.value.assigned_to || [],
          label_ids: newTask.value.label_ids || []
        };

        const result = await API.post('/api/tasks', taskData);
        
        // Subir archivo si existe
        if (archivoAdjunto.value && result.id) {
          await subirArchivo(result.id);
        }
        
        showModal.value = false;
        resetForm();
        await cargarDatos();
        alert('Tarea creada exitosamente');
        
      } catch (err) {
        console.error('Error al crear tarea:', err);
        alert('Error: ' + (err.message || 'No se pudo crear la tarea'));
      } finally {
        creandoTarea.value = false;
      }
    };
    
    const subirArchivo = async (taskId) => {
      try {
        const formData = new FormData();
        formData.append('file', archivoAdjunto.value);
        formData.append('task_id', taskId);
        formData.append('file_name', archivoAdjunto.value.name);

        await API.upload('/api/upload', formData);
      } catch (err) {
        console.error('Error al subir archivo:', err);
        alert('Error al subir archivo: ' + err.message);
      }
    };
    
    const resetForm = () => {
      newTask.value = {
        title: '',
        description: '',
        due_date: '',
        priority: 'media',
        assigned_to: [],
        label_ids: [],
        file_path: ''
      };
      nuevaEtiqueta.value = '';
      archivoAdjunto.value = null;
      const fileInput = document.getElementById('fileInput');
      if (fileInput) fileInput.value = '';
    };

    const crearEtiqueta = async () => {
      if (!nuevaEtiqueta.value.trim()) {
        alert('El nombre de la etiqueta es obligatorio');
        return;
      }
      
      try {
        await API.post('/api/labels', { 
          name: nuevaEtiqueta.value.trim()
        });
        
        nuevaEtiqueta.value = '';
        await cargarDatos();
        alert('Etiqueta creada exitosamente');
      } catch (err) {
        alert('Error: ' + (err.message || 'No se pudo crear la etiqueta'));
      }
    };

    const cambiarEstadoTarea = async (id, nuevoEstado) => {
      try {
        await API.put(`/api/tasks/${id}/status`, { status: nuevoEstado });
        await cargarDatos();
      } catch (err) {
        alert('Error: ' + (err.message || 'No se pudo actualizar la tarea'));
      }
    };

    const verDetalles = async (task) => {
      try {
        const attachments = await API.get(`/api/attachments/task/${task.id}`);
        task.attachments = attachments || [];
      } catch (err) {
        console.error('Error al cargar adjuntos:', err);
        task.attachments = [];
      }
      tareaSeleccionada.value = task;
    };

    const getLabelsArray = (task) => {
      if (!task.label_names) return [];
      return typeof task.label_names === 'string' 
        ? task.label_names.split(', ').filter(label => label.trim() !== '')
        : [];
    };

    // Computed properties con validaciones
    const tareasFiltradas = computed(() => {
      if (!Array.isArray(tasks.value)) return [];
      
      let filtered = [...tasks.value];
      
      if (misTareas.value && user.value) {
        filtered = filtered.filter(t =>
          (t.assigned_names && t.assigned_names.includes(user.value.name)) ||
          t.created_by === user.value.id
        );
      }
      
      if (filtroFecha.value) {
        filtered = filtered.filter(t =>
          t.due_date && t.due_date.startsWith(filtroFecha.value)
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
      try {
        const date = new Date(isoDate);
        return date.toLocaleString('es-CL', {
          dateStyle: 'short',
          timeStyle: 'short'
        });
      } catch {
        return isoDate;
      }
    };

    const getColor = (labelName) => {
      const colors = {
        'Entrega': '#049DD9', 'Express': '#04B2D9', 'Factura': '#97BF04',
        'Santiago': '#83A603', 'Valparaíso': '#049DD9', 'Viña del Mar': '#04B2D9',
        'Prioritaria': '#E30613', 'Urgente': '#E30613', 'Reunión': '#9C27B0',
        'Documentación': '#607D8B', 'Cliente': '#FF9800'
      };
      return colors[labelName] || '#049DD9';
    };

    const getPriorityText = (priority) => {
      const priorities = {
        'alta': 'Alta', 'media': 'Media', 'baja': 'Baja'
      };
      return priorities[priority] || priority;
    };

    const downloadFile = async (attachment) => {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`/api/download/${attachment.file_path}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response.ok) throw new Error('Error al descargar');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = attachment.file_name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => window.URL.revokeObjectURL(url), 100);
      } catch (err) {
        alert('Error al descargar: ' + err.message);
      }
    };

    // Cargar datos cuando el componente se monta
    onMounted(() => {
      cargarDatos();
    });

    return {
      user,
      tasks,
      users,
      labels,
      resumen,
      misTareas,
      filtroFecha,
      showModal,
      tareaSeleccionada,
      creandoTarea,
      newTask,
      nuevaEtiqueta,
      archivoAdjunto,
      loading,
      error,
      tareasPendientes,
      tareasEnCamino,
      tareasCompletadas,
      logout,
      cargarDatos,
      crearTarea,
      crearEtiqueta,
      moverACamino: (id) => cambiarEstadoTarea(id, 'en_camino'),
      completar: (id) => cambiarEstadoTarea(id, 'completada'),
      verDetalles,
      handleFileUpload,
      removeFile,
      getLabelsArray,
      formatDate,
      getColor,
      getPriorityText,
      downloadFile
    };
  }
}).mount('#app');