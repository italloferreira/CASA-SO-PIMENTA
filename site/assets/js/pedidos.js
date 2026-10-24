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

  function statusBadge(status) {
    var label = statusLabels[status] || status;
    return '<span class="badge-status badge-' + status + '">' + label + '</span>';
  }

  function pagamentoBadge(paymentStatus, paymentMethod) {
    var label = pagamentoLabels[paymentStatus] || paymentStatus;
    var cls = 'pendente';
    if (paymentStatus === 'paid') cls = 'pago';
    else if (paymentStatus === 'rejected' || paymentStatus === 'refunded' || paymentStatus === 'chargeback') cls = 'recusado';
    var method = paymentMethod === 'pix' ? 'PIX' : paymentMethod === 'cartao' ? 'Cartão' : paymentMethod;
    return '<span class="badge-pagamento ' + cls + '">' + method + ' &middot; ' + label + '</span>';
  }

  function formatData(dataStr) {
    if (!dataStr) return '';
    var d = new Date(dataStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatPreco(valor) {
    return 'R$ ' + Number(valor).toFixed(2).replace('.', ',');
  }

  function renderCard(pedido) {
    var totalItens = (pedido.items || []).reduce(function (sum, i) { return sum + Number(i.quantity); }, 0);

    return '<div class="pedido-card" onclick="window.location.href=\'/site/pages/pedidos/detalhe/index.html?id=' + pedido.id + '\'">' +
      '<div class="pedido-card-topo">' +
        '<div class="pedido-card-numero">Pedido #' + pedido.id + ' <span>— ' + totalItens + ' item(ns)</span></div>' +
        statusBadge(pedido.status) +
      '</div>' +
      '<div class="pedido-card-info">' +
        '<span>' + formatData(pedido.created_at) + '</span>' +
        '<span>' + (pedido.delivery_type === 'delivery' ? 'Entrega' : pedido.delivery_type === 'pickup' ? 'Retirada' : 'Combinar frete') + '</span>' +
      '</div>' +
      '<div class="pedido-card-footer">' +
        '<span>' + pagamentoBadge(pedido.payment_status, pedido.payment_method) + '</span>' +
        '<span class="pedido-card-total">' + formatPreco(pedido.total) + '</span>' +
      '</div>' +
    '</div>';
  }

  function carregarPedidos() {
    var lista = document.getElementById('pedidosLista');
    if (!lista) return;

    var user = getUser();
    if (!user) {
      lista.innerHTML = '<div class="pedidos-vazio"><div class="icone">🔒</div><h2>Faça login para ver seus pedidos</h2><p>Você precisa estar logado para acessar o histórico de pedidos.</p><a href="/site/pages/login/index.html?redirect=pedidos">Fazer login</a></div>';
      return;
    }

    // até a resposta chegar, a lista mostra o skeleton que já vem no HTML
    fetch(API + '/api/orders/my', {
      headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
      credentials: 'include'
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Erro ao carregar pedidos.');
        return r.json();
      })
      .then(function (data) {
        var pedidos = data.orders || [];

        if (pedidos.length === 0) {
          lista.innerHTML = '<div class="pedidos-vazio"><div class="icone">📦</div><h2>Nenhum pedido encontrado</h2><p>Você ainda não realizou nenhuma compra conosco.</p><a href="/site/pages/index.html">Começar a comprar</a></div>';
          return;
        }

        lista.innerHTML = pedidos.map(renderCard).join('');
      })
      .catch(function () {
        lista.innerHTML = '<div class="pedidos-vazio"><div class="icone">⚠️</div><h2>Erro ao carregar</h2><p>Não foi possível carregar seus pedidos. Tente novamente mais tarde.</p><a href="javascript:location.reload()">Tentar novamente</a></div>';
      });
  }

  document.addEventListener('DOMContentLoaded', carregarPedidos);
})();
