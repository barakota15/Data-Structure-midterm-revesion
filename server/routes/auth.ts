import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool';
import { handleZodError, sendError } from '../utils/errors';
import { loginSchema, signupSchema } from '../utils/validation';

export const authRouter = Router();

authRouter.get('/csrf', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

authRouter.post('/signup', async (req, res) => {
  const parse = signupSchema.safeParse(req.body);
  if (!parse.success) {
    return handleZodError(res, parse.error);
  }

  const { email, password } = parse.data;

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = randomUUID();

  try {
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role)
       VALUES ($1, $2, $3, $4)`,
      [userId, email, passwordHash, 'quiz_owner']
    );
  } catch (error) {
    return sendError(res, 409, 'Email already registered.', 'conflict');
  }

  req.session.user = { id: userId, email, role: 'quiz_owner' };

  await pool.query(
    `INSERT INTO audit_logs (id, actor_user_id, action_type, entity_type, entity_id, metadata_json, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), userId, 'signup', 'user', userId, {}, req.ip, req.get('user-agent') ?? null]
  );

  return res.json({ user: req.session.user });
});

authRouter.post('/login', async (req, res) => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    return handleZodError(res, parse.error);
  }

  const { email, password, rememberMe } = parse.data;
  const result = await pool.query('SELECT id, email, password_hash, role FROM users WHERE email = $1', [email]);
  const user = result.rows[0];
  if (!user) {
    return sendError(res, 401, 'Invalid credentials.', 'unauthorized');
  }

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) {
    return sendError(res, 401, 'Invalid credentials.', 'unauthorized');
  }

  req.session.user = { id: user.id, email: user.email, role: user.role };
  if (rememberMe) {
    req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30;
  }

  await pool.query(
    `INSERT INTO audit_logs (id, actor_user_id, action_type, entity_type, entity_id, metadata_json, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), user.id, 'login', 'user', user.id, {}, req.ip, req.get('user-agent') ?? null]
  );

  return res.json({ user: req.session.user });
});

authRouter.post('/logout', async (req, res) => {
  const userId = req.session.user?.id;
  req.session.destroy((err) => {
    if (err) {
      return sendError(res, 500, 'Unable to logout.', 'server_error');
    }
    return res.clearCookie('quiz.sid').json({ success: true });
  });

  if (userId) {
    await pool.query(
      `INSERT INTO audit_logs (id, actor_user_id, action_type, entity_type, entity_id, metadata_json, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [randomUUID(), userId, 'logout', 'user', userId, {}, req.ip, req.get('user-agent') ?? null]
    );
  }
});

authRouter.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.json({ user: null });
  }
  return res.json({ user: req.session.user });
});
