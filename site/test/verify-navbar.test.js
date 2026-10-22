import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = path.resolve(__dirname, '../pages');
const SITE_DIR = path.resolve(__dirname, '..');

function iterateHtml(dir) {
  let files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files = files.concat(iterateHtml(path.join(dir, entry.name)));
    } else if (entry.name.endsWith('.html')) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

const PAGE_REL = '/site/pages/';

function resolveHref(href) {
  if (!href.startsWith(PAGE_REL)) return null;
  return path.join(SITE_DIR, href.slice('/site/'.length));
}

function getMenuRegion(html, listTag, scanAnchor) {
  const openIdx = html.indexOf(listTag);
  if (openIdx === -1) return null;
  let endIdx;
  if (scanAnchor) {
    const anchorIdx = html.indexOf(scanAnchor, openIdx);
    endIdx = anchorIdx === -1 ? html.length : anchorIdx;
  } else {
    endIdx = html.length;
  }
  return html.slice(openIdx, endIdx);
}

function allHrefs(region) {
  const hrefs = [];
  const re = /href="(\/site\/[^"]+)"/g;
  let m;
  while ((m = re.exec(region)) !== null) hrefs.push(m[1]);
  return hrefs;
}

const CHECK_DESKTOP = [
  ['Home', 'href="/site/pages/index.html"'],
  ['Molhos e Conservas', 'Molhos e Conservas'],
  ['submenu Molhos', 'href="/site/pages/produtos/molhos/index.html"'],
  ['submenu Conservas', 'href="/site/pages/produtos/conservas/index.html"'],
  ['submenu Pequi', 'href="/site/pages/produtos/pequi/index.html"'],
  ['submenu Geleias', 'href="/site/pages/produtos/geleias/index.html"'],
  ['submenu Pastosas', 'href="/site/pages/produtos/pastosas/index.html"'],
  ['Produtos naturais', 'Produtos naturais'],
  ['submenu Farinhas(PN)', 'href="/site/pages/produtos/produtosNaturais/farinhas/index.html"'],
  ['submenu Castanhas(PN)', 'href="/site/pages/produtos/produtosNaturais/castanhas/index.html"'],
  ['submenu Chás(PN)', 'href="/site/pages/produtos/produtosNaturais/chas/index.html"'],
  ['submenu Sementes(PN)', 'href="/site/pages/produtos/produtosNaturais/sementes/index.html"'],
  ['submenu Liofilizados(PN)', 'href="/site/pages/produtos/produtosNaturais/liofilizados/index.html"'],
  ['submenu Aveias(PN)', 'href="/site/pages/produtos/produtosNaturais/aveias/index.html"'],
  ['submenu Desidratados(PN)', 'href="/site/pages/produtos/produtosNaturais/desidratados/index.html"'],
  ['submenu Cocos(PN)', 'href="/site/pages/produtos/produtosNaturais/cocos/index.html"'],
  ['submenu Grãos(PN)', 'href="/site/pages/produtos/produtosNaturais/graos/index.html"'],
  ['Temperos', 'href="/site/pages/produtos/temperos/index.html"'],
  ['Outros', 'Outros'],
  ['submenu Azeites', 'href="/site/pages/produtos/azeites/index.html"'],
  ['submenu Vinagres', 'href="/site/pages/produtos/vinagres/index.html"'],
  ['submenu Produtos de limpeza', 'href="/site/pages/produtos/produtosDeLimpeza/index.html"'],
  ['submenu Kits', 'href="/site/pages/produtos/kits/index.html"'],
  ['submenu Mantegas', 'href="/site/pages/produtos/mantegas/index.html"'],
  ['submenu Sal', 'href="/site/pages/produtos/sal/index.html"'],
  ['submenu Farofas', 'href="/site/pages/produtos/farofas/index.html"'],
  ['submenu Mel', 'href="/site/pages/produtos/mel/index.html"'],
  ['submenu Tira gostos', 'href="/site/pages/produtos/tira-gostos/index.html"'],
  ['submenu Granjeados', 'href="/site/pages/produtos/outro/granjeados/index.html"'],
  ['submenu Açúcares', 'href="/site/pages/produtos/outro/acucares/index.html"'],
  ['Sobre', 'href="/site/pages/sobre/index.html"']
];

const CHECK_MOBILE = [
  ['Home', 'href="/site/pages/index.html"'],
  ['Molhos e Conservas', 'Molhos e Conservas'],
  ['submenu Molhos', 'href="/site/pages/produtos/molhos/index.html"'],
  ['submenu Conservas', 'href="/site/pages/produtos/conservas/index.html"'],
  ['submenu Pequi', 'href="/site/pages/produtos/pequi/index.html"'],
  ['submenu Geleias', 'href="/site/pages/produtos/geleias/index.html"'],
  ['submenu Pastosas', 'href="/site/pages/produtos/pastosas/index.html"'],
  ['Produtos naturais', 'Produtos naturais'],
  ['submenu Farinhas(PN)', 'href="/site/pages/produtos/produtosNaturais/farinhas/index.html"'],
  ['submenu Castanhas(PN)', 'href="/site/pages/produtos/produtosNaturais/castanhas/index.html"'],
  ['submenu Chás(PN)', 'href="/site/pages/produtos/produtosNaturais/chas/index.html"'],
  ['submenu Sementes(PN)', 'href="/site/pages/produtos/produtosNaturais/sementes/index.html"'],
  ['submenu Liofilizados(PN)', 'href="/site/pages/produtos/produtosNaturais/liofilizados/index.html"'],
  ['submenu Aveias(PN)', 'href="/site/pages/produtos/produtosNaturais/aveias/index.html"'],
  ['submenu Desidratados(PN)', 'href="/site/pages/produtos/produtosNaturais/desidratados/index.html"'],
  ['submenu Cocos(PN)', 'href="/site/pages/produtos/produtosNaturais/cocos/index.html"'],
  ['submenu Grãos(PN)', 'href="/site/pages/produtos/produtosNaturais/graos/index.html"'],
  ['Temperos', 'href="/site/pages/produtos/temperos/index.html"'],
  ['Outros', 'Outros'],
  ['submenu Azeites', 'href="/site/pages/produtos/azeites/index.html"'],
  ['submenu Vinagres', 'href="/site/pages/produtos/vinagres/index.html"'],
  ['submenu Produtos de limpeza', 'href="/site/pages/produtos/produtosDeLimpeza/index.html"'],
  ['submenu Kits', 'href="/site/pages/produtos/kits/index.html"'],
  ['submenu Mantegas', 'href="/site/pages/produtos/mantegas/index.html"'],
  ['submenu Sal', 'href="/site/pages/produtos/sal/index.html"'],
  ['submenu Farofas', 'href="/site/pages/produtos/farofas/index.html"'],
  ['submenu Mel', 'href="/site/pages/produtos/mel/index.html"'],
  ['submenu Tira gostos', 'href="/site/pages/produtos/tira-gostos/index.html"'],
  ['submenu Granjeados', 'href="/site/pages/produtos/outro/granjeados/index.html"'],
  ['submenu Açúcares', 'href="/site/pages/produtos/outro/acucares/index.html"'],
  ['Sobre', 'href="/site/pages/sobre/index.html"']
];

const htmlFiles = iterateHtml(PAGES_DIR).filter((f) => !f.includes('pimentas'));

test('todas as páginas com menu têm navbar desktop e mobile corretos', () => {
  const is404 = (f) => f.replace(/\\/g, '/').includes('404/');
  const pagesWithMenu = htmlFiles.filter((f) => {
    if (is404(f)) return false;
    const html = readFileSync(f, 'utf-8');
    return html.includes('menu-principal');
  });

  assert.ok(pagesWithMenu.length >= 10, 'deveria haver pelo menos 10 páginas com menu-principal, veio ' + pagesWithMenu.length);

  for (const file of pagesWithMenu) {
    const html = readFileSync(file, 'utf-8');
    const rel = path.relative(SITE_DIR, file).replace(/\\/g, '/');

    const desktopEnd = html.indexOf('<nav class="menu-mobile"');
    const desktopRegion = html.slice(html.indexOf('menu-principal'), desktopEnd === -1 ? html.length : desktopEnd);

    for (const [label, needle] of CHECK_DESKTOP) {
      assert.ok(desktopRegion.includes(needle), rel + ': menu desktop sem "' + label + '"');
    }
    assert.ok(!desktopRegion.includes('pimentas/index.html'), rel + ': menu desktop ainda referencia pimentas');
    assert.ok(!desktopRegion.includes('produtos/outro/index.html'), rel + ': menu desktop ainda referencia Outros como link'); 

    const mobIdx = html.indexOf('menu-mobile-links');
    assert.ok(mobIdx !== -1, rel + ': menu mobile ausente');
    const mobEnd = html.indexOf('menu-mobile-footer', mobIdx);
    const mobileRegion = html.slice(mobIdx, mobEnd === -1 ? html.length : mobEnd);

    for (const [label, needle] of CHECK_MOBILE) {
      assert.ok(mobileRegion.includes(needle), rel + ': menu mobile sem "' + label + '"');
    }
    assert.ok(!mobileRegion.includes('pimentas/index.html'), rel + ': menu mobile ainda referencia pimentas');
    assert.ok(!mobileRegion.includes('produtos/outro/index.html'), rel + ': menu mobile ainda referencia Outros como link');
  }
});

test('todos os links do menu (desktop) apontam para arquivos existentes', () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf-8');
    const desktopEnd = html.indexOf('<nav class="menu-mobile"');
    const region = html.slice(html.indexOf('menu-principal'), desktopEnd === -1 ? html.length : desktopEnd);

    for (const href of allHrefs(region)) {
      const resolved = resolveHref(href);
      if (!resolved) continue;
      assert.ok(existsSync(resolved), file + ': link do menu nao existe -> ' + href);
    }
  }
});

test('Outros: nenhum submenu com Farofas contém Farinhas (Farinhas só em Produtos naturais)', () => {
  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf-8');
    for (const marker of ['<ul class="submenu"', '<ul class="submenu-mobile"']) {
      let i = 0;
      while ((i = html.indexOf(marker, i)) !== -1) {
        const close = html.indexOf('</ul>', i);
        const window = html.slice(i, close === -1 ? undefined : close);
        if (window.includes('href="/site/pages/produtos/farofas/index.html"')) {
          assert.ok(!window.includes('produtosNaturais/farinhas/index.html'),
            file + ': dropdown Outros contém Farinhas');
        }
        i += marker.length;
      }
    }
  }
});

test('subcategorias: nenhuma categoria nova com data-categoria quebrada', () => {
  const cases = [
    ['site/pages/produtos/molhos/index.html', 'molhos'],
    ['site/pages/produtos/conservas/index.html', 'conservas'],
    ['site/pages/produtos/pequi/index.html', 'pequi'],
    ['site/pages/produtos/azeites/index.html', 'azeites'],
    ['site/pages/produtos/vinagres/index.html', 'vinagres'],
    ['site/pages/produtos/produtosDeLimpeza/index.html', 'produtos-de-limpeza'],
    ['site/pages/produtos/kits/index.html', 'kits'],
    ['site/pages/produtos/geleias/index.html', 'geleias'],
    ['site/pages/produtos/pastosas/index.html', 'pastosas'],
    ['site/pages/produtos/produtosNaturais/sementes/index.html', 'sementes'],
    ['site/pages/produtos/produtosNaturais/liofilizados/index.html', 'liofilizados'],
    ['site/pages/produtos/produtosNaturais/aveias/index.html', 'aveias'],
    ['site/pages/produtos/produtosNaturais/desidratados/index.html', 'desidratados'],
    ['site/pages/produtos/mantegas/index.html', 'mantegas'],
    ['site/pages/produtos/sal/index.html', 'sal'],
    ['site/pages/produtos/farofas/index.html', 'farofas'],
    ['site/pages/produtos/mel/index.html', 'mel'],
    ['site/pages/produtos/tira-gostos/index.html', 'tira-gostos'],
    ['site/pages/produtos/produtosNaturais/cocos/index.html', 'cocos'],
    ['site/pages/produtos/produtosNaturais/graos/index.html', 'graos'],
    ['site/pages/produtos/outro/granjeados/index.html', 'granjeados'],
    ['site/pages/produtos/outro/acucares/index.html', 'acucares']
  ];
  for (const [rel, slug] of cases) {
    const file = path.join(SITE_DIR, rel.slice('site/'.length));
    assert.ok(existsSync(file), 'página nova não existe: ' + rel);
    const html = readFileSync(file, 'utf-8');
    assert.ok(html.includes('data-categoria="' + slug + '"'), rel + ': data-categoria errado');
    assert.ok(html.includes('produtos.js'), rel + ': deve carregar produtos.js');
  }
});