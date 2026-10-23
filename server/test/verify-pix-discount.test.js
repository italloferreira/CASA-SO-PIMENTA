import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularValorPix } from '../src/utils/pixDiscount.js';
import { adminNewOrderEmail, customerOrderConfirmationEmail } from '../src/utils/emailTemplates.js';

test('desconto PIX incide só nos produtos, frete mantém o valor cheio', () => {
  // produtos R$ 100 + frete R$ 30, 5% de desconto => 95 + 30
  const r = calcularValorPix({ subtotal: 100, delivery_fee: 30, coupon_discount: 0 }, 5);
  assert.equal(r.descontoPix, 5);
  assert.equal(r.total, 125);
});

test('sem frete (retirada) o resultado é o mesmo de antes', () => {
  const r = calcularValorPix({ subtotal: 100, delivery_fee: 0, coupon_discount: 0 }, 5);
  assert.equal(r.total, 95);
});

test('valores vindos do banco como string (NUMERIC) funcionam', () => {
  const r = calcularValorPix({ subtotal: '199.90', delivery_fee: '25.50', coupon_discount: '0.00' }, '5');
  assert.equal(r.descontoPix, 10);
  assert.equal(r.total, 215.4);
});

test('cupom e desconto PIX são calculados sobre o subtotal e o frete continua inteiro', () => {
  // produtos 200, cupom 20, PIX 5% de 200 = 10, frete 15 => 200 - 20 - 10 + 15
  const r = calcularValorPix({ subtotal: 200, delivery_fee: 15, coupon_discount: 20 }, 5);
  assert.equal(r.total, 185);
});

test('descontos nunca deixam os produtos negativos nem mexem no frete', () => {
  const r = calcularValorPix({ subtotal: 50, delivery_fee: 20, coupon_discount: 50 }, 5);
  assert.equal(r.total, 20);
});

test('desconto 0% devolve produtos + frete - cupom', () => {
  const r = calcularValorPix({ subtotal: 80, delivery_fee: 12, coupon_discount: 8 }, 0);
  assert.equal(r.descontoPix, 0);
  assert.equal(r.total, 84);
});

test('chamar de novo para o mesmo pedido não aplica o desconto duas vezes', () => {
  const pedido = { subtotal: 100, delivery_fee: 30, coupon_discount: 0, total: 130 };
  const primeira = calcularValorPix(pedido, 5);
  // processPix grava o total com desconto; uma nova tentativa usa subtotal/frete/cupom, não o total gravado
  const segunda = calcularValorPix({ ...pedido, total: primeira.total }, 5);
  assert.equal(segunda.total, primeira.total);
});

test('resultado sempre arredondado em centavos', () => {
  for (const subtotal of [0.01, 9.99, 33.33, 123.45, 999.99]) {
    const { total, descontoPix } = calcularValorPix({ subtotal, delivery_fee: 7.77, coupon_discount: 0 }, 5);
    assert.equal(Math.round(total * 100) / 100, total, 'total com mais de 2 casas para ' + subtotal);
    assert.equal(Math.round(descontoPix * 100) / 100, descontoPix, 'desconto com mais de 2 casas para ' + subtotal);
  }
});

function pedidoEmail(extra) {
  return Object.assign({
    id: 1, customer_name: 'Cliente', customer_email: 'c@x.com', customer_phone: '1',
    address: 'Rua', number: '1', neighborhood: '', city: 'Cidade', state: 'GO', cep: '00000000',
    delivery_type: 'delivery', payment_method: 'pix',
    items: [{ item_name: 'Produto', quantity: 2, unit_price: 50, total: 100 }],
    subtotal: 100, delivery_fee: 30, coupon_code: null, coupon_discount: 0, pix_discount: 0, total: 130
  }, extra);
}

test('emails de pedido PIX mostram a linha "Desconto PIX" e o total com desconto', () => {
  const { descontoPix, total } = calcularValorPix({ subtotal: 100, delivery_fee: 30, coupon_discount: 0 }, 5);
  const pedido = pedidoEmail({ pix_discount: descontoPix, total });
  for (const html of [adminNewOrderEmail(pedido), customerOrderConfirmationEmail(pedido)]) {
    assert.ok(html.includes('Desconto PIX'), 'falta a linha Desconto PIX');
    assert.ok(html.includes('-R$ 5,00'), 'desconto deveria ser R$ 5,00');
    assert.ok(html.includes('R$ 125,00'), 'total deveria ser R$ 125,00');
    assert.ok(html.includes('R$ 30,00'), 'frete deveria continuar R$ 30,00');
  }
});

test('emails sem desconto PIX (cartão) não mostram a linha', () => {
  const pedido = pedidoEmail({ payment_method: 'cartao' });
  for (const html of [adminNewOrderEmail(pedido), customerOrderConfirmationEmail(pedido)]) {
    assert.ok(!html.includes('Desconto PIX'));
    assert.ok(html.includes('R$ 130,00'));
  }
});
