// Desconto PIX incide apenas sobre o valor dos produtos (subtotal); o frete não recebe desconto.
// Calculado a partir dos campos originais do pedido, então chamar de novo não aplica o desconto duas vezes.
export function calcularValorPix(order, discountPercent) {
  const subtotal = Number(order.subtotal) || 0;
  const frete = Number(order.delivery_fee) || 0;
  const cupom = Number(order.coupon_discount) || 0;
  const percent = Number(discountPercent) || 0;

  const descontoPix = percent > 0 ? Math.round(subtotal * percent) / 100 : 0;
  const produtos = Math.max(subtotal - cupom - descontoPix, 0);
  const total = Math.round((produtos + frete) * 100) / 100;

  return { descontoPix, total };
}
