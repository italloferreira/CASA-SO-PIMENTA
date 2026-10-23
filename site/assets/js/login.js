window.toggleForm = function () {
  document.getElementById("login").classList.toggle("ativo");
  document.getElementById("cadastro").classList.toggle("ativo");
  document.getElementById("forgot").classList.remove("ativo");
  limparErros();
};

window.mostrarForgot = function (e) {
  if (e) e.preventDefault();
  document.getElementById("login").classList.remove("ativo");
  document.getElementById("cadastro").classList.remove("ativo");
  document.getElementById("forgot").classList.add("ativo");
  limparErros();
};

function mostrarErro(secaoId, mensagem) {
  const secao = document.getElementById(secaoId);
  let erroEl = secao.querySelector(".erro-msg");
  if (!erroEl) {
    erroEl = document.createElement("p");
    erroEl.className = "erro-msg";
    secao.querySelector("form").appendChild(erroEl);
  }
  erroEl.textContent = mensagem;
}

window.fecharModalSucesso = function () {
  document.getElementById("modalSucesso").classList.remove("ativo");
  toggleForm();
};

function limparErros() {
  document.querySelectorAll(".erro-msg").forEach(el => el.textContent = "");
}

function concluirLogin(data) {
  data.user.token = data.token;
  localStorage.setItem("csp_admin_user", JSON.stringify(data.user));
  var params = new URLSearchParams(window.location.search);
  var redirect = params.get('redirect');
  if (data.user.role === "admin") {
    window.location.href = "/site/pages/admin/index.html";
  } else if (redirect === 'checkout') {
    window.location.href = "/site/pages/checkout/index.html";
  } else {
    window.location.href = "/site/pages/index.html";
  }
}

/* LOGIN COM GOOGLE */
function secaoAtiva() {
  var ativa = document.querySelector(".campos.ativo");
  return ativa ? ativa.id : "login";
}

function onGoogleCredential(response) {
  limparErros();
  fetch((window.API_BASE_URL || 'http://localhost:3333') + '/api/auth/google', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential: response.credential })
  })
  .then(function (res) {
    return res.json().then(function (data) {
      if (!res.ok) throw new Error(data.message || "Erro ao entrar com Google. Tente novamente.");
      return data;
    });
  })
  .then(concluirLogin)
  .catch(function (err) {
    mostrarErro(secaoAtiva(), err.message);
  });
}

function iniciarGoogle() {
  fetch((window.API_BASE_URL || 'http://localhost:3333') + '/api/auth/google/config')
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (config) {
      if (!config || !config.clientId) return;

      var script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = function () {
        google.accounts.id.initialize({
          client_id: config.clientId,
          callback: onGoogleCredential,
          locale: "pt-BR"
        });
        document.querySelectorAll(".google-login").forEach(function (bloco) {
          bloco.hidden = false;
          var alvo = bloco.querySelector(".google-btn");
          google.accounts.id.renderButton(alvo, {
            theme: "outline",
            size: "large",
            shape: "rectangular",
            text: alvo.dataset.text,
            width: 300
          });
        });
      };
      document.head.appendChild(script);
    })
    .catch(function () { /* API fora do ar: apenas não exibe o botão */ });
}

document.addEventListener("DOMContentLoaded", function () {
  const btnLogin    = document.querySelector("#login .btn");
  const btnCadastro = document.querySelector("#cadastro .btn");

  const pageParams = new URLSearchParams(window.location.search);
  if (pageParams.get('expired') === '1') {
    mostrarErro("login", "Sua sessão expirou. Faça login novamente para continuar.");
  }

  iniciarGoogle();

  /* LOGIN EMAIL/SENHA */
  btnLogin.addEventListener("click", function (e) {
    e.preventDefault();
    limparErros();

    const email = document.getElementById("loginEmail").value.trim();
    const senha = document.getElementById("loginSenha").value;

    if (!email || !senha) {
      mostrarErro("login", "Preencha todos os campos.");
      return;
    }

    btnLogin.textContent = "Entrando...";
    btnLogin.disabled = true;

    fetch((window.API_BASE_URL || 'http://localhost:3333') + '/api/auth/login', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: senha })
    })
    .then(function (res) {
      if (!res.ok) {
        return res.json().then(function (data) {
          if (res.status === 401) throw new Error(data.message || "E-mail ou senha incorretos.");
          if (res.status === 423) throw new Error(data.message || "Conta bloqueada temporariamente. Tente novamente mais tarde.");
          if (res.status === 429) throw new Error(data.message || "Muitas tentativas. Aguarde um momento.");
          throw new Error(data.message || "Erro ao fazer login. Tente novamente.");
        });
      }
      return res.json();
    })
    .then(concluirLogin)
    .catch(function (err) {
      mostrarErro("login", err.message);
    })
    .finally(function () {
      btnLogin.textContent = "Entrar";
      btnLogin.disabled = false;
    });
  });

  /* CADASTRO */
  btnCadastro.addEventListener("click", function (e) {
    e.preventDefault();
    limparErros();

    const nome = document.getElementById("nome").value.trim();
    const email = document.getElementById("cadEmail").value.trim();
    const senha = document.getElementById("cadSenha").value;
    const confirmar = document.getElementById("confirmarSenha").value;
    const consent = document.getElementById("consentLGPDCadastro");

    if (!nome || !email || !senha || !confirmar) {
      mostrarErro("cadastro", "Preencha todos os campos.");
      return;
    }

    if (senha !== confirmar) {
      mostrarErro("cadastro", "As senhas não conferem.");
      return;
    }

    if (!consent || !consent.checked) {
      mostrarErro("cadastro", "Você precisa concordar com os Termos de Uso e a Política de Privacidade.");
      return;
    }

    btnCadastro.textContent = "Cadastrando...";
    btnCadastro.disabled = true;

    fetch((window.API_BASE_URL || 'http://localhost:3333') + '/api/auth/register', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nome, email, password: senha })
    })
    .then(function (res) {
      if (!res.ok) {
        if (res.status === 400) throw new Error("Este email já está cadastrado.");
        throw new Error("Servidor indisponível. Tente novamente.");
      }
      return res.json();
    })
    .then(function () {
      document.getElementById("nome").value = "";
      document.getElementById("cadEmail").value = "";
      document.getElementById("cadSenha").value = "";
      document.getElementById("confirmarSenha").value = "";
      document.getElementById("modalSucesso").classList.add("ativo");
    })
    .catch(function (err) {
      mostrarErro("cadastro", err.message);
    })
    .finally(function () {
      btnCadastro.textContent = "Cadastrar";
      btnCadastro.disabled = false;
    });
  });

  /* ESQUECI SENHA */
  var btnForgot = document.getElementById("btnForgot");
  if (btnForgot) {
    btnForgot.addEventListener("click", function (e) {
      e.preventDefault();
      limparErros();

      var email = document.getElementById("forgotEmail").value.trim();

      if (!email) {
        mostrarErro("forgot", "Digite seu email.");
        return;
      }

      btnForgot.textContent = "Enviando...";
      btnForgot.disabled = true;

      fetch((window.API_BASE_URL || 'http://localhost:3333') + '/api/auth/forgot-password', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email })
      })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (data) { throw new Error(data.message || "Erro ao enviar. Tente novamente."); });
        return res.json();
      })
      .then(function () {
        document.getElementById("forgot").innerHTML =
          '<h1>Email enviado!</h1>' +
          '<p style="text-align:center;margin-top:20px;padding:0 20px;">Se o email estiver cadastrado, você receberá um link de recuperação.</p>' +
          '<div class="extra" style="margin-top:20px;"><a href="/site/pages/login/index.html">Voltar ao login</a></div>';
      })
      .catch(function (err) {
        mostrarErro("forgot", err.message);
      })
      .finally(function () {
        btnForgot.textContent = "Enviar link";
        btnForgot.disabled = false;
      });
    });
  }});