const { createApp, ref, computed, onMounted, watch } = Vue;

createApp({
  components: {
    'update-modal': UpdateModal
  },
  setup() {
    // ======================================================
    // 1. ESTADO REACTIVO (refs)
    // ======================================================
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
    const showEditModal = ref(false);
    const editTask = ref({});
    const showDeleteConfirm = ref(false);
    const suggestedLabels = ref([]);
    const showDropdown = ref(false);
    const showNewLabelDropdown = ref(false);
    const showLabelDropdown = ref(false);
    const nuevaEtiqueta = ref('');
    const nuevoComentario = ref('');
    const archivosAdjuntos = ref([]);
    const commentAttachments = ref([]);
    const notificaciones = ref([]);
    const mostrarNotificaciones = ref(false);
    const newTaskFp = ref(null);
    const editTaskFp = ref(null);
    const showStateDropdown = ref(false);
    const archivosParaSubirEnEdicion = ref([]);
    const adjuntosParaBorrar = ref([]);
    const newTask = ref({
      title: '', description: '', due_date: '', priority: 'media',
      assigned_to: [], label_ids: [], comentario_inicial: ''
    });
    const keywordToLabelMap = {
      'factura': 'Factura', 'facturas': 'Factura', 'boleta': 'Factura',
      'enviar': 'Entrega', 'entrega': 'Entrega', 'despacho': 'Entrega',
      'express': 'Express', 'urgente': 'Urgente', 'prioridad': 'Prioritaria',
      'valparaíso': 'Valparaíso', 'valpo': 'Valparaíso', 'valparaiso': 'Valparaíso',
      'viña': 'Viña del Mar', 'vina': 'Viña del Mar',
      'quilpué': 'Quilpué', 'quilpue': 'Quilpué',
      'santiago': 'Santiago', 'stgo': 'Santiago',
      'pedido web': 'Pedido Web', 'starken': 'Starken', 'blueexpress': 'BlueExpress',
      'chileexpress': 'ChileExpress', 'bodega': 'Bodega'
    };
    const mostrandoSelectorCreador = ref(false);
    const nuevoCreadorId = ref(null);
    const showMentionList = ref(false);
    const filteredMentionUsers = ref([]);
    const mentionQuery = ref('');
    const mentionNavIndex = ref(-1);
    const showUpdateModal = ref(false);
    const APP_VERSION = "1.2.0";
    const showCompleteModal = ref(false);
    const taskToComplete = ref(null);
    const completionFile = ref(null);
    const closingNote = ref('');
    const isCompleting = ref(false);

    // ======================================================
    // 2. PROPIEDADES COMPUTADAS (computed)
    // ======================================================
    const notificacionesPendientes = computed(() => notificaciones.value.filter(n => !n.leida).length);
    const selectedLabelsInNew = computed(() => labels.value.filter(l => newTask.value.label_ids.includes(l.id)));
    const availableLabelsInNew = computed(() => labels.value.filter(l => !newTask.value.label_ids.includes(l.id)));
    const selectedLabelsInEdit = computed(() => labels.value.filter(l => editTask.value.label_ids.includes(l.id)));
    const availableLabelsInEdit = computed(() => labels.value.filter(l => !editTask.value.label_ids.includes(l.id)));
    const tareasFiltradas = computed(() => {
      if (!Array.isArray(tasks.value)) return [];
      return tasks.value.filter(t => {
        let match = true;
        if (misTareas.value && user.value) {
          const assignedIds = t.assigned_ids ? t.assigned_ids.split(',').map(Number) : [];
          match = assignedIds.includes(user.value.id) || t.created_by === user.value.id;
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
    const selectedUsersInNew = computed(() => users.value.filter(u => newTask.value.assigned_to.includes(u.id)));
    const availableUsersInNew = computed(() => users.value.filter(u => !newTask.value.assigned_to.includes(u.id)));
    const selectedUsersInEdit = computed(() => users.value.filter(u => editTask.value.assigned_to.includes(u.id)));
    const availableUsersInEdit = computed(() => users.value.filter(u => !editTask.value.assigned_to.includes(u.id)));
    const puedeEditarTarea = computed(() => {
      if (!user.value || !tareaSeleccionada.value) return false;
      if (user.value.role === 'admin') {
        return true;
      }

      // Si no es admin, se mantiene la lógica original.
      if (user.value.id === tareaSeleccionada.value.created_by) return true;
      const assignedIds = tareaSeleccionada.value.assigned_ids?.split(',') || [];
      return assignedIds.includes(user.value.id.toString());
    });


    const puedeEliminarTarea = computed(() => {
      if (!user.value || !tareaSeleccionada.value) return false;

      // Si el usuario es 'admin', siempre tiene permiso para eliminar.
      if (user.value.role === 'admin') {
        return true;
      }

      // Si no, solo el creador original puede eliminar.
      return user.value.id === tareaSeleccionada.value.created_by;
    });

    // ======================================================
    // 3. OBSERVADORES (watch)
    // ======================================================
    watch(() => [newTask.value.title, newTask.value.description], ([newTitle, newDesc]) => {
      if (labels.value.length === 0) return;
      const text = newTitle + ' ' + newDesc;
      if (!text.trim()) { suggestedLabels.value = []; return; }
      const foundLabelNames = new Set();
      for (const keyword in keywordToLabelMap) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(text)) { foundLabelNames.add(keywordToLabelMap[keyword]); }
      }
      const alreadySelectedNames = new Set(selectedLabelsInNew.value.map(l => l.name));
      suggestedLabels.value = labels.value.filter(label =>
        foundLabelNames.has(label.name) && !alreadySelectedNames.has(label.name)
      );
    }, { deep: true });
    watch(() => [editTask.value.title, editTask.value.description], ([newTitle, newDesc]) => {
      if (labels.value.length === 0) return;
      if (!showEditModal.value) return;
      const text = newTitle + ' ' + newDesc;
      if (!text.trim()) { suggestedLabels.value = []; return; }
      const foundLabelNames = new Set();
      for (const keyword in keywordToLabelMap) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(text)) { foundLabelNames.add(keywordToLabelMap[keyword]); }
      }
      const alreadySelectedNames = new Set(selectedLabelsInEdit.value.map(l => l.name));
      suggestedLabels.value = labels.value.filter(label =>
        foundLabelNames.has(label.name) && !alreadySelectedNames.has(label.name)
      );
    }, { deep: true });
    watch(showModal, (isVisible) => {
      if (isVisible) {
        Vue.nextTick(() => {
          newTaskFp.value = flatpickr("#new-task-datepicker", {
            allowInput: true,
            enableTime: true, altInput: true, altFormat: "d/m/Y H:i",
            dateFormat: "Y-m-d H:i", minDate: "today", locale: "es", static: true,
            time_24hr: false,
            onChange: (selectedDates, dateStr) => { newTask.value.due_date = dateStr; }
          });
        });
      } else {
        if (newTaskFp.value) {
          newTaskFp.value.destroy();
          newTaskFp.value = null;
        }
        resetForm();
      }
    });
    watch(showEditModal, (isVisible) => {
      if (isVisible) {
        Vue.nextTick(() => {
          const datepickerElement = document.getElementById("edit-task-datepicker");
          if (datepickerElement && !datepickerElement._flatpickr) {
            editTaskFp.value = flatpickr(datepickerElement, {
              enableTime: true,
              altInput: true,
              altFormat: "d/m/Y H:i",
              dateFormat: "Y-m-d H:i",
              minDate: "today",
              locale: "es",
              static: true,
              time_24hr: false,
              allowInput: true,
              defaultDate: editTask.value.due_date,
              onChange: (selectedDates, dateStr) => {
                editTask.value.due_date = dateStr;
              }
            });
          }
        });
      } else if (editTaskFp.value) {
        editTaskFp.value.destroy();
        editTaskFp.value = null;
      }
    });

    // ======================================================
    // 4. FUNCIONES
    // ======================================================
    const toggleDropdown = () => {
      showDropdown.value = !showDropdown.value;
      // Lógica para bloquear/desbloquear el scroll
      if (showDropdown.value) {
        document.body.classList.add('overlay-active');
      } else {
        document.body.classList.remove('overlay-active');
      }
    };
    const handleNotificationClick = async (notificacion) => {
      // Cierra el panel si está abierto
      if (mostrarNotificaciones.value) {
        toggleNotifications();
      }

      // Si la notificación no está asociada a una tarea, no hace nada
      if (!notificacion.task_id) return;

      // Busca la tarea en la lista de tareas ya cargada
      const task = tasks.value.find(t => t.id === notificacion.task_id);

      if (task) {
        // Si la encuentra, muestra los detalles
        await verDetalles(task);
      } else {
        // Si no la encuentra, informa al usuario
        showError('La tarea no se encontró en el tablero actual.');
      }

      // Marca la notificación como leída si no lo estaba
      if (!notificacion.leida) {
        marcarComoLeida(notificacion.id);
      }
    };
    const showError = (message) => { API.showNotification(message, 'error'); };
    const showSuccess = (message) => { API.showNotification(message, 'success'); };
    const toggleStateDropdown = () => {
      showStateDropdown.value = !showStateDropdown.value;
    };
    const setQuickDate = (daysToAdd) => {
      const date = new Date();
      if (daysToAdd === 'eod') {
        date.setHours(18, 0, 0, 0);
      } else {
        date.setDate(date.getDate() + daysToAdd);
      }
      newTask.value.due_date = flatpickr.formatDate(date, "Y-m-d H:i");
      if (newTaskFp.value) {
        newTaskFp.value.setDate(date, false);
      }
    };
    const setQuickEditDate = (daysToAdd) => {
      const date = new Date();
      if (daysToAdd === 'eod') {
        date.setHours(18, 0, 0, 0);
      } else {
        date.setDate(date.getDate() + daysToAdd);
      }
      editTask.value.due_date = flatpickr.formatDate(date, "Y-m-d H:i");
      if (editTaskFp.value) {
        editTaskFp.value.setDate(date, false);
      }
    };

    const setupWebSocket = () => {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
      const wsUrl = wsProtocol + window.location.host;

      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        console.log('✅ Conectado al servidor WebSocket en tiempo real.');
      };

      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'TASK_RESTORED') {
            console.log(`✨ Tarea ${message.taskId} restaurada, actualizando y resaltando...`);
            await cargarDatos(); // Carga los datos para que la tarea aparezca
            highlightTask(message.taskId); // Llama a la nueva función de resaltado
          }
          else if (message.type === 'TASKS_UPDATED') {
            console.log('🔄 Recibida actualización genérica, recargando tablero...');
            cargarDatos();
          }

        } catch (e) {
          console.error('Error al procesar mensaje de WebSocket:', e);
        }
      };

      ws.onclose = () => {
        console.log('🔌 Desconectado del servidor WebSocket. Intentando reconectar en 5 segundos...');
        setTimeout(setupWebSocket, 5000);
      };
      ws.onerror = (error) => {
        console.error('❌ Error de WebSocket:', error);
        ws.close();
      };
    };

    const cargarDatos = async () => {
      try {
        loading.value = true;
        const [tasksData, usersData, labelsData, resumenData, notifData] = await Promise.all([
          API.get('/api/tasks'), API.get('/api/users'), API.get('/api/labels'),
          API.get('/api/tasks/resumen'), API.get('/api/notifications').catch(() => [])
        ]);
        tasks.value = tasksData || [];
        users.value = usersData || [];
        labels.value = labelsData || [];
        resumen.value = resumenData || { vencidas: 0, proximas: 0, total_pendientes: 0 };
        notificaciones.value = notifData || [];
        API.post('/api/tasks/check-due-today');
        return tasksData;
      } catch (err) {
        console.error('Error al cargar datos:', err);
        showError('No se pudieron cargar los datos. Revisa tu conexión.');
      } finally {
        loading.value = false;
      }
    };

    const formatDescription = (text) => {
      if (!text) return '';
      return text.replace(/\n/g, '<br>');
    };

    const userData = sessionStorage.getItem('biocare_user');
    if (!userData) { window.location.href = '/login'; }
    else { user.value = JSON.parse(userData); }

    const logout = () => {
      sessionStorage.removeItem('biocare_user');
      sessionStorage.removeItem('auth_token');
      window.location.href = '/login';
    };

    const abrirModalEditar = () => {
      editTask.value = JSON.parse(JSON.stringify(tareaSeleccionada.value));
      const assignmentNames = tasks.value.find(t => t.id === editTask.value.id)?.assigned_names || '';
      const labelNames = tasks.value.find(t => t.id === editTask.value.id)?.label_names || '';
      const assignmentNameArray = assignmentNames ? assignmentNames.split(',') : [];
      const labelNameArray = labelNames ? labelNames.split(',') : [];
      editTask.value.assigned_to = users.value.filter(u => assignmentNameArray.includes(u.name)).map(u => u.id);
      editTask.value.label_ids = labels.value.filter(l => labelNameArray.includes(l.name)).map(l => l.id);
      archivosParaSubirEnEdicion.value = [];
      adjuntosParaBorrar.value = [];
      tareaSeleccionada.value = null;
      showEditModal.value = true;
    };

    const guardarCambiosTarea = async () => {
      try {
        // 1. Guardar los cambios principales de la tarea (título, descripción, etc.)
        await API.put(`/api/tasks/${editTask.value.id}`, editTask.value);

        // 2. Eliminar los adjuntos marcados (se ejecutan en paralelo)
        if (adjuntosParaBorrar.value.length > 0) {
          await Promise.all(
            adjuntosParaBorrar.value.map(id => API.delete(`/api/attachments/${id}`))
          );
        }

        // 3. Subir los nuevos archivos si los hay
        if (archivosParaSubirEnEdicion.value.length > 0) {
          const formData = new FormData();
          formData.append('task_id', editTask.value.id.toString());
          for (const file of archivosParaSubirEnEdicion.value) {
            formData.append('files', file);
          }
          await API.upload('/api/upload', formData);
        }

        showEditModal.value = false;
        showSuccess('✅ Tarea actualizada correctamente');
        // La vista se actualizará automáticamente gracias al WebSocket
      } catch (err) {
        showError('❌ Error al guardar los cambios: ' + err.message);
      }
    };

    const abrirConfirmarEliminar = () => {
      showDeleteConfirm.value = true;
    };

    const eliminarTarea = async () => {
      try {
        await API.delete(`/api/tasks/${tareaSeleccionada.value.id}`);
        showDeleteConfirm.value = false;
        tareaSeleccionada.value = null;
        showSuccess('🗑️ Tarea eliminada correctamente');
      } catch (err) {
        showError('❌ Error al eliminar la tarea: ' + err.message);
      }
    };

    const crearTarea = async () => {
      if (!newTask.value.title.trim()) {
        return showError('El título es obligatorio');
      }
      if (!newTask.value.due_date) {
        return showError('La fecha de entrega es obligatoria');
      }
      creandoTarea.value = true;
      try {
        const result = await API.post('/api/tasks', newTask.value);
        if (archivosAdjuntos.value.length > 0 && result.id) {
          const formData = new FormData();
          formData.append('task_id', result.id.toString());
          // Usamos 'files' (plural) que coincide con el backend
          for (const file of archivosAdjuntos.value) {
            formData.append('files', file);
          }
          await API.upload('/api/upload', formData);
        }
        showModal.value = false;
        showSuccess('✅ Tarea creada exitosamente');
      } catch (err) {
        showError('❌ Error al crear la tarea: ' + (err.message || ''));
      } finally {
        creandoTarea.value = false;
      }
    };

    const avanzarEstado = (task) => {
      const nuevoEstado = task.status === 'pendiente' ? 'en_camino' : 'completada';
      cambiarEstadoTarea(task.id, nuevoEstado);
      showStateDropdown.value = false;
    };

    const retrocederEstado = (task) => {
      const nuevoEstado = task.status === 'completada' ? 'en_camino' : 'pendiente';
      cambiarEstadoTarea(task.id, nuevoEstado);
      showStateDropdown.value = false;
    };

    const toggleLabelInNew = (labelId) => {
      const index = newTask.value.label_ids.indexOf(labelId);
      if (index > -1) {
        newTask.value.label_ids.splice(index, 1);
      } else {
        newTask.value.label_ids.push(labelId);
      }
    };

    const toggleLabelInEdit = (labelId) => {
      const index = editTask.value.label_ids.indexOf(labelId);
      if (index > -1) {
        editTask.value.label_ids.splice(index, 1);
      } else {
        editTask.value.label_ids.push(labelId);
      }
    };

    const addUserToNewTask = (userId) => {
      const id = parseInt(userId);
      if (id && !newTask.value.assigned_to.includes(id)) {
        newTask.value.assigned_to.push(id);
      }
      event.target.value = '';
    };

    const removeUserFromNewTask = (userId) => {
      newTask.value.assigned_to = newTask.value.assigned_to.filter(id => id !== userId);
    };

    const addUserToEditTask = (userId) => {
      const id = parseInt(userId);
      if (id && !editTask.value.assigned_to.includes(id)) {
        editTask.value.assigned_to.push(id);
      }
      event.target.value = '';
    };

    const removeUserFromEditTask = (userId) => {
      editTask.value.assigned_to = editTask.value.assigned_to.filter(id => id !== userId);
    };

    const resetForm = () => {
      newTask.value = {
        title: '', description: '', due_date: '', priority: 'media',
        assigned_to: [], label_ids: [], comentario_inicial: ''
      };
      nuevaEtiqueta.value = '';
      nuevoComentario.value = '';
      archivosAdjuntos.value = [];
      const fileInput = document.getElementById('fileInput');
      if (fileInput) fileInput.value = '';
    };

    const handleFileUpload = (event) => {
      const files = Array.from(event.target.files);
      if (files.length > 0) {
        // Comprobamos que no se exceda el límite total
        if ((archivosAdjuntos.value.length + files.length) > 5) {
          showError('Puedes subir un máximo de 5 archivos.');
          return;
        }
        // Comprobamos el tamaño de cada archivo
        for (const file of files) {
          if (file.size > 10 * 1024 * 1024) { // 10MB
            showError(`El archivo "${file.name}" excede los 10MB.`);
            continue; // Salta este archivo y continúa con los demás
          }
          archivosAdjuntos.value.push(file);
        }
      }
    };

    const handleFileUploadEnEdicion = (event) => {
      // Agrega los archivos seleccionados a la lista de nuevos adjuntos
      for (const file of event.target.files) {
        if (file.size > 10 * 1024 * 1024) { // 10MB
          showError(`El archivo "${file.name}" excede los 10MB.`);
          continue;
        }
        archivosParaSubirEnEdicion.value.push(file);
      }
      event.target.value = ''; // Resetea el input
    };

    const quitarDeLaListaDeSubida = (index) => {
      // Quita un archivo de la lista de previsualización antes de subirlo
      archivosParaSubirEnEdicion.value.splice(index, 1);
    };

    const marcarParaBorrar = (attachmentId) => {
      // Marca o desmarca un adjunto existente para su eliminación al guardar
      const index = adjuntosParaBorrar.value.indexOf(attachmentId);
      if (index > -1) {
        adjuntosParaBorrar.value.splice(index, 1); // Desmarcar si ya está en la lista
      } else {
        adjuntosParaBorrar.value.push(attachmentId); // Marcar para borrar
      }
    };

    const archivarTarea = async (taskId) => {
      try {
        await API.post(`/api/tasks/${taskId}/archive`);
        tareaSeleccionada.value = null; // Cierra el modal
        showSuccess('✅ Tarea archivada correctamente');
        // La actualización del tablero será automática gracias al broadcast
      } catch (err) {
        showError('❌ Error al archivar la tarea: ' + err.message);
      }
    };
    const removeFile = () => {
      archivosAdjuntos.value = []; // CORREGIDO: se limpia el array
      document.getElementById('fileInput').value = '';
    };

    const crearEtiqueta = async () => {
      if (!nuevaEtiqueta.value.trim()) {
        return showError('El nombre de la etiqueta es obligatorio');
      }
      try {
        await API.post('/api/labels', { name: nuevaEtiqueta.value.trim() });
        nuevaEtiqueta.value = '';


        await cargarDatos(); // Recargamos todos los datos, incluyendo las nuevas etiquetas

        showSuccess('🏷️ Etiqueta creada exitosamente');
      } catch (err) {
        showError('❌ No se pudo crear la etiqueta: ' + (err.message || ''));
      }
    };
    const cambiarEstadoTarea = async (id, nuevoEstado) => {
      try {
        await API.put(`/api/tasks/${id}/status`, { status: nuevoEstado });
        tareaSeleccionada.value = null;
        showSuccess(`Tarea movida a "${nuevoEstado.replace('_', ' ')}"`);
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
      } catch (err) {
        console.error('Error al cargar detalles:', err);
        task.attachments = [];
        task.comentarios = [];
      }
      tareaSeleccionada.value = task;
    };

    const handleCommentAttachment = (event) => {
      const files = Array.from(event.target.files);
      // Lógica similar a handleFileUpload para commentAttachments.value
      if ((commentAttachments.value.length + files.length) > 5) {
        showError('Puedes adjuntar un máximo de 5 archivos por comentario.');
        return;
      }
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) { // 10MB
          showError(`El archivo "${file.name}" excede los 10MB.`);
          continue;
        }
        commentAttachments.value.push(file);
      }
    };

    const removeCommentAttachment = () => {
      commentAttachments.value = [];
      document.getElementById('comment-attachment-input').value = '';
    };

    const removeCommentAttachmentFile = (index) => {
      // Elimina el archivo de la lista por su índice
      commentAttachments.value.splice(index, 1);
      // Resetea el input para poder volver a seleccionar los mismos archivos si es necesario
      document.getElementById('comment-attachment-input').value = '';
    };

    const agregarComentario = async () => {
      if ((!nuevoComentario.value.trim() && commentAttachments.value.length === 0) || !tareaSeleccionada.value) {
        return;
      }
      try {
        const formData = new FormData();
        formData.append('task_id', tareaSeleccionada.value.id);
        formData.append('contenido', nuevoComentario.value.trim());


        // 1. Encontrar todas las menciones que sigan el formato @Nombre Completo
        const mentionRegex = /@([A-Za-z0-9_ Á-Úá-ú]+)/g;
        const mentions = nuevoComentario.value.match(mentionRegex);
        const mentionedUserIds = new Set();

        if (mentions) {
          mentions.forEach(mention => {
            const username = mention.substring(1).trim(); // Quitar el '@' y espacios extra
            // Buscamos el usuario en nuestra lista de usuarios cargada (insensible a mayúsculas)
            const foundUser = users.value.find(u => u.name.toLowerCase() === username.toLowerCase());
            if (foundUser) {
              mentionedUserIds.add(foundUser.id);
            }
          });
        }

        // 2. Si encontramos IDs, los añadimos al FormData como un string JSON
        if (mentionedUserIds.size > 0) {
          formData.append('mentioned_user_ids', JSON.stringify(Array.from(mentionedUserIds)));
        }


        if (commentAttachments.value.length > 0) {
          for (const file of commentAttachments.value) {
            formData.append('attachments', file);
          }
        }

        await API.upload('/api/tasks/comments', formData);

        nuevoComentario.value = '';
        removeCommentAttachment();
        showSuccess('💬 Comentario agregado');

        const taskActual = tasks.value.find(t => t.id === tareaSeleccionada.value.id);
        if (taskActual) {
          await verDetalles(taskActual);
        }
      } catch (err) {
        showError('❌ Error al agregar comentario: ' + err.message);
      }
    };
    const getLabelsArray = (task) => {
      if (!task?.label_names) return [];
      return task.label_names.split(',').map(label => label.trim()).filter(Boolean);
    };

    const toggleNotifications = () => {
      mostrarNotificaciones.value = !mostrarNotificaciones.value;
      if (mostrarNotificaciones.value) {
        document.body.classList.add('overlay-active');
      } else {
        document.body.classList.remove('overlay-active');
      }
    };

    const marcarComoLeida = async (id) => {
      try {
        await API.put(`/api/notifications/${id}/read`);
        const notif = notificaciones.value.find(n => n.id === id);
        if (notif) notif.leida = true;
      } catch (err) {
        showError('Error al marcar como leída');
      }
    };

    const marcarTodasComoLeidas = async () => {
      try {
        await API.put('/api/notifications/read-all');
        notificaciones.value.forEach(n => {
          if (!n.leida) n.leida = true;
        });
      } catch (err) {
        showError('Error al marcar todas como leídas');
      }
    };

    const eliminarNotificacion = async (id) => {
      try {
        await API.delete(`/api/notifications/${id}`);
        notificaciones.value = notificaciones.value.filter(n => n.id !== id);
      } catch (err) {
        showError('Error al eliminar notificación');
      }
    };

    const esTareaParaHoy = (isoDate) => {
      if (!isoDate) return false;
      const hoy = new Date();
      const fechaTarea = new Date(isoDate);
      return hoy.getFullYear() === fechaTarea.getFullYear() &&
        hoy.getMonth() === fechaTarea.getMonth() &&
        hoy.getDate() === fechaTarea.getDate();
    };

    // --- VERSIÓN DE DEPURACIÓN ---
    const esTareaVencida = (dateString, taskTitle) => {
      if (!dateString) return false;

      // 1. Corregimos el formato de la fecha
      const isoDateString = dateString.replace(' ', 'T');
      const fechaTarea = new Date(isoDateString);
      const hoy = new Date();

      // 2. Comprobamos si la fecha es válida
      if (isNaN(fechaTarea.getTime())) {
        console.error(`[DEPURACIÓN] Fecha inválida para la tarea "${taskTitle}":`, dateString);
        return false;
      }

      // 3. Comparamos y mostramos en consola el resultado
      const estaVencida = fechaTarea < hoy;
      console.log(`[DEPURACIÓN] Tarea: "${taskTitle}" | Fecha Tarea: ${fechaTarea.toLocaleString()} | ¿Está Vencida?: ${estaVencida}`);

      return estaVencida;
    };

    const formatDate = (isoDate) => {
      if (!isoDate) return 'No especificada';
      try {
        return new Date(isoDate).toLocaleString('es-CL', {
          day: 'numeric', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        });
      } catch { return isoDate; }
    };

    const formatCommentContent = (text) => {
      if (!text) return '';
      // Convierte saltos de línea a <br> y resalta las menciones con una clase CSS
      return text
        .replace(/\n/g, '<br>')
        .replace(/@([A-Za-z0-9_ Á-Úá-ú]+)/g, '<strong class="mention">@$1</strong>');
    };

    const getColor = (labelName) => {
      const predefinedColors = {
        'Entrega': '#049DD9', 'Express': '#3498DB', 'Factura': '#97BF04',
        'Valparaíso': '#F39C12', 'Viña del Mar': '#E67E22', 'Quilpué': '#16A085',
        'Prioritaria': '#E74C3C', 'Urgente': '#C0392B'
      };
      if (predefinedColors[labelName]) return predefinedColors[labelName];
      const defaultColors = ['#2980B9', '#27AE60', '#8E44AD', '#2C3E50', '#7F8C8D'];
      let hash = 0;
      for (let i = 0; i < labelName.length; i++) {
        hash = labelName.charCodeAt(i) + ((hash << 5) - hash);
      }
      return defaultColors[Math.abs(hash) % defaultColors.length];
    };

    const getPriorityText = (priority) => ({ 'alta': 'Alta', 'media': 'Media', 'baja': 'Baja' }[priority] || priority);

    const getFileSize = (bytes) => {
      if (!bytes || bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };


    const downloadFile = async (attachment) => {
      try {
        const token = sessionStorage.getItem('auth_token');

        // ✨ CORRECCIÓN: La URL debe apuntar a la ruta relativa de la API.
        // El proxy de Netlify/Render se encargará del resto.
        const downloadUrl = `/api/download/${attachment.file_path}`;

        const response = await fetch(downloadUrl, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'No se pudo iniciar la descarga.');
        }

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

    const abrirSelectorDeCreador = () => {
      if (!tareaSeleccionada.value) return;
      // Pre-seleccionamos el creador actual en el dropdown
      nuevoCreadorId.value = tareaSeleccionada.value.created_by;
      mostrandoSelectorCreador.value = true;
    };

    const confirmarCambioDeCreador = async () => {
      if (!nuevoCreadorId.value) {
        return showError("Debes seleccionar un nuevo creador.");
      }

      try {
        const taskId = tareaSeleccionada.value.id;
        await API.put(`/api/tasks/${taskId}/creator`, { newCreatorId: nuevoCreadorId.value });

        showSuccess('Creador de la tarea actualizado con éxito.');
        mostrandoSelectorCreador.value = false; // Cierra el nuevo modal
        tareaSeleccionada.value = null;      // Cierra el modal de detalles

      } catch (err) {
        showError(err.message || 'No se pudo cambiar el creador.');
      }
    };

    const handleCommentInput = (event) => {
      const text = event.target.value;
      const cursorPos = event.target.selectionStart;

      // Regex para encontrar si estamos escribiendo una mención (ej: @jua)
      const mentionMatch = text.slice(0, cursorPos).match(/@(\w*)$/);

      if (mentionMatch) {
        mentionQuery.value = mentionMatch[1].toLowerCase();
        filteredMentionUsers.value = users.value.filter(u =>
          u.name.toLowerCase().includes(mentionQuery.value)
        );
        showMentionList.value = true;
        mentionNavIndex.value = 0; // Resetea el índice de navegación
      } else {
        showMentionList.value = false;
        mentionNavIndex.value = -1;
      }
    };

    const selectMention = (user) => {
      const text = nuevoComentario.value;
      const cursorPos = document.querySelector('.comment-form textarea').selectionStart;
      const textBeforeCursor = text.slice(0, cursorPos);

      // Reemplaza la mención parcial (ej: @jua) por la completa (@Juan Perez )
      const newTextBefore = textBeforeCursor.replace(/@(\w*)$/, `@${user.name} `);

      nuevoComentario.value = newTextBefore + text.slice(cursorPos);
      showMentionList.value = false;
      mentionNavIndex.value = -1;

      // Ponemos el foco de vuelta en el textarea
      Vue.nextTick(() => {
        const textarea = document.querySelector('.comment-form textarea');
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = newTextBefore.length;
      });
    };

    const navigateMentions = (direction) => {
      if (!showMentionList.value || filteredMentionUsers.value.length === 0) return;
      if (direction === 'down') {
        mentionNavIndex.value = (mentionNavIndex.value + 1) % filteredMentionUsers.value.length;
      } else if (direction === 'up') {
        mentionNavIndex.value = (mentionNavIndex.value - 1 + filteredMentionUsers.value.length) % filteredMentionUsers.value.length;
      }
    };

    const selectMentionWithEnter = (event) => {
      if (showMentionList.value && mentionNavIndex.value >= 0) {
        selectMention(filteredMentionUsers.value[mentionNavIndex.value]);
        event.preventDefault(); // Evita que se inserte un salto de línea
      } else {
        // Permite el comportamiento normal del Enter (agregar comentario) si no hay menú
        agregarComentario();
      }
    };

    const closeUpdateModal = (shouldNotShowAgain) => {
      if (shouldNotShowAgain) {
        // Guardamos la versión actual que el usuario ha visto
        localStorage.setItem('lastUpdateSeen', APP_VERSION);
      }
      showUpdateModal.value = false;
    };

    const openCompleteModal = (task) => {
      taskToComplete.value = task;
      completionFile.value = null;
      closingNote.value = '';
      isCompleting.value = false;
      showCompleteModal.value = true;

      // Resetear el input de archivo
      Vue.nextTick(() => {
        const fileInput = document.getElementById('completion-file');
        if (fileInput) fileInput.value = '';
      });
    };

    const handleCompletionFile = (event) => {
      const file = event.target.files[0];
      if (file) {
        if (file.size > 10 * 1024 * 1024) { // 10MB
          showError(`El archivo "${file.name}" excede los 10MB.`);
          event.target.value = ''; // Limpia el input
          return;
        }
        completionFile.value = file;
      } else {
        completionFile.value = null;
      }
    };

    const cancelCompletion = () => {
      showCompleteModal.value = false;
      taskToComplete.value = null;
      completionFile.value = null;
      closingNote.value = '';
      isCompleting.value = false;
      // Limpiamos el input del archivo por si el usuario cancela
      const fileInput = document.getElementById('completion-file');
      if (fileInput) fileInput.value = '';
    };

    // REEMPLAZA tu función `confirmCompletion` con esta versión

const confirmCompletion = async () => {
  if (!taskToComplete.value) return;

  isCompleting.value = true;
  const formData = new FormData();

  if (completionFile.value) {
    formData.append('completion_proof', completionFile.value);
  }
  if (closingNote.value.trim()) {
    formData.append('closing_note', closingNote.value.trim());
  }

  try {
    const response = await API.upload(`/api/tasks/${taskToComplete.value.id}/complete`, formData);

    if (response.success) {
      const successMessage = `La tarea "${taskToComplete.value.title}" ha sido completada.`;
      showSuccess(successMessage);
      cancelCompletion();
      await cargarDatos();
    } else {
      // 👇 ESTE BLOQUE ES LA MEJORA CLAVE 👇
      // Si la API dice que no fue exitoso, lanzamos un error para que lo capture el 'catch'
      throw new Error(response.error || 'El servidor indicó un error al completar la tarea.');
    }

  } catch (err) {
    console.error('Error en confirmCompletion:', err);
    showError(err.message || 'No se pudo completar la tarea.');
  } finally {
    isCompleting.value = false;
  }
};

    // ======================================================
    // 5. Carga Inicial (Lifecycle Hook) - VERSIÓN CORREGIDA
    // ======================================================
    onMounted(() => {
      cargarDatos();
      setupWebSocket();

      API.post('/api/tasks/auto-archive').catch(err => {
        console.log('No se pudo ejecutar archivado automático:', err);
      });

      // 👇 Lógica de resaltado ahora usa la nueva función
      const params = new URLSearchParams(window.location.search);
      const taskIdToHighlight = params.get('highlight_task');
      if (taskIdToHighlight) {
        highlightTask(taskIdToHighlight);
      }

      // Lógica del pop-up (sin cambios)
      const lastSeenVersion = localStorage.getItem('lastUpdateSeen');
      if (lastSeenVersion !== APP_VERSION) {
        showUpdateModal.value = true;
      }
    });
    // ======================================================
    // 6. EXPOSICIÓN A LA PLANTILLA (return)
    // ======================================================
    // REEMPLAZA tu `return` actual con este bloque completo

    return {
      user, tasks, users, labels, resumen, misTareas, filtroFecha, showModal,
      tareaSeleccionada, creandoTarea, loading, error, showEditModal, editTask,
      showDeleteConfirm, suggestedLabels, showDropdown, toggleDropdown, newTask,
      nuevaEtiqueta, nuevoComentario, archivosAdjuntos, notificaciones,
      mostrarNotificaciones, commentAttachments, showNewLabelDropdown, showLabelDropdown,
      notificacionesPendientes, selectedLabelsInNew, availableLabelsInNew,
      selectedLabelsInEdit, availableLabelsInEdit, tareasFiltradas,
      tareasPendientes, tareasEnCamino, tareasCompletadas, selectedUsersInNew,
      availableUsersInNew,
      selectedUsersInEdit,
      availableUsersInEdit,
      logout, cargarDatos, abrirModalEditar, guardarCambiosTarea,
      abrirConfirmarEliminar, eliminarTarea, esTareaParaHoy, esTareaVencida, crearTarea,
      toggleLabelInNew, resetForm, handleFileUpload, removeFile, crearEtiqueta,
      toggleLabelInEdit, cambiarEstadoTarea, verDetalles, handleCommentAttachment,
      removeCommentAttachment, removeCommentAttachmentFile, agregarComentario, getLabelsArray, toggleNotifications,
      marcarComoLeida, marcarTodasComoLeidas, eliminarNotificacion, formatDate,
      getColor, getPriorityText, getFileSize, downloadFile,
      setQuickDate, setQuickEditDate,
      moverACamino: (id) => cambiarEstadoTarea(id, 'en_camino'),
      addUserToNewTask,
      removeUserFromNewTask,
      addUserToEditTask,
      removeUserFromEditTask,
      puedeEditarTarea,
      puedeEliminarTarea,
      mostrandoSelectorCreador,
      nuevoCreadorId,
      abrirSelectorDeCreador,
      formatCommentContent,
      confirmarCambioDeCreador,
      showMentionList,
      filteredMentionUsers,
      handleCommentInput,
      selectMention,
      navigateMentions,
      selectMentionWithEnter,
      mentionNavIndex,
      showStateDropdown,
      toggleStateDropdown,
      avanzarEstado,
      formatDescription,
      retrocederEstado,
      handleNotificationClick,
      archivosParaSubirEnEdicion,
      adjuntosParaBorrar,
      handleFileUploadEnEdicion,
      quitarDeLaListaDeSubida,
      marcarParaBorrar,
      showUpdateModal,
      closeUpdateModal,
      archivarTarea,


      showCompleteModal,
      taskToComplete,
      completionFile,
      closingNote,
      isCompleting,
      openCompleteModal,
      handleCompletionFile,
      cancelCompletion,
      confirmCompletion,
      completar: openCompleteModal
      }; 
  }
    }).mount('#app');