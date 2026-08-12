/**
 * OPPORTUNISTIC dd1758 unpublish retry (DIFFUSION_SPEC §3 "Delete propagation
 * + retry": retried on boot / OPPORTUNISTICALLY / manually).
 *
 * A record deleted while its publication target was unreachable leaves a
 * dd1758 row with action `unpublish_pending` (3): the work-system delete
 * always succeeds, the removal from the public site is owed. PHP redeemed that
 * debt on every publish run — `dd_diffusion_api::diffuse` :171-183 calls
 * `diffusion_delete::retry_pending()` before resolving anything, guarded by a
 * catch-all, on the first chunk only:
 *
 *   "if the engine/targets are up for publishing, they are up for deleting.
 *    Fire-and-forget — never fails the publish run."
 *
 * The TS port kept only the MANUAL door (the `retry_pending_deletions` action
 * behind the diffusion_server_control widget), so a deleted interview whose
 * delete propagation failed stayed live on the public site until an
 * administrator happened to press a button — indefinitely, in practice
 * (audit 2026-08_oh1_beta §5.3). This restores the automatic half.
 *
 * SERIALIZATION (why this file owns a lock). The manual door was implicitly
 * single-operator: one administrator, one button. The automatic door is not —
 * the scheduler runs DEDALO_DIFFUSION_MAX_RUNNERS runners concurrently (2 by
 * default, jobs/scheduler.ts), and `retryPendingDiffusion` SELECTs up to 100
 * pending rows with no claim and no lock, then deletes + UPDATEs them. Two
 * publish jobs starting together would drain the SAME rows in parallel:
 * duplicate delete propagation to the target and duplicate jsonb_set UPDATEs.
 * The whole retry therefore runs under a Postgres SESSION advisory lock; a
 * runner that does not win it simply does not retry this pass (the queue is
 * drained by the one that did, and the next publish run retries again).
 *
 * THE RETURN CONTRACT, precisely (the previous version documented "report
 * lines the run report prints" while the runner only console.error'd them —
 * the job row, which the same change calls the operator's only view of a
 * partial publication, saw nothing):
 *
 *   - `log`    — informational lines for the run log. A fully drained queue is
 *                NOT an error: it is the system working.
 *   - `errors` — lines that belong in the job row's `errors[]`, i.e. a debt
 *                still owed after the attempt, or an attempt that could not
 *                run at all. Those flip the run to "Partial success", which is
 *                exactly what they are: records still live on the public site
 *                that the archive has deleted.
 *
 * It NEVER throws: a retry that cannot run is a line, not a failed publication.
 *
 * Gate: test/unit/diffusion_compile_degrade_native.test.ts (behaviour + the
 * tripwire that the runner actually calls this AND routes both buckets).
 */

import { sql } from '../../core/db/postgres.ts';

/** What `retryPendingDiffusion` reports back (kept structural, not imported). */
export interface PendingRetryOutcome {
	total: number;
	retried: number;
	remaining: number;
}

/** The retry implementation; injectable so the policy can be gated purely. */
export type PendingRetryFn = () => Promise<PendingRetryOutcome>;

/**
 * Cross-runner mutual exclusion. Returns the outcome, or null when another
 * runner is already draining the queue (nothing to report: the work is being
 * done). Injectable so the gate can pin both branches without a database.
 */
export type PendingRetrySingleFlight = (
	work: PendingRetryFn,
) => Promise<PendingRetryOutcome | null>;

/** What the runner does with the outcome (see the header's return contract). */
export interface PendingRetryReport {
	/** Informational lines for the run log. */
	log: string[];
	/** Lines that must reach the job row's errors[] (debt still owed). */
	errors: string[];
}

/**
 * Advisory-lock key for the dd1758 drain. Postgres advisory locks share ONE
 * global keyspace, so every key in this engine is picked to be distinct and
 * greppable: `LOCK_KEY` in src/ai/rag/queue.ts (918273645) is the only other
 * session-level one; matrix node locks are xact-scoped hashtext values.
 */
const PENDING_RETRY_LOCK_KEY = 17581758;

/**
 * Default: the native dd1758 retry (src/core/diffusion_bridge/diffusion_delete.ts,
 * the SAME implementation the manual admin action drives — one retry engine,
 * two doors). Lazily imported so a runner that never publishes does not pull
 * the delete subsystem in.
 */
async function defaultPendingRetry(): Promise<PendingRetryOutcome> {
	const { retryPendingDiffusion } = await import('../../core/diffusion_bridge/diffusion_delete.ts');
	return retryPendingDiffusion();
}

/**
 * Default single-flight: `pg_try_advisory_lock` on a RESERVED connection.
 *
 * Reserved, because a session-level advisory lock belongs to the connection
 * that took it — issued through the pool, the unlock could land on a different
 * connection and leak the lock for the life of the process. Session-level
 * rather than xact-level, because the retry propagates deletes to EXTERNAL
 * targets (MariaDB / files): holding a Postgres transaction open across them
 * is exactly what the write-path rules forbid.
 *
 * Not winning the lock is not an error and not a skip worth reporting: another
 * runner is draining the very same rows right now.
 */
async function defaultSingleFlight(work: PendingRetryFn): Promise<PendingRetryOutcome | null> {
	const reserved = await sql.reserve();
	try {
		const rows = (await reserved.unsafe('SELECT pg_try_advisory_lock($1) AS got', [
			PENDING_RETRY_LOCK_KEY,
		])) as { got: boolean | string }[];
		const got = rows[0]?.got;
		if (got !== true && got !== 't' && got !== 'true') return null;
		try {
			return await work();
		} finally {
			await reserved.unsafe('SELECT pg_advisory_unlock($1)', [PENDING_RETRY_LOCK_KEY]);
		}
	} finally {
		reserved.release();
	}
}

/**
 * Drain what can be drained of the pending-unpublish queue, and describe it.
 *
 * Everything is empty when the queue was empty or another runner holds the
 * drain lock (nothing to say). A drained queue produces a log line. Rows still
 * owed after the attempt — or an attempt that threw — produce an ERROR line,
 * because a record the archive deleted is still live on the public site.
 */
export async function retryPendingUnpublishOpportunistically(
	retry: PendingRetryFn = defaultPendingRetry,
	singleFlight: PendingRetrySingleFlight = defaultSingleFlight,
): Promise<PendingRetryReport> {
	try {
		const outcome = await singleFlight(retry);
		// null = another runner owns the drain this pass; 0 rows = nothing owed.
		if (outcome === null || outcome.total === 0) return { log: [], errors: [] };
		const summary =
			`pending unpublish queue: ${outcome.total} row(s) owed, retried ${outcome.retried}, ` +
			`${outcome.remaining} still pending`;
		return outcome.remaining > 0 ? { log: [], errors: [summary] } : { log: [summary], errors: [] };
	} catch (error) {
		// PHP catches Throwable here for exactly this reason: an unreachable
		// target must never fail a publication run. It must not be INVISIBLE
		// either — an un-attempted retry is a debt, so it goes to errors[].
		return {
			log: [],
			errors: [
				`pending unpublish retry failed: ${error instanceof Error ? error.message : String(error)}`,
			],
		};
	}
}
