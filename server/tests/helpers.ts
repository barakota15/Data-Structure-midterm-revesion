import request from 'supertest';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool';
import { createApp } from '../app';

export const app = createApp();

export const createUser = async (email: string, password: string, role = 'quiz_owner') => {
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (id, email, password_hash, role)
     VALUES ($1, $2, $3, $4)`
    , [id, email, passwordHash, role]
  );
  return { id, email, password };
};

export const getCsrfToken = async (agent: request.SuperTest<request.Test>) => {
  const response = await agent.get('/api/auth/csrf');
  return response.body.csrfToken as string;
};

export const loginUser = async (agent: request.SuperTest<request.Test>, email: string, password: string) => {
  const csrfToken = await getCsrfToken(agent);
  return agent
    .post('/api/auth/login')
    .set('x-csrf-token', csrfToken)
    .send({ email, password });
};
