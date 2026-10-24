(function () {
  var API = window.API_BASE_URL || 'http://localhost:3333';

  function getAuthHeaders() {
    var headers = {};
    var userData = localStorage.getItem('csp_admin_user');
    if (userData) {
      var user = JSON.parse(userData);
      if (user.token) headers['Authorization'] = 'Bearer ' + user.token;
    }
    return headers;
  }

  function getUser() {
    var data = localStorage.getItem('csp_admin_user');
    return data ? JSON.parse(data) : null;
  }

  var statusLabels = {
    pending: 'Pendente',
    confirmed: 'Confirmado',
    preparing: 'Preparando',
    shipped: 'Enviado',
    ready_for_pickup: 'Pronto para retirada',
    delivered: 'Entregue',
    withdrawn: 'Retirado',
    cancelled: 'Cancelado'
  };

  var pagamentoLabels = {
    pending: 'Aguardando pagamento',
    paid: 'Pago',
    rejected: 'Recusado',
    refunded: 'Reembolsado',
    chargeback: 'Chargeback',
    cancelled: 'Cancelado'
  };

  var pagamentoMetodoLabels = {
    pix: 'PIX',
    cartao: 'Cartão de Crédito'
  };

  var deliveryLabels = {
    delivery: 'Entrega via Correios',
    pickup: 'Retirada na loja',
    negotiate: 'Combinar frete com vendedor'
  };

  function statusBadge(status) {
    return '<span class="badge-status badge-' + status + '">' + (statusLabels[status] || status) + '</span>';
  }

  function formatData(dataStr) {
    if (!dataStr) return '';
    var d = new Date(dataStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatPreco(valor) {
    return 'R$ ' + Number(valor).toFixed(2).replace('.', ',');
  }

  function getTimelineSteps(deliveryType, currentStatus) {
    if (deliveryType === 'pickup') {
      return ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'withdrawn'];
    }
    return ['pending', 'confirmed', 'shipped', 'delivered'];
  }

  function renderTimeline(deliveryType, currentStatus) {
    var steps = getTimelineSteps(deliveryType, currentStatus);
    var found = false;
    var isCancelled = currentStatus === 'cancelled';

    var html = '<div class="timeline">';

    steps.forEach(function (step, i) {
      var dotClass = 'future';
      var labelClass = '';

      if (step === currentStatus) {
        if (isCancelled) {
          dotClass = 'cancelled';
          labelClass = 'current';
        } else {
          dotClass = 'current';
          labelClass = 'current';
        }
        found = true;
      } else if (!found && !isCancelled) {
        dotClass = 'completed';
        labelClass = 'completed';
      } else if (found || isCancelled) {
        dotClass = 'future';
      }

      if (isCancelled && found) {
        dotClass = 'future';
        labelClass = '';
      }

      var label = statusLabels[step] || step;

      if (i > 0) {
        var lineClass = dotClass === 'future' && !isCancelled && !found ? 'completed' : '';
        lineClass = lineClass || (dotClass === 'current' || dotClass === 'cancelled' ? 'completed' : '');
        if (isCancelled && !found) lineClass = 'completed';
        html += '<div class="timeline-line ' + lineClass + '"></div>';
      }

      html += '<div class="timeline-step">' +
        '<div class="timeline-dot ' + dotClass + '">' + (dotClass === 'completed' ? '✓' : dotClass === 'cancelled' ? '✕' : (i + 1)) + '</div>' +
        '<div class="timeline-label ' + labelClass + '">' + label + '</div>' +
      '</div>';
    });

    html += '</div>';
    return html;
  }

  function renderDetalhe(pedido) {
    var items = pedido.items || [];
    var isCancelled = pedido.status === 'cancelled';

    var pagamentoLabel = pagamentoMetodoLabels[pedido.payment_method] || pedido.payment_method || '—';
    var pagamentoStatusLabel = pagamentoLabels[pedido.payment_status] || pedido.payment_status || '—';
    var entregaLabel = deliveryLabels[pedido.delivery_type] || pedido.delivery_type || '—';

    var html = '';

    /* Header */
    html += '<div class="detalhe-header">' +
      '<div class="detalhe-header-topo">' +
        '<h1>Pedido #' + pedido.id + ' <span>— ' + items.length + ' item(ns)</span></h1>' +
        statusBadge(pedido.status) +
      '</div>' +
      '<div class="detalhe-header-data">' + formatData(pedido.created_at) + '</div>' +
    '</div>';

    /* Timeline */
    html += '<div class="detalhe-card">' +
      '<h2>Status do Pedido</h2>' +
      renderTimeline(pedido.delivery_type, pedido.status) +
    '</div>';

    /* Itens */
    html += '<div class="detalhe-card">' +
      '<h2>Itens</h2>';

    items.forEach(function (item) {
      html += '<div class="item-linha">' +
        '<span class="item-linha-nome">' + (window.escapeHtml ? window.escapeHtml(item.item_name) : item.item_name) + '</span>' +
        '<span class="item-linha-qtd">x' + item.quantity + '</span>' +
        '<span class="item-linha-preco">' + formatPreco(item.total) + '</span>' +
      '</div>';
    });

    html += '</div>';

    /* Totais */
    var subtotal = Number(pedido.subtotal) || 0;
    var frete = Number(pedido.shipping_amount) || 0;
    var desconto = Number(pedido.coupon_discount) || 0;
    var total = Number(pedido.total) || 0;

    html += '<div class="detalhe-card">' +
      '<h2>Resumo Financeiro</h2>' +
      '<div class="total-linha"><span>Subtotal</span><span>' + formatPreco(subtotal) + '</span></div>' +
      '<div class="total-linha"><span>Frete</span><span>' + (pedido.delivery_type === 'delivery' ? formatPreco(frete) : 'Grátis') + '</span></div>';

    if (desconto > 0) {
      html += '<div class="total-linha"><span>Cupom (' + (window.escapeHtml ? window.escapeHtml(pedido.coupon_code) : pedido.coupon_code) + ')</span><span style="color:var(--cor-verde-primario)">-' + formatPreco(desconto) + '</span></div>';
    }

    html += '<div class="total-linha grande"><span>Total</span><span>' + formatPreco(total) + '</span></div>' +
    '</div>';

    /* Informações */
    html += '<div class="detalhe-card">' +
      '<h2>Informações</h2>' +
      '<div class="info-grid">' +
        '<div class="info-item">' +
          '<label>Pagamento</label>' +
          '<p>' + pagamentoLabel + '</p>' +
        '</div>' +
        '<div class="info-item">' +
          '<label>Status do Pagamento</label>' +
          '<p>' + pagamentoStatusLabel + '</p>' +
        '</div>' +
        '<div class="info-item">' +
          '<label>Entrega</label>' +
          '<p>' + entregaLabel + '</p>' +
        '</div>';

    if (pedido.delivery_type === 'delivery' && pedido.address) {
      html += '<div class="info-item">' +
        '<label>Endereço</label>' +
        '<p>' + (window.escapeHtml ? window.escapeHtml(pedido.address) : pedido.address) +
        (pedido.number ? ', ' + pedido.number : '') +
        (pedido.neighborhood ? ' - ' + pedido.neighborhood : '') +
        (pedido.city ? '<br>' + pedido.city : '') +
        (pedido.state ? '/' + pedido.state : '') +
        '</p>' +
      '</div>';
    }

    if (pedido.delivery_type === 'pickup' && pedido.pickup_code) {
      html += '<div class="info-item full">' +
        '<label>Código de Retirada</label>' +
        '<div class="pickup-code">' + pedido.pickup_code + '</div>' +
        '<p style="font-size:12px;color:var(--cor-cinza-texto-secundario);margin-top:4px;">Apresente este código ao retirar o pedido na loja.</p>' +
      '</div>';
    }

    if (pedido.delivery_type === 'delivery' && pedido.tracking_code) {
      var linkHtml = pedido.tracking_url
        ? '<a href="' + pedido.tracking_url + '" target="_blank" rel="noopener" style="color:var(--cor-vermelho-primario);text-decoration:underline;">' + pedido.tracking_code + '</a>'
        : '<strong>' + pedido.tracking_code + '</strong>';
      html += '<div class="info-item full">' +
        '<label>Código de Rastreamento</label>' +
        '<p style="font-size:18px;">' + linkHtml + '</p>' +
        (pedido.shipping_service ? '<p style="font-size:12px;color:var(--cor-cinza-texto-secundario);">Serviço: ' + pedido.shipping_service + '</p>' : '') +
      '</div>';
    }

    html += '</div></div>';

    /* Botão cancelar */
    if (pedido.status === 'pending' || pedido.status === 'confirmed') {
      html += '<div style="text-align:center;margin-top:24px;">' +
        '<button class="btn-cancelar" id="btnCancelarPedido" data-pedido-id="' + pedido.id + '">Cancelar Pedido</button>' +
      '</div>';
    }

    return html;
  }

  function carregarDetalhe() {
    var conteudo = document.getElementById('detalheConteudo');
    if (!conteudo) return;

    var params = new URLSearchParams(window.location.search);
    var pedidoId = params.get('id');

    if (!pedidoId) {
      conteudo.innerHTML = '<div class="pedidos-vazio"><h2>Pedido não encontrado</h2><p>ID do pedido não informado.</p><a href="/site/pages/pedidos/index.html">Voltar para Meus Pedidos</a></div>';
      return;
    }

    var user = getUser();
    if (!user) {
      conteudo.innerHTML = '<div class="pedidos-vazio"><h2>Faça login</h2><p>Você precisa estar logado para ver os detalhes do pedido.</p><a href="/site/pages/login/index.html?redirect=pedidos/detalhe/index.html?id=' + pedidoId + '">Fazer login</a></div>';
      return;
    }

    // até a resposta chegar, o conteúdo mostra o skeleton que já vem no HTML
    fetch(API + '/api/orders/my/' + pedidoId, {
      headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
      credentials: 'include'
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Pedido não encontrado.');
        return r.json();
      })
      .then(function (pedido) {
        conteudo.innerHTML = renderDetalhe(pedido);

        /* Cancel button handler */
        var btnCancelar = document.getElementById('btnCancelarPedido');
        if (btnCancelar) {
          btnCancelar.addEventListener('click', function () {
            document.getElementById('cancelModalText').textContent = 'Tem certeza que deseja cancelar o Pedido #' + pedido.id + '? Esta ação não pode ser desfeita.';
            document.getElementById('cancelModalOverlay').style.display = 'flex';
          });
        }
      })
      .catch(function () {
        conteudo.innerHTML = '<div class="pedidos-vazio"><h2>Pedido não encontrado</h2><p>Não foi possível carregar os detalhes deste pedido.</p><a href="/site/pages/pedidos/index.html">Voltar para Meus Pedidos</a></div>';
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    carregarDetalhe();

    /* Modal handlers */
    document.getElementById('cancelModalNo').addEventListener('click', function () {
      document.getElementById('cancelModalOverlay').style.display = 'none';
    });
    document.getElementById('cancelModalOverlay').addEventListener('click', function (e) {
      if (e.target === this) {
        this.style.display = 'none';
      }
    });
    document.getElementById('cancelModalYes').addEventListener('click', function () {
      var modal = document.getElementById('cancelModalOverlay');
      modal.style.display = 'none';

      var params = new URLSearchParams(window.location.search);
      var pedidoId = params.get('id');
      if (!pedidoId) return;

      var conteudo = document.getElementById('detalheConteudo');
      conteudo.innerHTML = '<div class="pedidos-loading">Cancelando pedido...</div>';

      fetch(API + '/api/orders/' + pedidoId + '/cancel', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
        credentials: 'include'
      })
        .then(function (r) {
          if (!r.ok) return r.json().then(function (d) { throw new Error(d.message || 'Erro ao cancelar.'); });
          return r.json();
        })
        .then(function () {
          carregarDetalhe();
        })
        .catch(function (err) {
          conteudo.innerHTML = '<div class="pedidos-vazio"><h2>Erro ao cancelar</h2><p>' + err.message + '</p><a href="javascript:void(0)" onclick="location.reload()">Tentar novamente</a></div>';
        });
    });
  });
})();
