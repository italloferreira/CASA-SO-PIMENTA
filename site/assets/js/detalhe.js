/* detalhe.js — página de detalhe do produto */

var escHtml = window.escapeHtml || function (s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;') : ''; };

/* categorias vendidas a granel — fonte unica definida em config.js */
var CATEGORIAS_COM_MEDIDA_100G = window.CATEGORIAS_GRANEL_100G || [];

function badgeMedida(categoriaSlug) {
  return CATEGORIAS_COM_MEDIDA_100G.indexOf(categoriaSlug) !== -1 ? '<p class="unidade-de-medida">100g</p>' : '';
}

/* ── Produtos semelhantes: carregam em paralelo ao produto; a seção só aparece se houver resultado ── */

var SEMELHANTES_VALIDADE = 5 * 60 * 1000;

function precoFormatado(valor) {
  return 'R$ ' + Number(valor).toFixed(2).replace('.', ',');
}

// alt vazio: o nome do produto já está escrito no card
function cartaoSemelhante(p) {
  var venda = p.compare_price || p.price;
  return '<a class="semelhante-card" href="/site/pages/produtos/detalhe/index.html?id=' + encodeURIComponent(p.id) + '">' +
    '<img src="' + escHtml(imgUrl(p.image_url)) + '" alt="" loading="lazy" decoding="async">' +
    '<span class="semelhante-nome">' + escHtml(p.name) + '</span>' +
    '<span class="semelhante-preco">' + (p.compare_price ? '<s>' + precoFormatado(p.price) + '</s>' : '') + precoFormatado(venda) + '</span>' +
    badgeMedida(p.category_slug) +
  '</a>';
}

function skeletonSemelhantes(qtd) {
  var html = '';
  for (var i = 0; i < qtd; i++) {
    html += '<div class="semelhante-card semelhante-skeleton" aria-hidden="true">' +
      '<span class="skeleton skeleton-semelhante-img"></span>' +
      '<span class="skeleton skeleton-texto"></span>' +
      '<span class="skeleton skeleton-texto curto"></span>' +
    '</div>';
  }
  return html;
}

function carregarSemelhantes(produtoId) {
  var secao = document.getElementById('produtos-semelhantes');
  var lista = document.getElementById('semelhantesLista');
  var verTodos = document.getElementById('semelhantesVerTodos');
  if (!secao || !lista) return;

  function esconder() {
    secao.hidden = true;
    lista.innerHTML = '';
  }

  function renderizar(dados) {
    var produtos = (dados && Array.isArray(dados.products) ? dados.products : [])
      .filter(function (p) { return String(p.id) !== String(produtoId); });

    if (produtos.length === 0) {
      esconder();
      return;
    }

    lista.innerHTML = produtos.map(cartaoSemelhante).join('');

    var paginaCategoria = (window.PAGINAS_CATEGORIA || {})[dados.category_slug];
    if (verTodos) {
      verTodos.hidden = !(paginaCategoria && dados.category_name);
      if (!verTodos.hidden) {
        verTodos.href = paginaCategoria;
        verTodos.textContent = 'Ver todos em ' + dados.category_name + ' →';
      }
    }

    secao.hidden = false;
  }

  var chaveCache = 'semelhantes_v1_' + produtoId + '_cache';
  var chaveTempo = 'semelhantes_v1_' + produtoId + '_timestamp';

  // cache corrompido não pode impedir a página de carregar: só busca de novo
  try {
    var cacheSalvo = localStorage.getItem(chaveCache);
    var tempoSalvo = localStorage.getItem(chaveTempo);
    if (cacheSalvo && tempoSalvo && (Date.now() - Number(tempoSalvo) < SEMELHANTES_VALIDADE)) {
      renderizar(JSON.parse(cacheSalvo));
      return;
    }
  } catch (e) { /* segue para o fetch */ }

  lista.innerHTML = skeletonSemelhantes(4);
  secao.hidden = false;

  fetch((window.API_BASE_URL || 'http://localhost:3333') + '/api/products/' + encodeURIComponent(produtoId) + '/similar?limit=8')
    .then(function (r) {
      // erro ou API sem o endpoint (deploy antigo): a seção apenas não aparece
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (dados) {
      renderizar(dados);
      try {
        localStorage.setItem(chaveCache, JSON.stringify(dados));
        localStorage.setItem(chaveTempo, String(Date.now()));
      } catch (e) { /* sem espaço no localStorage: fica sem cache */ }
    })
    .catch(esconder);
}

document.addEventListener('DOMContentLoaded', function () {
  const params = new URLSearchParams(window.location.search);
  const produtoId = params.get('id');
  const categoria = params.get('categoria');

  const container = document.getElementById('produto-detalhe');

  if (!produtoId) {
    container.innerHTML = '<p class="erro-produto">Produto não encontrado.</p>';
    return;
  }

  carregarSemelhantes(produtoId);

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
            ${badgeMedida(produto.category_slug)}
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

          ${!produto.stock ? '<a href="#produtos-semelhantes" class="link-semelhantes">Ver opções semelhantes disponíveis ↓</a>' : ''}

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

  // até a resposta chegar, o container mostra o skeleton que já vem no HTML
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


