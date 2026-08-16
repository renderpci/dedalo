/**
 * The wire vocabulary shared between the daemon client and the action handlers.
 *
 * The daemon renders errors as RFC 9457 problem+json with a stable `type` URI. This maps
 * those (and transport failures) onto the REGISTERED `site_builder.*` codes
 * (src/core/errors/registry.ts) that the dispatch chokepoint turns into the envelope, so
 * the client branches on a code rather than on prose.
 *
 * TWO KINDS OF SENTENCE, and the difference is the whole point:
 *  - an ENGINE-AUTHORED refusal ("Invalid site name.") is vetted text this repo owns, so
 *    it rides as `publicMessage` and reaches the wire (site_builder.rejected is the one
 *    public-disclosure code of the family — ERRORS_SPEC §2.2);
 *  - a DAEMON-SUPPLIED `detail` is another service's prose. It is LOG-ONLY: it goes in
 *    the throw's `message` (the console line) and never into `publicMessage`, so the
 *    daemon can never write the browser's error text.
 */

import { DedaloError, type ErrorCode } from '../../../src/core/errors/index.ts';

/** The daemon's problem+json shape (only the fields we read). */
export interface DaemonProblem {
	type?: string;
	title?: string;
	status?: number;
	detail?: string;
	reason?: string;
}

/**
 * The daemon's problem `type` URI (last path segment) or `reason` → the registered code.
 * An unknown/absent one falls back to the caller's status-derived default.
 */
const DAEMON_REASON_CODES: Readonly<Record<string, ErrorCode>> = {
	unconfigured: 'site_builder.unconfigured',
	unreachable: 'site_builder.unreachable',
	auth: 'site_builder.auth',
	unauthorized: 'site_builder.auth',
	forbidden: 'site_builder.auth',
	rejected: 'site_builder.rejected',
	invalid: 'site_builder.rejected',
	validation: 'site_builder.rejected',
	conflict: 'site_builder.rejected',
	quota: 'site_builder.rejected',
	failed: 'site_builder.failed',
	internal: 'site_builder.failed',
};

/** The last path segment of a problem `type` URI (`https://…/problems/quota` → `quota`). */
function reasonOf(problem: DaemonProblem): string {
	const raw = problem.reason ?? problem.type ?? '';
	return raw.split('/').pop()?.trim().toLowerCase() ?? '';
}

/** The registered code for a daemon problem, defaulting to `fallback`. */
export function codeForProblem(problem: DaemonProblem, fallback: ErrorCode): ErrorCode {
	return DAEMON_REASON_CODES[reasonOf(problem)] ?? fallback;
}

/** Cap any daemon-supplied prose before it reaches the LOG (never the wire). */
export function capDetail(detail: string | undefined, fallback: string): string {
	if (typeof detail !== 'string' || detail.length === 0) return fallback;
	return detail.length > 300 ? `${detail.slice(0, 297)}…` : detail;
}

/**
 * An ENGINE-AUTHORED refusal of a site-builder request: the sentence is ours, so it is
 * safe to show (site_builder.rejected has public disclosure).
 */
export function siteBuilderRejected(publicMessage: string): DedaloError {
	return new DedaloError('site_builder.rejected', {
		publicMessage,
		message: publicMessage,
		coordinates: { tool: 'tool_sitebuilder' },
	});
}

/**
 * A DAEMON-SIDE failure. `detail` is the daemon's own prose: it stays in `message`
 * (log-only) and is never offered as `publicMessage`.
 */
export function siteBuilderFailure(
	code: ErrorCode,
	detail: string,
	coordinates: Record<string, string | number> = {},
): DedaloError {
	return new DedaloError(code, {
		message: detail,
		coordinates: { tool: 'tool_sitebuilder', ...coordinates },
	});
}
