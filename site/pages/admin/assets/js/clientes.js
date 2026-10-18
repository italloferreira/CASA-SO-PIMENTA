import { protectRoute, showToast } from './admin-auth.js';
import { apiRequest } from '../../../../assets/js/api.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

protectRoute();

var currentPage = 1;
var totalPages = 1;

function formatMoney(val) {
  return 'R$ ' + Number(val).toFixed(2).replace('.', ',');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

function loadUsers(page) {
  page = page || currentPage;
  var search = document.getElementById('searchInput').value.trim();

  document.getElementById('tableContainer').innerHTML = '<div class="empty-state"><span class="empty-icon">◎</span><p>Carregando...</p></div>';

  var url = '/api/users?page=' + page + '&limit=20';
  if (search) url += '&search=' + encodeURIComponent(search);

  apiRequest('GET', url)
    .then(function (data) {
      if (!data.success) throw new Error(data.message);
      currentPage = data.pagination.page;
      totalPages = data.pagination.totalPages;
      renderUsers(data.users);
      renderPagination(data.pagination);
      document.getElementById('userCount').textContent = data.pagination.total + ' cliente(s)';
    })
    .catch(function (err) {
      document.getElementById('tableContainer').innerHTML = '<div class="empty-state"><span class="empty-icon">◎</span><p>Erro ao carregar clientes.</p></div>';
      showToast(err.message, 'error');
    });
}

function renderUsers(users) {
  var container = document.getElementById('tableContainer');

  if (users.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">◎</span><p>Nenhum cliente encontrado.</p></div>';
    return;
  }

  var rows = users.map(function (u) {
    var statusBadge = u.role === 'disabled'
      ? '<span class="badge badge-danger">Inativo</span>'
      : '<span class="badge badge-success">Ativo</span>';
    return '<tr>' +
      '<td data-label="Nome"><strong>' + escapeHtml(u.name || '—') + '</strong></td>' +
      '<td data-label="Email">' + escapeHtml(u.email || '—') + '</td>' +
      '<td data-label="Telefone">' + escapeHtml(u.phone || '—') + '</td>' +
      '<td data-label="Pedidos">' + u.order_count + '</td>' +
      '<td data-label="Total">' + (u.total_spent > 0 ? formatMoney(u.total_spent) : '—') + '</td>' +
      '<td data-label="Cadastro">' + formatDate(u.created_at) + '</td>' +
      '<td data-label="Status">' + statusBadge + '</td>' +
      '<td data-label="Ações">' +
        '<button class="btn btn-sm btn-secondary" onclick="window.verCliente(' + u.id + ')">👁</button>' +
      '</td>' +
      '</tr>';
  }).join('');

  container.innerHTML =
    '<table class="admin-table"><thead><tr>' +
    '<th>Nome</th><th>Email</th><th>Telefone</th><th>Pedidos</th><th>Total</th><th>Cadastro</th><th>Status</th><th>Ações</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>';
}

window.loadUsers = loadUsers;

function renderPagination(p) {
  var el = document.getElementById('pagination');
  if (!el) return;
  if (p.totalPages <= 1) { el.innerHTML = ''; return; }

  var html = '<div class="pagination-controls">';
  if (p.page > 1) html += '<button class="btn btn-sm btn-secondary" onclick="window.loadUsers(' + (p.page - 1) + ')">← Anterior</button>';
  html += '<span style="margin:0 12px;font-size:13px;color:#666;">Página ' + p.page + ' de ' + p.totalPages + '</span>';
  if (p.page < p.totalPages) html += '<button class="btn btn-sm btn-secondary" onclick="window.loadUsers(' + (p.page + 1) + ')">Próxima →</button>';
  html += '</div>';
  el.innerHTML = html;
}

window.verCliente = function (id) {
  apiRequest('GET', '/api/users/' + id)
    .then(function (data) {
      if (!data.success) throw new Error(data.message);
      mostrarDrawer(data.user, data.orders);
    })
    .catch(function (err) {
      showToast(err.message, 'error');
    });
};

function mostrarDrawer(user, orders) {
  document.getElementById('drawerTitle').textContent = user.name || 'Cliente';
  document.getElementById('drawerOverlay').classList.add('active');
  document.getElementById('drawer').classList.add('active');

  var body = document.getElementById('drawerBody');
  var ordersHtml = '';

  if (orders && orders.length > 0) {
    ordersHtml = orders.map(function (o) {
      return '<tr>' +
        '<td>#' + o.id + '</td>' +
        '<td>' + formatMoney(o.total) + '</td>' +
        '<td>' + escapeHtml(o.status || '—') + '</td>' +
        '<td>' + escapeHtml(o.payment_method || '—') + '</td>' +
        '<td>' + formatDate(o.created_at) + '</td>' +
        '</tr>';
    }).join('');
    ordersHtml =
      '<h3 style="margin-top:20px;margin-bottom:8px;">Pedidos</h3>' +
      '<table class="admin-table"><thead><tr><th>#</th><th>Total</th><th>Status</th><th>Pagamento</th><th>Data</th></tr></thead><tbody>' + ordersHtml + '</tbody></table>';
  } else {
    ordersHtml = '<p style="color:#888;margin-top:16px;">Nenhum pedido encontrado.</p>';
  }

  body.innerHTML =
    '<div class="form-group"><label class="form-label">Nome</label><input type="text" class="form-input" id="editUserName" value="' + escapeHtml(user.name || '') + '"></div>' +
    '<div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="editUserEmail" value="' + escapeHtml(user.email || '') + '"></div>' +
    '<div class="form-group"><label class="form-label">Telefone</label><input type="text" class="form-input" id="editUserPhone" value="' + escapeHtml(user.phone || '') + '"></div>' +
    '<div class="form-group"><label class="form-label">CEP</label><input type="text" class="form-input" id="editUserCep" value="' + escapeHtml(user.cep || '') + '"></div>' +
    '<div class="form-group"><label class="form-label">Endereço</label><input type="text" class="form-input" id="editUserAddress" value="' + escapeHtml(user.address || '') + '"></div>' +
    '<div class="form-row"><div class="form-group"><label class="form-label">Cidade</label><input type="text" class="form-input" id="editUserCity" value="' + escapeHtml(user.city || '') + '"></div>' +
    '<div class="form-group"><label class="form-label">Estado</label><input type="text" class="form-input" id="editUserState" value="' + escapeHtml(user.state || '') + '" maxlength="2"></div></div>' +
    '<div style="display:flex;gap:8px;margin-top:12px;">' +
      '<button class="btn btn-primary" onclick="window.salvarCliente(' + user.id + ')">Salvar</button>' +
      '<button class="btn btn-danger" onclick="window.excluirCliente(' + user.id + ')">Excluir</button>' +
    '</div>' +
    ordersHtml;

  document.getElementById('drawerCancel').onclick = fecharDrawer;
  document.getElementById('drawerClose').onclick = fecharDrawer;
  document.getElementById('drawerOverlay').onclick = fecharDrawer;
}

window.salvarCliente = function (id) {
  var payload = {
    name: document.getElementById('editUserName').value.trim(),
    email: document.getElementById('editUserEmail').value.trim(),
    phone: document.getElementById('editUserPhone').value.trim(),
    cep: document.getElementById('editUserCep').value.trim(),
    address: document.getElementById('editUserAddress').value.trim(),
    city: document.getElementById('editUserCity').value.trim(),
    state: document.getElementById('editUserState').value.trim()
  };

  apiRequest('PUT', '/api/users/' + id, payload)
    .then(function () {
      showToast('Cliente atualizado!');
      fecharDrawer();
      loadUsers();
    })
    .catch(function (err) {
      showToast(err.message, 'error');
    });
};

window.excluirCliente = function (id) {
  if (!confirm('Tem certeza que deseja excluir este cliente?')) return;
  apiRequest('DELETE', '/api/users/' + id)
    .then(function (data) {
      showToast(data.message);
      fecharDrawer();
      loadUsers();
    })
    .catch(function (err) {
      showToast(err.message, 'error');
    });
};

function fecharDrawer() {
  document.getElementById('drawerOverlay').classList.remove('active');
  document.getElementById('drawer').classList.remove('active');
}

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('searchInput').addEventListener('input', function () {
    clearTimeout(this._timer);
    this._timer = setTimeout(function () { loadUsers(1); }, 400);
  });

  loadUsers(1);
});
