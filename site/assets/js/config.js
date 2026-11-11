/* config.js — URL base da API */

/* categorias vendidas a granel — fonte unica usada por produtos.js e detalhe.js */
window.CATEGORIAS_GRANEL_100G = ['farinhas', 'castanhas', 'chas', 'sementes', 'liofilizados', 'aveias', 'desidratados', 'cocos', 'graos', 'temperos', 'farofas', 'produtos-de-limpeza', 'sal', 'tira-gostos', 'granjeados', 'acucares'];

/* pagina de cada categoria (slug -> URL), conferida por teste contra o data-categoria das paginas */
window.PAGINAS_CATEGORIA = {
  'acucares': '/site/pages/produtos/outro/acucares/index.html',
  'aveias': '/site/pages/produtos/produtosNaturais/aveias/index.html',
  'azeites': '/site/pages/produtos/azeites/index.html',
  'castanhas': '/site/pages/produtos/produtosNaturais/castanhas/index.html',
  'chas': '/site/pages/produtos/produtosNaturais/chas/index.html',
  'cocos': '/site/pages/produtos/produtosNaturais/cocos/index.html',
  'conservas': '/site/pages/produtos/conservas/index.html',
  'desidratados': '/site/pages/produtos/produtosNaturais/desidratados/index.html',
  'farinhas': '/site/pages/produtos/produtosNaturais/farinhas/index.html',
  'farofas': '/site/pages/produtos/farofas/index.html',
  'geleias': '/site/pages/produtos/geleias/index.html',
  'graos': '/site/pages/produtos/produtosNaturais/graos/index.html',
  'granjeados': '/site/pages/produtos/outro/granjeados/index.html',
  'kits': '/site/pages/produtos/kits/index.html',
  'liofilizados': '/site/pages/produtos/produtosNaturais/liofilizados/index.html',
  'mantegas': '/site/pages/produtos/mantegas/index.html',
  'mel': '/site/pages/produtos/mel/index.html',
  'molhos': '/site/pages/produtos/molhos/index.html',
  'outros': '/site/pages/produtos/outro/index.html',
  'pastosas': '/site/pages/produtos/pastosas/index.html',
  'pequi': '/site/pages/produtos/pequi/index.html',
  'produtos-de-limpeza': '/site/pages/produtos/produtosDeLimpeza/index.html',
  'sal': '/site/pages/produtos/sal/index.html',
  'sementes': '/site/pages/produtos/produtosNaturais/sementes/index.html',
  'temperos': '/site/pages/produtos/temperos/index.html',
  'tira-gostos': '/site/pages/produtos/tira-gostos/index.html',
  'vinagres': '/site/pages/produtos/vinagres/index.html'
};

/* marcas da secao "Aqui voce encontra" (home) e da pagina /site/pages/marcas/?marca=slug.
   nome = exatamente o que vem depois do " - " no titulo dos produtos (maiusculas/acentos nao importam).
   A home lista as mesmas marcas no HTML; um teste confere que as duas listas batem. */
window.MARCAS = [
  { slug: 'brasileirissimo', nome: 'Brasileiríssimo', logo: '/site/imgs/marcas/brasileirissimo.webp' },
  { slug: 'maria-da-fe', nome: 'Maria da Fé', logo: '/site/imgs/marcas/maria-da-fe.webp' },
  { slug: 'nativa-alimentos', nome: 'Nativa Alimentos', logo: '/site/imgs/marcas/nativa-alimentos.webp' },
  { slug: 'fogo-mineiro', nome: 'Fogo Mineiro', logo: '/site/imgs/marcas/fogo-mineiro.webp' },
  { slug: 'mendez', nome: 'Mendez', logo: '/site/imgs/marcas/mendez.webp' }
];

/* Troque a URL de producao antes do deploy */
var API_BASE_URL = (function () {
  var host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3333';
  if (host.endsWith('.lhr.life')) return window.location.origin;
  return 'https://casa-so-pimenta-api.onrender.com';
})();

function imgUrl(path) {
  if (!path) return '/site/imgs/logo.png';
  if (path.startsWith('http')) return path;
  return (window.API_BASE_URL || 'http://localhost:3333') + path;
}
