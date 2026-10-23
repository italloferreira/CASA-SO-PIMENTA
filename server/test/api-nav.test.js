import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const API_BASE = process.env.API_TEST_URL || 'http://localhost:3333';

let categories = null;

async function getCategories() {
  const res = await fetch(API_BASE + '/api/categories');
  assert.equal(res.status, 200, 'GET /api/categories deve retornar 200');
  return res.json();
}

async function getProductsByCategory(slug) {
  const res = await fetch(API_BASE + '/api/products?category=' + encodeURIComponent(slug));
  assert.equal(res.status, 200, 'GET /api/products?category=' + slug + ' deve retornar 200');
  return res.json();
}

async function getProductById(id) {
  const res = await fetch(API_BASE + '/api/products/' + id);
  assert.equal(res.status, 200, 'GET /api/products/' + id + ' deve retornar 200');
  return res.json();
}

const CATEGORIAS_GRANEL = ['farinhas', 'castanhas', 'chas', 'temperos', 'produtos-de-limpeza', 'graos', 'cocos'];

beforeEach(async () => {
  if (!categories) categories = await getCategories();
});

test('categorias novas e renomeadas estão presentes na API', () => {
  const slugs = categories.map((c) => c.slug);
  const names = categories.map((c) => c.name);

  for (const expected of ['molhos', 'conservas', 'pequi', 'azeites', 'vinagres', 'produtos-de-limpeza', 'kits', 'farinhas', 'geleias', 'pastosas', 'sementes', 'liofilizados', 'aveias', 'desidratados', 'mantegas', 'sal', 'farofas', 'mel', 'tira-gostos', 'cocos', 'graos', 'granjeados', 'acucares']) {
    assert.ok(slugs.includes(expected), 'categoria esperada não encontrada: ' + expected);
  }

  const molhos = categories.find((c) => c.slug === 'molhos');
  assert.equal(molhos.name, 'Molhos', 'molhos deve ter nome Molhos');

  for (const [slug, name] of [['cocos', 'Cocos'], ['graos', 'Grãos'], ['granjeados', 'Granjeados'], ['acucares', 'Açúcares'], ['pequi', 'Pequi']]) {
    const cat = categories.find((c) => c.slug === slug);
    assert.ok(cat, 'categoria nova ausente: ' + slug);
    assert.equal(cat.name, name, slug + ' deve ter nome ' + name);
  }

  assert.ok(!slugs.includes('pimentas'), 'categoria pimentas não deve existir');
  assert.ok(!slugs.includes('melados'), 'categoria melados não deve existir');
});

test('categorias inalteradas continuam na API', () => {
  const names = categories.map((c) => c.name);
  // "Outros" deixou de ser categoria ativa: virou apenas o grupo do menu (Açúcares, Granjeados...)
  for (const expected of ['Temperos', 'Farinhas', 'Castanhas', 'Chás', 'Kits']) {
    assert.ok(names.includes(expected), 'categoria inalterada ausente: ' + expected);
  }
});

test('produtos por categoria retornam 200 para todas as novas categorias', async () => {
  for (const slug of ['molhos', 'conservas', 'pequi', 'azeites', 'vinagres', 'produtos-de-limpeza', 'kits', 'farinhas', 'geleias', 'pastosas', 'sementes', 'liofilizados', 'aveias', 'desidratados', 'mantegas', 'sal', 'farofas', 'mel', 'tira-gostos', 'cocos', 'graos', 'granjeados', 'acucares']) {
    const data = await getProductsByCategory(slug);
    assert.ok(Array.isArray(data.products), 'products deve ser array para ' + slug);
    assert.equal(typeof data.total, 'number', 'total deve ser número para ' + slug);
  }
});

function normalizarNome(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

test('produtos de categorias retornam em ordem alfabética (ignorando acentos)', async () => {
  let categoriasComProduto = 0;

  for (const c of categories) {
    const res = await fetch(API_BASE + '/api/products?category=' + encodeURIComponent(c.slug) + '&limit=1000');
    assert.equal(res.status, 200, 'GET produtos da categoria ' + c.slug + ' deve retornar 200');
    const data = await res.json();

    if (data.total < 2) continue;
    categoriasComProduto++;

    const nomes = data.products.map((p) => normalizarNome(p.name));
    for (let i = 1; i < nomes.length; i++) {
      assert.ok(
        nomes[i - 1] <= nomes[i],
        'categoria ' + c.slug + ' fora de ordem alfabética: "' + data.products[i - 1].name + '" veio antes de "' + data.products[i].name + '"'
      );
    }
  }

  assert.ok(categoriasComProduto >= 1, 'deveria existir pelo menos 1 categoria com 2+ produtos para validar a ordenação');
});

test('categoria antiga "pimentas" não quebra a API (retorna vazio)', async () => {
  const data = await getProductsByCategory('pimentas');
  assert.ok(Array.isArray(data.products), 'products deve ser array');
  assert.equal(data.products.length, 0, 'nenhum produto deve restar em pimentas');
});

test('molhos herda os produtos que eram de pimentas', async () => {
  const data = await getProductsByCategory('molhos');
  assert.ok(data.total >= 1, 'molhos deve conter pelo menos 1 produto');
  const first = data.products[0];
  assert.equal(first.category_slug, 'molhos', 'produto deve apontar para categoria molhos');
});

test('detalhe de produto retorna category_slug para categorias granel e nao-granel', async () => {
  const slugsGranelComProduto = [];
  for (const slug of CATEGORIAS_GRANEL) {
    const data = await getProductsByCategory(slug);
    if (data.total >= 1) {
      const first = data.products[0];
      const detail = await getProductById(first.id);
      assert.equal(detail.category_slug, slug, 'detalhe de produto de ' + slug + ' deve ter category_slug = ' + slug);
      slugsGranelComProduto.push(slug);
    }
  }

  assert.ok(slugsGranelComProduto.length >= 3, 'pelo menos 3 categorias granel deveriam ter produtos para validar (veio ' + slugsGranelComProduto.length + ')');

  const dataMolhos = await getProductsByCategory('molhos');
  assert.ok(dataMolhos.total >= 1, 'molhos deve ter produto para validar detalhe');
  const molhosDetail = await getProductById(dataMolhos.products[0].id);
  assert.equal(molhosDetail.category_slug, 'molhos');
  assert.ok(!CATEGORIAS_GRANEL.includes(molhosDetail.category_slug), 'molhos nao deve ser tratado como granel');
});