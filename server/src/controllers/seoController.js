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
