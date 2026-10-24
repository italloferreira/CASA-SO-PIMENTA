import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

/* Skeleton Screen: estrutura (CSS/HTML) e comportamento dos scripts com fetch simulado.
   Nenhum teste aqui depende da API rodando. */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, '..');
const ler = (rel) => readFileSync(path.join(SITE_DIR, rel), 'utf-8');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/* innerHTML inicial de um elemento do HTML, achado pelo id (conta tags de mesmo nome para achar o fechamento) */
function conteudoInicial(html, id) {
  const abertura = new RegExp('<(\\w+)[^>]*\\sid="' + id + '"[^>]*>').exec(html);
  assert.ok(abertura, 'elemento #' + id + ' não encontrado');
  const tag = abertura[1];
  const re = new RegExp('<' + tag + '\\b|</' + tag + '>', 'g');
  re.lastIndex = abertura.index + abertura[0].length;
  let nivel = 1;
  let m;
  while ((m = re.exec(html))) {
    nivel += m[0].startsWith('</') ? -1 : 1;
    if (nivel === 0) return html.slice(abertura.index + abertura[0].length, m.index);
  }
  throw new Error('fechamento de #' + id + ' não encontrado');
}

const contar = (s, trecho) => s.split(trecho).length - 1;

/* cards de skeleton só podem ter <span>: produtos.css/home.css estilizam ".cartao div/p/h3/img/button" */
function assertCardsSoComSpans(html, esperados) {
  const cards = html.match(/<div class="cartao cartao-skeleton"[^>]*>.*?<\/div>/g) || [];
  assert.equal(cards.length, esperados, 'quantidade de cards de skeleton');
  for (const card of cards) {
    const interno = card.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '');
    assert.ok(!/<(div|p|h\d|img|button)\b/.test(interno), 'card de skeleton com elemento estilizável: ' + interno);
  }
}
const semSrOnly = (s) => s.replace(/<(p|span) class="sr-only">[^<]*<\/\1>/g, '');

/* ---------------------------------------------------------------- fetch simulado */

function resposta(dados, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(dados) });
}

/* fetch cujas respostas são liberadas manualmente: permite inspecionar a tela durante o carregamento */
function fetchControlado() {
  const chamadas = [];
  function fetch(url) {
    return new Promise((resolve, reject) => chamadas.push({ url, resolve, reject }));
  }
  return {
    fetch,
    chamadas,
    pendente(trecho) {
      const c = chamadas.find((x) => !x.feita && x.url.includes(trecho));
      assert.ok(c, 'nenhuma requisição pendente para ' + trecho + ' (feitas: ' + chamadas.map((x) => x.url).join(', ') + ')');
      c.feita = true;
      return {
        responder(dados, status = 200) { resposta(dados, status).then(c.resolve); },
        falhar() { c.reject(new Error('rede indisponível')); }
      };
    }
  };
}

function localStorageFake(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    has: (k) => m.has(k)
  };
}

function classListFake() {
  const s = new Set();
  return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c) };
}

function elementoFake(extra = {}) {
  return {
    innerHTML: '',
    textContent: '',
    value: '',
    style: {},
    classList: classListFake(),
    addEventListener() {},
    remove() {},
    querySelectorAll: () => [],
    querySelector: () => null,
    ...extra
  };
}

function executar(arquivo, ctx, { comoScript = false } = {}) {
  let codigo = ler(arquivo);
  if (comoScript) codigo = codigo.replace(/^export\s+/gm, '');
  ctx.window = ctx;
  ctx.console = console;
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx);
}

/* ---------------------------------------------------------------- CSS */

test('skeleton.css define o componente base com shimmer, reduced-motion e texto para leitor de tela', () => {
  const css = ler('assets/css/skeleton.css');
  assert.match(css, /\.skeleton\s*\{[^}]*animation:\s*skeleton-brilho/, '.skeleton deve ter a animação shimmer');
  assert.match(css, /@keyframes skeleton-brilho/, 'deve definir os keyframes do shimmer');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.skeleton\s*\{[^}]*animation:\s*none/, 'deve desligar a animação com prefers-reduced-motion');
  assert.match(css, /\.sr-only\s*\{[^}]*clip:/, 'deve ter a classe .sr-only');
  assert.match(css, /--skeleton-base:\s*var\(--cor-/, 'as cores devem vir da paleta de variaveis.css');
  for (const c of ['.cartao-skeleton', '.pedido-card-skeleton', '.frete-card-skeleton']) {
    assert.ok(css.includes(c), c + ' deve ficar sem clique (pointer-events)');
  }
  assert.match(css, /pointer-events:\s*none/);
});

test('as páginas que exibem skeleton importam skeleton.css logo após variaveis.css', () => {
  for (const f of ['home', 'produtos', 'detalhe', 'pedidos', 'checkout', 'conta']) {
    const css = ler('assets/css/' + f + '.css');
    assert.ok(
      css.startsWith("@import url('variaveis.css');\n@import url('skeleton.css');"),
      f + '.css deve importar skeleton.css no topo (antes de qualquer regra)'
    );
  }
});

test('cada página define o layout dos seus blocos de skeleton', () => {
  const esperado = {
    home: ['.cartao-skeleton .skeleton-img', '.cartao-skeleton .skeleton-botao', '.skeleton-slide'],
    produtos: ['.cartao-skeleton .skeleton-img', '.skeleton-sentinel'],
    detalhe: ['.skeleton-detalhe-img', '.skeleton-detalhe-titulo', '.skeleton-detalhe-botao', '.produto-detalhe-skeleton .produto-detalhe-info'],
    pedidos: ['.skeleton-pedido-numero', '.skeleton-badge', '.skeleton-timeline'],
    checkout: ['.skeleton-frete-radio', '.skeleton-frete-valor'],
    conta: ['.campo-conta input.skeleton']
  };
  for (const [f, seletores] of Object.entries(esperado)) {
    const css = ler('assets/css/' + f + '.css');
    for (const s of seletores) assert.ok(css.includes(s + ' {') || css.includes(s + '{') || css.includes(s + ',\n'), f + '.css deve estilizar ' + s);
  }
});

test('produtos.css: a sentinela ocupa a linha inteira no desktop e vira coluna no mobile', () => {
  const css = ler('assets/css/produtos.css');
  const [desktop, mobile] = css.split('@media (max-width: 1000px)');
  assert.match(desktop, /\.skeleton-sentinel\{[^}]*grid-column:\s*1 \/ -1/);
  assert.match(mobile, /\.skeleton-sentinel \{[^}]*flex-direction:\s*column/);
  assert.match(mobile, /\.cartao-skeleton:nth-of-type\(n\+2\)/, 'no mobile a sentinela mostra só 1 card');
});

test('conta.css: o skeleton do input vence o shorthand "background" do .campo-conta input', () => {
  const css = ler('assets/css/conta.css');
  const posReadonly = css.indexOf('.campo-conta input[readonly]');
  const posSkeleton = css.indexOf('.campo-conta input.skeleton {');
  assert.ok(posSkeleton > posReadonly, 'a regra do skeleton deve vir depois da de [readonly] (mesma especificidade)');
  const regra = css.slice(posSkeleton, css.indexOf('}', posSkeleton));
  assert.match(regra, /background:\s*var\(--skeleton-gradiente\)/);
  assert.match(regra, /background-size:\s*200% 100%/);
});

/* ---------------------------------------------------------------- HTML estático */

const CONTAINERS = [
  { pagina: 'pages/index.html', id: 'slides', bloco: 'skeleton-slide', srOnly: false },
  { pagina: 'pages/index.html', id: 'destaques-section', bloco: 'cartao-skeleton', qtd: 3 },
  { pagina: 'pages/index.html', id: 'cartoes-section', bloco: 'cartao-skeleton', qtd: 3 },
  { pagina: 'pages/produtos/detalhe/index.html', id: 'produto-detalhe', bloco: 'produto-detalhe-skeleton' },
  { pagina: 'pages/kits/detalhe/index.html', id: 'produto-detalhe', bloco: 'produto-detalhe-skeleton' },
  { pagina: 'pages/pedidos/index.html', id: 'pedidosLista', bloco: 'pedido-card-skeleton', qtd: 3 },
  { pagina: 'pages/pedidos/detalhe/index.html', id: 'detalheConteudo', bloco: 'detalhe-header' },
  { pagina: 'pages/checkout/index.html', id: 'freteLoading', bloco: 'frete-card-skeleton', qtd: 2 }
];

for (const c of CONTAINERS) {
  test('HTML: #' + c.id + ' (' + c.pagina + ') já nasce com skeleton acessível', () => {
    const inicial = conteudoInicial(ler(c.pagina), c.id);
    assert.ok(inicial.includes('class="skeleton'), 'deve conter blocos .skeleton');
    assert.ok(inicial.includes(c.bloco), 'deve conter ' + c.bloco);
    if (c.qtd) assert.equal(contar(inicial, c.bloco), c.qtd, 'quantidade de ' + c.bloco);
    assert.ok(inicial.includes('aria-hidden="true"'), 'os blocos visuais devem ser aria-hidden');
    if (c.srOnly !== false) assert.match(inicial, /class="sr-only">(Carregando|Calculando)[^<]+</, 'deve anunciar o carregamento ao leitor de tela');
    assert.ok(!/Carregando|Calculando/.test(semSrOnly(inicial)), 'não deve sobrar texto de loading visível');
  });
}

test('HTML: blocos dentro dos cards são <span> (as regras ".cartao div/p/h3/img" não os afetam)', () => {
  assertCardsSoComSpans(ler('pages/index.html'), 6);
});

test('HTML: o checkout mantém #freteLoading oculto até o cálculo começar', () => {
  const html = ler('pages/checkout/index.html');
  assert.match(html, /<div id="freteLoading" style="display:none;">/);
});

test('scripts não escrevem mais texto de "Carregando..." por cima do skeleton', () => {
  for (const f of ['detalhe.js', 'detalhe-kit.js', 'pedidos.js', 'detalhe-pedido.js']) {
    assert.ok(!ler('assets/js/' + f).includes('Carregando'), f + ' não deve sobrescrever o skeleton do HTML');
  }
  const produtos = ler('assets/js/produtos.js');
  assert.ok(!produtos.includes('<p>Carregando produtos...</p>'));
  assert.ok(!produtos.includes('<p>Buscando...</p>'));
  assert.ok(ler('assets/js/detalhe-pedido.js').includes('Cancelando pedido...'), 'ação de cancelar mantém o texto de progresso');
});

/* ---------------------------------------------------------------- produtos.js */

function produtosFake(qtd, inicio = 0) {
  return Array.from({ length: qtd }, (_, i) => ({ id: inicio + i + 1, name: 'Produto ' + (inicio + i + 1), price: 10, stock: 3, is_active: 1, category_slug: 'molhos' }));
}

/* sentinelaVisivel: como no navegador, observe() de um elemento já na tela dispara o callback logo em seguida */
function montarCategoria({ sentinelaVisivel = false } = {}) {
  const api = fetchControlado();
  let onDomReady = null;
  let onInput = null;
  let observerCallback = null;
  const section = { dataset: { categoria: 'molhos' }, innerHTML: '', filhos: [], appendChild(el) { this.filhos.push(el); } };
  const input = { value: '', addEventListener(t, fn) { if (t === 'input') onInput = fn; } };
  const ctx = {
    document: {
      addEventListener(t, fn) { if (t === 'DOMContentLoaded') onDomReady = fn; },
      querySelector: (s) => (s === '.produtos-section' ? section : s === '.pesquisa' ? input : null),
      createElement() {
        const el = { style: {}, innerHTML: '', className: '', remove() { section.filhos = section.filhos.filter((f) => f !== el); } };
        return el;
      }
    },
    fetch: api.fetch,
    imgUrl: (p) => p || '/site/imgs/logo.png',
    IntersectionObserver: class {
      constructor(cb) { observerCallback = cb; this.ativo = true; }
      observe() { if (sentinelaVisivel) setTimeout(() => { if (this.ativo) observerCallback([{ isIntersecting: true }]); }, 0); }
      disconnect() { this.ativo = false; }
    },
    API_BASE_URL: 'http://api.teste',
    escapeHtml: (s) => s,
    CATEGORIAS_GRANEL_100G: []
  };
  executar('assets/js/produtos.js', ctx);
  onDomReady();
  return {
    api,
    section,
    sentinela: () => section.filhos[0],
    digitar(v) { input.value = v; onInput.call(input); },
    rolarAteOFim() { observerCallback([{ isIntersecting: true }]); }
  };
}

test('produtos.js: 1º carregamento mostra 8 cards de skeleton e troca pelos produtos', async () => {
  const p = montarCategoria();
  assertCardsSoComSpans(p.section.innerHTML, 8);
  assert.ok(p.section.innerHTML.includes('<span class="sr-only">Carregando produtos...</span>'));
  assert.ok(!p.section.innerHTML.includes('<h3>'), 'skeleton não pode ter <h3> (é por onde os nomes dos produtos são lidos)');

  p.api.pendente('offset=0').responder({ products: produtosFake(20), total: 45 });
  await esperar(0);

  assert.equal(contar(p.section.innerHTML, '<h3>'), 20);
  assert.ok(!p.section.innerHTML.includes('skeleton'), 'skeleton deve sumir após o carregamento');
});

test('produtos.js: a sentinela da rolagem infinita é uma linha de skeleton e some ao fim da categoria', async () => {
  const p = montarCategoria();
  p.api.pendente('offset=0').responder({ products: produtosFake(20), total: 25 });
  await esperar(0);

  const s = p.sentinela();
  assert.ok(s, 'deve haver sentinela, pois faltam produtos');
  assert.equal(s.className, 'sentinel skeleton-sentinel');
  assertCardsSoComSpans(s.innerHTML, 4);
  assert.ok(s.innerHTML.includes('<span class="sr-only">Carregando mais...</span>'));

  p.rolarAteOFim();
  p.api.pendente('offset=20').responder({ products: produtosFake(5, 20), total: 25 });
  await esperar(0);

  assert.equal(contar(p.section.innerHTML, '<h3>'), 25);
  assert.equal(p.section.filhos.length, 0, 'categoria toda carregada: sem sentinela/skeleton');
});

test('produtos.js: busca no servidor mostra skeleton e depois o resultado', async () => {
  const p = montarCategoria();
  p.api.pendente('offset=0').responder({ products: produtosFake(20), total: 45 });
  await esperar(0);

  p.digitar('inexistente');
  assert.equal(contar(p.section.innerHTML, 'cartao-skeleton'), 4, 'skeleton durante a busca');
  assert.ok(p.section.innerHTML.includes('<span class="sr-only">Buscando...</span>'));

  p.api.pendente('/search').responder([]);
  await esperar(0);
  assert.ok(p.section.innerHTML.includes('Nenhum produto encontrado'));
  assert.ok(!p.section.innerHTML.includes('skeleton'));
});

test('produtos.js: se a busca falhar, o skeleton dá lugar ao filtro local', async () => {
  const p = montarCategoria();
  p.api.pendente('offset=0').responder({ products: produtosFake(20), total: 45 });
  await esperar(0);

  p.digitar('inexistente');
  p.api.pendente('/search').falhar();
  await esperar(0);
  assert.ok(p.section.innerHTML.includes('Nenhum produto encontrado'));
  assert.ok(!p.section.innerHTML.includes('skeleton'));
});

test('produtos.js: falha da API troca o skeleton pela mensagem de erro, sem sentinela nem novas tentativas', async () => {
  const p = montarCategoria({ sentinelaVisivel: true });
  p.api.pendente('offset=0').falhar();
  await esperar(50);
  assert.ok(p.section.innerHTML.includes('Não foi possível carregar os produtos.'));
  assert.ok(!p.section.innerHTML.includes('cartao-skeleton'), 'nenhum skeleton pode ficar preso na tela');
  assert.equal(p.section.filhos.length, 0, 'sentinela de skeleton abaixo da mensagem de erro');
  assert.equal(p.api.chamadas.length, 1, 'a sentinela visível não pode repetir a requisição em loop');
});

test('produtos.js: HTTP 500 no 1º carregamento mostra o erro (não quebra o render)', async () => {
  const p = montarCategoria({ sentinelaVisivel: true });
  p.api.pendente('offset=0').responder({ message: 'erro interno' }, 500);
  await esperar(50);
  assert.ok(p.section.innerHTML.includes('Não foi possível carregar os produtos.'));
  assert.equal(p.section.filhos.length, 0);
  assert.equal(p.api.chamadas.length, 1);
});

test('produtos.js: falha ao carregar mais mantém os produtos e remove a sentinela', async () => {
  const p = montarCategoria({ sentinelaVisivel: true });
  p.api.pendente('offset=0').responder({ products: produtosFake(20), total: 45 });
  await esperar(10); // sentinela visível dispara o carregamento da 2ª página
  p.api.pendente('offset=20').falhar();
  await esperar(50);
  assert.equal(contar(p.section.innerHTML, '<h3>'), 20, 'produtos já carregados continuam na tela');
  assert.equal(p.section.filhos.length, 0, 'sentinela de skeleton presa após a falha');
  assert.equal(p.api.chamadas.length, 2, 'sem novas tentativas em loop');
});

/* ---------------------------------------------------------------- home.js */

function montarHome() {
  const html = ler('pages/index.html');
  const api = fetchControlado();
  const storage = localStorageFake();
  let onDomReady = null;
  const wrapperDestaques = elementoFake();
  const els = {
    slides: elementoFake({ innerHTML: conteudoInicial(html, 'slides'), parentElement: elementoFake() }),
    anterior: elementoFake(),
    proximo: elementoFake(),
    'destaques-section': elementoFake({ innerHTML: conteudoInicial(html, 'destaques-section') }),
    'cartoes-section': elementoFake({ innerHTML: conteudoInicial(html, 'cartoes-section'), parentElement: elementoFake() })
  };
  const ctx = {
    document: {
      addEventListener(t, fn) { if (t === 'DOMContentLoaded') onDomReady = fn; },
      getElementById: (id) => els[id] || null,
      querySelector: (s) => (s === '.destaques-section' ? wrapperDestaques : null)
    },
    localStorage: storage,
    fetch: api.fetch,
    imgUrl: (p) => p || '/site/imgs/logo.png',
    // seções "entram na tela" assim que observadas
    IntersectionObserver: class { constructor(cb) { this.cb = cb; } observe() { this.cb([{ isIntersecting: true }]); } disconnect() {} },
    setInterval: () => 0,
    clearInterval() {},
    API_BASE_URL: 'http://api.teste'
  };
  executar('assets/js/home.js', ctx);
  onDomReady();
  return { api, els, storage, wrapperDestaques };
}

test('home.js: carrossel, destaques e kits substituem o skeleton (não anexam depois dele)', async () => {
  const h = montarHome();
  assert.ok(h.els.slides.innerHTML.includes('skeleton-slide'), 'skeleton do HTML visível no início');
  assert.equal(contar(h.els['destaques-section'].innerHTML, 'cartao-skeleton'), 3);

  h.api.pendente('/api/banners').responder([{ image_url: '/b1.jpg', title: 'Banner 1' }, { image_url: '/b2.jpg', title: 'Banner 2' }]);
  h.api.pendente('featured=true').responder({ products: [{ id: 1, name: 'Pimenta Biquinho', price: 12, stock: 4, is_active: 1 }] });
  h.api.pendente('/api/kits').responder([{ id: 9, name: 'Kit Churrasco', price: 50, items: [{ custom_name: 'Sal' }] }]);
  await esperar(0);

  assert.equal(contar(h.els.slides.innerHTML, 'class="slide"'), 2);
  assert.ok(h.els.slides.innerHTML.includes('Banner 2'));
  assert.ok(h.els['destaques-section'].innerHTML.includes('Pimenta Biquinho'));
  assert.ok(h.els['cartoes-section'].innerHTML.includes('Kit Churrasco'));
  for (const id of ['slides', 'destaques-section', 'cartoes-section']) {
    assert.ok(!h.els[id].innerHTML.includes('skeleton'), '#' + id + ' ainda contém skeleton');
    assert.ok(!h.els[id].innerHTML.includes('sr-only'), '#' + id + ' ainda contém o aviso de carregamento');
  }
});

test('home.js: falha de rede troca todo skeleton pelos fallbacks', async () => {
  const h = montarHome();
  h.api.pendente('/api/banners').falhar();
  h.api.pendente('featured=true').falhar();
  h.api.pendente('/api/kits').falhar();
  await esperar(0);

  assert.ok(h.els.slides.innerHTML.includes('Em breve'));
  assert.ok(!h.els.slides.innerHTML.includes('skeleton'));
  assert.equal(h.wrapperDestaques.style.display, 'none', 'seção de destaques escondida em vez de piscar para sempre');
  assert.ok(h.els['cartoes-section'].innerHTML.includes('Produtos em breve'));
  assert.ok(!h.els['cartoes-section'].innerHTML.includes('skeleton'));
});

test('home.js: resposta HTTP de erro vira fallback e não é guardada no cache', async () => {
  const h = montarHome();
  h.api.pendente('/api/banners').responder({ message: 'erro interno' }, 500);
  h.api.pendente('featured=true').responder({ message: 'erro interno' }, 500);
  h.api.pendente('/api/kits').responder({ message: 'erro interno' }, 500);
  await esperar(0);

  assert.ok(h.els['cartoes-section'].innerHTML.includes('Produtos em breve'));
  assert.ok(h.els.slides.innerHTML.includes('Em breve'));
  for (const chave of ['home_banners', 'home_destaques', 'home_kits']) {
    assert.ok(!h.storage.has(chave), chave + ' não pode cachear uma resposta de erro');
  }
});

test('home.js: dados em cache renderizam na hora, sem requisição', () => {
  const html = ler('pages/index.html');
  const agora = String(Date.now());
  const storage = localStorageFake({
    home_kits: JSON.stringify([{ id: 3, name: 'Kit Cache', price: 20, items: [] }]), home_kits_tempo: agora,
    home_banners: JSON.stringify([{ image_url: '/x.jpg', title: 'Cache' }]), home_banners_tempo: agora,
    home_destaques: JSON.stringify({ products: [] }), home_destaques_tempo: agora
  });
  const api = fetchControlado();
  let onDomReady = null;
  const wrapper = elementoFake();
  const els = {
    slides: elementoFake({ innerHTML: conteudoInicial(html, 'slides'), parentElement: elementoFake() }),
    anterior: elementoFake(), proximo: elementoFake(),
    'destaques-section': elementoFake({ innerHTML: conteudoInicial(html, 'destaques-section') }),
    'cartoes-section': elementoFake({ innerHTML: conteudoInicial(html, 'cartoes-section'), parentElement: elementoFake() })
  };
  executar('assets/js/home.js', {
    document: { addEventListener(t, fn) { if (t === 'DOMContentLoaded') onDomReady = fn; }, getElementById: (id) => els[id] || null, querySelector: () => wrapper },
    localStorage: storage, fetch: api.fetch, imgUrl: (p) => p,
    IntersectionObserver: class { constructor(cb) { this.cb = cb; } observe() { this.cb([{ isIntersecting: true }]); } disconnect() {} },
    setInterval: () => 0, clearInterval() {}, API_BASE_URL: 'http://api.teste'
  });
  onDomReady();

  assert.equal(api.chamadas.length, 0);
  assert.ok(els['cartoes-section'].innerHTML.includes('Kit Cache'));
  assert.ok(!els['cartoes-section'].innerHTML.includes('skeleton'));
  assert.ok(!els.slides.innerHTML.includes('skeleton'));
  assert.equal(wrapper.style.display, 'none', 'sem destaques: seção escondida');
});

/* ---------------------------------------------------------------- detalhe.js / detalhe-kit.js */

function montarDetalhe(arquivo, pagina, cache = {}) {
  const api = fetchControlado();
  let onDomReady = null;
  const container = elementoFake({ innerHTML: conteudoInicial(ler(pagina), 'produto-detalhe') });
  executar(arquivo, {
    document: {
      title: '',
      addEventListener(t, fn) { if (t === 'DOMContentLoaded') onDomReady = fn; },
      getElementById: (id) => (id === 'produto-detalhe' ? container : null)
    },
    location: { search: '?id=7' },
    URLSearchParams,
    localStorage: localStorageFake(cache),
    fetch: api.fetch,
    imgUrl: (p) => p || '/site/imgs/logo.png',
    API_BASE_URL: 'http://api.teste',
    CATEGORIAS_GRANEL_100G: []
  });
  onDomReady();
  return { api, container };
}

const DETALHES = [
  { arquivo: 'assets/js/detalhe.js', pagina: 'pages/produtos/detalhe/index.html', rota: '/api/products/7', erro: 'Não foi possível carregar o produto.', item: { id: 7, name: 'Molho Ardido', price: 15, stock: 2, images: [] } },
  { arquivo: 'assets/js/detalhe-kit.js', pagina: 'pages/kits/detalhe/index.html', rota: '/api/kits/7', erro: 'Não foi possível carregar o kit.', item: { id: 7, name: 'Kit Presente', price: 80, stock: 1, items: [] } }
];

for (const d of DETALHES) {
  const nome = path.basename(d.arquivo);

  test(nome + ': o skeleton do HTML fica até a resposta e é trocado pelo item', async () => {
    const t = montarDetalhe(d.arquivo, d.pagina);
    assert.ok(t.container.innerHTML.includes('produto-detalhe-skeleton'), 'skeleton continua visível durante o fetch');
    t.api.pendente(d.rota).responder(d.item);
    await esperar(0);
    assert.ok(t.container.innerHTML.includes(d.item.name));
    assert.ok(!t.container.innerHTML.includes('skeleton'));
  });

  test(nome + ': falha da API troca o skeleton pela mensagem de erro', async () => {
    const t = montarDetalhe(d.arquivo, d.pagina);
    t.api.pendente(d.rota).falhar();
    await esperar(0);
    assert.ok(t.container.innerHTML.includes(d.erro));
    assert.ok(!t.container.innerHTML.includes('skeleton'));
  });
}

test('detalhe.js: com cache válido o skeleton é trocado sem requisição', () => {
  const t = montarDetalhe('assets/js/detalhe.js', 'pages/produtos/detalhe/index.html', {
    produto_v3_7_cache: JSON.stringify(DETALHES[0].item),
    produto_v3_7_timestamp: String(Date.now())
  });
  assert.equal(t.api.chamadas.length, 0);
  assert.ok(t.container.innerHTML.includes('Molho Ardido'));
  assert.ok(!t.container.innerHTML.includes('skeleton'));
});

/* ---------------------------------------------------------------- pedidos.js / detalhe-pedido.js */

const USUARIO = { csp_admin_user: JSON.stringify({ name: 'Ana', email: 'ana@teste.com', token: 'tk' }) };

function montarPedidos(arquivo, pagina, idConteudo, logado = true) {
  const api = fetchControlado();
  let onDomReady = null;
  const conteudo = elementoFake({ innerHTML: conteudoInicial(ler(pagina), idConteudo) });
  executar(arquivo, {
    document: {
      addEventListener(t, fn) { if (t === 'DOMContentLoaded') onDomReady = fn; },
      getElementById: (id) => (id === idConteudo ? conteudo : elementoFake())
    },
    location: { search: '?id=12', pathname: '/site/pages/pedidos/' },
    URLSearchParams,
    localStorage: localStorageFake(logado ? USUARIO : {}),
    fetch: api.fetch,
    API_BASE_URL: 'http://api.teste',
    escapeHtml: (s) => s
  });
  onDomReady();
  return { api, conteudo };
}

const PEDIDO = { id: 12, status: 'pending', payment_status: 'pending', payment_method: 'pix', delivery_type: 'pickup', total: 42, subtotal: 42, created_at: '2026-10-20T12:00:00Z', items: [{ item_name: 'Pimenta', quantity: 2, total: 42 }] };

test('pedidos.js: skeleton dos cards até a lista chegar', async () => {
  const t = montarPedidos('assets/js/pedidos.js', 'pages/pedidos/index.html', 'pedidosLista');
  assert.equal(contar(t.conteudo.innerHTML, 'pedido-card-skeleton'), 3);
  t.api.pendente('/api/orders/my').responder({ orders: [PEDIDO] });
  await esperar(0);
  assert.ok(t.conteudo.innerHTML.includes('Pedido #12'));
  assert.ok(!t.conteudo.innerHTML.includes('skeleton'));
});

test('pedidos.js: lista vazia, erro e usuário deslogado também substituem o skeleton', async () => {
  const vazio = montarPedidos('assets/js/pedidos.js', 'pages/pedidos/index.html', 'pedidosLista');
  vazio.api.pendente('/api/orders/my').responder({ orders: [] });
  const erro = montarPedidos('assets/js/pedidos.js', 'pages/pedidos/index.html', 'pedidosLista');
  erro.api.pendente('/api/orders/my').responder({ message: 'x' }, 500);
  const deslogado = montarPedidos('assets/js/pedidos.js', 'pages/pedidos/index.html', 'pedidosLista', false);
  await esperar(0);

  assert.ok(vazio.conteudo.innerHTML.includes('Nenhum pedido encontrado'));
  assert.ok(erro.conteudo.innerHTML.includes('Erro ao carregar'));
  assert.ok(deslogado.conteudo.innerHTML.includes('Faça login'));
  assert.equal(deslogado.api.chamadas.length, 0);
  for (const t of [vazio, erro, deslogado]) assert.ok(!t.conteudo.innerHTML.includes('skeleton'));
});

test('detalhe-pedido.js: skeleton até o pedido chegar; erro também o substitui', async () => {
  const ok = montarPedidos('assets/js/detalhe-pedido.js', 'pages/pedidos/detalhe/index.html', 'detalheConteudo');
  const falha = montarPedidos('assets/js/detalhe-pedido.js', 'pages/pedidos/detalhe/index.html', 'detalheConteudo');
  assert.ok(ok.conteudo.innerHTML.includes('skeleton-timeline'));

  ok.api.pendente('/api/orders/my/12').responder(PEDIDO);
  falha.api.pendente('/api/orders/my/12').responder({ message: 'não encontrado' }, 404);
  await esperar(0);

  assert.ok(ok.conteudo.innerHTML.includes('Pedido #12'));
  assert.ok(falha.conteudo.innerHTML.includes('Pedido não encontrado'));
  for (const t of [ok, falha]) assert.ok(!t.conteudo.innerHTML.includes('skeleton'));
});

/* ---------------------------------------------------------------- conta.js */

function montarConta() {
  const api = fetchControlado();
  let onDomReady = null;
  const els = {};
  const el = (id) => (els[id] = els[id] || elementoFake({ readOnly: false }));
  executar('assets/js/conta.js', {
    document: { addEventListener(t, fn) { if (t === 'DOMContentLoaded') onDomReady = fn; }, getElementById: el },
    location: { href: '' },
    localStorage: localStorageFake(USUARIO),
    fetch: api.fetch,
    API_BASE_URL: 'http://api.teste'
  }, { comoScript: true });
  onDomReady();
  return { api, el };
}

const CAMPOS_PERFIL = ['telefone', 'cep', 'endereco', 'cidade', 'estado'];

test('conta.js: campos do perfil ficam em skeleton e travados até a resposta', async () => {
  const t = montarConta();
  for (const id of CAMPOS_PERFIL) {
    assert.ok(t.el(id).classList.contains('skeleton'), id + ' deve estar em skeleton');
    assert.equal(t.el(id).readOnly, true, id + ' deve estar travado durante o carregamento');
  }
  assert.ok(!t.el('inputNome').classList.contains('skeleton'), 'nome vem do localStorage, não precisa de skeleton');

  t.api.pendente('/api/auth/profile').responder({ phone: '(31) 99999-0000', address: 'Rua A', city: 'BH', state: 'MG' });
  await esperar(0);

  for (const id of CAMPOS_PERFIL) {
    assert.ok(!t.el(id).classList.contains('skeleton'), id + ' ainda em skeleton');
    assert.equal(t.el(id).readOnly, false, id + ' ainda travado');
  }
  assert.equal(t.el('telefone').value, '(31) 99999-0000');
  assert.equal(t.el('cidade').value, 'BH');
});

test('conta.js: se o perfil falhar os campos são liberados mesmo assim', async () => {
  const t = montarConta();
  t.api.pendente('/api/auth/profile').falhar();
  await esperar(0);
  for (const id of CAMPOS_PERFIL) {
    assert.ok(!t.el(id).classList.contains('skeleton'), id + ' ficou preso em skeleton');
    assert.equal(t.el(id).readOnly, false, id + ' ficou travado');
  }
});
