var API = window.API_BASE_URL || 'http://localhost:3333';
var etapaAtual = 1;
var dadosPerfil = null;
var freteSelecionado = null;
var metodoPagamento = null;
var editandoDados = false;
var pedidoCriado = null;
var mp = null;
var cardForm = null;
var mpPublicKey = '';
var pixPollingInterval = null;
var deliveryType = 'delivery';
var shippingData = null;
var cupomAplicado = null;
var isSubmitting = false;

var escHtml = window.escapeHtml || function (s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;') : ''; };

function getAuthHeaders() {
  var headers = {};
  var userData = localStorage.getItem('csp_admin_user');
  if (userData) {
    var user = JSON.parse(userData);
    if (user.token) {
      headers['Authorization'] = 'Bearer ' + user.token;
    }
  }
  return headers;
}

function getUsuario() {
  var data = localStorage.getItem('csp_admin_user');
  return data ? JSON.parse(data) : null;
}

function formatarTelefone(valor) {
  var nums = valor.replace(/\D/g, '').slice(0, 11);
  if (nums.length <= 10) {
    return nums.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim();
  }
  return nums.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim();
}

function formatarCEP(valor) {
  return valor.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
}

function formatarCPF(valor) {
  var nums = valor.replace(/\D/g, '').slice(0, 11);
  return nums.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatarPreco(valor) {
  return 'R$ ' + Number(valor).toFixed(2).replace('.', ',');
}

function limparErros() {
  document.querySelectorAll('.campo-erro').forEach(function (el) {
    el.textContent = '';
  });
  document.querySelectorAll('.campo-grupo input.erro, .campo-grupo select.erro').forEach(function (el) {
    el.classList.remove('erro');
  });
}

function mostrarErro(idCampo, mensagem) {
  var erroEl = document.getElementById('erro' + idCampo.charAt(0).toUpperCase() + idCampo.slice(1));
  if (erroEl) erroEl.textContent = mensagem;
  var input = document.getElementById('input' + idCampo.charAt(0).toUpperCase() + idCampo.slice(1));
  if (input) input.classList.add('erro');
}

function mostrarErroInline(mensagem) {
  var existing = document.querySelector('.erro-inline-pagamento');
  if (existing) existing.remove();
  var div = document.createElement('div');
  div.className = 'erro-inline-pagamento';
  div.style.cssText = 'background:#fde8e8;color:#860000;padding:12px;border-radius:6px;margin-top:12px;font-size:14px;';
  div.textContent = mensagem;
  var target = document.getElementById('detalhesCartao') || document.querySelector('.pagamento-opcoes');
  if (target) target.parentNode.insertBefore(div, target.nextSibling);
}

function mostrarLoading(show) {
  var btn = document.getElementById('btnConfirmarPedido');
  if (show) {
    btn.disabled = true;
    document.querySelector('.btn-texto').textContent = 'Processando...';
    document.getElementById('btnSpinner').style.display = '';
  } else {
    btn.disabled = false;
    document.querySelector('.btn-texto').textContent = 'Confirmar Pedido';
    document.getElementById('btnSpinner').style.display = 'none';
  }
}

function redirecionarSessaoExpirada() {
  localStorage.removeItem('csp_admin_user');
  window.location.href = '/site/pages/login/index.html?redirect=checkout&expired=1';
}

(function () {
  if (!getUsuario()) {
    window.location.href = '/site/pages/login/index.html?redirect=checkout';
    return;
  }
})();

function carregarPerfil() {
  var banner = document.getElementById('bemVindoTexto');
  var usuario = getUsuario();
  if (usuario) {
    banner.textContent = 'Ol\u00e1, ' + (usuario.name || usuario.email) + '!';
  }

  fetch(API + '/api/auth/profile', {
    headers: getAuthHeaders(),
    credentials: 'include'
  })
    .then(function (r) {
      if (r.status === 401) {
        redirecionarSessaoExpirada();
        return null;
      }
      return r.json();
    })
    .then(function (perfil) {
      if (!perfil) return;
      dadosPerfil = perfil;
      preencherPerfil(perfil);
      preencherEntrega(perfil);
    })
    .catch(function () {
      dadosPerfil = getUsuario();
      preencherPerfil(dadosPerfil);
    });
}

function preencherPerfil(perfil) {
  document.getElementById('inputNome').value = perfil.name || '';
  document.getElementById('inputEmail').value = perfil.email || '';
  document.getElementById('inputTelefone').value = perfil.phone || '';
}

function preencherEntrega(perfil) {
  if (perfil.cep) {
    document.getElementById('inputCep').value = perfil.cep;
    setTimeout(function () {
      buscarCEP(true);
    }, 300);
  }
}

window.sairDaConta = function () {
  fetch(API + '/api/auth/logout', { method: 'POST', headers: getAuthHeaders(), credentials: 'include' }).catch(function () {});
  localStorage.removeItem('csp_admin_user');
  window.location.href = '/site/pages/login/index.html?redirect=checkout';
};

window.toggleEditarDados = function () {
  editandoDados = !editandoDados;
  var inputs = ['inputNome', 'inputEmail', 'inputTelefone'];
  var readonly = !editandoDados;
  inputs.forEach(function (id) {
    document.getElementById(id).readOnly = readonly;
    if (!readonly) {
      document.getElementById(id).style.background = '';
      document.getElementById(id).style.color = '';
    } else {
      document.getElementById(id).style.background = 'var(--cor-cinza-hover)';
      document.getElementById(id).style.color = 'var(--cor-cinza-texto-secundario)';
    }
  });
  document.getElementById('btnEditarDados').style.display = editandoDados ? 'none' : '';
  document.getElementById('btnSalvarDados').style.display = editandoDados ? '' : 'none';
};

window.salvarDadosPerfil = function () {
  var nome = document.getElementById('inputNome').value.trim();
  var email = document.getElementById('inputEmail').value.trim();
  var telefone = document.getElementById('inputTelefone').value.trim();

  limparErros();
  var valido = true;

  if (!nome) { mostrarErro('Nome', 'Informe seu nome completo.'); valido = false; }
  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) { mostrarErro('Email', 'Informe um e-mail v\u00e1lido.'); valido = false; }
  if (!telefone || telefone.replace(/\D/g, '').length < 10) { mostrarErro('Telefone', 'Informe um telefone com DDD.'); valido = false; }
  if (!valido) return;

  var btn = document.getElementById('btnSalvarDados');
  btn.textContent = 'Salvando...';
  btn.disabled = true;

  fetch(API + '/api/auth/profile', {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()), credentials: 'include',
    body: JSON.stringify({ name: nome, phone: telefone })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.user) {
        localStorage.setItem('csp_admin_user', JSON.stringify(data.user));
        dadosPerfil = data.user;
      }
      window.toggleEditarDados();
    })
    .catch(function () { mostrarErro('Nome', 'Erro ao salvar. Tente novamente.'); })
    .finally(function () { btn.textContent = '\u2713 Salvar dados'; btn.disabled = false; });
};

function validarEtapa1() {
  limparErros();
  var valido = true;

  var nome = document.getElementById('inputNome').value.trim();
  var email = document.getElementById('inputEmail').value.trim();
  var telefone = document.getElementById('inputTelefone').value.trim();
  var cpf = document.getElementById('inputCpf').value.replace(/\D/g, '');

  if (!nome) { mostrarErro('Nome', 'Nome completo \u00e9 obrigat\u00f3rio.'); valido = false; }
  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) { mostrarErro('Email', 'Informe um e-mail v\u00e1lido.'); valido = false; }
  if (!telefone || telefone.replace(/\D/g, '').length < 10) { mostrarErro('Telefone', 'Informe um telefone com DDD.'); valido = false; }

  if (!validarCPF(cpf)) {
    mostrarErro('Cpf', 'Informe um CPF v\u00e1lido.');
    valido = false;
  }

  return valido;
}

function validarCPF(cpf) {
  if (!cpf || cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  var soma = 0;
  for (var i = 0; i < 9; i++) soma += parseInt(cpf.charAt(i)) * (10 - i);
  var resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== parseInt(cpf.charAt(9))) return false;

  soma = 0;
  for (var j = 0; j < 10; j++) soma += parseInt(cpf.charAt(j)) * (11 - j);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== parseInt(cpf.charAt(10))) return false;

  return true;
}

var buscandoCep = false;

window.buscarCEP = function (auto) {
  var cepInput = document.getElementById('inputCep');
  var cep = cepInput.value.replace(/\D/g, '');
  var erroEl = document.getElementById('erroCep');
  var infoEl = document.getElementById('infoCep');

  if (cep.length !== 8) { erroEl.textContent = 'CEP deve ter 8 d\u00edgitos.'; return; }

  erroEl.textContent = '';
  infoEl.textContent = 'Buscando...';
  buscandoCep = true;
  document.getElementById('btnBuscarCep').disabled = true;

  fetch('https://viacep.com.br/ws/' + cep + '/json/')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.erro) { infoEl.textContent = 'CEP n\u00e3o encontrado.'; infoEl.style.color = 'var(--cor-vermelho-primario)'; return; }

      infoEl.textContent = (data.logradouro || '') + ', ' + (data.bairro || '') + ' \u2014 ' + (data.localidade || '') + '/' + (data.uf || '');
      infoEl.style.color = 'var(--cor-cinza-texto-secundario)';

      document.getElementById('inputEndereco').value = data.logradouro || '';
      document.getElementById('inputBairro').value = data.bairro || '';
      document.getElementById('inputCidade').value = data.localidade || '';
      document.getElementById('inputEstado').value = data.uf || '';
      document.getElementById('inputCep').value = formatarCEP(cep);

      if (!auto) { document.getElementById('inputNumero').focus(); }

      if (deliveryType === 'delivery') {
        calcularFreteDaAPI(cep);
      }
    })
    .catch(function () { infoEl.textContent = 'Erro ao buscar CEP. Tente novamente.'; infoEl.style.color = 'var(--cor-vermelho-primario)'; })
    .finally(function () { buscandoCep = false; document.getElementById('btnBuscarCep').disabled = false; });
};

window.selecionarTipoEntrega = function (tipo) {
  deliveryType = tipo;
  freteSelecionado = null;
  shippingData = null;

  document.querySelectorAll('.delivery-option').forEach(function (c) { c.classList.remove('selecionado'); });
  document.querySelector('.delivery-option[data-delivery="' + tipo + '"]').classList.add('selecionado');

  document.getElementById('deliveryRadioDelivery').textContent = tipo === 'delivery' ? '\u25C9' : '\u25CB';
  document.getElementById('deliveryRadioPickup').textContent = tipo === 'pickup' ? '\u25C9' : '\u25CB';
  document.getElementById('deliveryRadioNegotiate').textContent = tipo === 'negotiate' ? '\u25C9' : '\u25CB';

  document.getElementById('deliveryAddressFields').style.display = tipo === 'delivery' ? '' : 'none';
  document.getElementById('pickupInfo').style.display = tipo === 'pickup' ? '' : 'none';
  document.getElementById('negotiateInfo').style.display = tipo === 'negotiate' ? '' : 'none';

  if (tipo === 'pickup') {
    freteSelecionado = { tipo: 'retirada', valor: 0 };
  } else if (tipo === 'negotiate') {
    freteSelecionado = { tipo: 'negociar', valor: 0 };
  } else {
    var cep = document.getElementById('inputCep').value.replace(/\D/g, '');
    if (cep.length === 8) {
      calcularFreteDaAPI(cep);
    }
  }

  atualizarResumo();
};

function calcularFreteDaAPI(cep) {
  var carrinho = getCarrinho();
  if (carrinho.length === 0) return;

  var freteOpcoes = document.getElementById('freteOpcoes');
  var freteLista = document.getElementById('freteLista');
  var freteLoading = document.getElementById('freteLoading');
  var freteErro = document.getElementById('freteErro');

  freteLista.innerHTML = '';
  freteErro.style.display = 'none';
  freteLoading.style.display = '';
  freteOpcoes.style.display = '';
  freteSelecionado = null;

  fetch(API + '/api/orders/calculate-shipping', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()), credentials: 'include',
    body: JSON.stringify({
      cep: cep,
      cart: carrinho.map(function (i) { return { product_id: i.tipo === 'kit' ? null : Number(i.id), kit_id: i.tipo === 'kit' ? Number(i.id) : null, quantity: i.quantidade }; })
    })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      freteLoading.style.display = 'none';
      if (!data.success || !data.services || data.services.length === 0) {
        freteErro.textContent = data.message || 'Nenhuma op\u00e7\u00e3o de frete dispon\u00edvel para este CEP.';
        freteErro.style.display = '';
        return;
      }

      shippingData = {
        selected_box: data.selected_box,
        services: data.services
      };

      freteLista.innerHTML = '';
      data.services.forEach(function (svc) {
        var card = document.createElement('div');
        card.className = 'frete-card';
        card.setAttribute('data-name', svc.name);
        card.setAttribute('data-service', svc.service);
        card.setAttribute('data-price', svc.price);
        card.setAttribute('data-delivery-time', svc.delivery_time);
        card.setAttribute('data-box', data.selected_box ? data.selected_box.name : '');
        card.onclick = function () { selecionarFrete(this); };
        card.innerHTML =
          '<div class="frete-radio"></div>' +
          '<div class="frete-info">' +
            '<strong>' + svc.name + '</strong>' +
            '<span>At\u00e9 ' + svc.delivery_time + ' dias \u00fateis</span>' +
          '</div>' +
          '<div class="frete-valor">' + formatarPreco(svc.price) + '</div>';
        freteLista.appendChild(card);
      });

      if (data.services.length === 1) {
        selecionarFrete(freteLista.querySelector('.frete-card'));
      }
    })
    .catch(function () {
      freteLoading.style.display = 'none';
      freteErro.textContent = 'Erro ao calcular frete. Tente novamente.';
      freteErro.style.display = '';
    });
}

window.aplicarCupom = function () {
  var input = document.getElementById('inputCupom');
  var statusEl = document.getElementById('cupomStatus');
  var btn = document.getElementById('btnAplicarCupom');
  var codigo = input.value.trim().toUpperCase();

  if (!codigo) {
    statusEl.className = 'cupom-status error';
    statusEl.textContent = 'Digite um código de cupom.';
    return;
  }

  btn.disabled = true;
  statusEl.className = 'cupom-status loading';
  statusEl.textContent = 'Validando...';

  var subtotal = calcularSubtotal();

  fetch(API + '/api/coupons/validate', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()), credentials: 'include',
    body: JSON.stringify({ code: codigo, subtotal: subtotal })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.success) throw new Error(data.message || 'Cupom inválido.');
      cupomAplicado = data.coupon;
      statusEl.className = 'cupom-status success';
      statusEl.textContent = 'Cupom aplicado: ' + codigo + ' (' + (data.coupon.discount_type === 'percentage' ? data.coupon.discount_value + '%' : 'R$ ' + Number(data.coupon.discount_value).toFixed(2).replace('.', ',')) + ')';
      input.readOnly = true;
      btn.textContent = 'Remover';
      btn.onclick = removerCupom;
      atualizarResumo();
      sincronizarCardFormComTotal();
    })
    .catch(function (err) {
      cupomAplicado = null;
      statusEl.className = 'cupom-status error';
      statusEl.textContent = err.message || 'Erro ao validar cupom.';
    })
    .finally(function () {
      btn.disabled = false;
    });
};

function removerCupom() {
  cupomAplicado = null;
  var input = document.getElementById('inputCupom');
  var btn = document.getElementById('btnAplicarCupom');
  var statusEl = document.getElementById('cupomStatus');
  input.readOnly = false;
  input.value = '';
  statusEl.className = 'cupom-status';
  statusEl.textContent = '';
  btn.textContent = 'Aplicar';
  btn.onclick = aplicarCupom;
  atualizarResumo();
  sincronizarCardFormComTotal();
}

window.selecionarFrete = function (el) {
  document.querySelectorAll('.frete-card').forEach(function (c) { c.classList.remove('selecionado'); });
  el.classList.add('selecionado');
  freteSelecionado = {
    tipo: 'entrega',
    valor: Number(el.getAttribute('data-price')),
    service: el.getAttribute('data-service'),
    name: el.getAttribute('data-name'),
    delivery_time: Number(el.getAttribute('data-delivery-time')),
    box: el.getAttribute('data-box')
  };
  atualizarResumo();
  sincronizarCardFormComTotal();
};

function validarEtapa2() {
  limparErros();
  var valido = true;

  if (deliveryType === 'pickup' || deliveryType === 'negotiate') {
    return true;
  }

  var cep = document.getElementById('inputCep').value.replace(/\D/g, '');
  var endereco = document.getElementById('inputEndereco').value.trim();
  var numero = document.getElementById('inputNumero').value.trim();
  var cidade = document.getElementById('inputCidade').value.trim();
  var estado = document.getElementById('inputEstado').value.trim();

  if (cep.length !== 8) { mostrarErro('Cep', 'Informe um CEP v\u00e1lido.'); valido = false; }
  if (!endereco) { mostrarErro('Endereco', 'Endere\u00e7o \u00e9 obrigat\u00f3rio.'); valido = false; }
  if (!numero) { mostrarErro('Numero', 'N\u00famero \u00e9 obrigat\u00f3rio.'); valido = false; }
  if (!cidade) { mostrarErro('Cidade', 'Cidade \u00e9 obrigat\u00f3ria.'); valido = false; }
  if (!estado || estado.length !== 2) { mostrarErro('Estado', 'Estado \u00e9 obrigat\u00f3rio (ex: MG).'); valido = false; }

  if (!freteSelecionado) {
    var erroFrete = document.querySelector('.frete-opcoes');
    var msg = document.createElement('span');
    msg.className = 'campo-erro';
    msg.textContent = 'Selecione uma op\u00e7\u00e3o de frete.';
    msg.style.marginTop = '8px';
    msg.style.display = 'block';
    var existente = erroFrete.querySelector('.campo-erro');
    if (!existente) erroFrete.appendChild(msg);
    valido = false;
  }

  return valido;
}

window.selecionarPagamento = function (el) {
  document.querySelectorAll('.pagamento-card').forEach(function (c) { c.classList.remove('selecionado'); });
  el.classList.add('selecionado');
  metodoPagamento = el.getAttribute('data-metodo');

  var elPix = document.getElementById('detalhesPix');
  if (elPix) elPix.style.display = metodoPagamento === 'pix' ? '' : 'none';
  document.getElementById('detalhesCartao').style.display = metodoPagamento === 'cartao' ? '' : 'none';


  if (metodoPagamento === 'cartao') {
    if (!cardForm) {
      iniciarCardForm();
    } else {
      cardForm.unmount();
      cardForm.mount();
      cardFormMountedAmount = getTotalFinal();
    }
  }

  atualizarResumo();
};

function validarEtapa3() {
  limparErros();
  var valido = true;

  if (!metodoPagamento) {
    var pagOpcoes = document.querySelector('.pagamento-opcoes');
    var msg = document.createElement('span');
    msg.className = 'campo-erro';
    msg.textContent = 'Selecione um m\u00e9todo de pagamento.';
    msg.style.marginTop = '8px';
    msg.style.display = 'block';
    var existente = pagOpcoes.querySelector('.campo-erro');
    if (!existente) pagOpcoes.appendChild(msg);
    valido = false;
  }

  return valido;
}

window.proximaEtapa = function () {
  var valido = false;
  if (etapaAtual === 1) valido = validarEtapa1();
  else if (etapaAtual === 2) valido = validarEtapa2();
  else if (etapaAtual === 3) valido = validarEtapa3();

  if (!valido) return;

  if (etapaAtual < 3) {
    document.getElementById('etapa' + etapaAtual).classList.remove('ativo');
    var stepAtual = document.querySelector('.step-item[data-step="' + etapaAtual + '"]');
    stepAtual.classList.remove('ativo');
    stepAtual.classList.add('completo');

    etapaAtual++;
    document.getElementById('etapa' + etapaAtual).classList.add('ativo');
    document.querySelector('.step-item[data-step="' + etapaAtual + '"]').classList.add('ativo');

    document.getElementById('btnVoltarEtapa').style.display = '';
  }

  if (etapaAtual === 3) {
    document.getElementById('btnProximaEtapa').style.display = 'none';
    document.getElementById('btnConfirmarPedido').disabled = false;
    setTimeout(function () {
      if (metodoPagamento === 'cartao' && cardForm) {
        cardFormMountedAmount = getTotalFinal();
        cardForm.mount();
      }
    }, 100);
  }

  atualizarResumo();
};

window.etapaAnterior = function () {
  if (etapaAtual > 1) {
    var stepAtualEl = document.querySelector('.step-item[data-step="' + etapaAtual + '"]');
    stepAtualEl.classList.remove('ativo');

    document.getElementById('etapa' + etapaAtual).classList.remove('ativo');
    etapaAtual--;
    document.getElementById('etapa' + etapaAtual).classList.add('ativo');
    document.querySelector('.step-item[data-step="' + etapaAtual + '"]').classList.add('ativo');
    document.querySelector('.step-item[data-step="' + etapaAtual + '"]').classList.remove('completo');

    if (etapaAtual === 1) { document.getElementById('btnVoltarEtapa').style.display = 'none'; }

    document.getElementById('btnProximaEtapa').style.display = '';
    document.getElementById('btnConfirmarPedido').disabled = true;
  }
};

function getCarrinho() {
  return JSON.parse(localStorage.getItem('carrinho')) || [];
}

function calcularSubtotal() {
  var carrinho = getCarrinho();
  var total = 0;
  carrinho.forEach(function (item) { total += Number(item.valor) * item.quantidade; });
  return total;
}

window.atualizarResumo = function () {
  var carrinho = getCarrinho();
  var subtotal = calcularSubtotal();
  var freteValor = freteSelecionado ? freteSelecionado.valor : 0;

  var container = document.getElementById('resumoItens');
  container.innerHTML = '';
  carrinho.forEach(function (item) {
    var sub = Number(item.valor) * item.quantidade;
    container.innerHTML +=
      '<div class="resumo-item">' +
        '<img class="resumo-item-img" src="' + escHtml(item.img) + '" alt="' + escHtml(item.nome) + '">' +
        '<div class="resumo-item-info">' +
          '<div class="resumo-item-nome">' + escHtml(item.nome) + '</div>' +
          '<div class="resumo-item-qtd">Qtd: ' + item.quantidade + '</div>' +
        '</div>' +
        '<div class="resumo-item-subtotal">' + formatarPreco(sub) + '</div>' +
      '</div>';
  });

  document.getElementById('resumoSubtotal').textContent = formatarPreco(subtotal);

  var resumoBoxLinha = document.getElementById('resumoBoxLinha');
  resumoBoxLinha.style.display = 'none';

  var resumoFrete = document.getElementById('resumoFrete');
  if (freteSelecionado) {
    if (freteSelecionado.tipo === 'retirada' || freteSelecionado.tipo === 'negociar') {
      resumoFrete.textContent = 'Gr\u00e1tis';
    } else {
      resumoFrete.textContent = formatarPreco(freteValor);
    }
  } else {
    resumoFrete.textContent = deliveryType === 'pickup' || deliveryType === 'negotiate' ? 'Gr\u00e1tis' : '\u2014 Selecione o CEP';
  }

  var descontoLinha = document.getElementById('resumoDescontoLinha');
  var descontoEl = document.getElementById('resumoDesconto');
  var cupomLinha = document.getElementById('resumoCupomLinha');
  var cupomEl = document.getElementById('resumoCupom');
  var total = subtotal + freteValor;

  if (metodoPagamento === 'pix') {
    var desconto = calcularDescontoPix(subtotal);
    total = total - desconto;
    descontoLinha.style.display = '';
    descontoEl.textContent = '- ' + formatarPreco(desconto);
  } else {
    descontoLinha.style.display = 'none';
  }

  if (cupomAplicado && cupomAplicado.discount_calculated > 0) {
    total = total - cupomAplicado.discount_calculated;
    if (total < 0) total = 0;
    cupomLinha.style.display = '';
    cupomEl.textContent = '- ' + formatarPreco(cupomAplicado.discount_calculated);
  } else {
    cupomLinha.style.display = 'none';
  }

  document.getElementById('resumoTotal').textContent = formatarPreco(total);
};

function montarEnderecoCompleto() {
  var endereco = document.getElementById('inputEndereco').value.trim();
  var numero = document.getElementById('inputNumero').value.trim();
  var complemento = document.getElementById('inputComplemento').value.trim();
  var bairro = document.getElementById('inputBairro').value.trim();

  var partes = [endereco];
  if (numero) partes.push('N\u00ba ' + numero);
  if (complemento) partes.push(complemento);
  if (bairro) partes.push(bairro);

  return partes.join(', ');
}

function getPixDiscountRate() {
  if (window.siteSettings && window.siteSettings.pix_discount_percent) {
    return Number(window.siteSettings.pix_discount_percent) / 100;
  }
  return 0.05;
}

// desconto PIX só sobre os produtos; o frete fica com o valor cheio
function calcularDescontoPix(subtotal) {
  return Math.round(subtotal * getPixDiscountRate() * 100) / 100;
}

function getTotalFinal() {
  var subtotal = calcularSubtotal();
  var freteValor = freteSelecionado ? freteSelecionado.valor : 0;
  var total = subtotal + freteValor;
  if (metodoPagamento === 'pix') total = total - calcularDescontoPix(subtotal);
  if (cupomAplicado && cupomAplicado.discount_calculated > 0) {
    total = total - cupomAplicado.discount_calculated;
    if (total < 0) total = 0;
  }
  return total;
}

window.confirmarPedido = function () {
  if (isSubmitting) return;

  var consent = document.getElementById('consentLGPD');
  if (!consent || !consent.checked) {
    alert('Voc\u00ea precisa concordar com os Termos de Uso e a Pol\u00edtica de Privacidade para finalizar a compra.');
    if (consent) consent.focus();
    return;
  }

  var carrinho = getCarrinho();
  if (carrinho.length === 0) { alert('Seu carrinho est\u00e1 vazio.'); return; }

  var itensDisponiveis = getItensDisponiveis();
  if (itensDisponiveis.length === 0) {
    alert('Todos os itens do carrinho est\u00e3o indispon\u00edveis no momento.');
    return;
  }

  if (itensDisponiveis.length < carrinho.length) {
    var removidos = carrinho.filter(function (item) {
      return !itensDisponiveis.some(function (d) { return d.id == item.id; });
    });
    var nomes = removidos.map(function (i) { return i.nome; }).join(', ');
    var continuar = confirm('Os seguintes itens foram removidos por estarem indispon\u00edveis:\n\n' + nomes + '\n\nDeseja continuar com os itens dispon\u00edveis?');
    if (!continuar) return;
  }

  if (metodoPagamento === 'cartao' && cardForm) {
    cardForm.submit();
    return;
  }

  var valido = validarEtapa3();
  if (!valido) return;

  criarPedidoEProcessarPagamento();
};

function getItensDisponiveis() {
  var carrinho = getCarrinho();
  if (typeof window.estaDisponivel !== 'function') return [];
  return carrinho.filter(function (item) { return window.estaDisponivel(item); });
}

function criarPedidoEProcessarPagamento() {
  var carrinho = getItensDisponiveis();
  if (carrinho.length === 0) { alert('Todos os itens do carrinho estão indisponíveis no momento.'); return; }
  var itensRemovidos = getCarrinho().length - carrinho.length;
  var subtotal = 0;
  carrinho.forEach(function (item) { subtotal += Number(item.valor) * item.quantidade; });
  var freteValor = freteSelecionado ? freteSelecionado.valor : 0;
  var total = subtotal + freteValor;
  if (metodoPagamento === 'pix') total = total - calcularDescontoPix(subtotal);

  var items = carrinho.map(function (item) {
    var isKit = item.tipo === 'kit';
    return {
      product_id: isKit ? null : Number(item.id),
      kit_id: isKit ? Number(item.id) : null,
      item_name: item.nome,
      unit_price: Number(item.valor),
      quantity: item.quantidade,
      total: Number(item.valor) * item.quantidade
    };
  });

  var payload = {
    customer_name: document.getElementById('inputNome').value.trim(),
    customer_email: document.getElementById('inputEmail').value.trim(),
    customer_phone: document.getElementById('inputTelefone').value.trim(),
    cep: deliveryType === 'delivery' ? document.getElementById('inputCep').value.replace(/\D/g, '') : '',
    address: deliveryType === 'delivery' ? montarEnderecoCompleto() : '',
    number: deliveryType === 'delivery' ? document.getElementById('inputNumero').value.trim() : '',
    neighborhood: deliveryType === 'delivery' ? document.getElementById('inputBairro').value.trim() : '',
    complement: deliveryType === 'delivery' ? document.getElementById('inputComplemento').value.trim() : '',
    city: deliveryType === 'delivery' ? document.getElementById('inputCidade').value.trim() : '',
    state: deliveryType === 'delivery' ? document.getElementById('inputEstado').value.trim() : '',
    delivery_type: deliveryType,
    subtotal: subtotal,
    delivery_fee: freteValor,
    selected_box: freteSelecionado && freteSelecionado.box ? freteSelecionado.box : '',
    shipping_service: freteSelecionado && freteSelecionado.service ? freteSelecionado.service : '',
    shipping_amount: deliveryType === 'delivery' ? freteValor : 0,
    total: total,
    payment_method: metodoPagamento || 'pix',
    coupon_code: cupomAplicado ? cupomAplicado.code : null,
    notes: deliveryType === 'delivery'
      ? 'M\u00e9todo: ' + (metodoPagamento || '').toUpperCase() + ' | Frete: ' + (freteSelecionado ? freteSelecionado.name + ' (' + freteSelecionado.service + ')' : '\u2014') + (cupomAplicado ? ' | Cupom: ' + cupomAplicado.code : '')
      : deliveryType === 'negotiate'
        ? 'M\u00e9todo: ' + (metodoPagamento || '').toUpperCase() + ' | Combinar frete com vendedor' + (cupomAplicado ? ' | Cupom: ' + cupomAplicado.code : '')
        : 'M\u00e9todo: ' + (metodoPagamento || '').toUpperCase() + ' | Retirada na loja' + (cupomAplicado ? ' | Cupom: ' + cupomAplicado.code : ''),
    items: items
  };

  mostrarLoading(true);
  isSubmitting = true;

  if (itensRemovidos > 0) {
    var aviso = document.getElementById('checkoutAvisoIndisponivel');
    if (!aviso) {
      aviso = document.createElement('div');
      aviso.id = 'checkoutAvisoIndisponivel';
      aviso.style.cssText = 'background:#fff3cd;color:#856404;padding:12px;border-radius:6px;margin-bottom:16px;font-size:14px;';
      var form = document.getElementById('checkoutForm');
      if (form) form.insertBefore(aviso, form.firstChild);
    }
    aviso.textContent = itensRemovidos + ' produto(s) indisponível(is) foi/foram removido(s) do pedido.';
  }

  fetch(API + '/api/orders', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()), credentials: 'include',
    body: JSON.stringify(payload)
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.success) throw new Error(data.message || 'Erro ao criar pedido.');
      pedidoCriado = { id: data.order.id, total: data.order.total };
      processarPagamentoMetodo();
    })
    .catch(function (err) {
      mostrarLoading(false);
      isSubmitting = false;
      alert(err.message || 'Erro ao processar pedido. Tente novamente.');
    });
}

function processarPagamentoMetodo() {
  if (metodoPagamento === 'pix') {
    enviarPagamentoPix();
  } else if (metodoPagamento === 'cartao') {
    console.warn('Cart\u00e3o deve ser processado via cardForm.submit()');
    mostrarLoading(false);
  } else {
    mostrarLoading(false);
    alert('M\u00e9todo de pagamento n\u00e3o reconhecido.');
  }
}

window.enviarPagamentoCartao = async function (dados) {
  mostrarLoading(true);
  isSubmitting = true;
  try {
    var deviceId = '';
    try {
      var d = MercadoPago.getDeviceId();
      deviceId = d && typeof d.then === 'function' ? await d : d;
    } catch (e) {
      deviceId = '';
    }
    var regDate = dados.registration_date || '';
    var body = Object.assign({ orderId: pedidoCriado.id, device_id: deviceId }, dados);
    if (regDate) body.registration_date = regDate;
    var res = await fetch(API + '/api/payments/process-card', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()), credentials: 'include',
      body: JSON.stringify(body)
    });
    var data = await res.json();

    if (!res.ok) {
      if (res.status === 401 || data.session_expired) {
        redirecionarSessaoExpirada();
        return;
      }
      console.error('Server error:', data);
      throw new Error(data.message || 'Erro ao processar pagamento.');
    }

    if (data.status === 'approved' || data.status === 'processed') {
      localStorage.removeItem('carrinho');
      if (window.atualizarBadgeCarrinho) window.atualizarBadgeCarrinho();
      mostrarTelaConfirmacao({ metodo: 'cartao', pedidoId: pedidoCriado.id, total: dados.amount, status: data.statusDetail || data.status });
    } else if (data.status === 'in_process' || data.status === 'pending') {
      mostrarLoading(false);
      isSubmitting = false;
      mostrarErroInline('Pagamento em an\u00e1lise. Voc\u00ea receber\u00e1 um e-mail de confirma\u00e7\u00e3o.');
    } else {
      mostrarLoading(false);
      isSubmitting = false;
      mostrarErroInline(traduzirErroMP(data.statusDetail) || 'Pagamento recusado. Tente novamente.');
    }
  } catch (e) {
    mostrarLoading(false);
    isSubmitting = false;
    mostrarErroInline(e.message || 'Erro ao processar pagamento. Tente novamente.');
  }
};

async function enviarPagamentoPix() {
  try {
    var res = await fetch(API + '/api/payments/process-pix', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()), credentials: 'include',
      body: JSON.stringify({
        orderId: pedidoCriado.id,
        email: document.getElementById('inputEmail').value.trim(),
        cpf: document.getElementById('inputCpf').value.replace(/\D/g, ''),
        amount: getTotalFinal()
      })
    });
    var data = await res.json();

    if (!res.ok) {
      if (res.status === 401 || data.session_expired) {
        redirecionarSessaoExpirada();
        return;
      }
      throw new Error(data.message || 'Erro ao gerar PIX.');
    }

    mostrarLoading(false);

    document.getElementById('checkoutForm').style.display = 'none';
    var confirmacao = document.getElementById('checkoutConfirmacao');
    confirmacao.style.display = '';
    confirmacao.scrollIntoView({ behavior: 'smooth', block: 'center' });

    document.getElementById('confirmacaoPedidoId').textContent = pedidoCriado.id;
    document.getElementById('confirmacaoCliente').textContent = document.getElementById('inputNome').value.trim();
    document.getElementById('confirmacaoPagamento').textContent = 'PIX - Aguardando pagamento';
    document.getElementById('confirmacaoEntrega').textContent = deliveryType === 'pickup'
      ? 'Retirada na loja'
      : deliveryType === 'negotiate'
        ? 'Combinar frete com vendedor'
        : montarEnderecoCompleto() + ', ' + document.getElementById('inputCidade').value.trim() + '/' + document.getElementById('inputEstado').value.trim();
    document.getElementById('confirmacaoTotal').textContent = formatarPreco(getTotalFinal());
    document.getElementById('confirmacaoPix').style.display = '';

    if (data.qrCodeBase64) {
      document.getElementById('pix-qrcode-img').src = 'data:image/png;base64,' + data.qrCodeBase64;
    } else if (data.qrCodeUrl || data.ticketUrl) {
      document.getElementById('pix-qrcode-img').src = data.qrCodeUrl || data.ticketUrl;
    }
    if (data.qrCode) {
      document.getElementById('pixCopiaCola').value = data.qrCode;
    }

    if (deliveryType === 'negotiate') {
      mostrarWhatsAppConfirmacao();
    }

    iniciarPollingPix(data.paymentId);
  } catch (e) {
    mostrarLoading(false);
    alert(e.message || 'Erro ao gerar PIX. Tente novamente.');
  }
}

function iniciarPollingPix(paymentId) {
  if (pixPollingInterval) clearInterval(pixPollingInterval);

  pixPollingInterval = setInterval(async function () {
    try {
      var res = await fetch(API + '/api/payments/status/' + paymentId, {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      var data = await res.json();

      if (data.status === 'approved' || data.status === 'processed') {
        clearInterval(pixPollingInterval);
        pixPollingInterval = null;
        localStorage.removeItem('carrinho');
        if (window.atualizarBadgeCarrinho) window.atualizarBadgeCarrinho();
        document.getElementById('confirmacaoPagamento').textContent = 'PIX - Pago';
        var icon = document.querySelector('.confirmacao-icon');
        if (icon) icon.innerHTML = '\u2705';
        var subtitle = document.querySelector('.confirmacao-subtitle');
        if (subtitle) subtitle.textContent = 'PIX recebido! Pedido #' + pedidoCriado.id + ' confirmado!';
      }
    } catch (e) {
      console.warn('Erro no polling PIX:', e);
    }
  }, 5000);

  setTimeout(function () {
    if (pixPollingInterval) {
      clearInterval(pixPollingInterval);
      pixPollingInterval = null;
    }
  }, 30 * 60 * 1000);
}

function mostrarTelaConfirmacao(dados) {
  mostrarLoading(false);
  localStorage.removeItem('carrinho');
  if (window.atualizarBadgeCarrinho) window.atualizarBadgeCarrinho();

  document.getElementById('checkoutForm').style.display = 'none';
  var confirmacao = document.getElementById('checkoutConfirmacao');
  confirmacao.style.display = '';
  confirmacao.scrollIntoView({ behavior: 'smooth', block: 'center' });

  document.getElementById('confirmacaoPedidoId').textContent = dados.pedidoId;
  document.getElementById('confirmacaoCliente').textContent = document.getElementById('inputNome').value.trim();
  document.getElementById('confirmacaoTotal').textContent = formatarPreco(dados.total || getTotalFinal());
  document.getElementById('confirmacaoEntrega').textContent = deliveryType === 'pickup'
    ? 'Retirada na loja'
    : deliveryType === 'negotiate'
      ? 'Combinar frete com vendedor'
      : montarEnderecoCompleto() + ', ' + document.getElementById('inputCidade').value.trim() + '/' + document.getElementById('inputEstado').value.trim();

  if (deliveryType === 'negotiate') {
    mostrarWhatsAppConfirmacao();
  }

  if (dados.metodo === 'cartao') {
    document.getElementById('confirmacaoPagamento').textContent = 'Cart\u00e3o de Cr\u00e9dito - Pago';
    document.getElementById('confirmacaoCartao').style.display = '';
    document.getElementById('confirmacaoCartaoDetalhes').textContent = 'Valor cobrado: ' + formatarPreco(dados.total || getTotalFinal()) + ' | Processado pelo Mercado Pago';
    var subtitle = document.querySelector('.confirmacao-subtitle');
    if (subtitle) subtitle.textContent = 'Pedido #' + dados.pedidoId + ' confirmado e pago!';
  }
}

function traduzirErroMP(statusDetail) {
  var erros = {
    'cc_rejected_bad_filled_card_number': 'N\u00famero do cart\u00e3o inv\u00e1lido.',
    'cc_rejected_bad_filled_date': 'Data de vencimento inv\u00e1lida.',
    'cc_rejected_bad_filled_security_code': 'CVV inv\u00e1lido.',
    'cc_rejected_bad_filled_other': 'Dados do cart\u00e3o incorretos.',
    'cc_rejected_blacklist': 'Cart\u00e3o n\u00e3o autorizado. Contate seu banco.',
    'cc_rejected_call_for_authorize': 'Ligue para seu banco para autorizar.',
    'cc_rejected_card_disabled': 'Cart\u00e3o desativado. Contate seu banco.',
    'cc_rejected_duplicated_payment': 'Pagamento duplicado detectado.',
    'cc_rejected_high_risk': 'Pagamento recusado por seguran\u00e7a.',
    'cc_rejected_insufficient_amount': 'Saldo insuficiente.',
    'cc_rejected_invalid_installments': 'Parcelamento n\u00e3o permitido.',
    'cc_rejected_max_attempts': 'Limite de tentativas atingido. Tente amanh\u00e3.',
    'pending_review_manual': 'Pagamento em an\u00e1lise manual pelo Mercado Pago.'
  };
  return erros[statusDetail] || 'Pagamento n\u00e3o aprovado. Verifique os dados e tente novamente.';
}

function inicializarMercadoPago() {
  fetch(API + '/api/config/mp-key', {
    headers: getAuthHeaders()
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.publicKey || data.publicKey === 'APP_USR-xxxx' || data.publicKey === 'TEST-xxxx') {
        console.warn('MP_PUBLIC_KEY n\u00e3o configurada. Pagamento por cart\u00e3o desabilitado.');
        var cardOption = document.querySelector('.pagamento-card[data-metodo="cartao"]');
        if (cardOption) { cardOption.style.opacity = '0.5'; cardOption.style.pointerEvents = 'none'; }
        return;
      }

      mpPublicKey = data.publicKey;
      mp = new MercadoPago(data.publicKey, { locale: 'pt-BR' });
    })
    .catch(function (err) {
      console.warn('Erro ao carregar chave do Mercado Pago:', err);
    });
}

var cardBin = '';
var cardPaymentMethodId = '';
var cardFormMountedAmount = 0;

function sincronizarCardFormComTotal() {
  if (metodoPagamento !== 'cartao' || !cardForm || etapaAtual !== 3) return;
  var novoTotal = getTotalFinal();
  if (cardFormMountedAmount !== novoTotal) {
    cardFormMountedAmount = novoTotal;
    cardForm.unmount();
    cardForm.mount();
  }
}

function detectPaymentMethodId(bin) {
  if (!bin || bin.length < 3) return '';
  if (bin.startsWith('4')) return 'visa';
  if (/^5[1-5]/.test(bin) || /^2[2-7]/.test(bin) || /^50/.test(bin)) return 'master';
  if (/^3[47]/.test(bin)) return 'amex';
  if (bin.startsWith('606')) return 'hipercard';
  if (/^506[7-9]/.test(bin) || /^5090/.test(bin) || /^6504/.test(bin)) return 'elo';
  return '';
}

function iniciarCardForm() {
  if (!mp) return;

  var total = getTotalFinal();
  var installmentsSelect = document.getElementById('form-checkout__installments');
  if (installmentsSelect) {
    installmentsSelect.innerHTML = '';
    for (var i = 1; i <= 3; i++) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = i + 'x de R$ ' + (total / i).toFixed(2).replace('.', ',') + ' sem juros';
      installmentsSelect.appendChild(opt);
    }
  }

  var cardFormOptions = {
    amount: String(total),
    iframe: true,
    form: {
      id: 'form-checkout',
      cardNumber: { id: 'form-checkout__cardNumber', placeholder: 'N\u00famero do cart\u00e3o' },
      expirationDate: { id: 'form-checkout__expirationDate', placeholder: 'MM/AA' },
      securityCode: { id: 'form-checkout__securityCode', placeholder: 'CVV' },
      cardholderName: { id: 'form-checkout__cardholderName', placeholder: 'Nome como no cart\u00e3o' },
      issuer: { id: 'form-checkout__issuer' },
      installments: { id: 'form-checkout__installments' },
      identificationType: { id: 'form-checkout__identificationType' },
      identificationNumber: { id: 'form-checkout__identificationNumber' },
      cardholderEmail: { id: 'form-checkout__cardholderEmail' }
    },
    callbacks: {
      onFormMounted: function (error) {
        if (error) console.warn('MP cardForm mount error:', error);
      },
      onBinChange: function (bin) {
        cardBin = bin;
        cardPaymentMethodId = detectPaymentMethodId(bin);
      },
      onSubmit: function (event) {
        event.preventDefault();
        if (isSubmitting) return;
        var formData = cardForm.getCardFormData();
        console.log('cardForm data:', JSON.stringify(formData));
        var cpf = document.getElementById('inputCpf').value.replace(/\D/g, '');
        var email = document.getElementById('inputEmail').value.trim();
        var pmId = formData.paymentMethodId || cardPaymentMethodId;
        console.log('pmId:', pmId, 'cardPaymentMethodId:', cardPaymentMethodId, 'bin:', cardBin);

        if (!formData.token) {
          mostrarLoading(false);
          mostrarErroInline('Token do cart\u00e3o n\u00e3o gerado. Verifique os dados do cart\u00e3o.');
          return;
        }

        if (!pmId) {
          mostrarLoading(false);
          mostrarErroInline('Bandeira do cart\u00e3o n\u00e3o reconhecida. Verifique o n\u00famero.');
          return;
        }

        if (!cpf || !validarCPF(cpf)) {
          mostrarLoading(false);
          mostrarErro('Cpf', 'Informe um CPF v\u00e1lido.');
          return;
        }

        if (pedidoCriado) {
          enviarPagamentoCartao({
            token: formData.token,
            installments: formData.installments,
            paymentMethodId: pmId,
            issuerId: formData.issuerId,
            email: email,
            cpf: cpf,
            amount: getTotalFinal(),
            registration_date: dadosPerfil && dadosPerfil.created_at ? dadosPerfil.created_at : ''
          });
        } else {
          criarPedidoESubmeterCartao(formData, email, cpf, pmId);
        }
      },
      onFetching: function () {}
    }
  };

  cardForm = mp.cardForm(cardFormOptions);
  cardFormMountedAmount = total;
}

function criarPedidoESubmeterCartao(formData, email, cpf, pmId) {
  var carrinho = getItensDisponiveis();
  if (carrinho.length === 0) { alert('Todos os itens do carrinho estão indisponíveis no momento.'); return; }
  var itensRemovidos = getCarrinho().length - carrinho.length;
  var subtotal = 0;
  carrinho.forEach(function (item) { subtotal += Number(item.valor) * item.quantidade; });
  var freteValor = freteSelecionado ? freteSelecionado.valor : 0;
  var total = subtotal + freteValor;

  var items = carrinho.map(function (item) {
    var isKit = item.tipo === 'kit';
    return {
      product_id: isKit ? null : Number(item.id),
      kit_id: isKit ? Number(item.id) : null,
      item_name: item.nome,
      unit_price: Number(item.valor),
      quantity: item.quantidade,
      total: Number(item.valor) * item.quantidade
    };
  });

  var payload = {
    customer_name: document.getElementById('inputNome').value.trim(),
    customer_email: email,
    customer_phone: document.getElementById('inputTelefone').value.trim(),
    cep: deliveryType === 'delivery' ? document.getElementById('inputCep').value.replace(/\D/g, '') : '',
    address: deliveryType === 'delivery' ? montarEnderecoCompleto() : '',
    number: deliveryType === 'delivery' ? document.getElementById('inputNumero').value.trim() : '',
    neighborhood: deliveryType === 'delivery' ? document.getElementById('inputBairro').value.trim() : '',
    complement: deliveryType === 'delivery' ? document.getElementById('inputComplemento').value.trim() : '',
    city: deliveryType === 'delivery' ? document.getElementById('inputCidade').value.trim() : '',
    state: deliveryType === 'delivery' ? document.getElementById('inputEstado').value.trim() : '',
    delivery_type: deliveryType,
    subtotal: subtotal,
    delivery_fee: freteValor,
    selected_box: freteSelecionado && freteSelecionado.box ? freteSelecionado.box : '',
    shipping_service: freteSelecionado && freteSelecionado.service ? freteSelecionado.service : '',
    shipping_amount: deliveryType === 'delivery' ? freteValor : 0,
    total: total,
    payment_method: 'cartao',
    coupon_code: cupomAplicado ? cupomAplicado.code : null,
    notes: deliveryType === 'delivery'
      ? 'M\u00e9todo: CARTAO | Frete: ' + (freteSelecionado ? freteSelecionado.name + ' (' + freteSelecionado.service + ')' : '\u2014') + (cupomAplicado ? ' | Cupom: ' + cupomAplicado.code : '')
      : deliveryType === 'negotiate'
        ? 'M\u00e9todo: CARTAO | Combinar frete com vendedor' + (cupomAplicado ? ' | Cupom: ' + cupomAplicado.code : '')
        : 'M\u00e9todo: CARTAO | Retirada na loja' + (cupomAplicado ? ' | Cupom: ' + cupomAplicado.code : ''),
    items: items
  };

  mostrarLoading(true);
  isSubmitting = true;

  if (itensRemovidos > 0) {
    var aviso = document.getElementById('checkoutAvisoIndisponivel');
    if (!aviso) {
      aviso = document.createElement('div');
      aviso.id = 'checkoutAvisoIndisponivel';
      aviso.style.cssText = 'background:#fff3cd;color:#856404;padding:12px;border-radius:6px;margin-bottom:16px;font-size:14px;';
      var form = document.getElementById('checkoutForm');
      if (form) form.insertBefore(aviso, form.firstChild);
    }
    aviso.textContent = itensRemovidos + ' produto(s) indisponível(is) foi/foram removido(s) do pedido.';
  }

  fetch(API + '/api/orders', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()), credentials: 'include',
    body: JSON.stringify(payload)
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.success) throw new Error(data.message || 'Erro ao criar pedido.');
      pedidoCriado = { id: data.order.id, total: data.order.total };

      enviarPagamentoCartao({
        token: formData.token,
        installments: formData.installments,
        paymentMethodId: pmId,
        issuerId: formData.issuerId,
        email: email,
        cpf: cpf,
        amount: Number(data.order.total) || total,
        registration_date: dadosPerfil && dadosPerfil.created_at ? dadosPerfil.created_at : ''
      });
    })
    .catch(function (err) {
      mostrarLoading(false);
      isSubmitting = false;
      mostrarErroInline(err.message || 'Erro ao criar pedido. Tente novamente.');
    });
}

function mostrarWhatsAppConfirmacao() {
  document.getElementById('confirmacaoWhatsApp').style.display = '';
  document.getElementById('whatsappPedidoId').textContent = pedidoCriado ? pedidoCriado.id : '';

  var phone = (window.siteSettings && window.siteSettings.contact_phone) || '';
  var nums = phone.replace(/\D/g, '');
  if (nums.length >= 10) {
    if (!nums.startsWith('55')) nums = '55' + nums;
    var msg = encodeURIComponent('Ol\u00e1! Meu pedido #' + (pedidoCriado ? pedidoCriado.id : '') + ' foi confirmado. Gostaria de combinar a entrega.');
    document.getElementById('whatsappLink').href = 'https://wa.me/' + nums + '?text=' + msg;
  } else {
    document.getElementById('whatsappLink').href = '#';
  }
}

window.copiarChavePix = function () {
  var input = document.getElementById('pixCopiaCola');
  if (!input || !input.value) return;
  navigator.clipboard.writeText(input.value).then(function () {
    var btn = document.querySelector('.confirmacao-pix .btn-copiar');
    btn.textContent = 'Copiado!';
    btn.classList.add('copiado');
    setTimeout(function () {
      btn.textContent = 'Copiar c\u00f3digo';
      btn.classList.remove('copiado');
    }, 2000);
  });
};

document.addEventListener('DOMContentLoaded', function () {
  mostrarLoading(false);

  document.querySelector('.delivery-option[data-delivery="delivery"]').classList.add('selecionado');
  document.getElementById('deliveryRadioDelivery').textContent = '\u25C9';
  document.getElementById('deliveryRadioNegotiate').textContent = '\u25CB';

  document.getElementById('negotiateWhatsappBtn').addEventListener('click', function (e) {
    var phone = (window.siteSettings && window.siteSettings.contact_phone) || '';
    var nums = phone.replace(/\D/g, '');
    if (nums.length >= 10) {
      if (!nums.startsWith('55')) nums = '55' + nums;
      var msg = encodeURIComponent('Ol\u00e1! Gostaria de saber mais sobre o frete.');
      this.href = 'https://wa.me/' + nums + '?text=' + msg;
    } else {
      e.preventDefault();
      alert('N\u00famero de WhatsApp n\u00e3o configurado. Entre em contato pelo telefone cadastrado.');
    }
  });

  carregarPerfil();
  atualizarResumo();
  inicializarMercadoPago();
  if (typeof window.carregarDisponibilidade === 'function') {
    window.carregarDisponibilidade();
  }

  var cpfInput = document.getElementById('inputCpf');
  if (cpfInput) {
    cpfInput.addEventListener('input', function () {
      this.value = formatarCPF(this.value);
    });
  }

  var telefoneInput = document.getElementById('inputTelefone');
  if (telefoneInput) {
    telefoneInput.addEventListener('input', function () {
      this.value = formatarTelefone(this.value);
    });
  }

  var cepInput = document.getElementById('inputCep');
  if (cepInput) {
    cepInput.addEventListener('input', function () {
      this.value = formatarCEP(this.value);
    });
  }
});
