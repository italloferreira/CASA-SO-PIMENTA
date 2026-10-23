import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHECKOUT_JS = readFileSync(path.resolve(__dirname, '..', 'assets/js/checkout.js'), 'utf-8');

// extrai uma função de topo do checkout.js pelo nome (até a primeira linha "}" na coluna 0)
function extrairFuncao(nome) {
  const inicio = CHECKOUT_JS.indexOf('function ' + nome + '(');
  assert.ok(inicio !== -1, 'função ' + nome + ' não encontrada em checkout.js');
  const fim = CHECKOUT_JS.indexOf('\n}', inicio);
  return CHECKOUT_JS.slice(inicio, fim + 2);
}

function montar({ carrinho, frete, metodo, percent }) {
  const ctx = {
    window: { siteSettings: percent === undefined ? null : { pix_discount_percent: String(percent) } },
    getCarrinho: () => carrinho,
    freteSelecionado: frete === null ? null : { valor: frete },
    metodoPagamento: metodo,
    cupomAplicado: null
  };
  vm.createContext(ctx);
  for (const nome of ['calcularSubtotal', 'getPixDiscountRate', 'calcularDescontoPix', 'getTotalFinal']) {
    vm.runInContext(extrairFuncao(nome), ctx);
  }
  return ctx;
}

test('checkout: desconto PIX só sobre os produtos, frete inteiro', () => {
  const ctx = montar({ carrinho: [{ valor: '50', quantidade: 2 }], frete: 30, metodo: 'pix', percent: 5 });
  assert.equal(ctx.calcularDescontoPix(ctx.calcularSubtotal()), 5);
  assert.equal(ctx.getTotalFinal(), 125);
});

test('checkout: cartão não recebe desconto', () => {
  const ctx = montar({ carrinho: [{ valor: '50', quantidade: 2 }], frete: 30, metodo: 'cartao', percent: 5 });
  assert.equal(ctx.getTotalFinal(), 130);
});

test('checkout: usa o percentual configurado no admin', () => {
  const ctx = montar({ carrinho: [{ valor: '100', quantidade: 1 }], frete: 20, metodo: 'pix', percent: 10 });
  assert.equal(ctx.getTotalFinal(), 110);
});

test('checkout: retirada (sem frete) continua igual', () => {
  const ctx = montar({ carrinho: [{ valor: '199.90', quantidade: 1 }], frete: null, metodo: 'pix', percent: 5 });
  assert.equal(ctx.getTotalFinal(), 189.9);
});

test('checkout: nenhum cálculo de PIX aplica o desconto sobre o total com frete', () => {
  assert.ok(!/\btotal\s*\*\s*getPixDiscountRate\(\)/.test(CHECKOUT_JS), 'ainda existe "total * getPixDiscountRate()"');
  assert.ok(!/\btotal\s*\*\s*taxaDesc/.test(CHECKOUT_JS), 'ainda existe "total * taxaDesc"');
  const usos = CHECKOUT_JS.match(/[=-]\s*calcularDescontoPix\(subtotal\)/g) || [];
  assert.equal(usos.length, 3, 'resumo, getTotalFinal e criação do pedido devem usar calcularDescontoPix(subtotal)');
});
