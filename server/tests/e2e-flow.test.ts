import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, createUser, getCsrfToken, loginUser } from './helpers';
import { pool } from '../db/pool';

const ownerAgent = request.agent(app);
const participantAgent = request.agent(app);

describe('quiz lifecycle flow', () => {
  beforeAll(async () => {
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM quizzes');
    await pool.query('DELETE FROM attempts');

    await createUser('owner4@example.com', 'password123');
    await createUser('participant4@example.com', 'password123', 'user');
  });


  it('allows owner to publish and participant to attempt', async () => {
    await loginUser(ownerAgent, 'owner4@example.com', 'password123');
    const csrfToken = await getCsrfToken(ownerAgent);
    const createResponse = await ownerAgent
      .post('/api/quizzes')
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'Flow quiz',
        description: 'Test flow',
        questions: [
          {
            id: 'q1',
            type: 'true_false',
            prompt: 'Ready?',
            required: true,
            points: 1,
            correctAnswer: true
          }
        ]
      });

    const quizId = createResponse.body.id;
    const publishToken = await getCsrfToken(ownerAgent);
    await ownerAgent.post(`/api/quizzes/${quizId}/publish`).set('x-csrf-token', publishToken);

    await loginUser(participantAgent, 'participant4@example.com', 'password123');
    const startToken = await getCsrfToken(participantAgent);
    const startResponse = await participantAgent
      .post(`/api/quizzes/${quizId}/attempts/start`)
      .set('x-csrf-token', startToken);

    const attemptId = startResponse.body.attemptId;
    const submitToken = await getCsrfToken(participantAgent);
    const submitResponse = await participantAgent
      .post(`/api/attempts/${attemptId}/submit`)
      .set('x-csrf-token', submitToken)
      .send({ answers: { q1: true } });

    expect(submitResponse.status).toBe(200);

    const ownerToken = await getCsrfToken(ownerAgent);
    const attemptsResponse = await ownerAgent
      .get(`/api/quizzes/${quizId}/attempts`)
      .set('x-csrf-token', ownerToken);

    expect(attemptsResponse.status).toBe(200);
    expect(attemptsResponse.body.attempts.length).toBeGreaterThan(0);
  });
});
