import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool';
import { requireAuth } from '../utils/auth';
import { handleZodError, sendError } from '../utils/errors';
import { quizSchema } from '../utils/validation';

export interface QuizQuestionRecord {
  id: string;
  type: string;
  prompt: string;
  required: boolean;
  points: number;
  explanation?: string | null;
  options: string[];
  correctAnswer?: string | boolean;
  correctAnswers: string[];
  acceptedAnswers: string[];
}

export const quizzesRouter = Router();

const createQuiz = async (ownerId: string, payload: ReturnType<typeof quizSchema.parse>) => {
  const {
    title,
    description,
    timeLimitSeconds,
    passingScore,
    shuffleQuestions,
    shuffleOptions,
    showQuestionList,
    allowSkip,
    enforceRequiredBeforeSubmit,
    visibility,
    questions
  } = payload;
  const quizId = randomUUID();

  await pool.query(
    `INSERT INTO quizzes (id, owner_id, title, description, settings_json, visibility, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      quizId,
      ownerId,
      title,
      description ?? null,
      {
        timeLimitSeconds,
        passingScore,
        shuffleQuestions,
        shuffleOptions,
        showQuestionList,
        allowSkip,
        enforceRequiredBeforeSubmit
      },
      visibility ?? 'private',
      'draft'
    ]
  );

  for (const [index, question] of questions.entries()) {
    const questionId = randomUUID();
    await pool.query(
      `INSERT INTO questions (id, quiz_id, type, prompt, required, points, order_index, explanation, correct_answer_json, accepted_answers_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        questionId,
        quizId,
        question.type,
        question.prompt,
        question.required ?? true,
        question.points ?? 1,
        index,
        question.explanation ?? null,
        question.type === 'multiple_choice_multi' ? question.correctAnswers : question.correctAnswer ?? null,
        question.type === 'short_text' ? question.acceptedAnswers : null
      ]
    );

    if ('options' in question) {
      for (const [optionIndex, option] of question.options.entries()) {
        await pool.query(
          `INSERT INTO options (id, question_id, text, order_index)
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), questionId, option, optionIndex]
        );
      }
    }
  }

  return quizId;
};

export const fetchQuizWithQuestions = async (quizId: string) => {
  const quizResult = await pool.query('SELECT * FROM quizzes WHERE id = $1', [quizId]);
  const quiz = quizResult.rows[0];
  if (!quiz) {
    return null;
  }

  const questionsResult = await pool.query(
    'SELECT * FROM questions WHERE quiz_id = $1 ORDER BY order_index ASC',
    [quizId]
  );
  const questionIds = questionsResult.rows.map((row) => row.id);
  const optionsResult = questionIds.length
    ? await pool.query(
        'SELECT * FROM options WHERE question_id = ANY($1::uuid[]) ORDER BY order_index ASC',
        [questionIds]
      )
    : { rows: [] };

  const optionsByQuestion = optionsResult.rows.reduce<Record<string, string[]>>((acc, option) => {
    const list = acc[option.question_id] ?? [];
    list.push(option.text);
    acc[option.question_id] = list;
    return acc;
  }, {});

  const questions = questionsResult.rows.map((row) => ({
    id: row.id,
    type: row.type,
    prompt: row.prompt,
    required: row.required,
    points: row.points,
    explanation: row.explanation,
    options: optionsByQuestion[row.id] ?? [],
    correctAnswer: row.type === 'multiple_choice_single' || row.type === 'true_false' ? row.correct_answer_json : undefined,
    correctAnswers: row.type === 'multiple_choice_multi' ? row.correct_answer_json ?? [] : [],
    acceptedAnswers: row.type === 'short_text' ? row.accepted_answers_json ?? [] : []
  }));

  return { quiz, questions };
};

quizzesRouter.post('/', requireAuth, async (req, res) => {
  const parse = quizSchema.safeParse(req.body);
  if (!parse.success) {
    return handleZodError(res, parse.error);
  }

  const ownerId = req.session.user!.id;
  const quizId = await createQuiz(ownerId, parse.data);

  await pool.query(
    `INSERT INTO audit_logs (id, actor_user_id, action_type, entity_type, entity_id, metadata_json, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), ownerId, 'quiz_create', 'quiz', quizId, { status: 'draft' }, req.ip, req.get('user-agent') ?? null]
  );

  return res.status(201).json({ id: quizId });
});

quizzesRouter.post('/import', requireAuth, async (req, res) => {
  const parse = quizSchema.safeParse(req.body);
  if (!parse.success) {
    return handleZodError(res, parse.error);
  }

  const ownerId = req.session.user!.id;
  const quizId = await createQuiz(ownerId, parse.data);

  await pool.query(
    `INSERT INTO audit_logs (id, actor_user_id, action_type, entity_type, entity_id, metadata_json, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), ownerId, 'quiz_import', 'quiz', quizId, {}, req.ip, req.get('user-agent') ?? null]
  );

  return res.status(201).json({ id: quizId });
});

quizzesRouter.get('/mine', requireAuth, async (req, res) => {
  const ownerId = req.session.user!.id;
  const result = await pool.query(
    'SELECT id, title, description, visibility, status, created_at, updated_at FROM quizzes WHERE owner_id = $1 ORDER BY updated_at DESC',
    [ownerId]
  );
  return res.json({ quizzes: result.rows });
});

quizzesRouter.get('/:id', requireAuth, async (req, res) => {
  const quizId = req.params.id;
  const quizWithQuestions = await fetchQuizWithQuestions(quizId);
  if (!quizWithQuestions) {
    return sendError(res, 404, 'Quiz not found.', 'not_found');
  }

  const { quiz, questions } = quizWithQuestions;
  const ownerId = quiz.owner_id;
  const isOwner = req.session.user!.id === ownerId;

  if (!isOwner && quiz.status !== 'published') {
    return sendError(res, 403, 'Quiz is not published.', 'forbidden');
  }
  if (!isOwner && quiz.visibility === 'private') {
    return sendError(res, 403, 'Quiz is private.', 'forbidden');
  }

  return res.json({
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    visibility: quiz.visibility,
    status: quiz.status,
    settings: quiz.settings_json,
    questions
  });
});

quizzesRouter.put('/:id', requireAuth, async (req, res) => {
  const parse = quizSchema.safeParse(req.body);
  if (!parse.success) {
    return handleZodError(res, parse.error);
  }

  const quizId = req.params.id;
  const ownerId = req.session.user!.id;
  const quizResult = await pool.query('SELECT * FROM quizzes WHERE id = $1', [quizId]);
  const quiz = quizResult.rows[0];
  if (!quiz || quiz.owner_id !== ownerId) {
    return sendError(res, 404, 'Quiz not found.', 'not_found');
  }

  const { title, description, timeLimitSeconds, passingScore, shuffleQuestions, shuffleOptions, showQuestionList, allowSkip, enforceRequiredBeforeSubmit, visibility, questions } = parse.data;

  await pool.query(
    `UPDATE quizzes SET title = $1, description = $2, settings_json = $3, visibility = $4, updated_at = NOW() WHERE id = $5`,
    [
      title,
      description ?? null,
      {
        timeLimitSeconds,
        passingScore,
        shuffleQuestions,
        shuffleOptions,
        showQuestionList,
        allowSkip,
        enforceRequiredBeforeSubmit
      },
      visibility ?? quiz.visibility,
      quizId
    ]
  );

  await pool.query('DELETE FROM options WHERE question_id IN (SELECT id FROM questions WHERE quiz_id = $1)', [quizId]);
  await pool.query('DELETE FROM questions WHERE quiz_id = $1', [quizId]);

  for (const [index, question] of questions.entries()) {
    const questionId = randomUUID();
    await pool.query(
      `INSERT INTO questions (id, quiz_id, type, prompt, required, points, order_index, explanation, correct_answer_json, accepted_answers_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        questionId,
        quizId,
        question.type,
        question.prompt,
        question.required ?? true,
        question.points ?? 1,
        index,
        question.explanation ?? null,
        question.type === 'multiple_choice_multi' ? question.correctAnswers : question.correctAnswer ?? null,
        question.type === 'short_text' ? question.acceptedAnswers : null
      ]
    );

    if ('options' in question) {
      for (const [optionIndex, option] of question.options.entries()) {
        await pool.query(
          `INSERT INTO options (id, question_id, text, order_index)
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), questionId, option, optionIndex]
        );
      }
    }
  }

  await pool.query(
    `INSERT INTO audit_logs (id, actor_user_id, action_type, entity_type, entity_id, metadata_json, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), ownerId, 'quiz_update', 'quiz', quizId, {}, req.ip, req.get('user-agent') ?? null]
  );

  return res.json({ id: quizId });
});

quizzesRouter.post('/:id/publish', requireAuth, async (req, res) => {
  const quizId = req.params.id;
  const ownerId = req.session.user!.id;
  const result = await pool.query('SELECT * FROM quizzes WHERE id = $1', [quizId]);
  const quiz = result.rows[0];
  if (!quiz || quiz.owner_id !== ownerId) {
    return sendError(res, 404, 'Quiz not found.', 'not_found');
  }

  await pool.query('UPDATE quizzes SET status = $1, updated_at = NOW() WHERE id = $2', ['published', quizId]);
  await pool.query(
    `INSERT INTO audit_logs (id, actor_user_id, action_type, entity_type, entity_id, metadata_json, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), ownerId, 'quiz_publish', 'quiz', quizId, {}, req.ip, req.get('user-agent') ?? null]
  );

  return res.json({ id: quizId, status: 'published' });
});

quizzesRouter.delete('/:id', requireAuth, async (req, res) => {
  const quizId = req.params.id;
  const ownerId = req.session.user!.id;
  const result = await pool.query('SELECT * FROM quizzes WHERE id = $1', [quizId]);
  const quiz = result.rows[0];
  if (!quiz || quiz.owner_id !== ownerId) {
    return sendError(res, 404, 'Quiz not found.', 'not_found');
  }

  await pool.query('DELETE FROM quizzes WHERE id = $1', [quizId]);
  await pool.query(
    `INSERT INTO audit_logs (id, actor_user_id, action_type, entity_type, entity_id, metadata_json, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), ownerId, 'quiz_delete', 'quiz', quizId, {}, req.ip, req.get('user-agent') ?? null]
  );

  return res.json({ success: true });
});

quizzesRouter.get('/:id/attempts', requireAuth, async (req, res) => {
  const quizId = req.params.id;
  const ownerId = req.session.user!.id;
  const quizResult = await pool.query('SELECT owner_id FROM quizzes WHERE id = $1', [quizId]);
  const quiz = quizResult.rows[0];
  if (!quiz || quiz.owner_id !== ownerId) {
    return sendError(res, 403, 'Not authorized to view attempts.', 'forbidden');
  }

  const attempts = await pool.query(
    `SELECT attempts.*, users.email
     FROM attempts
     JOIN users ON attempts.user_id = users.id
     WHERE attempts.quiz_id = $1
     ORDER BY attempts.submitted_at DESC`,
    [quizId]
  );

  const scores = attempts.rows.map((row) => row.score ?? 0).sort((a, b) => a - b);
  const times = attempts.rows.map((row) => row.time_taken_seconds ?? 0);
  const passCount = attempts.rows.filter((row) => row.passed).length;
  const averageScore = scores.length ? Math.round(scores.reduce((sum, val) => sum + val, 0) / scores.length) : 0;
  const medianScore = scores.length
    ? scores.length % 2 === 1
      ? scores[Math.floor(scores.length / 2)]
      : Math.round((scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2)
    : 0;
  const passRate = scores.length ? Math.round((passCount / scores.length) * 100) : 0;
  const averageTime = times.length ? Math.round(times.reduce((sum, val) => sum + val, 0) / times.length) : 0;

  return res.json({
    attempts: attempts.rows,
    summary: {
      attempts: scores.length,
      averageScore,
      medianScore,
      passRate,
      averageTime
    }
  });
});
