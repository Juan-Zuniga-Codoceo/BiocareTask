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

    const cargarDatos = async () => {
      try {
        // Simular datos para pruebas (eliminar cuando el backend esté listo)
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          // Datos de ejemplo
          tasks.value = [
            {
              id: 1,
              title: "Entregar paquetes en Santiago",
              description: "Llevar los documentos a la oficina central",
              due_date: "2023-12-15T14:00:00",
              status: "pendiente",
              priority: "alta",
              assigned_names: "Juan Pérez, María López",
              created_by_name: "Admin",
              label_names: "Entrega, Santiago, Prioritaria",
              file_path: "/uploads/documento1.pdf",
              file_size: 2048576
            },
            {
              id: 2,
              title: "Revisar facturas pendientes",
              description: "Verificar las facturas del mes de noviembre",
              due_date: "2023-12-10T10:30:00",
              status: "en_camino",
              priority: "media",
              assigned_names: "Carlos Rodríguez",
              created_by_name: "Admin",
              label_names: "Factura",
              file_path: "/uploads/facturas.xlsx",
              file_size: 512000
            },
            {
              id: 3,
              title: "Entrega express Viña del Mar",
              description: "Paquete urgente para cliente en Viña",
              due_date: "2023-12-05T16:45:00",
              status: "completada",
              priority: "alta",
              assigned_names: "Ana Silva",
              created_by_name: "Admin",
              label_names: "Express, Viña del Mar",
              completed_at: "2023-12-05T15:30:00",
              file_path: "/uploads/contrato.pdf",
              file_size: 1048576
            }
          ];
          
          users.value = [
            { id: 1, name: "Juan Pérez" },
            { id: 2, name: "María López" },
            { id: 3, name: "Carlos Rodríguez" },
            { id: 4, name: "Ana Silva" }
          ];
          
          labels.value = [
            { id: 1, name: "Entrega" },
            { id: 2, name: "Express" },
            { id: 3, name: "Factura" },
            { id: 4, name: "Santiago" },
            { id: 5, name: "Valparaíso" },
            { id: 6, name: "Viña del Mar" },
            { id: 7, name: "Prioritaria" }
          ];
          
          resumen.value = { 
            vencidas: 1, 
            proximas: 2, 
            total_pendientes: 5 
          };
          
          return;
        }
        
        // Código real para producción
        const [tasksRes, usersRes, labelsRes, resumenRes] = await Promise.all([
          fetch('/api/tasks'),
          fetch('/api/users'),
          fetch('/api/labels'),
          fetch('/api/tasks/resumen')
        ]);
        
        if (!tasksRes.ok) throw new Error('Error al cargar tareas');
        if (!usersRes.ok) throw new Error('Error al cargar usuarios');
        if (!labelsRes.ok) throw new Error('Error al cargar etiquetas');
        if (!resumenRes.ok) throw new Error('Error al cargar resumen');
        
        tasks.value = await tasksRes.json();
        users.value = await usersRes.json();
        labels.value = await labelsRes.json();
        resumen.value = await resumenRes.json();
      } catch (err) {
        console.error('Error al cargar datos:', err);
        alert('No se pudo conectar con el servidor. Se muestran datos de ejemplo.');
      }
    };

    const handleFileUpload = (event) => {
      const file = event.target.files[0];
      if (file) {
        archivoAdjunto.value = file;
        newTask.value.file_path = file.name;
        newTask.value.file_size = file.size;
      }
    };

    const crearTarea = async () => {
      // Validaciones
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
        // Simular creación para pruebas (eliminar cuando el backend esté listo)
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          // Simular retardo de red
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const assignedUsers = users.value
            .filter(u => newTask.value.assigned_to.includes(u.id))
            .map(u => u.name);
            
          const taskLabels = labels.value
            .filter(l => newTask.value.label_ids.includes(l.id))
            .map(l => l.name);
          
          const nuevaTarea = {
            id: Date.now(),
            title: newTask.value.title,
            description: newTask.value.description,
            due_date: newTask.value.due_date,
            status: "pendiente",
            priority: newTask.value.priority,
            assigned_names: assignedUsers.join(', '),
            created_by_name: user.value.name,
            label_names: taskLabels.join(', '),
            file_path: newTask.value.file_path || '',
            file_size: newTask.value.file_size || 0
          };
          
          tasks.value.unshift(nuevaTarea);
          
          showModal.value = false;
          resetForm();
          creandoTarea.value = false;
          
          alert('Tarea creada exitosamente (modo simulación)');
          return;
        }
        
        // Código real para producción
        const formData = new FormData();
        formData.append('title', newTask.value.title);
        formData.append('description', newTask.value.description);
        formData.append('due_date', newTask.value.due_date);
        formData.append('priority', newTask.value.priority);
        formData.append('created_by', user.value.id);
        
        // Añadir usuarios asignados
        newTask.value.assigned_to.forEach(userId => {
          formData.append('assigned_to[]', userId);
        });
        
        // Añadir etiquetas
        newTask.value.label_ids.forEach(labelId => {
          formData.append('label_ids[]', labelId);
        });
        
        // Añadir archivo si existe
        if (archivoAdjunto.value) {
          formData.append('file', archivoAdjunto.value);
        }

        const res = await fetch('/api/tasks', {
          method: 'POST',
          body: formData
        });

        if (res.ok) {
          showModal.value = false;
          resetForm();
          cargarDatos();
          alert('Tarea creada exitosamente');
        } else {
          const error = await res.text();
          alert('Error: ' + (error || 'No se pudo crear la tarea'));
        }
      } catch (err) {
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
        // Simular creación para pruebas (eliminar cuando el backend esté listo)
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          const nuevaLabel = {
            id: Date.now(),
            name: nuevaEtiqueta.value.trim()
          };
          
          labels.value.push(nuevaLabel);
          nuevaEtiqueta.value = '';
          alert('Etiqueta creada exitosamente (modo simulación)');
          return;
        }
        
        // Código real para producción
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
        // Simular actualización para pruebas
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          const task = tasks.value.find(t => t.id === id);
          if (task) task.status = 'en_camino';
          return;
        }
        
        // Código real para producción
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
        // Simular actualización para pruebas
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          const task = tasks.value.find(t => t.id === id);
          if (task) {
            task.status = 'completada';
            task.completed_at = new Date().toISOString();
          }
          return;
        }
        
        // Código real para producción
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

    const verDetalles = (task) => {
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

    const getFileName = (path) => {
      if (!path) return '';
      return path.split('/').pop();
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
      getLabelsArray,
      formatDate,
      getColor,
      getPriorityText,
      getFileName,
      getFileSize
    };
  }
}).mount('#app');