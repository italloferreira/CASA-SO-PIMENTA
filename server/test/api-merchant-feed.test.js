import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { CATEGORIAS_GRANEL_100G } from '../src/controllers/seoController.js';

const API_BASE = process.env.API_TEST_URL || 'http://localhost:3333';

async function getItens() {
  const res = await fetch(API_BASE + '/api/merchant-feed.xml');
  assert.equal(res.status, 200, 'GET /api/merchant-feed.xml deve retornar 200');
  assert.match(res.headers.get('content-type'), /xml/);
  const xml = await res.text();
  assert.match(xml, /xmlns:g="http:\/\/base\.google\.com\/ns\/1\.0"/);
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(function (m) {
    const campos = {};
    for (const c of m[1].matchAll(/<g:(\w+)>([^<]*)<\/g:\1>/g)) {
      if (!(c[1] in campos)) campos[c[1]] = c[2];
    }
    return campos;
  });
}

test('feed tem produtos e kits com os campos obrigatórios do Google', async () => {
  const itens = await getItens();
  assert.ok(itens.some(i => i.id.startsWith('P-')), 'deve ter produtos');
  for (const i of itens) {
    for (const campo of ['id', 'title', 'description', 'link', 'image_link', 'availability', 'condition', 'brand', 'price']) {
      assert.ok(i[campo], i.id + ' sem ' + campo);
    }
    assert.match(i.price, /^\d+\.\d{2} BRL$/);
    assert.match(i.availability, /^(in_stock|out_of_stock)$/);
    assert.match(i.image_link, /^https?:\/\//);
    assert.ok(i.link.startsWith('https://www.casasopimenta.com.br/site/pages/'), i.link);
  }
});

test('feed não repete ids', async () => {
  const ids = (await getItens()).map(i => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('sale_price só aparece quando é menor que o price', async () => {
  for (const i of await getItens()) {
    if (i.sale_price) assert.ok(parseFloat(i.sale_price) < parseFloat(i.price), i.id);
  }
});

test('lista de granel do feed é a mesma do site', () => {
  const config = fs.readFileSync(new URL('../../site/assets/js/config.js', import.meta.url), 'utf8');
  const lista = JSON.parse(config.match(/CATEGORIAS_GRANEL_100G = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  assert.deepEqual(CATEGORIAS_GRANEL_100G, lista);
});
