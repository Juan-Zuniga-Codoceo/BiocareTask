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
          <p>Hemos implementado nuevas funciones para mejorar tu experiencia:</p>
          <ul class="update-list">
            
            <li>
              <strong><i class="fa-solid fa-clipboard-check"></i> Finalización de Tareas Mejorada:</strong>
              <span class="update-description">Ahora puedes adjuntar un archivo como comprobante y añadir una nota de cierre al finalizar una tarea.</span>
            </li>
            
            <li>
              <strong><i class="fa-solid fa-user-shield"></i> Rol de Administrador:</strong>
              <span class="update-description">Los superusuarios ahora pueden editar, eliminar y gestionar tareas de todo el equipo.</span>
            </li>
            <li>
              <strong><i class="fa-solid fa-at"></i> Menciones en Comentarios:</strong>
              <span class="update-description">Etiqueta a tus compañeros usando "@Nombre" para enviarles una notificación directa.</span>
            </li>
            <li>
              <strong><i class="fa-solid fa-screwdriver-wrench"></i> Corrección de Errores:</strong>
              <span class="update-description">Hemos mejorado la estabilidad general y los permisos de la plataforma.</span>
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