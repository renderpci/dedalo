/**
 * The wire vocabulary shared between the daemon client and the action handlers.
 *
 * The daemon renders errors as RFC 9457 problem+json with a stable `type` URI; this maps
 * those (and transport failures) onto a small set of stable codes the engine returns in
 * `errors[]`, so the client can branch on a code rather than parse prose. The daemon's
 * own detail message is passed through capped for the one case where it is safe and
 * useful (a validation-style rejection the user should see).
 */

/** Stable error codes the tool surfaces to the client. */
export type SiteBuilderErrorCode =
	| 'site_builder_unconfigured' // no URL/token on this install
	| 'site_builder_unreachable' // network failure / timeout reaching the daemon
	| 'site_builder_auth' // daemon rejected our token (operator misconfig)
	| 'site_builder_rejected' // daemon 4xx with a user-facing reason (passed through)
	| 'site_builder_failed'; // daemon 5xx or anything else

/** A failure raised by the daemon client; carries the code and a safe message. */
export class SiteBuilderError extends Error {
	constructor(
		public code: SiteBuilderErrorCode,
		message: string,
	) {
		super(message);
		this.name = 'SiteBuilderError';
	}
}

/** The daemon's problem+json shape (only the fields we read). */
export interface DaemonProblem {
	type?: string;
	title?: string;
	status?: number;
	detail?: string;
	reason?: string;
}

/** Cap any daemon-supplied prose before it reaches a user-facing message. */
export function capDetail(detail: string | undefined, fallback: string): string {
	if (typeof detail !== 'string' || detail.length === 0) return fallback;
	return detail.length > 300 ? `${detail.slice(0, 297)}…` : detail;
}
