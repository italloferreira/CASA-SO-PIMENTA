import { protectRoute, showToast } from './admin-auth.js';
import { apiRequest } from '../../../../assets/js/api.js';
import { ligarFechamentoModal } from './modal-utils.js';

protectRoute();

var coupons = [];
var deleteTargetId = null;

function formatMoney(val) {
  return 'R$ ' + Number(val).toFixed(2).replace('.', ',');
}

function formatDiscount(c) {
  if (c.discount_type === 'percentage') {
    return Number(c.discount_value).toFixed(2).replace('.', ',') + '%';
  }
  return formatMoney(c.discount_value);
}

function loadCoupons() {
  document.getElementById('tableContainer').innerHTML = '<div class="empty-state"><span class="empty-icon">◈</span><p>Carregando...</p></div>';

  apiRequest('GET', '/api/coupons')
    .then(function (data) {
      coupons = data.coupons;
      renderCoupons();
    })
    .catch(function (err) {
      document.getElementById('tableContainer').innerHTML = '<div class="empty-state"><span class="empty-icon">◈</span><p>Erro ao carregar cupons.</p></div>';
      showToast(err.message, 'error');
    });
}

function renderCoupons() {
  var container = document.getElementById('tableContainer');
  var search = (document.getElementById('searchInput').value || '').toLowerCase().trim();

  var filtered = coupons.filter(function (c) {
    return !search || c.code.toLowerCase().includes(search);
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">◈</span><p>Nenhum cupom encontrado.</p></div>';
    return;
  }

  var rows = filtered.map(function (c) {
    var expires = c.expires_at ? new Date(c.expires_at).toLocaleDateString('pt-BR') : '—';
    var expired = c.expires_at && new Date(c.expires_at) < new Date();
    var activeBadge = c.is_active && !expired ? '<span class="badge badge-success">Ativo</span>' : '<span class="badge badge-danger">' + (expired ? 'Expirado' : 'Inativo') + '</span>';
    var usesInfo = c.max_uses ? (c.times_used + '/' + c.max_uses) : c.times_used;
    return '<tr>' +
      '<td data-label="Código"><strong>' + c.code + '</strong></td>' +
      '<td data-label="Desconto">' + formatDiscount(c) + '</td>' +
      '<td data-label="Mínimo">' + (c.min_order_amount ? formatMoney(c.min_order_amount) : '—') + '</td>' +
      '<td data-label="Usos">' + usesInfo + '</td>' +
      '<td data-label="Validade">' + expires + '</td>' +
      '<td data-label="Status">' + activeBadge + '</td>' +
      '<td data-label="Ações">' +
        '<button class="btn btn-sm btn-secondary" onclick="window.editCupom(' + c.id + ')">✎</button> ' +
        '<button class="btn btn-sm btn-danger" onclick="window.confirmDelete(' + c.id + ')">✕</button>' +
      '</td>' +
      '</tr>';
  }).join('');

  container.innerHTML =
    '<table class="admin-table"><thead><tr>' +
    '<th>Código</th><th>Desconto</th><th>Mínimo</th><th>Usos</th><th>Validade</th><th>Status</th><th>Ações</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>';
}

/* "R$" antes do valor para desconto fixo, "%" depois para percentual */
function atualizarUnidadeDesconto() {
  var percentual = document.getElementById('cupomDiscountType').value === 'percentage';
  document.getElementById('cupomDiscountPrefix').hidden = percentual;
  document.getElementById('cupomDiscountSuffix').hidden = !percentual;
  document.getElementById('cupomDiscount').placeholder = percentual ? '10' : '0,00';
}

function openModal(id) {
  document.getElementById('modalOverlay').classList.add('active');
  document.getElementById('modal').classList.add('active');

  if (id) {
    var c = coupons.find(function (x) { return x.id === id; });
    if (!c) { atualizarUnidadeDesconto(); return; }
    document.getElementById('modalTitle').textContent = 'Editar Cupom';
    document.getElementById('cupomIndex').value = id;
    document.getElementById('cupomCode').value = c.code;
    document.getElementById('cupomDiscountType').value = c.discount_type || 'fixed';
    document.getElementById('cupomDiscount').value = c.discount_value;
    document.getElementById('cupomMinOrder').value = c.min_order_amount || '';
    document.getElementById('cupomMaxUses').value = c.max_uses || '';
    document.getElementById('cupomExpires').value = c.expires_at ? c.expires_at.split('T')[0] : '';
    document.getElementById('cupomActive').checked = c.is_active !== false;
  } else {
    document.getElementById('modalTitle').textContent = 'Novo Cupom';
    document.getElementById('cupomForm').reset();
    document.getElementById('cupomIndex').value = '';
    document.getElementById('cupomActive').checked = true;
  }
  atualizarUnidadeDesconto();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  document.getElementById('modal').classList.remove('active');
}

function closeConfirm() {
  document.getElementById('confirmOverlay').classList.remove('active');
  document.getElementById('confirmModal').classList.remove('active');
}

window.editCupom = function (id) { openModal(id); };
window.confirmDelete = function (id) {
  deleteTargetId = id;
  var c = coupons.find(function (x) { return x.id === id; });
  document.getElementById('confirmMessage').textContent = 'Excluir cupom "' + (c ? c.code : '') + '"?';
  document.getElementById('confirmOverlay').classList.add('active');
  document.getElementById('confirmModal').classList.add('active');
};

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('searchInput').addEventListener('input', function () {
    clearTimeout(this._timer);
    this._timer = setTimeout(renderCoupons, 300);
  });

  document.getElementById('btnNovoCupom').addEventListener('click', function () { openModal(null); });

  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', closeModal);
  ligarFechamentoModal(document.getElementById('modal'), closeModal);
  ligarFechamentoModal(document.getElementById('confirmModal'), closeConfirm);
  document.getElementById('cupomDiscountType').addEventListener('change', atualizarUnidadeDesconto);

  document.getElementById('cupomForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = document.getElementById('cupomIndex').value;
    var payload = {
      code: document.getElementById('cupomCode').value.trim().toUpperCase(),
      discount_type: document.getElementById('cupomDiscountType').value,
      discount_value: Number(document.getElementById('cupomDiscount').value),
      min_order_amount: document.getElementById('cupomMinOrder').value ? Number(document.getElementById('cupomMinOrder').value) : null,
      max_uses: document.getElementById('cupomMaxUses').value ? Number(document.getElementById('cupomMaxUses').value) : null,
      expires_at: document.getElementById('cupomExpires').value || null,
      is_active: document.getElementById('cupomActive').checked
    };

    if (!payload.code || !payload.discount_type || !payload.discount_value) {
      showToast('Preencha código, tipo e valor do desconto.', 'error');
      return;
    }

    var request = id ? apiRequest('PUT', '/api/coupons/' + id, payload) : apiRequest('POST', '/api/coupons', payload);

    request
      .then(function (data) {
        showToast(id ? 'Cupom atualizado!' : 'Cupom criado!');
        closeModal();
        loadCoupons();
      })
      .catch(function (err) {
        showToast(err.message, 'error');
      });
  });

  document.getElementById('confirmCancel').addEventListener('click', closeConfirm);
  document.getElementById('confirmOverlay').addEventListener('click', closeConfirm);
  document.getElementById('confirmDelete').addEventListener('click', function () {
    if (deleteTargetId !== null) {
      apiRequest('DELETE', '/api/coupons/' + deleteTargetId)
        .then(function () {
          showToast('Cupom excluído!');
          closeConfirm();
          deleteTargetId = null;
          loadCoupons();
        })
        .catch(function (err) {
          showToast(err.message, 'error');
        });
    }
  });

  loadCoupons();
});
