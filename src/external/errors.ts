/**
 * EXTERNAL-SERVICE ERROR TAXONOMY.
 *
 * One class (a `DedaloError` subclass, code `external.<kind>` — the registry
 * row per kind is the wire identity), one closed `kind` set. The operator's question is always "no data,
 * or swallowed failure?" (engineering/CONVENTIONS.md §1), and for an outbound
 * subsystem there is a second one: "how far did it get?" — the kind answers
 * both, because the kinds are ordered by how much of transport.ts ran.
 *
 * DISCLOSURE RULE, enforced by construction: an error carries an ORIGIN
 * (scheme + host) and never a full URL. A record request's query string holds
 * the remote id and the field set; a search request's holds what a cataloguer
 * typed. Neither belongs in a log line or in an error surfaced to a client, so
 * the full URL is simply never stored on the error. Credentials and payloads
 * are likewise never logged. ONE line names a PATH: the record-endpoint-suspect
 * line (logExternalRecordEndpointSuspect) names the api_url path, which is
 * configuration — no id, no field, no query — and is the likeliest cause.
 */

import { incrementCounter } from '../core/api/counters.ts';
import { DedaloError } from '../core/errors/dedalo_error.ts';
import { logError } from '../core/errors/log.ts';

/** How far the outbound attempt got before it failed. */
export type ExternalErrorKind =
	/** The master switch or a per-service kill switch is off. No socket. */
	| 'disabled'
	/** The ontology names a service no adapter implements. No socket. */
	| 'not_registered'
	/** api_config / fields_map is malformed or refused (bad scheme, stray secret). */
	| 'bad_config'
	/** The circuit for (service, origin) is open. No socket. */
	| 'circuit_open'
	/** The host is not in DEDALO_EXTERNAL_ALLOWED_HOSTS, or the SSRF guard refused it. No socket. */
	| 'blocked_host'
	/** The request exceeded the timeout. */
	| 'timeout'
	/** DNS/connection/stream failure, or a refused redirect. */
	| 'transport'
	/** The service answered with a non-2xx status. */
	| 'http_status'
	/** The response exceeded the byte ceiling; reading stopped. */
	| 'too_large'
	/** The response was not the shape the contract requires (JSON parse, missing rows). */
	| 'protocol'
	/** The service answered, but the requested record is not in it. */
	| 'not_found';

export interface ExternalErrorFields {
	readonly service: string;
	readonly kind: ExternalErrorKind;
	/** Scheme + host ONLY (`https://zenon.dainst.org`). Never a path or query. */
	readonly origin?: string;
	readonly status?: number;
	readonly sectionTipo?: string;
	readonly remoteId?: string;
	/** The service's own `Retry-After`, in ms, when it sent one (429/503). */
	readonly retryAfterMs?: number;
	/** Free-text detail. MUST NOT contain a URL, a credential or a payload. */
	readonly detail?: string;
	readonly cause?: unknown;
}

/**
 * The one typed failure of the subsystem — a `DedaloError` whose code is
 * `external.<kind>` (the registry is total over ExternalErrorKind; its
 * `retryable` is tripwired equal to the component_external state map). The
 * external fields stay on the instance for the callers that branch on them
 * (`kind`, `service`, `status`, `retryAfterMs`); `Error.message` keeps the
 * log grammar (`formatExternalError`); the registry English is what reaches
 * any wire (the external `notices[]` of dd_external_api name the service).
 */
export class ExternalServiceError extends DedaloError {
	readonly service: string;
	readonly kind: ExternalErrorKind;
	readonly origin?: string;
	readonly status?: number;
	readonly sectionTipo?: string;
	readonly remoteId?: string;
	readonly detail?: string;

	constructor(fields: ExternalErrorFields) {
		super(`external.${fields.kind}`, {
			message: formatExternalError(fields),
			coordinates: externalCoordinates(fields),
			...(fields.retryAfterMs === undefined ? {} : { retryAfterMs: fields.retryAfterMs }),
			...(fields.cause === undefined ? {} : { cause: fields.cause }),
		});
		this.name = 'ExternalServiceError';
		this.service = fields.service;
		this.kind = fields.kind;
		if (fields.origin !== undefined) this.origin = fields.origin;
		if (fields.status !== undefined) this.status = fields.status;
		if (fields.sectionTipo !== undefined) this.sectionTipo = fields.sectionTipo;
		if (fields.remoteId !== undefined) this.remoteId = fields.remoteId;
		if (fields.detail !== undefined) this.detail = fields.detail;
	}
}

/** The LOG-ONLY coordinates (origin/status/section/id — never a URL). */
function externalCoordinates(fields: ExternalErrorFields): Record<string, string | number> {
	const out: Record<string, string | number> = {};
	if (fields.origin !== undefined) out.origin = fields.origin;
	if (fields.status !== undefined) out.status = fields.status;
	if (fields.sectionTipo !== undefined) out.section = fields.sectionTipo;
	if (fields.remoteId !== undefined) out.id = fields.remoteId;
	return out;
}

/**
 * An ontology node names a service nothing implements. A SEPARATE class because
 * this is the one failure the totality tripwire asserts is a THROW and never an
 * empty result: silently returning `[]`/`null` for an unknown api_engine is how
 * a mis-typed ontology edit becomes an empty component nobody investigates.
 * Code: `external.not_registered`.
 */
export class ExternalServiceNotRegisteredError extends ExternalServiceError {
	constructor(fields: Omit<ExternalErrorFields, 'kind'>) {
		super({ ...fields, kind: 'not_registered' });
		this.name = 'ExternalServiceNotRegisteredError';
	}
}

/**
 * A caller asked a service to SEARCH and it cannot — either the adapter declares
 * `capabilities.search: false` (the SERVICE has no search endpoint), or it
 * declares the capability but implements no `buildSearchRequest`/`unwrapSearch`
 * (the ENGINE cannot yet), or the section's `api_config` names no
 * `api_url_search`.
 *
 * A SEPARATE class for the same reason `ExternalServiceNotRegisteredError` is
 * one: the alternative is returning `[]`, which on a search box is
 * indistinguishable from "no matches" — the user retypes, gets nothing again,
 * and concludes the catalogue is empty. `reason` names which of the three it is
 * so the fix is unambiguous. Code: `external.bad_config`.
 */
export class ExternalSearchUnsupportedError extends ExternalServiceError {
	readonly reason: 'service' | 'engine' | 'config';

	constructor(
		fields: Omit<ExternalErrorFields, 'kind'> & { reason: 'service' | 'engine' | 'config' },
	) {
		super({ ...fields, kind: 'bad_config' });
		this.name = 'ExternalSearchUnsupportedError';
		this.reason = fields.reason;
	}
}

/** The LOG GRAMMAR: `[external:<service>] <kind> origin=… section=… id=…`. */
export function formatExternalError(fields: ExternalErrorFields): string {
	const parts = [`[external:${fields.service}]`, fields.kind];
	if (fields.origin !== undefined) parts.push(`origin=${fields.origin}`);
	if (fields.status !== undefined) parts.push(`status=${fields.status}`);
	if (fields.sectionTipo !== undefined) parts.push(`section=${fields.sectionTipo}`);
	if (fields.remoteId !== undefined) parts.push(`id=${fields.remoteId}`);
	if (fields.detail !== undefined) parts.push(fields.detail);
	return parts.join(' ');
}

/**
 * Scheme + host of a URL — the ONLY part of a target that may be logged or
 * stored on an error. Returns `'<unparseable>'` rather than echoing the input,
 * so a malformed ontology value can never smuggle a query string into a log.
 */
export function originOf(url: string | URL): string {
	try {
		const parsed = typeof url === 'string' ? new URL(url) : url;
		return `${parsed.protocol}//${parsed.host}`;
	} catch {
		return '<unparseable>';
	}
}

/**
 * How long one distinct failure line stays "already said". A per-record failure
 * that repeats (the same id re-rendered, an export re-walking a portal) inside
 * the window is COUNTED (`external_log_suppressed`), not re-logged.
 */
const LOG_DEDUP_WINDOW_MS = 10 * 60_000;

/** Hard bound on the dedup map; past it the OLDEST lines are forgotten first. */
const LOG_DEDUP_MAX_ENTRIES = 5_000;

/**
 * Distinct failure CLASSES already logged, by logDedupKey → epoch ms.
 * LIFECYCLE: TIME-CLEARED and SIZE-BOUNDED — every admission prunes entries
 * older than the window (insertion order is log order: an admitted line is
 * re-inserted at the tail), and the map never exceeds LOG_DEDUP_MAX_ENTRIES.
 * Keys are the disclosure-safe log line WITHOUT the remote id (service, kind,
 * origin, status, section, detail) — never session, user, principal or lang.
 * Forgetting an entry early costs one repeated log line, nothing else.
 */
const loggedLines = new Map<string, number>();

/** True when this line was not logged inside the window (and marks it logged). */
function admitLogLine(key: string, now: number): boolean {
	for (const [line, at] of loggedLines) {
		if (now - at < LOG_DEDUP_WINDOW_MS) break;
		loggedLines.delete(line);
	}
	const at = loggedLines.get(key);
	if (at !== undefined && now - at < LOG_DEDUP_WINDOW_MS && now >= at) return false;
	loggedLines.delete(key);
	loggedLines.set(key, now);
	while (loggedLines.size > LOG_DEDUP_MAX_ENTRIES) {
		const oldest = loggedLines.keys().next().value;
		if (oldest === undefined) break;
		loggedLines.delete(oldest);
	}
	return true;
}

/**
 * The dedup identity of a failure: its log line MINUS the remote id.
 *
 * WHY THE ID IS OUT (2026-09-24). Keyed per id, the "no flood" rule held only
 * for the SAME record asked again. An API-wide failure the breaker does not
 * count — every id answered 400 because the service changed its id format, every
 * record past the byte ceiling — is a distinct line per record: a 20 000-record
 * export logged ~20 000 stacks. The operator's question is "which service, which
 * section, what failure"; the first logged line names an example id, the rest
 * are counted (`external_log_suppressed`), and a whole endpoint answering 4xx
 * gets its own line (record_answers.ts).
 */
function logDedupKey(error: ExternalServiceError): string {
	return [
		error.code,
		formatExternalError({
			service: error.service,
			kind: error.kind,
			...(error.origin === undefined ? {} : { origin: error.origin }),
			...(error.status === undefined ? {} : { status: error.status }),
			...(error.sectionTipo === undefined ? {} : { sectionTipo: error.sectionTipo }),
			...(error.detail === undefined ? {} : { detail: error.detail }),
		}),
	].join('|');
}

/** Test seam: forget every dedup line, so a gate starts from "nothing said". */
export function resetExternalLogDedupForTests(): void {
	loggedLines.clear();
}

/**
 * The one reporting door — `logError` (src/core/errors/log.ts) with the
 * subsystem tag `[external:<service>]`; severity comes from the registry
 * (`warn` for a degraded-but-expected outcome — a service down, a record gone;
 * `error` for a contract/configuration failure an operator must fix). The
 * error object rides along so the stack survives; its message is already
 * disclosure-safe by construction.
 *
 * NO FLOOD (2026-09-24), two rules:
 *   - a `circuit_open` REFUSAL is never logged here: breaker.ts counts it
 *     (`refused` in breakerSnapshot, `external_circuit_refusals`) and logged the
 *     opening ONCE (logExternalCircuitOpened).
 *   - any other failure is logged once per distinct CLASS — (service, kind,
 *     origin, status, section, detail), the remote id deliberately excluded
 *     (logDedupKey) — per LOG_DEDUP_WINDOW_MS; the logged line names the first
 *     id as its example, and repeats inside the window bump
 *     `external_log_suppressed` instead. So `error_<code>` counts LOGGED lines,
 *     and the two counters together count occurrences.
 */
export function logExternalError(error: ExternalServiceError, now: number = Date.now()): void {
	if (error.kind === 'circuit_open') return;
	if (!admitLogLine(logDedupKey(error), now)) {
		incrementCounter('external_log_suppressed');
		return;
	}
	logError(error, { subsystem: `external:${error.service}` });
}

/** What breaker.ts knows when a circuit opens. */
export interface CircuitOpenedFields {
	readonly service: string;
	readonly origin: string;
	/** Consecutive service failures that tripped it. */
	readonly failures: number;
	readonly cooldownMs: number;
	/** True when a half-open probe failed (a fresh cooldown), not a first opening. */
	readonly reopened: boolean;
	/** Calls refused during the previous open period (0 on a first opening). */
	readonly refused: number;
	/** The failure that tripped it (its kind/status name the cause; its stack rides along). */
	readonly cause?: ExternalServiceError;
}

/**
 * The OPENING transition — ONE line through the one door (`external.circuit_open`,
 * registry severity `warn`), at most once per cooldown per (service, origin).
 * Deliberately NOT deduped: each line is a distinct state change, and the
 * cooldown already bounds the rate.
 */
export function logExternalCircuitOpened(fields: CircuitOpenedFields): void {
	const trippedBy =
		fields.cause === undefined
			? 'unknown'
			: `${fields.cause.kind}${fields.cause.status === undefined ? '' : ` status=${fields.cause.status}`}`;
	const what = fields.reopened
		? `circuit re-opened: half-open probe failed (${trippedBy}); refused=${fields.refused} in the last period`
		: `circuit opened after ${fields.failures} consecutive service failures (last: ${trippedBy})`;
	logError(
		new ExternalServiceError({
			service: fields.service,
			kind: 'circuit_open',
			origin: fields.origin,
			detail: `${what}; cooldown=${fields.cooldownMs}ms`,
			...(fields.cause === undefined ? {} : { cause: fields.cause }),
		}),
		{ subsystem: `external:${fields.service}` },
	);
}

/** What breaker.ts knows when a circuit closes. */
export interface CircuitClosedFields {
	readonly service: string;
	readonly origin: string;
	readonly openForMs: number;
	readonly refused: number;
}

/**
 * The CLOSING transition — one info line in the same grammar. Not a DedaloError
 * (a recovery is not a failure, so it has no registry code and must not bump
 * `errors_total`); it is the info rung of the ladder logError would print: the
 * line, no stack.
 */
export function logExternalCircuitClosed(fields: CircuitClosedFields): void {
	console.info(
		`[external:${fields.service}] circuit_closed origin=${fields.origin} open_for_ms=${fields.openForMs} refused=${fields.refused}`,
	);
}

/** What record_answers.ts knows when a record endpoint turns suspect. */
export interface RecordEndpointSuspectFields {
	readonly service: string;
	/** Scheme + host + PATH of the record api_url — configuration, never an id or a query. */
	readonly endpoint: string;
	/** Record-path 4xx answers since the endpoint last delivered one. */
	readonly streak: number;
	/** [status, count] pairs, ascending. */
	readonly statuses: readonly (readonly [number, number])[];
}

/**
 * A record endpoint answers 4xx for EVERY id (record_answers.ts) — ONE line
 * through the one door (`external.http_status`), at most once per report window
 * per endpoint (the watch rate-limits it; not deduped here). The endpoint PATH
 * is named because a wrong path is the likeliest cause (see the disclosure rule
 * at the top of this file).
 */
export function logExternalRecordEndpointSuspect(fields: RecordEndpointSuspectFields): void {
	let origin = '<unparseable>';
	let path = '';
	try {
		const url = new URL(fields.endpoint);
		origin = `${url.protocol}//${url.host}`;
		path = url.pathname;
	} catch {
		// keep the placeholders: never echo an unparseable value
	}
	const seen = fields.statuses.map(([status, count]) => `${status}x${count}`).join(',');
	const firstStatus = fields.statuses[0]?.[0];
	logError(
		new ExternalServiceError({
			service: fields.service,
			kind: 'http_status',
			origin,
			...(firstStatus === undefined ? {} : { status: firstStatus }),
			detail: `record endpoint suspect: ${fields.streak} consecutive record answers were 4xx (${seen}) and none delivered a record; check the api_url path (${path}) and the remote id format; further 4xx there read as unavailable, not not_found`,
		}),
		{ subsystem: `external:${fields.service}` },
	);
}
