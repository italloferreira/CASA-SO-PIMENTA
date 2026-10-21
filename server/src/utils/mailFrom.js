// Remetente dos emails a partir de SENDGRID_FROM.
//
// Aceita "Nome <email>", "\"Nome\" <email>" ou so o email. Devolve { name, email }
// para o SendGrid: passando a string direto, as aspas do nome iam parar no email.

const DEFAULT_NAME = 'Casa Só Pimenta';
const DEFAULT_EMAIL = 'casasopimenta@gmail.com';

export function getMailFrom(raw = process.env.SENDGRID_FROM) {
  const value = String(raw || '').trim();
  if (!value) return { name: DEFAULT_NAME, email: DEFAULT_EMAIL };

  const match = value.match(/^(.*?)\s*<([^>]+)>$/);
  if (!match) return { name: DEFAULT_NAME, email: value };

  const name = match[1].trim().replace(/^["']|["']$/g, '').trim();
  return { name: name || DEFAULT_NAME, email: match[2].trim() };
}
