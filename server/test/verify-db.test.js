import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/database/connection.js';

async function getCategoryBySlug(slug) {
  const result = await pool.query(
    'SELECT id, name FROM categories WHERE slug = $1 LIMIT 1',
    [slug]
  );
  return result.rows[0] || null;
}

async function countProducts(categoryId) {
  const result = await pool.query(
    'SELECT COUNT(*) AS total FROM products WHERE category_id = $1',
    [categoryId]
  );
  return parseInt(result.rows[0].total, 10);
}

const expected = [
  ['molhos', 'Molhos'],
  ['conservas', 'Conservas'],
  ['pequi', 'Pequi'],
  ['azeites', 'Azeites'],
  ['vinagres', 'Vinagres'],
  ['produtos-de-limpeza', 'Produtos de limpeza'],
  ['kits', 'Kits'],
  ['farinhas', 'Farinhas'],
  ['temperos', 'Temperos'],
  ['castanhas', 'Castanhas'],
  ['chas', 'Chás'],
  ['outros', 'Outros'],
  ['geleias', 'Geleias'],
  ['pastosas', 'Pastosas'],
  ['sementes', 'Sementes'],
  ['liofilizados', 'Liofilizados'],
  ['aveias', 'Aveias'],
  ['desidratados', 'Desidratados'],
  ['melados', 'Melados'],
  ['mantegas', 'Mantegas'],
  ['sal', 'Sal'],
  ['farofas', 'Farofas'],
  ['mel', 'Mel'],
  ['tira-gostos', 'Tira gostos'],
  ['cocos', 'Cocos'],
  ['graos', 'Grãos'],
  ['granjeados', 'Granjeados'],
  ['acucares', 'Açúcares']
];

test('todas as categorias esperadas existem com nomes corretos', async () => {
  for (const [slug, name] of expected) {
    const cat = await getCategoryBySlug(slug);
    assert.ok(cat, 'categoria não encontrada: ' + slug);
    assert.equal(cat.name, name, 'nome incorreto para ' + slug);
  }
});

test('categoria "pimentas" não existe mais', async () => {
  const pimentas = await getCategoryBySlug('pimentas');
  assert.ok(!pimentas, 'categoria pimentas ainda existe');
});

test('molhos possui produtos vinculados (herdados de pimentas)', async () => {
  const molhos = await getCategoryBySlug('molhos');
  assert.ok(molhos, 'categoria molhos ausente');
  const total = await countProducts(molhos.id);
  assert.ok(total >= 1, 'molhos deveria ter produtos, total=' + total);
});

test('outros foi preservado com seus produtos', async () => {
  const outros = await getCategoryBySlug('outros');
  assert.ok(outros, 'categoria outros ausente');
  const total = await countProducts(outros.id);
  assert.ok(total >= 1, 'outros deveria ter produtos, total=' + total);
});