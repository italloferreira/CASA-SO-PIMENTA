import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* Verificação do código de retirada no painel admin (pedidos).
   Nenhum teste aqui depende da API ou do banco. */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(SITE_DIR, '..');

const status = await import(pathToFileURL(path.join(SITE_DIR, 'pages/admin/assets/js/pedidos-status.js')).href);
const servidor = await import(pathToFileURL(path.join(ROOT_DIR, 'server/src/config/orderStatusMachine.js')).href);

const pedido = (extra) => ({ id: 7, delivery_type: 'pickup', status: 'preparing', ...extra });
const opcoes = (html) => [...html.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);

/* ---------------------------------------------------------------- regras de status */

test('retirada: fluxos do painel são idênticos aos do servidor', () => {
  assert.deepEqual(status.PICKUP_FLOW, servidor.PICKUP_FLOW);
  assert.deepEqual(status.DELIVERY_FLOW, servidor.DELIVERY_FLOW);
});

test('retirada: o seletor só oferece trocas que o servidor aceita, e nunca "Retirado"', () => {
  for (const tipo of ['pickup', 'delivery', 'negotiate']) {
    const fluxo = tipo === 'pickup' ? servidor.PICKUP_FLOW : servidor.DELIVERY_FLOW;
    for (const atual of Object.keys(fluxo)) {
      const proximos = status.proximosStatus({ delivery_type: tipo, status: atual });
      assert.ok(!proximos.includes('withdrawn'), tipo + '/' + atual + ' não pode oferecer "Retirado"');
      for (const s of proximos) {
        assert.ok(servidor.canTransition(atual, s, tipo), tipo + ': ' + atual + ' -> ' + s + ' seria recusado pelo servidor');
      }
    }
  }
  assert.deepEqual(status.proximosStatus(pedido({ status: 'preparing' })), ['ready_for_pickup', 'cancelled']);
  assert.deepEqual(status.proximosStatus(pedido({ status: 'ready_for_pickup' })), ['cancelled']);
  assert.deepEqual(status.proximosStatus({ delivery_type: 'delivery', status: 'shipped' }), ['delivered', 'cancelled']);
  assert.deepEqual(status.proximosStatus({ delivery_type: 'negotiate', status: 'confirmed' }), ['shipped', 'cancelled']);
});

test('retirada: status finais e status desconhecidos viram selo', () => {
  for (const s of ['withdrawn', 'cancelled']) assert.ok(status.statusFinal(pedido({ status: s })));
  assert.ok(status.statusFinal({ delivery_type: 'delivery', status: 'delivered' }));
  assert.ok(status.statusFinal({ delivery_type: 'delivery', status: 'preparing' }), 'status fora do fluxo: servidor não aceita troca');
  assert.ok(!status.statusFinal(pedido({ status: 'ready_for_pickup' })));
});

test('retirada: campo do código só para retirada em "pronto para retirada"', () => {
  assert.ok(status.precisaCodigo(pedido({ status: 'ready_for_pickup' })));
  assert.ok(!status.precisaCodigo(pedido({ status: 'preparing' })));
  assert.ok(!status.precisaCodigo(pedido({ status: 'withdrawn' })));
  assert.ok(!status.precisaCodigo({ delivery_type: 'delivery', status: 'ready_for_pickup' }));
});

test('retirada: código aceita só números, no máximo 6', () => {
  assert.equal(status.limparCodigo('48a2-91 3x9'), '482913');
  assert.equal(status.limparCodigo(''), '');
  assert.equal(status.limparCodigo(null), '');
  assert.equal(status.limparCodigo(123), '123');
});

test('retirada: mensagem de código errado diz o que fazer; outras mensagens do servidor passam direto', () => {
  assert.match(status.mensagemErroRetirada(new Error('Código de retirada inválido.')), /Confira com o cliente/);
  const limite = 'Muitas tentativas de confirmação de retirada. Aguarde 5 minutos.';
  assert.equal(status.mensagemErroRetirada(new Error(limite)), limite);
  assert.ok(status.mensagemErroRetirada(null).length > 0);
});

/* ---------------------------------------------------------------- HTML da célula */

test('retirada: célula de pedido em preparo tem seletor e ainda não tem campo', () => {
  const html = status.htmlCelulaStatus(pedido({ status: 'preparing' }));
  assert.deepEqual(opcoes(html), ['preparing', 'ready_for_pickup', 'cancelled']);
  assert.match(html, /<option value="preparing" selected>/);
  assert.ok(html.includes('order-status-select'));
  assert.ok(!html.includes('retirada-form'));
});

test('retirada: enquanto salva, seletor travado, "Salvando…" e nada de campo', () => {
  const html = status.htmlCelulaStatus(pedido({ status: 'preparing' }), { salvando: true, statusPendente: 'ready_for_pickup' });
  assert.match(html, /<select[^>]* disabled>/);
  assert.match(html, /<option value="ready_for_pickup" selected>/);
  assert.ok(html.includes('Salvando…'));
  assert.ok(!html.includes('retirada-form'), 'o campo só pode aparecer depois da resposta do servidor');
});

test('retirada: pronto para retirada mostra o campo ligado ao pedido, sem revelar o código', () => {
  const html = status.htmlCelulaStatus(pedido({ status: 'ready_for_pickup', pickup_code: '777777' }));
  assert.deepEqual(opcoes(html), ['ready_for_pickup', 'cancelled']);
  assert.ok(html.includes('<form class="retirada-form" data-order-id="7"'));
  assert.ok(html.includes('id="retiradaCodigo-7"'));
  assert.ok(html.includes('<label class="retirada-label" for="retiradaCodigo-7">'), 'label ligado ao input');
  assert.ok(/inputmode="numeric"/.test(html) && /maxlength="6"/.test(html));
  assert.match(html, /<button type="submit" class="btn retirada-btn" disabled>Confirmar<\/button>/, 'botão travado sem os 6 dígitos');
  assert.ok(!html.includes('777777'), 'o código do cliente nunca aparece na tela do admin');
});

test('retirada: com 6 dígitos o botão libera; verificando trava tudo', () => {
  const pronto = status.htmlCaixaCodigo(pedido({ status: 'ready_for_pickup' }), { codigo: '482913' });
  assert.match(pronto, /<button type="submit" class="btn retirada-btn">Confirmar<\/button>/);
  assert.ok(pronto.includes('value="482913"'));
  const verificando = status.htmlCaixaCodigo(pedido({ status: 'ready_for_pickup' }), { codigo: '482913', verificando: true });
  assert.match(verificando, /<button type="submit" class="btn retirada-btn" disabled>Verificando…<\/button>/);
  assert.match(verificando, /<input[^>]* disabled/);
});

test('retirada: erro aparece no campo, escapado', () => {
  const html = status.htmlCaixaCodigo(pedido({ status: 'ready_for_pickup' }), { codigo: '111111', erro: '<b>inválido</b>' });
  assert.ok(html.includes('retirada-input is-erro'));
  assert.ok(html.includes('aria-invalid="true"'));
  assert.ok(html.includes('retirada-dica is-erro'));
  assert.ok(html.includes('&lt;b&gt;inválido&lt;/b&gt;'));
  assert.ok(!html.includes('<b>'));
});

test('retirada: pedido retirado vira selo com o horário, sem seletor nem campo', () => {
  const html = status.htmlCelulaStatus(pedido({ status: 'withdrawn', withdrawn_at: '2026-11-21T16:05:00' }));
  assert.ok(html.includes('<span class="badge badge-success">Retirado</span>'));
  assert.match(html, /Código validado · 21\/11, 16:05/);
  assert.ok(!html.includes('<select'));
  assert.ok(!html.includes('retirada-form'));
});

test('retirada: versão do drawer tem título, horário de geração e dica completa', () => {
  const html = status.htmlCaixaCodigo(pedido({ status: 'ready_for_pickup', pickup_code_generated_at: '2026-11-21T15:40:00' }), {}, 'drawer');
  assert.ok(html.includes('retirada-form--drawer'));
  assert.ok(html.includes('id="retiradaCodigoDrawer-7"'));
  assert.ok(html.includes('Confirmar retirada'));
  assert.match(html, /Código gerado em 21\/11, 15:40/);
  assert.ok(html.includes('Meus pedidos'));
});

test('retirada: animação de entrada só quando o campo acabou de aparecer', () => {
  const o = pedido({ status: 'ready_for_pickup' });
  assert.ok(status.htmlCaixaCodigo(o, { recemAberto: true }).includes('retirada-form--nova'));
  assert.ok(!status.htmlCaixaCodigo(o, {}).includes('retirada-form--nova'));
});

/* ---------------------------------------------------------------- CSS e página */

const ler =(rel) => readFileSync(path.join(SITE_DIR, rel), 'utf-8');

test('retirada: página de pedidos carrega pedidos.css depois dos estilos base', () => {
  const html = ler('pages/admin/pedidos/index.html');
  const base = html.indexOf('/site/pages/admin/assets/css/forms.css');
  const tabela = html.indexOf('/site/pages/admin/assets/css/table.css');
  const novo = html.indexOf('/site/pages/admin/assets/css/pedidos.css');
  assert.ok(novo > -1, 'pedidos.css deve estar linkado');
  assert.ok(novo > base && novo > tabela, 'pedidos.css precisa vir depois de table.css e forms.css para sobrescrever');
});

test('retirada: toda classe gerada pelo HTML do campo tem estilo em pedidos.css', () => {
  const css = ler('pages/admin/assets/css/pedidos.css');
  const o = { id: 7, delivery_type: 'pickup', status: 'ready_for_pickup', pickup_code_generated_at: '2026-11-21T15:40:00' };
  const html = status.htmlCelulaStatus(o, { erro: 'x', recemAberto: true }) +
    status.htmlCaixaCodigo(o, {}, 'drawer') +
    status.htmlCelulaStatus({ ...o, status: 'withdrawn' }) +
    status.htmlCelulaStatus({ ...o, status: 'preparing' }, { salvando: true });
  const classes = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
  const globais = new Set(['form-input', 'order-status-select', 'btn', 'badge', 'badge-success']);
  for (const c of classes) {
    if (globais.has(c)) continue;
    assert.ok(new RegExp('\\.' + c + '(?![\\w-])').test(css), 'classe .' + c + ' sem estilo em pedidos.css');
  }
});

test('retirada: pedidos.css só usa variáveis que existem', () => {
  const css = ler('pages/admin/assets/css/pedidos.css');
  const vars = ler('assets/css/variaveis.css') + css;
  for (const [, nome] of css.matchAll(/var\((--[\w-]+)\)/g)) {
    assert.ok(new RegExp(nome + '\\s*:').test(vars), 'variável ' + nome + ' não definida');
  }
});

/* ---------------------------------------------------------------- painel real (pedidos.js) com DOM falso e API controlada */

const tick = () => new Promise((r) => setImmediate(r));

function classes(iniciais = []) {
  const s = new Set(iniciais);
  return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c) };
}

/* roda o pedidos.js de verdade: os imports viram globais injetados no contexto */
function montarPainel() {
  const pagina = ler('pages/admin/pedidos/index.html');
  const idsEstaticos = new Set([...pagina.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const estado = { geracao: 0, focado: null };
  const estaticos = new Map();
  const dinamicos = new Map();

  function criarElemento(id) {
    let html = '';
    return {
      id, textContent: '', value: '', style: {}, disabled: false, classList: classes(), handlers: {},
      get innerHTML() { return html; },
      set innerHTML(v) { html = v; estado.geracao++; },
      addEventListener(tipo, fn) { (this.handlers[tipo] ||= []).push(fn); },
      focus() { estado.focado = id; }
    };
  }

  /* valor inicial de um select (opção selected) ou input (atributo value) gerado por innerHTML */
  function valorInicial(html, id) {
    const sel = new RegExp('<select[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)</select>').exec(html);
    if (sel) {
      const m = /<option value="([^"]*)" selected>/.exec(sel[1]);
      return m ? m[1] : '';
    }
    const inp = new RegExp('<input[^>]*id="' + id + '"[^>]*>').exec(html);
    if (inp) {
      const m = /\svalue="([^"]*)"/.exec(inp[0]);
      return m ? m[1] : '';
    }
    return '';
  }

  /* elementos criados por innerHTML só existem enquanto o HTML atual os contém; cada redesenho cria novos */
  function getElementById(id) {
    if (idsEstaticos.has(id)) {
      if (!estaticos.has(id)) estaticos.set(id, criarElemento(id));
      return estaticos.get(id);
    }
    const dono = [...estaticos.values()].find((el) => el.innerHTML.includes('id="' + id + '"'));
    if (!dono) return null;
    const chave = id + '@' + estado.geracao;
    if (!dinamicos.has(chave)) {
      const novo = criarElemento(id);
      novo.value = valorInicial(dono.innerHTML, id);
      dinamicos.set(chave, novo);
    }
    return dinamicos.get(chave);
  }

  let aoCarregar = null;
  const chamadas = [];
  const toasts = [];
  const ctx = {
    document: {
      getElementById,
      addEventListener(tipo, fn) { if (tipo === 'DOMContentLoaded') aoCarregar = fn; }
    },
    protectRoute() {},
    showToast(msg, tipo) { toasts.push({ msg, tipo: tipo || 'success' }); },
    apiRequest(method, caminho, body) {
      /* o corpo nasce dentro do vm (outro protótipo de Object): copia para comparar com deepEqual */
      const copia = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
      return new Promise((resolve, reject) => chamadas.push({ method, caminho, body: copia, resolve, reject }));
    },
    API_BASE: '',
    console,
    setTimeout,
    clearTimeout,
    ...status
  };
  ctx.window = ctx;

  const codigo = ler('pages/admin/assets/js/pedidos.js').replace(/^import[\s\S]*?from\s+'[^']+';[ \t]*$/gm, '');
  assert.ok(!/^import\b/m.test(codigo), 'todos os imports devem ter sido trocados por globais');
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx);
  aoCarregar();

  return {
    ctx, chamadas, toasts, estado,
    el: getElementById,
    tabela: () => getElementById('tableContainer').innerHTML,
    drawer: () => getElementById('orderDetailBody').innerHTML,
    linha(id) {
      const l = getElementById('tableContainer').innerHTML.split('<tr').find((x) => x.includes('<strong>#' + id + '</strong>'));
      assert.ok(l, 'linha do pedido #' + id + ' não encontrada');
      return l;
    },
    pendente(caminho) {
      const c = chamadas.find((x) => !x.feita && x.caminho === caminho);
      assert.ok(c, 'nenhuma chamada pendente para ' + caminho + ' (feitas: ' + chamadas.map((x) => x.method + ' ' + x.caminho).join(', ') + ')');
      c.feita = true;
      return c;
    },
    disparar(raiz, tipo, evento) {
      for (const fn of getElementById(raiz).handlers[tipo] || []) fn(evento);
    },
    clicar(id) {
      const el = getElementById(id);
      assert.ok(el, '#' + id + ' não está na tela');
      const fns = el.handlers.click || [];
      assert.ok(fns.length, '#' + id + ' sem handler de clique');
      fns[fns.length - 1]();
    }
  };
}

const PEDIDOS = () => [
  { id: 1043, customer_name: 'Ana Souza', customer_email: 'ana@exemplo.com', customer_phone: '31999990000', total: '89.90', created_at: '2026-11-22T10:00:00Z', delivery_type: 'pickup', status: 'preparing', items: [] },
  { id: 1042, customer_name: 'João Lima', customer_email: 'joao@exemplo.com', customer_phone: '', total: '154.30', created_at: '2026-11-22T09:00:00Z', delivery_type: 'delivery', status: 'shipped', tracking_code: 'AA123456789BR', items: [] },
  { id: 1041, customer_name: 'Carla Mendes', customer_email: 'carla@exemplo.com', customer_phone: '', total: '47.00', created_at: '2026-11-21T10:00:00Z', delivery_type: 'pickup', status: 'ready_for_pickup', pickup_code: '777777', pickup_code_generated_at: '2026-11-21T15:40:00', items: [] },
  { id: 1040, customer_name: 'Pedro Alves', customer_email: 'pedro@exemplo.com', customer_phone: '', total: '212.50', created_at: '2026-11-21T09:00:00Z', delivery_type: 'pickup', status: 'withdrawn', withdrawn_at: '2026-11-21T16:05:00', items: [] }
];

async function painelCarregado() {
  const p = montarPainel();
  p.pendente('/api/orders').resolve(PEDIDOS());
  await tick();
  return p;
}

const selectFake = (orderId, valor) => ({ target: { classList: classes(['form-input', 'order-status-select']), dataset: { orderId: String(orderId) }, value: valor } });
const submitFake = (orderId) => ({ prevented: false, preventDefault() { this.prevented = true; }, target: { classList: classes(['retirada-form']), dataset: { orderId: String(orderId) } } });

function inputFake(orderId, valor, comErro = false) {
  const btn = { disabled: true };
  const dica = { classList: classes(comErro ? ['retirada-dica', 'is-erro'] : ['retirada-dica']), textContent: comErro ? 'erro' : 'padrão', dataset: { dica: 'padrão' } };
  const form = { querySelector: (sel) => (sel === '.retirada-btn' ? btn : sel === '.retirada-dica' ? dica : null) };
  const attrs = new Set(comErro ? ['aria-invalid'] : []);
  const input = { classList: classes(comErro ? ['retirada-input', 'is-erro'] : ['retirada-input']), dataset: { orderId: String(orderId) }, value: valor, closest: () => form, removeAttribute: (a) => attrs.delete(a) };
  return { evento: { target: input }, input, btn, dica, attrs };
}

test('painel: lista mostra só trocas permitidas, campo no pedido pronto e selo no retirado', async () => {
  const p = await painelCarregado();
  assert.deepEqual(opcoes(p.linha(1043)), ['preparing', 'ready_for_pickup', 'cancelled']);
  assert.deepEqual(opcoes(p.linha(1042)), ['shipped', 'delivered', 'cancelled']);
  assert.ok(p.linha(1043).includes('<small class="pedido-tipo">Retirada</small>'));
  assert.ok(p.linha(1042).includes('<small class="pedido-tipo">Entrega</small>'));
  assert.ok(!p.linha(1043).includes('retirada-form'));
  assert.ok(!p.linha(1042).includes('retirada-form'));

  const pronto = p.linha(1041);
  assert.ok(pronto.startsWith(' class="linha-aguardando">'), 'linha do pedido pronto fica destacada');
  assert.ok(pronto.includes('<td data-label="Status" class="celula-status">'));
  assert.ok(pronto.includes('id="retiradaCodigo-1041"'));
  assert.ok(!p.tabela().includes('777777'), 'o código do cliente não pode aparecer na tabela');

  const retirado = p.linha(1040);
  assert.ok(retirado.includes('<span class="badge badge-success">Retirado</span>'));
  assert.ok(!retirado.includes('<select'));
});

test('painel: o campo só aparece depois que o servidor aceita "pronto para retirada"', async () => {
  const p = await painelCarregado();
  p.disparar('tableContainer', 'change', selectFake(1043, 'ready_for_pickup'));

  const patch = p.pendente('/api/orders/1043/status');
  assert.equal(patch.method, 'PATCH');
  assert.deepEqual(patch.body, { status: 'ready_for_pickup' });
  assert.ok(p.linha(1043).includes('Salvando…'));
  assert.match(p.linha(1043), /<select[^>]* disabled>/);
  assert.ok(!p.linha(1043).includes('retirada-form'), 'antes da resposta do servidor o campo não pode existir');

  patch.resolve({ message: 'Pedido marcado como pronto para retirada.', pickup_code: '123456' });
  await tick();
  const linha = p.linha(1043);
  assert.ok(linha.includes('retirada-form retirada-form--nova'), 'campo aparece com animação de entrada');
  assert.ok(linha.startsWith(' class="linha-aguardando">'));
  assert.deepEqual(opcoes(linha), ['ready_for_pickup', 'cancelled']);
  assert.ok(!p.tabela().includes('123456'), 'o código devolvido pelo servidor não pode ir para a tela');
  assert.deepEqual(p.toasts.at(-1), { msg: 'Status do pedido #1043 atualizado para Pronto para retirada!', tipo: 'success' });
});

test('painel: se o servidor recusa a troca, o seletor volta e o campo não aparece', async () => {
  const p = await painelCarregado();
  p.disparar('tableContainer', 'change', selectFake(1043, 'ready_for_pickup'));
  p.pendente('/api/orders/1043/status').reject(new Error('Transição não permitida.'));
  await tick();
  const linha = p.linha(1043);
  assert.ok(!linha.includes('retirada-form'));
  assert.ok(!linha.includes('Salvando…'));
  assert.match(linha, /<option value="preparing" selected>/);
  assert.deepEqual(p.toasts.at(-1), { msg: 'Transição não permitida.', tipo: 'error' });
});

test('painel: código errado mostra o erro, digitar limpa o erro, código certo marca como retirado', async () => {
  const p = await painelCarregado();

  const digitado = inputFake(1041, '48a2-913');
  p.disparar('tableContainer', 'input', digitado.evento);
  assert.equal(digitado.input.value, '482913', 'só números');
  assert.equal(digitado.btn.disabled, false, 'botão libera com 6 dígitos');

  const envio = submitFake(1041);
  p.disparar('tableContainer', 'submit', envio);
  assert.ok(envio.prevented, 'o formulário não pode recarregar a página');
  const errado = p.pendente('/api/orders/1041/confirm-pickup');
  assert.equal(errado.method, 'POST');
  assert.deepEqual(errado.body, { pickup_code: '482913' });
  assert.ok(p.linha(1041).includes('Verificando…'));

  errado.reject(new Error('Código de retirada inválido.'));
  await tick();
  assert.ok(p.linha(1041).includes('retirada-dica is-erro'));
  assert.ok(p.linha(1041).includes('Código inválido. Confira com o cliente e tente de novo.'));
  assert.ok(p.linha(1041).includes('value="482913"'), 'o código digitado continua no campo para correção');
  assert.equal(p.estado.focado, 'retiradaCodigo-1041', 'foco volta para o campo');
  assert.ok(p.linha(1041).includes('id="retiradaCodigo-1041"'), 'status não mudou');

  const corrigido = inputFake(1041, '48291', true);
  p.disparar('tableContainer', 'input', corrigido.evento);
  assert.ok(!corrigido.dica.classList.contains('is-erro'));
  assert.equal(corrigido.dica.textContent, 'padrão');
  assert.ok(!corrigido.input.classList.contains('is-erro'));
  assert.ok(!corrigido.attrs.has('aria-invalid'));
  assert.equal(corrigido.btn.disabled, true, '5 dígitos: botão travado');

  p.disparar('tableContainer', 'input', inputFake(1041, '777777').evento);
  p.disparar('tableContainer', 'submit', submitFake(1041));
  p.pendente('/api/orders/1041/confirm-pickup').resolve({ message: 'Retirada confirmada com sucesso.' });
  await tick();
  const linha = p.linha(1041);
  assert.ok(linha.includes('<span class="badge badge-success">Retirado</span>'));
  assert.ok(linha.includes('Código validado'));
  assert.ok(!linha.includes('retirada-form'));
  assert.ok(!linha.includes('<select'));
  assert.ok(!linha.startsWith(' class="linha-aguardando">'));
  assert.deepEqual(p.toasts.at(-1), { msg: 'Retirada do pedido #1041 confirmada!', tipo: 'success' });
});

test('painel: código incompleto não chama o servidor', async () => {
  const p = await painelCarregado();
  p.disparar('tableContainer', 'input', inputFake(1041, '123').evento);
  p.disparar('tableContainer', 'submit', submitFake(1041));
  assert.equal(p.chamadas.filter((c) => c.caminho.includes('confirm-pickup')).length, 0);
});

test('painel: limite de tentativas do servidor aparece no campo', async () => {
  const p = await painelCarregado();
  p.disparar('tableContainer', 'input', inputFake(1041, '111111').evento);
  p.disparar('tableContainer', 'submit', submitFake(1041));
  p.pendente('/api/orders/1041/confirm-pickup').reject(new Error('Muitas tentativas de confirmação de retirada. Aguarde 5 minutos.'));
  await tick();
  assert.ok(p.linha(1041).includes('Muitas tentativas de confirmação de retirada. Aguarde 5 minutos.'));
});

test('painel: drawer do pedido pronto tem o campo grande e confirma pelo drawer', async () => {
  const p = await painelCarregado();
  p.ctx.openDetail(1041);
  const html = p.drawer();
  assert.ok(html.includes('retirada-form retirada-form--drawer'));
  assert.ok(html.includes('id="retiradaCodigoDrawer-1041"'));
  assert.match(html, /Código gerado em 21\/11, 15:40/);
  assert.ok(!html.includes('777777'));
  assert.deepEqual(opcoes(html), ['ready_for_pickup', 'cancelled']);

  p.clicar('detailStatusBtn');
  assert.equal(p.chamadas.filter((c) => c.caminho.includes('/status')).length, 0, 'Salvar sem trocar o status não chama o servidor');
  assert.equal(p.toasts.at(-1).tipo, 'warning');

  p.disparar('orderDetailBody', 'input', inputFake(1041, '777777').evento);
  p.disparar('orderDetailBody', 'submit', submitFake(1041));
  p.pendente('/api/orders/1041/confirm-pickup').resolve({});
  await tick();
  assert.ok(p.drawer().includes('<span class="badge badge-success">Retirado</span>'));
  assert.ok(!p.drawer().includes('retirada-form'));
  assert.ok(!p.drawer().includes('detailStatusBtn'), 'pedido finalizado não tem botão Salvar');
  assert.ok(p.linha(1041).includes('<span class="badge badge-success">Retirado</span>'), 'tabela também atualiza');
});

test('painel: drawer de entrega continua salvando o rastreio ao marcar como entregue', async () => {
  const p = await painelCarregado();
  p.ctx.openDetail(1042);
  assert.ok(p.drawer().includes('id="detailTrackingCode"'));
  assert.ok(!p.drawer().includes('retirada-form'));
  p.el('detailStatusSelect').value = 'delivered';
  p.el('detailTrackingCode').value = ' BR999 ';
  p.el('detailTrackingUrl').value = '';
  p.clicar('detailStatusBtn');
  const patch = p.pendente('/api/orders/1042/status');
  assert.deepEqual(patch.body, { status: 'delivered', tracking_code: 'BR999', tracking_url: null });
  assert.ok(p.drawer().includes('Salvando…'));
  patch.resolve({ message: 'Status do pedido atualizado.', tracking_code: 'BR999' });
  await tick();
  assert.ok(p.drawer().includes('<strong>Código de rastreamento:</strong> BR999'));
  assert.ok(p.linha(1042).includes('<span class="badge badge-success">Entregue</span>'));
});

test('painel: filtro de status e busca continuam funcionando', async () => {
  const p = await painelCarregado();
  p.el('filterStatus').value = 'ready_for_pickup';
  p.el('filterStatus').handlers.change[0]();
  assert.ok(p.tabela().includes('<strong>#1041</strong>'));
  assert.ok(!p.tabela().includes('<strong>#1043</strong>'));
  p.el('filterStatus').value = '';
  p.el('searchInput').value = 'ana';
  p.el('filterStatus').handlers.change[0]();
  assert.ok(p.tabela().includes('<strong>#1043</strong>'));
  assert.ok(!p.tabela().includes('<strong>#1041</strong>'));
});
