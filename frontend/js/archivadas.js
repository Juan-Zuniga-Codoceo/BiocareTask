const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    const user = ref(null);
    const archivedTasks = ref([]);
    const loading = ref(true);

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

    const formatDate = (isoDate) => {
        if (!isoDate) return 'N/A';
        return new Date(isoDate).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
    };
    
    const logout = () => {
        localStorage.removeItem('biocare_user');
        localStorage.removeItem('auth_token');
        window.location.href = '/login.html';
    };

    onMounted(() => {
        const userData = localStorage.getItem('biocare_user');
        if (!userData) { window.location.href = '/login.html'; }
        else { user.value = JSON.parse(userData); }
        cargarArchivadas();
    });

    return { user, archivedTasks, loading, formatDate, logout };
  }
}).mount('#app');