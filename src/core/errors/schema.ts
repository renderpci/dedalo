/**
 * Envelope v2 — the zod shape of every JSON API body (engineering/ERRORS_SPEC.md §3).
 *
 *   ok:true  → { ok, request_id, data, notices?, csrf_token? }
 *   ok:false → { ok, request_id, error:{code, category, message, label_key, retryable, details?, debug?}, csrf_token? }
 *
 * `error.code` is `z.enum(ERROR_CODES)`: registry totality reaches every
 * consumer of this schema (the parity harness once rqo.ts re-exports it — P1).
 * The compat passthrough (`result`, `msg`, `errors`) is TOLERATED here so a
 * converter-made body with ERROR_ENVELOPE_COMPAT parses; it is removed with
 * the compat block (client_error_contract_tripwire census = 0).
 *
 * Both shapes are `.passthrough()`: handler EXTENSION KEYS (ERRORS_SPEC §3 —
 * `environment`, `in_use`, `total`, `pid`, `job_id`, `saml_redirect`,
 * `dedalo_notification`, `action`, …) ride at top level beside the envelope
 * keys and survive a parse. Reserved keys are exactly the ones named here.
 */

import { z } from 'zod';
import { ERROR_CODES } from './registry.ts';

const detailScalar = z.union([z.string(), z.number(), z.boolean()]);

export const noticeSchema = z.object({
	code: z.enum(ERROR_CODES),
	label_key: z.string(),
	retryable: z.boolean(),
	details: z.record(z.string(), detailScalar).optional(),
});
export type ApiNotice = z.infer<typeof noticeSchema>;

export const errorBodySchema = z.object({
	code: z.enum(ERROR_CODES),
	category: z.enum([
		'caller',
		'auth',
		'permission',
		'not_found',
		'conflict',
		'limit',
		'unavailable',
		'internal',
	]),
	message: z.string(),
	label_key: z.string(),
	retryable: z.boolean(),
	details: z.record(z.string(), detailScalar).optional(),
	/** Present ONLY under DEDALO_DEBUG_API_ERRORS=true. */
	debug: z
		.object({
			exception: z.string(),
			stack: z.string().optional(),
			coordinates: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
			cause_chain: z.array(z.string()),
		})
		.optional(),
});
export type ApiErrorBody = z.infer<typeof errorBodySchema>;

/** Compat window fields (mirrored by convert.ts ERROR_ENVELOPE_COMPAT only). */
const compatFields = {
	result: z.unknown().optional(),
	msg: z.string().optional(),
	errors: z.array(z.string()).optional(),
};

export const okEnvelopeSchema = z
	.object({
		ok: z.literal(true),
		request_id: z.string(),
		data: z.unknown(),
		notices: z.array(noticeSchema).optional(),
		csrf_token: z.string().optional(),
		...compatFields,
	})
	.passthrough();
export type OkEnvelope = z.infer<typeof okEnvelopeSchema>;

export const errEnvelopeSchema = z
	.object({
		ok: z.literal(false),
		request_id: z.string(),
		error: errorBodySchema,
		csrf_token: z.string().optional(),
		...compatFields,
	})
	.passthrough();

/** The keys no extension may override on either shape (the converter spreads `extend` first). */
export const ENVELOPE_RESERVED_KEYS: readonly string[] = [
	'ok',
	'request_id',
	'data',
	'notices',
	'error',
	'result',
	'msg',
	'errors',
];
export type ErrEnvelope = z.infer<typeof errEnvelopeSchema>;

export const apiEnvelopeSchema = z.discriminatedUnion('ok', [okEnvelopeSchema, errEnvelopeSchema]);
export type ApiEnvelope = z.infer<typeof apiEnvelopeSchema>;
