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
 *
 * THE THIRD CASE, and the reason `REFUSAL_SENTENCE` exists: a refusal the daemon can
 * explain and the user cannot see is only half a failure. The daemon's placement refusals
 * (no webspace provisioned for this site; that domain belongs to another site) are exactly
 * the ones somebody has to act on. So the daemon sends a stable machine `reason` and the
 * ENGINE writes the sentence for it — the disclosure boundary is unchanged, and the person
 * in front of the screen is told what happened.
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
	// The daemon's placement refusals (src/sites/site_table.ts → a 409 carrying `reason`).
	// Mapped explicitly rather than left to the status-derived default, because the sentence
	// a museum reads for them is authored below and must not depend on a fallback.
	webspace_unavailable: 'site_builder.rejected',
	domain_taken: 'site_builder.rejected',
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
 * WHAT A MUSEUM READS WHEN THE DAEMON REFUSES — written HERE, chosen by the daemon's
 * machine `reason`.
 *
 * The rule above stands: a daemon-supplied `detail` is another service's prose and never
 * becomes the browser's error text. But "the daemon said no" with no explanation is a
 * refusal nobody can act on, and the daemon's placement refusals are precisely the ones an
 * operator must be able to act on — they mean a step of the provisioning has not been done.
 *
 * So the daemon sends a stable CODE and the engine writes the sentence. That keeps the
 * disclosure boundary exactly where it was (nothing the daemon writes reaches the browser)
 * while the person in front of the screen learns what happened. The full daemon text
 * continues to the server log, where an operator with access to the host can read it in
 * full.
 *
 * Only reasons that map to `site_builder.rejected` may appear here: it is the one code of
 * the family with public disclosure (ERRORS_SPEC §2.2).
 */
const REFUSAL_SENTENCE: Readonly<Record<string, string>> = {
	webspace_unavailable:
		'The site builder has no webspace prepared for this site. A site is declared in the ' +
		"server's site-builder instance file and provisioned there (its directory, its two " +
		'web-server entries and its certificate) before it can be created or published here. ' +
		'Nothing was changed — ask whoever administers the server to provision it.',
	domain_taken:
		'Another site already answers on that domain. One hostname belongs to one site: the two ' +
		'would share the same published files, and publishing this one would replace the other ' +
		"site's live pages. Nothing was created.",
};

/** The engine-authored sentence for a daemon problem, or undefined if we author none. */
export function refusalSentence(problem: DaemonProblem): string | undefined {
	return REFUSAL_SENTENCE[reasonOf(problem)];
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
	publicMessage?: string,
): DedaloError {
	return new DedaloError(code, {
		message: detail,
		// Present ONLY when the engine authored it (see REFUSAL_SENTENCE) and only on the
		// one publicly-disclosing code of the family — never the daemon's own `detail`.
		...(publicMessage && code === 'site_builder.rejected' ? { publicMessage } : {}),
		coordinates: { tool: 'tool_sitebuilder', ...coordinates },
	});
}
