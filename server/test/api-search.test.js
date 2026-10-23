import { test } from 'node:test';
import assert from 'node:assert/strict';

const API_BASE = process.env.API_TEST_URL || 'http://localhost:3333';

async function search(params) {
  const res = await fetch(API_BASE + '/api/products/search?' + new URLSearchParams(params));
  return { status: res.status, body: await res.json() };
}

function normalizar(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

test('busca sem termo retorna 400', async () => {
  assert.equal((await search({})).status, 400);
  assert.equal((await search({ q: '   ' })).status, 400);
});

test('busca com categoria retorna apenas produtos daquela categoria', async () => {
  for (const [q, category] of [['a', 'temperos'], ['e', 'tira-gostos'], ['o', 'graos']]) {
    const { status, body } = await search({ q, category });
    assert.equal(status, 200);
    assert.ok(body.length >= 1, 'deveria ter resultados para q=' + q + ' em ' + category);
    for (const p of body) {
      assert.equal(p.category_slug, category, '"' + p.name + '" não é de ' + category);
    }
  }
});

test('"açu" em temperos não traz produtos de tira-gostos', async () => {
  const { body } = await search({ q: 'açu', category: 'temperos' });
  assert.ok(!body.some((p) => p.category_slug === 'tira-gostos'), 'veio produto de tira-gostos');
  assert.ok(!body.some((p) => /amendoim/i.test(p.name)), 'veio Amendoim Doce');
});

test('busca considera apenas o nome (não descrição nem ingredientes)', async () => {
  const { body } = await search({ q: 'vinagrete' });
  assert.ok(body.length >= 1, 'o produto Vinagrete deveria ser encontrado');
  assert.ok(!body.some((p) => /mostarda/i.test(p.name)), 'mostarda não tem "vinagrete" no nome');

  for (const q of ['vinagrete', 'mel', 'pimenta']) {
    const r = await search({ q });
    for (const p of r.body) {
      assert.ok(normalizar(p.name).includes(normalizar(q)), '"' + p.name + '" não contém "' + q + '" no nome');
    }
  }
});

test('busca ignora acentos e maiúsculas', async () => {
  const semAcento = await search({ q: 'acucar' });
  const comAcento = await search({ q: 'AÇÚCAR' });
  assert.ok(semAcento.body.length >= 1, '"acucar" deveria encontrar produtos com "Açúcar"');
  assert.deepEqual(
    semAcento.body.map((p) => p.id),
    comAcento.body.map((p) => p.id),
    '"acucar" e "AÇÚCAR" deveriam trazer os mesmos produtos'
  );
});

test('% e _ são tratados como texto, não como curinga', async () => {
  for (const q of ['%', '_']) {
    const { status, body } = await search({ q });
    assert.equal(status, 200);
    for (const p of body) {
      assert.ok(p.name.includes(q), '"' + p.name + '" não contém "' + q + '"');
    }
  }
});

test('categoria inexistente retorna lista vazia', async () => {
  const { status, body } = await search({ q: 'a', category: 'categoria-que-nao-existe' });
  assert.equal(status, 200);
  assert.deepEqual(body, []);
});
