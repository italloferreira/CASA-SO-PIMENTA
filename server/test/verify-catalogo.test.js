import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  CATEGORIAS_CATALOGO,
  descricaoCurta,
  medidaDoNome,
  nomeSemMedida,
  precoBR,
  telefoneBR,
  linhaProduto,
  linhaKit,
  agruparCategorias,
  paginar,
  pesoLinha,
  montarCatalogo
} from '../src/utils/catalogo.js';

/* Testes unitários (sem banco) do catálogo em /catalogo */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, '../../site');

function produto(name, category_slug, extra = {}) {
  return { name, category_slug, description: '', price: '10.00', compare_price: null, ...extra };
}

test('descrição curta: primeira frase, até 90 caracteres, cortada em palavra inteira', () => {
  assert.equal(descricaoCurta('Pimenta suave. Ótima em carnes.'), 'Pimenta suave.');
  assert.equal(descricaoCurta('<p>Molho <b>artesanal</b></p>'), 'Molho artesanal');
  assert.equal(descricaoCurta(''), '');
  assert.equal(descricaoCurta(null), '');
  const longa = descricaoCurta('Pimenta preta moída na hora, com aroma intenso e picância marcante para carnes e molhos de todos os tipos. Outra.');
  assert.ok(longa.length <= 91, 'no máximo 90 caracteres + reticências');
  assert.ok(longa.endsWith('…'));
  assert.ok(!/\s…$/.test(longa) && !/,…$/.test(longa));
  assert.equal(longa, 'Pimenta preta moída na hora, com aroma intenso e picância marcante para carnes e molhos…');
});

test('tamanho lido do nome do produto', () => {
  assert.equal(medidaDoNome('Molho Biquinho 150ml - Fogo Mineiro'), '150 ml');
  assert.equal(medidaDoNome('Azeite Extra Virgem 500 ml'), '500 ml');
  assert.equal(medidaDoNome('Mel Silvestre 1kg'), '1 kg');
  assert.equal(medidaDoNome('Vinagre de Maçã 1L - Mendez'), '1 L');
  assert.equal(medidaDoNome('Conserva de Pimenta (320g)'), '320 g');
  assert.equal(medidaDoNome('Azeite 0,5L'), '0,5 L');
  assert.equal(medidaDoNome('Pimenta-do-reino'), null);
  assert.equal(medidaDoNome('Ômega 3 em cápsulas'), null);
  assert.equal(medidaDoNome('Vitamina B12g'), null);
});

test('nome sem a medida, que já aparece na coluna Tamanho', () => {
  assert.equal(nomeSemMedida('Molho Biquinho 150ml - Fogo Mineiro'), 'Molho Biquinho - Fogo Mineiro');
  assert.equal(nomeSemMedida('Conserva de Pimenta (320g)'), 'Conserva de Pimenta');
  assert.equal(nomeSemMedida('Azeite Extra Virgem 500 ml'), 'Azeite Extra Virgem');
  assert.equal(nomeSemMedida('Pimenta-do-reino'), 'Pimenta-do-reino');
});

test('preço e telefone no formato brasileiro', () => {
  assert.equal(precoBR('12.9').replace(/\s/g, ' '), 'R$ 12,90');
  assert.equal(precoBR(1234.5).replace(/\s/g, ' '), 'R$ 1.234,50');
  assert.equal(telefoneBR('31983143902'), '(31) 98314-3902');
  assert.equal(telefoneBR('(31) 98314-3902'), '(31) 98314-3902');
  assert.equal(telefoneBR('+55 31 98314-3902'), '(31) 98314-3902');
  assert.equal(telefoneBR(''), '(31) 98314-3902', 'sem telefone configurado usa o número padrão');
});

test('linha de produto: granel mostra só 100 g; os outros, a medida do nome', () => {
  const tempero = linhaProduto(produto('Páprica Defumada', 'temperos', { price: '7.50' }));
  assert.equal(tempero.tamanho, '100 g');
  assert.equal(tempero.preco.replace(/\s/g, ' '), 'R$ 7,50');

  const molho = linhaProduto(produto('Molho Biquinho 150ml - Fogo Mineiro', 'molhos'));
  assert.equal(molho.tamanho, '150 ml');
  assert.equal(molho.nome, 'Molho Biquinho - Fogo Mineiro');

  assert.equal(linhaProduto(produto('Pano de prato', 'pastosas')).tamanho, 'Unidade');
});

test('linha de produto usa o preço promocional (compare_price), como a loja', () => {
  const linha = linhaProduto(produto('Mel 500g', 'mel', { price: '40.00', compare_price: '35.90' }));
  assert.equal(linha.preco.replace(/\s/g, ' '), 'R$ 35,90');
});

test('linha de kit mostra a quantidade de itens', () => {
  assert.equal(linhaKit({ name: 'Kit A', price: '50', total_itens: '4' }).tamanho, '4 itens');
  assert.equal(linhaKit({ name: 'Kit B', price: '50', total_itens: 1 }).tamanho, '1 item');
  assert.equal(linhaKit({ name: 'Kit C', price: '50', total_itens: 0 }).tamanho, 'Kit');
});

test('categorias na ordem do menu, sem as vazias, numeradas e em ordem alfabética', () => {
  const cats = agruparCategorias([
    produto('Urucum', 'temperos'),
    produto('Açafrão', 'temperos'),
    produto('Cominho', 'temperos'),
    produto('Molho Verde 150ml', 'molhos')
  ], [{ name: 'Kit Churrasco', price: '80', total_itens: 3 }]);

  assert.deepEqual(cats.map((c) => c.slug), ['molhos', 'temperos', 'kits']);
  assert.deepEqual(cats.map((c) => c.numero), ['01', '02', '03']);
  assert.deepEqual(cats[1].linhas.map((l) => l.nome), ['Açafrão', 'Cominho', 'Urucum']);
});

test('peso da linha: nome ou descrição que quebram contam mais; sem descrição, menos', () => {
  assert.equal(pesoLinha({ nome: 'Cominho', descricao: 'Terroso e marcante.' }), 1);
  assert.equal(pesoLinha({ nome: 'Cominho', descricao: 'x'.repeat(80) }), 1.25);
  assert.equal(pesoLinha({ nome: 'n'.repeat(45), descricao: 'curta' }), 1.33);
  assert.equal(pesoLinha({ nome: 'Cominho', descricao: '' }), 0.75);
});

test('paginação: categoria nova em página nova, continuação com 1 linha a mais e numeração contínua', () => {
  const muitos = Array.from({ length: 16 }, (_, i) => produto('Tempero ' + String(i).padStart(2, '0'), 'temperos', { description: 'Descrição curta.' }));
  const cats = agruparCategorias([produto('Molho 150ml', 'molhos', { description: 'Picante.' })].concat(muitos), []);
  const paginas = paginar(cats, 7);

  assert.deepEqual(paginas.map((p) => p.numero), ['01', '02', '03', '04']);
  assert.deepEqual(paginas.map((p) => p.categoria.slug), ['molhos', 'temperos', 'temperos', 'temperos']);
  assert.deepEqual(paginas.map((p) => p.continuacao), [false, false, true, true]);
  assert.deepEqual(paginas.map((p) => p.linhas.length), [1, 7, 8, 1]);
});

test('paginação: linhas que quebram em 2 linhas ocupam mais espaço', () => {
  const longos = Array.from({ length: 7 }, (_, i) => produto('Tempero ' + i, 'temperos', { description: 'x'.repeat(80) + '.' }));
  const paginas = paginar(agruparCategorias(longos, []), 7);
  assert.deepEqual(paginas.map((p) => p.linhas.length), [5, 2], '7 linhas de peso 1,25 não cabem numa página de 7');
});

test('HTML: escapa os textos do banco, libera só o script com nonce e mostra o contato', () => {
  const html = montarCatalogo({
    produtos: [produto('<script>alert(1)</script> 150ml', 'molhos', { description: 'Picante & saboroso.' })],
    kits: [],
    settings: { contact_phone: '31999998888', social_instagram: '@casasopimenta' },
    ano: 2026,
    nonce: 'abc123'
  });
  assert.ok(!html.includes('<script>alert(1)'), 'nome do produto deve ser escapado');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('Picante &amp; saboroso.'));
  assert.ok(html.includes('<script nonce="abc123">'));
  assert.equal((html.match(/<script/g) || []).length, 1, 'só um script, o do nonce');
  assert.ok(html.includes('WhatsApp (31) 99999-8888 · casasopimenta.com.br · @casasopimenta'));
  assert.ok(html.includes('Catálogo 2026 · Mercado Central de BH desde 2005'));
  assert.ok(html.includes('p. 01'));
  assert.ok(!html.includes('onclick'), 'sem handler inline (a CSP bloquearia)');
  assert.ok(html.includes('function corrigirPaginas'), 'rede de segurança da paginação incluída');
});

test('HTML sem produtos não quebra', () => {
  const html = montarCatalogo({ produtos: [], kits: [], settings: {} });
  assert.ok(html.includes('Nenhum produto disponível'));
});

test('categorias do catálogo seguem a mesma ordem e os nomes do menu do site', () => {
  const home = readFileSync(path.join(SITE_DIR, 'pages/index.html'), 'utf8');
  const inicio = home.indexOf('class="menu-principal"');
  const menu = home.slice(inicio, home.indexOf('</section>', inicio));

  const ctx = { window: { location: { hostname: 'localhost' } } };
  vm.runInNewContext(readFileSync(path.join(SITE_DIR, 'assets/js/config.js'), 'utf8'), ctx);
  const slugPorPagina = {};
  Object.entries(ctx.window.PAGINAS_CATEGORIA).forEach(([slug, url]) => { slugPorPagina[url] = slug; });

  const doMenu = [];
  const re = /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
  let m;
  while ((m = re.exec(menu)) !== null) {
    if (slugPorPagina[m[1]]) doMenu.push({ slug: slugPorPagina[m[1]], nome: m[2].trim() });
  }

  assert.deepEqual(CATEGORIAS_CATALOGO.map((c) => c.slug), doMenu.map((c) => c.slug));
  assert.deepEqual(CATEGORIAS_CATALOGO.map((c) => c.nome), doMenu.map((c) => c.nome));
  CATEGORIAS_CATALOGO.forEach((c) => assert.ok(c.frase && c.frase.length <= 90, 'frase da categoria ' + c.slug));
});
