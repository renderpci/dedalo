/**
 * EXTERNAL-SERVICE ERROR TAXONOMY.
 *
 * One class, one closed `kind` set. The operator's question is always "no data,
 * or swallowed failure?" (engineering/CONVENTIONS.md §1), and for an outbound
 * subsystem there is a second one: "how far did it get?" — the kind answers
 * both, because the kinds are ordered by how much of transport.ts ran.
 *
 * DISCLOSURE RULE, enforced by construction: an error carries an ORIGIN
 * (scheme + host) and never a full URL. A record request's query string holds
 * the remote id and the field set; a search request's holds what a cataloguer
 * typed. Neither belongs in a log line or in an error surfaced to a client, so
 * the full URL is simply never stored on the error. Credentials and payloads
 * are likewise never logged.
 */

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

export class ExternalServiceError extends Error {
	readonly service: string;
	readonly kind: ExternalErrorKind;
	readonly origin?: string;
	readonly status?: number;
	readonly sectionTipo?: string;
	readonly remoteId?: string;
	readonly retryAfterMs?: number;
	readonly detail?: string;

	constructor(fields: ExternalErrorFields) {
		super(formatExternalError(fields));
		this.name = 'ExternalServiceError';
		this.service = fields.service;
		this.kind = fields.kind;
		if (fields.origin !== undefined) this.origin = fields.origin;
		if (fields.status !== undefined) this.status = fields.status;
		if (fields.sectionTipo !== undefined) this.sectionTipo = fields.sectionTipo;
		if (fields.remoteId !== undefined) this.remoteId = fields.remoteId;
		if (fields.retryAfterMs !== undefined) this.retryAfterMs = fields.retryAfterMs;
		if (fields.detail !== undefined) this.detail = fields.detail;
		if (fields.cause !== undefined) this.cause = fields.cause;
	}
}

/**
 * An ontology node names a service nothing implements. A SEPARATE class because
 * this is the one failure the totality tripwire asserts is a THROW and never an
 * empty result: silently returning `[]`/`null` for an unknown api_engine is how
 * a mis-typed ontology edit becomes an empty component nobody investigates.
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
 * so the fix is unambiguous.
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
 * The one reporting door. `warn` for a degraded-but-expected outcome (a service
 * is down, a record is gone), `error` for a contract/configuration failure that
 * an operator must fix. The error object is passed through so the stack
 * survives; its message is already disclosure-safe by construction.
 */
export function logExternalError(error: ExternalServiceError): void {
	const expected =
		error.kind === 'not_found' ||
		error.kind === 'circuit_open' ||
		error.kind === 'disabled' ||
		error.kind === 'timeout';
	if (expected) console.warn(error.message);
	else console.error(error.message, error);
}
