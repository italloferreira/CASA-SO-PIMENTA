import { test, before } from 'node:test';
import assert from 'node:assert/strict';

/* Integração: GET /api/products?brand= contra a API local e o banco real (somente leitura) */

const API_BASE = process.env.API_TEST_URL || 'http://localhost:3333';

async function get(path) {
  const res = await fetch(API_BASE + path);
  return { status: res.status, body: await res.json() };
}

function normalizar(s) {
  return (s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// critério independente do SQL da API: trecho depois do último traço precedido de espaço
function marcaDoNome(nome) {
  const m = /\s[-–—]\s*([^-–—]+)$/.exec(nome);
  return m ? m[1].trim() : '';
}

function ids(produtos) {
  return produtos.map((p) => p.id).sort((a, b) => a - b);
}

let catalogo = [];
let marcas = {};

before(async () => {
  const { status, body } = await get('/api/products?limit=1000');
  assert.equal(status, 200, 'API indisponível em ' + API_BASE + ' — o servidor está rodando?');
  catalogo = body.products;
  for (const p of catalogo) {
    const marca = normalizar(marcaDoNome(p.name));
    if (!marca) continue;
    (marcas[marca] = marcas[marca] || []).push(p);
  }
  assert.ok(Object.keys(marcas).length >= 2, 'o catálogo deveria ter produtos com marca no nome');
});

test('cada marca traz exatamente os produtos ativos com aquela marca no nome', async () => {
  for (const [marca, esperados] of Object.entries(marcas)) {
    const { status, body } = await get('/api/products?limit=1000&brand=' + encodeURIComponent(marca));
    assert.equal(status, 200);
    assert.equal(body.total, esperados.length, 'total da marca ' + marca);
    assert.deepEqual(ids(body.products), ids(esperados), 'produtos da marca ' + marca);
  }
});

test('maiúsculas, acentos e espaços nas pontas não mudam o resultado', async () => {
  const [marca, esperados] = Object.entries(marcas).sort((a, b) => b[1].length - a[1].length)[0];
  const original = marcaDoNome(esperados[0].name);
  for (const variacao of [original.toUpperCase(), original.toLowerCase(), '  ' + original + '  ', marca]) {
    const { body } = await get('/api/products?limit=1000&brand=' + encodeURIComponent(variacao));
    assert.deepEqual(ids(body.products), ids(esperados), 'variação "' + variacao + '"');
  }
});

test('resultado vem em ordem alfabética do nome, como nas categorias', async () => {
  const [marca] = Object.entries(marcas).sort((a, b) => b[1].length - a[1].length)[0];
  const { body } = await get('/api/products?limit=1000&brand=' + encodeURIComponent(marca));
  const nomes = body.products.map((p) => normalizar(p.name));
  assert.deepEqual(nomes, [...nomes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
});

test('pedaço da marca ou palavra do meio do nome não conta como marca', async () => {
  const [marca] = Object.entries(marcas).sort((a, b) => b[1].length - a[1].length)[0];
  const pedaco = marca.split(' ')[0];
  if (pedaco !== marca && !(pedaco in marcas)) {
    const { body } = await get('/api/products?limit=1000&brand=' + encodeURIComponent(pedaco));
    assert.equal(body.total, 0, '"' + pedaco + '" sozinho não é marca');
  }
  // "Conserva" aparece no começo de muitos nomes, mas nunca depois do " - "
  const { body } = await get('/api/products?limit=1000&brand=Conserva');
  assert.equal(body.total, 0);
});

test('curingas do SQL e marca inexistente retornam lista vazia, sem erro', async () => {
  for (const termo of ['%', '_', '%%', '\\', "'; DROP TABLE products; --", 'Marca Que Nao Existe']) {
    const { status, body } = await get('/api/products?limit=1000&brand=' + encodeURIComponent(termo));
    assert.equal(status, 200, 'termo ' + termo);
    assert.equal(body.total, 0, 'termo ' + termo);
    assert.deepEqual(body.products, []);
  }
});

test('brand vazio é ignorado: resposta idêntica à listagem sem filtro', async () => {
  const semFiltro = await get('/api/products?limit=1000');
  for (const valor of ['', '   ']) {
    const comVazio = await get('/api/products?limit=1000&brand=' + encodeURIComponent(valor));
    assert.equal(comVazio.status, 200);
    assert.deepEqual(comVazio.body, semFiltro.body);
  }
});

test('brand combina com category e com a paginação', async () => {
  const [marca, esperados] = Object.entries(marcas).sort((a, b) => b[1].length - a[1].length)[0];
  const categoria = esperados[0].category_slug;
  const daCategoria = esperados.filter((p) => p.category_slug === categoria);
  const { body } = await get('/api/products?limit=1000&brand=' + encodeURIComponent(marca) + '&category=' + categoria);
  assert.deepEqual(ids(body.products), ids(daCategoria));

  const pag1 = await get('/api/products?limit=2&offset=0&brand=' + encodeURIComponent(marca));
  const pag2 = await get('/api/products?limit=2&offset=2&brand=' + encodeURIComponent(marca));
  assert.equal(pag1.body.total, esperados.length);
  assert.ok(pag1.body.products.length <= 2);
  const repetidos = pag1.body.products.filter((p) => pag2.body.products.some((q) => q.id === p.id));
  assert.equal(repetidos.length, 0, 'páginas não podem repetir produtos');
});

test('sitemap não lista a página de marca sem ?marca= (ela só tem conteúdo com o parâmetro)', async () => {
  const res = await fetch(API_BASE + '/api/sitemap.xml');
  assert.equal(res.status, 200);
  const xml = await res.text();
  assert.ok(!xml.includes('/site/pages/marcas/'), 'marcas/ deveria estar fora do sitemap');
  assert.ok(xml.includes('/site/pages/produtos/conservas/index.html'), 'as categorias continuam no sitemap');
});
