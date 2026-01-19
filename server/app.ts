import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import csrf from 'csurf';
import rateLimit from 'express-rate-limit';
import connectPgSimple from 'connect-pg-simple';
import { pool } from './db/pool';
import { authRouter } from './routes/auth';
import { quizzesRouter } from './routes/quizzes';
import { attemptsRouter } from './routes/attempts';
import { sendError } from './utils/errors';

export const createApp = () => {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const PgSession = connectPgSimple(session);

  app.use(
    session({
      store: new PgSession({ pool, tableName: 'sessions' }),
      name: 'quiz.sid',
      secret: process.env.SESSION_SECRET ?? 'dev-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 8
      }
    })
  );

  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.use(csrf());

  app.use('/api/auth', authRouter);
  app.use('/api/quizzes', quizzesRouter);
  app.use('/api', attemptsRouter);

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.code === 'EBADCSRFTOKEN') {
      return sendError(res, 403, 'Invalid CSRF token.', 'csrf_error');
    }
    console.error(err);
    return sendError(res, 500, 'Server error.', 'server_error');
  });

  return app;
};
