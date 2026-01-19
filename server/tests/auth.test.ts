import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, createUser, getCsrfToken } from './helpers';
import { pool } from '../db/pool';

const agent = request.agent(app);

beforeAll(async () => {
  await pool.query('DELETE FROM users');
});


describe('auth flows', () => {
  it('creates a session on signup and allows logout', async () => {
    const csrfToken = await getCsrfToken(agent);
    const signupResponse = await agent.post('/api/auth/signup').set('x-csrf-token', csrfToken).send({
      email: 'newuser@example.com',
      password: 'password123'
    });

    expect(signupResponse.status).toBe(200);
    expect(signupResponse.body.user.email).toBe('newuser@example.com');

    const logoutCsrf = await getCsrfToken(agent);
    const logoutResponse = await agent.post('/api/auth/logout').set('x-csrf-token', logoutCsrf);
    expect(logoutResponse.status).toBe(200);
  });

  it('logs in existing users', async () => {
    await createUser('owner2@example.com', 'password123');
    const csrfToken = await getCsrfToken(agent);
    const response = await agent.post('/api/auth/login').set('x-csrf-token', csrfToken).send({
      email: 'owner2@example.com',
      password: 'password123'
    });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe('owner2@example.com');
  });
});
