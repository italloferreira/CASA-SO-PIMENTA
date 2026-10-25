function formatPrice(val) {
  return Number(val).toFixed(2).replace('.', ',');
}

var escH = window.escapeHtml || function (s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;') : ''; };

function precoVenda(prod) {
  return prod.compare_price || prod.price;
}

// Nome diferente de window.estaDisponivel (carrinho.js), que sobrescreveria esta função
function produtoDisponivel(prod) {
  return !!prod.stock && prod.is_active !== 0;
}

function renderProductCard(prod) {
  var imgSrc = imgUrl(prod.image_url);
  var venda = precoVenda(prod);
  var precoHtml = prod.compare_price
    ? '<p style="text-decoration:line-through;color:#999;font-size:14px;">R$ ' + formatPrice(prod.price) + '</p><h3 style="color:#c53b22;">R$ ' + formatPrice(venda) + '</h3>'
    : '<p>R$</p><h3>' + formatPrice(venda) + '</h3>';

  var disponivel = produtoDisponivel(prod);

  return '<div class="cartao' + (disponivel ? '' : ' indisponivel') + '"' + (disponivel ? ' data-href="/site/pages/produtos/detalhe/index.html?id=' + prod.id + '"' : '') + '>' +
    (disponivel ? '' : '<div class="overlay-indisponivel"><span>Indisponível</span></div>') +
    '<img class="cartao-img" src="' + imgSrc + '" alt="' + escH(prod.name) + '" loading="lazy" decoding="async">' +
    '<h1 class="cartao-h1">' + (disponivel ? '<a class="cartao-link" href="/site/pages/produtos/detalhe/index.html?id=' + prod.id + '">' + escH(prod.name) + '</a>' : escH(prod.name)) + '</h1>' +
    '<div class="cartao-valor">' + precoHtml + '</div>' +
    '<div class="conteiner-botões-kit">' +
      '<button class="add-carrinho-botao"' + (disponivel ? ' data-product-id="' + prod.id + '" data-product-name="' + escH(prod.name) + '" data-product-price="' + venda + '" data-product-img="' + imgSrc + '" data-product-type="produto"' : ' disabled') + '><img src="/site/imgs/icones/carrinho.png" alt="Adicionar ao carrinho"></button>' +
    '</div>' +
    '</div>';
}

function carregarDados(chave, url, callback) {
  var cacheStr = localStorage.getItem(chave);
  var tempoStr = localStorage.getItem(chave + '_tempo');
  if (cacheStr && tempoStr && (Date.now() - Number(tempoStr) < 5 * 60 * 1000)) {
    callback(JSON.parse(cacheStr));
    return;
  }
  fetch(url)
    .then(function (r) {
      // resposta de erro não vai para o cache: cairia no fallback por 5 minutos
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (dados) {
      localStorage.setItem(chave, JSON.stringify(dados));
      localStorage.setItem(chave + '_tempo', String(Date.now()));
      callback(dados);
    })
    .catch(function () { callback(null); });
}

// renderFn também recebe null em caso de erro, para trocar o skeleton pelo fallback
function observarSecao(el, chave, url, renderFn) {
  if (!el) return;
  carregarDados(chave, url, renderFn);
}

document.addEventListener('DOMContentLoaded', function () {

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

  /* ===== CARROSSEL ===== */

  const slidesContainer = document.getElementById('slides');
  const btnAnterior = document.getElementById('anterior');
  const btnProximo = document.getElementById('proximo');

  if (slidesContainer && btnAnterior && btnProximo) {
    let slideAtual = 0;
    let totalSlides = 0;

    function atualizarCarrossel() {
      slidesContainer.style.transform = 'translateX(-' + (slideAtual * 100) + '%)';
    }

    carregarDados('home_banners', (window.API_BASE_URL || 'http://localhost:3333') + '/api/banners', function (banners) {
      if (!banners || banners.length === 0) {
        slidesContainer.innerHTML = '<div class="slide"><p style="padding:2rem;text-align:center;">Em breve</p></div>';
        totalSlides = 1;
        atualizarCarrossel();
        return;
      }

      // atribuição (e não +=) para substituir o skeleton do HTML
      slidesContainer.innerHTML = banners.map(function (banner, index) {
        return '<div class="slide"><img src="' + imgUrl(banner.image_url) + '" alt="' + escH(banner.title || 'Slide ' + (index + 1)) + '" decoding="async"></div>';
      }).join('');

      totalSlides = banners.length;
      atualizarCarrossel();
    });

    btnProximo.addEventListener('click', function () {
      if (totalSlides === 0) return;
      slideAtual++;
      if (slideAtual >= totalSlides) slideAtual = 0;
      atualizarCarrossel();
      resetarAutoPlay();
    });

    btnAnterior.addEventListener('click', function () {
      if (totalSlides === 0) return;
      slideAtual--;
      if (slideAtual < 0) slideAtual = totalSlides - 1;
      atualizarCarrossel();
      resetarAutoPlay();
    });

    var autoPlayInterval = null;

    function iniciarAutoPlay() {
      if (autoPlayInterval) clearInterval(autoPlayInterval);
      autoPlayInterval = setInterval(function () {
        if (totalSlides <= 1) return;
        slideAtual++;
        if (slideAtual >= totalSlides) slideAtual = 0;
        atualizarCarrossel();
      }, 5000);
    }

    function resetarAutoPlay() {
      iniciarAutoPlay();
    }

    var slidesWrapper = slidesContainer.parentElement;
    if (slidesWrapper) {
      slidesWrapper.addEventListener('mouseenter', function () {
        if (autoPlayInterval) clearInterval(autoPlayInterval);
      });
      slidesWrapper.addEventListener('mouseleave', function () {
        iniciarAutoPlay();
      });

      // arrastar com o dedo troca de slide; gesto mais vertical que horizontal é rolagem da página
      var toqueX = null;
      var toqueY = null;

      slidesWrapper.addEventListener('touchstart', function (e) {
        toqueX = e.touches[0].clientX;
        toqueY = e.touches[0].clientY;
      }, { passive: true });

      slidesWrapper.addEventListener('touchend', function (e) {
        if (toqueX === null) return;
        var dx = e.changedTouches[0].clientX - toqueX;
        var dy = e.changedTouches[0].clientY - toqueY;
        toqueX = null;
        if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
        (dx < 0 ? btnProximo : btnAnterior).click();
      }, { passive: true });
    }

    iniciarAutoPlay();
  }

  /* ===== PRODUTOS EM DESTAQUE (LAZY) ===== */

  var destaquesWrapper = document.querySelector('.destaques-section');
  var destaquesSection = document.getElementById('destaques-section');

  function renderizarDestaques(produtos) {
    if (!produtos || produtos.length === 0) {
      var section = document.querySelector('.destaques-section');
      if (section) section.style.display = 'none';
      return;
    }
    destaquesSection.innerHTML = produtos.map(renderProductCard).join('');
  }

  function renderizarDestaquesWrapper(dados) {
    if (dados && dados.products) renderizarDestaques(dados.products);
    else renderizarDestaques(dados);
  }

  if (destaquesWrapper && destaquesSection) {
    var observerDestaques = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          observerDestaques.disconnect();
          observarSecao(destaquesSection, 'home_destaques', (window.API_BASE_URL || 'http://localhost:3333') + '/api/products?featured=true', renderizarDestaquesWrapper);
        }
      });
    }, { rootMargin: '200px' });
    observerDestaques.observe(destaquesWrapper);
  }

  /* ===== KITS (LAZY) ===== */

  var cartoesSection = document.getElementById('cartoes-section');
  var kitsWrapper = cartoesSection ? cartoesSection.parentElement : null;

  function renderizarKits(kits) {
    if (!kits || kits.length === 0) {
      cartoesSection.innerHTML = '<p class="fallback-msg">Produtos em breve</p>';
      return;
    }

    var html = '';
    kits.forEach(function (kit) {
      const valorFormatado = Number(kit.price).toFixed(2).replace('.', ',');
      const imgSrc = imgUrl(kit.image_url);

      var produtosHtml = '';
      if (kit.items && kit.items.length > 0) {
        produtosHtml = '<div class="cartao-produtos"><h1>Ingredientes</h1><ul>' +
          kit.items.map(function (item) { return '<li>' + escH(item.custom_name || 'Item') + '</li>'; }).join('') +
          '</ul></div>';
      }

      html += '<div class="cartao" data-href="/site/pages/kits/detalhe/index.html?id=' + kit.id + '">' +
        '<img class="cartao-img" src="' + imgSrc + '" alt="' + escH(kit.name) + '" loading="lazy" decoding="async">' +
        '<h1 class="cartao-h1"><a class="cartao-link" href="/site/pages/kits/detalhe/index.html?id=' + kit.id + '">' + escH(kit.name) + '</a></h1>' +
        '<div class="cartao-valor"><p>R$</p><h3>' + valorFormatado + '</h3></div>' +
        produtosHtml +
        '<div class = "conteiner-botões-kit">' +
          '<button class="add-carrinho-botao" data-product-id="' + kit.id + '" data-product-name="' + escH(kit.name) + '" data-product-price="' + kit.price + '" data-product-img="' + imgSrc + '" data-product-type="kit"><img src="/site/imgs/icones/carrinho.png" alt="Adicionar ao carrinho"></button>' +
        '</div>' +
        '</div>';
    });
    cartoesSection.innerHTML = html;
  }

  if (kitsWrapper && cartoesSection) {
    var observerKits = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          observerKits.disconnect();
          observarSecao(cartoesSection, 'home_kits', (window.API_BASE_URL || 'http://localhost:3333') + '/api/kits?active=true', renderizarKits);
        }
      });
    }, { rootMargin: '200px' });
    observerKits.observe(kitsWrapper);
  }

});
