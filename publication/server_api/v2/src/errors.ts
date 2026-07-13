export const PROBLEM_TYPE_BASE = 'https://dedalo.dev/api/problems/';

export class ApiError extends Error {
  constructor(
    public status: number,
    public type: string,
    public title: string,
    detail?: string,
    public extensions?: Record<string, unknown>,
  ) {
    super(detail ?? title);
    this.name = 'ApiError';
  }

  get detail(): string {
    return this.message;
  }
}

export class ValidationError extends ApiError {
  constructor(detail: string, extensions?: Record<string, unknown>) {
    super(400, `${PROBLEM_TYPE_BASE}validation-error`, 'Validation Error', detail, extensions);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(detail: string) {
    super(401, `${PROBLEM_TYPE_BASE}unauthorized`, 'Unauthorized', detail);
    this.name = 'UnauthorizedError';
  }
}

export class NotFoundError extends ApiError {
  constructor(detail: string) {
    super(404, `${PROBLEM_TYPE_BASE}not-found`, 'Not Found', detail);
    this.name = 'NotFoundError';
  }
}

export class MethodNotAllowedError extends ApiError {
  constructor(method: string, public allow: string[]) {
    super(
      405,
      `${PROBLEM_TYPE_BASE}method-not-allowed`,
      'Method Not Allowed',
      `Method ${method} is not allowed for this resource. Allowed: ${allow.join(', ')}`,
    );
    this.name = 'MethodNotAllowedError';
  }
}

export class RateLimitError extends ApiError {
  constructor(detail: string) {
    super(429, `${PROBLEM_TYPE_BASE}rate-limit-exceeded`, 'Too Many Requests', detail);
    this.name = 'RateLimitError';
  }
}

export class ServiceError extends ApiError {
  constructor(detail: string) {
    super(500, `${PROBLEM_TYPE_BASE}internal-error`, 'Internal Server Error', detail);
    this.name = 'ServiceError';
  }
}

export class TimeoutError extends ApiError {
  constructor(detail = 'The request took too long to process') {
    super(504, `${PROBLEM_TYPE_BASE}timeout`, 'Gateway Timeout', detail);
    this.name = 'TimeoutError';
  }
}
