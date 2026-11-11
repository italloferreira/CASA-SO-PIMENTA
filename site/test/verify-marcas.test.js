import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

/* "Marcas que você encontra aqui": lista em config.js, seção da home e página /marcas/.
   Nenhum teste aqui depende da API rodando (fetch simulado). */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, '..');
const ler = (rel) => readFileSync(path.join(SITE_DIR, rel), 'utf-8');
const arquivoDoSite = (url) => path.join(SITE_DIR, url.replace(/^\/site\//, '').split('?')[0]);

function carregarMarcas() {
  const ctx = { location: { hostname: 'localhost', origin: 'http://localhost:3333' } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(ler('assets/js/config.js'), ctx);
  return JSON.parse(JSON.stringify(ctx.MARCAS));
}

/* ---------------------------------------------------------------- config.js */

test('config.js: MARCAS tem slug, nome e logo; slugs e nomes não se repetem', () => {
  const marcas = carregarMarcas();
  assert.ok(marcas.length >= 1);
  for (const m of marcas) {
    assert.match(m.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug inválido: ' + m.slug);
    assert.ok(m.nome && m.nome.trim() === m.nome, 'nome vazio ou com espaço nas pontas: ' + m.slug);
    assert.ok(!/[-–—]/.test(m.nome), 'nome não pode ter traço (o traço separa a marca no título): ' + m.nome);
  }
  assert.equal(new Set(marcas.map((m) => m.slug)).size, marcas.length, 'slug repetido');
  assert.equal(new Set(marcas.map((m) => m.nome.toLowerCase())).size, marcas.length, 'nome repetido');
});

test('config.js: toda logo de marca existe no disco e é leve', () => {
  for (const m of carregarMarcas()) {
    const arq = arquivoDoSite(m.logo);
    assert.ok(existsSync(arq), 'logo não encontrada: ' + m.logo);
    assert.ok(readFileSync(arq).length < 60 * 1024, 'logo pesada demais (> 60KB): ' + m.logo);
  }
});

/* ---------------------------------------------------------------- home */

function secaoMarcas() {
  const html = ler('pages/index.html');
  const ini = html.indexOf('class="conteiner-cartao marcas-section"');
  assert.ok(ini !== -1, 'home sem a seção de marcas');
  const fim = html.indexOf('</section>', ini);
  return { html, ini, trecho: html.slice(ini, fim) };
}

test('home: seção de marcas fica entre "Produtos em destaque" e os Kits', () => {
  const { html, ini } = secaoMarcas();
  const destaques = html.indexOf('id="destaques-section"');
  const kits = html.indexOf('id="cartoes-section"');
  assert.ok(destaques !== -1 && kits !== -1, 'destaques e kits continuam na home');
  assert.ok(destaques < ini && ini < kits, 'ordem: destaques → marcas → kits');
  assert.ok(html.includes('Aqui você encontra'));
});

test('home: links das marcas batem com MARCAS do config.js (mesma ordem, link, logo e alt)', () => {
  const { trecho } = secaoMarcas();
  const links = [...trecho.matchAll(/<a class="marca-item" href="([^"]+)" data-marca="([^"]+)"><img ([^>]+)><\/a>/g)];
  const marcas = carregarMarcas();
  assert.equal(links.length, marcas.length, 'quantidade de marcas na home');
  links.forEach(([, href, slug, attrs], i) => {
    const m = marcas[i];
    assert.equal(slug, m.slug);
    assert.equal(href, '/site/pages/marcas/index.html?marca=' + m.slug);
    assert.ok(existsSync(arquivoDoSite(href)), 'página de marca não existe');
    assert.ok(attrs.includes('src="' + m.logo + '"'), 'logo de ' + m.slug);
    assert.ok(attrs.includes('alt="' + m.nome + '"'), 'alt de ' + m.slug);
    assert.ok(/loading="lazy"/.test(attrs) && /decoding="async"/.test(attrs), 'lazy/async em ' + m.slug);
    assert.ok(/width="\d+"/.test(attrs) && /height="\d+"/.test(attrs), 'width/height evitam pulo de layout');
  });
});

test('home: estilos da seção de marcas existem e as regras antigas continuam', () => {
  const css = ler('assets/css/home.css');
  for (const sel of ['.marcas-lista', '.marca-item', '.marca-item img']) {
    assert.ok(css.includes(sel + ' {') || css.includes(sel + '{'), 'faltou ' + sel);
  }
  for (const antigo of ['.conteiner-cartao{', '.cartoes-section{', '.titulo{', '.cartao{']) {
    assert.ok(css.includes(antigo), 'regra antiga sumiu: ' + antigo);
  }
});

/* ---------------------------------------------------------------- página /marcas/ */

test('página de marca: carrega config.js antes do marca.js e não usa produtos.js nem data-categoria', () => {
  const html = ler('pages/marcas/index.html');
  const iConfig = html.indexOf('/site/assets/js/config.js');
  const iMarca = html.indexOf('/site/assets/js/marca.js');
  assert.ok(iConfig !== -1 && iMarca !== -1 && iConfig < iMarca);
  assert.ok(!html.includes('/site/assets/js/produtos.js'));
  assert.ok(!html.includes('data-categoria'), 'data-categoria faria a página ser tratada como categoria');
  for (const s of ['carrinho.js', 'header.js', 'mobile.js', 'auth.js', 'site-settings.js', 'produtos.css']) {
    assert.ok(html.includes(s), 'faltou ' + s);
  }
  assert.ok(html.includes('id="titulo-marca"') && html.includes('class="pesquisa"'));
  assert.ok(!/<link rel="canonical"/.test(html), 'canonical fixo apontaria todas as marcas para a mesma URL');
});

/* ---- comportamento do marca.js com DOM e fetch simulados */

function montarPagina(busca) {
  let onDomReady = null;
  let onInput = null;
  let onClick = null;
  const metas = {};
  const head = {
    filhos: [],
    querySelector(sel) {
      const m = /^meta\[(\w+)="([^"]+)"\]$/.exec(sel);
      if (m) return metas[m[1] + ':' + m[2]] || null;
      if (sel === 'link[rel="canonical"]') return this.filhos.find((f) => f.tag === 'link') || null;
      return null;
    },
    appendChild(el) {
      this.filhos.push(el);
      if (el.tag === 'meta') {
        const attr = el.attrs.name ? 'name' : 'property';
        metas[attr + ':' + el.attrs[attr]] = el;
      }
    }
  };
  const section = { innerHTML: '' };
  const titulo = { textContent: 'Marcas' };
  const input = { value: '', style: {}, addEventListener(t, fn) { if (t === 'input') onInput = fn; } };
  const chamadas = [];
  let respostaFetch = null;
  const carrinho = [];
  const ctx = {
    location: { search: busca, href: '' },
    document: {
      title: 'Marcas | Casa Só Pimenta',
      head,
      addEventListener(t, fn) { if (t === 'DOMContentLoaded') onDomReady = fn; if (t === 'click') onClick = fn; },
      querySelector: (s) => (s === '.produtos-section' ? section : s === '.pesquisa' ? input : null),
      getElementById: (id) => (id === 'titulo-marca' ? titulo : null),
      createElement(tag) {
        const el = { tag, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
        return el;
      }
    },
    URLSearchParams,
    fetch(url) {
      chamadas.push(url);
      return respostaFetch();
    },
    imgUrl: (p) => p || '/site/imgs/logo.png',
    addCarrinho: (item) => carrinho.push(item),
    API_BASE_URL: 'http://api.teste',
    CATEGORIAS_GRANEL_100G: ['temperos'],
    MARCAS: carregarMarcas()
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(ler('assets/js/marca.js'), ctx);
  return {
    ctx, section, titulo, input, chamadas, carrinho, head, metas,
    responder(fn) { respostaFetch = fn; },
    iniciar() { onDomReady(); },
    digitar(v) { input.value = v; onInput.call(input); },
    clicar(target) { onClick({ target }); }
  };
}

const esperar = () => new Promise((r) => setTimeout(r, 0));
const contar = (s, sub) => s.split(sub).length - 1;
const ok = (dados) => () => Promise.resolve({ ok: true, json: () => Promise.resolve(dados) });

function produto(id, name, extra = {}) {
  return { id, name, price: '10.00', compare_price: null, stock: true, is_active: 1, image_url: '/img/' + id + '.jpg', category_slug: 'conservas', ...extra };
}

test('marca.js: marca conhecida busca na API pelo nome da marca e mostra os cards', async () => {
  const p = montarPagina('?marca=nativa-alimentos');
  p.responder(ok({ products: [produto(1, 'Conserva A - Nativa Alimentos'), produto(2, 'Conserva B - Nativa Alimentos')], total: 2 }));
  p.iniciar();
  assert.ok(p.section.innerHTML.includes('skeleton'), 'mostra skeleton enquanto carrega');
  await esperar();

  assert.equal(p.chamadas.length, 1);
  assert.equal(p.chamadas[0], 'http://api.teste/api/products?brand=Nativa%20Alimentos&limit=1000');
  assert.equal(p.titulo.textContent, 'Nativa Alimentos');
  assert.equal(contar(p.section.innerHTML, '<h3>'), 2);
  assert.ok(!p.section.innerHTML.includes('skeleton'));
  assert.ok(p.section.innerHTML.includes('href="/site/pages/produtos/detalhe/index.html?id=1"'));
  assert.ok(p.section.innerHTML.includes('data-href="/site/pages/produtos/detalhe/index.html?id=1&categoria=conservas"'));
});

test('marca.js: SEO da página usa a marca (title, description, canonical, og:url)', async () => {
  const p = montarPagina('?marca=fogo-mineiro');
  p.responder(ok({ products: [], total: 0 }));
  p.iniciar();
  await esperar();
  assert.equal(p.ctx.document.title, 'Fogo Mineiro | Casa Só Pimenta');
  const url = 'https://www.casasopimenta.com.br/site/pages/marcas/index.html?marca=fogo-mineiro';
  assert.equal(p.head.querySelector('link[rel="canonical"]').attrs.href, url);
  assert.equal(p.metas['property:og:url'].attrs.content, url);
  assert.ok(p.metas['name:description'].attrs.content.includes('Fogo Mineiro'));
  assert.ok(!p.metas['name:robots'], 'marca válida não leva noindex');
});

test('marca.js: marca desconhecida ou sem ?marca= não chama a API e lista as marcas válidas', () => {
  for (const busca of ['?marca=nao-existe', '', '?marca=']) {
    const p = montarPagina(busca);
    p.responder(() => { throw new Error('não deveria buscar'); });
    p.iniciar();
    assert.equal(p.chamadas.length, 0);
    assert.equal(p.titulo.textContent, 'Marca não encontrada');
    assert.equal(p.input.style.display, 'none');
    assert.equal(p.metas['name:robots'].attrs.content, 'noindex');
    for (const m of carregarMarcas()) {
      assert.ok(p.section.innerHTML.includes('?marca=' + m.slug), 'link para ' + m.slug);
    }
  }
});

test('marca.js: slug com maiúsculas ou espaços ainda encontra a marca', async () => {
  const p = montarPagina('?marca=%20Maria-Da-Fe%20');
  p.responder(ok({ products: [], total: 0 }));
  p.iniciar();
  await esperar();
  assert.equal(p.titulo.textContent, 'Maria da Fé');
});

test('marca.js: marca sem produtos mostra "em breve" e erro da API mostra aviso', async () => {
  const vazio = montarPagina('?marca=brasileirissimo');
  vazio.responder(ok({ products: [], total: 0 }));
  vazio.iniciar();
  await esperar();
  assert.ok(vazio.section.innerHTML.includes('Em breve teremos produtos Brasileiríssimo por aqui.'));

  for (const falha of [() => Promise.resolve({ ok: false, status: 500 }), () => Promise.reject(new Error('rede'))]) {
    const p = montarPagina('?marca=nativa-alimentos');
    p.responder(falha);
    p.iniciar();
    await esperar();
    await esperar();
    assert.ok(p.section.innerHTML.includes('Não foi possível carregar os produtos.'));
  }
});

test('marca.js: pesquisa filtra pelo nome ignorando acentos e maiúsculas', async () => {
  const p = montarPagina('?marca=nativa-alimentos');
  p.responder(ok({ products: [produto(1, 'Pimenta Biquinho - Nativa Alimentos'), produto(2, 'Jurubeba - Nativa Alimentos'), produto(3, 'Pimentão - Nativa Alimentos')], total: 3 }));
  p.iniciar();
  await esperar();

  p.digitar('PIMENTAO');
  assert.equal(contar(p.section.innerHTML, '<h3>'), 1);
  assert.ok(p.section.innerHTML.includes('Pimentão'));
  p.digitar('pimenta');
  assert.equal(contar(p.section.innerHTML, '<h3>'), 2);
  p.digitar('xyz');
  assert.ok(p.section.innerHTML.includes('Nenhum produto encontrado.'));
  p.digitar('');
  assert.equal(contar(p.section.innerHTML, '<h3>'), 3);
});

test('marca.js: indisponível fica sem link e com botão desativado; preço promocional e granel 100g', async () => {
  const p = montarPagina('?marca=nativa-alimentos');
  p.responder(ok({ products: [
    produto(1, 'Esgotado - Nativa Alimentos', { stock: false }),
    produto(2, 'Promo - Nativa Alimentos', { price: '20.00', compare_price: '15.50' }),
    produto(3, 'Tempero - Nativa Alimentos', { category_slug: 'temperos' })
  ], total: 3 }));
  p.iniciar();
  await esperar();
  const cards = p.section.innerHTML.split('<div class="cartao').slice(1);
  assert.ok(cards[0].startsWith(' indisponivel"') && cards[0].includes(' disabled>') && !cards[0].includes('data-href'));
  assert.ok(cards[1].includes('R$ 20,00') && cards[1].includes('R$ 15,50') && cards[1].includes('data-product-price="15.50"'));
  assert.ok(cards[2].includes('<p class="unidade-de-medida">100g</p>'));
});

test('marca.js: nome com HTML é escapado (sem injeção)', async () => {
  const p = montarPagina('?marca=nativa-alimentos');
  p.responder(ok({ products: [produto(1, '<img src=x onerror=alert(1)> "x" - Nativa Alimentos')], total: 1 }));
  p.iniciar();
  await esperar();
  assert.ok(!p.section.innerHTML.includes('<img src=x'));
  assert.ok(p.section.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt; &quot;x&quot;'));
});

test('marca.js: botão do card adiciona ao carrinho e clique no card abre o detalhe', async () => {
  const p = montarPagina('?marca=nativa-alimentos');
  p.responder(ok({ products: [produto(7, 'Geleia - Nativa Alimentos')], total: 1 }));
  p.iniciar();
  await esperar();

  const botao = {
    disabled: false,
    dataset: { productId: '7', productName: 'Geleia - Nativa Alimentos', productPrice: '10.00', productImg: '/img/7.jpg', productType: 'produto' }
  };
  p.clicar({ closest: (sel) => (sel === '.add-carrinho-botao' ? botao : null) });
  assert.deepEqual(JSON.parse(JSON.stringify(p.carrinho)), [{ id: '7', nome: 'Geleia - Nativa Alimentos', valor: '10.00', img: '/img/7.jpg', tipo: 'produto' }]);

  const card = { dataset: { href: '/site/pages/produtos/detalhe/index.html?id=7&categoria=conservas' } };
  p.clicar({ closest: (sel) => (sel === '.cartao[data-href]' ? card : null) });
  assert.equal(p.ctx.location.href, card.dataset.href);
});
