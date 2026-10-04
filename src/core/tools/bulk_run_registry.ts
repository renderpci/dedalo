/**
 * LIVE BULK RUNS — the in-process registry of the dd800 bulk runs executing
 * right now, and of the reverts in flight (decision D5, 2026-09-27,
 * WC-…-bulk-revert-undo-log).
 *
 * WHY. A bulk run (CSV import, import_execute, propagate, update_cache, a bulk
 * revert) writes its undo log row by row while it runs. Reverting it before it
 * has finished reads a HALF log and races the rows still being written: the
 * revert restores what it saw, then the run writes on top of it. The chain and
 * conflict checks of the revert (`live region == the run's last after-image`)
 * are the backstop; this registry is the refusal that comes first and says why.
 *
 * WHY IN-PROCESS IS AUTHORITATIVE. Every bulk door runs inside this one Bun
 * process (a background job is an in-process task, `tools/background.ts`, and
 * dies with it). A run that is not registered here therefore cannot be writing:
 * after a restart there is no live run at all, whatever the dd800 rows say.
 *
 * THE CONTRACT for a door that mints a bulk id: wrap EVERYTHING the run writes
 * in `withLiveBulkRun(bulkId, …)` right after the mint — the registration is
 * released in its `finally`, so a thrown run cannot leave a phantom entry that
 * refuses every later revert.
 *
 * NOT request state: the entries are bulk ids (process-wide facts about work
 * this process is doing), never a principal or a language. Allowlisted in
 * module_state_tripwire with that lifecycle.
 */

import { ensureTmHistoryReady } from '../db/record_generation.ts';

/** Bulk ids whose run is executing in this process. Cleared in the run's `finally`. */
const liveBulkRuns = new Set<number>();

/** Bulk ids a revert is currently undoing. Cleared in the revert's `finally`. */
const revertsInFlight = new Set<number>();

/**
 * Run `work` as the live bulk run `bulkId`: registered before the first write,
 * released in `finally` whatever `work` does. Nested registration of the same
 * id (a door calling a helper that registers too) keeps the outer entry.
 *
 * THE UNDO LOG'S PRECONDITION, first: every undo-log writer names
 * `matrix_time_machine.tm_role`, and every one of them runs INSIDE a
 * transaction (a save's pair, a create's birth marker, a delete's cascade
 * twin), where the column's self-heal refuses by design. So the heal runs
 * HERE, at run start, outside any transaction (ensureTmHistoryReady): a run
 * started while migration 0010 is unapplied adds the column before its first
 * write — or fails closed, typed, before writing anything — instead of every
 * save of the run failing until some reader happens to heal it.
 */
export async function withLiveBulkRun<T>(bulkId: number, work: () => Promise<T>): Promise<T> {
	if (liveBulkRuns.has(bulkId)) return work();
	await ensureTmHistoryReady();
	liveBulkRuns.add(bulkId);
	try {
		return await work();
	} finally {
		liveBulkRuns.delete(bulkId);
	}
}

/**
 * The LAZY form of {@link withLiveBulkRun}, for a door that mints its dd800
 * only when it first writes (tool_import_rdf: a re-run that changes nothing
 * must leave no bulk record behind). The undo log's precondition runs FIRST,
 * outside any transaction, exactly as above; `work` then receives `enter`,
 * which it calls with the id right after the mint (inside its transaction —
 * the registration is in-process, so it holds before the row commits), and
 * `leave`, for a mint its transaction then rolled back. Every id entered is
 * released in the `finally`, whatever `work` does. An id already live (a
 * nesting door's) is left to its owner.
 */
export async function withLazyLiveBulkRun<T>(
	work: (registration: {
		enter: (bulkId: number) => void;
		leave: (bulkId: number) => void;
	}) => Promise<T>,
): Promise<T> {
	await ensureTmHistoryReady();
	const entered = new Set<number>();
	const enter = (bulkId: number): void => {
		if (liveBulkRuns.has(bulkId)) return;
		liveBulkRuns.add(bulkId);
		entered.add(bulkId);
	};
	const leave = (bulkId: number): void => {
		if (entered.delete(bulkId)) liveBulkRuns.delete(bulkId);
	};
	try {
		return await work({ enter, leave });
	} finally {
		for (const bulkId of entered) liveBulkRuns.delete(bulkId);
	}
}

/** Whether the bulk run `bulkId` is executing in this process right now. */
export function isBulkRunLive(bulkId: number): boolean {
	return liveBulkRuns.has(bulkId);
}

/**
 * Claim the revert of `targetBulkId`. Returns false — claim refused — when
 * another revert of the same run is in flight: two concurrent reverts would
 * both read the log before either wrote, and the second would write its
 * restore over the first. Release with `releaseBulkRevert` in a `finally`.
 */
export function claimBulkRevert(targetBulkId: number): boolean {
	if (revertsInFlight.has(targetBulkId)) return false;
	revertsInFlight.add(targetBulkId);
	return true;
}

/** Release a claim taken by `claimBulkRevert`. */
export function releaseBulkRevert(targetBulkId: number): void {
	revertsInFlight.delete(targetBulkId);
}
