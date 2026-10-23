import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, '..');

const DETALHE_JS = 'assets/js/detalhe.js';
const CONFIG_JS = 'assets/js/config.js';
const PRODUTOS_CSS = 'assets/css/produtos.css';

const GRANEL = ['farinhas', 'castanhas', 'chas', 'sementes', 'liofilizados', 'aveias', 'desidratados', 'cocos', 'graos', 'temperos', 'farofas', 'produtos-de-limpeza', 'sal', 'tira-gostos', 'granjeados', 'acucares'];

function iterateJs(dir) {
  let files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files = files.concat(iterateJs(path.join(dir, entry.name)));
    } else if (entry.name.endsWith('.js')) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

test('detalhe.js usa a lista de categorias granel e so renderiza 100g condicionalmente', () => {
  const source = readFileSync(path.join(SITE_DIR, DETALHE_JS), 'utf-8');
  const configSource = readFileSync(path.join(SITE_DIR, CONFIG_JS), 'utf-8');

  assert.ok(source.includes('CATEGORIAS_COM_MEDIDA_100G'), 'detalhe.js deve definir a constante de categorias granel');
  assert.ok(source.includes('window.CATEGORIAS_GRANEL_100G'), 'detalhe.js deve usar a lista granel definida no config.js');
  assert.ok(configSource.includes('window.CATEGORIAS_GRANEL_100G'), 'config.js deve definir a lista granel');
  for (const slug of GRANEL) {
    assert.ok(configSource.includes("'" + slug + "'"), 'config.js deve incluir a categoria granel ' + slug);
  }

  const ocorrencias100g = source.match(/100g/g) || [];
  assert.equal(ocorrencias100g.length, 1, '100g deve aparecer exatamente 1 vez em detalhe.js (veio ' + ocorrencias100g.length + ')');
  assert.ok(source.includes("? '<p class=\"unidade-de-medida\">100g</p>' : ''"),
    '100g deve estar dentro do ternario de renderização condicional');
  assert.ok(!source.includes('<p class="unidade-de-medida"> 100g </p>'),
    'não pode existir 100g hardcoded como paragrafo incondicional');
});

test('produtos.css estiliza a badge de medida no desktop e no mobile', () => {
  const css = readFileSync(path.join(SITE_DIR, PRODUTOS_CSS), 'utf-8');

  assert.ok(css.includes('.cartao p.unidade-de-medida'), 'CSS deve ter a regra da badge de medida');
  assert.ok(css.includes('height: 5%'), 'badge deve ter altura compacta (height: 5%)');

  const blocosBadge = css.match(/\.cartao p\.unidade-de-medida\s*\{[\s\S]*?\}/g) || [];
  assert.ok(blocosBadge.length >= 2, 'badge deve ter regra no desktop e no media query mobile (veio ' + blocosBadge.length + ')');

  assert.ok(blocosBadge.some(function (b) { return /font-size:\s*15px/.test(b); }), 'badge desktop deve ter font-size 15px');
  assert.ok(blocosBadge.some(function (b) { return /font-size:\s*12px/.test(b); }), 'badge mobile deve ter font-size 12px');
});

test('nenhum outro script do site hardcoda 100g', () => {
  const jsFiles = iterateJs(path.join(SITE_DIR, 'assets/js'));
  for (const file of jsFiles) {
    const norm = file.replace(/\\/g, '/');
    if (norm.endsWith(DETALHE_JS)) continue;

    const source = readFileSync(file, 'utf-8');

    if (norm.endsWith(CONFIG_JS)) {
      assert.ok(source.includes('window.CATEGORIAS_GRANEL_100G'), CONFIG_JS + ' deve definir a lista granel');
      assert.ok(!source.includes('unidade-de-medida'), CONFIG_JS + ' não deve renderizar a badge de medida');
      continue;
    }

    if (norm.endsWith('assets/js/produtos.js')) {
      assert.ok(source.includes('window.CATEGORIAS_GRANEL_100G'), 'produtos.js deve usar a lista granel do config.js');
      const ocorrencias100g = source.match(/100g/g) || [];
      assert.equal(ocorrencias100g.length, 1, 'produtos.js deve conter "100g" apenas na badge condicional (veio ' + ocorrencias100g.length + ')');
      assert.ok(source.includes("? '<p class=\"unidade-de-medida\">100g</p>' : ''"),
        'produtos.js deve renderizar a badge apenas no ternario condicional');
      continue;
    }

    assert.ok(!source.includes('100g'), norm + ' contém "100g" hardcoded');
  }
});