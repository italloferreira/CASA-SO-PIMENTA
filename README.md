<div align="center">

# 🌶️ Casa Só Pimenta — E-commerce

**E-commerce completo desenvolvido com HTML, CSS, JavaScript Vanilla e Node.js**  
Projeto fullstack com catálogo de produtos e kits, carrinho, autenticação, painel administrativo, pagamentos via Mercado Pago e cálculo de frete com Melhor Envio.

<img src="site/imgs/logo.png" alt="Logo Casa Só Pimenta" width="180">

![Status](https://img.shields.io/badge/status-em%20desenvolvimento-yellow)
![HTML](https://img.shields.io/badge/HTML-5-orange)
![CSS](https://img.shields.io/badge/CSS-3-blue)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6-yellow)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green)
![Express](https://img.shields.io/badge/Express-5-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-3372-blue)
![License](https://img.shields.io/badge/license-ISC-lightgrey)

</div>

---

## 📌 Sobre o projeto

O **Casa Só Pimenta — E-commerce** é uma aplicação fullstack que digitaliza o processo de vendas da Casa Só Pimenta, uma loja de temperos, pimentas e produtos artesanais.

A aplicação foi desenvolvida com **frontend estático** (HTML, CSS e JavaScript puro, sem frameworks) e **backend em Node.js + Express + PostgreSQL**, contemplando:

- catálogo de produtos com filtros, busca e variações por peso;
- carrinho de compras persistente (autenticado ou anônimo);
- finalização de pedido com frete e pagamento online;
- painel administrativo completo (produtos, kits, pedidos, cupons, banners e usuários);
- integrações com **Mercado Pago**, **Melhor Envio**, **SendGrid** e **Cloudinary**.

---

## 🎯 Objetivo

Este projeto demonstra minha capacidade de desenvolver uma aplicação e-commerce funcional de ponta a ponta, com foco em:

- arquitetura organizada de frontend e backend;
- API REST com autenticação JWT e boas práticas de segurança;
- manipulação do DOM e renderização dinâmica sem frameworks;
- integrações reais de pagamento, frete, e-mail e armazenamento de imagens;
- testes automatizados com o runner nativo do Node.js.

Mais do que uma loja virtual, o projeto funciona como uma base completa para vendas online da Casa Só Pimenta.

---

## 🌐 Acesso ao projeto

**Projeto online:**  
[https://www.casasopimenta.com.br](https://www.casasopimenta.com.br)

---

## ✨ Funcionalidades

### 🛍️ Área do Cliente

- [x] **Catálogo de produtos** com filtros por categoria, destaque e busca
- [x] **Detalhes do produto** com imagens, descrição, ingredientes e variações por peso (produtos a granel)
- [x] **Kits promocionais** com composição detalhada
- [x] **Produtos semelhantes** na página do produto (mesma categoria, palavras do nome, marca e faixa de preço; só itens em estoque)
- [x] **Carrinho de compras** com persistência (autenticado ou anônimo)
- [x] **Autenticação** (cadastro, login, recuperação de senha)
- [x] **Finalização de pedido** com cálculo automático de frete
- [x] **Meios de pagamento** via **Mercado Pago (Pix/Checkout)**
- [x] **Acompanhamento de pedidos** (histórico e detalhes)
- [x] **Minha conta** (dados cadastrais e endereço)
- [x] **Cupom de desconto** integrado ao checkout

### ⚙️ Área Administrativa

- [x] **Dashboard** com métricas de vendas, pedidos e produtos
- [x] **Gerenciamento de produtos** (CRUD, imagens, estoque, preços, peso)
- [x] **Gerenciamento de kits** (composição, preço, estoque, destaque)
- [x] **Gerenciamento de categorias** com cores personalizadas
- [x] **Gerenciamento de banners** para a homepage
- [x] **Gerenciamento de pedidos** com fluxo de status
- [x] **Gerenciamento de usuários** (clientes e administradores)
- [x] **Gerenciamento de cupons** (código, desconto, validade, limite de uso)
- [x] **Configurações do site** (informações, banners, etc.)
- [x] **Upload de imagens** localmente ou via **Cloudinary**

### 🔌 Integrações & Extras

- [x] **Cálculo de frete** com Melhor Envio (PAC/SEDEX)
- [x] **Envio de e-mails** (confirmação de pedido, recuperação de senha) via **SendGrid** ou **Nodemailer**
- [x] **Rate limiting** e **Helmet** para segurança básica
- [x] **CORS configurado** com origens permitidas
- [x] **Compressão** de respostas HTTP
- [x] **Logs** com Morgan
- [x] **Criação automática do admin** na primeira execução
- [x] **Máquina de estados** para status de pedidos
- [x] **Cálculo de peso do carrinho** para otimizar envio

---

## 🛠️ Tecnologias Utilizadas

### Frontend

| Tecnologia | Uso |
|---|---|
| **HTML5** | Estrutura semântica |
| **CSS3** | Estilização com variáveis CSS |
| **JavaScript (Vanilla)** | Sem frameworks, focado em performance |
| **Fetch API** | Comunicação com o backend |

### Backend

| Tecnologia | Uso |
|---|---|
| **Node.js** (>=18) + **Express 5** | API REST |
| **PostgreSQL** (via `pg`) | Banco relacional |
| **JWT** (`jsonwebtoken`) | Autenticação stateless |
| **bcryptjs** | Hash de senhas |
| **cookie-parser** | Cookies HTTP-only |
| **helmet** | Headers de segurança |
| **cors** | Controle de origens |
| **express-rate-limit** | Proteção contra brute force |
| **compression** | Otimização de resposta |
| **morgan** | Logging HTTP |

### Uploads, E-mail e Pagamentos

| Tecnologia | Uso |
|---|---|
| **Cloudinary** + **multer-storage-cloudinary** | Upload de imagens em CDN |
| **Multer** | Upload local (fallback) |
| **SendGrid** / **Nodemailer** | Envio transacional de e-mails |
| **Mercado Pago SDK** | Pagamentos online |
| **Melhor Envio API** | Cálculo e integração de frete |

### Dev & Testes

- **nodemon** — hot reload em desenvolvimento
- **node:test** — testes nativos (sem dependências extras)
- **dotenv** — gerenciamento de variáveis de ambiente

---

## 🏗️ Arquitetura

```
CASA-SO-PIMENTA-E-COMMERCE/
├── site/                      # Frontend estático (HTML/CSS/JS)
│   ├── assets/                # CSS, JS e imagens gerais
│   ├── imgs/                  # Imagens do site
│   ├── pages/                 # Páginas HTML organizadas por rota
│   │   ├── admin/
│   │   ├── checkout/
│   │   ├── conta/
│   │   ├── kits/
│   │   ├── login/
│   │   ├── pedidos/
│   │   ├── produtos/
│   │   └── ...
│   └── test/                  # Testes do frontend (node --test)
├── server/                    # Backend API (Node.js + Express)
│   ├── src/
│   │   ├── config/            # Configurações (boxes, cloudinary, orderStatusMachine)
│   │   ├── controllers/       # Lógica de negócio
│   │   ├── database/          # Conexão, schema, seed, migrations
│   │   ├── middlewares/       # Auth, rate limiter
│   │   ├── routes/            # Rotas da API REST
│   │   ├── uploads/           # Uploads locais (fallback)
│   │   ├── utils/             # Utilitários (peso, templates de e-mail)
│   │   └── server.js          # Entrada da aplicação
│   ├── data/                  # Arquivos auxiliares
│   ├── test/                  # Testes do backend (node --test)
│   ├── .env.example           # Exemplo de variáveis de ambiente
│   └── package.json
├── package.json               # Scripts raiz (testes)
└── README.md
```

---

## 🔐 Segurança

> ⚠️ Este repositório **não deve** conter credenciais reais.

- **Nunca commite o arquivo `.env`** — utilize sempre `.env.example` como modelo
- **Senhas hasheadas** com `bcryptjs` (salt 10) antes do armazenamento
- **JWT** com `JWT_SECRET` forte e único em produção
- **Cookies** com `secure: true`, `SameSite` adequado e `HttpOnly` em produção
- **Rate limiting** aplicado em rotas sensíveis
- **Helmet** habilitado (XSS, HSTS, CSP e outros)
- **CORS** restrito por `ALLOWED_ORIGINS`
- **Validações** em pedidos, login e cadastro
- **Bloqueio temporário** após tentativas falhas de login (anti-brute-force)
- **Prepared statements** (`$1,$2,...`) via `pg` (proteção contra SQL Injection)
- **Upload seguro** com Multer/Cloudinary

---

## 🚀 Como Rodar Localmente

### Pré-requisitos

- [Node.js](https://nodejs.org/) **>= 18.0.0**
- [PostgreSQL](https://www.postgresql.org/) (local ou [Supabase](https://supabase.com/))
- [Git](https://git-scm.com/)

### 1️⃣ Clonar o repositório

```bash
git clone https://github.com/seu-usuario/casa-so-pimenta-ecommerce.git
cd casa-so-pimenta-ecommerce
```

### 2️⃣ Configurar o backend

```bash
cd server
cp .env.example .env
```

Edite o arquivo `.env` com suas credenciais. **Nunca compartilhe seu `.env`**.

**Principais variáveis:**

| Variável | Descrição |
|---|---|
| `PORT` | Porta da API (padrão: `3333`) |
| `FRONTEND_URL` / `ALLOWED_ORIGINS` | URLs permitidas pelo CORS |
| `JWT_SECRET` | Gere com: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `SUPABASE_DB_URL` / `DATABASE_URL` | String de conexão PostgreSQL |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Criação automática do primeiro admin |
| `MP_ACCESS_TOKEN` / `MP_PUBLIC_KEY` | Mercado Pago |
| `SENDGRID_API_KEY` | Envio de e-mails (ou configurar Nodemailer) |
| `CLOUDINARY_*` | Upload de imagens em CDN |
| `MELHOR_ENVIO_*` | Credenciais do Melhor Envio |

### 3️⃣ Instalar dependências

```bash
cd server
npm install
```

### 4️⃣ Inicializar o banco

O servidor executa `createTables()` e `seedDatabase()` automaticamente ao iniciar.

### 5️⃣ Rodar o backend

```bash
npm run dev    # desenvolvimento (nodemon)
npm start      # produção
```

API: `http://localhost:3333`

### 6️⃣ Rodar o frontend

Frontend estático — abra `site/pages/index.html` diretamente ou sirva via Express:

- `http://localhost:3333/site/pages/index.html`
- Ou com **Live Server** (VSCode): `http://127.0.0.1:5500/site/pages/index.html`

> A URL da API é definida em `site/assets/js/config.js` (detecta localhost automaticamente).

---

## 🧪 Testes

Utilizando o **Node.js Test Runner** (`node --test`).

### Frontend

```bash
npm run test:site
```

### Backend

```bash
cd server
npm test
```

### Todos

```bash
npm test   # site + server
```

---

## 🗄️ Banco de Dados

Principais entidades:

`users` · `categories` · `products` · `product_images` · `kits` · `kit_items` · `banners` · `carts` · `cart_items` · `orders` · `order_items` · `coupons` · `login_attempts` · `site_settings`

Detalhes do schema: `server/src/database/schema.js`

---

## 📡 Principais Rotas da API

| Método | Rota | Descrição | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Cadastro | Público |
| POST | `/api/auth/login` | Login | Público |
| POST | `/api/auth/forgot-password` | Recuperação de senha | Público |
| POST | `/api/auth/reset-password` | Redefinir senha | Público |
| GET | `/api/products` | Listar produtos | Público |
| GET | `/api/products/:slug` | Detalhes do produto | Público |
| GET | `/api/products/:id/similar?limit=8` | Produtos semelhantes (máx. 12) | Público |
| GET | `/api/kits` | Listar kits | Público |
| GET | `/api/categories` | Listar categorias | Público |
| GET/POST/PUT/DELETE | `/api/cart` | Carrinho | Opcional |
| POST | `/api/orders` | Criar pedido | Público/Opcional |
| GET | `/api/orders/:id` | Detalhes do pedido | Variável |
| POST | `/api/payments/create-preference` | Preferência Mercado Pago | Público |
| POST | `/api/payments/webhook` | Webhook Mercado Pago | Público |
| GET/POST/PUT/DELETE | `/api/admin/*` | Rotas administrativas | **Admin** |

> As rotas admin exigem `adminMiddleware`. Consulte `server/src/routes/`.

---

## 🔑 Acesso Administrativo

1. Acesse `/site/pages/login/`
2. Use `ADMIN_EMAIL` / `ADMIN_PASSWORD` **apenas na primeira execução**
3. Após o primeiro login, **altere a senha imediatamente**
4. O painel admin fica disponível nas rotas protegidas

---

## ☁️ Deploy

### Backend (Render / Railway / Heroku)

1. Configure as variáveis de ambiente (sem valores de desenvolvimento)
2. Defina `NODE_ENV=production`
3. Configure `ALLOWED_ORIGINS` com o domínio real
4. Gere um `JWT_SECRET` forte e único
5. Use `SUPABASE_DB_URL` do banco de produção
6. Configure chaves reais de `MP_*`, `SENDGRID_*` e `MELHOR_ENVIO_*`
7. Start: `npm start` (em `server/`)
8. `Procfile`: `web: node src/server.js`

### Frontend (Estático)

Hospede em **Netlify**, **Vercel**, **GitHub Pages** ou **Cloudflare Pages**, ou sirva pelo Express em `/site/*`.

Ao hospedar separado, ajuste `API_BASE_URL` em `site/assets/js/config.js` para a URL real da API.

---

## ✅ Checklist Antes de Tornar Público

- [ ] Remover credenciais reais
- [ ] Garantir que `.env` não será commitado (`.gitignore` já existe)
- [ ] Atualizar `.env.example` com apenas placeholders
- [ ] `npm test` passando
- [ ] Remover logs de debug
- [ ] CORS configurado para o domínio de produção
- [ ] Gerar novas chaves (JWT, Mercado Pago, DB, e-mail)

---

## 📝 Observações Técnicas

- **Sem ORM**: SQL puro via `pg` com prepared statements
- **Uploads locais**: `server/uploads/` contém exemplos — em produção, priorize o Cloudinary
- **Testes**: cobrem verificações básicas e podem ser expandidos
- **Frontend sem frameworks**: todo o JavaScript é vanilla, sem build step

---

## 📄 Licença

ISC

---

## 👤 Autor

**Casa Só Pimenta** — projeto desenvolvido para fins comerciais.
