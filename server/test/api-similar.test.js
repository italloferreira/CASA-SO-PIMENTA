import { test, before } from 'node:test';
import assert from 'node:assert/strict';

/* Integração: GET /api/products/:id/similar contra a API local e o banco real */

const API_BASE = process.env.API_TEST_URL || 'http://localhost:3333';

async function get(path) {
  const res = await fetch(API_BASE + path);
  return { status: res.status, body: await res.json() };
}

function normalizar(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// palavras "de verdade" do nome, sem marca, medidas nem plural — critério independente do usado na API
function palavras(nome) {
  return normalizar(nome.split(' - ')[0]).split(/[^a-z]+/).filter((p) => p.length >= 4).map((p) => p.replace(/s$/, ''));
}

let catalogo = [];

before(async () => {
  const { status, body } = await get('/api/products?limit=1000');
  assert.equal(status, 200, 'API indisponível em ' + API_BASE + ' — o servidor está rodando?');
  catalogo = body.products;
  assert.ok(catalogo.length > 50, 'catálogo pequeno demais para os testes');
});

function porCategoria(slug) {
  return catalogo.filter((p) => p.category_slug === slug);
}

async function status(ids) {
  return (await get('/api/products/status?ids=' + ids.join(','))).body;
}

test('retorna até 8 semelhantes relevantes, nunca o próprio produto', async () => {
  const base = porCategoria('temperos').find((p) => /pimenta/i.test(p.name));
  assert.ok(base, 'precisa de uma pimenta em temperos');

  const { status: st, body } = await get('/api/products/' + base.id + '/similar');
  assert.equal(st, 200);
  assert.equal(body.category_slug, 'temperos');
  assert.ok(body.category_name);
  assert.ok(body.products.length >= 4 && body.products.length <= 8, 'veio ' + body.products.length);
  assert.ok(!body.products.some((p) => p.id === base.id), 'o próprio produto não pode ser sugerido');
  assert.equal(new Set(body.products.map((p) => p.id)).size, body.products.length, 'sem repetidos');

  const chaves = new Set(palavras(base.name));
  for (const p of body.products) {
    const relacionado = p.category_slug === base.category_slug || palavras(p.name).some((w) => chaves.has(w));
    assert.ok(relacionado, '"' + p.name + '" não tem relação com "' + base.name + '"');
  }
});

test('em categoria grande, o 1º sugerido é da mesma categoria e compartilha palavra do nome', async () => {
  const base = porCategoria('temperos').find((p) => /pimenta/i.test(p.name));
  const { body } = await get('/api/products/' + base.id + '/similar');
  const [primeiro] = body.products;
  assert.equal(primeiro.category_slug, 'temperos');
  assert.ok(palavras(primeiro.name).some((w) => palavras(base.name).includes(w)), '1º sugerido: ' + primeiro.name);
});

test('só sugere produtos ativos e em estoque (conferido pelo endpoint de status)', async () => {
  for (const slug of ['temperos', 'farinhas', 'graos', 'castanhas']) {
    const base = porCategoria(slug)[0];
    const { body } = await get('/api/products/' + base.id + '/similar?limit=12');
    if (body.products.length === 0) continue;
    const st = await status(body.products.map((p) => p.id));
    for (const p of body.products) {
      assert.equal(p.stock, true, p.name + ' veio sem estoque');
      assert.equal(st[String(p.id)].stock, true, p.name + ' sem estoque no banco');
      assert.equal(Number(st[String(p.id)].is_active), 1, p.name + ' inativo no banco');
    }
  }
});

test('produto esgotado também recebe sugestões, e nunca é sugerido para os outros', async () => {
  const esgotado = catalogo.find((p) => !p.stock);
  if (!esgotado) return; // catálogo sem itens esgotados no momento

  const { status: st, body } = await get('/api/products/' + esgotado.id + '/similar');
  assert.equal(st, 200);
  assert.ok(body.products.length >= 1, 'esgotado precisa de alternativas');

  for (const vizinho of porCategoria(esgotado.category_slug).filter((p) => p.id !== esgotado.id)) {
    const r = await get('/api/products/' + vizinho.id + '/similar?limit=12');
    assert.ok(!r.body.products.some((p) => p.id === esgotado.id), 'esgotado sugerido em ' + vizinho.name);
  }
});

test('categoria com 1 produto busca semelhantes em outras categorias pelo nome', async () => {
  const contagem = {};
  for (const p of catalogo) contagem[p.category_slug] = (contagem[p.category_slug] || 0) + 1;
  const base = catalogo.find((p) => contagem[p.category_slug] === 1 && palavras(p.name).length > 0);
  if (!base) return;

  const { body } = await get('/api/products/' + base.id + '/similar');
  assert.ok(body.products.length >= 1, 'deveria achar algo para "' + base.name + '"');
  const chaves = new Set(palavras(base.name));
  for (const p of body.products) {
    assert.ok(palavras(p.name).some((w) => chaves.has(w)) || p.category_slug === base.category_slug, '"' + p.name + '" sem relação');
  }
});

test('limit: respeita o pedido, máximo 12, e cai no padrão 8 quando inválido', async () => {
  const base = porCategoria('temperos')[0];
  const url = '/api/products/' + base.id + '/similar';
  assert.equal((await get(url + '?limit=3')).body.products.length, 3);
  assert.equal((await get(url + '?limit=999')).body.products.length, 12);
  assert.equal((await get(url + '?limit=abc')).body.products.length, 8);
  assert.equal((await get(url + '?limit=-5')).body.products.length, 1);
  assert.equal((await get(url)).body.products.length, 8);
});

test('mesma página sempre mostra a mesma lista (ordem determinística)', async () => {
  const base = porCategoria('farinhas')[0];
  const a = await get('/api/products/' + base.id + '/similar');
  const b = await get('/api/products/' + base.id + '/similar');
  assert.deepEqual(a.body.products.map((p) => p.id), b.body.products.map((p) => p.id));
});

test('cada sugestão traz só os campos do card', async () => {
  const base = porCategoria('temperos')[0];
  const { body } = await get('/api/products/' + base.id + '/similar');
  for (const p of body.products) {
    assert.deepEqual(Object.keys(p).sort(), ['category_name', 'category_slug', 'compare_price', 'id', 'image_url', 'name', 'price', 'stock']);
  }
});

test('id inválido responde 400; produto inexistente responde 404', async () => {
  for (const id of ['abc', '1.5', '-1', '1e3', '9999999999', '%20']) {
    const r = await get('/api/products/' + id + '/similar');
    assert.equal(r.status, 400, 'id "' + id + '" deveria ser 400 (veio ' + r.status + ')');
    assert.ok(r.body.message);
  }
  const inexistente = await get('/api/products/999999999/similar');
  assert.equal(inexistente.status, 404);
  assert.match(inexistente.body.message, /não encontrado/);
});

test('regressão: as rotas de produto existentes continuam iguais', async () => {
  const base = catalogo[0];
  const detalhe = await get('/api/products/' + base.id);
  assert.equal(detalhe.status, 200);
  assert.equal(detalhe.body.id, base.id);
  assert.ok(Array.isArray(detalhe.body.images));

  assert.equal((await get('/api/products/999999999')).status, 404);
  const lista = await get('/api/products?limit=5');
  assert.equal(lista.status, 200);
  assert.equal(lista.body.products.length, 5);
  assert.equal((await get('/api/products/search?q=pimenta')).status, 200);
});
