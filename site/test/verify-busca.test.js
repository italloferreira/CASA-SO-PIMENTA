import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, '..');
const API_BASE = process.env.API_TEST_URL || 'http://localhost:3333';
const PRODUTOS_JS = readFileSync(path.join(SITE_DIR, 'assets/js/produtos.js'), 'utf-8');

function normalizar(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/* Executa produtos.js com um DOM mínimo e a API real.
   atrasos: { trecho_da_url: ms } atrasa respostas cujo URL contém o trecho. */
async function montarPagina(categoria, atrasos = {}) {
  const urls = [];
  let pendentes = 0;
  let onDomReady = null;
  let onInput = null;
  let observerCallback = null;

  const section = {
    dataset: { categoria },
    innerHTML: '',
    filhos: [],
    appendChild(el) { this.filhos.push(el); }
  };
  const input = { value: '', addEventListener(tipo, fn) { if (tipo === 'input') onInput = fn; } };

  const document = {
    addEventListener(tipo, fn) { if (tipo === 'DOMContentLoaded') onDomReady = fn; },
    querySelector(sel) {
      if (sel === '.produtos-section') return section;
      if (sel === '.pesquisa') return input;
      return null;
    },
    createElement() {
      const el = { style: {}, remove() { section.filhos = section.filhos.filter((f) => f !== el); } };
      return el;
    }
  };

  // lê o corpo inteiro antes de liberar a resposta: assim, quando pendentes chega a 0,
  // o r.json() do produtos.js resolve em microtasks e a tela já está desenhada
  function fetchRastreado(url) {
    urls.push(url);
    pendentes++;
    const atraso = Object.keys(atrasos).find((k) => url.includes(k));
    return esperar(atraso ? atrasos[atraso] : 0)
      .then(() => fetch(url))
      .then((r) => r.text().then((corpo) => ({
        ok: r.ok,
        status: r.status,
        json: () => Promise.resolve(JSON.parse(corpo))
      })))
      .finally(() => { pendentes--; });
  }

  const ctx = {
    document,
    fetch: fetchRastreado,
    imgUrl: (p) => p,
    IntersectionObserver: class {
      constructor(cb) { observerCallback = cb; }
      observe() {}
      disconnect() {}
    },
    console
  };
  ctx.window = ctx;
  ctx.API_BASE_URL = API_BASE;
  ctx.escapeHtml = (s) => s;
  ctx.CATEGORIAS_GRANEL_100G = [];
  vm.createContext(ctx);
  vm.runInContext(PRODUTOS_JS, ctx);
  onDomReady();

  async function aguardar() {
    await esperar(0);
    while (pendentes > 0) await esperar(20);
    await esperar(0);
  }

  await aguardar();
  assert.ok(!section.innerHTML.includes('Não foi possível carregar'), 'API indisponível em ' + API_BASE + ' — o servidor está rodando?');

  return {
    urls,
    aguardar,
    nomes: () => [...section.innerHTML.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1].replace(/<[^>]+>/g, '')),
    html: () => section.innerHTML,
    temSentinel: () => section.filhos.length > 0,
    digitar(valor) { input.value = valor; onInput.call(input); },
    rolarAteOFim() { if (observerCallback) observerCallback([{ isIntersecting: true }]); }
  };
}

async function totalDaCategoria(slug) {
  const r = await fetch(API_BASE + '/api/products?category=' + slug + '&limit=1');
  return (await r.json()).total;
}

test('busca em temperos mostra apenas produtos de temperos com o termo no nome', async () => {
  assert.ok(await totalDaCategoria('temperos') > 20, 'temperos precisa ter mais de 20 produtos para exercitar a busca no servidor');

  const pagina = await montarPagina('temperos');
  pagina.digitar('açu');
  await pagina.aguardar();

  assert.ok(!pagina.nomes().some((n) => /amendoim/i.test(n)), 'Amendoim Doce (tira-gostos) não pode aparecer');
  for (const n of pagina.nomes()) assert.ok(normalizar(n).includes('acu'), '"' + n + '" não contém "açu"');

  const buscas = pagina.urls.filter((u) => u.includes('/search'));
  assert.ok(buscas.length >= 1, 'deveria consultar o servidor, pois a categoria não está toda carregada');
  for (const u of buscas) assert.ok(u.includes('category=temperos'), 'busca no servidor sem a categoria: ' + u);
});

test('"vinagrete" não traz mostardas nem vinagres', async () => {
  const pagina = await montarPagina('temperos');
  pagina.digitar('vinagrete');
  await pagina.aguardar();

  assert.ok(pagina.nomes().length >= 1, 'o produto Vinagrete deveria aparecer');
  for (const n of pagina.nomes()) assert.ok(normalizar(n).includes('vinagrete'), '"' + n + '" não deveria aparecer');
});

test('apagar a pesquisa volta a lista completa e a rolagem infinita', async () => {
  const pagina = await montarPagina('temperos');
  const inicial = pagina.nomes();
  assert.equal(inicial.length, 20);

  pagina.digitar('vinagrete');
  await pagina.aguardar();
  assert.ok(!pagina.temSentinel(), 'sem "Carregando mais..." durante a pesquisa');

  pagina.digitar('');
  await pagina.aguardar();
  assert.deepEqual(pagina.nomes(), inicial);
  assert.ok(pagina.temSentinel(), 'rolagem infinita deveria voltar');
});

test('rolar a página durante a pesquisa não mistura produtos fora do filtro', async () => {
  const pagina = await montarPagina('temperos');
  pagina.digitar('vinagrete');
  await pagina.aguardar();
  const resultado = pagina.nomes();

  pagina.rolarAteOFim();
  await pagina.aguardar();
  assert.deepEqual(pagina.nomes(), resultado);
});

test('página que termina de carregar depois da pesquisa não sobrescreve o resultado', async () => {
  const pagina = await montarPagina('temperos', { 'offset=20': 300 });
  pagina.rolarAteOFim(); // dispara o carregamento da 2ª página (lenta)
  pagina.digitar('vinagrete');
  await pagina.aguardar();

  for (const n of pagina.nomes()) assert.ok(normalizar(n).includes('vinagrete'), '"' + n + '" não deveria aparecer');
});

test('resposta antiga do servidor não sobrescreve a pesquisa mais nova', async () => {
  // os dois termos não existem nos 20 primeiros produtos, então ambos vão ao servidor
  const pagina = await montarPagina('temperos', { 'q=zzzxxyyqq': 400 });
  pagina.digitar('zzzxxyyqq'); // resposta lenta (vazia)
  pagina.digitar('vinagrete'); // resposta rápida
  await pagina.aguardar();

  assert.ok(pagina.nomes().length >= 1);
  for (const n of pagina.nomes()) assert.ok(normalizar(n).includes('vinagrete'), 'resultado antigo apareceu: "' + n + '"');
});

test('categoria pequena (toda carregada) filtra localmente sem chamar o servidor', async () => {
  const categorias = await (await fetch(API_BASE + '/api/categories')).json();
  let slug = null;
  for (const c of categorias) {
    const total = await totalDaCategoria(c.slug);
    if (total >= 2 && total <= 20) { slug = c.slug; break; }
  }
  assert.ok(slug, 'nenhuma categoria com 2 a 20 produtos para testar');

  const pagina = await montarPagina(slug);
  const primeiro = pagina.nomes()[0];
  const termo = normalizar(primeiro).slice(0, 4);
  pagina.digitar(termo.toUpperCase());
  await pagina.aguardar();

  assert.ok(pagina.nomes().includes(primeiro), '"' + primeiro + '" deveria ser encontrado por "' + termo.toUpperCase() + '"');
  for (const n of pagina.nomes()) assert.ok(normalizar(n).includes(termo));
  assert.ok(!pagina.urls.some((u) => u.includes('/search')), 'não deveria chamar o servidor');
});

test('busca sem resultado mostra a mensagem de vazio', async () => {
  const pagina = await montarPagina('temperos');
  pagina.digitar('zzzxxyyqq');
  await pagina.aguardar();
  assert.ok(pagina.html().includes('Nenhum produto encontrado'));
});
