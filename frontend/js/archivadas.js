const { createApp, ref, onMounted, computed } = Vue;

createApp({
  setup() {
    // Estado principal
    const user = ref(null);
    const archivedTasks = ref([]);
    const loading = ref(true);
    const showDropdown = ref(false);
    const searchTerm = ref('');
    const sortBy = ref('newest');
    const restoring = ref(null);
    const restoredCount = ref(0);

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
        API.showNotification('No se pudo cargar el historial archivado.', 'error');
        console.error('Error al cargar tareas archivadas:', error);
      } finally {
        loading.value = false;
      }
    };

    // Función para restaurar una tarea archivada
    const restoreTask = async (taskId) => {
  if (!taskId) {
    showError('ID de tarea inválido');
    return;
  }

  try {
    restoring.value = taskId;
    
    // ✅ CORRECCIÓN: Usar PUT en lugar de POST
    const response = await API.put(`/api/tasks/${taskId}/unarchive`);

    if (response.success) {
      // Incrementar contador de restauraciones
      restoredCount.value++;
      sessionStorage.setItem('restoredCount', restoredCount.value.toString());
      
      // Mostrar notificación de éxito
      API.showNotification('✅ Tarea restaurada exitosamente', 'success');
      
      // ✅ CORRECCIÓN CRÍTICA: Remover la tarea de la lista local inmediatamente
      archivedTasks.value = archivedTasks.value.filter(t => t.id !== taskId);
      
      // Cerrar el modal de detalles si está abierto
      if (tareaSeleccionada.value?.id === taskId) {
        tareaSeleccionada.value = null;
      }
      
      // Esperar 1 segundo para que el usuario vea la notificación
      // y luego redirigir al tablero
      setTimeout(() => {
        window.location.href = `/tablero.html?highlight_task=${taskId}`;
}, 1000);
      
    } else {
      throw new Error(response.error || 'No se pudo restaurar la tarea');
    }
  } catch (error) {
    console.error('Error al restaurar tarea:', error);
    API.showNotification('❌ Error al restaurar: ' + (error.message || 'Error desconocido'), 'error');
    restoring.value = null;
    
    // Recargar la lista en caso de error para sincronizar el estado
    await cargarArchivadas();
  }
};


    // Función para ver los detalles de una tarea archivada
    const verDetalles = async (task) => {
      try {
        loadingDetails.value = true;
        tareaSeleccionada.value = task;
      } catch (error) {
        API.showNotification('Error al cargar los detalles de la tarea.', 'error');
        console.error('Error al cargar detalles:', error);
      } finally {
        loadingDetails.value = false;
      }
    };

    // --- FUNCIONES DE UTILIDAD ---

    const formatDate = (isoDate) => {
      if (!isoDate) return 'Fecha no disponible';
      const date = new Date(isoDate);
      return date.toLocaleDateString('es-CL', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    // --- FUNCIONES DEL HEADER ---
    // Reemplaza la función existente con esta
    const toggleDropdown = () => {
      showDropdown.value = !showDropdown.value;
      // Lógica para bloquear/desbloquear el scroll
      if (showDropdown.value) {
        document.body.classList.add('overlay-active');
      } else {
        document.body.classList.remove('overlay-active');
      }
    };

    const logout = () => {
      sessionStorage.removeItem('biocare_user');
      sessionStorage.removeItem('auth_token');
      sessionStorage.removeItem('restoredCount');
      window.location.href = '/login.html';
    };
    // --- COMPUTED PROPERTIES ---
    const filteredTasks = computed(() => {
      let filtered = archivedTasks.value;

      // Filtrar por término de búsqueda
      if (searchTerm.value) {
        const term = searchTerm.value.toLowerCase();
        filtered = filtered.filter(task =>
          task.title.toLowerCase().includes(term) ||
          (task.description && task.description.toLowerCase().includes(term))
        );
      }

      // Ordenar
      switch (sortBy.value) {
        case 'newest':
          return filtered.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
        case 'oldest':
          return filtered.sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));
        case 'title':
          return filtered.sort((a, b) => a.title.localeCompare(b.title));
        default:
          return filtered;
      }
    });

    const completedThisWeek = computed(() => {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      return archivedTasks.value.filter(task => {
        if (!task.completed_at) return false;
        return new Date(task.completed_at) >= oneWeekAgo;
      }).length;
    });

    onMounted(() => {
      const userData = sessionStorage.getItem('biocare_user');
      if (!userData) {
        window.location.href = '/login.html';
      } else {
        user.value = JSON.parse(userData);
      }

      // Leer el contador guardado al cargar la página
      const savedCount = sessionStorage.getItem('restoredCount');
      if (savedCount) {
        restoredCount.value = parseInt(savedCount, 10);
      }

      cargarArchivadas();
    });

    return {
      user,
      archivedTasks,
      loading,
      searchTerm,
      sortBy,
      filteredTasks,
      completedThisWeek,
      restoredCount,
      restoring,
      formatDate,
      showDropdown,
      toggleDropdown,
      logout,
      // Variables y funciones para el modal
      tareaSeleccionada,
      loadingDetails,
      verDetalles,
      restoreTask
    };
  }
}).mount('#app');