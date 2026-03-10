import type { Request, Response, NextFunction } from 'express';
import type { ApiErrorResponse } from '@flowdesk/shared';
import { AppError } from '../errors.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    if (!err.isOperational) {
      console.error(`[gateway:error] Non-operational error [${req.id}]:`, err.stack);
    }
  } else {
    console.error(`[gateway:error] Unhandled error [${req.id}]:`, err);
  }

  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const code = isAppError ? err.code : 'INTERNAL_ERROR';
  const message = isAppError || process.env['NODE_ENV'] !== 'production'
    ? err.message
    : 'An unexpected error occurred';

  const body: ApiErrorResponse = {
    success: false,
    error: { code, message, details: isAppError ? err.details : undefined },
    requestId: req.id,
    timestamp: new Date().toISOString(),
  };

  res.status(statusCode).json(body);
}

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiErrorResponse = {
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
    requestId: req.id,
    timestamp: new Date().toISOString(),
  };
  res.status(404).json(body);
}
