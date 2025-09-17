// backend/services/email.service.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.resend.com',      // Servidor SMTP de Resend
  secure: true,                 // Usa SSL
  port: 465,                    // Puerto para SSL
  auth: {
    user: 'resend',             // Este valor es siempre 'resend'
    pass: process.env.RESEND_API_KEY // Tu nueva variable de entorno
  }
});

/**
 * Función para enviar un correo electrónico.
 * @param {string} to - El destinatario del correo.
 * @param {string} subject - El asunto del correo.
 * @param {string} html - El contenido HTML del correo.
 */
const sendEmail = async (to, subject, html) => {
  const mailOptions = {
    // IMPORTANTE: Cambia el remitente. Usa el de prueba o tu dominio verificado.
    from: '"BiocareTask" <notificaciones@biocaretask.site>',
    to: to,
    subject: subject,
    html: html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Correo enviado exitosamente a: ${to} vía Resend`);
  } catch (error) {
    console.error(`❌ Error al enviar correo a ${to} vía Resend:`, error);
  }
};

module.exports = { sendEmail };