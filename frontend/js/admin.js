const { createApp, ref, onMounted, computed } = Vue;

createApp({
  setup() {
    const user = ref({});
    const allUsers = ref([]);
    const loading = ref(true);
    const searchTerm = ref('');

    // Estado de los modales
    const showModal = ref(false);
    const showDeleteModal = ref(false);
    const isEditing = ref(false);

    // Datos para los modales
    const modalTitle = ref('');
    const editableUser = ref({});
    const userToDelete = ref({});

    // Estado del header
    const showDropdown = ref(false);

    const loadUsers = async () => {
      try {
        loading.value = true;
        const usersData = await API.get('/api/admin/users');
        allUsers.value = usersData || [];
      } catch (error) {
        API.showNotification('No se pudieron cargar los usuarios.', 'error');
      } finally {
        loading.value = false;
      }
    };

    const filteredUsers = computed(() => {
      if (!searchTerm.value) {
        return allUsers.value;
      }
      const term = searchTerm.value.toLowerCase();
      return allUsers.value.filter(u =>
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term)
      );
    });

    const openCreateModal = () => {
      isEditing.value = false;
      modalTitle.value = 'Crear Nuevo Usuario';
      editableUser.value = { name: '', email: '', office: 'Valparaíso', role: 'user', password: '' };
      showModal.value = true;
    };

    const openEditModal = (userToEdit) => {
      isEditing.value = true;
      modalTitle.value = 'Editar Usuario';
      editableUser.value = { ...userToEdit }; // Copiamos el usuario para no modificar el original
      showModal.value = true;
    };

    const openDeleteConfirm = (user) => {
      userToDelete.value = user;
      showDeleteModal.value = true;
    };

    const closeModal = () => {
      showModal.value = false;
      showDeleteModal.value = false;
      editableUser.value = {};
      userToDelete.value = {};
    };

    // AÑADIR ESTA FUNCIÓN DENTRO DEL SETUP
const toggleUserStatus = async (userToToggle) => {
    const newStatus = userToToggle.is_active ? 0 : 1;
    const actionText = newStatus ? 'activar' : 'desactivar';

    try {
        await API.put(`/api/admin/users/${userToToggle.id}/status`, { is_active: newStatus });
        API.showNotification(`Usuario ${actionText}do.`, 'success');
        await loadUsers(); // Recargar la lista para reflejar el cambio
    } catch (error) {
        API.showNotification(error.message || `No se pudo ${actionText} al usuario.`, 'error');
    }
};

    const saveUser = async () => {
      try {
        if (isEditing.value) {
          // Lógica de actualización
          const { id, ...userData } = editableUser.value;
          await API.put(`/api/admin/users/${id}`, userData);
          API.showNotification('Usuario actualizado.', 'success');
        } else {
          // Lógica de creación
          await API.post('/api/admin/users', editableUser.value);
          API.showNotification('Usuario creado.', 'success');
        }
        await loadUsers(); // Recargar la lista de usuarios
        closeModal();
      } catch (error) {
        API.showNotification(error.message || 'Ocurrió un error.', 'error');
      }
    };

    const confirmDelete = async () => {
      try {
        await API.delete(`/api/admin/users/${userToDelete.value.id}`);
        API.showNotification('Usuario eliminado.', 'success');
        await loadUsers(); // Recargar la lista
        closeModal();
      } catch (error) {
        API.showNotification(error.message || 'No se pudo eliminar al usuario.', 'error');
      }
    };

    const toggleDropdown = () => {
      showDropdown.value = !showDropdown.value;
      document.body.classList.toggle('overlay-active', showDropdown.value);
    };

    const logout = () => {
      sessionStorage.removeItem('biocare_user');
      sessionStorage.removeItem('auth_token');
      window.location.href = '/login.html';
    };

    onMounted(() => {
      const userData = sessionStorage.getItem('biocare_user');
      if (!userData) {
        window.location.href = '/login.html';
        return;
      }
      user.value = JSON.parse(userData);

      // Redirigir si no es admin
      if (user.value.role !== 'admin') {
        API.showNotification('Acceso no autorizado.', 'error');
        window.location.href = '/tablero.html';
        return;
      }

      loadUsers();
    });

    return {
      user,
      allUsers,
      loading,
      searchTerm,
      filteredUsers,
      showModal,
      showDeleteModal,
      isEditing,
      modalTitle,
      editableUser,
      userToDelete,
      openCreateModal,
      openEditModal,
      openDeleteConfirm,
      closeModal,
      saveUser,
      confirmDelete,
      showDropdown,
      toggleDropdown,
      logout,
      toggleUserStatus 
    };
  }
}).mount('#admin-app');