import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool';
import { requireAuth } from '../utils/auth';
import { sendError, handleZodError } from '../utils/errors';
import { attemptAnswerSchema } from '../utils/validation';
import { fetchQuizWithQuestions } from './quizzes';
import { scoreAttempt } from '../utils/scoring';

export const attemptsRouter = Router();

attemptsRouter.post('/quizzes/:id/attempts/start', requireAuth, async (req, res) => {
  const quizId = req.params.id;
  const quizData = await fetchQuizWithQuestions(quizId);
  if (!quizData) {
    return sendError(res, 404, 'Quiz not found.', 'not_found');
  }

  const { quiz } = quizData;
  const userId = req.session.user!.id;

  if (quiz.status !== 'published') {
    return sendError(res, 403, 'Quiz is not published.', 'forbidden');
  }
  if (quiz.visibility === 'private' && quiz.owner_id !== userId) {
    return sendError(res, 403, 'Quiz is private.', 'forbidden');
  }

  const attemptId = randomUUID();
  await pool.query(
    `INSERT INTO attempts (id, quiz_id, user_id, started_at)
     VALUES ($1, $2, $3, NOW())`,
    [attemptId, quizId, userId]
  );

  await pool.query(
    `INSERT INTO audit_logs (id, actor_user_id, action_type, entity_type, entity_id, metadata_json, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), userId, 'attempt_started', 'attempt', attemptId, { quizId }, req.ip, req.get('user-agent') ?? null]
  );

  return res.status(201).json({ attemptId });
});

attemptsRouter.post('/attempts/:attemptId/answer', requireAuth, async (req, res) => {
  const attemptId = req.params.attemptId;
  const parse = attemptAnswerSchema.safeParse(req.body);
  if (!parse.success) {
    return handleZodError(res, parse.error);
  }

  const attemptResult = await pool.query('SELECT * FROM attempts WHERE id = $1', [attemptId]);
  const attempt = attemptResult.rows[0];
  if (!attempt || attempt.user_id !== req.session.user!.id) {
    return sendError(res, 404, 'Attempt not found.', 'not_found');
  }

  await pool.query('UPDATE attempts SET submitted_at = NULL WHERE id = $1', [attemptId]);

  for (const [questionId, answer] of Object.entries(parse.data.answers)) {
    await pool.query(
      `INSERT INTO answers (id, attempt_id, question_id, answer_json)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (attempt_id, question_id) DO UPDATE SET answer_json = $4`,
      [randomUUID(), attemptId, questionId, answer]
    );
  }

  return res.json({ success: true });
});

attemptsRouter.post('/attempts/:attemptId/submit', requireAuth, async (req, res) => {
  const attemptId = req.params.attemptId;
  const parse = attemptAnswerSchema.safeParse(req.body);
  if (!parse.success) {
    return handleZodError(res, parse.error);
  }

  const attemptResult = await pool.query('SELECT * FROM attempts WHERE id = $1', [attemptId]);
  const attempt = attemptResult.rows[0];
  if (!attempt || attempt.user_id !== req.session.user!.id) {
    return sendError(res, 404, 'Attempt not found.', 'not_found');
  }

  const quizData = await fetchQuizWithQuestions(attempt.quiz_id);
  if (!quizData) {
    return sendError(res, 404, 'Quiz not found.', 'not_found');
  }

  const { quiz, questions } = quizData;
  const requiredIds = questions.filter((question) => question.required).map((question) => question.id);
  const missingRequired = requiredIds.filter((id) => {
    const answer = parse.data.answers[id];
    if (Array.isArray(answer)) {
      return answer.length === 0;
    }
    if (typeof answer === 'string') {
      return answer.trim().length === 0;
    }
    return answer === null || answer === undefined;
  });

  if (quiz.settings_json?.enforceRequiredBeforeSubmit !== false && missingRequired.length > 0) {
    return sendError(res, 400, 'Required questions are missing answers.', 'missing_required', [
      { message: 'Answer required questions before submitting.' }
    ]);
  }

  const scoreResult = scoreAttempt(questions, parse.data.answers, quiz.settings_json?.passingScore);
  const timeTakenSeconds = attempt.started_at
    ? Math.round((Date.now() - new Date(attempt.started_at).getTime()) / 1000)
    : null;

  await pool.query(
    `UPDATE attempts
     SET submitted_at = NOW(), time_taken_seconds = $1, score = $2, percentage = $3, passed = $4
     WHERE id = $5`,
    [timeTakenSeconds, scoreResult.totalScore, scoreResult.percentage, scoreResult.passed, attemptId]
  );

  await pool.query('DELETE FROM answers WHERE attempt_id = $1', [attemptId]);

  for (const question of scoreResult.perQuestion) {
    await pool.query(
      `INSERT INTO answers (id, attempt_id, question_id, answer_json, is_correct, earned_points)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        attemptId,
        question.questionId,
        question.answer,
        question.isCorrect,
        question.earnedPoints
      ]
    );
  }

  await pool.query(
    `INSERT INTO audit_logs (id, actor_user_id, action_type, entity_type, entity_id, metadata_json, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), req.session.user!.id, 'attempt_submitted', 'attempt', attemptId, {}, req.ip, req.get('user-agent') ?? null]
  );

  return res.json({
    attemptId,
    score: scoreResult.totalScore,
    percentage: scoreResult.percentage,
    passed: scoreResult.passed,
    timeTakenSeconds,
    perQuestion: scoreResult.perQuestion
  });
});

attemptsRouter.get('/attempts/mine', requireAuth, async (req, res) => {
  const userId = req.session.user!.id;
  const result = await pool.query(
    `SELECT attempts.*, quizzes.title
     FROM attempts
     JOIN quizzes ON attempts.quiz_id = quizzes.id
     WHERE attempts.user_id = $1
     ORDER BY attempts.submitted_at DESC`,
    [userId]
  );
  return res.json({ attempts: result.rows });
});

attemptsRouter.get('/attempts/:attemptId', requireAuth, async (req, res) => {
  const attemptId = req.params.attemptId;
  const attemptResult = await pool.query(
    `SELECT attempts.*, quizzes.owner_id
     FROM attempts
     JOIN quizzes ON attempts.quiz_id = quizzes.id
     WHERE attempts.id = $1`,
    [attemptId]
  );
  const attempt = attemptResult.rows[0];
  if (!attempt) {
    return sendError(res, 404, 'Attempt not found.', 'not_found');
  }

  const userId = req.session.user!.id;
  if (attempt.user_id !== userId && attempt.owner_id !== userId) {
    return sendError(res, 403, 'Not authorized to view this attempt.', 'forbidden');
  }

  const answers = await pool.query(
    `SELECT answers.*, questions.prompt
     FROM answers
     JOIN questions ON answers.question_id = questions.id
     WHERE answers.attempt_id = $1`,
    [attemptId]
  );

  return res.json({ attempt, answers: answers.rows });
});
