// frontend/js/tasks.js
const { createApp, ref, computed, onMounted } = Vue;
createApp({
  setup() {
    // === Estado del usuario y tareas ===
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

    // Estado para el menú desplegable del usuario
    const showDropdown = ref(false);
    const toggleDropdown = () => {
      showDropdown.value = !showDropdown.value;
    };

    // === Nueva tarea ===
    const newTask = ref({
      title: '',
      description: '',
      due_date: '',
      priority: 'media',
      assigned_to: [],
      label_ids: [],
      comentario_inicial: ''
    });

    // === Variable separada para nueva etiqueta ===
    const nuevaEtiqueta = ref('');

    // === Comentarios ===
    const nuevoComentario = ref('');

    // === Notificaciones ===
    const notificaciones = ref([]);
    const mostrarNotificaciones = ref(false);
    const notificacionesPendientes = computed(() => {
      return notificaciones.value.filter(n => !n.leida).length;
    });

    // === Archivo adjunto ===
    const archivoAdjunto = ref(null);
    
    // === Cargar usuario desde localStorage ===
    const userData = localStorage.getItem('biocare_user');
    if (!userData) {
      window.location.href = '/login';
    } else {
      user.value = JSON.parse(userData);
    }

    // === Funciones principales ===
    const logout = () => {
      localStorage.removeItem('biocare_user');
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    };

    const cargarDatos = async () => {
      try {
        loading.value = true;
        error.value = '';

        const [tasksData, usersData, labelsData, resumenData, notifData] = await Promise.all([
          API.get('/api/tasks'),
          API.get('/api/users'),
          API.get('/api/labels'),
          API.get('/api/tasks/resumen'),
          API.get('/api/notifications').catch(() => [])
        ]);
        tasks.value = tasksData || [];
        users.value = usersData || [];
        labels.value = labelsData || [];
        resumen.value = resumenData ||
        { vencidas: 0, proximas: 0, total_pendientes: 0 };
        notificaciones.value = notifData || [];
      } catch (err) {
        console.error('Error al cargar datos:', err);
        showError('No se pudieron cargar los datos. Revisa tu conexión.');
      } finally {
        loading.value = false;
      }
    };

    const showError = (message) => {
      API.showNotification(message, 'error');
    };
    const showSuccess = (message) => {
      API.showNotification(message, 'success');
    };
    const crearTarea = async () => {
      if (!newTask.value.title.trim()) {
        showError('El título es obligatorio');
        return;
      }
      if (!newTask.value.due_date) {
        showError('La fecha de entrega es obligatoria');
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

        if (archivoAdjunto.value && result.id) {
          try {
            const formData = new FormData();
            formData.append('file', archivoAdjunto.value);
            formData.append('task_id', result.id.toString());
            formData.append('file_name', archivoAdjunto.value.name);
            await API.upload('/api/upload', formData);
          } catch (uploadError) {
            console.error('Error detallado al subir archivo:', uploadError);
            showError('⚠️ Tarea creada, pero no se pudo subir el archivo');
          }
        }

        if (newTask.value.comentario_inicial && newTask.value.comentario_inicial.trim()) {
          try {
            await API.post('/api/tasks/comments', {
              task_id: result.id,
              contenido: newTask.value.comentario_inicial.trim()
            });
          } catch (commentError) {
            console.warn('Error al crear comentario:', commentError);
          }
        }

        showModal.value = false;
        resetForm();
        await cargarDatos();
        showSuccess('✅ Tarea creada exitosamente');

      } catch (err) {
        showError('❌ Error al crear la tarea: ' + (err.message || ''));
      } finally {
        creandoTarea.value = false;
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
        comentario_inicial: ''
      };
      nuevaEtiqueta.value = '';
      nuevoComentario.value = '';
      archivoAdjunto.value = null;
      const fileInput = document.getElementById('fileInput');
      if (fileInput) fileInput.value = '';
    };

    const handleFileUpload = (event) => {
      const file = event.target.files[0];
      if (file) {
        if (file.size > 10 * 1024 * 1024) {
          showError('El archivo no debe exceder 10MB');
          event.target.value = '';
          return;
        }
        archivoAdjunto.value = file;
      }
    };

    const removeFile = () => {
      archivoAdjunto.value = null;
      document.getElementById('fileInput').value = '';
    };

    const crearEtiqueta = async () => {
      if (!nuevaEtiqueta.value.trim()) {
        showError('El nombre de la etiqueta es obligatorio');
        return;
      }

      try {
        await API.post('/api/labels', {
          name: nuevaEtiqueta.value.trim()
        });
        nuevaEtiqueta.value = '';
        await cargarDatos();
        showSuccess('🏷️ Etiqueta creada exitosamente');
      } catch (err) {
        console.error('Error detallado al crear etiqueta:', err);
        showError('❌ No se pudo crear la etiqueta: ' + (err.message || 'Verifica los datos'));
      }
    };

    const cambiarEstadoTarea = async (id, nuevoEstado) => {
      try {
        await API.put(`/api/tasks/${id}/status`, { status: nuevoEstado });
        await cargarDatos();
        showSuccess(`🔄 Tarea marcada como "${nuevoEstado}"`);
      } catch (err) {
        showError('❌ Error al actualizar la tarea: ' + err.message);
      }
    };

    const verDetalles = async (task) => {
      try {
        const [attachments, comments] = await Promise.all([
          API.get(`/api/attachments/task/${task.id}`).catch(() => []),
          API.get(`/api/tasks/${task.id}/comments`).catch(() => [])
        ]);
        task.attachments = attachments;
        task.comentarios = comments;
        task.comentarios_count = comments.length;
      } catch (err) {
        console.error('Error al cargar detalles:', err);
        task.attachments = [];
        task.comentarios = [];
      }
      tareaSeleccionada.value = task;
    };

    const agregarComentario = async () => {
      if (!nuevoComentario.value.trim() || !tareaSeleccionada.value) return;
      try {
        await API.post('/api/tasks/comments', {
          task_id: tareaSeleccionada.value.id,
          contenido: nuevoComentario.value.trim(),
          autor_id: user.value.id
        });
        tareaSeleccionada.value.comentarios.push({
          id: Date.now(),
          contenido: nuevoComentario.value.trim(),
          autor_nombre: user.value.name,
          autor_id: user.value.id,
          fecha_creacion: new Date().toISOString()
        });
        tareaSeleccionada.value.comentarios_count++;
        nuevoComentario.value = '';
        showSuccess('💬 Comentario agregado');
      } catch (err) {
        showError('❌ Error al agregar comentario: ' + err.message);
      }
    };

    const getLabelsArray = (task) => {
      if (!task?.label_names) return [];
      return task.label_names.split(',').map(label => label.trim()).filter(Boolean);
    };

    const tareasFiltradas = computed(() => {
      if (!Array.isArray(tasks.value)) return [];

      return tasks.value.filter(t => {
        let match = true;
        if (misTareas.value && user.value) {
          match = (t.assigned_names?.includes(user.value.name)) || t.created_by === user.value.id;
        }
        if (filtroFecha.value) {
          match = match && t.due_date?.startsWith(filtroFecha.value);
        }
        return match;
      });
    });

    const tareasPendientes = computed(() => tareasFiltradas.value.filter(t => t.status === 'pendiente'));
    const tareasEnCamino = computed(() => tareasFiltradas.value.filter(t => t.status === 'en_camino'));
    const tareasCompletadas = computed(() => tareasFiltradas.value.filter(t => t.status === 'completada'));
    
    const toggleNotifications = () => {
      mostrarNotificaciones.value = !mostrarNotificaciones.value;
    };

    const marcarComoLeida = async (id) => {
      try {
        await API.put(`/api/notifications/${id}/read`);
        const notif = notificaciones.value.find(n => n.id === id);
        if (notif) notif.leida = true;
        showSuccess('Notificación marcada como leída');
      } catch (err) {
        showError('Error al marcar como leída');
      }
    };

    // === Utilidades de formato ===
    const formatDate = (isoDate) => {
      if (!isoDate) return 'No especificada';
      try {
        // Formato mejorado para incluir la hora
        return new Date(isoDate).toLocaleString('es-CL', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch {
        return isoDate;
      }
    };

    // ▼▼▼ FUNCIÓN DE COLOR MEJORADA ▼▼▼
    const getColor = (labelName) => {
      const predefinedColors = {
        'Entrega': '#049DD9', 'Express': '#3498DB', 'Factura': '#97BF04',
        'Valparaíso': '#F39C12', 'Viña del Mar': '#E67E22', 'Quilpué': '#16A085',
        'Prioritaria': '#E74C3C', 'Urgente': '#C0392B'
      };
      
      if (predefinedColors[labelName]) {
        return predefinedColors[labelName];
      }

      // Paleta de colores por defecto con buen contraste para texto blanco
      const defaultColors = ['#2980B9', '#27AE60', '#8E44AD', '#2C3E50', '#7F8C8D'];
      let hash = 0;
      for (let i = 0; i < labelName.length; i++) {
        hash = labelName.charCodeAt(i) + ((hash << 5) - hash);
      }
      return defaultColors[Math.abs(hash) % defaultColors.length];
    };

    const getPriorityText = (priority) => {
      const priorities = { 'alta': 'Alta', 'media': 'Media', 'baja': 'Baja' };
      return priorities[priority] || priority;
    };

    const getFileSize = (bytes) => {
      if (!bytes || bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const downloadFile = async (attachment) => {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`/api/download/${attachment.file_path}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('No se pudo iniciar la descarga');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = attachment.file_name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } catch (err) {
        showError('❌ Error al descargar archivo: ' + err.message);
      }
    };

    // === Carga inicial de datos al montar el componente ===
    onMounted(() => {
      cargarDatos();
    });

    // === Exponer todo a la plantilla HTML ===
    return {
      user, tasks, users, labels, resumen,
      misTareas, filtroFecha, showModal, tareaSeleccionada,
      creandoTarea, newTask, nuevaEtiqueta, nuevoComentario,
      archivoAdjunto, notificaciones, mostrarNotificaciones,
      notificacionesPendientes, loading, error,
      showDropdown,
      toggleDropdown,
      logout, cargarDatos, crearTarea, crearEtiqueta,
      agregarComentario, handleFileUpload, removeFile,
      verDetalles, downloadFile, toggleNotifications,
      marcarComoLeida,
      moverACamino: (id) => cambiarEstadoTarea(id, 'en_camino'),
      completar: (id) => cambiarEstadoTarea(id, 'completada'),
      tareasPendientes, tareasEnCamino, tareasCompletadas,
      formatDate, getColor, getPriorityText, getLabelsArray, getFileSize
    };
  }
}).mount('#app');