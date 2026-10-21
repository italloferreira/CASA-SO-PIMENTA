import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import { getMailFrom } from '../src/utils/mailFrom.js';

const require = createRequire(import.meta.url);
const { EmailAddress } = require('@sendgrid/helpers').classes;

test('remetente com nome entre aspas não leva as aspas para o email', () => {
  assert.deepEqual(getMailFrom('"Casa Só Pimenta" <casasopimenta@gmail.com>'), {
    name: 'Casa Só Pimenta',
    email: 'casasopimenta@gmail.com'
  });
});

test('remetente com nome sem aspas', () => {
  assert.deepEqual(getMailFrom('Casa Só Pimenta <loja@exemplo.com>'), {
    name: 'Casa Só Pimenta',
    email: 'loja@exemplo.com'
  });
});

test('remetente só com email usa o nome padrão', () => {
  assert.deepEqual(getMailFrom('loja@exemplo.com'), {
    name: 'Casa Só Pimenta',
    email: 'loja@exemplo.com'
  });
});

test('sem SENDGRID_FROM usa o remetente padrão', () => {
  assert.deepEqual(getMailFrom(''), { name: 'Casa Só Pimenta', email: 'casasopimenta@gmail.com' });
  assert.deepEqual(getMailFrom(undefined), { name: 'Casa Só Pimenta', email: 'casasopimenta@gmail.com' });
});

test('SendGrid recebe nome e email limpos', () => {
  const parsed = EmailAddress.create(getMailFrom('"Casa Só Pimenta" <casasopimenta@gmail.com>')).toJSON();
  assert.deepEqual(parsed, { name: 'Casa Só Pimenta', email: 'casasopimenta@gmail.com' });
});
