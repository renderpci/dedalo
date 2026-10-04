/**
 * The error taxonomy — one class per way this agent is allowed to fail.
 *
 * Shape copied from publication/site_builder/src/errors.ts (ApiError + RFC 9457 classes);
 * the type base, the closed REASON_CODES list and the classes this agent does not need
 * (site_builder's confinement family) are this package's own. Every error renders as an
 * `application/problem+json` document; throwing is the ONLY way to produce an error
 * response. The engine's phase-3 client branches on `type` and `reason`, never on prose.
 */

export const PROBLEM_TYPE_BASE = 'https://dedalo.dev/publication-host/problems/';

/**
 * THE CLOSED SET OF MACHINE REASONS. A `reason` extension outside this list is a type
 * error. Append-only: a code the engine maps must never change meaning.
 */
export const REASON_CODES = Object.freeze([
  'actor_missing',
  'body_invalid',
  'bundle_refused',
  'hash_mismatch',
  'release_id_invalid',
  'no_previous_release',
  'configtest_failed',
  'reload_failed',
  'restart_failed',
  'health_failed',
  'v2_env_missing',
  'busy',
  // rules.apply (Task 5). Status per event: every one is a 422 RefusedError except
  // reload_failed (503 HostActionFailedError). configtest_failed is listed above.
  'server_mismatch',
  'hash_invalid',
  'rules_too_large',
  'rules_nul_byte',
  'stamp_missing',
  'directive_refused',
] as const);

export type ReasonCode = (typeof REASON_CODES)[number];

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

/** The request is malformed: a missing actor, an unreadable body, a path outside a root. */
export class ValidationError extends ApiError {
  constructor(detail: string, reason?: ReasonCode) {
    super(400, `${PROBLEM_TYPE_BASE}validation-error`, 'Validation Error', detail, reason ? { reason } : undefined);
    this.name = 'ValidationError';
  }
}

/** Missing or wrong bearer token. This agent has no anonymous surface but GET /health. */
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
  constructor(
    method: string,
    public allow: string[],
  ) {
    super(
      405,
      `${PROBLEM_TYPE_BASE}method-not-allowed`,
      'Method Not Allowed',
      `Method ${method} is not allowed for this resource. Allowed: ${allow.join(', ')}`,
    );
    this.name = 'MethodNotAllowedError';
  }
}

/** A real resource in a state that cannot accept the request (no previous release, busy). */
export class ConflictError extends ApiError {
  constructor(detail: string, reason: ReasonCode) {
    super(409, `${PROBLEM_TYPE_BASE}conflict`, 'Conflict', detail, { reason });
    this.name = 'ConflictError';
  }
}

/**
 * The request was well-formed and its CONTENT was refused by a shape check (a hostile
 * bundle, a hash that does not match the text). 422: retrying the same bytes cannot help.
 */
export class RefusedError extends ApiError {
  constructor(detail: string, reason: ReasonCode, extensions: Record<string, unknown> = {}) {
    super(422, `${PROBLEM_TYPE_BASE}refused`, 'Refused', detail, { reason, ...extensions });
    this.name = 'RefusedError';
  }
}

/**
 * A HOST EFFECT FAILED: a reload, restart or health check said no. 503: the request was
 * right, the host could not carry it out. The detail is scrubbed in production like every
 * 5xx; `reason` and `extensions` survive the scrub, so extensions carry MACHINE fields only
 * (codes, hashes, booleans), never a child process's output. A configtest that refuses
 * SUBMITTED text is not this class: the bytes are wrong, not the host, so it is a
 * RefusedError(…, 'configtest_failed') 422 (rules.apply, Task 5).
 */
export class HostActionFailedError extends ApiError {
  constructor(detail: string, reason: ReasonCode, extensions: Record<string, unknown> = {}) {
    super(503, `${PROBLEM_TYPE_BASE}host-action-failed`, 'Host Action Failed', detail, { reason, ...extensions });
    this.name = 'HostActionFailedError';
  }
}

/** Our fault. Unrecognised throws become this (util/response.ts). */
export class ServiceError extends ApiError {
  constructor(detail: string) {
    super(500, `${PROBLEM_TYPE_BASE}internal-error`, 'Internal Server Error', detail);
    this.name = 'ServiceError';
  }
}
