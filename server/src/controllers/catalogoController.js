import crypto from 'crypto';
import { pool } from '../database/connection.js';
import { montarCatalogo, CATEGORIAS_CATALOGO } from '../utils/catalogo.js';

const SLUGS_PRODUTOS = CATEGORIAS_CATALOGO
  .map(function (c) { return c.slug; })
  .filter(function (slug) { return slug !== 'kits'; });

// GET /catalogo — catálogo para imprimir/salvar em PDF, montado na hora com os dados do banco
export async function getCatalogo(req, res) {
  try {
    const [produtos, kits, settings] = await Promise.all([
      // mesmo filtro da loja: só produto ativo (esgotado continua aparecendo, como no site)
      pool.query(`
        SELECT p.name, p.description, p.price, p.compare_price, c.slug AS category_slug
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = 1 AND c.slug = ANY($1::text[])
      `, [SLUGS_PRODUTOS]),
      pool.query(`
        SELECT k.name, k.description, k.price,
          (SELECT COUNT(*) FROM kit_items ki WHERE ki.kit_id = k.id) AS total_itens
        FROM kits k
        WHERE k.is_active = 1
      `),
      pool.query(`SELECT key, value FROM settings WHERE key IN ('contact_phone', 'social_instagram')`)
    ]);

    const config = {};
    settings.rows.forEach(function (row) { config[row.key] = row.value; });

    // a página tem um script inline (botão "Baixar PDF"); a CSP libera só ele, pelo nonce
    const nonce = crypto.randomBytes(16).toString('base64');
    res.set('Content-Security-Policy', [
      "default-src 'none'",
      "style-src 'unsafe-inline' https://fonts.googleapis.com",
      'font-src https://fonts.gstatic.com',
      "img-src 'self' data:",
      "script-src 'nonce-" + nonce + "'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'self'"
    ].join('; '));
    res.set('Content-Type', 'text/html; charset=utf-8');
    // sem cache: preço alterado no admin aparece ao recarregar
    res.set('Cache-Control', 'no-cache');

    res.send(montarCatalogo({
      produtos: produtos.rows,
      kits: kits.rows,
      settings: config,
      nonce: nonce
    }));
  } catch (err) {
    console.error('Catálogo: erro ao montar a página:', err.message);
    res.status(500).set('Content-Type', 'text/html; charset=utf-8')
      .send('<!DOCTYPE html><html lang="pt-BR"><meta charset="UTF-8"><title>Catálogo indisponível</title>' +
        '<p style="font-family:sans-serif;padding:40px">Não foi possível carregar o catálogo agora. Tente de novo em alguns instantes.</p></html>');
  }
}
