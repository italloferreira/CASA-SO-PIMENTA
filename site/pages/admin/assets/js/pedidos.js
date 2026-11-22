import { protectRoute, showToast } from './admin-auth.js';
import { API_BASE, apiRequest } from '../../../../assets/js/api.js';
import {
  TIPO_LABELS, escapeHtml, rotuloStatus, statusFinal, precisaCodigo, limparCodigo, mensagemErroRetirada,
  htmlCelulaStatus, htmlSeletorStatus, htmlSeloFinal, htmlCaixaCodigo
} from './pedidos-status.js';

protectRoute();

let allOrders = [];
let currentPage = 1;
const PER_PAGE = 10;

/* estado de tela por pedido (não vem do servidor):
   { salvando, statusPendente, verificando, codigo, erro, recemAberto } */
var uiPedidos = {};
/* pedido aberto no drawer (null = fechado) */
var drawerOrderId = null;

function estadoUi(id) {
  if (!uiPedidos[id]) uiPedidos[id] = {};
  return uiPedidos[id];
}

function acharPedido(id) {
  return allOrders.find(function (o) { return o.id === id; });
}

/* --- Load --- */
async function loadOrders() {
  var container = document.getElementById('tableContainer');
  container.innerHTML = '<div class="skeleton skeleton-table"></div>';
  try {
    allOrders = await apiRequest('GET', '/api/orders');
    renderOrders();
  } catch (e) {
    container.innerHTML = '<div class="error-banner">Erro ao carregar pedidos.</div>';
  }
}

/* --- Render --- */
function renderOrders() {
  var container = document.getElementById('tableContainer');
  var search = (document.getElementById('searchInput').value || '').toLowerCase().trim();
  var dateStart = document.getElementById('filterDateStart').value;
  var dateEnd = document.getElementById('filterDateEnd').value;
  var statusFilter = document.getElementById('filterStatus').value;

  var filtered = allOrders.filter(function (o) {
    if (search && !String(o.id).includes(search) && (!o.customer_name || !o.customer_name.toLowerCase().includes(search))) return false;
    if (dateStart && new Date(o.created_at) < new Date(dateStart + 'T00:00:00')) return false;
    if (dateEnd) {
      var endDate = new Date(dateEnd + 'T23:59:59');
      if (new Date(o.created_at) > endDate) return false;
    }
    if (statusFilter && o.status !== statusFilter) return false;
    return true;
  });

  var start = (currentPage - 1) * PER_PAGE;
  var end = start + PER_PAGE;
  var pageItems = filtered.slice(start, end);
  var totalPages = Math.ceil(filtered.length / PER_PAGE) || 1;

  if (pageItems.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">≡</span><p>Nenhum pedido encontrado.</p></div>';
    return;
  }

  var rows = pageItems.map(function (o) {
    var total = Number(o.total).toFixed(2).replace('.', ',');
    var data = new Date(o.created_at).toLocaleDateString('pt-BR');
    var whatsappLink = o.customer_phone ? 'https://wa.me/55' + o.customer_phone.replace(/\D/g, '') : '';
    var tipo = TIPO_LABELS[o.delivery_type] || '';

    return '<tr' + (precisaCodigo(o) ? ' class="linha-aguardando"' : '') + '>' +
      '<td data-label="#ID"><strong>#' + o.id + '</strong>' + (tipo ? '<small class="pedido-tipo">' + tipo + '</small>' : '') + '</td>' +
      '<td data-label="Cliente">' + escapeHtml(o.customer_name) + '<br><small style="color:var(--color-text-muted)">' + escapeHtml(o.customer_email) + '</small></td>' +
      '<td data-label="Total">R$ ' + total + '</td>' +
      '<td data-label="Status" class="celula-status">' + htmlCelulaStatus(o, uiPedidos[o.id]) + '</td>' +
      '<td data-label="Data">' + data + '</td>' +
      '<td data-label="Ações">' +
        '<button class="btn btn-sm btn-secondary" onclick="window.openDetail(' + o.id + ')">Ver</button> ' +
        (whatsappLink ? '<a href="' + whatsappLink + '" target="_blank" class="btn btn-sm btn-secondary" style="background:#25D366;color:#fff;">📱</a>' : '') +
      '</td>' +
      '</tr>';
  }).join('');

  container.innerHTML =
    '<table class="admin-table"><thead><tr>' +
    '<th>#ID</th><th>Cliente</th><th>Total</th><th>Status</th><th>Data</th><th>Ações</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>' +
    '<div class="pagination">' +
    '<button class="btn btn-sm btn-secondary" id="prevPage" ' + (currentPage <= 1 ? 'disabled' : '') + '>← Anterior</button> ' +
    '<span class="pagination-info">' + currentPage + ' de ' + totalPages + '</span> ' +
    '<button class="btn btn-sm btn-secondary" id="nextPage" ' + (currentPage >= totalPages ? 'disabled' : '') + '>Próxima →</button>' +
    '</div>';

  document.getElementById('prevPage').addEventListener('click', function () { if (currentPage > 1) { currentPage--; renderOrders(); } });
  document.getElementById('nextPage').addEventListener('click', function () { if (currentPage < totalPages) { currentPage++; renderOrders(); } });
}

/* redesenha tudo que mostra o pedido: a tabela e, se estiver aberto, o drawer */
function atualizarTelas(id) {
  renderOrders();
  if (drawerOrderId === id) renderDetail(acharPedido(id));
}

/* --- Troca de status --- */
async function mudarStatus(o, novoStatus, extras) {
  var ui = estadoUi(o.id);
  if (ui.salvando || ui.verificando) return;
  ui.salvando = true;
  ui.statusPendente = novoStatus;
  atualizarTelas(o.id);

  try {
    var body = Object.assign({ status: novoStatus }, extras || {});
    await apiRequest('PATCH', '/api/orders/' + o.id + '/status', body);
    o.status = novoStatus;
    /* o servidor usa COALESCE: só sobrescreve o rastreio quando um valor foi enviado */
    if (extras && extras.tracking_code) o.tracking_code = extras.tracking_code;
    if (extras && extras.tracking_url) o.tracking_url = extras.tracking_url;
    /* o servidor aceitou "pronto para retirada" e gerou o código: só agora o campo aparece */
    if (precisaCodigo(o)) {
      o.pickup_code_generated_at = new Date().toISOString();
      ui.codigo = '';
      ui.erro = '';
      ui.recemAberto = true;
    }
    showToast('Status do pedido #' + o.id + ' atualizado para ' + rotuloStatus(novoStatus) + '!');
  } catch (err) {
    showToast((err && err.message) || 'Erro ao atualizar status.', 'error');
  }

  ui.salvando = false;
  ui.statusPendente = null;
  atualizarTelas(o.id);
  ui.recemAberto = false;
}

/* --- Confirmação da retirada pelo código --- */
async function confirmarRetirada(o) {
  var ui = estadoUi(o.id);
  var codigo = limparCodigo(ui.codigo);
  if (codigo.length !== 6 || ui.verificando || ui.salvando) return;
  ui.verificando = true;
  ui.erro = '';
  atualizarTelas(o.id);

  try {
    await apiRequest('POST', '/api/orders/' + o.id + '/confirm-pickup', { pickup_code: codigo });
    o.status = 'withdrawn';
    o.withdrawn_at = new Date().toISOString();
    o.pickup_code = null;
    o.pickup_code_generated_at = null;
    delete uiPedidos[o.id];
    showToast('Retirada do pedido #' + o.id + ' confirmada!');
    atualizarTelas(o.id);
  } catch (err) {
    ui.verificando = false;
    ui.erro = mensagemErroRetirada(err);
    atualizarTelas(o.id);
    focarCodigo(o.id);
  }
}

function focarCodigo(id) {
  var el = document.getElementById((drawerOrderId === id ? 'retiradaCodigoDrawer-' : 'retiradaCodigo-') + id);
  if (el && el.focus) el.focus();
}

/* --- Eventos (delegados no container da tabela e no corpo do drawer) --- */
function temClasse(el, classe) {
  return !!(el && el.classList && el.classList.contains(classe));
}

function aoMudarStatusNaTabela(e) {
  var sel = e.target;
  if (!temClasse(sel, 'order-status-select')) return;
  var o = acharPedido(Number(sel.dataset.orderId));
  if (!o || sel.value === o.status) return;
  mudarStatus(o, sel.value);
}

function aoDigitarCodigo(e) {
  var input = e.target;
  if (!temClasse(input, 'retirada-input')) return;
  var ui = estadoUi(Number(input.dataset.orderId));
  var limpo = limparCodigo(input.value);
  if (input.value !== limpo) input.value = limpo;
  ui.codigo = limpo;

  var form = input.closest('form');
  var btn = form && form.querySelector('.retirada-btn');
  if (btn) btn.disabled = limpo.length !== 6 || !!ui.verificando || !!ui.salvando;

  /* ao voltar a digitar, o aviso de erro some */
  if (ui.erro) {
    ui.erro = '';
    input.classList.remove('is-erro');
    input.removeAttribute('aria-invalid');
    var dica = form && form.querySelector('.retirada-dica');
    if (dica) {
      dica.classList.remove('is-erro');
      dica.textContent = dica.dataset.dica || '';
    }
  }
}

function aoEnviarCodigo(e) {
  var form = e.target;
  if (!temClasse(form, 'retirada-form')) return;
  e.preventDefault();
  var o = acharPedido(Number(form.dataset.orderId));
  if (o) confirmarRetirada(o);
}

/* --- Detail drawer --- */
window.openDetail = function (orderId) {
  var o = acharPedido(orderId);
  if (!o) { showToast('Pedido não encontrado.', 'error'); return; }

  drawerOrderId = o.id;
  document.getElementById('drawerOverlay').classList.add('active');
  document.getElementById('drawer').classList.add('active');
  renderDetail(o);
};

function renderDetail(o) {
  if (!o) return;
  var ui = uiPedidos[o.id] || {};
  document.getElementById('drawerTitle').textContent = 'Pedido #' + o.id;

  var total = Number(o.total).toFixed(2).replace('.', ',');
  var data = new Date(o.created_at).toLocaleString('pt-BR');
  var whatsappLink = o.customer_phone ? 'https://wa.me/55' + o.customer_phone.replace(/\D/g, '') : '';
  var final = statusFinal(o);

  var itemsHtml = '';
  if (o.items && o.items.length > 0) {
    itemsHtml = '<div style="margin-top:16px;"><h4 style="margin-bottom:8px;">Itens</h4>';
    o.items.forEach(function (item) {
      var itemPrice = Number(item.unit_price || item.price || 0).toFixed(2).replace('.', ',');
      itemsHtml += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--color-border);font-size:var(--font-size-sm);">' +
        '<span>' + escapeHtml(item.item_name || item.product_name || 'Item') + ' x' + item.quantity + '</span>' +
        '<span>R$ ' + itemPrice + '</span>' +
        '</div>';
    });
    itemsHtml += '</div>';
  }

  var statusHtml = final
    ? '<div class="detalhe-status"><strong>Status:</strong> ' + htmlSeloFinal(o) + '</div>'
    : '<div class="detalhe-status"><strong>Status:</strong> ' +
        htmlSeletorStatus(o, ui, { id: 'detailStatusSelect' }) +
        '<button class="btn btn-sm btn-primary" id="detailStatusBtn"' + (ui.salvando || ui.verificando ? ' disabled' : '') + '>' +
          (ui.salvando ? 'Salvando…' : 'Salvar') +
        '</button>' +
      '</div>';

  var trackingHtml = '';
  if (o.delivery_type === 'delivery') {
    if (final) {
      trackingHtml = o.tracking_code ? '<div><strong>Código de rastreamento:</strong> ' + escapeHtml(o.tracking_code) + '</div>' : '';
    } else {
      trackingHtml =
        '<div id="detailTrackingBox"><strong>Código de rastreamento:</strong><br>' +
          '<input class="form-input" id="detailTrackingCode" type="text" value="' + escapeHtml(o.tracking_code || '') + '" placeholder="Ex: AA123456789BR" style="width:100%;margin-top:4px;">' +
          '<input class="form-input" id="detailTrackingUrl" type="text" value="' + escapeHtml(o.tracking_url || '') + '" placeholder="Link de rastreamento (opcional)" style="width:100%;margin-top:6px;">' +
        '</div>';
    }
  }

  document.getElementById('orderDetailBody').innerHTML =
    '<div style="display:grid;gap:12px;">' +
      '<div><strong>Cliente:</strong> ' + escapeHtml(o.customer_name) + '</div>' +
      '<div><strong>E-mail:</strong> ' + escapeHtml(o.customer_email) + '</div>' +
      '<div><strong>Telefone:</strong> ' + (escapeHtml(o.customer_phone) || '—') + ' ' +
        (whatsappLink ? '<a href="' + whatsappLink + '" target="_blank" class="btn btn-sm btn-secondary" style="background:#25D366;color:#fff;">Conversar no WhatsApp</a>' : '') +
      '</div>' +
      '<div><strong>Endereço:</strong><br>' + escapeHtml(o.address || '—') + '</div>' +
      '<div><strong>Forma de pagamento:</strong> ' + escapeHtml(o.payment_method || '—') + '</div>' +
      '<div><strong>Data:</strong> ' + data + '</div>' +
      '<div><strong>Total:</strong> R$ ' + total + '</div>' +
      statusHtml +
      (precisaCodigo(o) ? htmlCaixaCodigo(o, ui, 'drawer') : '') +
      trackingHtml +
      itemsHtml +
    '</div>';

  var statusSelect = document.getElementById('detailStatusSelect');
  if (!statusSelect) return;

  function updateTrackingVisibility() {
    var box = document.getElementById('detailTrackingBox');
    if (box) box.style.display = (statusSelect.value === 'shipped' || statusSelect.value === 'delivered') ? '' : 'none';
  }
  statusSelect.addEventListener('change', updateTrackingVisibility);
  updateTrackingVisibility();

  document.getElementById('detailStatusBtn').addEventListener('click', function () {
    var newStatus = statusSelect.value;
    if (newStatus === o.status) {
      showToast('Escolha um novo status para salvar.', 'warning');
      return;
    }
    var extras = null;
    var trackingInput = document.getElementById('detailTrackingCode');
    var urlInput = document.getElementById('detailTrackingUrl');
    if (trackingInput) {
      extras = {
        tracking_code: trackingInput.value.trim() || null,
        tracking_url: (urlInput ? urlInput.value.trim() : '') || null
      };
    }
    mudarStatus(o, newStatus, extras);
  });
}

function closeDrawer() {
  var id = drawerOrderId;
  drawerOrderId = null;
  document.getElementById('drawerOverlay').classList.remove('active');
  document.getElementById('drawer').classList.remove('active');
  /* o código digitado no drawer passa a aparecer também na linha da tabela */
  if (id !== null && uiPedidos[id]) renderOrders();
}

/* --- Event listeners --- */
document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('searchInput').addEventListener('input', function () {
    clearTimeout(this._timer);
    this._timer = setTimeout(function () { currentPage = 1; renderOrders(); }, 300);
  });
  document.getElementById('filterDateStart').addEventListener('change', function () { currentPage = 1; renderOrders(); });
  document.getElementById('filterDateEnd').addEventListener('change', function () { currentPage = 1; renderOrders(); });
  document.getElementById('filterStatus').addEventListener('change', function () { currentPage = 1; renderOrders(); });

  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);

  var tabela = document.getElementById('tableContainer');
  tabela.addEventListener('change', aoMudarStatusNaTabela);
  [tabela, document.getElementById('orderDetailBody')].forEach(function (raiz) {
    raiz.addEventListener('input', aoDigitarCodigo);
    raiz.addEventListener('submit', aoEnviarCodigo);
  });

  loadOrders();
});
