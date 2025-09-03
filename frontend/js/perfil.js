// frontend/js/perfil.js
const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    const user = ref({});
    const tareasAsignadas = ref([]);
    const historial = ref({ creadas: 0, asignadas: 0, completadas: 0 });
    const uploading = ref(false);
    const showDropdown = ref(false);

    const passwords = ref({
      current: '',
      new: '',
      confirm: ''
    });

    
    // Hacemos el inicio de sesión más robusto para evitar errores
    try {
      const userData = localStorage.getItem('biocare_user');
      if (!userData) {
        // Si no hay datos, redirigir al login
        window.location.href = '/login';
      } else {
        // Intentamos parsear los datos, si falla, lo capturamos
        user.value = JSON.parse(userData);
      }
    } catch (error) {
      // Si los datos están corruptos, limpiamos y redirigimos
      console.error("Error al parsear datos de usuario, redirigiendo al login:", error);
      localStorage.removeItem('biocare_user');
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    
    const toggleDropdown = () => { showDropdown.value = !showDropdown.value; };
    const logout = () => {
      localStorage.removeItem('biocare_user');
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    };

    const avatarStyle = computed(() => ({
      'background-image': user.value.avatar_url ? `url('${user.value.avatar_url}')` : 'none',
    }));

    const cargarTareas = async () => {
      if (!user.value.id) return;
      try {
        const [asignadasRes, creadasRes] = await Promise.all([
          API.get(`/api/tasks?assigned_to=${user.value.id}`),
          API.get(`/api/tasks?created_by=${user.value.id}`)
        ]);

        tareasAsignadas.value = asignadasRes || [];
        const tareasCreadas = creadasRes || [];
        
        historial.value.asignadas = tareasAsignadas.value.length;
        historial.value.creadas = tareasCreadas.length;
        historial.value.completadas = tareasAsignadas.value.filter(t => t.status === 'completada').length;

      } catch (error) {
        console.error("Error al cargar el historial de tareas:", error);
        API.showNotification('No se pudo cargar el historial de tareas.', 'error');
      }
    };

    const handleAvatarUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            return API.showNotification('Por favor, selecciona un archivo de imagen.', 'error');
        }
        if (file.size > 5 * 1024 * 1024) {
            return API.showNotification('La imagen no debe pesar más de 5MB.', 'error');
        }

        uploading.value = true;
        const formData = new FormData();
        formData.append('avatar', file);

        try {
            const result = await API.upload('/api/user/avatar', formData);
            
            user.value.avatar_url = result.avatar_url;
            localStorage.setItem('biocare_user', JSON.stringify(user.value));
            API.showNotification('Imagen de perfil actualizada', 'success');
        } catch (error) {
            API.showNotification(error.message || 'Error al subir la imagen', 'error');
        } finally {
            uploading.value = false;
        }
    };
    
    const changePassword = async () => {
        if (!passwords.value.current || !passwords.value.new || !passwords.value.confirm) {
            return API.showNotification('Por favor, completa todos los campos de contraseña', 'error');
        }
        if (passwords.value.new !== passwords.value.confirm) {
            return API.showNotification('Las nuevas contraseñas no coinciden', 'error');
        }
        if (passwords.value.new.length < 6) {
            return API.showNotification('La nueva contraseña debe tener al menos 6 caracteres', 'error');
        }

        try {
            await API.put('/api/user/password', {
                currentPassword: passwords.value.current,
                newPassword: passwords.value.new
            });
            API.showNotification('Contraseña actualizada con éxito', 'success');
            passwords.value = { current: '', new: '', confirm: '' };
        } catch (error) {
            API.showNotification(error.message || 'Error al cambiar la contraseña', 'error');
        }
    };
    
    const updatePreferences = async () => {
      try {
        const payload = {
          email_notifications: user.value.email_notifications ? 1 : 0
        };
        const response = await API.put('/api/user/preferences', payload);
        
        // Actualizamos la copia local en localStorage
        const localUser = JSON.parse(localStorage.getItem('biocare_user'));
        localUser.email_notifications = payload.email_notifications;
        localStorage.setItem('biocare_user', JSON.stringify(localUser));

        API.showNotification('Preferencias guardadas.', 'success');
      } catch (error) {
        API.showNotification('No se pudieron guardar las preferencias.', 'error');
        // Revertimos el cambio visual si falla la API
        user.value.email_notifications = !user.value.email_notifications;
      }
    };

    onMounted(() => {
      cargarTareas();
    });

    return {
      user,
      tareasAsignadas,
      historial,
      uploading,
      avatarStyle,
      showDropdown,
      toggleDropdown,
      logout,
      passwords,
      changePassword,
      handleAvatarUpload,
      updatePreferences
    };
  }
}).mount('#app');