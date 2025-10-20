const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    // --- ESTADO DE LA APLICACIÓN ---
    const user = ref(null);
    const allSheets = ref([]);
    const categories = ref([]);
    const loading = ref(true);
    const searchTerm = ref('');
    const categoryFilter = ref('');
    const showDropdown = ref(false);

    // --- ESTADO DE LOS MODALES ---
    const showUploadModal = ref(false);
    const showDeleteModal = ref(false);
    const sheetToDelete = ref(null);
    const isUploading = ref(false);

    // --- FORMULARIO DE NUEVA FICHA ---
    const newSheet = ref({
      product_name: '',
      model: '',
      category_id: '',
      tags: '',
      sheetFile: null
    });
    const newCategoryName = ref('');

    // --- LÓGICA DE CARGA DE DATOS ---
    const loadData = async () => {
      loading.value = true;
      try {
        const [sheetsRes, categoriesRes] = await Promise.all([
          API.get('/api/sheets'),
          API.get('/api/categories')
        ]);
        allSheets.value = sheetsRes || [];
        categories.value = categoriesRes || [];
      } catch (error) {
        API.showNotification('Error al cargar los datos de la biblioteca.', 'error');
      } finally {
        loading.value = false;
      }
    };

    // --- FILTRADO Y BÚSQUEDA (PROPIEDAD COMPUTADA) ---
    const filteredSheets = computed(() => {
        return allSheets.value.filter(sheet => {
            const searchMatch = !searchTerm.value ||
                sheet.product_name.toLowerCase().includes(searchTerm.value.toLowerCase()) ||
                (sheet.model && sheet.model.toLowerCase().includes(searchTerm.value.toLowerCase())) ||
                (sheet.tags && sheet.tags.toLowerCase().includes(searchTerm.value.toLowerCase()));
            
            const categoryMatch = !categoryFilter.value || sheet.category_id == categoryFilter.value;

            return searchMatch && categoryMatch;
        });
    });
    
    const clearFilters = () => {
        searchTerm.value = '';
        categoryFilter.value = '';
    };
    
    // ✨ INICIO DE LA CORRECCIÓN ✨
    // --- FUNCIÓN DE UTILIDAD ---
    const formatDate = (isoDate) => {
      if (!isoDate) return 'No especificada';
      try {
        // Usamos un formato simple para las tarjetas
        return new Date(isoDate).toLocaleDateString('es-CL', {
          day: '2-digit', month: '2-digit', year: 'numeric'
        });
      } catch { return isoDate; }
    };
    // ✨ FIN DE LA CORRECCIÓN ✨

    // --- ACCIONES DE LAS FICHAS ---
    const downloadSheet = (sheet) => {
        const token = sessionStorage.getItem('auth_token');
        const downloadUrl = `/api/sheets/${sheet.id}/download`;

        fetch(downloadUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => {
            if (!res.ok) {
                throw new Error('No se pudo descargar el archivo.');
            }
            return res.blob().then(blob => ({ blob, headers: res.headers }));
        })
        .then(({ blob, headers }) => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;

            const contentDisposition = headers.get('Content-Disposition');
            let fileName = sheet.file_name;
            if (contentDisposition) {
                const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
                if (fileNameMatch && fileNameMatch.length > 1) {
                    fileName = fileNameMatch[1];
                }
            }
            a.download = fileName;
            
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        })
        .catch(() => API.showNotification('Error al iniciar la descarga.', 'error'));
    };

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file && file.type === 'application/pdf') {
            if (file.size > 15 * 1024 * 1024) { // 15MB
                API.showNotification('El archivo PDF no debe exceder los 15MB.', 'error');
                event.target.value = '';
                return;
            }
            newSheet.value.sheetFile = file;
        } else if (file) {
            API.showNotification('Por favor, selecciona un archivo PDF.', 'warning');
            event.target.value = '';
        }
    };
    
    const createNewCategory = async () => {
        if (!newCategoryName.value.trim()) {
            return API.showNotification('El nombre de la nueva categoría no puede estar vacío.', 'warning');
        }
        try {
            const newCategory = await API.post('/api/categories', { name: newCategoryName.value });
            categories.value.push(newCategory);
            categories.value.sort((a, b) => a.name.localeCompare(b.name));
            newSheet.value.category_id = newCategory.id;
            newCategoryName.value = '';
            API.showNotification('Categoría creada y seleccionada.', 'success');
        } catch(error) {
            API.showNotification(error.message || 'No se pudo crear la categoría.', 'error');
        }
    };

    const uploadSheet = async () => {
      if (!newSheet.value.product_name.trim()) {
        return API.showNotification('El nombre del producto es requerido.', 'warning');
      }
      if (!newSheet.value.sheetFile) {
        return API.showNotification('Debes seleccionar un archivo PDF.', 'warning');
      }

      isUploading.value = true;
      const formData = new FormData();
      formData.append('product_name', newSheet.value.product_name);
      formData.append('model', newSheet.value.model);
      formData.append('category_id', newSheet.value.category_id);
      formData.append('tags', newSheet.value.tags);
      formData.append('sheetFile', newSheet.value.sheetFile);

      try {
        await API.upload('/api/sheets', formData);
        API.showNotification('Ficha técnica subida con éxito.', 'success');
        closeUploadModal();
        await loadData();
      } catch (error) {
        API.showNotification(error.message || 'Error al subir el archivo.', 'error');
      } finally {
        isUploading.value = false;
      }
    };

    const confirmDelete = async () => {
      if (!sheetToDelete.value) return;
      try {
        await API.delete(`/api/sheets/${sheetToDelete.value.id}`);
        API.showNotification('Ficha técnica eliminada.', 'success');
        closeDeleteModal();
        await loadData();
      } catch (error) {
        API.showNotification(error.message || 'No se pudo eliminar la ficha.', 'error');
      }
    };

    // --- MANEJO DE MODALES ---
    const openUploadModal = () => {
        newSheet.value = { product_name: '', model: '', category_id: '', tags: '', sheetFile: null };
        newCategoryName.value = '';
        const fileInput = document.getElementById('sheet-file-input');
        if (fileInput) fileInput.value = '';
        showUploadModal.value = true;
    };
    const closeUploadModal = () => showUploadModal.value = false;
    const openDeleteModal = (sheet) => { sheetToDelete.value = sheet; showDeleteModal.value = true; };
    const closeDeleteModal = () => { sheetToDelete.value = null; showDeleteModal.value = false; };

    // --- NAVEGACIÓN Y AUTENTICACIÓN ---
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
      if (userData) {
        user.value = JSON.parse(userData);
        loadData();
      } else {
        window.location.href = '/login.html';
      }
    });

    // --- RETORNO DE VALORES PARA LA PLANTILLA ---
    return {
      user,
      allSheets,
      categories,
      loading,
      searchTerm,
      categoryFilter,
      filteredSheets,
      showDropdown,
      showUploadModal,
      showDeleteModal,
      sheetToDelete,
      newSheet,
      isUploading,
      newCategoryName,
      clearFilters,
      downloadSheet,
      uploadSheet,
      confirmDelete,
      toggleDropdown,
      logout,
      openUploadModal,
      closeUploadModal,
      openDeleteModal,
      closeDeleteModal,
      handleFileSelect,
      createNewCategory,
      formatDate, // ✨ FUNCIÓN EXPUESTA A LA PLANTILLA ✨
    };
  }
}).mount('#app');

