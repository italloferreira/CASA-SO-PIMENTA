/* marca.js — página /site/pages/marcas/index.html?marca=<slug>
   Lista todos os produtos ativos cuja marca (trecho depois do " - " no nome) é a da URL.
   As marcas válidas vêm de window.MARCAS (config.js). Card no mesmo formato de produtos.js. */

(function () {
  var SITE_URL = 'https://www.casasopimenta.com.br';
  var PAGINA = '/site/pages/marcas/index.html';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function normalizar(texto) {
    return (texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function marcaDaUrl() {
    var slug = new URLSearchParams(window.location.search).get('marca') || '';
    var marcas = window.MARCAS || [];
    for (var i = 0; i < marcas.length; i++) {
      if (marcas[i].slug === slug.trim().toLowerCase()) return marcas[i];
    }
    return null;
  }

  function setMeta(attr, nome, valor) {
    var el = document.head.querySelector('meta[' + attr + '="' + nome + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, nome);
      document.head.appendChild(el);
    }
    el.setAttribute('content', valor);
  }

  function aplicarSeo(marca) {
    var url = SITE_URL + PAGINA + '?marca=' + encodeURIComponent(marca.slug);
    var titulo = marca.nome + ' | Casa Só Pimenta';
    var descricao = 'Produtos da marca ' + marca.nome + ' na Casa Só Pimenta, do Mercado Central de BH. Compre online.';
    document.title = titulo;
    setMeta('name', 'description', descricao);
    setMeta('property', 'og:title', titulo);
    setMeta('property', 'og:description', descricao);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', SITE_URL + marca.logo);
    var canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);
  }

  function estaDisponivel(produto) {
    return !!produto.stock && produto.is_active !== 0;
  }

  function cartaoHtml(produto) {
    var venda = produto.compare_price || produto.price;
    var valorFormatado = Number(venda).toFixed(2).replace('.', ',');
    var imgSrc = imgUrl(produto.image_url);
    var nome = esc(produto.name);
    var categoria = produto.category_slug || '';
    var detalhe = '/site/pages/produtos/detalhe/index.html?id=' + produto.id;
    var precoHtml = produto.compare_price
      ? '<span style="text-decoration:line-through;color:#999;font-size:12px;">R$ ' + Number(produto.price).toFixed(2).replace('.', ',') + '</span><br><strong style="color:#c53b22;">R$ ' + valorFormatado + '</strong>'
      : 'R$ ' + valorFormatado;

    var disponivel = estaDisponivel(produto);
    var ehGranel = window.CATEGORIAS_GRANEL_100G && window.CATEGORIAS_GRANEL_100G.indexOf(categoria) !== -1;

    return '<div class="cartao' + (disponivel ? '' : ' indisponivel') + '"' + (disponivel ? ' data-href="' + detalhe + (categoria ? '&categoria=' + encodeURIComponent(categoria) : '') + '"' : '') + '>' +
      (disponivel ? '' : '<div class="overlay-indisponivel"><span>Indisponível</span></div>') +
      '<img src="' + imgSrc + '" alt="' + nome + '" loading="lazy" decoding="async">' +
      '<h3>' + (disponivel ? '<a class="cartao-link" href="' + detalhe + '">' + nome + '</a>' : nome) + '</h3>' +
      (ehGranel ? '<p class="unidade-de-medida">100g</p>' : '') +
      '<p>' + precoHtml + '</p>' +
      '<div>' +
        '<button class="add-carrinho-botao"' + (disponivel ? ' data-product-id="' + produto.id + '" data-product-name="' + nome + '" data-product-price="' + venda + '" data-product-img="' + imgSrc + '" data-product-type="produto" data-product-categoria="' + esc(categoria) + '"' : ' disabled') + '>' +
          '<img src="/site/imgs/icones/carrinho.png" alt="Adicionar ao carrinho">' +
        '</button>' +
      '</div>' +
    '</div>';
  }

  // spans em vez de div/p/h3: o .cartao do produtos.css estiliza esses elementos internos
  function skeletonCartoes(qtd, mensagem) {
    var html = '<span class="sr-only">' + mensagem + '</span>';
    for (var i = 0; i < qtd; i++) {
      html += '<div class="cartao cartao-skeleton" aria-hidden="true">' +
        '<span class="skeleton skeleton-img"></span>' +
        '<span class="skeleton skeleton-titulo"></span>' +
        '<span class="skeleton skeleton-preco"></span>' +
        '<span class="skeleton skeleton-botao"></span>' +
      '</div>';
    }
    return html;
  }

  function linksDasMarcas() {
    return (window.MARCAS || []).map(function (m) {
      return '<a href="' + PAGINA + '?marca=' + encodeURIComponent(m.slug) + '">' + esc(m.nome) + '</a>';
    }).join(' · ');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var section = document.querySelector('.produtos-section');
    if (!section) return;
    var titulo = document.getElementById('titulo-marca');
    var inputPesquisa = document.querySelector('.pesquisa');

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

      // clique em qualquer outra parte do card abre a página de detalhes
      var card = e.target.closest('.cartao[data-href]');
      if (card) window.location.href = card.dataset.href;
    });

    var marca = marcaDaUrl();

    if (!marca) {
      if (titulo) titulo.textContent = 'Marca não encontrada';
      if (inputPesquisa) inputPesquisa.style.display = 'none';
      setMeta('name', 'robots', 'noindex');
      section.innerHTML = '<p class="marca-mensagem">Não encontramos essa marca. Conheça as marcas que você encontra aqui: ' +
        linksDasMarcas() + '.</p>';
      return;
    }

    if (titulo) titulo.textContent = marca.nome;
    aplicarSeo(marca);

    var produtos = [];
    var carregado = false;

    function renderizar(lista) {
      if (lista.length === 0) {
        section.innerHTML = '<p class="marca-mensagem">' + (produtos.length === 0
          ? 'Em breve teremos produtos ' + esc(marca.nome) + ' por aqui.'
          : 'Nenhum produto encontrado.') + '</p>';
        return;
      }
      section.innerHTML = lista.map(cartaoHtml).join('');
    }

    function filtrar(termo) {
      var busca = normalizar((termo || '').trim());
      if (!busca) return produtos;
      return produtos.filter(function (p) {
        return normalizar(p.name).indexOf(busca) !== -1;
      });
    }

    if (inputPesquisa) {
      inputPesquisa.addEventListener('input', function () {
        if (carregado) renderizar(filtrar(this.value));
      });
    }

    section.innerHTML = skeletonCartoes(8, 'Carregando produtos...');

    var API_BASE = window.API_BASE_URL || 'http://localhost:3333';
    // marcas têm poucas dezenas de produtos: carrega todos de uma vez e a pesquisa filtra localmente
    fetch(API_BASE + '/api/products?brand=' + encodeURIComponent(marca.nome) + '&limit=1000')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        produtos = (data && data.products) || [];
        carregado = true;
        renderizar(filtrar(inputPesquisa ? inputPesquisa.value : ''));
      })
      .catch(function () {
        section.innerHTML = '<p class="marca-mensagem">Não foi possível carregar os produtos.</p>';
      });
  });
})();
