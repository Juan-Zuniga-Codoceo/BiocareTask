const { createApp, ref, onMounted, computed } = Vue;

createApp({
  setup() {
    // Estado principal
    const user = ref(null);
    const archivedTasks = ref([]);
    const loading = ref(true);
    const showDropdown = ref(false);
    
    // Estado para el modal de detalles
    const tareaSeleccionada = ref(null);
    const loadingDetails = ref(false);

    // --- FUNCIONES ---

    const cargarArchivadas = async () => {
      try {
        loading.value = true;
        const data = await API.get('/api/tasks/archived');
        archivedTasks.value = data || [];
      } catch (error) {
        API.showNotification('No se pudo cargar el archivo.', 'error');
      } finally {
        loading.value = false;
      }
    };

    // NUEVO: Función para ver los detalles de una tarea archivada
    const verDetalles = async (task) => {
        try {
            loadingDetails.value = true;
            // Pedimos al servidor todos los datos de esta tarea específica
            const fullTaskData = await API.get(`/api/tasks/${task.id}`);
            tareaSeleccionada.value = fullTaskData;
        } catch (error) {
            API.showNotification('Error al cargar los detalles de la tarea.', 'error');
        } finally {
            loadingDetails.value = false;
        }
    };
    
    // --- FUNCIONES DE UTILIDAD (Copiadas de tasks.js para el modal) ---
    
    const formatDate = (isoDate) => {
        if (!isoDate) return 'N/A';
        return new Date(isoDate).toLocaleString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const getLabelsArray = (task) => {
      if (!task?.label_names) return [];
      return task.label_names.split(',').map(label => label.trim()).filter(Boolean);
    };

    const getColor = (labelName) => {
      const predefinedColors = { 'Entrega': '#049DD9', 'Express': '#3498DB', 'Factura': '#97BF04', 'Valparaíso': '#F39C12', 'Viña del Mar': '#E67E22', 'Quilpué': '#16A085', 'Prioritaria': '#E74C3C', 'Urgente': '#C0392B' };
      if (predefinedColors[labelName]) return predefinedColors[labelName];
      const defaultColors = ['#2980B9', '#27AE60', '#8E44AD', '#2C3E50', '#7F8C8D'];
      let hash = 0;
      for (let i = 0; i < labelName.length; i++) {
        hash = labelName.charCodeAt(i) + ((hash << 5) - hash);
      }
      return defaultColors[Math.abs(hash) % defaultColors.length];
    };

    const getPriorityText = (priority) => ({ 'alta': 'Alta', 'media': 'Media', 'baja': 'Baja' }[priority] || priority);

    const downloadFile = async (attachment) => {
      // ... (pega aquí la función downloadFile completa desde tu tasks.js)
    };
    
    // --- FUNCIONES DEL HEADER ---
    const toggleDropdown = () => { showDropdown.value = !showDropdown.value; };
    const logout = () => {
        localStorage.removeItem('biocare_user');
        localStorage.removeItem('auth_token');
        window.location.href = '/login.html';
    };

    // --- CARGA INICIAL ---
    onMounted(() => {
        const userData = localStorage.getItem('biocare_user');
        if (!userData) { window.location.href = '/login.html'; }
        else { user.value = JSON.parse(userData); }
        cargarArchivadas();
    });

    return { 
        user, 
        archivedTasks, 
        loading, 
        formatDate, 
        showDropdown, 
        toggleDropdown, 
        logout,
        // Nuevas variables y funciones para el modal
        tareaSeleccionada,
        loadingDetails,
        verDetalles,
        getLabelsArray,
        getColor,
        getPriorityText,
        downloadFile
    };
  }
}).mount('#app');