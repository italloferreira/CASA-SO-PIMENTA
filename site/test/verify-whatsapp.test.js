import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

/* Botão flutuante do WhatsApp criado pelo site-settings.js (DOM e fetch simulados, sem API). */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, '..');
const ler = (rel) => readFileSync(path.join(SITE_DIR, rel), 'utf-8');

function montar(settings) {
  const corpo = [];
  const cabeca = [];
  const el = (tag) => ({ tag, style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  let resolverFetch;
  const ctx = {
    API_BASE_URL: 'http://api.teste',
    document: {
      title: 'Casa Só Pimenta',
      head: { appendChild: (e) => cabeca.push(e) },
      body: { appendChild: (e) => corpo.push(e) },
      createElement: el,
      querySelector: (s) => (s === '.whatsapp-flutuante' ? corpo.find((e) => e.className === 'whatsapp-flutuante') || null : null),
      querySelectorAll: () => [],
      getElementById: () => null,
      addEventListener() {}
    },
    fetch: () => new Promise((r) => { resolverFetch = r; })
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(ler('assets/js/site-settings.js'), ctx);
  return {
    ctx, corpo, cabeca,
    async responder() {
      resolverFetch({ json: () => Promise.resolve({ settings }) });
      await new Promise((r) => setTimeout(r, 0));
    }
  };
}

test('whatsapp: botão aparece na hora com o número padrão, abre em nova aba e carrega o CSS', () => {
  const p = montar({});
  const botoes = p.corpo.filter((e) => e.className === 'whatsapp-flutuante');
  assert.equal(botoes.length, 1);
  const a = botoes[0];
  assert.match(a.href, /^https:\/\/wa\.me\/5531983143902\?text=/);
  assert.equal(a.target, '_blank');
  assert.match(a.rel, /noopener/);
  assert.equal(a.attrs['aria-label'], 'Fale conosco pelo WhatsApp');
  assert.ok(a.innerHTML.includes('/site/imgs/icones/whatsapp-flutuante.webp'));
  assert.ok(p.cabeca.some((e) => e.href === '/site/assets/css/whatsapp-flutuante.css'));
  assert.ok(existsSync(path.join(SITE_DIR, 'imgs/icones/whatsapp-flutuante.webp')));
  assert.ok(existsSync(path.join(SITE_DIR, 'assets/css/whatsapp-flutuante.css')));
});

test('whatsapp: número das configurações do admin substitui o padrão', async () => {
  const p = montar({ contact_phone: '(31) 3333-4444' });
  await p.responder();
  const a = p.corpo.find((e) => e.className === 'whatsapp-flutuante');
  assert.match(a.href, /^https:\/\/wa\.me\/553133334444\?text=/);
});

test('whatsapp: telefone inválido nas configurações mantém o padrão', async () => {
  const p = montar({ contact_phone: '123' });
  await p.responder();
  assert.match(p.corpo.find((e) => e.className === 'whatsapp-flutuante').href, /wa\.me\/5531983143902/);
});

test('whatsapp: formato do número (com/sem 55, DDD 55 do RS)', () => {
  const { ctx } = montar({});
  const num = (t) => (ctx.linkWhatsApp(t).match(/wa\.me\/(\d+)/) || [])[1];
  assert.equal(num('31983143902'), '5531983143902');
  assert.equal(num('+55 (31) 98314-3902'), '5531983143902');
  assert.equal(num('55 99999-8888'), '5555999998888', 'DDD 55 sem código do país ganha o 55');
  assert.equal(ctx.linkWhatsApp(''), '');
});
