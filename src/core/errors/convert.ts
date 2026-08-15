/**
 * THE CONVERTER — the one place a thrown value becomes a wire body.
 *
 *   toDedaloError(unknown)          any throw → DedaloError (poison latch here)
 *   toErrorEnvelope(error, ctx)     → { status, body } (HTTP + tool surfaces)
 *   ok(data, ctx)                   → the ok:true envelope
 *   toStructuredErr(error)          → MCP structured error
 *   toStreamFrame(error)            → SSE terminal frame
 *
 * Disclosure ladder (engineering/ERRORS_SPEC.md §2): `error.message` is the
 * registry English, or `publicMessage` only when the code's disclosure is
 * 'public'; `details` carries only the code's `details_keys`, scalars only;
 * `coordinates` and `cause` are never serialized; `debug` exists ONLY when
 * DEDALO_DEBUG_API_ERRORS=true, and the literal `debug` lives in this file
 * alone. `internal.*` never echoes the wrapped exception outside `debug`.
 *
 * ERROR_ENVELOPE_COMPAT is the bounded compat block (`result`/`msg`/`errors`)
 * — applied here and nowhere else; deleted when
 * client_error_contract_tripwire's client-read census reaches zero.
 *
 * Every function here stays at cyclomatic ≤ 7 (crap_complexity_ratchet rule 3).
 */

import { readEnv } from '../../config/env.ts';
import { isModulePoisonError, markProcessPoisoned } from '../api/process_health.ts';
import { DedaloError, type ErrorDetailScalar, isDedaloError } from './dedalo_error.ts';
import type { ApiErrorBody, ApiNotice, ErrEnvelope, OkEnvelope } from './schema.ts';

export type ErrorSurface = 'http' | 'tool' | 'mcp' | 'stream';

export interface ErrorEnvelopeContext {
	readonly requestId: string;
	readonly surface?: ErrorSurface;
}

export interface OkEnvelopeContext {
	readonly requestId: string;
	readonly notices?: readonly ApiNotice[];
}

/** Longest `cause` chain the converter follows (defensive; real chains are 1-3 deep). */
const MAX_CAUSE_DEPTH = 8;

function messageOf(value: unknown): string {
	return value instanceof Error ? value.message : String(value);
}

/** The first TDZ-shaped ReferenceError in `error` or its `cause` chain, else undefined. */
function findModulePoison(error: unknown): unknown {
	let cursor: unknown = error;
	for (let depth = 0; depth < MAX_CAUSE_DEPTH && cursor !== undefined && cursor !== null; depth++) {
		if (isModulePoisonError(cursor)) return cursor;
		cursor = (cursor as { cause?: unknown }).cause;
	}
	return undefined;
}

/**
 * Any thrown value → DedaloError. A DedaloError passes through unchanged; a
 * TDZ ReferenceError (raw or anywhere in the cause chain) flips the process
 * poison latch and — unless already typed — becomes `internal.module_poisoned`;
 * anything else is `internal.unexpected` carrying the original as `cause`.
 */
export function toDedaloError(error: unknown): DedaloError {
	const poison = findModulePoison(error);
	if (poison !== undefined) {
		markProcessPoisoned(`TDZ ReferenceError: ${messageOf(poison)}`);
		return isDedaloError(error)
			? error
			: new DedaloError('internal.module_poisoned', { cause: error, message: messageOf(error) });
	}
	if (isDedaloError(error)) return error;
	return new DedaloError('internal.unexpected', { cause: error, message: messageOf(error) });
}

function isDetailScalar(value: unknown): value is ErrorDetailScalar {
	return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** `details` filtered to the code's closed key set, scalars only. */
function wireDetails(error: DedaloError): Record<string, ErrorDetailScalar> | undefined {
	const keys = error.spec.details_keys;
	const details = error.details;
	if (keys === undefined || details === undefined) return undefined;
	const out: Record<string, ErrorDetailScalar> = {};
	for (const key of keys) {
		const value = details[key];
		if (isDetailScalar(value)) out[key] = value;
	}
	return Object.keys(out).length === 0 ? undefined : out;
}

/** Registry English, or the vetted publicMessage when the code's disclosure allows it. */
function wireMessage(error: DedaloError): string {
	const spec = error.spec;
	return spec.disclosure === 'public' && error.publicMessage !== undefined
		? error.publicMessage
		: spec.message;
}

function causeChain(error: DedaloError): string[] {
	const chain: string[] = [];
	let cursor: unknown = error.cause;
	for (let depth = 0; depth < MAX_CAUSE_DEPTH && cursor !== undefined && cursor !== null; depth++) {
		chain.push(messageOf(cursor));
		cursor = (cursor as { cause?: unknown }).cause;
	}
	return chain;
}

/** The debug block — present ONLY under DEDALO_DEBUG_API_ERRORS=true. */
function debugBlock(error: DedaloError): ApiErrorBody['debug'] {
	if (readEnv('DEDALO_DEBUG_API_ERRORS') !== 'true') return undefined;
	return {
		exception: error.message,
		...(error.stack === undefined ? {} : { stack: error.stack }),
		...(error.coordinates === undefined ? {} : { coordinates: error.coordinates }),
		cause_chain: causeChain(error),
	};
}

/** The `error` object of the v2 envelope (shared by envelope, tool and stream surfaces). */
export function toErrorBody(error: DedaloError): ApiErrorBody {
	const spec = error.spec;
	const details = wireDetails(error);
	const debug = debugBlock(error);
	return {
		code: error.code,
		category: spec.category,
		message: wireMessage(error),
		label_key: spec.label_key,
		retryable: spec.retryable,
		...(details === undefined ? {} : { details }),
		...(debug === undefined ? {} : { debug }),
	};
}

/**
 * THE COMPAT BLOCK — the only place `result`/`msg`/`errors` are ever written.
 * Removal condition: client_error_contract_tripwire compat-read census = 0.
 */
export const ERROR_ENVELOPE_COMPAT = {
	failure(body: ApiErrorBody): { result: false; msg: string; errors: [string] } {
		return { result: false, msg: body.message, errors: [body.code] };
	},
	success<T>(data: T): { result: T } {
		return { result: data };
	},
} as const;

export interface ErrorEnvelopeResult {
	readonly status: number;
	readonly body: ErrEnvelope;
	/** Set for limit/unavailable codes when the throw carried one — the chokepoint emits Retry-After. */
	readonly retryAfterMs?: number;
}

/** Any throw → `{status, body}` for the HTTP/tool surfaces. */
export function toErrorEnvelope(error: unknown, ctx: ErrorEnvelopeContext): ErrorEnvelopeResult {
	const typed = toDedaloError(error);
	const body = toErrorBody(typed);
	const envelope: ErrEnvelope = {
		ok: false,
		request_id: ctx.requestId,
		error: body,
		...ERROR_ENVELOPE_COMPAT.failure(body),
	};
	return typed.retryAfterMs === undefined
		? { status: typed.spec.status, body: envelope }
		: { status: typed.spec.status, body: envelope, retryAfterMs: typed.retryAfterMs };
}

/** The ok:true envelope (`result` mirrors `data` during the compat window). */
export function ok<T>(data: T, ctx: OkEnvelopeContext): OkEnvelope {
	return {
		ok: true,
		request_id: ctx.requestId,
		data,
		...(ctx.notices === undefined ? {} : { notices: [...ctx.notices] }),
		...ERROR_ENVELOPE_COMPAT.success(data),
	};
}

export interface StructuredErrV2 {
	ok: false;
	error: {
		code: ApiErrorBody['code'];
		message: string;
		hint?: string;
		details?: Record<string, ErrorDetailScalar>;
	};
}

/** MCP structured error — carries the registry hint for the model. */
export function toStructuredErr(error: unknown): StructuredErrV2 {
	const typed = toDedaloError(error);
	const body = toErrorBody(typed);
	const hint = typed.spec.hint;
	return {
		ok: false,
		error: {
			code: body.code,
			message: body.message,
			...(hint === undefined ? {} : { hint }),
			...(body.details === undefined ? {} : { details: body.details }),
		},
	};
}

export interface StreamErrorFrame {
	is_running: false;
	error: ApiErrorBody;
}

/** Terminal SSE/stream frame — a frame, not an envelope. */
export function toStreamFrame(error: unknown): StreamErrorFrame {
	return { is_running: false, error: toErrorBody(toDedaloError(error)) };
}
