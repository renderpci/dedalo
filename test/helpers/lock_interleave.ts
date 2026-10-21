/**
 * LOCK INTERLEAVING for concurrency gates: hold one side's transaction OPEN, start the other
 * side, wait until that side is BLOCKED in Postgres (a heavyweight `Lock` wait in
 * pg_stat_activity — an advisory lock wait included), then commit. Answers whether the
 * contender was blocked, and its result. A contender that is not serialized against the holder
 * runs straight through and answers `blocked: false`.
 *
 * Shared by test/unit/ontology_projection_race_native.test.ts and
 * test/unit/archive_restore_projection_native.test.ts.
 */

import { sql, withTransaction } from '../../src/core/db/postgres.ts';

/** How long a leg waits for the concurrent side to block (it blocks at once when serialized). */
export const BLOCK_WAIT_MS = 10_000;

/** Backends of this database (other than the probe's) waiting on a heavyweight lock. */
async function lockWaiters(): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM pg_stat_activity
		  WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`,
		[],
	)) as { n: number }[];
	return Number(rows[0]?.n ?? 0);
}

/** True once `work` is blocked on a lock in Postgres; false if it settles (ran through) first. */
export async function blockedBehind(work: Promise<unknown>): Promise<boolean> {
	let settled = false;
	work.then(
		() => {
			settled = true;
		},
		() => {
			settled = true;
		},
	);
	const deadline = Date.now() + BLOCK_WAIT_MS;
	while (Date.now() < deadline) {
		if (settled) return false;
		if ((await lockWaiters()) > 0) return true;
		await Bun.sleep(20);
	}
	return false;
}

/**
 * Run `holder` in a transaction kept OPEN until the concurrent side (`contender`, started
 * OUTSIDE that transaction) is blocked or done; then commit. Answers whether the contender
 * was blocked, and its result.
 */
export async function interleave<T>(
	holder: () => Promise<unknown>,
	contender: () => Promise<T>,
): Promise<{ blocked: boolean; result: T }> {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let holding!: () => void;
	const held = new Promise<void>((resolve) => {
		holding = resolve;
	});
	const holderTx = withTransaction(async () => {
		await holder();
		holding();
		await gate;
	});
	// A holder that fails never reaches `holding`: surface its error instead of hanging.
	await Promise.race([held, holderTx]);
	// This continuation runs in the TEST's context (no ambient transaction), so the
	// contender opens its own transaction on another connection.
	const contended = contender();
	const blocked = await blockedBehind(contended);
	release();
	await holderTx;
	return { blocked, result: await contended };
}
