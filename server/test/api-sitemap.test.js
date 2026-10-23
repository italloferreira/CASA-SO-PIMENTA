import { test } from 'node:test';
import assert from 'node:assert/strict';

const API_BASE = process.env.API_TEST_URL || 'http://localhost:3333';

async function getSitemap() {
  const res = await fetch(API_BASE + '/api/sitemap.xml');
  assert.equal(res.status, 200, 'GET /api/sitemap.xml deve retornar 200');
  assert.match(res.headers.get('content-type'), /xml/);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
}

test('sitemap lista home, categorias e produtos ativos', async () => {
  const locs = await getSitemap();
  assert.ok(locs.includes('https://www.casasopimenta.com.br/site/pages/index.html'));
  assert.ok(locs.includes('https://www.casasopimenta.com.br/site/pages/produtos/molhos/index.html'));
  assert.ok(locs.some(l => l.includes('/produtos/detalhe/index.html?id=')), 'deve ter páginas de produto');
});

test('sitemap não expõe páginas privadas nem redirecionamentos', async () => {
  const locs = await getSitemap();
  const proibidas = ['/admin/', '/checkout/', '/conta/', '/login/', '/pedidos/', '/404/', '/produtos/pimentas/'];
  for (const loc of locs) {
    for (const p of proibidas) assert.ok(!loc.includes(p), loc + ' não deveria estar no sitemap');
  }
});

test('sitemap não repete URLs', async () => {
  const locs = await getSitemap();
  assert.equal(new Set(locs).size, locs.length);
});
