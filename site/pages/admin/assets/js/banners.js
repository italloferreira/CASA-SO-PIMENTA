import { protectRoute, showToast } from './admin-auth.js';
import { API_BASE, apiRequest, imageUrl } from '../../../../assets/js/api.js';
import { ligarFechamentoModal } from './modal-utils.js';

protectRoute();

let allBanners = [];
let deleteTargetId = null;
let dragItem = null;

/* --- Load banners --- */
async function loadBanners() {
  var grid = document.getElementById('bannerGrid');
  grid.innerHTML = '';
  for (var i = 0; i < 3; i++) {
    var sk = document.createElement('div');
    sk.className = 'skeleton';
    sk.style.height = '200px';
    sk.style.borderRadius = 'var(--border-radius-md)';
    grid.appendChild(sk);
  }
  try {
    allBanners = await apiRequest('GET', '/api/banners');
    renderBanners();
  } catch (e) {
    grid.innerHTML = '<div class="error-banner" style="grid-column:1/-1;">Erro ao carregar banners.</div>';
  }
}

/* --- Render card grid --- */
function renderBanners() {
  var grid = document.getElementById('bannerGrid');
  if (allBanners.length === 0) {
    grid.innerHTML = '<div class="empty-state banner-empty"><span class="empty-icon">◫</span><p>Nenhum banner cadastrado. Clique em "Novo Banner" para começar.</p></div>';
    return;
  }

  var sorted = allBanners.slice().sort(function (a, b) { return (a.position || 0) - (b.position || 0); });

  grid.innerHTML = '';

  sorted.forEach(function (banner, index) {
    var activeBadge = banner.is_active ? '<span class="badge badge-success">Ativo</span>' : '<span class="badge badge-danger">Inativo</span>';
    var img = banner.image_url ? '<img class="banner-image" src="' + imageUrl(banner.image_url) + '" alt="' + banner.title + '">' : '<div class="banner-image" style="display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);font-size:32px;">◫</div>';

    var card = document.createElement('div');
    card.className = 'banner-card';
    card.draggable = true;
    card.dataset.id = banner.id;
    card.dataset.position = banner.position || index;

    card.innerHTML =
      img +
      '<div class="banner-info">' +
        '<div class="banner-info-left">' +
          '<div class="banner-title">' + banner.title + '</div>' +
          '<div class="banner-subtitle">' + (banner.subtitle || '') + ' ' + activeBadge + '</div>' +
        '</div>' +
        '<div class="banner-actions">' +
          '<button class="btn btn-sm btn-secondary" onclick="window.editBanner(' + banner.id + ')">✎</button> ' +
          '<button class="btn btn-sm btn-danger" onclick="window.confirmDelete(' + banner.id + ')">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="banner-order"><span class="banner-handle">⠿</span> Posição: ' + (banner.position || index + 1) + '</div>';

    card.addEventListener('dragstart', function (e) {
      dragItem = card;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', function () {
      card.classList.remove('dragging');
      dragItem = null;
      document.querySelectorAll('.banner-card').forEach(function (c) { c.classList.remove('drag-over'); });
    });
    card.addEventListener('dragover', function (e) {
      e.preventDefault();
      if (card !== dragItem) card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', function () {
      card.classList.remove('drag-over');
    });
    card.addEventListener('drop', function (e) {
      e.preventDefault();
      card.classList.remove('drag-over');
      if (dragItem && dragItem !== card) {
        var items = Array.from(grid.querySelectorAll('.banner-card'));
        var fromIdx = items.indexOf(dragItem);
        var toIdx = items.indexOf(card);
        if (fromIdx < toIdx) {
          grid.insertBefore(dragItem, card.nextSibling);
        } else {
          grid.insertBefore(dragItem, card);
        }
        updatePositions();
      }
    });

    grid.appendChild(card);
  });
}

/* --- Update positions after drag --- */
async function updatePositions() {
  var cards = document.querySelectorAll('.banner-card');
  var updates = Array.from(cards).map(function (card, index) {
    return { id: Number(card.dataset.id), position: index + 1 };
  });

  try {
    await Promise.all(updates.map(function (u) {
      return apiRequest('PUT', '/api/banners/' + u.id, { position: u.position });
    }));
    showToast('Posições atualizadas!');
    allBanners.forEach(function (b) {
      var found = updates.find(function (u) { return u.id === b.id; });
      if (found) b.position = found.position;
    });
    renderBanners();
  } catch (e) {
    showToast('Erro ao salvar posições.', 'error');
  }
}

/* --- Drawer --- */
function openDrawer(banner) {
  document.getElementById('drawerOverlay').classList.add('active');
  document.getElementById('drawer').classList.add('active');
  document.getElementById('drawerTitle').textContent = banner ? 'Editar Banner' : 'Novo Banner';

  if (banner) {
    document.getElementById('bannerId').value = banner.id;
    document.getElementById('bannerTitle').value = banner.title || '';
    document.getElementById('bannerSubtitle').value = banner.subtitle || '';
    document.getElementById('bannerLink').value = banner.link || '';
    document.getElementById('bannerLinkText').value = banner.link_text || '';
    document.getElementById('bannerActive').checked = banner.is_active !== false;
    document.getElementById('bannerImageInput').required = false;
    if (banner.image_url) {
      document.getElementById('bannerImageUrl').value = banner.image_url;
      var preview = document.getElementById('bannerImagePreview');
      preview.src = imageUrl(banner.image_url);
      preview.style.display = 'block';
    } else {
      document.getElementById('bannerImageUrl').value = '';
      document.getElementById('bannerImagePreview').style.display = 'none';
    }
  } else {
    document.getElementById('bannerForm').reset();
    document.getElementById('bannerId').value = '';
    document.getElementById('bannerImageUrl').value = '';
    document.getElementById('bannerImagePreview').style.display = 'none';
    document.getElementById('bannerActive').checked = true;
    document.getElementById('bannerImageInput').required = true;
  }
}

function closeDrawer() {
  document.getElementById('drawerOverlay').classList.remove('active');
  document.getElementById('drawer').classList.remove('active');
}

/* --- Image upload --- */
document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('bannerImageInput').addEventListener('change', async function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var formData = new FormData();
    formData.append('image', file);
    try {
      var result = await apiRequest('POST', '/api/uploads', formData, true);
      document.getElementById('bannerImageUrl').value = result.image_url;
      var preview = document.getElementById('bannerImagePreview');
      preview.src = imageUrl(result.image_url);
      preview.style.display = 'block';
    } catch (err) {
      showToast(err.message || 'Erro ao fazer upload da imagem.', 'error');
    }
  });
});

/* --- Form submit --- */
document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('bannerForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var id = document.getElementById('bannerId').value;
    var payload = {
      title: document.getElementById('bannerTitle').value.trim(),
      subtitle: document.getElementById('bannerSubtitle').value.trim(),
      link: document.getElementById('bannerLink').value.trim(),
      link_text: document.getElementById('bannerLinkText').value.trim(),
      image_url: document.getElementById('bannerImageUrl').value,
      active: document.getElementById('bannerActive').checked
    };

    if (!payload.title || !payload.image_url) {
      showToast('Preencha o título e faça upload da imagem.', 'error');
      return;
    }

    var btn = document.getElementById('btnSaveBanner');
    btn.textContent = 'Salvando...';
    btn.disabled = true;

    try {
      if (id) {
        await apiRequest('PUT', '/api/banners/' + id, payload);
        showToast('Banner atualizado!');
      } else {
        await apiRequest('POST', '/api/banners', payload);
        showToast('Banner criado!');
      }
      closeDrawer();
      await loadBanners();
    } catch (err) {
      showToast('Erro ao salvar banner.', 'error');
    } finally {
      btn.textContent = 'Salvar';
      btn.disabled = false;
    }
  });
});

/* --- Delete --- */
window.confirmDelete = function (id) {
  deleteTargetId = id;
  var b = allBanners.find(function (b) { return b.id === id; });
  document.getElementById('confirmMessage').textContent = 'Excluir banner "' + (b ? b.title : '') + '"?';
  document.getElementById('confirmOverlay').classList.add('active');
  document.getElementById('confirmModal').classList.add('active');
};

window.editBanner = function (id) {
  var b = allBanners.find(function (b) { return b.id === id; });
  if (b) openDrawer(b);
};

/* --- Event listeners --- */
document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('btnNovoBanner').addEventListener('click', function () { openDrawer(null); });

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
      await apiRequest('DELETE', '/api/banners/' + deleteTargetId);
      showToast('Banner excluído!');
      document.getElementById('confirmOverlay').classList.remove('active');
      document.getElementById('confirmModal').classList.remove('active');
      await loadBanners();
    } catch (err) {
      showToast('Erro ao excluir banner.', 'error');
    }
    deleteTargetId = null;
  });

  loadBanners();
});
