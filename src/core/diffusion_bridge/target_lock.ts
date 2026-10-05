/**
 * THE PUBLICATION TARGET LOCK (DIFF-2, WC-2026-09-30-diffusion-target-fence):
 * the one exclusion every door that writes a publication target takes — a
 * MariaDB database or a files directory.
 *
 * It lives in the BRIDGE because it is a contract between core and the
 * diffusion subsystem, like the published-files grammar beside it
 * (published_files.ts): the publication runner's units
 * (src/diffusion/jobs/target_fence.ts `withFencedBatch`, which adds the job's
 * lease to it), the MariaDB delete executor, the ghost unpublish, the lang
 * sweep, the media-index apply — and core's own files-unlink door
 * (diffusion_delete.ts `unlinkPublishedFiles`), which until this module had no
 * way to take it (core never imports src/diffusion statically).
 *
 * THE LOCK: `pg_try_advisory_xact_lock(DIFFUSION_TARGET_LOCK_CLASS,
 * hashtext(<key>))` held by ONE Postgres transaction for the target I/O, the
 * key naming the target the same way at every door — `sql:<database>`,
 * `files:<format>/<dir label>`, `media:<publication host>` (logical names, never
 * absolute paths). Taken with a TRY in a loop that holds no connection while
 * the target is busy (250 ms doubling to 2 s). The DELETE-ONLY doors (record
 * delete, ghost unpublish — sql AND files) take it SHARED: unpublishers never
 * exclude each other, only the exclusive writers. The two-int key space (class, hashtext)
 * cannot collide with the engine's single-bigint advisory locks (node locks,
 * 17581758 pending-retry drain, 918273645 RAG queue).
 *
 * THE ONE PLACE A TRANSACTION SPANS TARGET I/O: a unit of this module holds no
 * matrix row lock (an advisory lock and a short tail) and is bounded by
 * FENCE_IDLE_BOUND_MS (`idle_in_transaction_session_timeout`): a FROZEN
 * holder's session is killed by Postgres, its lock released. A LIVE holder
 * never loses it: every unit that opens its transaction runs a TIMER-DRIVEN
 * keepalive (`SELECT 1` on its own connection every tenth of the bound) while
 * its work is in flight — an ALTER on a big published table, a lang sweep's
 * chunk loop, a MariaDB statement queued behind a metadata lock all outlast
 * the bound legitimately, and no door has to remember to call it.
 *
 * THE DELETE DOORS' PATIENCE: a door on the record-delete REQUEST path never
 * waits for an exclusive holder (the row it leaves pending is the retry
 * queue's — residual R3); a retry DRAIN runs inside withPatientDeleteWait and
 * waits, ONE budget for the whole drain. withDeleteDoorLock applies both rules,
 * for the sql executor and the files unlink alike.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { isInTransaction, sql, withTransaction } from '../db/postgres.ts';
import { DedaloError } from '../errors/index.ts';
import { HOST_NAME } from '../publication_host/registry.ts';

/** The fence's advisory-lock class (int4): the key is (class, hashtext(target key)). */
export const DIFFUSION_TARGET_LOCK_CLASS = 17580002;

/**
 * `idle_in_transaction_session_timeout` of a unit: a FROZEN holder's session
 * dies within this bound, releasing the target. A live unit never reaches it —
 * its timer keepalive (a tenth of the bound) resets the idle clock.
 */
export const FENCE_IDLE_BOUND_MS = 300_000;

/** The keepalive period of a unit: a tenth of its idle bound. */
const KEEPALIVE_FRACTION = 10;

/** Lock-wait bound of every statement of a unit (a 55P03 inside it is the caller's to retry). */
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

/**
 * The lock key of a publication host's media COPY (copy mode, PUBLICATION_HOST_SPEC
 * §5.2): every put / mark / delete unit for that host holds it, so two processes
 * (the server's worker, a CLI reconcile) never interleave on one host — an unpublish
 * waits for an in-flight put of the same host, then withdraws it. The host NAME is the
 * registry key (never an address), validated with the registry's own grammar.
 */
export function mediaCopyTargetLockKey(host: string): string {
	if (!HOST_NAME.test(host)) {
		throw new DedaloError('internal.invariant', {
			message: 'media copy lock: not a publication host name',
		});
	}
	return `media:${host}`;
}

/** How long a door waits for a busy target: forever, a bound, or not at all. */
export type TargetLockMode = 'wait' | 'try' | { boundMs: number };

export interface TargetLockOptions {
	mode?: TargetLockMode;
	/**
	 * A DELETE-ONLY door (the record-delete executor, the files unlink, the
	 * ghost unpublish): the lock is taken SHARED. Unpublishers never exclude
	 * each other — two deletes on one target both settle, neither left pending
	 * for a retry that may be hours away — while every one of them still
	 * excludes the EXCLUSIVE holders (a runner's unit, the lang sweep, the media
	 * rebuild/reconcile), and those exclude them. Default false (exclusive).
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
	/** `busyKey`: the target the last try found held (the one that kept the door out). */
	| { acquired: false; reason: 'busy' | 'stopped'; busyKey: string };

/**
 * The "not this time" of one try: thrown inside the try's transaction, it
 * rolls it back and the loop backs off. Exported for the runner's lease read
 * (jobs/target_fence.ts), whose lock-timeout retries the whole unit the same way.
 */
export class TargetBusy extends Error {
	constructor(readonly key: string) {
		super(key);
	}
}

/** The idle bound, refused when no keepalive period fits in it. */
function usableIdleBound(idleBoundMs: number): number {
	if (!Number.isInteger(idleBoundMs) || idleBoundMs < KEEPALIVE_FRACTION) {
		throw new DedaloError('internal.invariant', {
			message: `target fence: idle bound ${idleBoundMs} ms is not a usable bound`,
		});
	}
	return idleBoundMs;
}

/** Take the advisory lock inside the current transaction, or throw TargetBusy. */
async function takeAdvisoryLock(key: string, shared: boolean): Promise<void> {
	const rows = (await sql.unsafe(
		shared
			? 'SELECT pg_try_advisory_xact_lock_shared($1::int, hashtext($2)) AS got'
			: 'SELECT pg_try_advisory_xact_lock($1::int, hashtext($2)) AS got',
		[DIFFUSION_TARGET_LOCK_CLASS, key],
	)) as { got: boolean | string }[];
	const got = rows[0]?.got;
	if (got !== true && got !== 't' && got !== 'true') throw new TargetBusy(key);
}

/** The unit's bounds, SET LOCAL on the transaction it opened (they never leak to the pool). */
async function boundUnit(idleBoundMs: number): Promise<void> {
	await sql.unsafe(`SET LOCAL idle_in_transaction_session_timeout = ${idleBoundMs}`);
	await sql.unsafe(`SET LOCAL lock_timeout = '${FENCE_LOCK_TIMEOUT}'`);
}

/** `work` with the unit's keepalive running for as long as it is in flight. */
async function runKeptAlive<T>(work: () => Promise<T>, idleBoundMs: number): Promise<T> {
	const keepalive = startUnitKeepalive(Math.floor(idleBoundMs / KEEPALIVE_FRACTION));
	try {
		return await work();
	} finally {
		await keepalive.stop();
	}
}

/**
 * ONE try: a transaction that takes EVERY key's lock — all or none — and runs
 * `work`. A key found held throws TargetBusy before `work` starts, and the
 * rollback releases the keys this try already took: a try never keeps one
 * target while another is busy. Nested on an ambient transaction (a door inside
 * another unit) the try is a savepoint whose rollback releases what it took,
 * the lock is re-entrant, the ambient transaction's settings are never
 * rewritten and its owner keeps the connection alive — no second timer.
 */
async function tryUnit<T>(
	keys: readonly string[],
	work: () => Promise<T>,
	shared: boolean,
	idleBoundMs: number,
): Promise<{ acquired: true; value: T } | { acquired: false; busyKey: string }> {
	const opensTransaction = !isInTransaction();
	try {
		const value = await withTransaction(async () => {
			if (opensTransaction) await boundUnit(idleBoundMs);
			for (const key of keys) await takeAdvisoryLock(key, shared);
			return opensTransaction ? runKeptAlive(work, idleBoundMs) : work();
		});
		return { acquired: true, value };
	} catch (error) {
		if (error instanceof TargetBusy) return { acquired: false, busyKey: error.key };
		throw error;
	}
}

/** How long to sleep before the next try, or null when a bounded wait is spent. */
function nextWait(mode: TargetLockMode, delay: number, startedAt: number): number | null {
	if (typeof mode !== 'object') return delay;
	const remaining = mode.boundMs - (Date.now() - startedAt);
	return remaining <= 0 ? null : Math.min(delay, remaining);
}

/**
 * The wait between tries of one door: tells the busy target ONCE, asks the
 * stop flag, backs off (doubling, capped) within the mode's bound. Each call
 * answers how the wait ended: null = try again.
 */
function busyWaiter(
	mode: TargetLockMode,
	options: TargetLockOptions,
): () => Promise<'busy' | 'stopped' | null> {
	const startedAt = Date.now();
	let delay = BACKOFF_START_MS;
	let onBusy = options.onBusy;
	return async () => {
		if (mode === 'try') return 'busy';
		const tell = onBusy;
		onBusy = undefined;
		if (tell !== undefined) await tell();
		if ((await options.shouldStop?.()) === true) return 'stopped';
		const wait = nextWait(mode, delay, startedAt);
		if (wait === null) return 'busy';
		await Bun.sleep(wait);
		delay = Math.min(delay * 2, BACKOFF_MAX_MS);
		return null;
	};
}

/**
 * Run `work` in ONE transaction that holds the target's advisory lock. While
 * the target is busy no transaction (no connection) is held, `onBusy` runs
 * once, `shouldStop` is asked, and the next try backs off. A bounded or 'try'
 * mode gives up with `{acquired: false, reason: 'busy'}`. Re-entrant within one
 * session: a nested call on the ambient transaction re-takes a lock it holds.
 */
export function withTargetLock<T>(
	key: string,
	work: () => Promise<T>,
	options: TargetLockOptions = {},
): Promise<TargetLockOutcome<T>> {
	return withTargetLocks([key], work, options);
}

/**
 * Hold SEVERAL targets at once (a store that spans them — the `.publication/pub`
 * union is derived from every database's `dbs/` subtree), with the same modes
 * and outcome as withTargetLock. ALL OR NONE: each try takes every key in
 * SORTED order inside one transaction and, the moment one is held elsewhere,
 * rolls back — releasing the ones it took — and waits holding NOTHING. A
 * multi-target door therefore never keeps a free target locked while another
 * one is busy (closure review 2026-10-01: the nested 'wait' it replaces held
 * `sql:<A>` exclusively, with a pinned connection, for as long as `sql:<B>`'s
 * writer stayed busy — stalling A's runners and sending every unpublish on A
 * to dd1758 pending), and no two holders can wait on each other in a cycle.
 * The price is the door's own: it may wait until every target is free at one
 * instant, which is why a multi-target door passes a bounded mode.
 */
export async function withTargetLocks<T>(
	keys: readonly string[],
	work: () => Promise<T>,
	options: TargetLockOptions = {},
): Promise<TargetLockOutcome<T>> {
	const ordered = [...new Set(keys)].sort();
	const idleBoundMs = usableIdleBound(options.idleBoundMs ?? FENCE_IDLE_BOUND_MS);
	const waitForTarget = busyWaiter(options.mode ?? 'wait', options);
	for (;;) {
		const tried = await tryUnit(ordered, work, options.shared === true, idleBoundMs);
		if (tried.acquired) return tried;
		const ended = await waitForTarget();
		if (ended !== null) return { acquired: false, reason: ended, busyKey: tried.busyKey };
	}
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
 * How long a PATIENT scope (a retry drain) waits IN TOTAL — across every
 * delete door and target inside it — for targets another writer holds.
 */
export const DELETE_TARGET_LOCK_BOUND_MS = 10_000;

/**
 * The patient scope (request-scoped, never module state that outlives a call):
 * set by the pending-unpublish RETRY DRAINS, which exist to pay the debt and run
 * off the interactive path. Outside it — the record-delete REQUEST path
 * (dd_core_api delete → settle → deleteDiffusionRecord, once per intent row) —
 * a held target is not waited for at all: a bulk delete during a long lang
 * sweep must not cost 10 s × rows × targets of HTTP latency, and the row it
 * leaves pending is the retry queue's (residual R3).
 */
const patientDeleteScope = new AsyncLocalStorage<{ deadline: number }>();

/**
 * Run `work` with the delete doors waiting for busy targets — the retry
 * drains. ONE budget for the whole scope (a drain of 100 rows waits 10 s, not
 * 100 × 10 s); once spent, every held target is given up at once.
 */
export function withPatientDeleteWait<T>(work: () => Promise<T>): Promise<T> {
	return patientDeleteScope.run({ deadline: Date.now() + DELETE_TARGET_LOCK_BOUND_MS }, work);
}

/** The mode of a delete door NOW: what is left of the drain's budget, else 'try'. */
function deleteDoorLockMode(): TargetLockMode {
	const scope = patientDeleteScope.getStore();
	const remaining = scope === undefined ? 0 : scope.deadline - Date.now();
	return remaining > 0 ? { boundMs: remaining } : 'try';
}

/**
 * A DELETE-ONLY door's unit: the target's lock SHARED (unpublishers never
 * exclude each other), waiting only inside a patient drain and only for what
 * is left of its budget. Not acquired ⇒ an exclusive writer holds the target —
 * the caller leaves its unpublish pending for the retry queue.
 */
export function withDeleteDoorLock<T>(
	key: string,
	work: () => Promise<T>,
): Promise<TargetLockOutcome<T>> {
	return withTargetLock(key, work, { mode: deleteDoorLockMode(), shared: true });
}
