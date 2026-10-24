import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenizarNome,
  separarMarca,
  pontuarSemelhanca,
  rankearSemelhantes
} from '../src/utils/similarity.js';

/* Testes unitários (sem banco) do ranking de produtos semelhantes */

function produto(id, name, extra = {}) {
  return { id, name, price: '10.00', compare_price: null, category_id: 1, stock: true, is_active: 1, ...extra };
}

test('tokenizarNome ignora acentos, conectivos, medidas e plural', () => {
  assert.deepEqual(tokenizarNome('Azeite de Oliva com Alho 250ml'), ['azeite', 'oliva', 'alho']);
  assert.deepEqual(tokenizarNome('Pimenta Calabresa Moída 1kg'), ['pimenta', 'calabresa', 'moida']);
  assert.deepEqual(tokenizarNome('Castanhas do Pará'), ['castanha', 'para']);
  assert.deepEqual(tokenizarNome('Farofa sabor Bacon'), ['farofa', 'bacon']);
  assert.deepEqual(tokenizarNome('Mel 500g, 1L e 100 g'), ['mel']);
  assert.deepEqual(tokenizarNome(''), []);
  assert.deepEqual(tokenizarNome(null), []);
});

test('tokenizarNome não repete palavras', () => {
  assert.deepEqual(tokenizarNome('Pimenta com Pimenta'), ['pimenta']);
});

test('separarMarca usa o trecho depois do último " - "', () => {
  // a marca é uma chave normalizada (mesma regra de plural do nome), só usada para comparar
  assert.deepEqual(separarMarca('Creme de Pequi 360g - Pequi de Minas'), { nome: 'Creme de Pequi 360g', marca: 'pequi mina' });
  assert.deepEqual(separarMarca('Farinha Panko'), { nome: 'Farinha Panko', marca: '' });
  // "Maria de Fé" e "Maria da Fé" são a mesma marca escrita de jeitos diferentes
  assert.equal(separarMarca('A - Maria de Fé').marca, separarMarca('B - Maria da Fé').marca);
});

test('pontuação: mesma categoria + nome parecido > só nome > só categoria', () => {
  const base = produto(1, 'Pimenta Calabresa', { category_id: 7 });
  const categoriaENome = pontuarSemelhanca(base, produto(2, 'Pimenta Calabresa em Flocos', { category_id: 7 }));
  const soNome = pontuarSemelhanca(base, produto(3, 'Pimenta Calabresa em Flocos', { category_id: 9 }));
  const soCategoria = pontuarSemelhanca(base, produto(4, 'Orégano', { category_id: 7 }));

  assert.ok(categoriaENome.pontos > soNome.pontos);
  assert.ok(categoriaENome.pontos > soCategoria.pontos);
  assert.ok(soNome.relevante && soCategoria.relevante && categoriaENome.relevante);
});

test('pontuação: nome mais parecido vence quando a categoria é a mesma', () => {
  const base = produto(1, 'Azeite de Oliva com Alho 250ml - Maria de Fé', { category_id: 3 });
  const alecrim = pontuarSemelhanca(base, produto(2, 'Azeite de Oliva com Alecrim 250ml - Maria de Fé', { category_id: 3 }));
  const dende = pontuarSemelhanca(base, produto(3, 'Azeite de Dendê da Bahia 500ml', { category_id: 3 }));
  assert.ok(alecrim.pontos > dende.pontos);
});

test('pontuação: preço próximo desempata, preço sozinho nunca torna relevante', () => {
  const base = produto(1, 'Orégano', { category_id: 7, price: '10.00' });
  const perto = pontuarSemelhanca(base, produto(2, 'Cominho', { category_id: 7, price: '11.00' }));
  const longe = pontuarSemelhanca(base, produto(3, 'Páprica', { category_id: 7, price: '45.00' }));
  assert.ok(perto.pontos > longe.pontos);

  const semRelacao = pontuarSemelhanca(base, produto(4, 'Sabão em Barra', { category_id: 99, price: '10.00' }));
  assert.equal(semRelacao.relevante, false, 'mesmo preço sem categoria/nome/marca em comum não é semelhante');
});

test('pontuação usa o preço de venda (compare_price quando houver)', () => {
  const base = produto(1, 'Orégano', { category_id: 7, price: '20.00', compare_price: '10.00' });
  const promoPerto = pontuarSemelhanca(base, produto(2, 'Cominho', { category_id: 7, price: '10.00' }));
  const cheioPerto = pontuarSemelhanca(base, produto(3, 'Páprica', { category_id: 7, price: '20.00' }));
  assert.ok(promoPerto.pontos > cheioPerto.pontos);
});

test('preço zero ou inválido não gera NaN', () => {
  const base = produto(1, 'Orégano', { price: '0' });
  const r = pontuarSemelhanca(base, produto(2, 'Orégano Chileno', { price: 'abc' }));
  assert.ok(Number.isFinite(r.pontos));
});

test('mesma marca conta pouco, mas torna relevante', () => {
  const base = produto(1, 'Creme de Pequi 360g - Pequi de Minas', { category_id: 1 });
  const mesmaMarca = pontuarSemelhanca(base, produto(2, 'Doce de Leite - Pequi de Minas', { category_id: 2 }));
  assert.equal(mesmaMarca.relevante, true);
  assert.ok(mesmaMarca.pontos < 5, 'marca não pode pesar mais que a categoria');
});

test('rankearSemelhantes exclui o próprio produto, inativos, esgotados e irrelevantes', () => {
  const base = produto(1, 'Pimenta Calabresa', { category_id: 7 });
  const candidatos = [
    produto(1, 'Pimenta Calabresa', { category_id: 7 }),
    produto(2, 'Pimenta do Reino', { category_id: 7 }),
    produto(3, 'Pimenta Rosa', { category_id: 7, stock: false }),
    produto(4, 'Pimenta Síria', { category_id: 7, is_active: 0 }),
    produto(5, 'Sabão em Barra', { category_id: 99 }),
    produto(6, 'Cominho', { category_id: 7 })
  ];
  const ids = rankearSemelhantes(base, candidatos, 8).map((p) => p.id);
  assert.deepEqual(ids, [2, 6]);
});

test('rankearSemelhantes respeita o limite e é determinístico (empate desfeito pelo id)', () => {
  const base = produto(1, 'Orégano', { category_id: 7 });
  const candidatos = [10, 4, 8, 2, 6].map((id) => produto(id, 'Cominho', { category_id: 7 }));
  assert.deepEqual(rankearSemelhantes(base, candidatos, 3).map((p) => p.id), [2, 4, 6]);
  assert.deepEqual(rankearSemelhantes(base, [...candidatos].reverse(), 3).map((p) => p.id), [2, 4, 6]);
});

test('rankearSemelhantes devolve só os campos do card (sem pontuação interna)', () => {
  const base = produto(1, 'Orégano', { category_id: 7 });
  const [r] = rankearSemelhantes(base, [produto(2, 'Cominho', { category_id: 7, description: 'x', image_url: '/a.jpg', category_slug: 'temperos', category_name: 'Temperos' })], 8);
  assert.deepEqual(Object.keys(r).sort(), ['category_name', 'category_slug', 'compare_price', 'id', 'image_url', 'name', 'price', 'stock']);
});

test('rankearSemelhantes com lista vazia ou limite inválido', () => {
  const base = produto(1, 'Orégano');
  assert.deepEqual(rankearSemelhantes(base, [], 8), []);
  assert.equal(rankearSemelhantes(base, [produto(2, 'Orégano Chileno')], 0).length, 0);
});

test('cenário real: categoria pequena busca semelhantes pelo nome em outras categorias', () => {
  const base = produto(1, 'Molho de Pimenta Tabasco Original', { category_id: 50 });
  const candidatos = [
    produto(2, 'Molho de Pequi com Pimenta 150ml - Nativa Alimentos', { category_id: 60 }),
    produto(3, 'Pimenta Calabresa', { category_id: 70 }),
    produto(4, 'Aveia Grossa', { category_id: 80 })
  ];
  const ids = rankearSemelhantes(base, candidatos, 8).map((p) => p.id);
  assert.equal(ids[0], 2, 'o outro molho com pimenta é o mais parecido');
  assert.ok(ids.includes(3));
  assert.ok(!ids.includes(4), 'aveia não tem nada a ver com molho');
});
