import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* Modais do admin (Cupons, Categorias e confirmação de exclusão em Cupons, Categorias, Kits e Banners).
   Nenhum teste aqui depende da API ou do banco. */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, '..');
const ler = (rel) => readFileSync(path.join(SITE_DIR, rel), 'utf-8');

const PAGINAS = ['cupons', 'categorias', 'kits', 'banners'];
const html = (pag) => ler('pages/admin/' + pag + '/index.html');
const js = (pag) => ler('pages/admin/assets/js/' + pag + '.js');
const CSS_ADMIN = ['admin-global', 'table', 'modal', 'forms'].map((n) => ler('pages/admin/assets/css/' + n + '.css')).join('\n');

/* trecho do HTML a partir de um id até o próximo <script ou comentário de bloco */
function bloco(pagina, id) {
  const inicio = pagina.indexOf('id="' + id + '"');
  assert.ok(inicio > -1, '#' + id + ' não encontrado');
  const fim = pagina.slice(inicio).search(/<!--|<script/);
  return pagina.slice(inicio, fim === -1 ? undefined : inicio + fim);
}

/* ---------------------------------------------------------------- estrutura */

test('modais: todo .modal (que não é drawer) tem o cartão .modal-content como primeiro filho', () => {
  for (const pag of PAGINAS) {
    const h = html(pag);
    const modais = [...h.matchAll(/<div class="modal(?: ([^"]*))?" id="(\w+)">\s*<(\w+)[^>]*class="([^"]*)"/g)];
    assert.ok(modais.length >= 1, pag + ': nenhum modal encontrado');
    for (const [, extra = '', id, , classeFilho] of modais) {
      if (extra.split(' ').includes('drawer')) continue;
      assert.ok(classeFilho.split(' ').includes('modal-content'), pag + ' #' + id + ': falta o cartão .modal-content');
    }
  }
});

test('modais: confirmação de exclusão tem ícone, título ligado ao diálogo e botões que não enviam formulário', () => {
  for (const pag of PAGINAS) {
    const b = bloco(html(pag), 'confirmModal');
    assert.ok(b.includes('role="alertdialog"'), pag);
    assert.ok(b.includes('aria-labelledby="confirmTitle"') && b.includes('id="confirmTitle"'), pag);
    assert.ok(b.includes('aria-describedby="confirmMessage"') && b.includes('id="confirmMessage"'), pag);
    assert.ok(b.includes('class="confirm-icon"'), pag);
    assert.ok(b.includes('<button type="button" class="btn btn-secondary" id="confirmCancel">'), pag);
    assert.ok(b.includes('<button type="button" class="btn btn-danger" id="confirmDelete">'), pag);
  }
});

test('modais: formulário de cupom e categoria envolve corpo e rodapé (Salvar dentro do form)', () => {
  for (const [pag, form, salvar] of [['cupons', 'cupomForm', 'btnSaveCupom'], ['categorias', 'categoriaForm', 'btnSaveCategoria']]) {
    const h = html(pag);
    const m = new RegExp('<form id="' + form + '" class="modal-form">([\\s\\S]*?)</form>').exec(h);
    assert.ok(m, pag + ': form com .modal-form não encontrado');
    assert.ok(m[1].includes('class="modal-body"'), pag + ': corpo dentro do form');
    assert.ok(m[1].includes('class="modal-footer"'), pag + ': rodapé dentro do form');
    assert.ok(m[1].includes('type="submit" class="btn btn-primary" id="' + salvar + '"'), pag + ': Salvar envia o form');
    assert.ok(m[1].includes('type="button" class="btn btn-secondary" id="modalCancel"'), pag + ': Cancelar não envia o form');
    assert.ok(h.includes('aria-labelledby="modalTitle"') && h.includes('id="modalTitle"'), pag);
    assert.ok(h.includes('id="modalClose" aria-label="Fechar"'), pag + ': botão de fechar tem nome acessível');
  }
});

test('modais: todo label aponta para um campo que existe', () => {
  for (const pag of ['cupons', 'categorias']) {
    const h = bloco(html(pag), 'modal');
    for (const [, alvo] of h.matchAll(/<label[^>]*for="([^"]+)"/g)) {
      assert.ok(h.includes('id="' + alvo + '"'), pag + ': label for="' + alvo + '" sem campo');
    }
    for (const [, alvo] of h.matchAll(/aria-describedby="([^"]+)"/g)) {
      assert.ok(h.includes('id="' + alvo + '"'), pag + ': aria-describedby="' + alvo + '" sem texto');
    }
  }
});

test('modais: todo id que o JS da página procura continua existindo', () => {
  for (const pag of PAGINAS) {
    const src = js(pag);
    const existentes = new Set([...(html(pag) + src).matchAll(/id=\\?"([^"\\]+)\\?"/g)].map((m) => m[1]));
    const usados = new Set([...src.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]));
    const faltando = [...usados].filter((id) => !existentes.has(id));
    assert.deepEqual(faltando, [], pag + ': ids usados pelo JS e ausentes no HTML');
  }
});

test('modais: toda classe usada nos modais tem estilo no CSS do admin', () => {
  const trechos = [
    bloco(html('cupons'), 'modal'), bloco(html('categorias'), 'modal'),
    ...PAGINAS.map((p) => bloco(html(p), 'confirmModal'))
  ].join('\n');
  const classes = new Set([...trechos.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
  for (const c of classes) {
    assert.ok(new RegExp('\\.' + c + '(?![\\w-])').test(CSS_ADMIN), 'classe .' + c + ' sem estilo');
  }
  assert.ok(!trechos.includes('form-actions') && !trechos.includes('form-label-inline'), 'classes sem CSS não podem voltar aos modais');
});

test('modais: select e seletor de cor não ficam com cara de desativados', () => {
  const forms = ler('pages/admin/assets/css/forms.css');
  assert.ok(!/\.form-input:read-only/.test(forms), ':read-only pega <select> e <input type="color">');
  assert.match(forms, /\.form-input\[readonly\]\s*\{/);
});

test('modais: regras novas do modal não vazam para o drawer de clientes (.modal.drawer sem cartão)', () => {
  const modal = ler('pages/admin/assets/css/modal.css');
  assert.ok(!/(^|\n)\s*\.modal-header h2/.test(modal), 'h2 do cabeçalho só dentro de .modal-content');
  assert.ok(!/\n\s*\.modal\s*\{\s*padding/.test(modal), 'padding de celular não pode pegar .modal.drawer');
  assert.ok(html('clientes').includes('<div class="modal drawer" id="drawer">'), 'drawer de clientes continua igual');
});

/* ---------------------------------------------------------------- comportamento (JS real da página, DOM simulado) */

const tick = () => new Promise((r) => setImmediate(r));

function elementoFake(id) {
  const handlers = {};
  const classes = new Set();
  const el = {
    id, value: '', checked: false, hidden: false, disabled: false, placeholder: '', textContent: '', innerHTML: '',
    style: {}, dataset: {}, files: [], handlers,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, f) => ((f === undefined ? !classes.has(c) : f) ? classes.add(c) : classes.delete(c))
    },
    addEventListener(tipo, fn) { (handlers[tipo] ||= []).push(fn); },
    removeEventListener() {},
    disparar(tipo, evento = {}) {
      for (const fn of handlers[tipo] || []) fn.call(el, { target: el, preventDefault() {}, ...evento });
    },
    querySelector: () => null, querySelectorAll: () => [], appendChild() {}, removeChild() {}, remove() {}, insertBefore() {},
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, focus() {}, click() {}, reset() {}, closest: () => null
  };
  return el;
}

/* roda o JS da página com os imports trocados por globais; o estado inicial dos campos vem do HTML */
function montarPagina(pag, respostas = {}) {
  const pagina = html(pag);
  const tags = new Map();
  for (const m of pagina.matchAll(/<(\w+)([^>]*\sid="([^"]+)"[^>]*)>/g)) tags.set(m[3], { nome: m[1], attrs: m[2], idx: m.index });
  const elementos = new Map();
  function getElementById(id) {
    if (!elementos.has(id)) {
      const el = elementoFake(id);
      const t = tags.get(id);
      if (t) {
        el.hidden = /\shidden(\s|$)/.test(t.attrs);
        el.checked = /\schecked(\s|$)/.test(t.attrs);
        const valor = /\svalue="([^"]*)"/.exec(t.attrs);
        if (valor) el.value = valor[1];
        if (t.nome === 'select') el.value = /<option value="([^"]*)"/.exec(pagina.slice(t.idx))[1];
        const ph = /\splaceholder="([^"]*)"/.exec(t.attrs);
        if (ph) el.placeholder = ph[1];
      }
      elementos.set(id, el);
    }
    return elementos.get(id);
  }

  const doc = {};
  const chamadas = [];
  const ctx = {
    document: {
      getElementById,
      addEventListener(tipo, fn) { (doc[tipo] ||= []).push(fn); },
      querySelector: () => null, querySelectorAll: () => [], createElement: () => elementoFake(), body: elementoFake('body')
    },
    protectRoute() {},
    showToast() {},
    apiRequest(method, caminho, body) {
      chamadas.push({ method, caminho, body: body === undefined ? undefined : JSON.parse(JSON.stringify(body)) });
      return Promise.resolve(respostas[caminho] ?? {});
    },
    API_BASE: '', imageUrl: (p) => p,
    console, setTimeout, clearTimeout, URLSearchParams
  };
  ctx.window = ctx;

  const codigo = js(pag).replace(/^import[\s\S]*?from\s+'[^']+';[ \t]*$/gm, '');
  assert.ok(!/^import\b/m.test(codigo), pag + ': imports devem ter virado globais');
  assert.ok(/import \{ ligarFechamentoModal \} from '\.\/modal-utils\.js';/.test(js(pag)), pag + ' deve importar modal-utils.js');
  vm.createContext(ctx);
  vm.runInContext(ler('pages/admin/assets/js/modal-utils.js').replace(/^export\s+/gm, ''), ctx);
  vm.runInContext(codigo, ctx);
  for (const fn of doc.DOMContentLoaded || []) fn();

  return {
    ctx, chamadas,
    el: getElementById,
    aberto: (id) => getElementById(id).classList.contains('active'),
    tecla(key) { for (const fn of doc.keydown || []) fn({ key }); }
  };
}

const cliqueNoFundo = (modal) => { modal.disparar('mousedown', { target: modal }); modal.disparar('click', { target: modal }); };
const cliqueNoCartao = (modal) => { const dentro = {}; modal.disparar('mousedown', { target: dentro }); modal.disparar('click', { target: dentro }); };
const arrastarDoCampoAteOFundo = (modal) => { modal.disparar('mousedown', { target: {} }); modal.disparar('click', { target: modal }); };

const CUPONS = {
  '/api/coupons': {
    coupons: [
      { id: 5, code: 'PCT10', discount_type: 'percentage', discount_value: 10, min_order_amount: null, max_uses: null, expires_at: null, is_active: true, times_used: 0 },
      { id: 6, code: 'FIXO5', discount_type: 'fixed', discount_value: 5, min_order_amount: 50, max_uses: 3, expires_at: '2026-12-31T00:00:00Z', is_active: false, times_used: 1 }
    ]
  }
};

test('cupons: valor do desconto mostra R$ ou % conforme o tipo', async () => {
  const p = montarPagina('cupons', CUPONS);
  await tick();
  p.el('btnNovoCupom').disparar('click');
  assert.ok(p.aberto('modal') && p.aberto('modalOverlay'));
  assert.equal(p.el('cupomDiscountPrefix').hidden, false);
  assert.equal(p.el('cupomDiscountSuffix').hidden, true);
  assert.equal(p.el('cupomDiscount').placeholder, '0,00');

  p.el('cupomDiscountType').value = 'percentage';
  p.el('cupomDiscountType').disparar('change');
  assert.equal(p.el('cupomDiscountPrefix').hidden, true);
  assert.equal(p.el('cupomDiscountSuffix').hidden, false);
  assert.equal(p.el('cupomDiscount').placeholder, '10');

  p.ctx.editCupom(6);
  assert.equal(p.el('cupomDiscountType').value, 'fixed');
  assert.equal(p.el('cupomDiscountPrefix').hidden, false, 'editar cupom fixo mostra R$');
  p.ctx.editCupom(5);
  assert.equal(p.el('cupomDiscountSuffix').hidden, false, 'editar cupom percentual mostra %');
  assert.equal(p.el('modalTitle').textContent, 'Editar Cupom');
});

test('cupons: Esc e clique no fundo fecham; clique no cartão e arrastar seleção não fecham', async () => {
  const p = montarPagina('cupons', CUPONS);
  await tick();
  const modal = p.el('modal');

  p.el('btnNovoCupom').disparar('click');
  cliqueNoCartao(modal);
  assert.ok(p.aberto('modal'), 'clique dentro do cartão não fecha');
  arrastarDoCampoAteOFundo(modal);
  assert.ok(p.aberto('modal'), 'arrastar a seleção de um campo até o fundo não fecha');
  cliqueNoFundo(modal);
  assert.ok(!p.aberto('modal') && !p.aberto('modalOverlay'), 'clique no fundo fecha');

  p.el('btnNovoCupom').disparar('click');
  p.tecla('Enter');
  assert.ok(p.aberto('modal'), 'outra tecla não fecha');
  p.tecla('Escape');
  assert.ok(!p.aberto('modal'), 'Esc fecha');

  p.el('btnNovoCupom').disparar('click');
  p.el('modalCancel').disparar('click');
  assert.ok(!p.aberto('modal'), 'Cancelar continua fechando');
});

test('cupons: confirmação de exclusão fecha com fundo, Esc e Cancelar, e Excluir continua chamando a API', async () => {
  const p = montarPagina('cupons', CUPONS);
  await tick();
  const confirm = p.el('confirmModal');
  p.ctx.confirmDelete(5);
  assert.ok(p.aberto('confirmModal') && p.aberto('confirmOverlay'));
  assert.equal(p.el('confirmMessage').textContent, 'Excluir cupom "PCT10"?');
  cliqueNoFundo(confirm);
  assert.ok(!p.aberto('confirmModal') && !p.aberto('confirmOverlay'));
  p.ctx.confirmDelete(5);
  p.tecla('Escape');
  assert.ok(!p.aberto('confirmModal'));
  p.ctx.confirmDelete(5);
  p.el('confirmCancel').disparar('click');
  assert.ok(!p.aberto('confirmModal'));

  p.ctx.confirmDelete(5);
  p.el('confirmDelete').disparar('click');
  assert.ok(p.chamadas.some((c) => c.method === 'DELETE' && c.caminho === '/api/coupons/5'));
  await tick();
  assert.ok(!p.aberto('confirmModal'), 'fecha depois de excluir');
});

test('cupons: salvar continua enviando os mesmos dados para a API', async () => {
  const p = montarPagina('cupons', CUPONS);
  await tick();
  p.el('btnNovoCupom').disparar('click');
  p.el('cupomCode').value = ' pim10 ';
  p.el('cupomDiscountType').value = 'percentage';
  p.el('cupomDiscount').value = '10';
  p.el('cupomMaxUses').value = '50';
  p.el('cupomActive').checked = false;
  p.el('cupomForm').disparar('submit');
  const post = p.chamadas.find((c) => c.method === 'POST');
  assert.deepEqual(post, {
    method: 'POST', caminho: '/api/coupons',
    body: { code: 'PIM10', discount_type: 'percentage', discount_value: 10, min_order_amount: null, max_uses: 50, expires_at: null, is_active: false }
  });
  await tick();
  assert.ok(!p.aberto('modal'), 'fecha depois de salvar');
});

test('categorias: Esc e clique no fundo fecham o modal e a confirmação; salvar continua igual', async () => {
  const p = montarPagina('categorias', { '/api/categories': [{ id: 3, name: 'Molhos', slug: 'molhos', color: '#8B2E00' }] });
  await tick();
  p.el('btnNovaCategoria').disparar('click');
  assert.ok(p.aberto('modal'));
  assert.equal(p.el('catColor').value, '#8B2E00');
  cliqueNoCartao(p.el('modal'));
  assert.ok(p.aberto('modal'));
  p.tecla('Escape');
  assert.ok(!p.aberto('modal') && !p.aberto('modalOverlay'));
  p.el('btnNovaCategoria').disparar('click');
  cliqueNoFundo(p.el('modal'));
  assert.ok(!p.aberto('modal'));

  p.ctx.confirmDelete(3);
  assert.ok(p.aberto('confirmModal'));
  cliqueNoFundo(p.el('confirmModal'));
  assert.ok(!p.aberto('confirmModal') && !p.aberto('confirmOverlay'));

  p.el('btnNovaCategoria').disparar('click');
  p.el('catName').value = 'Geleias';
  p.el('catSlug').value = '';
  p.el('catColorText').value = '#123ABC';
  p.el('categoriaForm').disparar('submit');
  const post = p.chamadas.find((c) => c.method === 'POST');
  assert.deepEqual(post, { method: 'POST', caminho: '/api/categories', body: { name: 'Geleias', slug: 'geleias', color: '#123ABC' } });
});

for (const [pag, rota, item] of [['kits', '/api/kits', { id: 1, name: 'Kit Churrasco' }], ['banners', '/api/banners', { id: 1, title: 'Promo' }]]) {
  test(pag + ': confirmação de exclusão fecha com fundo e Esc', async () => {
    const p = montarPagina(pag, { [rota]: [item] });
    await tick();
    p.ctx.confirmDelete(1);
    assert.ok(p.aberto('confirmModal'));
    cliqueNoCartao(p.el('confirmModal'));
    assert.ok(p.aberto('confirmModal'), 'clique no cartão não fecha');
    cliqueNoFundo(p.el('confirmModal'));
    assert.ok(!p.aberto('confirmModal') && !p.aberto('confirmOverlay'));
    p.ctx.confirmDelete(1);
    p.tecla('Escape');
    assert.ok(!p.aberto('confirmModal'));
  });
}
