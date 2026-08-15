/**
 * DedaloError — the ONE typed failure the engine throws.
 *
 * A code from the registry is the whole identity: category, HTTP status,
 * label, English message, severity, disclosure and retryability are all
 * lookups (`spec(error)`). Instance fields carry only what varies per throw:
 *
 *  - `details`      closed per-code scalars that DO reach the wire (filtered
 *                   by the converter to `spec.details_keys`);
 *  - `coordinates`  LOG-ONLY identifiers (tipo, section_id, job id) — never
 *                   serialized;
 *  - `publicMessage` a vetted sentence that may replace `spec.message` on the
 *                   wire, honoured ONLY when `spec.disclosure === 'public'`;
 *  - `retryAfterMs` for limit/unavailable codes (Retry-After);
 *  - `cause`        the wrapped original — never serialized.
 *
 * Imports ONLY registry.ts (this pair is the leaf every subsystem may reach).
 */

import { ERROR_REGISTRY, type ErrorCode, type ErrorSpec, specOf } from './registry.ts';

export type ErrorDetailScalar = string | number | boolean;

export interface DedaloErrorFields {
	readonly details?: Readonly<Record<string, ErrorDetailScalar>>;
	readonly coordinates?: Readonly<Record<string, string | number>>;
	readonly publicMessage?: string;
	readonly retryAfterMs?: number;
	readonly cause?: unknown;
	/** Overrides the registry message for the LOG/`Error.message` only (never the wire). */
	readonly message?: string;
}

export class DedaloError extends Error {
	readonly code: ErrorCode;
	readonly details?: Readonly<Record<string, ErrorDetailScalar>>;
	readonly coordinates?: Readonly<Record<string, string | number>>;
	readonly publicMessage?: string;
	readonly retryAfterMs?: number;

	constructor(code: ErrorCode, fields: DedaloErrorFields = {}) {
		super(fields.message ?? ERROR_REGISTRY[code].message);
		this.name = 'DedaloError';
		this.code = code;
		// Plain assignment (an absent field is `undefined`, never a branch): the
		// converter reads these by value, and this keeps the constructor at
		// complexity 2 — new src/core files are capped (crap_complexity_ratchet rule 3).
		this.details = fields.details;
		this.coordinates = fields.coordinates;
		this.publicMessage = fields.publicMessage;
		this.retryAfterMs = fields.retryAfterMs;
		this.cause = fields.cause;
	}

	/** The registry row behind this instance. */
	get spec(): ErrorSpec {
		return specOf(this.code);
	}
}

export function isDedaloError(value: unknown): value is DedaloError {
	return value instanceof DedaloError;
}

/** True when `value` is a DedaloError whose code's domain (the part before the dot) is `domain`. */
export function isErrorInDomain(value: unknown, domain: string): value is DedaloError {
	return isDedaloError(value) && value.code.startsWith(`${domain}.`);
}

/** Registry row of a thrown DedaloError. */
export function spec(error: DedaloError): ErrorSpec {
	return specOf(error.code);
}
