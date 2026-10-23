// Envio de emails. Usa o Brevo (plano grátis: 300 emails/dia) quando BREVO_API_KEY
// está definida; senão cai para o SendGrid. Mesmo formato de sgMail.send:
// { to, from: { name, email }, subject, html }.

import sgMail from '@sendgrid/mail';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

function hasSendGrid() {
  const key = process.env.SENDGRID_API_KEY;
  return !!key && key !== 'SUA_CHAVE_AQUI';
}

export function isMailConfigured() {
  return !!process.env.BREVO_API_KEY || hasSendGrid();
}

async function sendWithBrevo({ to, from, subject, html }) {
  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      sender: { name: from.name, email: from.email },
      to: [{ email: to }],
      subject,
      htmlContent: html
    })
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error('Brevo ' + res.status + ': ' + (body.message || res.statusText));
  }
}

export async function sendMail(message) {
  if (process.env.BREVO_API_KEY) return sendWithBrevo(message);

  if (hasSendGrid()) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    return sgMail.send(message);
  }

  throw new Error('Nenhum provedor de email configurado (BREVO_API_KEY ou SENDGRID_API_KEY).');
}
