/* detalhe.js — página de detalhe do produto */

var escHtml = window.escapeHtml || function (s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;') : ''; };

/* categorias vendidas a granel — fonte unica definida em config.js */
var CATEGORIAS_COM_MEDIDA_100G = window.CATEGORIAS_GRANEL_100G || [];

document.addEventListener('DOMContentLoaded', function () {
  const params = new URLSearchParams(window.location.search);
  const produtoId = params.get('id');
  const categoria = params.get('categoria');

  const container = document.getElementById('produto-detalhe');

  if (!produtoId) {
    container.innerHTML = '<p class="erro-produto">Produto não encontrado.</p>';
    return;
  }

  function renderizarProduto(produto) {
    var venda = produto.compare_price || produto.price;
    const valorFormatado = Number(venda).toFixed(2).replace('.', ',');
    const imgSrc = imgUrl(produto.image_url);
    const imagens = (produto.images && produto.images.length) ? produto.images : [produto.image_url];

    if (window.aplicarSeoItem) {
      window.aplicarSeoItem({
        tipo: 'produto',
        id: produto.id,
        nome: produto.name,
        descricao: produto.description,
        preco: venda,
        estoque: !!produto.stock,
        imagens: imagens,
        categoria: produto.category_name
      });
    } else {
      document.title = produto.name + ' | Casa Só Pimenta';
    }

    const ingredientes = produto.ingredients
      ? produto.ingredients.split(',').map(function (i) { return i.trim(); })
      : [];

    container.innerHTML = `
      <div class="produto-detalhe-card">
        <div class="produto-galeria">
          <div class="produto-detalhe-img">
            <img id="produtoImagemPrincipal" src="${imgSrc}" alt="${escHtml(produto.name)}" decoding="async">
          </div>

          ${imagens.length > 1 ? `
          <div class="produto-galeria-miniaturas">
            ${imagens.map(function (url, i) {
              return '<button type="button" class="produto-miniatura' + (i === 0 ? ' ativa' : '') + '" data-img="' + i + '"><img src="' + imgUrl(url) + '" alt="' + escHtml(produto.name) + '" loading="lazy" decoding="async"></button>';
            }).join('')}
          </div>
          ` : ''}
        </div>

        <div class="produto-detalhe-info">
          <span class="produto-categoria">${escHtml(produto.category_name || categoria)}</span>
          <h1>${escHtml(produto.name)}</h1>

          <div class="div-preço-e-qual-unidade"> 
            ${produto.compare_price ? '<p class="produto-preco-antigo">R$ ' + Number(produto.price).toFixed(2).replace('.', ',') + '</p>' : ''}
            <p class="produto-preco">R$ ${valorFormatado}</p> 
            ${CATEGORIAS_COM_MEDIDA_100G.indexOf(produto.category_slug) !== -1 ? '<p class="unidade-de-medida">100g</p>' : ''}
          </div>

          <div class="produto-estoque">
            <h3>Estoque</h3>
            <p class="${produto.stock ? 'estoque-disponivel' : 'estoque-indisponivel'}">${produto.stock ? 'Disponível' : 'Indisponível'}</p>
          </div>

          <div class="produto-acoes">
            <div class="produto-quantidade">
              <button onclick="decrementarQtd()">−</button>
              <span id="qtdSelecionada">1</span>
              <button onclick="incrementarQtd()">+</button>
            </div>

            <button class="btn-add-carrinho" onclick="adicionarAoCarrinhoDetalhe()" ${!produto.stock ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
              <img src="/site/imgs/icones/carrinho.png" alt="Carrinho">
              ${produto.stock ? 'Adicionar ao carrinho' : 'Indisponível'}
            </button>
          </div>

          ${ingredientes.length > 0 ? `
          <div class="produto-ingredientes">
            <h3>Ingredientes</h3>
            <ul>
              ${ingredientes.map(function (ing) { return '<li>' + escHtml(ing) + '</li>'; }).join('')}
            </ul>
          </div>
          ` : ''}

          <div class="produto-descricao">
            <h3>Descrição</h3>
            <p>${escHtml(produto.description || 'Produto natural de alta qualidade, selecionado com cuidado pela Casa Só Pimenta.')}</p>
          </div>

          <a href="javascript:history.back()" class="btn-voltar">← Voltar</a>
        </div>
      </div>
    `;

    var miniaturas = container.querySelectorAll('.produto-miniatura');
    for (var m = 0; m < miniaturas.length; m++) {
      (function (btn, index) {
        btn.addEventListener('click', function () {
          var principal = document.getElementById('produtoImagemPrincipal');
          if (!principal) return;
          principal.src = imgUrl(imagens[index]);
          var ativas = container.querySelectorAll('.produto-miniatura.ativa');
          for (var k = 0; k < ativas.length; k++) ativas[k].classList.remove('ativa');
          btn.classList.add('ativa');
        });
      })(miniaturas[m], m);
    }

    window._produtoAtual = {
      id: produto.id,
      nome: produto.name,
      valor: produto.compare_price || produto.price,
      img: imgSrc,
      estoque: !!produto.stock
    };
  }

  const chaveCache = 'produto_v3_' + produtoId + '_cache';
  const chaveTempo = 'produto_v3_' + produtoId + '_timestamp';
  const tempoAgora = Date.now();
  const tempoValidade = 5 * 60 * 1000;

  const cacheSalvo = localStorage.getItem(chaveCache);
  const tempoSalvo = localStorage.getItem(chaveTempo);

  if (cacheSalvo && tempoSalvo && (tempoAgora - Number(tempoSalvo) < tempoValidade)) {
    renderizarProduto(JSON.parse(cacheSalvo));
    return;
  }

  container.innerHTML = '<p class="carregando-produto">Carregando produto...</p>';

  fetch((window.API_BASE_URL || 'http://localhost:3333') + '/api/products/' + produtoId)
    .then(function (r) { return r.json(); })
    .then(function (produto) {
      localStorage.setItem(chaveCache, JSON.stringify(produto));
      localStorage.setItem(chaveTempo, String(tempoAgora));
      renderizarProduto(produto);
    })
    .catch(function () {
      container.innerHTML = '<p class="erro-produto">Não foi possível carregar o produto.</p>';
    });
});

/* controle de quantidade */
window.incrementarQtd = function () {
  const el = document.getElementById('qtdSelecionada');
  el.textContent = Number(el.textContent) + 1;
};

window.decrementarQtd = function () {
  const el = document.getElementById('qtdSelecionada');
  const atual = Number(el.textContent);
  if (atual > 1) el.textContent = atual - 1;
};


