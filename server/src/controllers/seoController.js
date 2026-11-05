import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../database/connection.js';

const SITE_URL = (process.env.SITE_URL || 'https://www.casasopimenta.com.br').replace(/\/$/, '');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.resolve(__dirname, '../../../site/pages');

// páginas fora do Google (privadas, de fluxo, redirecionamentos ou montadas por id)
const EXCLUDED = /^(admin|checkout|conta|login|pedidos|404|produtos\/pimentas|produtos\/detalhe|kits\/detalhe)(\/|$)/;

function listStaticPages(dir, base = '') {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    console.error('Sitemap: não foi possível ler as páginas do site:', err.message);
    return [];
  }

  return entries.flatMap(function (entry) {
    const rel = base ? base + '/' + entry.name : entry.name;
    if (entry.isDirectory()) {
      return EXCLUDED.test(rel) ? [] : listStaticPages(path.join(dir, entry.name), rel);
    }
    return entry.name === 'index.html' && !EXCLUDED.test(rel) ? [rel] : [];
  });
}

function urlEntry(loc, lastmod, priority) {
  return '  <url>\n' +
    '    <loc>' + loc.replace(/&/g, '&amp;') + '</loc>\n' +
    (lastmod ? '    <lastmod>' + new Date(lastmod).toISOString().slice(0, 10) + '</lastmod>\n' : '') +
    '    <priority>' + priority + '</priority>\n' +
    '  </url>';
}

export async function getSitemap(req, res) {
  const urls = listStaticPages(pagesDir).map(function (rel) {
    const priority = rel === 'index.html' ? '1.0' : rel.startsWith('produtos/') ? '0.8' : '0.4';
    return urlEntry(SITE_URL + '/site/pages/' + rel, null, priority);
  });

  try {
    const products = await pool.query(`
      SELECT id, updated_at FROM products WHERE is_active = 1 ORDER BY id
    `);
    products.rows.forEach(function (p) {
      urls.push(urlEntry(SITE_URL + '/site/pages/produtos/detalhe/index.html?id=' + p.id, p.updated_at, '0.7'));
    });

    const kits = await pool.query(`
      SELECT id, updated_at FROM kits WHERE is_active = 1 ORDER BY id
    `);
    kits.rows.forEach(function (k) {
      urls.push(urlEntry(SITE_URL + '/site/pages/kits/detalhe/index.html?id=' + k.id, k.updated_at, '0.7'));
    });
  } catch (err) {
    console.error('Sitemap: erro ao buscar produtos/kits:', err.message);
  }

  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') + '\n' +
    '</urlset>\n'
  );
}

/* ── Feed de produtos do Google Merchant Center (aba Shopping / listagens gratuitas) ── */

const BRAND = 'Casa Só Pimenta';
const FEED_MAX_TITLE = 150;
const FEED_MAX_DESCRIPTION = 5000;

// mesma lista de window.CATEGORIAS_GRANEL_100G (site/assets/js/config.js); o teste confere as duas
export const CATEGORIAS_GRANEL_100G = ['farinhas', 'castanhas', 'chas', 'sementes', 'liofilizados', 'aveias', 'desidratados', 'cocos', 'graos', 'temperos', 'farofas', 'produtos-de-limpeza', 'sal', 'tira-gostos', 'granjeados', 'acucares'];

function escXml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textoLimpo(texto, limite) {
  texto = String(texto || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return texto.length <= limite ? texto : texto.slice(0, limite - 1).replace(/\s+\S*$/, '') + '…';
}

function imagemAbsoluta(url) {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  return url.startsWith('/') ? SITE_URL + url : null;
}

function precoBRL(valor) {
  return Number(valor).toFixed(2) + ' BRL';
}

// item: { id, nome, descricao, link, preco, precoPromo, estoque, imagens[], categoria }
function feedItem(item) {
  const imagens = item.imagens.map(imagemAbsoluta).filter(Boolean);
  const campos = [
    ['g:id', item.id],
    ['g:title', textoLimpo(item.nome, FEED_MAX_TITLE)],
    ['g:description', textoLimpo(item.descricao, FEED_MAX_DESCRIPTION) || textoLimpo(item.nome, FEED_MAX_TITLE)],
    ['g:link', item.link],
    ['g:image_link', imagens[0]]
  ];
  imagens.slice(1, 11).forEach(function (url) { campos.push(['g:additional_image_link', url]); });
  campos.push(
    ['g:availability', item.estoque ? 'in_stock' : 'out_of_stock'],
    ['g:condition', 'new'],
    ['g:brand', BRAND],
    ['g:identifier_exists', 'no']
  );

  // o site cobra compare_price quando existe (preço de/por); só vira sale_price se for desconto de verdade
  const preco = Number(item.preco);
  const promo = item.precoPromo != null ? Number(item.precoPromo) : null;
  if (promo !== null && promo < preco) {
    campos.push(['g:price', precoBRL(preco)], ['g:sale_price', precoBRL(promo)]);
  } else {
    campos.push(['g:price', precoBRL(promo !== null ? promo : preco)]);
  }

  if (item.categoria) campos.push(['g:product_type', item.categoria]);

  return '    <item>\n' +
    campos.map(function (c) { return '      <' + c[0] + '>' + escXml(c[1]) + '</' + c[0] + '>'; }).join('\n') + '\n' +
    '    </item>';
}

export async function getMerchantFeed(req, res) {
  try {
    const products = await pool.query(`
      SELECT
        p.id, p.name, p.description, p.price, p.compare_price, p.stock, p.image_url,
        c.name AS category_name,
        c.slug AS category_slug,
        COALESCE(
          (SELECT json_agg(pi.image_url ORDER BY pi.position ASC, pi.id ASC)
           FROM product_images pi
           WHERE pi.product_id = p.id),
          '[]'
        ) AS images
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = 1
      ORDER BY p.id
    `);

    const kits = await pool.query(`
      SELECT id, name, description, price, stock, image_url
      FROM kits
      WHERE is_active = 1
      ORDER BY id
    `);

    const itens = products.rows.map(function (p) {
      const granel = CATEGORIAS_GRANEL_100G.indexOf(p.category_slug) !== -1;
      return {
        // mesmo sku do JSON-LD da página (seo.js), para o Google casar o item com a página
        id: 'P-' + p.id,
        nome: granel ? p.name + ' - 100g' : p.name,
        descricao: p.description,
        link: SITE_URL + '/site/pages/produtos/detalhe/index.html?id=' + p.id,
        preco: p.price,
        precoPromo: p.compare_price,
        estoque: p.stock,
        imagens: p.images.length ? p.images : [p.image_url],
        categoria: p.category_name
      };
    }).concat(kits.rows.map(function (k) {
      return {
        id: 'KIT-' + k.id,
        nome: k.name,
        descricao: k.description,
        link: SITE_URL + '/site/pages/kits/detalhe/index.html?id=' + k.id,
        preco: k.price,
        precoPromo: null,
        estoque: k.stock,
        imagens: [k.image_url],
        categoria: 'Kits'
      };
    })).filter(function (item) {
      // o Google reprova item sem foto; melhor ficar de fora do que gerar erro na conta
      return item.imagens.some(imagemAbsoluta);
    });

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n' +
      '  <channel>\n' +
      '    <title>' + escXml(BRAND) + '</title>\n' +
      '    <link>' + escXml(SITE_URL) + '</link>\n' +
      '    <description>Produtos da ' + escXml(BRAND) + '</description>\n' +
      itens.map(feedItem).join('\n') + '\n' +
      '  </channel>\n' +
      '</rss>\n'
    );
  } catch (err) {
    console.error('Feed Merchant: erro ao buscar produtos/kits:', err.message);
    res.status(500).send('Erro ao gerar o feed.');
  }
}
