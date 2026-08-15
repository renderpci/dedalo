/**
 * Envelope v2 — the zod shape of every JSON API body (engineering/ERRORS_SPEC.md §3).
 *
 *   ok:true  → { ok, request_id, data, notices?, csrf_token? }
 *   ok:false → { ok, request_id, error:{code, category, message, label_key, retryable, details?, debug?}, csrf_token? }
 *
 * `error.code` is `z.enum(ERROR_CODES)`: registry totality reaches every
 * consumer of this schema (the parity harness through rqo.ts's re-export).
 *
 * Both shapes are `.passthrough()`: handler EXTENSION KEYS (ERRORS_SPEC §3.0 —
 * `environment`, `in_use`, `total`, `pid`, `job_id`, `saml_redirect`,
 * `dedalo_notification`, `action`, `msg`, `errors`, …) ride at top level
 * beside the envelope keys and survive a parse. Reserved keys are exactly the
 * ones named here. ONE name is FORBIDDEN as an extension key: `result` — the
 * PHP-era mirror of `data` (and `result:false` of a failure), emitted by the
 * bounded compat block until its removal on 2026-08-16
 * (WC-2026-08-16-error-envelope-compat-removal). A body carrying it fails the
 * parse, so a converter regression back to the old prose can never pass a
 * gate. `msg` / `errors` are NOT forbidden: they are handler-owned extension
 * keys on SUCCESS (maintenance widgets, install probes, tool_hierarchy /
 * tool_ontology_parser failure detail) — never converter-made (ERRORS_SPEC §3.0).
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

/**
 * Top-level names NO body may carry — the retired compat mirror. `result` was
 * `data`'s mirror on success and `false` on failure (ERRORS_SPEC §3.1, removed
 * 2026-08-16); a body carrying it is a converter regression, refused here.
 */
export const ENVELOPE_FORBIDDEN_KEYS: readonly string[] = ['result'];

/** The refine both shapes share: refuse the forbidden top-level names. */
function refuseForbiddenKeys(body: Record<string, unknown>, ctx: z.RefinementCtx): void {
	for (const key of ENVELOPE_FORBIDDEN_KEYS) {
		if (Object.hasOwn(body, key)) {
			ctx.addIssue({
				code: 'custom',
				path: [key],
				message: `\`${key}\` is a retired compat key (WC-2026-08-16-error-envelope-compat-removal): not an envelope key, not an extension key`,
			});
		}
	}
}

export const okEnvelopeSchema = z
	.object({
		ok: z.literal(true),
		request_id: z.string(),
		data: z.unknown(),
		notices: z.array(noticeSchema).optional(),
		csrf_token: z.string().optional(),
	})
	.passthrough()
	.superRefine(refuseForbiddenKeys);
export type OkEnvelope = z.infer<typeof okEnvelopeSchema>;

export const errEnvelopeSchema = z
	.object({
		ok: z.literal(false),
		request_id: z.string(),
		error: errorBodySchema,
		csrf_token: z.string().optional(),
	})
	.passthrough()
	.superRefine(refuseForbiddenKeys);

/**
 * The keys no extension may override on either shape (the converter spreads
 * `extend` first). `msg` / `errors` are NOT here: they are handler extension
 * keys, written by a handler on purpose and never by the converter.
 */
export const ENVELOPE_RESERVED_KEYS: readonly string[] = ['ok', 'request_id', 'data', 'notices', 'error'];
export type ErrEnvelope = z.infer<typeof errEnvelopeSchema>;

export const apiEnvelopeSchema = z.discriminatedUnion('ok', [okEnvelopeSchema, errEnvelopeSchema]);
export type ApiEnvelope = z.infer<typeof apiEnvelopeSchema>;
