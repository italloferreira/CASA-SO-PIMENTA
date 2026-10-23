/* seo.js — metatags e dados estruturados das páginas montadas via JS (produto e kit) */

var SITE_URL = 'https://www.casasopimenta.com.br';

function setMeta(attr, nome, valor) {
  var el = document.head.querySelector('meta[' + attr + '="' + nome + '"]');
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, nome);
    document.head.appendChild(el);
  }
  el.setAttribute('content', valor);
}

function resumo(texto, limite) {
  texto = String(texto || '').replace(/\s+/g, ' ').trim();
  if (texto.length <= limite) return texto;
  return texto.slice(0, limite - 1).replace(/\s+\S*$/, '') + '…';
}

function urlAbsoluta(url) {
  if (!url) return SITE_URL + '/site/imgs/logo.png';
  if (url.startsWith('http')) return url;
  return (url.startsWith('/site/') ? SITE_URL : (window.API_BASE_URL || SITE_URL)) + url;
}

/* item: { tipo: 'produto' | 'kit', id, nome, descricao, preco, estoque, imagens[], categoria } */
window.aplicarSeoItem = function (item) {
  var caminho = item.tipo === 'kit' ? '/site/pages/kits/detalhe/index.html' : '/site/pages/produtos/detalhe/index.html';
  var url = SITE_URL + caminho + '?id=' + encodeURIComponent(item.id);
  var titulo = item.nome + ' | Casa Só Pimenta';
  var descricao = resumo(item.descricao, 155) ||
    resumo(item.nome + (item.categoria ? ' (' + item.categoria + ')' : '') + '. Compre online na Casa Só Pimenta, loja do Mercado Central de BH desde 2005.', 155);
  var imagens = (item.imagens || []).filter(Boolean).map(urlAbsoluta);
  if (!imagens.length) imagens = [urlAbsoluta(null)];

  document.title = titulo;
  setMeta('name', 'description', descricao);
  setMeta('property', 'og:type', 'product');
  setMeta('property', 'og:title', titulo);
  setMeta('property', 'og:description', descricao);
  setMeta('property', 'og:url', url);
  setMeta('property', 'og:image', imagens[0]);

  var canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = url;

  var dados = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.nome,
    description: descricao,
    image: imagens,
    sku: (item.tipo === 'kit' ? 'KIT-' : 'P-') + item.id,
    offers: {
      '@type': 'Offer',
      url: url,
      priceCurrency: 'BRL',
      price: Number(item.preco).toFixed(2),
      availability: item.estoque ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'Casa Só Pimenta' }
    }
  };
  if (item.categoria) dados.category = item.categoria;

  var script = document.getElementById('seo-jsonld');
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'seo-jsonld';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(dados);
};
