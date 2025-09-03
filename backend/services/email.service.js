// backend/services/email.service.js
const nodemailer = require('nodemailer');

// Configuramos el "transporter" una sola vez
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
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
    from: `"BiocareTask" <${process.env.EMAIL_USER}>`,
    to: to,
    subject: subject,
    html: html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Correo enviado exitosamente a: ${to}`);
  } catch (error) {
    console.error(`❌ Error al enviar correo a ${to}:`, error);
  }
};

module.exports = { sendEmail };