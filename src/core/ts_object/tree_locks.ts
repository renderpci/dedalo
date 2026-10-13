/**
 * THE TREE TRANSACTION — the one transaction shape every dd_ts_api mutation
 * (add_child, update_parent_data, save_order) runs in.
 *
 * The tree's lock law (relations/parent.ts, MUTATION HALF) makes a race that
 * would close a cycle wait on row locks; when two such transactions wait on
 * EACH OTHER, Postgres aborts one as a deadlock victim (SQLSTATE 40P01). The
 * victim's work rolled back whole, so it is safe to run again from the start —
 * and the re-run walks the winner's COMMITTED link, so it answers the honest
 * refusal (`tree.cycle`) instead of a transport failure. That retry is this
 * module's only job.
 *
 *  - ONLY 40P01 is retried. The engine runs READ COMMITTED, so a serialization
 *    failure (40001) cannot arise here; an untested branch for it would be a
 *    rule nothing verifies (tripwire or delete).
 *  - Under an AMBIENT transaction nothing is retried: the work joined someone
 *    else's transaction, which is already aborted — its OWNER decides.
 *  - When the delays run out the 40P01 propagates (the tree door turns it into
 *    `tree.node_write_failed`, the deadlock kept as the logged cause).
 *
 * No SQL, no module state. Gate: test/unit/tree_cycle_race_native.test.ts (C5).
 */

import { isInTransaction, sqlStateOf, withTransaction } from '../db/postgres.ts';

/** SQLSTATE of a deadlock victim. */
const DEADLOCK_DETECTED = '40P01';

/** The default backoff before each retry (ms, jitter added). */
const DEFAULT_DELAYS_MS: readonly number[] = [20, 60, 150];

/** Options of `withTreeTransaction`. */
export interface TreeTransactionOptions {
	/** The backoff before each retry; its length is the number of retries. */
	delaysMs?: readonly number[];
}

/** True when `error` is a deadlock victim that has a retry left. */
function isRetryable(error: unknown, delay: number | undefined): delay is number {
	return delay !== undefined && sqlStateOf(error) === DEADLOCK_DETECTED;
}

/**
 * Run `work` in its own transaction, re-running it from the start while it
 * fails as a deadlock victim (see the module header). Under an ambient
 * transaction it joins that one and never retries.
 */
export async function withTreeTransaction<T>(
	work: () => Promise<T>,
	options: TreeTransactionOptions = {},
): Promise<T> {
	if (isInTransaction()) return withTransaction(work);
	const delays = options.delaysMs ?? DEFAULT_DELAYS_MS;
	for (let attempt = 0; ; attempt++) {
		try {
			return await withTransaction(work);
		} catch (error) {
			const delay = delays[attempt];
			if (!isRetryable(error, delay)) throw error;
			await Bun.sleep(delay + Math.floor(Math.random() * delay));
		}
	}
}
