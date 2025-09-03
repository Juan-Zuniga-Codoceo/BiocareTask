
const { createApp, ref, computed, onMounted, watch } = Vue;

createApp({
  setup() {
    // ESTADO ORIGINAL (sin cambios)
    const user = ref({});
    const tareasAsignadas = ref([]);
    const historial = ref({ creadas: 0, asignadas: 0, completadas: 0 });
    const uploading = ref(false);
    const showDropdown = ref(false);
    const passwords = ref({ current: '', new: '', confirm: '' });

  
    // NUEVO: Creamos una variable booleana solo para el interruptor.
    const notificationsEnabled = ref(false);

    // MODIFICADO: La función ahora acepta el nuevo estado como argumento.
    const updatePreferences = async (isEnabled) => {
      try {
        const payload = { email_notifications: isEnabled ? 1 : 0 };
        await API.put('/api/user/preferences', payload);

        // Actualizamos de forma segura el localStorage y el estado local.
        const localUser = JSON.parse(localStorage.getItem('biocare_user'));
        if (localUser) {
          localUser.email_notifications = payload.email_notifications;
          user.value.email_notifications = payload.email_notifications; // Sincronizamos el objeto 'user' principal
          localStorage.setItem('biocare_user', JSON.stringify(localUser));
        }
        API.showNotification('Preferencias guardadas.', 'success');
      } catch (error) {
        API.showNotification('No se pudieron guardar las preferencias.', 'error');
        // Si falla, revertimos el cambio visual en el interruptor.
        notificationsEnabled.value = !isEnabled;
      }
    };

    // NUEVO: Usamos un "watcher" para sincronizar el estado.
    // Este watcher se ejecuta cuando el usuario hace clic en el interruptor.
    watch(notificationsEnabled, (newValue, oldValue) => {
      // El `typeof oldValue === 'boolean'` previene que se ejecute en la carga inicial.
      if (typeof oldValue === 'boolean') {
        updatePreferences(newValue);
      }
    });
    
    // MODIFICADO: Cargamos el usuario y sincronizamos el interruptor al inicio.
    const loadUserAndSyncToggle = () => {
      try {
        const userData = localStorage.getItem('biocare_user');
        if (!userData) {
          window.location.href = '/login';
          return;
        }
        user.value = JSON.parse(userData);
        // Sincronizamos el interruptor: 1 se convierte en true, 0 en false.
        notificationsEnabled.value = !!user.value.email_notifications;
      } catch (error) {
        console.error("Error al cargar datos de usuario:", error);
        localStorage.clear();
        window.location.href = '/login';
      }
    };
    

    // OTRAS FUNCIONES (sin cambios en su lógica interna)
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
        API.showNotification('No se pudo cargar el historial de tareas.', 'error');
      }
    };
    const handleAvatarUpload = async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      
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

    onMounted(() => {
      loadUserAndSyncToggle();
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
      notificationsEnabled,
    };
  }
}).mount('#app');