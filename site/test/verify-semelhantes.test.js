import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

/* "Produtos semelhantes" na página do produto: estrutura (HTML/CSS/mapa) e comportamento com fetch simulado.
   Nenhum teste aqui depende da API rodando. */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, '..');
const ler = (rel) => readFileSync(path.join(SITE_DIR, rel), 'utf-8');

function carregarConfig() {
  const ctx = { location: { hostname: 'localhost', origin: 'http://localhost:3333' } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(ler('assets/js/config.js'), ctx);
  return ctx;
}

/* ---------------------------------------------------------------- mapa categoria -> página */

function paginasDeCategoria() {
  const achadas = {};
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'index.html') {
        const m = readFileSync(p, 'utf-8').match(/class="produtos-section" data-categoria="([^"]+)"/);
        if (m) achadas[m[1]] = '/site/' + path.relative(SITE_DIR, p).split(path.sep).join('/');
      }
    }
  })(path.join(SITE_DIR, 'pages/produtos'));
  return achadas;
}

test('config.js: PAGINAS_CATEGORIA bate exatamente com o data-categoria de cada página', () => {
  const mapa = { ...carregarConfig().PAGINAS_CATEGORIA };
  const paginas = paginasDeCategoria();
  assert.ok(Object.keys(paginas).length >= 20, 'deveria achar as páginas de categoria');
  assert.deepEqual(mapa, paginas);
});

test('config.js continua definindo a lista granel e a URL da API', () => {
  const ctx = carregarConfig();
  assert.ok(Array.isArray(ctx.CATEGORIAS_GRANEL_100G) && ctx.CATEGORIAS_GRANEL_100G.includes('temperos'));
  assert.equal(ctx.API_BASE_URL, 'http://localhost:3333');
});

/* ---------------------------------------------------------------- HTML */

function trechoDoMain(rel) {
  const html = ler(rel);
  return html.slice(html.indexOf('<main>'), html.indexOf('</main>'));
}

test('HTML: a seção fica no <main>, depois do produto, escondida até ter resultado', () => {
  const main = trechoDoMain('pages/produtos/detalhe/index.html');
  const posProduto = main.indexOf('id="produto-detalhe"');
  const posSecao = main.indexOf('id="produtos-semelhantes"');
  assert.ok(posProduto !== -1 && posSecao > posProduto, 'seção deve vir depois do produto');
  assert.match(main, /<section id="produtos-semelhantes" class="semelhantes" aria-labelledby="semelhantesTitulo" hidden>/);
  assert.match(main, /<h2 id="semelhantesTitulo">Produtos semelhantes<\/h2>/);
  assert.match(main, /<a id="semelhantesVerTodos"[^>]* hidden><\/a>/, 'link da categoria começa escondido');
  assert.match(main, /<div id="semelhantesLista" class="semelhantes-lista"><\/div>/);
});

test('HTML: config.js carrega antes do detalhe.js (o mapa de categorias precisa existir)', () => {
  const html = ler('pages/produtos/detalhe/index.html');
  assert.ok(html.indexOf('/assets/js/config.js') < html.indexOf('/assets/js/detalhe.js'));
});

test('HTML: a página do kit não ganhou a seção (usa outro script)', () => {
  assert.ok(!ler('pages/kits/detalhe/index.html').includes('produtos-semelhantes'));
});

/* ---------------------------------------------------------------- CSS */

test('CSS: o main quebra linha para a seção ficar abaixo do produto', () => {
  const css = ler('assets/css/detalhe.css');
  const main = css.match(/\nmain \{[^}]*\}/)[0];
  assert.match(main, /flex-wrap: wrap/);
  assert.match(main, /align-content: flex-start/, 'sem isso as linhas se espalham pela altura mínima de 100vh');
});

test('CSS: nenhuma regra da seção define display (senão o atributo hidden para de funcionar)', () => {
  const css = ler('assets/css/detalhe.css');
  const regras = css.match(/(^|\n)\s*\.semelhantes(-topo h2|-ver-todos)?\s*\{[^}]*\}/g) || [];
  assert.ok(regras.length >= 2);
  for (const r of regras) {
    if (/\.semelhantes\s*\{/.test(r)) assert.ok(!/display\s*:/.test(r), 'regra .semelhantes não pode ter display: ' + r);
    if (/\.semelhantes-ver-todos\s*\{/.test(r)) assert.ok(!/display\s*:/.test(r), 'regra do link não pode ter display: ' + r);
  }
});

test('CSS: grade de 4 no desktop e fileira com rolagem lateral no mobile', () => {
  const css = ler('assets/css/detalhe.css');
  const [desktop] = css.split('@media (max-width: 900px)');
  const mobile = css.slice(css.indexOf('@media (max-width: 900px)'));
  assert.match(desktop, /\.semelhantes-lista \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(mobile, /\.semelhantes-lista \{[^}]*overflow-x: auto[^}]*\}/);
  assert.match(mobile, /\.semelhantes-lista \{[^}]*scroll-snap-type: x mandatory/);
  assert.match(mobile, /grid-auto-columns: 42%/, 'parte do próximo card aparece, sinalizando que há mais');
});

test('CSS: link do esgotado só aparece quando há cards reais na seção', () => {
  const css = ler('assets/css/detalhe.css');
  assert.match(css, /\.link-semelhantes \{[^}]*display: none/);
  assert.ok(css.includes('body:has(#produtos-semelhantes:not([hidden]) .semelhante-card:not(.semelhante-skeleton)) .link-semelhantes'));
});

/* ---------------------------------------------------------------- comportamento (detalhe.js com fetch simulado) */

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const contar = (s, trecho) => s.split(trecho).length - 1;
const DETALHE_JS = ler('assets/js/detalhe.js');
const MAPA = { ...carregarConfig().PAGINAS_CATEGORIA };

function localStorageFake(inicial = {}, { cheio = false } = {}) {
  const m = new Map(Object.entries(inicial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (cheio) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem: (k) => m.delete(k),
    has: (k) => m.has(k)
  };
}

/* respostas liberadas manualmente; o padrão pode ser RegExp (as URLs do produto e dos semelhantes começam igual) */
function fetchControlado() {
  const chamadas = [];
  return {
    chamadas,
    fetch: (url) => new Promise((resolve, reject) => chamadas.push({ url, resolve, reject })),
    pendente(padrao) {
      const casa = (u) => (padrao instanceof RegExp ? padrao.test(u) : u.includes(padrao));
      const c = chamadas.find((x) => !x.feita && casa(x.url));
      assert.ok(c, 'nenhuma requisição pendente para ' + padrao + ' (feitas: ' + chamadas.map((x) => x.url).join(', ') + ')');
      c.feita = true;
      return {
        responder(dados, status = 200) { c.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(dados) }); },
        falhar() { c.reject(new Error('rede indisponível')); }
      };
    }
  };
}

const SIMILAR = /\/similar\?limit=8$/;
const PRODUTO = /\/api\/products\/[^/]+$/;

function montarPagina({ id = '7', cache = {}, storage = null } = {}) {
  const api = fetchControlado();
  let onDomReady = null;
  const els = {
    'produto-detalhe': { innerHTML: '', querySelectorAll: () => [] },
    'produtos-semelhantes': { hidden: true },
    semelhantesLista: { innerHTML: '' },
    semelhantesVerTodos: { hidden: true, href: '#', textContent: '' }
  };
  const ls = storage || localStorageFake(cache);
  const ctx = {
    document: {
      title: '',
      addEventListener(t, fn) { if (t === 'DOMContentLoaded') onDomReady = fn; },
      getElementById: (x) => els[x] || null
    },
    location: { search: id === null ? '' : '?id=' + id },
    URLSearchParams,
    localStorage: ls,
    fetch: api.fetch,
    imgUrl: (p) => p || '/site/imgs/logo.png',
    API_BASE_URL: 'http://api.teste',
    CATEGORIAS_GRANEL_100G: ['temperos'],
    PAGINAS_CATEGORIA: MAPA,
    console
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(DETALHE_JS, ctx);
  onDomReady();
  return {
    api,
    ls,
    secao: els['produtos-semelhantes'],
    lista: els.semelhantesLista,
    verTodos: els.semelhantesVerTodos,
    produto: els['produto-detalhe']
  };
}

const RESPOSTA = {
  category_slug: 'temperos',
  category_name: 'Temperos',
  products: [
    { id: 11, name: 'Pimenta do Reino', price: '5.00', compare_price: null, image_url: '/p11.jpg', stock: true, category_slug: 'temperos', category_name: 'Temperos' },
    { id: 12, name: 'Azeite com Pimenta', price: '20.00', compare_price: '15.00', image_url: null, stock: true, category_slug: 'azeites', category_name: 'Azeites' }
  ]
};

test('JS: busca os semelhantes em paralelo ao produto e mostra skeleton enquanto isso', () => {
  const t = montarPagina();
  const urls = t.api.chamadas.map((c) => c.url);
  assert.ok(urls.includes('http://api.teste/api/products/7/similar?limit=8'), 'deveria buscar os semelhantes: ' + urls);
  assert.ok(urls.includes('http://api.teste/api/products/7'), 'deveria buscar o produto: ' + urls);
  assert.equal(t.secao.hidden, false);
  assert.equal(contar(t.lista.innerHTML, 'semelhante-skeleton'), 4);
  assert.ok(t.lista.innerHTML.includes('aria-hidden="true"'));
});

test('JS: renderiza os cards com link, preço, promoção, selo 100g e o link da categoria', async () => {
  const t = montarPagina();
  t.api.pendente(SIMILAR).responder(RESPOSTA);
  await esperar(0);

  const html = t.lista.innerHTML;
  assert.equal(contar(html, 'class="semelhante-card"'), 2);
  assert.ok(!html.includes('skeleton'), 'skeleton deve sumir');
  assert.ok(html.includes('href="/site/pages/produtos/detalhe/index.html?id=11"'));
  assert.ok(html.includes('<span class="semelhante-nome">Pimenta do Reino</span>'));
  assert.ok(html.includes('<span class="semelhante-preco">R$ 5,00</span>'));
  assert.ok(html.includes('<span class="semelhante-preco"><s>R$ 20,00</s>R$ 15,00</span>'), 'promoção: preço cheio riscado + preço de venda');
  assert.equal(contar(html, 'unidade-de-medida'), 1, 'selo 100g só no item de categoria granel');
  assert.ok(html.includes('src="/site/imgs/logo.png"'), 'sem imagem usa o logo');
  assert.ok(html.includes('loading="lazy"'));

  assert.equal(t.secao.hidden, false);
  assert.equal(t.verTodos.hidden, false);
  assert.equal(t.verTodos.href, '/site/pages/produtos/temperos/index.html');
  assert.equal(t.verTodos.textContent, 'Ver todos em Temperos →');
});

test('JS: nome e imagem vindos da API são escapados (sem XSS)', async () => {
  const t = montarPagina();
  t.api.pendente(SIMILAR).responder({
    category_slug: 'temperos', category_name: 'Temperos',
    products: [{ id: 13, name: '<img src=x onerror=alert(1)>', price: '1', image_url: '/a.jpg" onerror="alert(2)', category_slug: 'sal' }]
  });
  await esperar(0);
  assert.ok(!t.lista.innerHTML.includes('<img src=x'), 'nome não pode virar HTML');
  assert.ok(t.lista.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!t.lista.innerHTML.includes('" onerror="alert(2)'), 'aspas na URL da imagem não podem fechar o atributo');
});

test('JS: o nome da categoria vai como texto no link (textContent, não HTML)', async () => {
  const t = montarPagina();
  t.api.pendente(SIMILAR).responder({ ...RESPOSTA, category_name: '<b>Temperos</b>' });
  await esperar(0);
  assert.equal(t.verTodos.textContent, 'Ver todos em <b>Temperos</b> →');
});

test('JS: o próprio produto nunca aparece, mesmo se a API mandar', async () => {
  const t = montarPagina();
  t.api.pendente(SIMILAR).responder({ ...RESPOSTA, products: [{ id: 7, name: 'Eu mesmo', price: '1' }, RESPOSTA.products[0]] });
  await esperar(0);
  assert.ok(!t.lista.innerHTML.includes('Eu mesmo'));
  assert.equal(contar(t.lista.innerHTML, 'class="semelhante-card"'), 1);
});

test('JS: categoria sem página conhecida esconde só o link "Ver todos"', async () => {
  const t = montarPagina();
  t.api.pendente(SIMILAR).responder({ ...RESPOSTA, category_slug: 'categoria-nova', category_name: 'Nova' });
  await esperar(0);
  assert.equal(t.secao.hidden, false);
  assert.equal(t.verTodos.hidden, true);
});

for (const [nome, resolver] of [
  ['lista vazia', (p) => p.responder({ category_slug: 'sal', category_name: 'Sal', products: [] })],
  ['resposta sem "products"', (p) => p.responder({ message: 'estranho' })],
  ['HTTP 404 (API ainda sem o endpoint)', (p) => p.responder({ message: 'Not found' }, 404)],
  ['HTTP 500', (p) => p.responder({ message: 'erro' }, 500)],
  ['falha de rede', (p) => p.falhar()]
]) {
  test('JS: ' + nome + ' esconde a seção sem deixar skeleton', async () => {
    const t = montarPagina();
    resolver(t.api.pendente(SIMILAR));
    await esperar(0);
    assert.equal(t.secao.hidden, true);
    assert.equal(t.lista.innerHTML, '');
  });
}

test('JS: erro não vai para o cache; sucesso vai', async () => {
  const erro = montarPagina();
  erro.api.pendente(SIMILAR).responder({ message: 'erro' }, 500);
  const ok = montarPagina({ id: '8' });
  ok.api.pendente(SIMILAR).responder(RESPOSTA);
  await esperar(0);
  assert.ok(!erro.ls.has('semelhantes_v1_7_cache'), 'erro não pode ser cacheado');
  assert.ok(ok.ls.has('semelhantes_v1_8_cache'));
  assert.ok(ok.ls.has('semelhantes_v1_8_timestamp'));
});

test('JS: cache válido renderiza na hora, sem buscar os semelhantes de novo', () => {
  const t = montarPagina({
    cache: { semelhantes_v1_7_cache: JSON.stringify(RESPOSTA), semelhantes_v1_7_timestamp: String(Date.now()) }
  });
  assert.ok(!t.api.chamadas.some((c) => SIMILAR.test(c.url)));
  assert.equal(contar(t.lista.innerHTML, 'class="semelhante-card"'), 2);
  assert.equal(t.secao.hidden, false);
});

test('JS: cache vencido busca de novo', () => {
  const t = montarPagina({
    cache: { semelhantes_v1_7_cache: JSON.stringify(RESPOSTA), semelhantes_v1_7_timestamp: String(Date.now() - 6 * 60 * 1000) }
  });
  assert.ok(t.api.chamadas.some((c) => SIMILAR.test(c.url)));
});

test('JS: cache corrompido não quebra a página (produto e semelhantes são buscados)', () => {
  const t = montarPagina({
    cache: { semelhantes_v1_7_cache: '{quebrado', semelhantes_v1_7_timestamp: String(Date.now()) }
  });
  assert.ok(t.api.chamadas.some((c) => SIMILAR.test(c.url)));
  assert.ok(t.api.chamadas.some((c) => PRODUTO.test(c.url)), 'o produto precisa carregar mesmo assim');
});

test('JS: localStorage cheio não impede de mostrar os semelhantes', async () => {
  const t = montarPagina({ storage: localStorageFake({}, { cheio: true }) });
  t.api.pendente(SIMILAR).responder(RESPOSTA);
  await esperar(0);
  assert.equal(t.secao.hidden, false);
  assert.equal(contar(t.lista.innerHTML, 'class="semelhante-card"'), 2);
});

test('JS: sem id na URL não busca nada e a seção continua escondida', () => {
  const t = montarPagina({ id: null });
  assert.equal(t.api.chamadas.length, 0);
  assert.equal(t.secao.hidden, true);
});

test('JS: id da URL vai codificado (não monta outro caminho da API)', () => {
  const t = montarPagina({ id: encodeURIComponent('1/../../orders') });
  assert.ok(t.api.chamadas.some((c) => c.url === 'http://api.teste/api/products/1%2F..%2F..%2Forders/similar?limit=8'),
    t.api.chamadas.map((c) => c.url).join(', '));
});

test('JS: produto esgotado ganha o link para os semelhantes; em estoque não', async () => {
  const esgotado = montarPagina();
  esgotado.api.pendente(PRODUTO).responder({ id: 7, name: 'Pimenta X', price: '5', stock: false, category_slug: 'temperos', images: [] });
  const disponivel = montarPagina({ id: '8' });
  disponivel.api.pendente(PRODUTO).responder({ id: 8, name: 'Pimenta Y', price: '5', stock: true, category_slug: 'temperos', images: [] });
  await esperar(0);
  assert.ok(esgotado.produto.innerHTML.includes('<a href="#produtos-semelhantes" class="link-semelhantes">'));
  assert.ok(!disponivel.produto.innerHTML.includes('link-semelhantes'));
});

test('JS: falha nos semelhantes não afeta o produto (e vice-versa)', async () => {
  const t = montarPagina();
  t.api.pendente(SIMILAR).falhar();
  t.api.pendente(PRODUTO).responder({ id: 7, name: 'Pimenta X', price: '5', stock: true, category_slug: 'temperos', images: [] });
  await esperar(0);
  assert.ok(t.produto.innerHTML.includes('Pimenta X'));
  assert.equal(contar(t.produto.innerHTML, 'unidade-de-medida'), 1, 'selo 100g do produto principal continua');
  assert.equal(t.secao.hidden, true);

  const u = montarPagina({ id: '9' });
  u.api.pendente(PRODUTO).falhar();
  u.api.pendente(SIMILAR).responder(RESPOSTA);
  await esperar(0);
  assert.ok(u.produto.innerHTML.includes('Não foi possível carregar o produto.'));
  assert.equal(u.secao.hidden, false);
});
