const UpdateModal = {
  props: {
    show: Boolean
  },
  emits: ['close'],
  setup(props, { emit }) {
    const noMostrarMas = ref(false);
    const closeModal = () => {
      emit('close', noMostrarMas.value);
    };
    return {
      noMostrarMas,
      closeModal
    };
  },
  template: `
    <div class="modal" v-if="show">
      <div class="modal-content" style="max-width: 550px;">
        <div class="update-modal-header">
          <i class="fa-solid fa-rocket"></i>
          <h2>¡Novedades en BiocareTask!</h2>
        </div>
        <div class="modal-body">
          <p>Hemos lanzado una gran actualización con nuevas funciones y un diseño renovado:</p>
          <ul class="update-list">
            
            <li>
              <strong><i class="fa-solid fa-book-atlas"></i> Nueva Biblioteca de Fichas Técnicas:</strong>
              <span class="update-description">Accede a una nueva sección dedicada para subir, buscar y gestionar todas las fichas técnicas de productos en formato PDF.</span>
            </li>

            <li>
              <strong><i class="fa-solid fa-wand-magic-sparkles"></i> Rediseño de Interfaz y Navegación:</strong>
              <span class="update-description">Hemos unificado el header y mejorado el diseño general de la aplicación para una experiencia más limpia y profesional.</span>
            </li>
            
            <li>
              <strong><i class="fa-solid fa-clipboard-check"></i> Finalización de Tareas Mejorada:</strong>
              <span class="update-description">Ahora puedes adjuntar un archivo como comprobante y añadir una nota de cierre al finalizar una tarea.</span>
            </li>
            
            <li>
              <strong><i class="fa-solid fa-at"></i> Menciones en Comentarios:</strong>
              <span class="update-description">Etiqueta a tus compañeros usando "@Nombre" para enviarles una notificación directa.</span>
            </li>
          </ul>
          <p>¡Esperamos que estas mejoras te sean de gran utilidad!</p>
        </div>
        <div class="modal-footer">
          <div class="dont-show-again">
            <input type="checkbox" id="no-mostrar-mas" v-model="noMostrarMas">
            <label for="no-mostrar-mas">No volver a mostrar</label>
          </div>
          <button @click="closeModal" class="btn-create">
            <i class="fa-solid fa-check"></i> Entendido
          </button>
        </div>
      </div>
    </div>
  `
};