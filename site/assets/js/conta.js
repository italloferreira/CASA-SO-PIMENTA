var API_BASE = window.API_BASE_URL || 'http://localhost:3333';

function getAuthHeaders() {
  var headers = { 'Content-Type': 'application/json' };
  var userData = localStorage.getItem('csp_admin_user');
  if (userData) {
    var user = JSON.parse(userData);
    if (user.token) {
      headers['Authorization'] = 'Bearer ' + user.token;
    }
  }
  return headers;
}

export async function getUserProfile() {
  try {
    var res = await fetch(API_BASE + '/api/auth/profile', {
      headers: getAuthHeaders(),
      credentials: 'include'
    });

    if (!res.ok) return null;

    return await res.json();
  } catch {
    return null;
  }
}

function formatarCEP(valor) {
  return valor.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
}

function formatarTelefone(valor) {
  var nums = valor.replace(/\D/g, '').slice(0, 11);
  if (nums.length <= 10) {
    return nums.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim();
  }
  return nums.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim();
}

async function buscarCEP(cep) {
  var nums = cep.replace(/\D/g, '');
  if (nums.length !== 8) return;

  var infoEl = document.getElementById('infoCep');
  infoEl.textContent = 'Buscando...';

  try {
    var res = await fetch('https://viacep.com.br/ws/' + nums + '/json/');
    var data = await res.json();

    if (data.erro) {
      infoEl.textContent = 'CEP não encontrado.';
      infoEl.style.color = 'var(--cor-vermelho-primario)';
    } else {
      var endereco = data.logradouro || '';
      var bairro = data.bairro || '';
      var cidade = data.localidade || '';
      var estado = data.uf || '';

      infoEl.textContent = (endereco ? endereco + ', ' : '') + (bairro ? bairro + ' — ' : '') + cidade + '/' + estado;
      infoEl.style.color = 'var(--cor-cinza-texto-secundario)';

      if (document.getElementById('endereco')) document.getElementById('endereco').value = endereco;
      if (document.getElementById('bairro')) document.getElementById('bairro').value = bairro;
      if (document.getElementById('cidade')) document.getElementById('cidade').value = cidade;
      if (document.getElementById('estado')) document.getElementById('estado').value = estado;
    }
  } catch {
    infoEl.textContent = '';
  }
}

document.addEventListener('DOMContentLoaded', function () {
  var userData = localStorage.getItem('csp_admin_user');

  if (!userData) {
    window.location.href = '/site/pages/login/index.html';
    return;
  }

  var currentUser = JSON.parse(userData);

  document.getElementById('nomeUsuario').textContent = currentUser.name || 'Usuário';
  document.getElementById('emailUsuario').textContent = currentUser.email;
  document.getElementById('inputNome').value = currentUser.name || '';
  document.getElementById('email').value = currentUser.email;

  var avatar = document.getElementById('contaAvatar');
  if (avatar) avatar.remove();

  var inputTel = document.getElementById('telefone');
  var inputCep = document.getElementById('cep');

  inputTel.addEventListener('input', function () {
    this.value = formatarTelefone(this.value);
  });

  inputCep.addEventListener('input', function () {
    this.value = formatarCEP(this.value);
    if (this.value.replace(/\D/g, '').length === 8) {
      buscarCEP(this.value);
    } else {
      document.getElementById('infoCep').textContent = '';
    }
  });

  /* Campos preenchidos pelo perfil ficam em skeleton (e travados) até a resposta chegar */
  var camposPerfil = ['telefone', 'cep', 'endereco', 'cidade', 'estado']
    .map(function (id) { return document.getElementById(id); })
    .filter(Boolean);

  camposPerfil.forEach(function (campo) {
    campo.classList.add('skeleton');
    campo.readOnly = true;
  });

  function liberarCamposPerfil() {
    camposPerfil.forEach(function (campo) {
      campo.classList.remove('skeleton');
      campo.readOnly = false;
    });
  }

  /* Carrega perfil completo da API */
  fetch(API_BASE + '/api/auth/profile', {
    headers: getAuthHeaders(),
    credentials: 'include'
  })
    .then(function (r) { return r.json(); })
    .then(function (perfil) {
      if (!perfil || perfil.message) return;

      if (perfil.phone) inputTel.value = perfil.phone;
      if (perfil.cep) {
        inputCep.value = perfil.cep;
        buscarCEP(perfil.cep);
      }
      if (perfil.address && document.getElementById('endereco')) document.getElementById('endereco').value = perfil.address;
      if (perfil.city && document.getElementById('cidade')) document.getElementById('cidade').value = perfil.city;
      if (perfil.state && document.getElementById('estado')) document.getElementById('estado').value = perfil.state;
    })
    .catch(function () {})
    .finally(liberarCamposPerfil);

  /* Salvar alterações */
  var btnSalvar = document.getElementById('btnSalvar');

  btnSalvar.addEventListener('click', function () {
    var self = this;
    var novoNome = document.getElementById('inputNome').value.trim();
    var telefone = inputTel.value.trim();
    var cep = inputCep.value.trim();
    var endereco = document.getElementById('endereco') ? document.getElementById('endereco').value.trim() : '';
    var cidade = document.getElementById('cidade') ? document.getElementById('cidade').value.trim() : '';
    var estado = document.getElementById('estado') ? document.getElementById('estado').value.trim() : '';
    var msgEl = document.getElementById('msgSalvar');

    if (!novoNome) {
      msgEl.textContent = 'O nome não pode ficar vazio.';
      msgEl.style.color = 'var(--cor-vermelho-primario)';
      return;
    }

    self.textContent = 'Salvando...';
    self.disabled = true;

    fetch(API_BASE + '/api/auth/profile', {
      method: 'PUT',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        name: novoNome,
        phone: telefone,
        cep: cep,
        address: endereco,
        city: cidade,
        state: estado
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.message === 'Perfil atualizado com sucesso.') {
          localStorage.setItem('csp_admin_user', JSON.stringify(data.user));
          document.getElementById('nomeUsuario').textContent = novoNome;
          msgEl.textContent = '✓ Dados salvos com sucesso!';
          msgEl.style.color = 'var(--cor-verde-primario)';
        } else {
          throw new Error(data.message || 'Erro ao salvar.');
        }
      })
      .catch(function () {
        msgEl.textContent = 'Erro ao salvar. Tente novamente.';
        msgEl.style.color = 'var(--cor-vermelho-primario)';
      })
      .finally(function () {
        self.textContent = 'Salvar alterações';
        self.disabled = false;
      });
  });

  /* Sair da conta */
  document.getElementById('btnSair').addEventListener('click', function () {
    fetch(API_BASE + '/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(function () {});
    localStorage.removeItem('csp_admin_user');
    window.location.href = '/site/pages/index.html';
  });
});