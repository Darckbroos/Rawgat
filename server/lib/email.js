// Envío de emails transaccionales vía Resend (https://resend.com). Se usa
// para la confirmación de cuenta de cliente (server/routes/customers.js) y
// para la newsletter: confirmación de suscripción y envío del código
// (server/routes/newsletter.js).
//
// Sin RESEND_API_KEY configurada, no se corta el registro: se deja constancia
// en la consola del servidor (con el link de confirmación, para poder probar
// el flujo a mano) y se sigue — mismo criterio "modo demo" que ya se usa acá
// para PayPal cuando falta PAYPAL_CLIENT_SECRET.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'RAWGAT <onboarding@resend.dev>';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function sendVerificationEmail({ to, name, verifyUrl }) {
  const subject = 'Confirm your RAWGAT account';
  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color:#12181d;">
      <h2 style="margin-bottom: 4px;">Hi ${escapeHtml(name)},</h2>
      <p>Thanks for creating a RAWGAT account. Confirm your email address to activate it:</p>
      <p style="margin: 28px 0;">
        <a href="${verifyUrl}" style="background:#c2542c;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Confirm my email</a>
      </p>
      <p style="color:#666;font-size:13px;">This link expires in 24 hours. If you didn't create this account, you can safely ignore this email.</p>
    </div>
  `;

  if (!RESEND_API_KEY) {
    console.warn(`[RAWGAT] RESEND_API_KEY no está configurada — no se envió el email de confirmación a ${to}.`);
    console.warn(`[RAWGAT] Link de confirmación (para probar el flujo a mano mientras tanto): ${verifyUrl}`);
    return { sent: false, reason: 'no-api-key' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[RAWGAT] Resend respondió ${res.status} al enviar a ${to}:`, body);
      console.warn(`[RAWGAT] Link de confirmación (para probar el flujo a mano mientras tanto): ${verifyUrl}`);
      return { sent: false, reason: 'api-error' };
    }
    return { sent: true };
  } catch (err) {
    console.error('[RAWGAT] Error de red enviando email de confirmación:', err.message);
    console.warn(`[RAWGAT] Link de confirmación (para probar el flujo a mano mientras tanto): ${verifyUrl}`);
    return { sent: false, reason: 'network-error' };
  }
}

// Envío genérico (mismo modo demo: sin RESEND_API_KEY se deja el enlace en
// la consola para poder probar el flujo a mano).
async function sendEmail({ to, subject, html, logLabel, logUrl }) {
  if (!RESEND_API_KEY) {
    console.warn(`[RAWGAT] RESEND_API_KEY no está configurada — no se envió "${logLabel}" a ${to}.`);
    if (logUrl) console.warn(`[RAWGAT] Enlace (para probar el flujo a mano): ${logUrl}`);
    return { sent: false, reason: 'no-api-key' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[RAWGAT] Resend respondió ${res.status} al enviar "${logLabel}" a ${to}:`, body);
      if (logUrl) console.warn(`[RAWGAT] Enlace (para probar el flujo a mano): ${logUrl}`);
      return { sent: false, reason: 'api-error' };
    }
    return { sent: true };
  } catch (err) {
    console.error(`[RAWGAT] Error de red enviando "${logLabel}":`, err.message);
    return { sent: false, reason: 'network-error' };
  }
}

// Textos de los emails de la newsletter: [provisional] — pendientes de
// revisión por Marketing (el informe de maquetación no los define).
const BUTTON_STYLE = 'background:#c2542c;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;';
const WRAP_START = '<div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color:#12181d;">';

function unsubscribeFooter(unsubscribeUrl) {
  return `<p style="color:#888;font-size:12px;margin-top:32px;">You're receiving this because you joined the RAWGAT list. <a href="${unsubscribeUrl}" style="color:#888;">Unsubscribe</a></p>`;
}

function sendNewsletterConfirmEmail({ to, confirmUrl, unsubscribeUrl }) {
  const html = `${WRAP_START}
      <h2 style="margin-bottom: 4px;">Confirm you want to join the RAWGAT list</h2>
      <p>Click the button to confirm your email. We'll send your code right after.</p>
      <p style="margin: 28px 0;"><a href="${confirmUrl}" style="${BUTTON_STYLE}">Confirm my email</a></p>
      <p style="color:#666;font-size:13px;">This link expires in 48 hours. If you didn't sign up, ignore this email and you won't hear from us.</p>
      ${unsubscribeFooter(unsubscribeUrl)}
    </div>`;
  return sendEmail({ to, subject: 'Confirm your RAWGAT subscription', html, logLabel: 'confirmación newsletter', logUrl: confirmUrl });
}

function sendNewsletterCodeEmail({ to, code, percent, unsubscribeUrl, shopUrl }) {
  const html = `${WRAP_START}
      <h2 style="margin-bottom: 4px;">You're on the list.</h2>
      <p>Here's your code for ${Number(percent) || 0}% off our first batch:</p>
      <p style="font-family: 'Courier New', monospace; font-size: 22px; font-weight: bold; letter-spacing: 2px; background:#f6f4ef; padding: 14px 18px; border-radius: 8px; display:inline-block;">${escapeHtml(code)}</p>
      <p style="margin: 24px 0;"><a href="${shopUrl}" style="${BUTTON_STYLE}">Shop the tools</a></p>
      ${unsubscribeFooter(unsubscribeUrl)}
    </div>`;
  return sendEmail({ to, subject: 'Your RAWGAT code', html, logLabel: `código newsletter ${code}` });
}

module.exports = { sendVerificationEmail, sendNewsletterConfirmEmail, sendNewsletterCodeEmail };
