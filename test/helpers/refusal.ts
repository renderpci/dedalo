/**
 * The refusal assertion helper for the P1 error-taxonomy sweep.
 *
 * A handler REFUSES BY THROWING a registered `DedaloError`
 * (engineering/ERRORS_SPEC.md §4) — the dispatch chokepoint is the one place
 * that turns it into a wire body. So a refusal test asserts the thrown error's
 * CODE (and, for a public-disclosure code, its `publicMessage`), never a
 * `{result:false, msg, errors}` body the handler no longer builds.
 *
 * A call that SUCCEEDS where a refusal was expected fails loudly here rather
 * than silently passing an `expect` that never ran (the vacuity trap).
 */

import { type DedaloError, isDedaloError } from '../../src/core/errors/index.ts';

export async function refusalOf(run: Promise<unknown>): Promise<DedaloError> {
	try {
		await run;
	} catch (error) {
		if (isDedaloError(error)) return error;
		throw error;
	}
	throw new Error('expected a DedaloError refusal, but the call succeeded');
}

/**
 * The SYNCHRONOUS twin of {@link refusalOf} — same contract, same vacuity
 * guard, for the refusals a plain function throws (the search/ontology
 * grammar guards of the P3 read-path burn-down).
 */
export function refusalOfSync(run: () => unknown): DedaloError {
	try {
		run();
	} catch (error) {
		if (isDedaloError(error)) return error;
		throw error;
	}
	throw new Error('expected a DedaloError refusal, but the call succeeded');
}
