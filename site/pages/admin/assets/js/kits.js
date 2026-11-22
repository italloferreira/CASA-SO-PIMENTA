import { protectRoute, showToast } from './admin-auth.js';
import { API_BASE, apiRequest, imageUrl } from '../../../../assets/js/api.js';
import { ligarFechamentoModal } from './modal-utils.js';

protectRoute();

let allKits = [];
let kitItems = [];
let deleteTargetId = null;
let currentPage = 1;
const PER_PAGE = 10;

/* --- Load kits --- */
async function loadKits() {
  var container = document.getElementById('tableContainer');
  container.innerHTML = '<div class="skeleton skeleton-table"></div>';
  try {
    allKits = await apiRequest('GET', '/api/kits');
    renderKits();
  } catch (e) {
    container.innerHTML = '<div class="error-banner">Erro ao carregar kits.</div>';
  }
}

/* --- Render --- */
function renderKits() {
  var container = document.getElementById('tableContainer');
  var search = (document.getElementById('searchInput').value || '').toLowerCase().trim();

  var filtered = allKits.filter(function (k) {
    return !search || k.name.toLowerCase().includes(search);
  });

  var start = (currentPage - 1) * PER_PAGE;
  var end = start + PER_PAGE;
  var pageItems = filtered.slice(start, end);
  var totalPages = Math.ceil(filtered.length / PER_PAGE) || 1;

  if (pageItems.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">❏</span><p>Nenhum kit encontrado.</p></div>';
    return;
  }

  var rows = pageItems.map(function (k) {
    var price = Number(k.price).toFixed(2).replace('.', ',');
    var img = k.image_url ? '<img src="' + imageUrl(k.image_url) + '" class="table-thumb" style="width:40px;height:40px;object-fit:cover;border-radius:4px;">' : '<span style="font-size:24px;opacity:0.3;">❏</span>';
    var badge = k.is_active ? '<span class="badge badge-success">Ativo</span>' : '<span class="badge badge-danger">Inativo</span>';
    return '<tr>' +
      '<td data-label="Imagem">' + img + '</td>' +
      '<td data-label="Nome"><strong>' + k.name + '</strong></td>' +
      '<td data-label="Preço">R$ ' + price + '</td>' +
      '<td data-label="Estoque">' + (k.stock ? '<span class="badge badge-success">Sim</span>' : '<span class="badge badge-danger">Não</span>') + '</td>' +
      '<td data-label="Status">' + badge + '</td>' +
      '<td data-label="Ações">' +
        '<button class="btn btn-sm btn-secondary" onclick="window.editKit(' + k.id + ')">✎</button> ' +
        '<button class="btn btn-sm btn-danger" onclick="window.confirmDelete(' + k.id + ')">✕</button>' +
      '</td>' +
      '</tr>';
  }).join('');

  container.innerHTML =
    '<table class="admin-table"><thead><tr>' +
    '<th>Imagem</th><th>Nome</th><th>Preço</th><th>Estoque</th><th>Status</th><th>Ações</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>' +
    '<div class="pagination">' +
    '<button class="btn btn-sm btn-secondary" id="prevPage" ' + (currentPage <= 1 ? 'disabled' : '') + '>← Anterior</button> ' +
    '<span class="pagination-info">' + currentPage + ' de ' + totalPages + '</span> ' +
    '<button class="btn btn-sm btn-secondary" id="nextPage" ' + (currentPage >= totalPages ? 'disabled' : '') + '>Próxima →</button>' +
    '</div>';

  document.getElementById('prevPage').addEventListener('click', function () { if (currentPage > 1) { currentPage--; renderKits(); } });
  document.getElementById('nextPage').addEventListener('click', function () { if (currentPage < totalPages) { currentPage++; renderKits(); } });
}

/* --- Drawer --- */
function openDrawer(kit) {
  document.getElementById('drawerOverlay').classList.add('active');
  document.getElementById('drawer').classList.add('active');
  document.getElementById('drawerTitle').textContent = kit ? 'Editar Kit' : 'Novo Kit';
  kitItems = [];

  if (kit) {
    document.getElementById('kitId').value = kit.id;
    document.getElementById('kitName').value = kit.name || '';
    document.getElementById('kitPrice').value = kit.price || '';
    document.getElementById('kitStock').checked = !!kit.stock;
    document.getElementById('kitDescription').value = kit.description || '';
    document.getElementById('kitActive').checked = kit.is_active !== false;
    if (kit.image_url) {
      document.getElementById('kitImageUrl').value = kit.image_url;
      var preview = document.getElementById('kitImagePreview');
      preview.src = imageUrl(kit.image_url);
      preview.style.display = 'block';
    } else {
      document.getElementById('kitImageUrl').value = '';
      document.getElementById('kitImagePreview').style.display = 'none';
    }
    if (kit.items) {
      kitItems = kit.items.map(function (i) { return { name: i.custom_name || 'Item #' + i.id }; });
    }
    renderKitItems();
  } else {
    document.getElementById('kitForm').reset();
    document.getElementById('kitId').value = '';
    document.getElementById('kitImageUrl').value = '';
    document.getElementById('kitImagePreview').style.display = 'none';
    document.getElementById('kitActive').checked = true;
    document.getElementById('kitStock').checked = false;
    kitItems = [];
    renderKitItems();
  }
}

function closeDrawer() {
  document.getElementById('drawerOverlay').classList.remove('active');
  document.getElementById('drawer').classList.remove('active');
}

/* --- Kit items --- */
function renderKitItems() {
  var list = document.getElementById('kitItemList');
  if (kitItems.length === 0) {
    list.innerHTML = '<p style="color:var(--color-text-muted);font-size:var(--font-size-sm);margin-top:8px;">Nenhum produto adicionado ao kit.</p>';
    return;
  }
  list.innerHTML = kitItems.map(function (item, index) {
    return '<div class="kit-item-row">' +
      '<span class="item-name">' + item.name + '</span>' +
      '<button type="button" class="btn-remove-item" data-index="' + index + '">✕</button>' +
      '</div>';
  }).join('');

  list.querySelectorAll('.btn-remove-item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var idx = parseInt(this.dataset.index);
      kitItems.splice(idx, 1);
      renderKitItems();
    });
  });
}

/* --- Adicionar item personalizado --- */
document.addEventListener('DOMContentLoaded', function () {
  var input = document.getElementById('kitProductName');
  var btnAdd = document.getElementById('btnAddKitItem');

  function addItem() {
    var name = input.value.trim();
    if (!name) return;
    kitItems.push({ name: name });
    renderKitItems();
    input.value = '';
    input.focus();
  }

  btnAdd.addEventListener('click', addItem);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem();
    }
  });
});

/* --- Image upload --- */
document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('kitImageInput').addEventListener('change', async function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var formData = new FormData();
    formData.append('image', file);
    try {
      var result = await apiRequest('POST', '/api/uploads', formData, true);
      document.getElementById('kitImageUrl').value = result.image_url;
      var preview = document.getElementById('kitImagePreview');
      preview.src = imageUrl(result.image_url);
      preview.style.display = 'block';
    } catch (err) {
      showToast(err.message || 'Erro ao fazer upload.', 'error');
    }
  });
});

/* --- Form submit --- */
document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('kitForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var id = document.getElementById('kitId').value;
    var payload = {
      name: document.getElementById('kitName').value.trim(),
      price: Number(document.getElementById('kitPrice').value),
      stock: document.getElementById('kitStock').checked,
      description: document.getElementById('kitDescription').value.trim(),
      image_url: document.getElementById('kitImageUrl').value || null,
      active: document.getElementById('kitActive').checked
    };

    if (!payload.name || !payload.price) {
      showToast('Preencha nome e preço.', 'error');
      return;
    }

    var btn = document.getElementById('btnSaveKit');
    btn.textContent = 'Salvando...';
    btn.disabled = true;

    try {
      var kitResult;
      if (id) {
        kitResult = await apiRequest('PUT', '/api/kits/' + id, payload);
        showToast('Kit atualizado!');
      } else {
        kitResult = await apiRequest('POST', '/api/kits', payload);
        id = kitResult.id;
        showToast('Kit criado!');
      }

      if (id) {
        await apiRequest('DELETE', '/api/kits/' + id + '/items');
      }

      if (kitItems.length > 0) {
        await Promise.all(kitItems.map(function (item) {
          return apiRequest('POST', '/api/kits/' + id + '/items', { custom_name: item.name });
        }));
      }

      closeDrawer();
      await loadKits();
    } catch (err) {
      showToast('Erro ao salvar kit.', 'error');
    } finally {
      btn.textContent = 'Salvar';
      btn.disabled = false;
    }
  });
});

/* --- Delete --- */
window.confirmDelete = function (id) {
  deleteTargetId = id;
  var k = allKits.find(function (k) { return k.id === id; });
  document.getElementById('confirmMessage').textContent = 'Excluir kit "' + (k ? k.name : '') + '"?';
  document.getElementById('confirmOverlay').classList.add('active');
  document.getElementById('confirmModal').classList.add('active');
};

window.editKit = function (id) {
  var k = allKits.find(function (k) { return k.id === id; });
  if (k) openDrawer(k);
};

/* --- Event listeners --- */
document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('searchInput').addEventListener('input', function () {
    clearTimeout(this._timer);
    this._timer = setTimeout(function () { currentPage = 1; renderKits(); }, 300);
  });

  document.getElementById('btnNovoKit').addEventListener('click', function () { openDrawer(null); });

  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  document.getElementById('drawerCancel').addEventListener('click', closeDrawer);
  document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);

  document.getElementById('confirmCancel').addEventListener('click', function () {
    document.getElementById('confirmOverlay').classList.remove('active');
    document.getElementById('confirmModal').classList.remove('active');
  });
  document.getElementById('confirmOverlay').addEventListener('click', function () {
    document.getElementById('confirmOverlay').classList.remove('active');
    document.getElementById('confirmModal').classList.remove('active');
  });
  ligarFechamentoModal(document.getElementById('confirmModal'), function () {
    document.getElementById('confirmOverlay').classList.remove('active');
    document.getElementById('confirmModal').classList.remove('active');
  });
  document.getElementById('confirmDelete').addEventListener('click', async function () {
    if (!deleteTargetId) return;
    try {
      await apiRequest('DELETE', '/api/kits/' + deleteTargetId);
      showToast('Kit excluído!');
      document.getElementById('confirmOverlay').classList.remove('active');
      document.getElementById('confirmModal').classList.remove('active');
      await loadKits();
    } catch (err) {
      showToast('Erro ao excluir kit.', 'error');
    }
    deleteTargetId = null;
  });

  loadKits();
});
