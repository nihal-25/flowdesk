import type { ErrorCode } from '@flowdesk/shared';
import { ERROR_CODES } from '@flowdesk/shared';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: ErrorCode,
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AuthError extends AppError {
  constructor(message = 'Authentication required', code: ErrorCode = ERROR_CODES.UNAUTHORIZED) {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, ERROR_CODES.FORBIDDEN);
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super('Too many requests. Please slow down.', 429, ERROR_CODES.RATE_LIMIT_EXCEEDED);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, ERROR_CODES.NOT_FOUND);
  }
}
