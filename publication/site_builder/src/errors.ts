/**
 * The error taxonomy — one class per way this daemon is allowed to fail.
 *
 * Same contract as publication/server_api/v2/src/errors.ts: every error is rendered as
 * an RFC 9457 `application/problem+json` document, each class fixes the HTTP `status`,
 * a stable `type` URI and a human `title`, and throwing is the ONLY way to produce an
 * error response — handlers never construct one. The engine's tool_sitebuilder proxy
 * branches on the machine `reason` extension ONLY (its wire.ts maps every entry of
 * `DAEMON_REASONS` below onto a registered code); the `type` URI and the prose `detail` are
 * for logs and for direct callers. Treat both the URIs and the reasons as published API.
 */

export const PROBLEM_TYPE_BASE = 'https://dedalo.dev/site-builder/problems/';

/**
 * THE DAEMON'S REASON VOCABULARY — every machine `reason` a refusal of this daemon can carry.
 *
 * The prose `detail` is this daemon's own sentence and is LOG-ONLY on the engine side: the
 * engine (tools/tool_sitebuilder/server/wire.ts `DAEMON_REASON_CODES`) maps each reason here
 * onto a registered `site_builder.*` code whose LABEL is what a museum reads. These lists are
 * the runtime half of that contract: the engine's map is typed `Record<DaemonReason, …>` (an
 * unmapped reason is a tsc error) and gated equal to `DAEMON_REASONS` (an unmapped reason is
 * a red test), so a reason added here can never fall through to "the site builder rejected
 * the request". `ConflictError` / `LimitExceededError` REQUIRE one — a refusal without a
 * reason is a refusal nobody can branch on.
 */

/** Something else holds the site right now (workspace_activity.ts reservations). Clears by itself. */
export const BUSY_REASONS = Object.freeze([
  'session_running',
  'build_running',
  'site_initializing',
  'site_recovering',
  'git_running',
  'site_deleting',
] as const);

/** A 409: the request names a real resource in a state that cannot accept it. */
export const CONFLICT_REASONS = Object.freeze([
  ...BUSY_REASONS,
  'slug_exists',
  'workspace_exists',
  'domain_taken',
  'webspace_unavailable',
  'no_build',
  'not_running',
] as const);

/** A 429: a configured limit refused the work (MAX_SITES, SITE_DISK_QUOTA_MB, MAX_CONCURRENT_SESSIONS). */
export const LIMIT_REASONS = Object.freeze(['max_sites', 'disk_quota', 'max_concurrent_sessions'] as const);

export type BusyReasonCode = (typeof BUSY_REASONS)[number];
export type ConflictReason = (typeof CONFLICT_REASONS)[number];
export type LimitReason = (typeof LIMIT_REASONS)[number];

/**
 * THE ONE BASE OF EVERY REFUSAL. Its only machine extension is `reason`, TYPED to the daemon's
 * vocabulary (`DaemonReason`, below): a free-form extension cannot be written, so nothing but a
 * listed reason can ever reach either wire (the control door's problem+json, `util/response.ts`;
 * the stream door's error event, `drivers/turn_errors.ts`). `extensions` is the problem+json
 * view of it, kept for the readers that branch on the serialized shape.
 */
export class ApiError extends Error {
  readonly reason: DaemonReason | undefined;

  constructor(
    public status: number,
    public type: string,
    public title: string,
    detail?: string,
    reason?: DaemonReason,
  ) {
    super(detail ?? title);
    this.name = 'ApiError';
    this.reason = reason;
  }

  get detail(): string {
    return this.message;
  }

  /** The problem+json extension members: `{reason}` when the refusal has one. */
  get extensions(): { readonly reason: DaemonReason } | undefined {
    return this.reason === undefined ? undefined : { reason: this.reason };
  }
}

/** The client's request was malformed: a bad slug, a missing actor, an unknown option. */
export class ValidationError extends ApiError {
  constructor(detail: string, reason?: DaemonReason) {
    super(400, `${PROBLEM_TYPE_BASE}validation-error`, 'Validation Error', detail, reason);
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
  declare readonly reason: ConflictReason;
  constructor(detail: string, reason: ConflictReason) {
    super(409, `${PROBLEM_TYPE_BASE}conflict`, 'Conflict', detail, reason);
    this.name = 'ConflictError';
  }
}

// A limit gate refused the work: session concurrency cap, MAX_SITES, disk quota.
export class LimitExceededError extends ApiError {
  declare readonly reason: LimitReason;
  constructor(detail: string, reason: LimitReason) {
    super(429, `${PROBLEM_TYPE_BASE}limit-exceeded`, 'Limit Exceeded', detail, reason);
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
      'confinement_unavailable',
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
 *   - `agent_cli_unsupported` — the installed agent CLI does not list a flag the turn's argv
 *     needs to keep agent-written configuration (hooks, MCP servers, settings) out of the turn
 *     (PLANT). An operator must upgrade the CLI; nothing was started.
 *   - `agent_cli_unproved` — the CLI's probe could not ASK just now (a question that did not
 *     answer within its bound, a spawn the host refused for want of resources): nothing it did
 *     ask proved the binary unfit, the answer is not kept, and the next attempt asks again.
 *     Retryable; nothing was started.
 *
 * `CONFINEMENT_CODES` is the runtime list the engine's mapping (tools/tool_sitebuilder/server/
 * wire.ts) is gated against: a code added here without a mapping there is red.
 */
export const CONFINEMENT_CODES = Object.freeze([
  'site_busy',
  'identity_missing',
  'identity_quarantined',
  'unit_refused',
  'unit_nonconformant',
  /** The daemon is shutting down: a connect would start a unit, and that start would cancel the daemon's stop. */
  'daemon_stopping',
  /** The installed agent CLI cannot be told to ignore agent-written configuration. */
  'agent_cli_unsupported',
  /** The agent CLI could not be asked just now (a timeout, a resource-refused spawn): asked again next time. */
  'agent_cli_unproved',
] as const);

export type ConfinementCode = (typeof CONFINEMENT_CODES)[number];

/** Every machine `reason` this daemon sends, in one list — the engine's map is gated equal to it. */
export const DAEMON_REASONS = Object.freeze([
  ...CONFLICT_REASONS,
  ...LIMIT_REASONS,
  'confinement_unavailable',
  ...CONFINEMENT_CODES.map((code) => `confinement.${code}` as const),
] as const);

export type DaemonReason =
  | ConflictReason
  | LimitReason
  | 'confinement_unavailable'
  | `confinement.${ConfinementCode}`;

/** Is `value` one of `DAEMON_REASONS`? The runtime half of the type: a cast cannot pass it. */
export function isDaemonReason(value: unknown): value is DaemonReason {
  return typeof value === 'string' && (DAEMON_REASONS as readonly string[]).includes(value);
}

/**
 * THE MACHINE REASON OF ANY THROWN VALUE — a listed `DaemonReason`, or null. The one reader both
 * doors use (`util/response.ts` for the control door, `drivers/turn_errors.ts` for the stream):
 * a value that is not an `ApiError`, or whose reason a cast smuggled past the type, has none.
 */
export function reasonOf(error: unknown): DaemonReason | null {
  return error instanceof ApiError && isDaemonReason(error.reason) ? error.reason : null;
}

export class ConfinementRefusedError extends ApiError {
  constructor(
    public readonly code: ConfinementCode,
    detail: string,
  ) {
    super(503, `${PROBLEM_TYPE_BASE}confinement-${code.replace(/_/g, '-')}`, 'Agent Run Refused', detail, `confinement.${code}`);
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
