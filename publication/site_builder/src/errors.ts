/**
 * The error taxonomy — one class per way this daemon is allowed to fail.
 *
 * Same contract as publication/server_api/v2/src/errors.ts: every error is rendered as
 * an RFC 9457 `application/problem+json` document, each class fixes the HTTP `status`,
 * a stable `type` URI and a human `title`, and throwing is the ONLY way to produce an
 * error response — handlers never construct one. The engine's tool_sitebuilder proxy
 * matches on the `type` URI (its wire.ts mirrors these), so treat the URIs as published
 * API, not as strings.
 */

export const PROBLEM_TYPE_BASE = 'https://dedalo.dev/site-builder/problems/';

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

/** The client's request was malformed: a bad slug, a missing actor, an unknown option. */
export class ValidationError extends ApiError {
  constructor(detail: string, extensions?: Record<string, unknown>) {
    super(400, `${PROBLEM_TYPE_BASE}validation-error`, 'Validation Error', detail, extensions);
    this.name = 'ValidationError';
  }
}

// Missing or wrong bearer token. Unlike the publication API this surface is NEVER open:
// the engine is the only legitimate caller and it always holds the token.
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

/**
 * The request names a real resource in a state that cannot accept it: creating a slug
 * that exists, starting a turn while one is running, publishing with no successful
 * build. The `reason` extension carries a stable machine code (e.g. 'session_running',
 * 'no_build') so the engine UI can branch without parsing prose.
 */
export class ConflictError extends ApiError {
  constructor(detail: string, reason?: string) {
    super(409, `${PROBLEM_TYPE_BASE}conflict`, 'Conflict', detail, reason ? { reason } : undefined);
    this.name = 'ConflictError';
  }
}

// A limit gate refused the work: session concurrency cap, MAX_SITES, disk quota.
export class LimitExceededError extends ApiError {
  constructor(detail: string, reason?: string) {
    super(429, `${PROBLEM_TYPE_BASE}limit-exceeded`, 'Limit Exceeded', detail, reason ? { reason } : undefined);
    this.name = 'LimitExceededError';
  }
}

// Our fault, not the caller's. Only echoes the underlying message in development —
// in production the detail is a fixed string so an agent CLI's stderr or a stack trace
// never becomes part of a response the engine relays to a browser.
export class ServiceError extends ApiError {
  constructor(detail: string) {
    super(500, `${PROBLEM_TYPE_BASE}internal-error`, 'Internal Server Error', detail);
    this.name = 'ServiceError';
  }
}
