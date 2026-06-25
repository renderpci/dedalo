import { z } from 'zod';

/**
 * ResponseEnvelopeSchema / ResponseEnvelope
 * Standard envelope returned by the Dédalo JSON API.
 *
 * Ground truth: the `$response` object assembled in
 * core/api/v1/common/class.dd_manager.php and the real captured responses in
 * parity-harness/fixtures/golden/*.json.
 *
 * Fixed shape:
 * - `result`  — present on every response. `true`/payload on success,
 *               `false` on failure. The manager assigns booleans, objects and
 *               arbitrary payloads here, so it is intentionally `z.any()` with
 *               only a required-key constraint enforced below.
 *
 * Open-ended fields the manager may attach:
 * - `msg`               — human-readable message (do not parse).
 * - `errors`            — machine-readable error codes (e.g. `invalid_api_class`).
 * - `action`            — echoes the requested action on the error path.
 * - `csrf_token`        — rotated token, attached on the success path.
 * - `dedalo_last_error` — server-side last-error string (debug aid).
 *
 * The envelope is `.passthrough()` because individual API methods attach
 * action-specific top-level fields (e.g. `data`, `context`, `total`,
 * `page_globals`) that vary per action — the PHP side never closes this shape.
 * We require `result` and constrain the few fixed keys where the PHP types are
 * stable (`msg` string, `errors` array of strings).
 */
export const ResponseEnvelopeSchema = z
	.object({
		result: z.any(),
		msg: z.string().optional(),
		errors: z.array(z.string()).optional(),
		action: z.string().optional(),
		csrf_token: z.string().optional(),
		dedalo_last_error: z.string().optional(),
		// common-but-optional payload carriers (kept permissive)
		data: z.any().optional(),
		context: z.any().optional(),
		total: z.number().optional(),
		debug: z.any().optional(),
	})
	.passthrough()
	// `result` must be a present key (the manager always sets it), even when
	// its value is `false`/`null`. `.optional()` is omitted above precisely so
	// a missing `result` fails validation.
	.refine((r) => 'result' in r, { message: 'response envelope must include a "result" key' });

export type ResponseEnvelope = z.infer<typeof ResponseEnvelopeSchema>;

/**
 * isErrorResponse
 * Canonical success/failure check: the PHP API signals failure with
 * `result === false`. `msg`/`errors` are advisory only.
 */
export function isErrorResponse(r: ResponseEnvelope): boolean {
	return r.result === false;
}
