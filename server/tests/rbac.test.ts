import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, createUser, getCsrfToken, loginUser } from './helpers';
import { pool } from '../db/pool';

const ownerAgent = request.agent(app);
const otherAgent = request.agent(app);

beforeAll(async () => {
  await pool.query('DELETE FROM users');
  await pool.query('DELETE FROM quizzes');
});


describe('RBAC rules', () => {
  it('prevents non-owners from reading draft quizzes', async () => {
    const owner = await createUser('owner3@example.com', 'password123');
    await createUser('other@example.com', 'password123', 'user');

    await loginUser(ownerAgent, owner.email, owner.password);
    const csrfToken = await getCsrfToken(ownerAgent);
    const createResponse = await ownerAgent
      .post('/api/quizzes')
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Draft quiz',
        description: 'Hidden',
        questions: [
          {
            id: 'q1',
            type: 'true_false',
            prompt: 'Test',
            required: true,
            points: 1,
            correctAnswer: true
          }
        ]
      });

    const quizId = createResponse.body.id;

    await loginUser(otherAgent, 'other@example.com', 'password123');
    const response = await otherAgent.get(`/api/quizzes/${quizId}`);

    expect(response.status).toBe(403);
  });
});
