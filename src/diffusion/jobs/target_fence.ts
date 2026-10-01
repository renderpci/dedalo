/**
 * THE PUBLICATION TARGET FENCE (DIFF-2, WC-2026-09-30-diffusion-target-fence).
 *
 * The lease epoch (PUB-13) fences every write to the JOB ROW; what can be
 * corrupted, though, is the TARGET — a MariaDB database, a files directory.
 * Before this fence a runner checked its lease only when it wrote progress,
 * i.e. AFTER a batch's rows or files had landed: a runner the sweeper revoked
 * while it was merely slow kept publishing into the target the new epoch was
 * publishing into. So every durable effect of a run is ONE UNIT:
 *
 *   withFencedBatch = one Postgres transaction that
 *     1. takes the TARGET's advisory lock (`pg_try_advisory_xact_lock(
 *        DIFFUSION_TARGET_LOCK_CLASS, hashtext(<target key>))`, a try-lock in a
 *        loop that holds NO connection while the target is busy, and tells the
 *        job row once — the busy message);
 *     2. THEN re-reads the lease (`attempt = $epoch AND state = 'running'`)
 *        `FOR KEY SHARE` — a runner revoked while it waited writes nothing, and
 *        the sweeper (`FOR UPDATE SKIP LOCKED`) cannot revoke a runner in the
 *        middle of its batch, while heartbeat / progress / cancel (NO KEY
 *        UPDATE) never conflict with it;
 *     3. runs the target I/O and the batch's tail (dd1758, run ledger,
 *        progress, checkpoint), all committed together.
 *
 * THE LOCK KEY IS A CROSS-DOOR CONTRACT: every door that writes a target names
 * it the same way — `sql:<database>`, `files:<format>/<dir label>` (logical
 * names, never absolute paths) — the runner, the record-delete executor, the
 * ghost unpublish, the lang sweep. The DELETE-ONLY doors (record delete, ghost
 * unpublish) take it SHARED: they never exclude each other, only the
 * exclusive writers (gate: diffusion_target_fence_native D3). The two-int key space (class, hashtext)
 * cannot collide with the engine's single-bigint advisory locks (node locks,
 * 17581758 pending-retry drain, 918273645 RAG queue).
 *
 * THE ONE PLACE A TRANSACTION SPANS TARGET I/O: only a unit of this module may
 * hold a Postgres transaction across target writes. It holds no matrix row
 * lock (an advisory lock + one job row's KEY SHARE + a short tail) and is
 * bounded by FENCE_IDLE_BOUND_MS (`idle_in_transaction_session_timeout`): a
 * FROZEN holder's session is killed by Postgres, its lock released.
 * (Residual R1, ledgered: a thawed zombie whose session was killed can finish
 * at most the one in-flight target batch.)
 *
 * A LIVE HOLDER NEVER LOSES ITS FENCE: the bound is for a frozen process, not a
 * slow target. A unit's target step can legitimately outlast it with no
 * Postgres statement in between — an ALTER adding an indexed column to a large
 * published table, a lang sweep's chunk loop, a MariaDB statement queued behind
 * a metadata lock. So every unit that opens its transaction runs a TIMER-DRIVEN
 * keepalive (`SELECT 1` on the unit's own connection every tenth of the bound)
 * for the whole time its work is in flight: the idle clock never reaches the
 * bound while the event loop runs, and a frozen process sends nothing. No door
 * has to remember to call it (gate: diffusion_target_fence_native "a live unit
 * outlasting the idle bound keeps its lock").
 */

import {
	getPoolStats,
	isInTransaction,
	sql,
	sqlStateOf,
	withTransaction,
} from '../../core/db/postgres.ts';
import { DedaloError } from '../../core/errors/index.ts';
import { TABLE_FORMATS } from '../plan/formats.ts';
import type { PublicationPlan } from '../plan/types.ts';
import { fileTargetDirLabel } from '../writers/files.ts';
import type { JobLease } from './queue.ts';
import { DIFFUSION_JOBS_TABLE } from './schema.ts';

/** The fence's advisory-lock class (int4): the key is (class, hashtext(target key)). */
export const DIFFUSION_TARGET_LOCK_CLASS = 17580002;

/**
 * `idle_in_transaction_session_timeout` of a fence unit: a FROZEN holder's
 * session dies within this bound (+ the sweeper's staleness, jobs/scheduler.ts
 * STALE_AFTER_SECONDS), releasing the target. A live unit never reaches it —
 * its timer keepalive (a tenth of the bound) resets the idle clock however long
 * its target step takes.
 */
export const FENCE_IDLE_BOUND_MS = 300_000;

/** The keepalive period of a unit: a tenth of its idle bound. */
const KEEPALIVE_FRACTION = 10;

/** Lock-wait bound of every statement of a fence unit (a 55P03 on the fence read retries). */
const FENCE_LOCK_TIMEOUT = '5s';

/** Busy-target backoff: starts here, doubles, capped. */
const BACKOFF_START_MS = 250;
const BACKOFF_MAX_MS = 2_000;

/** The lock key of a MariaDB database target. */
export function sqlTargetLockKey(database: string): string {
	return `sql:${database}`;
}

/** The lock key of a files target directory (`<root>/<format>/<label>`). */
export function fileTargetLockKey(format: string, label: string): string {
	return `files:${format}/${label}`;
}

/** The lock key of the target a plan publishes into. */
export function publicationTargetLockKey(plan: PublicationPlan): string {
	if (TABLE_FORMATS.has(plan.format) && plan.target.kind === 'table') {
		return sqlTargetLockKey(plan.target.database);
	}
	return fileTargetLockKey(plan.format, fileTargetDirLabel(plan));
}

/** How long a door waits for a busy target: forever, a bound, or not at all. */
export type TargetLockMode = 'wait' | 'try' | { boundMs: number };

export interface TargetLockOptions {
	mode?: TargetLockMode;
	/**
	 * A DELETE-ONLY door (the record-delete executor, the ghost unpublish): the
	 * lock is taken SHARED. Unpublishers never exclude each other — two deletes
	 * on one database both settle, neither left pending for a retry that may be
	 * hours away — while every one of them still excludes the EXCLUSIVE holders
	 * (a runner's unit, the lang sweep, the media rebuild/reconcile), and those
	 * exclude them. Default false (exclusive).
	 */
	shared?: boolean;
	/** Called ONCE, the first time the target is found busy. */
	onBusy?: () => Promise<void>;
	/** Checked between tries: true gives up (reason 'stopped'). */
	shouldStop?: () => Promise<boolean>;
	/**
	 * The unit's idle-in-transaction bound (ms), default FENCE_IDLE_BOUND_MS.
	 * A TEST SEAM (the gate shortens it to prove the keepalive); no door sets it.
	 */
	idleBoundMs?: number;
}

export type TargetLockOutcome<T> =
	| { acquired: true; value: T }
	| { acquired: false; reason: 'busy' | 'stopped' };

/** The internal "not this time" of one try (rolls the try's transaction back). */
class TargetBusy extends Error {}

/**
 * Run `work` in ONE transaction that holds the target's advisory lock. The
 * lock is taken with a TRY in a loop: while the target is busy no transaction
 * (no connection) is held, `onBusy` runs once, `shouldStop` is asked, and the
 * next try backs off (250 ms doubling to 2 s). A bounded or 'try' mode gives
 * up with `{acquired: false, reason: 'busy'}`. Re-entrant within one session:
 * a nested call on the ambient transaction re-takes a lock it already holds.
 */
export async function withTargetLock<T>(
	key: string,
	work: () => Promise<T>,
	options: TargetLockOptions = {},
): Promise<TargetLockOutcome<T>> {
	const mode = options.mode ?? 'wait';
	const idleBoundMs = options.idleBoundMs ?? FENCE_IDLE_BOUND_MS;
	if (!Number.isInteger(idleBoundMs) || idleBoundMs < KEEPALIVE_FRACTION) {
		throw new DedaloError('internal.invariant', {
			message: `target fence: idle bound ${idleBoundMs} ms is not a usable bound`,
		});
	}
	const startedAt = Date.now();
	let delay = BACKOFF_START_MS;
	let told = false;
	// Nested on an ambient transaction (a door inside another fenced unit):
	// the lock is re-entrant, and the ambient transaction's own settings are
	// never rewritten.
	const opensTransaction = !isInTransaction();
	for (;;) {
		try {
			const value = await withTransaction(async () => {
				if (opensTransaction) {
					await sql.unsafe(`SET LOCAL idle_in_transaction_session_timeout = ${idleBoundMs}`);
					await sql.unsafe(`SET LOCAL lock_timeout = '${FENCE_LOCK_TIMEOUT}'`);
				}
				const rows = (await sql.unsafe(
					options.shared === true
						? 'SELECT pg_try_advisory_xact_lock_shared($1::int, hashtext($2)) AS got'
						: 'SELECT pg_try_advisory_xact_lock($1::int, hashtext($2)) AS got',
					[DIFFUSION_TARGET_LOCK_CLASS, key],
				)) as { got: boolean | string }[];
				const got = rows[0]?.got;
				if (got !== true && got !== 't' && got !== 'true') throw new TargetBusy(key);
				// Nested on an ambient transaction the owner keeps its own connection
				// alive (and set no idle bound on it): no second timer.
				if (!opensTransaction) return work();
				const keepalive = startUnitKeepalive(Math.floor(idleBoundMs / KEEPALIVE_FRACTION));
				try {
					return await work();
				} finally {
					await keepalive.stop();
				}
			});
			return { acquired: true, value };
		} catch (error) {
			if (!(error instanceof TargetBusy)) throw error;
		}
		if (mode === 'try') return { acquired: false, reason: 'busy' };
		if (!told && options.onBusy !== undefined) {
			told = true;
			await options.onBusy();
		}
		if (options.shouldStop !== undefined && (await options.shouldStop())) {
			return { acquired: false, reason: 'stopped' };
		}
		let wait = delay;
		if (typeof mode === 'object') {
			const remaining = mode.boundMs - (Date.now() - startedAt);
			if (remaining <= 0) return { acquired: false, reason: 'busy' };
			wait = Math.min(wait, remaining);
		}
		await Bun.sleep(wait);
		delay = Math.min(delay * 2, BACKOFF_MAX_MS);
	}
}

/**
 * Hold the lease for the rest of the unit: the job row, still on this epoch
 * and running, `FOR KEY SHARE`. Zero rows = the lease was revoked (typed). A
 * 55P03 (the row momentarily locked past FENCE_LOCK_TIMEOUT) retries the
 * whole unit — nothing has been written yet.
 */
async function holdLease(lease: JobLease): Promise<void> {
	let rows: unknown[];
	try {
		rows = (await sql.unsafe(
			`SELECT job_id FROM "${DIFFUSION_JOBS_TABLE}"
			 WHERE job_id = $1 AND attempt = $2::int AND state = 'running'
			 FOR KEY SHARE`,
			[lease.job_id, lease.attempt],
		)) as unknown[];
	} catch (error) {
		if (sqlStateOf(error) === '55P03') throw new TargetBusy('lease row');
		throw error;
	}
	if (rows.length === 0) {
		throw new DedaloError('diffusion.lease_revoked', {
			coordinates: { job: lease.job_id, attempt: lease.attempt, operation: 'fence' },
		});
	}
}

/**
 * ONE fenced unit of a run: the target lock, THEN the lease held `FOR KEY
 * SHARE`, then `work` (target I/O + the tail), committed together. Waits for a
 * busy target (telling the job row once through `onBusy`); `shouldStop`
 * (the cancel flag) gives up with `{acquired: false, reason: 'stopped'}`. A
 * revoked lease is the typed `diffusion.lease_revoked` — nothing was written.
 */
export function withFencedBatch<T>(
	lease: JobLease,
	key: string,
	work: () => Promise<T>,
	options: Omit<TargetLockOptions, 'mode'> = {},
): Promise<TargetLockOutcome<T>> {
	return withTargetLock(
		key,
		async () => {
			await holdLease(lease);
			return work();
		},
		{ ...options, mode: 'wait' },
	);
}

/**
 * The unit's keepalive: a timer that sends `SELECT 1` on the unit's own
 * transaction connection (the ambient-transaction store rides the timer's async
 * context) every `periodMs`, one at a time, while `work` is in flight — the
 * statement resets `idle_in_transaction_session_timeout`. Its failure is
 * swallowed: it only fails once the work's own statement failed the
 * transaction, and that error is the unit's. `stop()` clears the timer and
 * awaits the one in flight, so nothing is ever sent after the unit settles.
 */
function startUnitKeepalive(periodMs: number): { stop: () => Promise<void> } {
	let inFlight: Promise<void> | null = null;
	const timer = setInterval(() => {
		if (inFlight !== null) return;
		inFlight = sql
			.unsafe('SELECT 1')
			.then(
				() => undefined,
				() => undefined,
			)
			.finally(() => {
				inFlight = null;
			});
	}, periodMs);
	return {
		async stop() {
			clearInterval(timer);
			if (inFlight !== null) await inFlight;
		},
	};
}

/**
 * A runner needs two connections: the fence unit's transaction, and the
 * heartbeat that proves it alive meanwhile. A pool of one would deadlock the
 * heartbeat behind the batch — refused loudly at run start.
 */
export function assertRunnerPool(): void {
	const { max } = getPoolStats();
	if (max < 2) {
		throw new DedaloError('internal.invariant', {
			message: `diffusion runner: the database pool holds ${max} connection(s); a runner needs at least 2 (the fenced batch + its heartbeat) — raise DB_POOL_MAX`,
		});
	}
}

/**
 * Hold SEVERAL targets at once (a store that spans them — the `.publication/pub`
 * union is derived from every database's `dbs/` subtree): the locks are taken
 * in SORTED key order, nested in one transaction, waiting for each. Every
 * multi-target holder takes the same order and a runner holds one target, so
 * no two holders can wait on each other in a cycle.
 */
export async function withTargetLocks<T>(
	keys: readonly string[],
	work: () => Promise<T>,
): Promise<T> {
	const ordered = [...new Set(keys)].sort();
	const nest = async (index: number): Promise<T> => {
		const key = ordered[index];
		if (key === undefined) return work();
		const held = await withTargetLock(key, () => nest(index + 1), { mode: 'wait' });
		if (!held.acquired) {
			throw new DedaloError('internal.invariant', {
				message: `target fence: a waiting lock on '${key}' gave up`,
			});
		}
		return held.value;
	};
	return nest(0);
}
