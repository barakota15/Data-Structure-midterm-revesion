import { NextFunction, Request, Response } from 'express';
import { sendError } from './errors';

export interface SessionUser {
  id: string;
  email: string;
  role: string;
}

declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.user) {
    return sendError(res, 401, 'Authentication required.', 'unauthorized');
  }
  return next();
};

export const requireRole = (roles: string[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.user) {
    return sendError(res, 401, 'Authentication required.', 'unauthorized');
  }
  if (!roles.includes(req.session.user.role)) {
    return sendError(res, 403, 'Insufficient permissions.', 'forbidden');
  }
  return next();
};
