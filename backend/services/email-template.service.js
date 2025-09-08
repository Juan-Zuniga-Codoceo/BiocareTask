// backend/services/email-template.service.js

const createEmailTemplate = ({ title, recipientName, mainContentHtml, buttonUrl, buttonText }) => {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const logoUrl = `${appUrl}/assets/logo.png`;

  return `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: auto; border: 1px solid #EAECEE; border-radius: 8px; padding: 20px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="text-align: center; margin-bottom: 25px;">
        <img src="${logoUrl}" alt="BiocareTask Logo" style="width: 120px; height: auto;">
        <h1 style="color: #049DD9; font-size: 24px; margin-top: 15px; margin-bottom: 0;">BiocareTask</h1>
      </div>
      <h2 style="color: #34495E; text-align: center; font-size: 20px; border-bottom: 2px solid #97BF04; padding-bottom: 15px; margin-bottom: 25px;">${title}</h2>
      <p style="color: #34495E; font-size: 16px; line-height: 1.5;">Hola ${recipientName},</p>
      ${mainContentHtml}
      <div style="text-align: center; margin: 35px 0;">
        <a href="${buttonUrl}" 
           style="background-color: #97BF04; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px; display: inline-block; transition: background-color 0.3s ease;">
          ${buttonText}
        </a>
      </div>
      <p style="text-align: center; color: #BDC3C7; font-size: 12px; margin-top: 25px;">
        Este es un correo automático de BiocareTask. Por favor, no respondas a este mensaje.
      </p>
    </div>
  `;
};

module.exports = { createEmailTemplate };