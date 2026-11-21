// Catálogo de produtos (GET /catalogo): regras e HTML, sem acesso ao banco.
// O catalogoController busca os dados e chama montarCatalogo(); assim tudo aqui é testável sem banco.

import { CATEGORIAS_GRANEL_100G } from './categorias.js';

// Quantas linhas cabem na 1ª página de uma categoria (as de continuação, com título menor, cabem 1 a mais).
// Uma linha "normal" (nome e descrição de uma linha cada) vale 1; veja pesoLinha().
// Com as 26 categorias nas pílulas do topo, 7 é o que cabe numa A4 no layout definido.
// Se ainda assim alguma página transbordar, o script da página passa as linhas que sobram para a seguinte.
export const MAX_LINHAS_POR_PAGINA = 7;

// Acima desses tamanhos o texto quebra em 2 linhas na coluna Produto (medido com Archivo 19px / Inter 12.5px).
// Medidas reais: linha normal 73px; descrição em 2 linhas +18px; nome em 2 linhas +24px; sem descrição -20px.
// A 1ª página de uma categoria tem ~566px para as linhas (7,7 linhas) e a de continuação ~634px (8,7).
const NOME_UMA_LINHA = 42;
const DESCRICAO_UMA_LINHA = 60;

// Categorias do catálogo, na mesma ordem do menu do site (os grupos "Molhos e Conservas",
// "Produtos naturais" e "Outros" ficam de fora: cada item do menu vira uma categoria).
// nome = texto do menu; frase = linha embaixo do título (edite à vontade).
// 'kits' vem da tabela kits; as outras, de products pelo slug da categoria.
// O teste verify-catalogo confere que a ordem bate com o menu de site/pages/index.html.
export const CATEGORIAS_CATALOGO = [
  { slug: 'molhos', nome: 'Molhos', frase: 'Molhos de pimenta para todos os paladares, do suave ao bem ardido.' },
  { slug: 'conservas', nome: 'Conservas', frase: 'Conservas para acompanhar petiscos, saladas e o almoço de todo dia.' },
  { slug: 'pequi', nome: 'Pequi', frase: 'O sabor do cerrado em conservas e derivados de pequi.' },
  { slug: 'geleias', nome: 'Geleias', frase: 'Geleias doces e picantes para pães, queijos e carnes.' },
  { slug: 'pastosas', nome: 'Pastosas', frase: 'Pimentas e temperos pastosos, prontos para usar na cozinha.' },
  { slug: 'farinhas', nome: 'Farinhas', frase: 'Farinhas para pães, bolos e receitas do dia a dia. Preço por 100 g.' },
  { slug: 'castanhas', nome: 'Castanhas', frase: 'Castanhas e nuts para lanches, saladas e receitas. Preço por 100 g.' },
  { slug: 'chas', nome: 'Chás', frase: 'Chás e ervas para preparar infusões em casa. Preço por 100 g.' },
  { slug: 'sementes', nome: 'Sementes', frase: 'Sementes para enriquecer receitas, iogurtes e saladas. Preço por 100 g.' },
  { slug: 'liofilizados', nome: 'Liofilizados', frase: 'Frutas e alimentos liofilizados, leves e crocantes. Preço por 100 g.' },
  { slug: 'aveias', nome: 'Aveias', frase: 'Aveias e flocos para o café da manhã e receitas. Preço por 100 g.' },
  { slug: 'desidratados', nome: 'Desidratados', frase: 'Frutas e legumes desidratados para lanches e receitas. Preço por 100 g.' },
  { slug: 'cocos', nome: 'Cocos', frase: 'Coco em diferentes formas para doces e receitas. Preço por 100 g.' },
  { slug: 'graos', nome: 'Grãos', frase: 'Grãos selecionados para a cozinha do dia a dia. Preço por 100 g.' },
  { slug: 'temperos', nome: 'Temperos', frase: 'Temperos e especiarias a granel para todas as receitas. Preço por 100 g.' },
  { slug: 'farofas', nome: 'Farofas', frase: 'Farofas prontas para acompanhar carnes e churrascos. Preço por 100 g.' },
  { slug: 'azeites', nome: 'Azeites', frase: 'Azeites para finalizar pratos e saladas.' },
  { slug: 'vinagres', nome: 'Vinagres', frase: 'Vinagres para saladas, molhos e conservas caseiras.' },
  { slug: 'produtos-de-limpeza', nome: 'Produtos de limpeza', frase: 'Produtos de limpeza vendidos a granel. Preço por 100 g.' },
  { slug: 'kits', nome: 'Kits', frase: 'Kits montados com nossos produtos, ótimos para presentear.' },
  { slug: 'mantegas', nome: 'Manteigas', frase: 'Manteigas para o pão de cada dia e para cozinhar.' },
  { slug: 'sal', nome: 'Sal', frase: 'Sais especiais para temperar e finalizar pratos. Preço por 100 g.' },
  { slug: 'mel', nome: 'Mel', frase: 'Méis para adoçar chás, receitas e o café da manhã.' },
  { slug: 'tira-gostos', nome: 'Tira gostos', frase: 'Petiscos para acompanhar a cerveja e as reuniões. Preço por 100 g.' },
  { slug: 'granjeados', nome: 'Granjeados', frase: 'Granjeados vendidos a granel para beliscar. Preço por 100 g.' },
  { slug: 'acucares', nome: 'Açúcares', frase: 'Açúcares para adoçar receitas, cafés e chás. Preço por 100 g.' }
];

const DESCRICAO_MAX = 90;
const WHATSAPP_PADRAO = '31983143902';

/* ── Textos ─────────────────────────────────────────── */

export function escHtml(texto) {
  return String(texto == null ? '' : texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Primeira frase da descrição, com no máximo 90 caracteres, cortada em palavra inteira.
export function descricaoCurta(descricao) {
  const texto = String(descricao || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!texto) return '';
  const fim = texto.search(/[.!?](\s|$)/);
  const frase = fim === -1 ? texto : texto.slice(0, fim + 1);
  if (frase.length <= DESCRICAO_MAX) return frase;
  const cortada = frase.slice(0, DESCRICAO_MAX).replace(/\s+\S*$/, '').replace(/[\s,;:.\-–—]+$/, '');
  return (cortada || frase.slice(0, DESCRICAO_MAX - 1)) + '…';
}

// Medida no nome do produto: "Molho Biquinho 150ml - Fogo Mineiro" → "150 ml"
const MEDIDA_NO_NOME = /(^|[\s(])(\d+(?:[.,]\d+)?)\s?(ml|kg|g|l)(?=$|[\s),\-–—])/i;

export function medidaDoNome(nome) {
  const m = MEDIDA_NO_NOME.exec(String(nome || ''));
  if (!m) return null;
  const unidade = m[3].toLowerCase();
  return m[2] + ' ' + (unidade === 'l' ? 'L' : unidade);
}

// Nome sem a medida, que já aparece na coluna Tamanho: "Molho Biquinho - Fogo Mineiro"
export function nomeSemMedida(nome) {
  const original = String(nome || '').trim();
  const limpo = original
    .replace(MEDIDA_NO_NOME, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([-–—])\s*$/, '')
    .replace(/^\s*[-–—]\s+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return limpo || original;
}

export function precoBR(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor) || 0);
}

// "31983143902" ou "(31) 98314-3902" → "(31) 98314-3902"
export function telefoneBR(telefone) {
  let d = String(telefone || '').replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
  return telefoneBR(WHATSAPP_PADRAO);
}

function semAcento(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/* ── Linhas ─────────────────────────────────────────── */

// produto: { name, description, price, compare_price, category_slug }
export function linhaProduto(produto) {
  const granel = CATEGORIAS_GRANEL_100G.indexOf(produto.category_slug) !== -1;
  return {
    nome: nomeSemMedida(produto.name),
    descricao: descricaoCurta(produto.description),
    tamanho: granel ? '100 g' : (medidaDoNome(produto.name) || 'Unidade'),
    // mesmo preço que a loja exibe e cobra: compare_price é o preço promocional
    preco: precoBR(produto.compare_price || produto.price)
  };
}

// kit: { name, description, price, total_itens }
export function linhaKit(kit) {
  const n = Number(kit.total_itens) || 0;
  return {
    nome: kit.name,
    descricao: descricaoCurta(kit.description),
    tamanho: n === 0 ? 'Kit' : n === 1 ? '1 item' : n + ' itens',
    preco: precoBR(kit.price)
  };
}

/* ── Montagem e paginação ───────────────────────────── */

// Agrupa na ordem de CATEGORIAS_CATALOGO; categorias sem produto ficam de fora.
export function agruparCategorias(produtos, kits) {
  return CATEGORIAS_CATALOGO.map(function (cat) {
    const linhas = cat.slug === 'kits'
      ? kits.map(linhaKit)
      : produtos.filter(function (p) { return p.category_slug === cat.slug; }).map(linhaProduto);
    linhas.sort(function (a, b) { return semAcento(a.nome).localeCompare(semAcento(b.nome), 'pt-BR'); });
    return { slug: cat.slug, nome: cat.nome, frase: cat.frase, linhas: linhas };
  }).filter(function (cat) { return cat.linhas.length > 0; }).map(function (cat, i) {
    cat.numero = String(i + 1).padStart(2, '0');
    return cat;
  });
}

// Altura relativa de uma linha: nome ou descrição que quebram ocupam mais; sem descrição, menos.
export function pesoLinha(linha) {
  let peso = 1;
  if (linha.nome.length > NOME_UMA_LINHA) peso += 0.33;
  if (!linha.descricao) peso -= 0.25;
  else if (linha.descricao.length > DESCRICAO_UMA_LINHA) peso += 0.25;
  return peso;
}

// Cada categoria começa numa página nova; numeração de páginas contínua.
export function paginar(categorias, maxLinhas = MAX_LINHAS_POR_PAGINA) {
  const paginas = [];
  categorias.forEach(function (cat) {
    let atual = null;
    let usado = 0;
    cat.linhas.forEach(function (linha) {
      const peso = pesoLinha(linha);
      const limite = atual && atual.continuacao ? maxLinhas + 1 : maxLinhas;
      if (!atual || (atual.linhas.length > 0 && usado + peso > limite + 0.001)) {
        atual = { categoria: cat, continuacao: atual !== null, linhas: [] };
        paginas.push(atual);
        usado = 0;
      }
      atual.linhas.push(linha);
      usado += peso;
    });
  });
  paginas.forEach(function (pag, i) { pag.numero = String(i + 1).padStart(2, '0'); });
  return paginas;
}

/* ── HTML ───────────────────────────────────────────── */

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { background: #EDEBE7; color: #1A1A1A; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }

  .barra { position: sticky; top: 0; z-index: 1; display: flex; justify-content: center; align-items: center; gap: 12px; padding: 14px 16px; background: #EDEBE7; }
  .barra button { font: 600 14px 'Inter', sans-serif; color: #fff; background: #B3121F; border: 0; border-radius: 999px; padding: 10px 22px; cursor: pointer; white-space: nowrap; }
  .barra button:hover { background: #8F0E19; }
  .barra span { font-size: 12px; color: #555; }

  .paginas { display: flex; flex-direction: column; align-items: center; gap: 32px; padding: 8px 0 48px; }
  .pagina {
    width: 794px; height: 1123px; overflow: hidden; background: #FFFFFF;
    padding: 52px 56px 44px; display: flex; flex-direction: column; gap: 26px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.06);
    zoom: var(--escala, 1);
  }

  .cabecalho { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding-bottom: 12px; border-bottom: 1px solid #1A1A1A; }
  .marca { font: 800 18px 'Archivo', sans-serif; letter-spacing: 0.04em; }
  .cabecalho-info { font-size: 12px; color: #555; text-align: right; }

  .pilulas { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; }
  .pilulas li { font-weight: 500; font-size: 12px; line-height: 1.2; padding: 6px 12px; border-radius: 999px; border: 1px solid #D6D3CE; color: #444; }
  .pilulas li.ativa { background: #B3121F; border-color: #B3121F; color: #FFFFFF; }

  .titulo { display: flex; align-items: flex-end; gap: 20px; }
  .titulo-numero { font: 800 120px/0.82 'Archivo', sans-serif; color: #B3121F; }
  .titulo-nome { font: 800 56px/1 'Archivo', sans-serif; letter-spacing: -0.02em; }
  .titulo-frase { margin-top: 8px; font-size: 14px; line-height: 1.4; color: #555; max-width: 420px; }
  .titulo-cont { font: 800 32px/1.1 'Archivo', sans-serif; letter-spacing: -0.01em; }

  .tabela { display: flex; flex-direction: column; }
  .linha, .tabela-cabecalho { display: grid; grid-template-columns: minmax(0, 1fr) 150px 96px; gap: 16px; }
  .tabela-cabecalho { font-weight: 600; font-size: 11px; letter-spacing: 0.08em; color: #6B6B6B; padding-bottom: 8px; border-bottom: 1px solid #1A1A1A; }
  .tabela-cabecalho span:last-child, .preco { text-align: right; }
  .linha { padding: 14px 0; border-bottom: 1px solid #E6E3DE; align-items: baseline; break-inside: avoid; page-break-inside: avoid; }
  .nome { font: 600 19px/1.25 'Archivo', sans-serif; }
  .descricao { margin-top: 3px; font-size: 12.5px; line-height: 1.4; color: #555; }
  .tamanho { font-size: 13px; color: #333; }
  .preco { font: 600 17px 'Archivo', sans-serif; white-space: nowrap; }

  .rodape { margin-top: auto; display: flex; justify-content: space-between; align-items: center; gap: 16px; background: #F4F1EC; border-radius: 10px; padding: 16px 20px; }
  .rodape-titulo { font: 600 15px 'Archivo', sans-serif; }
  .rodape-contato { margin-top: 3px; font-size: 12px; color: #555; }
  .rodape-pagina { font: 800 14px 'Archivo', sans-serif; color: #6B6B6B; white-space: nowrap; }

  .vazio { text-align: center; padding: 80px 24px; color: #555; }

  @page { size: A4; margin: 0; }
  @media print {
    body { background: none; }
    .barra { display: none; }
    .paginas { display: block; padding: 0; }
    .pagina { width: 210mm; height: 297mm; box-shadow: none; zoom: 1; page-break-after: always; break-after: page; }
    .pagina:last-child { page-break-after: auto; break-after: auto; }
  }
`;

function htmlPilulas(categorias, ativa) {
  return '<ul class="pilulas">' + categorias.map(function (cat) {
    return '<li' + (cat.slug === ativa ? ' class="ativa"' : '') + '>' + escHtml(cat.nome) + '</li>';
  }).join('') + '</ul>';
}

function htmlTitulo(pagina) {
  const cat = pagina.categoria;
  if (pagina.continuacao) {
    return '<h2 class="titulo-cont">' + escHtml(cat.nome) + ' (cont.)</h2>';
  }
  return '<div class="titulo">' +
    '<span class="titulo-numero">' + cat.numero + '</span>' +
    '<div><h2 class="titulo-nome">' + escHtml(cat.nome) + '</h2>' +
    (cat.frase ? '<p class="titulo-frase">' + escHtml(cat.frase) + '</p>' : '') +
    '</div></div>';
}

function htmlLinha(linha) {
  return '<div class="linha">' +
    '<div><p class="nome">' + escHtml(linha.nome) + '</p>' +
    (linha.descricao ? '<p class="descricao">' + escHtml(linha.descricao) + '</p>' : '') + '</div>' +
    '<span class="tamanho">' + escHtml(linha.tamanho) + '</span>' +
    '<span class="preco">' + escHtml(linha.preco) + '</span>' +
    '</div>';
}

function htmlPagina(pagina, categorias, contexto) {
  return '<section class="pagina" data-categoria="' + escHtml(pagina.categoria.slug) + '" data-nome="' + escHtml(pagina.categoria.nome) + '"' + (pagina.continuacao ? ' data-cont="1"' : '') + '>' +
    '<header class="cabecalho"><span class="marca">CASA SÓ PIMENTA</span>' +
    '<span class="cabecalho-info">Catálogo ' + contexto.ano + ' · Mercado Central de BH desde 2005</span></header>' +
    htmlPilulas(categorias, pagina.categoria.slug) +
    htmlTitulo(pagina) +
    '<div class="tabela">' +
    '<div class="tabela-cabecalho"><span>PRODUTO</span><span>TAMANHO</span><span>PREÇO</span></div>' +
    pagina.linhas.map(htmlLinha).join('') +
    '</div>' +
    '<footer class="rodape"><div>' +
    '<p class="rodape-titulo">Peça pelo WhatsApp ou retire no Mercado Central</p>' +
    '<p class="rodape-contato">WhatsApp ' + escHtml(contexto.whatsapp) + ' · casasopimenta.com.br · @' + escHtml(contexto.instagram) + '</p>' +
    '</div><span class="rodape-pagina">p. ' + pagina.numero + '</span></footer>' +
    '</section>';
}

// Rede de segurança da paginação: depois que as fontes carregam, se alguma página transbordar,
// as últimas linhas vão para a página de continuação da mesma categoria (criada se não existir).
// Assim nenhuma linha fica cortada no PDF, mesmo com nomes ou descrições maiores que o previsto.
const SCRIPT_CORRIGIR_PAGINAS = `
  function transborda(pag) { return pag.scrollHeight > pag.clientHeight + 1; }
  function novaContinuacao(pag) {
    var nova = pag.cloneNode(true);
    var titulo = nova.querySelector(".titulo, .titulo-cont");
    var h2 = document.createElement("h2");
    h2.className = "titulo-cont";
    h2.textContent = pag.dataset.nome + " (cont.)";
    titulo.replaceWith(h2);
    nova.querySelectorAll(".linha").forEach(function (l) { l.remove(); });
    nova.dataset.cont = "1";
    pag.after(nova);
    return nova;
  }
  function corrigirPaginas() {
    var pag = document.querySelector(".pagina");
    while (pag) {
      while (transborda(pag) && pag.querySelectorAll(".linha").length > 1) {
        var prox = pag.nextElementSibling;
        if (!prox || prox.dataset.categoria !== pag.dataset.categoria || prox.dataset.cont !== "1") prox = novaContinuacao(pag);
        var tabela = prox.querySelector(".tabela");
        var linhas = pag.querySelectorAll(".linha");
        tabela.insertBefore(linhas[linhas.length - 1], tabela.querySelector(".linha"));
      }
      pag = pag.nextElementSibling;
    }
    document.querySelectorAll(".rodape-pagina").forEach(function (el, i) {
      el.textContent = "p. " + String(i + 1).padStart(2, "0");
    });
  }
`;

// dados: { produtos[], kits[], settings{}, ano, nonce }
export function montarCatalogo(dados) {
  const settings = dados.settings || {};
  const contexto = {
    ano: dados.ano || new Date().getFullYear(),
    whatsapp: telefoneBR(settings.contact_phone),
    instagram: String(settings.social_instagram || 'casasopimenta').replace(/^@/, '')
  };
  const categorias = agruparCategorias(dados.produtos || [], dados.kits || []);
  const paginas = paginar(categorias, dados.maxLinhas);
  const nonce = escHtml(dados.nonce || '');

  return '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>Catálogo ' + contexto.ano + ' | Casa Só Pimenta</title>\n' +
    '<meta name="description" content="Catálogo de produtos da Casa Só Pimenta: temperos, molhos, conservas, castanhas e produtos naturais. Mercado Central de BH desde 2005.">\n' +
    '<link rel="icon" type="image/png" href="/site/imgs/logo.png">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">\n' +
    '<style>' + CSS + '</style>\n' +
    '</head>\n<body>\n' +
    '<div class="barra"><button type="button" id="baixarPdf">Baixar PDF</button><span>Na janela que abrir, escolha "Salvar como PDF".</span></div>\n' +
    '<main class="paginas">' +
    (paginas.length
      ? paginas.map(function (p) { return htmlPagina(p, categorias, contexto); }).join('\n')
      : '<p class="vazio">Nenhum produto disponível no momento.</p>') +
    '</main>\n' +
    '<script nonce="' + nonce + '">\n' +
    '(function () {\n' +
    '  // no celular as páginas A4 encolhem para caber na largura da tela\n' +
    '  function ajustar() {\n' +
    '    var escala = Math.min(1, (window.innerWidth - 24) / 794);\n' +
    '    document.documentElement.style.setProperty("--escala", escala);\n' +
    '  }\n' +
    '  ajustar();\n' +
    '  window.addEventListener("resize", ajustar);\n' +
    SCRIPT_CORRIGIR_PAGINAS +
    '  var fontes = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();\n' +
    '  var pronto = fontes.then(corrigirPaginas);\n' +
    '  document.getElementById("baixarPdf").addEventListener("click", function () {\n' +
    '    pronto.then(function () { window.print(); });\n' +
    '  });\n' +
    '})();\n' +
    '</script>\n' +
    '</body>\n</html>\n';
}
