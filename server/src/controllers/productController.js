import { pool } from '../database/connection.js';
import { rankearSemelhantes } from '../utils/similarity.js';

export async function listProducts(req, res) {
  try {
    const { category, featured, limit, offset } = req.query;
    const isAdmin = req.user?.role === 'admin';

    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (category) {
      conditions.push(`categories.slug = $${paramIndex++}`);
      params.push(category);
    }

    if (featured === 'true') {
      conditions.push(`products.is_featured = 1`);
    }

    if (!isAdmin) {
      conditions.push(`products.is_active = 1`);
    }

    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    const limitVal = Math.min(Math.max(parseInt(limit) || 20, 1), 1000);
    const offsetVal = Math.max(parseInt(offset) || 0, 0);

    const orderClause = category
      ? ` ORDER BY translate(lower(products.name), 'áàâãäåéèêëíìîïóòôõöúùûüç', 'aaaaaaeeeeiiiiooooouuuuc') ASC`
      : ` ORDER BY products.created_at DESC`;

    const countResult = await pool.query(`
      SELECT COUNT(*) AS total
      FROM products
      LEFT JOIN categories ON categories.id = products.category_id
      ${whereClause}
    `, params);

    const total = parseInt(countResult.rows[0].total);

    const query = `
      SELECT
        products.*,
        categories.name AS category_name,
        categories.slug AS category_slug,
        COALESCE(
          (SELECT json_agg(pi.image_url ORDER BY pi.position ASC, pi.id ASC)
           FROM product_images pi
           WHERE pi.product_id = products.id),
          '[]'
        ) AS images
      FROM products
      LEFT JOIN categories ON categories.id = products.category_id
      ${whereClause}
      ${orderClause}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const result = await pool.query(query, [...params, limitVal, offsetVal]);
    res.json({ products: result.rows, total });
  } catch (err) {
    console.error('Erro ao listar produtos:', err);
    res.status(500).json({ message: 'Erro ao listar produtos.' });
  }
}

export async function getProductById(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        products.*,
        categories.name AS category_name,
        categories.slug AS category_slug
      FROM products
      LEFT JOIN categories ON categories.id = products.category_id
      WHERE products.id = $1
    `, [id]);

    const product = result.rows[0];

    if (!product) {
      return res.status(404).json({
        message: 'Produto não encontrado.'
      });
    }

    const imagesResult = await pool.query(`
      SELECT image_url
      FROM product_images
      WHERE product_id = $1
      ORDER BY position ASC, id ASC
    `, [id]);

    product.images = imagesResult.rows.map(function (row) { return row.image_url; });

    res.json(product);
  } catch (err) {
    console.error('Erro ao buscar produto:', err);
    res.status(500).json({ message: 'Erro ao buscar produto.' });
  }
}

// Produto base esgotado ou inativo continua recebendo sugestões: é quando elas mais ajudam
export async function getSimilarProducts(req, res) {
  try {
    const { id } = req.params;

    // até 9 dígitos: cabe no INTEGER do Postgres
    if (!/^\d{1,9}$/.test(id)) {
      return res.status(400).json({ message: 'ID de produto inválido.' });
    }

    const limite = Math.min(Math.max(parseInt(req.query.limit) || 8, 1), 12);

    const baseResult = await pool.query(`
      SELECT
        products.id, products.name, products.price, products.compare_price, products.category_id,
        categories.name AS category_name,
        categories.slug AS category_slug
      FROM products
      LEFT JOIN categories ON categories.id = products.category_id
      WHERE products.id = $1
    `, [id]);

    const base = baseResult.rows[0];

    if (!base) {
      return res.status(404).json({ message: 'Produto não encontrado.' });
    }

    const candidatos = await pool.query(`
      SELECT
        products.id, products.name, products.price, products.compare_price, products.image_url,
        products.stock, products.is_active, products.category_id,
        categories.name AS category_name,
        categories.slug AS category_slug
      FROM products
      LEFT JOIN categories ON categories.id = products.category_id
      WHERE products.is_active = 1 AND products.stock = true AND products.id <> $1
    `, [id]);

    res.json({
      category_slug: base.category_slug,
      category_name: base.category_name,
      products: rankearSemelhantes(base, candidatos.rows, limite)
    });
  } catch (err) {
    console.error('Erro ao buscar produtos semelhantes:', err);
    res.status(500).json({ message: 'Erro ao buscar produtos semelhantes.' });
  }
}

export async function createProduct(req, res) {
  try {
    const {
      category_id,
      name,
      slug,
      description,
      ingredients,
      price,
      compare_price,
      stock,
      weight,
      image_url,
      images,
      is_active,
      is_featured
    } = req.body;

    if (!name || !slug || price === undefined) {
      return res.status(400).json({
        message: 'Nome, slug e preço são obrigatórios.'
      });
    }

    const imageList = Array.isArray(images) ? images.filter(Boolean) : [];
    const coverUrl = imageList.length > 0 ? imageList[0] : (image_url || null);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(`
        INSERT INTO products (
          category_id, name, slug, description, ingredients,
          price, compare_price, stock, weight, image_url, is_active, is_featured
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `, [
        category_id || null,
        name,
        slug,
        description || null,
        ingredients || null,
        Number(price),
        compare_price ? Number(compare_price) : null,
        stock === true || stock === 1 || stock === '1' || stock === 'true',
        Number(weight || 0),
        coverUrl,
        is_active !== false ? 1 : 0,
        is_featured ? 1 : 0
      ]);

      const productId = result.rows[0].id;

      for (let i = 0; i < imageList.length; i++) {
        await client.query(`
          INSERT INTO product_images (product_id, image_url, position)
          VALUES ($1, $2, $3)
        `, [productId, imageList[i], i]);
      }

      await client.query('COMMIT');

      res.status(201).json({
        id: productId,
        message: 'Produto criado com sucesso.'
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Erro ao criar produto:', err);
    res.status(500).json({ message: 'Erro ao criar produto.' });
  }
}

export async function updateProduct(req, res) {
  try {
    const { id } = req.params;

    const {
      category_id,
      name,
      slug,
      description,
      ingredients,
      price,
      compare_price,
      stock,
      weight,
      image_url,
      images,
      is_active,
      is_featured
    } = req.body;

    const imageList = Array.isArray(images) ? images.filter(Boolean) : null;
    const coverUrl = imageList !== null && imageList.length > 0
      ? imageList[0]
      : (imageList !== null ? null : (image_url || null));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(`
        UPDATE products
        SET
          category_id = $1,
          name = $2,
          slug = $3,
          description = $4,
          ingredients = $5,
          price = $6,
          compare_price = $7,
          stock = $8,
          weight = $9,
          image_url = $10,
          is_active = $11,
          is_featured = $12,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $13
      `, [
        category_id || null,
        name,
        slug,
        description || null,
        ingredients || null,
        Number(price),
        compare_price ? Number(compare_price) : null,
        stock === true || stock === 1 || stock === '1' || stock === 'true',
        Number(weight || 0),
        coverUrl,
        is_active ? 1 : 0,
        is_featured ? 1 : 0,
        id
      ]);

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          message: 'Produto não encontrado.'
        });
      }

      if (imageList !== null) {
        await client.query('DELETE FROM product_images WHERE product_id = $1', [id]);

        for (let i = 0; i < imageList.length; i++) {
          await client.query(`
            INSERT INTO product_images (product_id, image_url, position)
            VALUES ($1, $2, $3)
          `, [id, imageList[i], i]);
        }
      }

      await client.query('COMMIT');

      res.json({
        message: 'Produto atualizado com sucesso.'
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Erro ao atualizar produto:', err);
    res.status(500).json({ message: 'Erro ao atualizar produto.' });
  }
}

export async function searchProducts(req, res) {
  try {
    const { q, category } = req.query;

    if (typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({ message: 'Termo de busca é obrigatório.' });
    }

    // Busca apenas pelo nome, sem diferenciar maiúsculas/acentos.
    // % _ e \ digitados pelo usuário são tratados como texto, não como curinga.
    const termoEscapado = q.trim().replace(/[\\%_]/g, '\\$&');
    const params = [`%${termoEscapado}%`];

    let categoryClause = '';
    if (typeof category === 'string' && category.trim().length > 0) {
      params.push(category.trim());
      categoryClause = `AND categories.slug = $${params.length}`;
    }

    const result = await pool.query(`
      SELECT
        products.*,
        categories.name AS category_name,
        categories.slug AS category_slug
      FROM products
      LEFT JOIN categories ON categories.id = products.category_id
      WHERE products.is_active = 1
      AND translate(lower(products.name), 'áàâãäåéèêëíìîïóòôõöúùûüç', 'aaaaaaeeeeiiiiooooouuuuc')
          LIKE translate(lower($1), 'áàâãäåéèêëíìîïóòôõöúùûüç', 'aaaaaaeeeeiiiiooooouuuuc')
      ${categoryClause}
      ORDER BY translate(lower(products.name), 'áàâãäåéèêëíìîïóòôõöúùûüç', 'aaaaaaeeeeiiiiooooouuuuc') ASC
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar produtos:', err);
    res.status(500).json({ message: 'Erro ao buscar produtos.' });
  }
}

export async function deleteProduct(req, res) {
  try {
    const { id } = req.params;

    const product = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (product.rows.length === 0) {
      return res.status(404).json({ message: 'Produto não encontrado.' });
    }

    const orderRefs = await pool.query(
      'SELECT COUNT(*) AS count FROM order_items WHERE product_id = $1', [id]
    );

    if (Number(orderRefs.rows[0].count) > 0) {
      await pool.query(`
        UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1
      `, [id]);
      return res.json({
        message: 'Produto possui pedidos vinculados. Foi desativado em vez de excluído.'
      });
    }

    await pool.query('DELETE FROM cart_items WHERE product_id = $1', [id]);
    await pool.query('DELETE FROM kit_items WHERE product_id = $1', [id]);
    await pool.query('DELETE FROM products WHERE id = $1', [id]);

    res.json({ message: 'Produto excluído permanentemente.' });
  } catch (err) {
    console.error('Erro ao excluir produto:', err);
    res.status(500).json({ message: 'Erro ao excluir produto.' });
  }
}

export async function getProductsStatus(req, res) {
  try {
    const { ids } = req.query;

    if (!ids) {
      return res.json({});
    }

  const idList = ids.split(',').map(Number).filter(function (n) { return !isNaN(n) && n > 0; });

  if (idList.length === 0) {
    return res.json({});
  }

  const placeholders = idList.map(function (_, i) { return '$' + (i + 1); }).join(',');
  const result = await pool.query(
    `SELECT id, stock, is_active FROM products WHERE id IN (${placeholders})`,
    idList
  );

    var statusMap = {};
    result.rows.forEach(function (row) {
      statusMap[String(row.id)] = { stock: !!row.stock, is_active: row.is_active };
    });

    res.json(statusMap);
  } catch (err) {
    console.error('Erro ao consultar status dos produtos:', err);
    res.status(500).json({ message: 'Erro ao consultar status dos produtos.' });
  }
}
