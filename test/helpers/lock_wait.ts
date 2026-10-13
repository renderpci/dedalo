/**
 * TWO-CONNECTION INTERLEAVE INSTRUMENTS — Postgres is the clock, never a sleep.
 *
 * A lost update or a cycle race exists only BETWEEN connections, so a gate that
 * proves one must FORCE the interleave and then prove it happened:
 *
 *   - `holdRows` opens a transaction on its own pooled connection, takes a
 *     `FOR UPDATE` row lock on the named matrix rows and keeps it until
 *     `release()` — the "someone else is in the middle of a write" stand-in.
 *     The lock is taken with RAW SQL on purpose: the holder is the gate's own
 *     instrument and must not depend on the engine code under test.
 *   - `waitUntilBlockedBy` / `waitForLockWaiters` poll `pg_stat_activity` until
 *     the expected number of backends are provably WAITING (identity, not
 *     timing — the `pg_blocking_pids` idiom of delete_inverse_lost_update_native).
 *   - `boundedRun` settles a promise or reports that it did not settle in time,
 *     so a walk that never terminates is a RED assertion, not a hung suite.
 *
 * Every wait answers a boolean the caller MUST assert true: a run in which the
 * interleave did not happen proves nothing and must not look green.
 */

import { sql, withTransaction } from '../../src/core/db/postgres.ts';

/** One matrix row to lock: table + section coordinates. */
export interface HeldRow {
	table: string;
	sectionTipo: string;
	sectionId: number;
}

/** A live row-lock holder. */
export interface RowHolder {
	/** The holder's backend pid (what `pg_blocking_pids` names). */
	pid: number;
	/** Commit the holder's (read-only) transaction, releasing every lock. */
	release: () => Promise<void>;
}

const TABLE_NAME = /^[a-z_][a-z0-9_]*$/;

/**
 * Lock `rows` FOR UPDATE on a dedicated transaction and hold them until
 * `release()`. Resolves once the locks are TAKEN (not merely requested).
 */
export async function holdRows(rows: readonly HeldRow[]): Promise<RowHolder> {
	let releaseGate: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		releaseGate = resolve;
	});
	let lockedSignal: (pid: number) => void = () => {};
	let failedSignal: (error: unknown) => void = () => {};
	const locked = new Promise<number>((resolve, reject) => {
		lockedSignal = resolve;
		failedSignal = reject;
	});

	const transaction = withTransaction(async () => {
		const pidRows = (await sql.unsafe('SELECT pg_backend_pid() AS pid')) as { pid: number }[];
		for (const row of rows) {
			if (!TABLE_NAME.test(row.table)) throw new Error(`holdRows: bad table '${row.table}'`);
			const hit = (await sql.unsafe(
				`SELECT section_id FROM "${row.table}" WHERE section_tipo = $1 AND section_id = $2 FOR UPDATE`,
				[row.sectionTipo, row.sectionId],
			)) as unknown[];
			if (hit.length !== 1) {
				throw new Error(`holdRows: ${row.table}/${row.sectionTipo}/${row.sectionId} is not a row`);
			}
		}
		lockedSignal(Number(pidRows[0]?.pid ?? 0));
		await gate;
	}).then(
		() => null,
		(error: unknown) => {
			failedSignal(error);
			return error;
		},
	);

	const pid = await locked;
	return {
		pid,
		release: async () => {
			releaseGate();
			const failure = await transaction;
			if (failure !== null) throw failure;
		},
	};
}

/** The pid of the backend serving the CURRENT (ambient transaction) connection. */
export async function currentBackendPid(): Promise<number> {
	const rows = (await sql.unsafe('SELECT pg_backend_pid() AS pid')) as { pid: number }[];
	return Number(rows[0]?.pid ?? 0);
}

async function pollUntil(probe: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await probe()) return true;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	return false;
}

/**
 * True once at least `n` backends wait on a lock HELD BY `pid`. Only the FIRST
 * of several row-lock waiters is blocked by the holder itself — the next ones
 * queue on the tuple lock the first one took — so for `n > 1` waiters on one
 * row use `waitForLockWaiters`.
 */
export function waitUntilBlockedBy(pid: number, n: number, timeoutMs: number): Promise<boolean> {
	return pollUntil(async () => {
		const rows = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM pg_stat_activity
			 WHERE wait_event_type = 'Lock' AND $1::int = ANY(pg_blocking_pids(pid))`,
			[String(pid)],
		)) as { n: number }[];
		return (rows[0]?.n ?? 0) >= n;
	}, timeoutMs);
}

/**
 * True once at least `n` backends of THIS database are waiting on a heavyweight
 * lock (row, transaction or advisory), not counting `excludePids`.
 */
export function waitForLockWaiters(
	n: number,
	excludePids: readonly number[],
	timeoutMs: number,
): Promise<boolean> {
	const excluded = `{${excludePids.map((pid) => Math.trunc(pid)).join(',')}}`;
	return pollUntil(async () => {
		const rows = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM pg_stat_activity
			 WHERE datname = current_database() AND wait_event_type = 'Lock'
			   AND NOT (pid = ANY($1::int[]))`,
			[excluded],
		)) as { n: number }[];
		return (rows[0]?.n ?? 0) >= n;
	}, timeoutMs);
}

/** The outcome of a promise, captured instead of thrown. */
export type Settled<T> =
	| { status: 'fulfilled'; value: T }
	| { status: 'rejected'; reason: unknown };

/** Capture a promise's outcome (never rejects). */
export function settle<T>(run: Promise<T>): Promise<Settled<T>> {
	return run.then(
		(value) => ({ status: 'fulfilled', value }) as const,
		(reason: unknown) => ({ status: 'rejected', reason }) as const,
	);
}

/**
 * Settle `run` within `timeoutMs`, or answer `{ status: 'timeout' }` — a
 * non-terminating walk is then an assertion failure instead of a hung suite.
 */
export async function boundedRun<T>(
	run: Promise<T>,
	timeoutMs: number,
): Promise<Settled<T> | { status: 'timeout' }> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<{ status: 'timeout' }>((resolve) => {
		timer = setTimeout(() => resolve({ status: 'timeout' }), timeoutMs);
	});
	try {
		return await Promise.race([settle(run), timeout]);
	} finally {
		clearTimeout(timer);
	}
}
