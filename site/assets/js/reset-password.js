document.addEventListener('DOMContentLoaded', function () {
  var params = new URLSearchParams(window.location.search);
  var token = params.get('token');

  if (!token) {
    document.querySelector('#reset-password').innerHTML = '<h1>Link inválido</h1><p style="text-align:center;margin-top:20px;">O link de recuperação é inválido ou está ausente.</p><div class="extra" style="margin-top:20px;"><a href="/site/pages/login/index.html">Voltar ao login</a></div>';
    return;
  }

  var btn = document.getElementById('btnReset');
  var novaSenha = document.getElementById('novaSenha');
  var confirmarSenha = document.getElementById('confirmarSenha');

  function mostrarErro(mensagem) {
    var erroEl = document.querySelector('#reset-password .erro-msg');
    if (!erroEl) {
      erroEl = document.createElement('p');
      erroEl.className = 'erro-msg';
      document.querySelector('#reset-password form').appendChild(erroEl);
    }
    erroEl.textContent = mensagem;
  }

  function limparErros() {
    var el = document.querySelector('#reset-password .erro-msg');
    if (el) el.textContent = '';
  }

  btn.addEventListener('click', function (e) {
    e.preventDefault();
    limparErros();

    var senha = novaSenha.value;
    var confirmar = confirmarSenha.value;

    if (!senha || !confirmar) {
      mostrarErro('Preencha todos os campos.');
      return;
    }

    if (senha.length < 8) {
      mostrarErro('A senha deve ter no mínimo 8 caracteres.');
      return;
    }

    if (senha !== confirmar) {
      mostrarErro('As senhas não conferem.');
      return;
    }

    btn.textContent = 'Redefinindo...';
    btn.disabled = true;

    fetch((window.API_BASE_URL || 'http://localhost:3333') + '/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, password: senha })
    })
    .then(function (res) {
      if (!res.ok) return res.json().then(function (data) { throw new Error(data.message); });
      return res.json();
    })
    .then(function () {
      document.querySelector('#reset-password').innerHTML = '<h1>Senha redefinida!</h1><p style="text-align:center;margin-top:20px;">Sua senha foi alterada com sucesso.</p><div class="extra" style="margin-top:20px;"><a href="/site/pages/login/index.html">Fazer login</a></div>';
    })
    .catch(function (err) {
      mostrarErro(err.message);
    })
    .finally(function () {
      btn.textContent = 'Redefinir';
      btn.disabled = false;
    });
  });
});
