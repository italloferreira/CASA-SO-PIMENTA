#!/usr/bin/env node
// Envia um email de recuperação de senha de TESTE para conferir a configuração do provedor.
// Uso: npm run email:teste -- voce@exemplo.com
// (o nome não começa com "test-" de propósito: o node --test executaria este arquivo e mandaria email)
import dotenv from 'dotenv';
import { sendMail, isMailConfigured } from './src/utils/mailer.js';
import { getMailFrom } from './src/utils/mailFrom.js';
import { forgotPasswordEmail } from './src/utils/emailTemplates.js';

dotenv.config();

// mensagens de erro mais comuns do Brevo e o que fazer em cada uma
const DICAS = [
  [/IP not authori|not verified/i, 'O Brevo bloqueou o IP deste servidor. Em Brevo > Segurança > IPs autorizados, autorize o IP ou desative o bloqueio automático.'],
  [/sender.*(not valid|invalid)|valid sender/i, 'O remetente (MAIL_FROM) não está verificado no Brevo. Em Remetentes, domínios e IPs dedicados, adicione e confirme o remetente.'],
  [/Key not found|unauthorized|401/i, 'A BREVO_API_KEY está errada ou foi apagada. Gere uma nova em SMTP e API > Chaves API.'],
  [/permission|not activated|account/i, 'A conta Brevo ainda não está liberada para envio. Confira se ela foi ativada (o Brevo pode pedir dados da empresa).']
];

async function main() {
  const destino = process.argv[2];
  const provedor = process.env.BREVO_API_KEY ? 'Brevo' : isMailConfigured() ? 'SendGrid' : null;
  const remetente = getMailFrom();

  console.log('Provedor ativo: ' + (provedor || 'nenhum (modo dev: o link só aparece no terminal)'));
  console.log('Remetente:      ' + remetente.name + ' <' + remetente.email + '>');

  if (!provedor) {
    console.log('\nPreencha BREVO_API_KEY no server/.env e rode de novo.');
    process.exit(1);
  }

  if (!destino || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) {
    console.log('\nInforme para quem enviar: npm run email:teste -- voce@exemplo.com');
    process.exit(1);
  }

  const link = (process.env.FRONTEND_URL || 'http://localhost:5500') + '/site/pages/login/reset-password/index.html?token=TESTE';

  try {
    await sendMail({
      to: destino,
      from: remetente,
      subject: '[TESTE] Recuperação de senha - Casa Só Pimenta',
      html: forgotPasswordEmail('Teste', link)
    });
    console.log('\nEnviado para ' + destino + '. Confira a caixa de entrada e o spam.');
    console.log('(o link do email é de teste e não redefine nenhuma senha)');
  } catch (err) {
    console.error('\nFalha ao enviar: ' + err.message);
    const dica = DICAS.find(([padrao]) => padrao.test(err.message));
    if (dica) console.error('Dica: ' + dica[1]);
    process.exit(1);
  }
}

main();
