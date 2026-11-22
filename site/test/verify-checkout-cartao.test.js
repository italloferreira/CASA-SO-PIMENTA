import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* Checkout: formulário de cartão do Mercado Pago x cupom de desconto.
   Roda o checkout.js de verdade com DOM falso e um Mercado Pago simulado. Não depende da API. */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, '..');
const ler = (rel) => readFileSync(path.join(SITE_DIR, rel), 'utf-8');
const CHECKOUT_JS = ler('assets/js/checkout.js');
const tick = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

function elementoFake(id, attrs = {}) {
  const classes = new Set();
  return {
    id, attrs, value: '', checked: false, hidden: false, disabled: false, readOnly: false,
    textContent: '', innerHTML: '', className: '', style: {}, dataset: {},
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    getAttribute: (n) => (n in attrs ? attrs[n] : null),
    setAttribute(n, v) { attrs[n] = v; },
    parentNode: { insertBefore() {} },
    appendChild() {}, insertBefore() {}, remove() {}, focus() {}, addEventListener() {}, scrollIntoView() {},
    querySelector: () => null, querySelectorAll: () => []
  };
}

/* Mercado Pago falso: registra cada formulário criado e pode falhar de propósito */
function mercadoPagoFake() {
  const mp = {
    instancias: [],
    falharNaCriacao: false,
    erroDuranteCriacao: false,
    cardForm(opcoes) {
      if (mp.falharNaCriacao) { mp.falharNaCriacao = false; throw new Error('MP indisponível'); }
      const inst = {
        opcoes, desmontado: 0, montado: 0, enviado: 0, dadosLidos: 0,
        unmount() { inst.desmontado++; },
        mount() { inst.montado++; },
        submit() { inst.enviado++; },
        getCardFormData() { inst.dadosLidos++; return { token: 'tok', paymentMethodId: 'visa', installments: '1', issuerId: '1' }; }
      };
      mp.instancias.push(inst);
      if (mp.erroDuranteCriacao) { mp.erroDuranteCriacao = false; opcoes.callbacks.onFormMounted(new Error('falha ao montar')); }
      return inst;
    },
    vivas() { return mp.instancias.filter((i) => i.desmontado === 0); }
  };
  return mp;
}

const CARRINHO = [{ id: 1, nome: 'Molho', valor: '50', quantidade: 2, img: '' }]; // subtotal 100

function montarCheckout({ respostas = {} } = {}) {
  const elementos = new Map();
  const el = (id) => {
    if (!elementos.has(id)) elementos.set(id, elementoFake(id));
    return elementos.get(id);
  };
  const criados = [];
  const chamadas = [];
  const armazenamento = {
    carrinho: JSON.stringify(CARRINHO),
    csp_admin_user: JSON.stringify({ name: 'Ana', email: 'ana@teste.com', token: 'tk' })
  };
  const ctx = {
    document: {
      getElementById: el,
      // elementos fixos da página (ex.: .btn-texto do botão confirmar); o erro inline começa inexistente
      querySelector: (sel) => (sel === '.erro-inline-pagamento' ? null : el('qs:' + sel)),
      querySelectorAll: () => [],
      createElement: () => { const c = elementoFake('criado'); criados.push(c); return c; },
      addEventListener() {}
    },
    localStorage: { getItem: (k) => armazenamento[k] ?? null, setItem: (k, v) => { armazenamento[k] = String(v); }, removeItem: (k) => { delete armazenamento[k]; } },
    location: { href: '/site/pages/checkout/' },
    fetch(url, opcoes) {
      chamadas.push({ url, opcoes });
      const chave = Object.keys(respostas).find((k) => url.includes(k));
      const dados = chave ? respostas[chave] : {};
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(dados) });
    },
    alert() {}, confirm: () => true,
    console: { log() {}, warn() {}, error() {} },
    estaDisponivel: () => true,
    siteSettings: { pix_discount_percent: '5' },
    API_BASE_URL: 'http://api.teste',
    setTimeout, clearTimeout, setInterval, clearInterval
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(CHECKOUT_JS, ctx);

  const mp = mercadoPagoFake();
  ctx.mp = mp;
  ctx.etapaAtual = 3;
  ctx.freteSelecionado = { tipo: 'entrega', valor: 20 }; // total no cartão: 120
  el('consentLGPD').checked = true;

  return {
    ctx, el, mp, chamadas, criados,
    escolherCartao() { ctx.selecionarPagamento(elementoFake('pagCartao', { 'data-metodo': 'cartao' })); },
    async aplicarCupom(codigo) { el('inputCupom').value = codigo; ctx.aplicarCupom(); await tick(); },
    escolherFrete(preco) { ctx.selecionarFrete(elementoFake('frete', { 'data-price': String(preco), 'data-service': '1', 'data-name': 'PAC' })); },
    aviso() { return { visivel: !el('avisoCartao').hidden, classe: el('avisoCartao').className, texto: el('avisoCartaoTexto').textContent, tentar: !el('btnRecarregarCartao').hidden }; },
    camposVisiveis() { return el('form-checkout').style.display !== 'none'; },
    pedidosCriados() { return chamadas.filter((c) => c.url.endsWith('/api/orders')).length; },
    errosInline() { return criados.filter((c) => c.className === 'erro-inline-pagamento').map((c) => c.textContent); }
  };
}

const cupom = (desconto) => ({ '/api/coupons/validate': { success: true, coupon: { code: 'DEZ', discount_type: 'fixed', discount_value: desconto, discount_calculated: desconto } } });

/* ---------------------------------------------------------------- */

test('cartão: escolher cartão cria um formulário com o total certo e não recria à toa', () => {
  const t = montarCheckout();
  t.escolherCartao();
  assert.equal(t.mp.instancias.length, 1);
  assert.equal(t.mp.instancias[0].opcoes.amount, '120.00');
  t.ctx.prepararFormularioCartao();
  t.escolherCartao();
  assert.equal(t.mp.instancias.length, 1, 'mesmo valor: mantém o formulário e o que o cliente digitou');
  assert.ok(t.mp.instancias.every((i) => i.montado === 0), 'nunca remonta a mesma instância');
});

test('cupom no cartão: cria formulário novo com o valor com desconto e o cupom continua aplicado', async () => {
  const t = montarCheckout({ respostas: cupom(10) });
  t.escolherCartao();
  await t.aplicarCupom('dez');
  assert.equal(t.ctx.cupomAplicado.code, 'DEZ');
  assert.equal(t.el('cupomStatus').className, 'cupom-status success');
  assert.equal(t.mp.instancias.length, 2);
  assert.equal(t.mp.instancias[0].desmontado, 1, 'o formulário antigo é desmontado uma vez');
  assert.equal(t.mp.instancias[1].opcoes.amount, '110.00', 'o novo formulário usa o valor com desconto');
  assert.deepEqual(t.mp.vivas(), [t.mp.instancias[1]]);
  assert.ok(t.mp.instancias.every((i) => i.montado === 0));
  const aviso = t.aviso();
  assert.ok(aviso.visivel && aviso.classe.includes('aviso-cartao--info'));
  assert.equal(aviso.texto, 'O total mudou para R$ 110,00. Digite os dados do cartão novamente.');
  assert.ok(t.camposVisiveis());
});

test('cupom no cartão: se o Mercado Pago falhar, o cupom NÃO é descartado e dá para tentar de novo', async () => {
  const t = montarCheckout({ respostas: cupom(10) });
  t.escolherCartao();
  t.mp.falharNaCriacao = true;
  await t.aplicarCupom('dez');
  assert.equal(t.ctx.cupomAplicado.code, 'DEZ', 'falha no cartão não desfaz o cupom');
  assert.equal(t.el('cupomStatus').className, 'cupom-status success');
  assert.equal(t.ctx.cardForm, null);
  assert.deepEqual(t.mp.vivas(), []);
  assert.deepEqual(t.aviso(), { visivel: true, classe: 'aviso-cartao aviso-cartao--erro', texto: t.ctx.MSG_CARTAO_FALHOU, tentar: true });
  assert.ok(!t.camposVisiveis(), 'campos quebrados ficam escondidos');

  t.ctx.recarregarFormularioCartao();
  assert.equal(t.mp.vivas().length, 1);
  assert.equal(t.mp.vivas()[0].opcoes.amount, '110.00');
  assert.ok(!t.aviso().visivel);
  assert.ok(t.camposVisiveis());
});

test('cartão: erro de montagem avisado pelo Mercado Pago, depois ou durante a criação', () => {
  const t = montarCheckout();
  t.escolherCartao();
  const inst = t.mp.instancias[0];
  inst.opcoes.callbacks.onFormMounted(new Error('falha'));
  assert.equal(t.ctx.cardForm, null);
  assert.equal(inst.desmontado, 1);
  assert.ok(t.aviso().tentar);

  t.mp.erroDuranteCriacao = true;
  t.ctx.recarregarFormularioCartao();
  assert.equal(t.ctx.cardForm, null, 'instância com erro durante a criação não é usada');
  assert.deepEqual(t.mp.vivas(), []);
  assert.equal(t.aviso().texto, t.ctx.MSG_CARTAO_FALHOU);

  t.ctx.recarregarFormularioCartao();
  assert.equal(t.mp.vivas().length, 1);
  assert.ok(!t.aviso().visivel);
});

test('cartão: remover o cupom volta ao valor cheio', async () => {
  const t = montarCheckout({ respostas: cupom(10) });
  t.escolherCartao();
  await t.aplicarCupom('dez');
  t.ctx.removerCupom();
  assert.equal(t.ctx.cupomAplicado, null);
  assert.equal(t.mp.vivas().length, 1);
  assert.equal(t.mp.vivas()[0].opcoes.amount, '120.00');
});

test('cupom que zera o total é recusado (pagamento online precisa de valor) e o cartão não muda', async () => {
  const t = montarCheckout({ respostas: cupom(100) });
  t.ctx.freteSelecionado = { tipo: 'retirada', valor: 0 }; // total 100
  t.escolherCartao();
  await t.aplicarCupom('dez');
  assert.equal(t.ctx.cupomAplicado, null);
  assert.equal(t.el('cupomStatus').className, 'cupom-status error');
  assert.equal(t.el('cupomStatus').textContent, t.ctx.MSG_CUPOM_COBRE_TUDO);
  assert.equal(t.mp.instancias.length, 1);
  assert.equal(t.mp.vivas()[0].opcoes.amount, '100.00');
});

test('total zero depois (cupom 100% + frete que vira grátis): bloqueia o pagamento sem criar pedido', async () => {
  const t = montarCheckout({ respostas: cupom(100) });
  t.escolherCartao();
  await t.aplicarCupom('dez');
  assert.equal(t.ctx.cupomAplicado.code, 'DEZ', 'com frete o total ainda é 20');
  assert.equal(t.mp.vivas()[0].opcoes.amount, '20.00');

  t.escolherFrete(0);
  assert.deepEqual(t.mp.vivas(), []);
  assert.equal(t.ctx.cardForm, null);
  assert.ok(!t.camposVisiveis());
  assert.deepEqual(t.aviso(), { visivel: true, classe: 'aviso-cartao aviso-cartao--erro', texto: t.ctx.MSG_TOTAL_ZERO, tentar: false });

  t.ctx.confirmarPedido();
  assert.equal(t.pedidosCriados(), 0, 'nenhum pedido de R$ 0 é criado');
  assert.ok(t.errosInline().includes(t.ctx.MSG_TOTAL_ZERO));
});

test('confirmar no cartão envia pelo formulário atual; sem formulário, não cria pedido e tenta recarregar', () => {
  const t = montarCheckout();
  t.escolherCartao();
  t.ctx.confirmarPedido();
  assert.equal(t.mp.instancias[0].enviado, 1);

  t.mp.falharNaCriacao = true;
  t.ctx.recarregarFormularioCartao();
  assert.equal(t.ctx.cardForm, null);
  const antes = t.mp.instancias.length;
  t.ctx.confirmarPedido();
  assert.equal(t.pedidosCriados(), 0);
  assert.ok(t.errosInline().some((m) => m.includes('formulário do cartão não está pronto')));
  assert.equal(t.mp.instancias.length, antes + 1, 'tenta criar o formulário de novo');
});

test('formulário antigo nunca envia pagamento', async () => {
  const t = montarCheckout({ respostas: cupom(10) });
  t.escolherCartao();
  await t.aplicarCupom('dez');
  const [antigo, atual] = t.mp.instancias;
  antigo.opcoes.callbacks.onSubmit({ preventDefault() {} });
  assert.equal(antigo.dadosLidos, 0, 'o antigo é ignorado');
  atual.opcoes.callbacks.onSubmit({ preventDefault() {} });
  assert.equal(atual.dadosLidos, 1, 'o atual segue o fluxo normal');
  assert.equal(t.pedidosCriados(), 0, 'sem CPF válido o pedido não é criado (fluxo antigo preservado)');
});

test('mudanças seguidas de frete e cupom deixam só um formulário vivo, com o valor final', async () => {
  const t = montarCheckout({ respostas: cupom(10) });
  t.escolherCartao();
  t.escolherFrete(25);
  t.escolherFrete(30);
  await t.aplicarCupom('dez');
  t.escolherFrete(35);
  const vivas = t.mp.vivas();
  assert.equal(vivas.length, 1);
  assert.equal(vivas[0].opcoes.amount, '125.00');
  assert.ok(t.mp.instancias.filter((i) => i !== vivas[0]).every((i) => i.desmontado === 1));
});

test('cartão escolhido antes do Mercado Pago carregar: avisa e monta quando der', () => {
  const t = montarCheckout();
  t.ctx.mp = null;
  t.escolherCartao();
  assert.deepEqual(t.aviso(), { visivel: true, classe: 'aviso-cartao aviso-cartao--erro', texto: t.ctx.MSG_CARTAO_CARREGANDO, tentar: true });
  t.ctx.mp = t.mp;
  t.ctx.recarregarFormularioCartao();
  assert.equal(t.mp.vivas().length, 1);
  assert.ok(!t.aviso().visivel);
});

test('código: nada remonta a mesma instância e o aviso existe na página', () => {
  assert.ok(!/\.mount\(\)/.test(CHECKOUT_JS), 'mount() na mesma instância apagava os campos');
  assert.ok(!/sincronizarCardFormComTotal|iniciarCardForm/.test(CHECKOUT_JS));
  assert.equal((CHECKOUT_JS.match(/\.unmount\(\)/g) || []).length, 2, 'só descartarFormularioCartao e a limpeza da criação desmontam');
  const html = ler('pages/checkout/index.html');
  assert.ok(html.includes('id="avisoCartao" role="status" aria-live="polite" hidden'));
  assert.ok(html.includes('<button type="button" class="aviso-cartao-acao" id="btnRecarregarCartao" onclick="recarregarFormularioCartao()" hidden>'));
  const css = ler('assets/css/checkout.css');
  for (const c of ['aviso-cartao', 'aviso-cartao--info', 'aviso-cartao--erro', 'aviso-cartao-acao']) {
    assert.ok(new RegExp('\\.' + c + '(?![\\w-])').test(css), '.' + c + ' sem estilo');
  }
});
