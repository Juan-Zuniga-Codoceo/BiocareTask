const { createApp, ref, computed } = Vue;

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

    // Archivo adjunto
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
      window.location.href = '/login';
    };

    // Función para descargar archivos
    const downloadFile = async (attachment) => {
      try {
        // Usar la ruta API para asegurar la descarga correcta
        const response = await fetch(`/api/download/${attachment.file_path}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Error al descargar el archivo');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // Usar el nombre original del archivo para la descarga
        link.download = attachment.file_name;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Liberar el objeto URL después de un tiempo
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
        }, 100);
      } catch (error) {
        console.error('Error al descargar archivo:', error);
        alert('Error al descargar el archivo: ' + error.message);
      }
    };

    const cargarDatos = async () => {
      try {
        const [tasksRes, usersRes, labelsRes, resumenRes] = await Promise.all([
          fetch('/api/tasks'),
          fetch('/api/users'),
          fetch('/api/labels'),
          fetch('/api/tasks/resumen')
        ]);
        
        tasks.value = await tasksRes.json();
        users.value = await usersRes.json();
        labels.value = await labelsRes.json();
        resumen.value = await resumenRes.json();
        
        // Cargar archivos adjuntos para cada tarea
        for (let task of tasks.value) {
          try {
            const attachmentsRes = await fetch(`/api/attachments/task/${task.id}`);
            if (attachmentsRes.ok) {
              task.attachments = await attachmentsRes.json();
            } else {
              task.attachments = [];
            }
          } catch (err) {
            console.error('Error al cargar adjuntos:', err);
            task.attachments = [];
          }
        }
      } catch (err) {
        console.error('Error al cargar datos:', err);
        alert('No se pudo conectar con el servidor.');
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

    // Función para subir archivo después de crear la tarea
    const subirArchivo = async (taskId) => {
      try {
        const formData = new FormData();
        formData.append('file', archivoAdjunto.value);
        formData.append('task_id', taskId);
        formData.append('file_name', archivoAdjunto.value.name);
        formData.append('uploaded_by', user.value.id);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });

        if (!res.ok) {
          console.error('Error al subir archivo:', await res.text());
        }
      } catch (err) {
        console.error('Error al subir archivo:', err);
      }
    };

    const crearTarea = async () => {
      // Validaciones básicas en frontend
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
        // Formatear la fecha correctamente
        let formattedDueDate = newTask.value.due_date;
        if (formattedDueDate && !formattedDueDate.includes('T')) {
          formattedDueDate += 'T00:00:00';
        }

        const taskData = {
          title: newTask.value.title.trim(),
          description: newTask.value.description,
          due_date: formattedDueDate,
          priority: newTask.value.priority,
          assigned_to: Array.isArray(newTask.value.assigned_to) ? 
                      newTask.value.assigned_to.filter(id => id) : [],
          label_ids: Array.isArray(newTask.value.label_ids) ? 
                     newTask.value.label_ids.filter(id => id) : [],
          created_by: user.value.id
        };

        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(taskData)
        });

        const responseData = await res.json();

        if (res.ok) {
          // Si hay archivo adjunto, subirlo después de crear la tarea
          if (archivoAdjunto.value) {
            await subirArchivo(responseData.id);
          }
          
          showModal.value = false;
          resetForm();
          cargarDatos();
          alert('Tarea creada exitosamente');
        } else {
          if (responseData.errors) {
            const errorMessages = responseData.errors.map(error => 
              `${error.path}: ${error.msg}`
            ).join('\n');
            alert('Errores de validación:\n' + errorMessages);
          } else {
            alert('Error: ' + (responseData.error || 'No se pudo crear la tarea'));
          }
        }
      } catch (err) {
        console.error('Error al crear tarea:', err);
        alert('Error de conexión: ' + err.message);
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
        file_path: ''
      };
      nuevaEtiqueta.value = '';
      archivoAdjunto.value = null;
      document.getElementById('fileInput').value = '';
    };

    const crearEtiqueta = async () => {
      if (!nuevaEtiqueta.value.trim()) {
        alert('El nombre de la etiqueta es obligatorio');
        return;
      }
      
      try {
        const res = await fetch('/api/labels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: nuevaEtiqueta.value.trim(), 
            created_by: user.value.id 
          })
        });
        
        if (res.ok) {
          nuevaEtiqueta.value = '';
          cargarDatos();
          alert('Etiqueta creada exitosamente');
        } else {
          alert('Error al crear etiqueta');
        }
      } catch (err) {
        alert('Error de conexión');
      }
    };

    const moverACamino = async (id) => {
      try {
        const res = await fetch(`/api/tasks/${id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'en_camino' })
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
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'completada' })
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

    const verDetalles = async (task) => {
      // Cargar archivos adjuntos para esta tarea
      try {
        const attachmentsRes = await fetch(`/api/attachments/task/${task.id}`);
        if (attachmentsRes.ok) {
          task.attachments = await attachmentsRes.json();
        } else {
          task.attachments = [];
        }
      } catch (err) {
        console.error('Error al cargar adjuntos:', err);
        task.attachments = [];
      }
      tareaSeleccionada.value = task;
    };

    // Obtener array de etiquetas desde string separado por comas
    const getLabelsArray = (task) => {
      if (!task.label_names) return [];
      return task.label_names.split(', ').filter(label => label.trim() !== '');
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
          t.due_date.startsWith(filtroFecha.value)
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

    const getColor = (labelName) => {
      const colors = {
        'Entrega': '#049DD9',
        'Express': '#04B2D9',
        'Factura': '#97BF04',
        'Santiago': '#83A603',
        'Valparaíso': '#049DD9',
        'Viña del Mar': '#04B2D9',
        'Prioritaria': '#E30613',
        'Urgente': '#E30613',
        'Reunión': '#9C27B0',
        'Documentación': '#607D8B',
        'Cliente': '#FF9800'
      };
      return colors[labelName] || getRandomColor(labelName);
    };

    // Generar color consistente basado en el nombre de la etiqueta
    const getRandomColor = (labelName) => {
      const colors = [
        '#049DD9', '#04B2D9', '#97BF04', '#83A603', '#E30613',
        '#9C27B0', '#607D8B', '#FF9800', '#795548', '#009688'
      ];
      let hash = 0;
      for (let i = 0; i < labelName.length; i++) {
        hash = labelName.charCodeAt(i) + ((hash << 5) - hash);
      }
      return colors[Math.abs(hash) % colors.length];
    };

    const getPriorityText = (priority) => {
      return priority === 'alta' ? 'Alta' : priority === 'media' ? 'Media' : 'Baja';
    };

    const getFileSize = (bytes) => {
      if (!bytes) return '0 B';
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    };

    cargarDatos();

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
      tareasPendientes,
      tareasEnCamino,
      tareasCompletadas,
      logout,
      cargarDatos,
      crearTarea,
      crearEtiqueta,
      moverACamino,
      completar,
      verDetalles,
      handleFileUpload,
      removeFile,
      getLabelsArray,
      formatDate,
      getColor,
      getPriorityText,
      getFileSize,
      downloadFile
    };
  }
}).mount('#app');