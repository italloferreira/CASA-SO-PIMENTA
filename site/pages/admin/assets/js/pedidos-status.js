/* pedidos-status.js — regras de status dos pedidos e HTML da verificação do código de retirada.
   Sem acesso ao DOM: tudo aqui recebe dados e devolve valores/strings, para poder ser testado no Node. */

export const STATUS_LABELS = {
  pending: 'Pendente', confirmed: 'Confirmado', preparing: 'Preparando',
  shipped: 'Enviado', ready_for_pickup: 'Pronto para retirada',
  delivered: 'Entregue', withdrawn: 'Retirado', cancelled: 'Cancelado'
};

export const BADGE_CLASS = {
  pending: 'badge-warning', confirmed: 'badge-info', preparing: 'badge-info',
  shipped: 'badge-info', ready_for_pickup: 'badge-info',
  delivered: 'badge-success', withdrawn: 'badge-success', cancelled: 'badge-danger'
};

export const TIPO_LABELS = { pickup: 'Retirada', delivery: 'Entrega', negotiate: 'A combinar' };

/* Cópia de server/src/config/orderStatusMachine.js — o teste verify-retirada-admin garante que continuam iguais */
export const DELIVERY_FLOW = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: []
};

export const PICKUP_FLOW = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['withdrawn', 'cancelled'],
  withdrawn: [],
  cancelled: []
};

export const DICA_CODIGO = 'Peça ao cliente o código de 6 dígitos enviado por e-mail.';
export const DICA_CODIGO_DRAWER = 'Peça ao cliente o código que ele recebeu por e-mail. O código também aparece em Meus pedidos, no site.';

const MSG_CODIGO_INVALIDO_SERVIDOR = 'Código de retirada inválido.';
const MSG_CODIGO_INVALIDO = 'Código inválido. Confira com o cliente e tente de novo.';

const ICONE_CHAVE = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"></circle><path d="M10.7 12.3 21 2"></path><path d="m16 7 3 3"></path><path d="m19 4 2 2"></path></svg>';

export function escapeHtml(str) {
  if (str === null || str === undefined || str === '') return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function rotuloStatus(status) {
  return STATUS_LABELS[status] || status;
}

/* mesmo critério do servidor (canTransition): só 'pickup' usa o fluxo de retirada; 'negotiate' segue o de entrega */
function fluxoDo(order) {
  return order.delivery_type === 'pickup' ? PICKUP_FLOW : DELIVERY_FLOW;
}

/* Trocas que o seletor pode oferecer. "Retirado" fica de fora: só acontece validando o código. */
export function proximosStatus(order) {
  var permitidos = fluxoDo(order)[order.status] || [];
  return permitidos.filter(function (s) { return s !== 'withdrawn'; });
}

/* sem nenhuma troca possível pelo seletor: a célula mostra um selo no lugar do seletor */
export function statusFinal(order) {
  return proximosStatus(order).length === 0;
}

/* o campo do código só existe quando o servidor já aceitou "pronto para retirada" */
export function precisaCodigo(order) {
  return order.delivery_type === 'pickup' && order.status === 'ready_for_pickup';
}

export function limparCodigo(valor) {
  return String(valor === null || valor === undefined ? '' : valor).replace(/\D/g, '').slice(0, 6);
}

/* troca a mensagem crua do servidor para código errado por uma que diz o que fazer */
export function mensagemErroRetirada(err) {
  var msg = err && err.message ? err.message : '';
  if (msg === MSG_CODIGO_INVALIDO_SERVIDOR) return MSG_CODIGO_INVALIDO;
  return msg || 'Não foi possível confirmar a retirada. Tente de novo.';
}

export function formatarDataHora(valor) {
  if (!valor) return '';
  var d = new Date(valor);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ', ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/* select com o status atual + as trocas permitidas.
   ui: { salvando, verificando, statusPendente }; opcoes: { id, classe } */
export function htmlSeletorStatus(order, ui, opcoes) {
  ui = ui || {};
  opcoes = opcoes || {};
  var id = escapeHtml(order.id);
  var selecionado = ui.statusPendente || order.status;
  var lista = [order.status].concat(proximosStatus(order));
  return '<select class="form-input' + (opcoes.classe ? ' ' + opcoes.classe : '') + '"' +
      (opcoes.id ? ' id="' + escapeHtml(opcoes.id) + '"' : '') +
      ' data-order-id="' + id + '" aria-label="Status do pedido #' + id + '"' +
      (ui.salvando || ui.verificando ? ' disabled' : '') + '>' +
    lista.map(function (s) {
      return '<option value="' + escapeHtml(s) + '"' + (s === selecionado ? ' selected' : '') + '>' + escapeHtml(rotuloStatus(s)) + '</option>';
    }).join('') +
  '</select>';
}

export function htmlSeloFinal(order) {
  var classe = BADGE_CLASS[order.status] || 'badge-neutral';
  var detalhe = '';
  if (order.status === 'withdrawn') {
    var quando = formatarDataHora(order.withdrawn_at);
    detalhe = 'Código validado' + (quando ? ' · ' + quando : '');
  }
  return '<div class="status-final">' +
    '<span class="badge ' + classe + '">' + escapeHtml(rotuloStatus(order.status)) + '</span>' +
    (detalhe ? '<small class="status-final-detalhe">' + escapeHtml(detalhe) + '</small>' : '') +
  '</div>';
}

/* formulário do código. variante: 'linha' (tabela) ou 'drawer' (detalhes do pedido).
   ui: { codigo, erro, verificando, salvando, recemAberto }. Nunca usa order.pickup_code. */
export function htmlCaixaCodigo(order, ui, variante) {
  ui = ui || {};
  var drawer = variante === 'drawer';
  var id = escapeHtml(order.id);
  var inputId = (drawer ? 'retiradaCodigoDrawer-' : 'retiradaCodigo-') + id;
  var dicaId = inputId + '-dica';
  var codigo = limparCodigo(ui.codigo);
  var erro = ui.erro || '';
  var verificando = !!ui.verificando;
  var botaoBloqueado = verificando || !!ui.salvando || codigo.length !== 6;
  var dicaPadrao = drawer ? DICA_CODIGO_DRAWER : DICA_CODIGO;

  var cabecalho;
  if (drawer) {
    var gerado = formatarDataHora(order.pickup_code_generated_at);
    cabecalho =
      '<div class="retirada-topo">' +
        '<span class="retirada-titulo">' + ICONE_CHAVE + 'Confirmar retirada</span>' +
        (gerado ? '<span class="retirada-gerado">Código gerado em ' + escapeHtml(gerado) + '</span>' : '') +
      '</div>' +
      '<label class="retirada-label retirada-label--drawer" for="' + inputId + '">Código de retirada (6 dígitos)</label>';
  } else {
    cabecalho = '<label class="retirada-label" for="' + inputId + '">' + ICONE_CHAVE + 'Código de retirada</label>';
  }

  return '<form class="retirada-form' + (drawer ? ' retirada-form--drawer' : '') + (ui.recemAberto ? ' retirada-form--nova' : '') + '"' +
      ' data-order-id="' + id + '" novalidate>' +
    cabecalho +
    '<div class="retirada-linha">' +
      '<input class="retirada-input' + (erro ? ' is-erro' : '') + '" id="' + inputId + '" data-order-id="' + id + '"' +
        ' type="text" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="000000"' +
        ' value="' + codigo + '"' +
        (verificando ? ' disabled' : '') +
        (erro ? ' aria-invalid="true"' : '') +
        ' aria-describedby="' + dicaId + '">' +
      '<button type="submit" class="btn retirada-btn"' + (botaoBloqueado ? ' disabled' : '') + '>' +
        (verificando ? 'Verificando…' : (drawer ? 'Confirmar retirada' : 'Confirmar')) +
      '</button>' +
    '</div>' +
    '<p class="retirada-dica' + (erro ? ' is-erro' : '') + '" id="' + dicaId + '" data-dica="' + escapeHtml(dicaPadrao) + '" aria-live="polite">' +
      escapeHtml(erro || dicaPadrao) +
    '</p>' +
  '</form>';
}

/* conteúdo da célula "Status" da tabela */
export function htmlCelulaStatus(order, ui) {
  ui = ui || {};
  var html = '<div class="status-celula">';
  if (statusFinal(order)) {
    html += htmlSeloFinal(order);
  } else {
    html += '<div class="status-linha">' +
      htmlSeletorStatus(order, ui, { classe: 'order-status-select' }) +
      (ui.salvando ? '<span class="status-salvando">Salvando…</span>' : '') +
    '</div>';
  }
  if (precisaCodigo(order)) html += htmlCaixaCodigo(order, ui, 'linha');
  return html + '</div>';
}
