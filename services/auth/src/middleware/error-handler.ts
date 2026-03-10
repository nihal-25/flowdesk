import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors.js';
import type { ApiErrorResponse } from '@flowdesk/shared';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    console.error(
      `[error] ${err.code} ${err.statusCode} — ${err.message}`,
      `[requestId=${req.id}]`,
      err.isOperational ? '' : err.stack,
    );
  } else {
    // Unexpected error — log the full stack
    console.error('[error] Unhandled error:', err, `[requestId=${req.id}]`);
  }

  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const code = isAppError ? err.code : 'INTERNAL_ERROR';
  const message =
    isAppError || process.env['NODE_ENV'] !== 'production'
      ? err.message
      : 'An unexpected error occurred';

  const body: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      details: isAppError ? err.details : undefined,
    },
    requestId: req.id,
    timestamp: new Date().toISOString(),
  };

  res.status(statusCode).json(body);
}

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    requestId: req.id,
    timestamp: new Date().toISOString(),
  };
  res.status(404).json(body);
}
