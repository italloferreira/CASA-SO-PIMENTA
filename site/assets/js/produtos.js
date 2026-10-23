document.addEventListener('DOMContentLoaded', function () {
  const produtosSection = document.querySelector('.produtos-section');
  if (!produtosSection) return;

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.add-carrinho-botao');
    if (btn) {
      if (btn.disabled) return;
      var data = btn.dataset;
      addCarrinho({
        id: data.productId,
        nome: data.productName,
        valor: data.productPrice,
        img: data.productImg,
        tipo: data.productType
      });
      return;
    }

    // Clique em qualquer outra parte do card abre a página de detalhes
    var card = e.target.closest('.cartao[data-href]');
    if (card) window.location.href = card.dataset.href;
  });

  const categoria = produtosSection.dataset.categoria;
  const API_BASE = window.API_BASE_URL || 'http://localhost:3333';

  var todosProdutos = [];
  var total = 0;
  var loading = false;
  var allLoaded = false;
  var sentinel = null;
  var observer = null;
  var termoAtual = '';
  var buscaId = 0;

  function estaDisponivel(produto) {
    return !!produto.stock && produto.is_active !== 0;
  }

  function cartaoHtml(produto) {
    var venda = produto.compare_price || produto.price;
    var valorFormatado = Number(venda).toFixed(2).replace('.', ',');
    const imgSrc = imgUrl(produto.image_url);
    const precoHtml = produto.compare_price
      ? '<span style="text-decoration:line-through;color:#999;font-size:12px;">R$ ' + Number(produto.price).toFixed(2).replace('.', ',') + '</span><br><strong style="color:#c53b22;">R$ ' + valorFormatado + '</strong>'
      : 'R$ ' + valorFormatado;

    var disponivel = estaDisponivel(produto);

    var ehGranel = window.CATEGORIAS_GRANEL_100G && window.CATEGORIAS_GRANEL_100G.indexOf(produto.category_slug) !== -1;

    return '<div class="cartao' + (disponivel ? '' : ' indisponivel') + '"' + (disponivel ? ' data-href="/site/pages/produtos/detalhe/index.html?id=' + produto.id + '&categoria=' + categoria + '"' : '') + '>' +
      (disponivel ? '' : '<div class="overlay-indisponivel"><span>Indisponível</span></div>') +
      '<img src="' + imgSrc + '" alt="' + (window.escapeHtml ? window.escapeHtml(produto.name) : produto.name) + '" loading="lazy" decoding="async">' +
      '<h3>' + (disponivel ? '<a class="cartao-link" href="/site/pages/produtos/detalhe/index.html?id=' + produto.id + '">' + (window.escapeHtml ? window.escapeHtml(produto.name) : produto.name) + '</a>' : (window.escapeHtml ? window.escapeHtml(produto.name) : produto.name)) + '</h3>' +
      (ehGranel ? '<p class="unidade-de-medida">100g</p>' : '') +
      '<p>' + precoHtml + '</p>' +
      '<div>' +
        '<button class="add-carrinho-botao"' + (disponivel ? ' data-product-id="' + produto.id + '" data-product-name="' + (window.escapeHtml ? window.escapeHtml(produto.name) : produto.name) + '" data-product-price="' + venda + '" data-product-img="' + imgSrc + '" data-product-type="produto" data-product-categoria="' + categoria + '"' : ' disabled') + '>' +
          '<img src="/site/imgs/icones/carrinho.png" alt="Adicionar ao carrinho">' +
        '</button>' +
      '</div>' +
    '</div>';
  }

  function atualizarSentinel() {
    if (sentinel) sentinel.remove();
    if (observer) observer.disconnect();

    // durante uma pesquisa a lista mostrada já é o resultado completo
    if (allLoaded || termoAtual) return;

    sentinel = document.createElement('div');
    sentinel.className = 'sentinel';
    sentinel.textContent = 'Carregando mais...';
    sentinel.style.cssText = 'text-align:center;padding:20px;color:#999;';
    produtosSection.appendChild(sentinel);

    observer = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting && !loading && !allLoaded) {
        carregarPagina();
      }
    }, { rootMargin: '300px' });
    observer.observe(sentinel);
  }

  function renderizarProdutos(produtos) {
    produtosSection.innerHTML = '';

    if (produtos.length === 0) {
      produtosSection.innerHTML = '<p>Nenhum produto encontrado.</p>';
      return;
    }

    produtos.forEach(function (p) {
      produtosSection.innerHTML += cartaoHtml(p);
    });
  }

  function carregarPagina() {
    if (loading || allLoaded) return;
    loading = true;

    if (todosProdutos.length === 0) {
      produtosSection.innerHTML = '<p>Carregando produtos...</p>';
    }

    fetch(API_BASE + '/api/products?category=' + encodeURIComponent(categoria) + '&limit=20&offset=' + todosProdutos.length)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        todosProdutos = todosProdutos.concat(data.products);
        total = data.total;
        allLoaded = todosProdutos.length >= total;
        loading = false;

        // não sobrescreve o resultado de uma pesquisa em andamento
        if (!termoAtual) renderizarProdutos(todosProdutos);
        atualizarSentinel();
      })
      .catch(function () {
        if (todosProdutos.length === 0 && !termoAtual) {
          produtosSection.innerHTML = '<p>Não foi possível carregar os produtos.</p>';
        }
        loading = false;
        atualizarSentinel();
      });
  }

  function normalizar(texto) {
    return (texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function filtrarPorNome(produtos, termo) {
    var busca = normalizar(termo);
    return produtos.filter(function (p) {
      return normalizar(p.name).indexOf(busca) !== -1;
    });
  }

  function filterProducts(term) {
    termoAtual = (term || '').trim();
    var id = ++buscaId;

    if (!termoAtual) {
      renderizarProdutos(todosProdutos);
      atualizarSentinel();
      return;
    }

    var locais = filtrarPorNome(todosProdutos, termoAtual);
    atualizarSentinel();

    // categoria inteira já carregada: o filtro local é completo
    if (allLoaded) {
      renderizarProdutos(locais);
      return;
    }

    if (locais.length > 0) {
      renderizarProdutos(locais);
    } else {
      produtosSection.innerHTML = '<p>Buscando...</p>';
    }

    // senão, busca no servidor os produtos desta categoria que ainda não foram carregados
    fetch(API_BASE + '/api/products/search?q=' + encodeURIComponent(termoAtual) + '&category=' + encodeURIComponent(categoria))
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (results) {
        if (id !== buscaId) return; // usuário já digitou outra coisa
        renderizarProdutos(results);
      })
      .catch(function () {
        if (id !== buscaId) return;
        renderizarProdutos(locais);
      });
  }

  var inputPesquisa = document.querySelector('.pesquisa');
  if (inputPesquisa) {
    inputPesquisa.addEventListener('input', function () {
      filterProducts(this.value);
    });
  }

  carregarPagina();
});
