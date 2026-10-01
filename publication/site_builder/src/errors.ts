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

/**
 * THE HOST CANNOT CONFINE AN AGENT TURN, so no agent turn is started.
 *
 * 503 and not 500: nothing is wrong with the request and nothing is wrong with the daemon's
 * own code — the host is missing the runner, the agent identity or the authorization that
 * makes a confined turn possible, and the honest answer is "not right now, and here is
 * what is missing". It is a class of its own because the alternative is the failure this
 * whole boundary exists to prevent: a daemon that quietly runs the agent unconfined,
 * as itself, when the confinement it advertises is unavailable.
 */
export class ConfinementUnavailableError extends ApiError {
  constructor(detail: string) {
    super(
      503,
      `${PROBLEM_TYPE_BASE}confinement-unavailable`,
      'Agent Confinement Unavailable',
      detail,
      { reason: 'confinement_unavailable' },
    );
    this.name = 'ConfinementUnavailableError';
  }
}

/**
 * A CONFINED RUN WAS REFUSED FOR A NAMED, SITE-LEVEL REASON (LEAD-1b) — 503, like
 * `ConfinementUnavailableError`, and for the same reason: nothing is wrong with the request,
 * and the one wrong answer is running the agent anyway. Each code is its own `reason`
 * (`confinement.<code>`) so the engine can tell "try again in a moment" from "an operator must
 * act":
 *
 *   - `site_busy` — a second run on a site while one is live (a daemon bug: every run holds the
 *     site's reservation). Nothing was opened.
 *   - `identity_missing` — the site has no agent identity (AGENT_IDENTITIES): run
 *     `provision apply`. There is no fallback uid.
 *   - `identity_quarantined` — a run of this site's identity is still alive according to PID 1
 *     and would not stop; nothing more is started on it until PID 1 reports it dead.
 *   - `unit_refused` — the site's unit never said hello (it failed to start, or PID 1 dropped
 *     the connection); the refusal carries PID 1's own diagnosis.
 *   - `unit_nonconformant` — what PID 1 LOADED for the unit is not what this daemon expects,
 *     named by property (a unit file silently ignores keys its systemd does not know).
 *   - `daemon_stopping` — the daemon is shutting down; nothing is opened, because a connect
 *     would start a unit whose start cancels the daemon's own stop. Retry after the restart.
 */
export type ConfinementCode =
  | 'site_busy'
  | 'identity_missing'
  | 'identity_quarantined'
  | 'unit_refused'
  | 'unit_nonconformant'
  /** The daemon is shutting down: a connect would start a unit, and that start would cancel the daemon's stop. */
  | 'daemon_stopping';

export class ConfinementRefusedError extends ApiError {
  constructor(
    public readonly code: ConfinementCode,
    detail: string,
  ) {
    super(503, `${PROBLEM_TYPE_BASE}confinement-${code.replace(/_/g, '-')}`, 'Agent Run Refused', detail, {
      reason: `confinement.${code}`,
    });
    this.name = 'ConfinementRefusedError';
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
