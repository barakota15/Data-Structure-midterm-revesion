import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, createUser, getCsrfToken, loginUser } from './helpers';
import { pool } from '../db/pool';

const agent = request.agent(app);

beforeAll(async () => {
  await pool.query('DELETE FROM users');
  await pool.query('DELETE FROM quizzes');
  await createUser('builder@example.com', 'password123');
  await loginUser(agent, 'builder@example.com', 'password123');
});


describe('quiz import validation', () => {
  it('requires required flag to be boolean', async () => {
    const csrfToken = await getCsrfToken(agent);
    const response = await agent.post('/api/quizzes/import').set('x-csrf-token', csrfToken).send({
      title: 'Bad quiz',
      questions: [
        {
          id: 'q1',
          type: 'true_false',
          prompt: 'Bad question',
          required: 'yes',
          points: 1,
          correctAnswer: true
        }
      ]
    });

    expect(response.status).toBe(400);
  });
});
