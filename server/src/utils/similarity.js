// Ranking de produtos semelhantes por conteúdo: categoria, palavras do nome, marca e faixa de preço.
// Só entra quem tem relação real com o produto (categoria, palavra ou marca em comum):
// preço parecido sozinho não torna um produto semelhante.

const PESO_CATEGORIA = 5;
const PESO_NOME = 10;
const PESO_MARCA = 1;
const PESO_PRECO = 2;
// a partir de 3x de diferença de preço, a proximidade de preço vale zero
const LIMITE_RAZAO_PRECO = Math.log(3);

const CONECTIVOS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'com', 'sem', 'em', 'no', 'na', 'nos', 'nas',
  'a', 'o', 'as', 'os', 'ao', 'sabor', 'tipo'
]);

function normalizar(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// "castanhas" e "castanha" viram a mesma palavra
function singular(palavra) {
  return palavra.length > 4 && palavra.endsWith('s') ? palavra.slice(0, -1) : palavra;
}

// palavras com dígito são medidas ("500ml", "1kg") e não dizem nada sobre o produto
export function tokenizarNome(texto) {
  const palavras = normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 1 && !CONECTIVOS.has(p) && !/\d/.test(p))
    .map(singular);
  return [...new Set(palavras)];
}

// os nomes do catálogo seguem o padrão "Produto 250ml - Marca"
export function separarMarca(nomeCompleto) {
  const texto = String(nomeCompleto || '');
  const i = texto.lastIndexOf(' - ');
  if (i === -1) return { nome: texto, marca: '' };
  return { nome: texto.slice(0, i), marca: tokenizarNome(texto.slice(i + 3)).join(' ') };
}

function jaccard(a, b) {
  if (a.length === 0 || b.length === 0) return 0;
  const conjuntoB = new Set(b);
  const comuns = a.filter((p) => conjuntoB.has(p)).length;
  return comuns / (a.length + b.length - comuns);
}

function precoVenda(produto) {
  return Number(produto.compare_price || produto.price);
}

function proximidadePreco(a, b) {
  if (!(a > 0) || !(b > 0)) return 0;
  return Math.max(0, 1 - Math.abs(Math.log(a / b)) / LIMITE_RAZAO_PRECO);
}

export function pontuarSemelhanca(base, candidato) {
  const nomeBase = separarMarca(base.name);
  const nomeCandidato = separarMarca(candidato.name);

  const mesmaCategoria = base.category_id != null && base.category_id === candidato.category_id;
  const similaridadeNome = jaccard(tokenizarNome(nomeBase.nome), tokenizarNome(nomeCandidato.nome));
  const mesmaMarca = nomeBase.marca !== '' && nomeBase.marca === nomeCandidato.marca;

  const pontos =
    (mesmaCategoria ? PESO_CATEGORIA : 0) +
    PESO_NOME * similaridadeNome +
    (mesmaMarca ? PESO_MARCA : 0) +
    PESO_PRECO * proximidadePreco(precoVenda(base), precoVenda(candidato));

  return { pontos, relevante: mesmaCategoria || similaridadeNome > 0 || mesmaMarca };
}

function campoCard(p) {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    compare_price: p.compare_price,
    image_url: p.image_url,
    stock: p.stock,
    category_slug: p.category_slug,
    category_name: p.category_name
  };
}

// empate é desfeito pelo id para a mesma página sempre mostrar a mesma lista
export function rankearSemelhantes(base, candidatos, limite) {
  return candidatos
    .filter((p) => String(p.id) !== String(base.id) && !!p.stock && Number(p.is_active) === 1)
    .map((p) => ({ produto: p, ...pontuarSemelhanca(base, p) }))
    .filter((r) => r.relevante)
    .sort((a, b) => b.pontos - a.pontos || Number(a.produto.id) - Number(b.produto.id))
    .slice(0, Math.max(0, limite))
    .map((r) => campoCard(r.produto));
}
