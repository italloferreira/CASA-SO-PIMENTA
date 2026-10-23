import { MercadoPagoConfig, Payment, WebhookSignatureValidator, InvalidWebhookSignatureError } from 'mercadopago';
import { pool } from '../database/connection.js';
import crypto from 'crypto';
import { calcularValorPix } from '../utils/pixDiscount.js';

function getAccessToken() {
  return process.env.NODE_ENV === 'production'
    ? process.env.MP_ACCESS_TOKEN
    : process.env.MP_ACCESS_TOKEN_TEST;
}

export function getPublicKey() {
  return process.env.NODE_ENV === 'production'
    ? process.env.MP_PUBLIC_KEY
    : process.env.MP_PUBLIC_KEY_TEST;
}

function getMpClient() {
  const token = getAccessToken();
  return new MercadoPagoConfig({ accessToken: token });
}

function getPaymentInstance() {
  return new Payment(getMpClient());
}

const MP_API = 'https://api.mercadopago.com/v1';

async function createOrder(body) {
  const res = await fetch(`${MP_API}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAccessToken()}`,
      'X-Idempotency-Key': crypto.randomUUID()
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('MP API error:', JSON.stringify(data, null, 2));
    console.error('Request body:', JSON.stringify(body, null, 2));
    const msg = data.errors?.[0]?.message || data.message || 'Erro na API do Mercado Pago';
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function traduzirErroMP(err) {
  const data = err.cause?.[0] || err.data || {};
  const raw = data.description || data.message || err.message || '';
  const map = {
    'invalid users involved': 'Credenciais do Mercado Pago inválidas ou incompatíveis.',
    'el pago no puede ser aprobado': 'O pagamento não pôde ser aprovado.',
    'payment cannot be approved': 'O pagamento não pôde ser aprovado.',
    'invalid card token': 'Token do cartão inválido. Refresque a página e tente novamente.',
    'transaction_amount must be greater than 0': 'Valor do pedido é inválido para pagamento.',
    'payment_method_id: value is required': 'Bandeira do cartão não reconhecida.',
    'issuer_id: value is required': 'Bandeira do cartão não reconhecida.',
    'unexpected error': 'Erro inesperado ao processar o pagamento. Tente novamente.',
    'unauthorized': 'Não autorizado. Verifique as credenciais do Mercado Pago.'
  };
  const lower = String(raw).toLowerCase();
  for (const [key, value] of Object.entries(map)) {
    if (lower.includes(key)) return value;
  }
  return raw || 'Erro ao processar pagamento com cartão.';
}

export async function processCard(req, res) {
  const { orderId, token, installments, paymentMethodId, issuerId, email, cpf, device_id, registration_date } = req.body;

  if (!orderId || !token || !installments || !email || !cpf) {
    return res.status(400).json({ message: 'Dados incompletos para pagamento com cartão.' });
  }

  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const order = orderResult.rows[0];
    if (!order) {
      return res.status(404).json({ message: 'Pedido não encontrado.' });
    }

    if (order.user_id && req.user && order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Acesso negado. Este pedido não pertence ao seu usuário.' });
    }

    if (!Number(order.total) || Number(order.total) <= 0) {
      return res.status(400).json({ message: 'Valor do pedido é inválido para pagamento.' });
    }

    const orderItems = await pool.query(
      'SELECT item_name, unit_price, quantity FROM order_items WHERE order_id = $1',
      [orderId]
    );

    const additionalInfo = {
      shipments: {
        receiver_address: {
          zip_code: order.cep || '',
          city_name: order.city || '',
          state_name: order.state || '',
          street_name: order.address || '',
          street_number: order.number || ''
        }
      },
      items: orderItems.rows.map(function (item) {
        return {
          title: item.item_name,
          unit_price: Number(item.unit_price),
          quantity: item.quantity,
          category_id: 'MLB11878'
        };
      })
    };

    if (registration_date) {
      additionalInfo.payer = {
        registration_date: registration_date
      };
    }

    const paymentBody = {
      transaction_amount: Number(order.total),
      token,
      installments: parseInt(installments),
      payment_method_id: paymentMethodId || undefined,
      issuer_id: issuerId || undefined,
      statement_descriptor: 'CASA SO PIMENTA',
      description: 'Casa So Pimenta - Pedido #' + String(orderId),
      payer: {
        email,
        identification: {
          type: 'CPF',
          number: cpf.replace(/\D/g, '')
        }
      },
      additional_info: additionalInfo,
      external_reference: String(orderId)
    };

    if (device_id) {
      paymentBody.device_id = device_id;
    }

    const notificationUrl = process.env.MP_NOTIFICATION_URL || undefined;
    if (notificationUrl) {
      paymentBody.notification_url = notificationUrl;
    }

    const payment = getPaymentInstance();
    const result = await payment.create({
      body: paymentBody,
      requestOptions: { idempotencyKey: 'card-' + String(orderId) + '-' + Date.now() }
    });

    const mpPaymentStatus = result.status;
    const mpStatusDetail = result.status_detail;

    let paymentStatus = 'pending';
    let orderStatus = order.status;

    if (mpPaymentStatus === 'approved' || mpPaymentStatus === 'processed') {
      paymentStatus = 'paid';
      orderStatus = 'confirmed';
    } else if (mpPaymentStatus === 'rejected') {
      paymentStatus = 'rejected';
    } else if (mpPaymentStatus === 'refunded') {
      paymentStatus = 'refunded';
      orderStatus = 'cancelled';
    } else if (mpPaymentStatus === 'charged_back') {
      paymentStatus = 'chargeback';
    } else if (mpPaymentStatus === 'cancelled' || mpPaymentStatus === 'expired') {
      paymentStatus = 'cancelled';
      orderStatus = 'cancelled';
    } else if (mpPaymentStatus === 'in_process' || mpPaymentStatus === 'pending') {
      paymentStatus = 'pending';
    }

    const mpPaymentId = result.id ? String(result.id) : null;

    await pool.query(`
      UPDATE orders
      SET payment_status = $1, status = $2, payment_external_id = $3,
          payment_method = 'cartao', cpf = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
    `, [paymentStatus, orderStatus, mpPaymentId, cpf.replace(/\D/g, ''), orderId]);

    res.json({
      success: paymentStatus === 'paid',
      status: mpPaymentStatus,
      paymentId: mpPaymentId,
      statusDetail: mpStatusDetail
    });
  } catch (err) {
    console.error('Erro processCard:', err);
    const cause = err.cause && err.cause[0] ? err.cause[0] : null;
    if (cause) {
      console.error('MP card error -> status:', err.status, '| code:', cause.code || err.error || '', '| description:', cause.description || '', '| message:', cause.message || '');
    } else {
      console.error('MP card error -> status:', err.status, '| error:', err.error || '', '| message:', err.message || '');
    }
    res.status(err.status || 500).json({ message: traduzirErroMP(err) });
  }
}

export async function processPix(req, res) {
  const { orderId, email, cpf } = req.body;

  if (!orderId || !email || !cpf) {
    return res.status(400).json({ message: 'Dados incompletos para pagamento PIX.' });
  }

  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const order = orderResult.rows[0];
    if (!order) {
      return res.status(404).json({ message: 'Pedido não encontrado.' });
    }

    if (order.user_id && req.user && order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Acesso negado. Este pedido não pertence ao seu usuário.' });
    }

    const pixSetting = await pool.query("SELECT value FROM settings WHERE key = 'pix_discount_percent'");
    const pixDiscountPercent = Number(pixSetting.rows[0]?.value) || 0;
    const orderTotal = Number(order.total);
    const amount = pixDiscountPercent > 0
      ? calcularValorPix(order, pixDiscountPercent).total
      : orderTotal;

    const result = await createOrder({
      type: 'online',
      processing_mode: 'automatic',
      total_amount: String(amount.toFixed(2)),
      external_reference: String(orderId),
      payer: { email },
      transactions: {
        payments: [{
          amount: String(amount.toFixed(2)),
          payment_method: {
            id: 'pix',
            type: 'bank_transfer'
          }
        }]
      }
    });

    const payment = result.transactions?.payments?.[0];
    const pmData = payment?.payment_method || payment?.payment_method_data || payment?.payment_methods?.[0] || payment?.payment_data || {};
    const qrCode = pmData.qr_code || payment?.qr_code || null;
    const qrCodeBase64 = pmData.qr_code_base64 || payment?.qr_code_base64 || pmData.data?.qr_code_base64 || null;
    const ticketUrl = pmData.ticket_url || payment?.ticket_url || null;
    const mpPaymentId = payment?.id ? String(payment.id) : result.payment_id || String(result.id) || null;
    const mpOrderId = result.id || payment?.order_id || null;

    if (pixDiscountPercent > 0 && amount !== orderTotal) {
      await pool.query(`
        UPDATE orders
        SET payment_status = 'pending', payment_external_id = $1,
            payment_method = 'pix', cpf = $2, total = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [mpOrderId, cpf.replace(/\D/g, ''), amount, orderId]);
    } else {
      await pool.query(`
        UPDATE orders
        SET payment_status = 'pending', payment_external_id = $1,
            payment_method = 'pix', cpf = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [mpOrderId, cpf.replace(/\D/g, ''), orderId]);
    }

    res.json({
      success: true,
      paymentId: mpOrderId,
      paymentTransactionId: mpPaymentId,
      qrCode,
      qrCodeBase64,
      ticketUrl
    });
  } catch (err) {
    console.error('Erro processPix:', err);
    const data = err.data;
    const message = data?.errors?.[0]?.message || data?.message || err.message || 'Erro ao gerar cobrança PIX.';
    res.status(err.status || 500).json({ message });
  }
}

export async function handleWebhook(req, res) {
  try {
    if (process.env.MP_WEBHOOK_SECRET) {
      try {
        WebhookSignatureValidator.validate({
          xSignature: req.headers['x-signature'],
          xRequestId: req.headers['x-request-id'],
          dataId: req.query['data.id'],
          secret: process.env.MP_WEBHOOK_SECRET
        });
      } catch (err) {
        if (err instanceof InvalidWebhookSignatureError) {
          console.error('Webhook: assinatura inválida');
          return res.status(401).json({ error: 'Assinatura inválida' });
        }
        throw err;
      }
    } else if (process.env.NODE_ENV === 'production') {
      console.error('Webhook: MP_WEBHOOK_SECRET não configurado em produção');
      return res.status(500).json({ error: 'Webhook não configurado' });
    } else {
      console.warn('Webhook: MP_WEBHOOK_SECRET não configurado, validação ignorada (dev)');
    }

    const body = req.body;
    const type = body.type || req.query.type;
    const data = body.data || { id: req.query['data.id'] };

    let orderId = null;
    let mpPaymentStatus = null;
    let mpStatusDetail = null;
    let mpOrderStatus = null;
    let mpPaymentId = null;

    if (type === 'payment' && data?.id) {
      const payment = getPaymentInstance();
      const result = await payment.get({ id: data.id });

      mpPaymentId = String(result.id);
      orderId = result.external_reference;
      mpPaymentStatus = result.status;
      mpStatusDetail = result.status_detail;

    } else if (type === 'order' && data?.id) {
      const orderRes = await fetch(`${MP_API}/orders/${data.id}`, {
        headers: { 'Authorization': `Bearer ${getAccessToken()}` }
      });
      const result = await orderRes.json();

      mpOrderStatus = result.status;
      orderId = result.external_reference;
      const payment = result.transactions?.payments?.[0];
      if (payment) {
        mpPaymentId = String(payment.id);
        mpPaymentStatus = payment.status;
        mpStatusDetail = payment.status_detail;
      }
    }

    if (!orderId) {
      return res.status(200).json({ received: true });
    }

    let paymentStatus = 'pending';
    let orderStatus = 'pending';

    const finalStatus = mpPaymentStatus || mpOrderStatus;

    if (finalStatus === 'processed' || finalStatus === 'approved') {
      paymentStatus = 'paid';
      orderStatus = 'confirmed';
    } else if (finalStatus === 'rejected') {
      paymentStatus = 'rejected';
    } else if (finalStatus === 'refunded') {
      paymentStatus = 'refunded';
      orderStatus = 'cancelled';
    } else if (finalStatus === 'charged_back') {
      paymentStatus = 'chargeback';
    } else if (finalStatus === 'cancelled' || finalStatus === 'expired') {
      paymentStatus = 'cancelled';
      orderStatus = 'cancelled';
    } else if (finalStatus === 'action_required' && mpStatusDetail === 'waiting_transfer') {
      paymentStatus = 'pending';
    }

    const externalId = mpPaymentId || data?.id || null;

    await pool.query(`
      UPDATE orders
      SET payment_status = $1, status = $2, payment_external_id = COALESCE($3, payment_external_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND (payment_status IS DISTINCT FROM $1 OR status IS DISTINCT FROM $2)
    `, [paymentStatus, orderStatus, externalId, orderId]);

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Erro handleWebhook:', err);
    res.status(200).json({ received: true });
  }
}

export async function getPaymentStatus(req, res) {
  const { paymentId } = req.params;

  if (!paymentId) {
    return res.status(400).json({ message: 'paymentId é obrigatório.' });
  }

  try {
    const paymentInstance = getPaymentInstance();
    try {
      const result = await paymentInstance.get({ id: paymentId });
      return res.json({
        status: result.status,
        statusDetail: result.status_detail,
        amount: result.transaction_amount
      });
    } catch (_) {
      // Not a payment ID, try as order
    }

    const ordRes = await fetch(`${MP_API}/orders/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${getAccessToken()}` }
    });
    if (ordRes.ok) {
      const result = await ordRes.json();
      const payment = result.transactions?.payments?.[0];
      return res.json({
        status: payment?.status || result.status,
        statusDetail: payment?.status_detail,
        amount: result.total_amount
      });
    }

    res.status(404).json({ message: 'Pagamento não encontrado no Mercado Pago.' });
  } catch (err) {
    console.error('Erro getPaymentStatus:', err);
    res.status(500).json({ message: 'Erro ao consultar status do pagamento.' });
  }
}

export async function getMpPublicKey(req, res) {
  res.json({ publicKey: getPublicKey() });
}
