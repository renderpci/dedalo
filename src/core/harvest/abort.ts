/**
 * Leaving a wait when the job is stopped — the one helper every wait of the
 * harvesting door goes through (the per-origin queue and pace in `pacing.ts`,
 * the shared robots.txt load in `robots.ts`).
 *
 * A wait here is on something SHARED: a queue place other jobs stand behind, a
 * robots.txt fetch other jobs await. So a stopped job must leave its OWN wait at
 * once, without cancelling the shared thing — `untilJobStopped` races the caller's
 * await against the job's signal and leaves the awaited promise untouched.
 */

import { DedaloError } from '../errors/index.ts';
import { untilAborted } from '../security/ssrf_guard.ts';

/**
 * The failure a stopped job's wait ends with. The same code and reason the
 * primitive (`fetchPinnedHop`) uses when the job is stopped mid-request, so a
 * caller reads one "the job was stopped" whatever it was waiting on.
 */
export function jobStoppedError(stage: string): DedaloError {
	return new DedaloError('security.outbound_failed', {
		message: `harvest: the job was stopped while waiting (${stage})`,
		coordinates: { reason: 'aborted', stage },
	});
}

/**
 * `work`, or `jobStoppedError(stage)` as soon as `signal` aborts — whichever comes
 * first. The guard's one race primitive (`untilAborted`, core/security/ssrf_guard.ts)
 * with this door's typed reason: the abort listener never outlives the call, and
 * `work` itself is never cancelled (others may be waiting on it too).
 */
export function untilJobStopped<T>(
	work: Promise<T>,
	signal: AbortSignal | undefined,
	stage: string,
): Promise<T> {
	return untilAborted(work, signal, () => jobStoppedError(stage));
}
