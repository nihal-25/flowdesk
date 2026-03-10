import type { Request, Response, NextFunction } from 'express';
import type { ApiSuccessResponse, ApiErrorResponse } from '@flowdesk/shared';
import { AppError } from '../errors.js';

/**
 * Attaches typed success/error response helpers to res.
 */
export function responseMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.success = <T>(data: T, statusCode = 200): void => {
    const body: ApiSuccessResponse<T> = {
      success: true,
      data,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };
    res.status(statusCode).json(body);
  };

  res.fail = (error: AppError | Error): void => {
    const isAppError = error instanceof AppError;
    const statusCode = isAppError ? error.statusCode : 500;
    const code = isAppError ? error.code : 'INTERNAL_ERROR';
    const message = isAppError || process.env['NODE_ENV'] !== 'production'
      ? error.message
      : 'An unexpected error occurred';

    const body: ApiErrorResponse = {
      success: false,
      error: {
        code,
        message,
        details: isAppError ? error.details : undefined,
      },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };
    res.status(statusCode).json(body);
  };

  next();
}

// Augment Express types
declare global {
  namespace Express {
    interface Request {
      id: string;
    }
    interface Response {
      success: <T>(data: T, statusCode?: number) => void;
      fail: (error: Error) => void;
    }
  }
}
