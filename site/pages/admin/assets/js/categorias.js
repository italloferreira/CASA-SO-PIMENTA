import { protectRoute, showToast } from './admin-auth.js';
import { API_BASE, apiRequest } from '../../../../assets/js/api.js';
import { ligarFechamentoModal } from './modal-utils.js';

protectRoute();

let allCategories = [];
let deleteTargetId = null;

function slugify(text) {
  const map = {
    'á':'a','à':'a','ã':'a','â':'a','ä':'a','é':'e','ê':'e','è':'e','ë':'e',
    'í':'i','ì':'i','î':'i','ï':'i','ó':'o','ò':'o','õ':'o','ô':'o','ö':'o',
    'ú':'u','ù':'u','û':'u','ü':'u','ç':'c','ñ':'n'
  };
  return text.toLowerCase().replace(/[áàãâäéèêëíìîïóòõôöúùûüçñ]/g, function (c) { return map[c] || c; }).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function loadCategories() {
  var container = document.getElementById('tableContainer');
  container.innerHTML = '<div class="skeleton skeleton-table"></div>';
  try {
    allCategories = await apiRequest('GET', '/api/categories');
    renderCategories();
  } catch (e) {
    container.innerHTML = '<div class="error-banner">Erro ao carregar categorias.</div>';
  }
}

function renderCategories() {
  var container = document.getElementById('tableContainer');
  var search = (document.getElementById('searchInput').value || '').toLowerCase().trim();

  var filtered = allCategories.filter(function (c) {
    return !search || c.name.toLowerCase().includes(search);
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">◉</span><p>Nenhuma categoria encontrada.</p></div>';
    return;
  }

  var rows = filtered.map(function (c) {
    var colorPreview = c.color ? '<span class="category-color-preview" style="background:' + c.color + '"></span>' : '—';
    return '<tr>' +
      '<td data-label="Nome"><strong>' + c.name + '</strong></td>' +
      '<td data-label="Slug">' + (c.slug || '—') + '</td>' +
      '<td data-label="Cor">' + colorPreview + ' ' + (c.color || '') + '</td>' +
      '<td data-label="Ações">' +
        '<button class="btn btn-sm btn-secondary" onclick="window.editCategory(' + c.id + ')">✎</button> ' +
        '<button class="btn btn-sm btn-danger" onclick="window.confirmDelete(' + c.id + ')">✕</button>' +
      '</td>' +
      '</tr>';
  }).join('');

  container.innerHTML =
    '<table class="admin-table"><thead><tr>' +
    '<th>Nome</th><th>Slug</th><th>Cor</th><th>Ações</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function openModal(category) {
  document.getElementById('modalOverlay').classList.add('active');
  document.getElementById('modal').classList.add('active');

  if (category) {
    document.getElementById('modalTitle').textContent = 'Editar Categoria';
    document.getElementById('categoriaId').value = category.id;
    document.getElementById('catName').value = category.name || '';
    document.getElementById('catSlug').value = category.slug || '';
    document.getElementById('catColor').value = category.color || '#8B2E00';
    document.getElementById('catColorText').value = category.color || '#8B2E00';
  } else {
    document.getElementById('modalTitle').textContent = 'Nova Categoria';
    document.getElementById('categoriaForm').reset();
    document.getElementById('categoriaId').value = '';
    document.getElementById('catColor').value = '#8B2E00';
    document.getElementById('catColorText').value = '#8B2E00';
  }
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  document.getElementById('modal').classList.remove('active');
}

function closeConfirm() {
  document.getElementById('confirmOverlay').classList.remove('active');
  document.getElementById('confirmModal').classList.remove('active');
}

window.editCategory = function (id) {
  var c = allCategories.find(function (c) { return c.id === id; });
  if (c) openModal(c);
};

window.confirmDelete = function (id) {
  deleteTargetId = id;
  var c = allCategories.find(function (c) { return c.id === id; });
  document.getElementById('confirmMessage').textContent = 'Excluir categoria "' + (c ? c.name : '') + '"? Produtos associados ficarão sem categoria.';
  document.getElementById('confirmOverlay').classList.add('active');
  document.getElementById('confirmModal').classList.add('active');
};

document.addEventListener('DOMContentLoaded', function () {
  /* Sync color inputs */
  document.getElementById('catColor').addEventListener('input', function () {
    document.getElementById('catColorText').value = this.value;
  });
  document.getElementById('catColorText').addEventListener('input', function () {
    if (/^#[0-9a-f]{6}$/i.test(this.value)) {
      document.getElementById('catColor').value = this.value;
    }
  });

  /* Auto-slug */
  document.getElementById('catName').addEventListener('input', function () {
    var slugField = document.getElementById('catSlug');
    if (!slugField.value || slugField.dataset.autofilled !== 'false') {
      slugField.value = slugify(this.value);
    }
  });
  document.getElementById('catSlug').addEventListener('input', function () {
    this.dataset.autofilled = 'false';
  });

  /* Search */
  document.getElementById('searchInput').addEventListener('input', function () {
    clearTimeout(this._timer);
    this._timer = setTimeout(renderCategories, 300);
  });

  /* New */
  document.getElementById('btnNovaCategoria').addEventListener('click', function () { openModal(null); });

  /* Modal close */
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', closeModal);
  ligarFechamentoModal(document.getElementById('modal'), closeModal);
  ligarFechamentoModal(document.getElementById('confirmModal'), closeConfirm);

  /* Form submit */
  document.getElementById('categoriaForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var id = document.getElementById('categoriaId').value;
    var payload = {
      name: document.getElementById('catName').value.trim(),
      slug: document.getElementById('catSlug').value.trim() || slugify(document.getElementById('catName').value.trim()),
      color: document.getElementById('catColorText').value.trim() || null
    };

    if (!payload.name) {
      showToast('Preencha o nome.', 'error');
      return;
    }

    var btn = document.getElementById('btnSaveCategoria');
    btn.textContent = 'Salvando...';
    btn.disabled = true;

    try {
      if (id) {
        await apiRequest('PUT', '/api/categories/' + id, payload);
        showToast('Categoria atualizada!');
      } else {
        await apiRequest('POST', '/api/categories', payload);
        showToast('Categoria criada!');
      }
      closeModal();
      await loadCategories();
    } catch (err) {
      showToast('Erro ao salvar categoria.', 'error');
    } finally {
      btn.textContent = 'Salvar';
      btn.disabled = false;
    }
  });

  /* Confirm delete */
  document.getElementById('confirmCancel').addEventListener('click', closeConfirm);
  document.getElementById('confirmOverlay').addEventListener('click', closeConfirm);
  document.getElementById('confirmDelete').addEventListener('click', async function () {
    if (!deleteTargetId) return;
    try {
      await apiRequest('DELETE', '/api/categories/' + deleteTargetId);
      showToast('Categoria excluída!');
      closeConfirm();
      await loadCategories();
    } catch (err) {
      showToast('Erro ao excluir categoria.', 'error');
    }
    deleteTargetId = null;
  });

  loadCategories();
});
