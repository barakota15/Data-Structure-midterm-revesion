import { Response } from 'express';
import { ZodError } from 'zod';

export interface ApiErrorDetail {
  message: string;
  field?: string;
}

export const sendError = (
  res: Response,
  status: number,
  message: string,
  code = 'bad_request',
  details?: ApiErrorDetail[]
) => {
  return res.status(status).json({
    error: {
      message,
      code,
      details
    }
  });
};

export const handleZodError = (res: Response, error: ZodError) => {
  const details = error.errors.map((issue) => ({
    message: issue.message,
    field: issue.path.join('.')
  }));
  return sendError(res, 400, 'Validation failed.', 'validation_error', details);
};
