// Envío de emails transaccionales vía Resend (https://resend.com). Se usa
// solo para la confirmación de cuenta de cliente (ver server/routes/customers.js).
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

module.exports = { sendVerificationEmail };
