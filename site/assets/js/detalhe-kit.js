document.addEventListener('DOMContentLoaded', function () {
  var escHtml = window.escapeHtml || function (s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;') : ''; };
  const params = new URLSearchParams(window.location.search);
  const kitId = params.get('id');

  const container = document.getElementById('produto-detalhe');

  if (!kitId) {
    container.innerHTML = '<p class="erro-produto">Kit não encontrado.</p>';
    return;
  }

  function renderizarKit(kit) {
    const valorFormatado = Number(kit.price).toFixed(2).replace('.', ',');
    const imgSrc = imgUrl(kit.image_url);

    if (window.aplicarSeoItem) {
      window.aplicarSeoItem({
        tipo: 'kit',
        id: kit.id,
        nome: kit.name,
        descricao: kit.description,
        preco: kit.price,
        estoque: !!kit.stock,
        imagens: [kit.image_url],
        categoria: 'Kits'
      });
    } else {
      document.title = kit.name + ' | Casa Só Pimenta';
    }

    let itensHtml = '';
    if (kit.items && kit.items.length > 0) {
      itensHtml = '<div class="produto-ingredientes"><h3>Itens do Kit</h3><ul>' +
        kit.items.map(function (item) {
          return '<li>' + escHtml(item.custom_name || 'Item') + (item.quantity ? ' (' + item.quantity + escHtml(item.unit || '') + ')' : '') + '</li>';
        }).join('') +
        '</ul></div>';
    }

    container.innerHTML = `
      <div class="produto-detalhe-card">
        <div class="produto-detalhe-img">
          <img src="${imgSrc}" alt="${escHtml(kit.name)}" decoding="async">
        </div>

        <div class="produto-detalhe-info">
          <span class="produto-categoria">Kit</span>
          <h1>${escHtml(kit.name)}</h1>

          <p class="produto-preco">R$ ${valorFormatado}</p>

          <div class="produto-estoque">
            <h3>Estoque</h3>
            <p class="${kit.stock ? 'estoque-disponivel' : 'estoque-indisponivel'}">${kit.stock ? 'Disponível' : 'Indisponível'}</p>
          </div>

          <div class="produto-descricao">
            <h3>Descrição</h3>
            <p>${escHtml(kit.description || 'Kit natural de alta qualidade, selecionado com cuidado pela Casa Só Pimenta.')}</p>
          </div>

          ${itensHtml}

          <div class="produto-acoes">
            <div class="produto-quantidade">
              <button onclick="decrementarQtd()">−</button>
              <span id="qtdSelecionada">1</span>
              <button onclick="incrementarQtd()">+</button>
            </div>

            <button class="btn-add-carrinho" onclick="adicionarAoCarrinhoDetalhe()" ${!kit.stock ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
              <img src="/site/imgs/icones/carrinho.png" alt="Carrinho">
              ${kit.stock ? 'Adicionar ao carrinho' : 'Indisponível'}
            </button>
          </div>

          <a href="javascript:history.back()" class="btn-voltar">← Voltar</a>
        </div>
      </div>
    `;

    window._produtoAtual = {
      id: kit.id,
      nome: kit.name,
      valor: kit.price,
      img: imgSrc,
      tipo: 'kit',
      estoque: !!kit.stock
    };
  }

  const chaveCache = 'kit_' + kitId + '_cache';
  const chaveTempo = 'kit_' + kitId + '_timestamp';
  const tempoAgora = Date.now();
  const tempoValidade = 5 * 60 * 1000;

  const cacheSalvo = localStorage.getItem(chaveCache);
  const tempoSalvo = localStorage.getItem(chaveTempo);

  if (cacheSalvo && tempoSalvo && (tempoAgora - Number(tempoSalvo) < tempoValidade)) {
    renderizarKit(JSON.parse(cacheSalvo));
    return;
  }

  container.innerHTML = '<p class="carregando-produto">Carregando kit...</p>';

  fetch((window.API_BASE_URL || 'http://localhost:3333') + '/api/kits/' + kitId)
    .then(function (r) { return r.json(); })
    .then(function (kit) {
      localStorage.setItem(chaveCache, JSON.stringify(kit));
      localStorage.setItem(chaveTempo, String(tempoAgora));
      renderizarKit(kit);
    })
    .catch(function () {
      container.innerHTML = '<p class="erro-produto">Não foi possível carregar o kit.</p>';
    });
});
