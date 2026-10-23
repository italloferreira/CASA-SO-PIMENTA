import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { pool } from '../database/connection.js';
import { forgotPasswordEmail } from '../utils/emailTemplates.js';
import { getMailFrom } from '../utils/mailFrom.js';
import { sendMail, isMailConfigured } from '../utils/mailer.js';

export async function register(req, res) {
  const { name, email, password, phone } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({
      message: 'Nome, email e senha são obrigatórios.'
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      message: 'A senha deve ter no mínimo 8 caracteres.'
    });
  }

  const userExists = await pool.query(`
    SELECT id FROM users WHERE email = $1
  `, [email]);

  if (userExists.rows.length > 0) {
    return res.status(400).json({
      message: 'Este email já está cadastrado.'
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const result = await pool.query(`
    INSERT INTO users (name, email, password, phone)
    VALUES ($1, $2, $3, $4)
    RETURNING id
  `, [
    name,
    email,
    hashedPassword,
    phone || null
  ]);

  res.status(201).json({
    id: result.rows[0].id,
    message: 'Usuário cadastrado com sucesso.'
  });
}

const MAX_LOGIN_ATTEMPTS = 5;

export async function login(req, res) {
  const { email, password } = req.body;

  const attemptsResult = await pool.query(`
    SELECT COUNT(*) as attempts FROM login_attempts
    WHERE email = $1 AND attempted_at > NOW() - INTERVAL '15 minutes'
  `, [email]);
  const attempts = Number(attemptsResult.rows[0]?.attempts) || 0;

  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    return res.status(423).json({
      message: 'Conta bloqueada temporariamente. Tente novamente em 15 minutos.'
    });
  }

  const result = await pool.query(`
    SELECT * FROM users WHERE email = $1
  `, [email]);

  const user = result.rows[0];

  if (!user) {
    await pool.query(`INSERT INTO login_attempts (email) VALUES ($1)`, [email]);
    return res.status(401).json({
      message: 'Email ou senha inválidos.'
    });
  }

  const passwordIsValid = await bcrypt.compare(password, user.password);

  if (!passwordIsValid) {
    await pool.query(`INSERT INTO login_attempts (email) VALUES ($1)`, [email]);
    return res.status(401).json({
      message: 'Email ou senha inválidos.'
    });
  }

  await pool.query(`DELETE FROM login_attempts WHERE email = $1`, [email]);

  sendSession(res, user);
}

function sendSession(res, user) {
  const token = jwt.sign(
    {
      id: user.id,
      role: user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '7d'
    }
  );

  res.cookie('csp_admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      cep: user.cep,
      address: user.address,
      city: user.city,
      state: user.state,
      role: user.role
    }
  });
}

let googleClient = null;

function getGoogleClient() {
  if (!googleClient) googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  return googleClient;
}

export function getGoogleConfig(req, res) {
  res.json({ clientId: process.env.GOOGLE_CLIENT_ID || null });
}

export async function googleLogin(req, res) {
  const { credential } = req.body;

  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ message: 'Login com Google não está configurado.' });
  }

  if (!credential) {
    return res.status(400).json({ message: 'Credencial do Google não informada.' });
  }

  let payload;
  try {
    const ticket = await getGoogleClient().verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    payload = ticket.getPayload();
  } catch (err) {
    console.error('Token Google inválido:', err.message);
    return res.status(401).json({ message: 'Não foi possível validar o login com Google.' });
  }

  if (!payload || !payload.email || !payload.email_verified) {
    return res.status(401).json({ message: 'Email do Google não verificado.' });
  }

  const googleId = payload.sub;
  const email = payload.email.toLowerCase();

  const result = await pool.query(`
    SELECT * FROM users WHERE google_id = $1 OR LOWER(email) = $2
    ORDER BY (google_id = $1) DESC NULLS LAST
    LIMIT 1
  `, [googleId, email]);

  let user = result.rows[0];

  if (user && user.role === 'admin') {
    return res.status(403).json({ message: 'Administradores devem entrar com email e senha.' });
  }

  if (user && !user.google_id) {
    await pool.query(`
      UPDATE users SET google_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
    `, [googleId, user.id]);
  }

  if (!user) {
    // senha aleatória inutilizável; o cliente pode definir uma via "esqueci minha senha"
    const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    const inserted = await pool.query(`
      INSERT INTO users (name, email, password, google_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [payload.name || email.split('@')[0], email, randomPassword, googleId]);
    user = inserted.rows[0];
  }

  sendSession(res, user);
}

export async function logout(req, res) {
  res.clearCookie('csp_admin_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  res.json({ message: 'Sessão encerrada.' });
}

export async function getProfile(req, res) {
  const { id } = req.user;

  const result = await pool.query(`
    SELECT id, name, email, phone, cep, address, city, state, role, created_at
    FROM users WHERE id = $1
  `, [id]);

  const user = result.rows[0];

  if (!user) {
    return res.status(404).json({
      message: 'Usuário não encontrado.'
    });
  }

  res.json(user);
}

export async function updateProfile(req, res) {
  const { id } = req.user;
  const { name, phone, cep, address, city, state } = req.body;

  if (!name) {
    return res.status(400).json({
      message: 'Nome é obrigatório.'
    });
  }

  const result = await pool.query(`
    UPDATE users
    SET name = $1, phone = $2, cep = $3, address = $4, city = $5,
        state = $6, updated_at = CURRENT_TIMESTAMP
    WHERE id = $7
    RETURNING id, name, email, phone, cep, address, city, state, role
  `, [
    name,
    phone || null,
    cep || null,
    address || null,
    city || null,
    state || null,
    id
  ]);

  if (result.rowCount === 0) {
    return res.status(404).json({
      message: 'Usuário não encontrado.'
    });
  }

  const updatedUser = result.rows[0];

  res.json({
    message: 'Perfil atualizado com sucesso.',
    user: updatedUser
  });
}

export async function forgotPassword(req, res) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email é obrigatório.' });
  }

  let user;
  try {
    const result = await pool.query(`SELECT id, name FROM users WHERE email = $1`, [email]);
    user = result.rows[0];
  } catch (err) {
    console.error('Erro ao consultar usuário:', err.message);
    return res.status(503).json({ message: 'Banco de dados indisponível. Tente novamente mais tarde.' });
  }

  if (!user) {
    return res.status(200).json({ message: 'Se o email existir, você receberá um link de recuperação.' });
  }

  try {
    await pool.query(`
      DELETE FROM password_resets
      WHERE user_id = $1 AND (used = 1 OR expires_at < NOW())
    `, [user.id]);
  } catch (err) {
    console.error('Erro ao limpar tokens antigos:', err.message);
  }

  const token = crypto.randomBytes(32).toString('hex');

  try {
    await pool.query(`
      INSERT INTO password_resets (user_id, token, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '1 hour')
    `, [user.id, token]);
  } catch (err) {
    console.error('Erro ao salvar token:', err.message);
    return res.status(500).json({ message: 'Erro interno. Tente novamente.' });
  }

  const resetLink = process.env.FRONTEND_URL + '/site/pages/login/reset-password/index.html?token=' + token;

  if (isMailConfigured()) {
    try {
      await sendMail({
        to: email,
        from: getMailFrom(),
        subject: 'Recuperação de senha - Casa Só Pimenta',
        html: forgotPasswordEmail(user.name, resetLink)
      });
      console.log('Email de recuperação enviado com sucesso');
    } catch (err) {
      console.error('Erro ao enviar email de recuperação:', err.message);
      return res.status(500).json({
        message: 'Erro ao enviar email.'
      });
    }
  } else {
    console.log('\n========== LINK DE RECUPERAÇÃO (modo dev) ==========');
    console.log(resetLink);
    console.log('==================================================\n');
  }

  res.json({ message: 'Se o email existir, você receberá um link de recuperação.' });
}

export async function resetPassword(req, res) {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: 'Token e nova senha são obrigatórios.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'A senha deve ter no mínimo 8 caracteres.' });
  }

  let result;
  try {
    result = await pool.query(`
      SELECT * FROM password_resets
      WHERE token = $1 AND used = 0 AND expires_at > NOW()
    `, [token]);
  } catch (err) {
    console.error('Erro ao consultar token:', err.message);
    return res.status(503).json({ message: 'Banco de dados indisponível.' });
  }

  if (result.rows.length === 0) {
    return res.status(400).json({ message: 'Token inválido ou expirado.' });
  }

  const reset = result.rows[0];
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    await pool.query(`
      UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
    `, [hashedPassword, reset.user_id]);
    await pool.query(`
      UPDATE password_resets SET used = 1 WHERE id = $1
    `, [reset.id]);
  } catch (err) {
    console.error('Erro ao redefinir senha:', err.message);
    return res.status(500).json({ message: 'Erro ao redefinir senha. Tente novamente.' });
  }

  res.json({ message: 'Senha redefinida com sucesso.' });
}
