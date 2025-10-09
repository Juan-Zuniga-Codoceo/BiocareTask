// frontend/js/projects.js
const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    const user = ref(null);
    const projects = ref([]);
    const loading = ref(true);
    const selectedProject = ref(null);
    const members = ref([]);
    const newMemberEmail = ref('');
    
    // Para el modal de creación
    const showCreateModal = ref(false);
    const newProject = ref({ name: '', description: '' });

    const loadProjects = async () => {
      try {
        loading.value = true;
        projects.value = await API.get('/api/projects');
      } catch (error) {
        API.showNotification('No se pudieron cargar los proyectos.', 'error');
      } finally {
        loading.value = false;
      }
    };

    const selectProject = async (project) => {
        selectedProject.value = project;
        members.value = []; // Limpiar lista anterior
        try {
            members.value = await API.get(`/api/projects/${project.id}/members`);
        } catch (error) {
            API.showNotification('No se pudieron cargar los miembros.', 'error');
        }
    };
    
    const openCreateModal = () => {
        newProject.value = { name: '', description: '' };
        showCreateModal.value = true;
    };
    
    const closeModal = () => {
        showCreateModal.value = false;
    };

    const createProject = async () => {
        if (!newProject.value.name.trim()) {
            return API.showNotification('El nombre del proyecto es obligatorio.', 'error');
        }
        try {
            await API.post('/api/projects', newProject.value);
            API.showNotification('Proyecto creado exitosamente.', 'success');
            closeModal();
            loadProjects();
        } catch (error) {
            API.showNotification(error.message || 'Error al crear el proyecto.', 'error');
        }
    };

    const addMember = async () => {
        if (!selectedProject.value) return;
        try {
            await API.post(`/api/projects/${selectedProject.value.id}/members`, { email: newMemberEmail.value });
            API.showNotification('Miembro añadido.', 'success');
            newMemberEmail.value = '';
            // Recargar miembros
            selectProject(selectedProject.value);
        } catch (error) {
            API.showNotification(error.message || 'No se pudo añadir al miembro.', 'error');
        }
    };

    const formatDate = (isoDate) => {
      if (!isoDate) return '-';
      return new Date(isoDate).toLocaleDateString('es-CL');
    };

    onMounted(() => {
      const userData = sessionStorage.getItem('biocare_user');
      if (!userData) {
        window.location.href = '/login.html';
        return;
      }
      user.value = JSON.parse(userData);
      loadProjects();
    });

    return {
      user,
      projects,
      loading,
      selectedProject,
      members,
      newMemberEmail,
      showCreateModal,
      newProject,
      loadProjects,
      selectProject,
      openCreateModal,
      closeModal,
      createProject,
      addMember,
      formatDate
    };
  }
}).mount('#projects-app');