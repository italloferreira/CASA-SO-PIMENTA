import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

/* Carrossel de banners da home: proporção da caixa (CSS) e troca de slide por toque (home.js) */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, '..');
const ler = (rel) => readFileSync(path.join(SITE_DIR, rel), 'utf-8');

const CSS = ler('assets/css/home.css');
const [DESKTOP, MOBILE] = CSS.split('@media (max-width: 1000px)');
const regra = (css, seletor) => (css.match(new RegExp('\\n\\s*' + seletor.replace('.', '\\.') + '\\s*\\{[^}]*\\}')) || [''])[0];

/* ---------------------------------------------------------------- CSS */

test('CSS: a caixa do carrossel segue a proporção 16:9 dos banners', () => {
  const caixa = regra(DESKTOP, '.carrossel-container');
  assert.match(caixa, /aspect-ratio: 16 \/ 9/);
  assert.match(caixa, /max-height: 85vh/, 'em tela larga e baixa o banner não pode passar da tela');
  assert.ok(!/height: 90%/.test(caixa), 'altura presa à seção fazia a imagem ser cortada em telas altas');
});

test('CSS: a seção não tem mais altura fixa de 100vh e desconta o cabeçalho fixo', () => {
  const secao = regra(DESKTOP, '.carrossel-section');
  assert.ok(!/height: 100vh/.test(secao), 'altura de 100vh deixava a caixa "em pé" em telas altas');
  assert.match(secao, /padding-top: 10vh/, 'o cabeçalho é fixo com 10vh');
  assert.match(regra(DESKTOP, 'header'), /height: 10vh/);
});

test('CSS: a imagem preenche a caixa e o slide ocupa a largura inteira', () => {
  assert.match(regra(DESKTOP, '.slide img'), /object-fit: cover/);
  assert.match(regra(DESKTOP, '.slide'), /min-width: 100%/);
  assert.match(regra(DESKTOP, '.slide'), /flex: 0 0 100%/, 'sem flex-basis o Safari do iPhone esticava o slide até a largura real da imagem');
});

test('CSS: no mobile o carrossel aparece (não é mais escondido) e as setas ficam menores', () => {
  assert.ok(!/\.carrossel-section\s*\{[^}]*display:\s*none/.test(MOBILE), 'o carrossel não pode sumir no mobile');
  assert.match(regra(MOBILE, '.carrossel-container'), /width: 92%/);
  assert.match(regra(MOBILE, '.seta'), /width: 32px/);
});

/* ---------------------------------------------------------------- JS: troca por toque */

function botao() {
  const ouvintes = [];
  return { addEventListener(t, fn) { if (t === 'click') ouvintes.push(fn); }, click() { ouvintes.forEach((fn) => fn()); } };
}

function montarCarrossel(banners) {
  let onDomReady = null;
  const ouvintesToque = {};
  const wrapper = { addEventListener(t, fn, opcoes) { ouvintesToque[t] = { fn, opcoes }; } };
  const slides = { innerHTML: '', style: {}, parentElement: wrapper };
  const els = { slides, anterior: botao(), proximo: botao() };
  const ctx = {
    document: {
      addEventListener(t, fn) { if (t === 'DOMContentLoaded') onDomReady = fn; },
      getElementById: (id) => els[id] || null,
      querySelector: () => null
    },
    localStorage: {
      getItem: (k) => ({ home_banners: JSON.stringify(banners), home_banners_tempo: String(Date.now()) })[k] || null,
      setItem() {}
    },
    fetch: () => new Promise(() => {}),
    imgUrl: (p) => p,
    IntersectionObserver: class { observe() {} disconnect() {} },
    setInterval: () => 0,
    clearInterval() {},
    API_BASE_URL: 'http://api.teste',
    console
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(ler('assets/js/home.js'), ctx);
  onDomReady();

  function arrastar(de, para) {
    ouvintesToque.touchstart.fn({ touches: [{ clientX: de[0], clientY: de[1] }] });
    ouvintesToque.touchend.fn({ changedTouches: [{ clientX: para[0], clientY: para[1] }] });
  }
  const slideAtual = () => Number((slides.style.transform.match(/-(\d+)%/) || [0, 0])[1]) / 100;
  return { arrastar, slideAtual, ouvintesToque };
}

const TRES = [{ image_url: '/a.jpg' }, { image_url: '/b.jpg' }, { image_url: '/c.jpg' }];

test('JS: arrastar para a esquerda avança e para a direita volta (dando a volta nas pontas)', () => {
  const c = montarCarrossel(TRES);
  assert.equal(c.slideAtual(), 0);
  c.arrastar([300, 100], [200, 105]);
  assert.equal(c.slideAtual(), 1);
  c.arrastar([300, 100], [200, 100]);
  assert.equal(c.slideAtual(), 2);
  c.arrastar([300, 100], [200, 100]);
  assert.equal(c.slideAtual(), 0, 'depois do último volta ao primeiro');
  c.arrastar([100, 100], [250, 100]);
  assert.equal(c.slideAtual(), 2, 'antes do primeiro vai ao último');
});

test('JS: rolar a página (gesto vertical) ou um toque curto não troca o slide', () => {
  const c = montarCarrossel(TRES);
  c.arrastar([200, 400], [150, 100]);
  assert.equal(c.slideAtual(), 0, 'gesto mais vertical que horizontal é rolagem');
  c.arrastar([200, 100], [175, 100]);
  assert.equal(c.slideAtual(), 0, 'menos de 40px é toque, não arrasto');
});

test('JS: touchend sem touchstart é ignorado', () => {
  const c = montarCarrossel(TRES);
  c.ouvintesToque.touchend.fn({ changedTouches: [{ clientX: 0, clientY: 0 }] });
  assert.equal(c.slideAtual(), 0);
});

test('JS: os eventos de toque são passivos (não travam a rolagem do celular)', () => {
  const c = montarCarrossel(TRES);
  assert.equal(c.ouvintesToque.touchstart.opcoes.passive, true);
  assert.equal(c.ouvintesToque.touchend.opcoes.passive, true);
});

test('JS: sem banners, arrastar não quebra', () => {
  const c = montarCarrossel([]);
  c.arrastar([300, 100], [100, 100]);
  assert.equal(c.slideAtual(), 0);
});
