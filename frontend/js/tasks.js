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

    // === NUEVO: Variable separada para nueva etiqueta ===
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
        resumen.value = resumenData || { vencidas: 0, proximas: 0, total_pendientes: 0 };
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

    // ✅ SUBIDA DE ARCHIVO MEJORADA
    if (archivoAdjunto.value && result.id) {
      try {
        const formData = new FormData();
        formData.append('file', archivoAdjunto.value);
        formData.append('task_id', result.id.toString()); // ✅ Asegurar que es string
        formData.append('file_name', archivoAdjunto.value.name);
        
        console.log('Subiendo archivo:', {
          name: archivoAdjunto.value.name,
          size: archivoAdjunto.value.size,
          type: archivoAdjunto.value.type
        });
        
        await API.upload('/api/upload', formData);
        console.log('Archivo subido exitosamente');
      } catch (uploadError) {
        console.error('Error detallado al subir archivo:', uploadError);
        showError('⚠️ Tarea creada, pero no se pudo subir el archivo');
      }
    }


    // ✅ Comentario inicial (solo si existe)
    if (newTask.value.comentario_inicial && newTask.value.comentario_inicial.trim()) {
      try {
        await API.post('/api/tasks/comments', {
          task_id: result.id,
          contenido: newTask.value.comentario_inicial.trim()
        });
      } catch (commentError) {
        console.warn('Error al crear comentario:', commentError);
        // No romper el flujo principal
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
    // ✅ ENVIAR SOLO LOS CAMPOS REQUERIDOS
    const response = await API.post('/api/labels', {
      name: nuevaEtiqueta.value.trim()
      // ⚠️ NO enviar created_by - el backend lo obtiene de req.userId
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
      return task.label_names.split(', ').filter(label => label.trim() !== '');
    };

    // === Computed: Filtros de tareas ===
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

    const tareasPendientes = computed(() => {
      return tareasFiltradas.value.filter(t => t.status === 'pendiente');
    });

    const tareasEnCamino = computed(() => {
      return tareasFiltradas.value.filter(t => t.status === 'en_camino');
    });

    const tareasCompletadas = computed(() => {
      return tareasFiltradas.value.filter(t => t.status === 'completada');
    });

    // === Notificaciones ===
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

    // === Utilidades ===
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
      const priorities = { 'alta': 'Alta', 'media': 'Media', 'baja': 'Baja' };
      return priorities[priority] || priority;
    };

    const getFileSize = (bytes) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
        showError('❌ Error al descargar archivo: ' + err.message);
      }
    };

    // === Montado ===
    onMounted(() => {
      cargarDatos();
    });

    return {
      // Estado
      user, tasks, users, labels, resumen,
      misTareas, filtroFecha, showModal, tareaSeleccionada,
      creandoTarea, newTask, nuevaEtiqueta, nuevoComentario,
      archivoAdjunto, notificaciones, mostrarNotificaciones,
      notificacionesPendientes, loading, error,

      // Acciones
      logout, cargarDatos, crearTarea, crearEtiqueta,
      agregarComentario, handleFileUpload, removeFile,
      verDetalles, downloadFile, toggleNotifications,
      marcarComoLeida,

      // Funciones de estado
      moverACamino: (id) => cambiarEstadoTarea(id, 'en_camino'),
      completar: (id) => cambiarEstadoTarea(id, 'completada'),

      // Computed
      tareasPendientes, tareasEnCamino, tareasCompletadas,

      // Utilidades
      formatDate, getColor, getPriorityText, getLabelsArray, getFileSize
    };
  }
}).mount('#app');