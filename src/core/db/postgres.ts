/**
 * PostgreSQL access for the Dédalo TS server.
 *
 * SQL CONFINEMENT — the TIERED rule (DEC-09; replaces the dead "SQL only in
 * core/db" absolute):
 *   T1 — CONNECTIONS: `new SQL(...)` (pool creation) is confined to core/db/,
 *        ai/rag/vector_store.ts (the separate RAG DB) and
 *        diffusion/targets/mariadb/ (the MariaDB publication target).
 *        Everything else uses the `sql` handle exported here.
 *   T2 — MATRIX DML: writes to matrix jsonb columns go through
 *        db/matrix_write.ts + db/json_codec.ts (the byte-compat chokepoint);
 *        raw `sql.unsafe` matrix writes are the audited exception list, and
 *        every `$n::jsonb` bind must be `$n::text::jsonb` (the Bun 1.3.9
 *        double-encode trap) unless the file is on the object-binding
 *        allowlist — grep-gated by test/unit/ws_a_tripwires.test.ts.
 *   T3 — dd_ontology READS: converge on ontology/resolver.ts accessors
 *        (ratcheted; see WS-D).
 * Prepared-statement discipline (spec §7.7) is unchanged: values are ALWAYS
 * bound parameters; identifiers come from fixed allowlists (§7.6).
 *
 * Client: Bun's built-in SQL (Postgres). Queries use the tagged-template form
 * (sql`... ${value} ...`), which ALWAYS sends values as bound parameters —
 * string concatenation of user values is structurally impossible through this
 * API. Identifiers (table/column names) cannot be parameterized; they must
 * come from fixed allowlists validated at the §7.6 chokepoint BEFORE reaching
 * this layer.
 *
 * Connection: DB_HOST starting with '/' is a unix-socket DIRECTORY (Postgres
 * convention, e.g. '/tmp'); we derive the full socket path Bun expects.
 * Otherwise it is a TCP hostname. Verified against Bun 1.3.9.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { SQL } from 'bun';
import { config } from '../../config/config.ts';
import { recordPoolWait } from '../api/counters.ts';

/**
 * Operations posture (audit S2-32/S2-37, config catalog `config.ops` — all
 * deployment knobs with safe defaults, see engineering/PRODUCTION.md):
 *  - DB_POOL_MAX: pooled connections per process (default 10);
 *  - DB_POOL_ACQUIRE_TIMEOUT_MS: max ms a query may QUEUE for a pooled
 *    connection before erroring; 0 = wait forever (the pre-audit behavior);
 *  - DB_STATEMENT_TIMEOUT_MS: per-connection statement_timeout GUC ceiling —
 *    bounds a runaway query (e.g. an adversarial regex reaching `~*`).
 *    DISABLED by default (0): a pool-wide ceiling would also abort
 *    legitimately long operations (REINDEX/VACUUM, large exports), so set it
 *    ABOVE the slowest legitimate query;
 *  - DEDALO_SLOW_QUERY_MS: statements slower than this log a warn line, 0=off.
 */
const POOL_MAX = config.ops.dbPoolMax;
const ACQUIRE_TIMEOUT_MS = config.ops.dbAcquireTimeoutMs;
const DB_STATEMENT_TIMEOUT_MS = config.ops.dbStatementTimeoutMs;
const SLOW_QUERY_MS = config.ops.slowQueryMs;

/** Build the Bun SQL options for the configured database. */
function buildSqlOptions(): ConstructorParameters<typeof SQL>[0] {
	const { database, host, port, user, password } = config.db;
	const commonOptions = {
		database,
		username: user,
		password: password || undefined,
		// Modest pool: the server is long-lived; Postgres default max_connections is 100.
		max: POOL_MAX,
		// Postgres client runtime GUCs applied on connect; only set the timeout when
		// explicitly configured (0 = no ceiling, Postgres default).
		...(DB_STATEMENT_TIMEOUT_MS > 0
			? { connection: { statement_timeout: String(DB_STATEMENT_TIMEOUT_MS) } }
			: {}),
	};
	if (host.startsWith('/')) {
		// Unix socket: Postgres sockets are named .s.PGSQL.<port> inside the dir.
		return { ...commonOptions, path: `${host}/.s.PGSQL.${port}` };
	}
	return { ...commonOptions, hostname: host, port };
}

/**
 * The single shared connection pool. Module-level by design: a pool is one of
 * the few legitimate pieces of process-wide state (it holds no request
 * identity — see the persistent-runtime discipline, spec §4).
 */
const pool = new SQL(buildSqlOptions());

/**
 * POOL ACQUIRE GATE (S2-32, wired here per WS-E/WS-A split): Bun's pool queues
 * silently and indefinitely when saturated — an exhausted pool was an
 * invisible, unbounded hang. This semaphore fronts the pool with the SAME
 * capacity, so saturation becomes observable (every wait feeds the
 * db_pool_waits counter via recordPoolWait) and bounded (a waiter errors after
 * DB_POOL_ACQUIRE_TIMEOUT_MS when configured). Transactions hold ONE slot for
 * their whole span (acquired around pool.begin); queries routed onto the
 * ambient tx connection bypass the gate — they consume no extra pool
 * connection, and gating them would deadlock at capacity. `sql.reserve()`
 * remains ungated (its release is caller-owned; the two reserve users are
 * short-lived RAG queue sessions).
 */
interface PoolSlotWaiter {
	grant: () => void;
	cancelled: boolean;
}

let availablePoolSlots = POOL_MAX;
const poolSlotWaiters: PoolSlotWaiter[] = [];

async function acquirePoolSlot(): Promise<void> {
	if (availablePoolSlots > 0) {
		availablePoolSlots--;
		return;
	}
	const startedAt = performance.now();
	await new Promise<void>((resolve, reject) => {
		const waiter: PoolSlotWaiter = { grant: resolve, cancelled: false };
		poolSlotWaiters.push(waiter);
		if (ACQUIRE_TIMEOUT_MS > 0) {
			const timer = setTimeout(() => {
				if (waiter.cancelled) return;
				waiter.cancelled = true;
				const index = poolSlotWaiters.indexOf(waiter);
				if (index !== -1) poolSlotWaiters.splice(index, 1);
				reject(
					new Error(
						`postgres: no pooled connection became available within DB_POOL_ACQUIRE_TIMEOUT_MS=${ACQUIRE_TIMEOUT_MS}ms ` +
							`(pool max ${POOL_MAX} saturated — S2-32 fail-loud instead of an indefinite hang)`,
					),
				);
			}, ACQUIRE_TIMEOUT_MS);
			// Do not keep the process alive for a pending acquire timeout.
			timer.unref?.();
		}
	});
	recordPoolWait(performance.now() - startedAt);
}

function releasePoolSlot(): void {
	for (;;) {
		const waiter = poolSlotWaiters.shift();
		if (waiter === undefined) {
			availablePoolSlots++;
			return;
		}
		if (waiter.cancelled) continue; // timed out — already rejected
		waiter.cancelled = true; // consume: the pending timeout becomes a no-op
		waiter.grant();
		return;
	}
}

/**
 * Read-only snapshot of the acquire-gate counters, for status surfaces (the
 * check_config maintenance widget). NOT a request-identity carrier — it exposes
 * only the process-wide pool gauge (max capacity, slots currently held, and
 * queued waiters), never a connection handle or any per-request state.
 */
export function getPoolStats(): { max: number; inUse: number; waiters: number } {
	return { max: POOL_MAX, inUse: POOL_MAX - availablePoolSlots, waiters: poolSlotWaiters.length };
}

/**
 * Run one pool-executed statement through the acquire gate, with the
 * slow-query log (DEDALO_SLOW_QUERY_MS, S2-37). `describeQuery` is lazy — the
 * text is only built when a warn line actually fires.
 */
async function runOnPool<T>(execute: () => Promise<T>, describeQuery: () => string): Promise<T> {
	await acquirePoolSlot();
	const startedAt = performance.now();
	try {
		return await execute();
	} finally {
		releasePoolSlot();
		if (SLOW_QUERY_MS > 0) {
			const elapsedMs = performance.now() - startedAt;
			if (elapsedMs >= SLOW_QUERY_MS) {
				console.warn(
					`[db] slow query ${Math.round(elapsedMs)}ms (threshold ${SLOW_QUERY_MS}ms): ${describeQuery()}`,
				);
			}
		}
	}
}

/**
 * The ambient transaction connection for the current async context, if any.
 *
 * PHP runs each request on ONE pinned connection, so a value written earlier in
 * a request is visible to a read later in the SAME request. Bun's pool hands a
 * possibly-different connection to every query, so an in-flight transaction's
 * uncommitted writes would be invisible to a subsequent pooled read (they live
 * on the reserved tx connection). We reproduce PHP's one-connection semantics
 * with AsyncLocalStorage: `withTransaction` stashes the reserved tx handle here,
 * and the exported `sql` proxy (below) transparently routes every query to it.
 * Nothing outside this module reads the store — request identity never leaks
 * into it (spec §4); it holds only a connection handle for the current tx.
 */
interface TransactionHandle {
	executor: SQL;
	/**
	 * S2-14 fail-loud expiry: flipped in withTransaction's finally, AFTER the
	 * transaction settles. A continuation leaked from inside the callback (an
	 * unawaited promise, a setTimeout — the ALS store propagates to all of
	 * them) that issues a query later would otherwise run on the RELEASED tx
	 * connection with timing-dependent results (reproduced: a thrown statement
	 * that still auto-committed). With the flag set, activeExecutor() throws
	 * deterministically and the query is never sent.
	 */
	expired: boolean;
}

const transactionStore = new AsyncLocalStorage<TransactionHandle>();

/**
 * Deferred post-transaction actions for the current async context (S1-14
 * hardening). Shared-cache clears fired INSIDE a transaction are unsafe on
 * both edges: a concurrent request could repopulate the cleared entry from
 * committed-but-about-to-be-stale state before COMMIT, and any future in-tx
 * cached read of tx-written rows would leak uncommitted data process-wide.
 * Cache owners therefore queue their clears here (via `deferPostTransaction`)
 * and `withTransaction` replays the queue in its finally — after COMMIT and
 * after ROLLBACK alike (over-invalidation is harmless; a skipped replay is
 * not).
 */
interface DeferredActionQueue {
	actions: Array<() => void>;
	/** True after the queue has been replayed — late pushes must run inline. */
	closed: boolean;
}

const deferredActionStore = new AsyncLocalStorage<DeferredActionQueue>();

/** The executor for the current context: the ambient tx connection, else the pool. */
function activeExecutor(): SQL {
	const handle = transactionStore.getStore();
	if (handle === undefined) return pool;
	if (handle.expired) {
		throw new Error(
			'postgres: ambient transaction handle has EXPIRED — a continuation leaked past ' +
				'withTransaction (unawaited promise/timer started inside the callback) tried to ' +
				'query after COMMIT/ROLLBACK. The query was NOT sent. Await every async operation ' +
				'inside the transaction callback (S2-14).',
		);
	}
	return handle.executor;
}

/**
 * Queue `action` to run after the ambient transaction settles (COMMIT or
 * ROLLBACK). Returns false when no transaction is active OR the ambient
 * queue has already been replayed (a leaked continuation) — the caller must
 * then run the action itself. Actions must be synchronous and must not throw
 * for correctness (a throw is logged and swallowed so the remaining queue
 * still drains).
 */
export function deferPostTransaction(action: () => void): boolean {
	const queue = deferredActionStore.getStore();
	if (queue === undefined || queue.closed) return false;
	queue.actions.push(action);
	return true;
}

/**
 * The database handle used everywhere in the codebase.
 *
 * It is a Proxy over the pool that, on EVERY use, resolves to the ambient
 * transaction connection when one is active (see transactionStore) and to the
 * pool otherwise. This makes every existing call site — the tagged-template
 * form `sql`...`` and the `sql.unsafe(...)` form — transparently transactional
 * inside `withTransaction`, with zero signature changes. The `apply` trap
 * handles the tagged-template call; the `get` trap forwards `.unsafe`, `.begin`,
 * etc. (bound to the live executor so `this` is correct).
 */
export const sql: SQL = new Proxy(pool, {
	apply(_target, _thisArg, argumentsList) {
		// Tagged-template call: sql`SELECT ... ${value}`.
		const executor = activeExecutor();
		if (executor !== pool) {
			// Ambient tx connection: already holds its pool slot — no gate.
			return (executor as unknown as (...args: unknown[]) => unknown)(...argumentsList);
		}
		return runOnPool(
			async () => (pool as unknown as (...args: unknown[]) => Promise<unknown>)(...argumentsList),
			() =>
				String((argumentsList[0] as { raw?: readonly string[] } | undefined)?.raw?.join('?') ?? '')
					.replace(/\s+/g, ' ')
					.slice(0, 300),
		);
	},
	get(_target, property, _receiver) {
		const executor = activeExecutor();
		if (executor === pool && property === 'unsafe') {
			return (query: string, params?: unknown[]) =>
				runOnPool(
					async () => pool.unsafe(query, params as never),
					() => query.replace(/\s+/g, ' ').slice(0, 300),
				);
		}
		const value = (executor as unknown as Record<PropertyKey, unknown>)[property];
		return typeof value === 'function' ? value.bind(executor) : value;
	},
}) as unknown as SQL;

/**
 * Run `work` inside a single database transaction (BEGIN … COMMIT/ROLLBACK on
 * ONE reserved connection). Every query issued through the exported `sql` while
 * `work` runs — directly or in any awaited helper — is pinned to that
 * connection, so in-transaction reads see in-transaction writes, exactly like
 * PHP's per-request connection. A throw rolls the whole transaction back.
 *
 * Nesting: an inner `withTransaction` reuses the ambient transaction (no nested
 * BEGIN, no savepoint) — the outer commit/rollback is authoritative. This keeps
 * composed mutation helpers (each defensively wrapping their own writes) from
 * fragmenting one logical operation into independent transactions.
 */
export async function withTransaction<T>(work: () => Promise<T>): Promise<T> {
	const ambient = transactionStore.getStore();
	if (ambient !== undefined) {
		// Already inside a transaction — join it (single-connection guarantee
		// holds; the OUTER withTransaction owns the deferred-action replay).
		return work();
	}
	const queue: DeferredActionQueue = { actions: [], closed: false };
	let handle: TransactionHandle | null = null;
	// The transaction owns ONE pool slot for its whole span (see the acquire
	// gate above); its inner queries route onto the reserved connection and
	// bypass the gate.
	await acquirePoolSlot();
	try {
		return (await pool.begin(async (transaction: SQL) => {
			handle = { executor: transaction, expired: false };
			return transactionStore.run(handle, () => deferredActionStore.run(queue, work));
		})) as T;
	} finally {
		releasePoolSlot();
		// S2-14: expire the ambient handle FIRST — from here on, any leaked
		// continuation that tries to query throws instead of running on the
		// released connection.
		if (handle !== null) {
			(handle as TransactionHandle).expired = true;
		}
		queue.closed = true;
		// Replay the deferred cache clears AFTER the transaction has settled
		// (see deferredActionStore) — on rollback too, harmless by design.
		for (const action of queue.actions) {
			try {
				action();
			} catch (error) {
				console.error('withTransaction: deferred post-transaction action failed:', error);
			}
		}
	}
}

/**
 * True when the current async context is inside a `withTransaction` block.
 * NOTE an EXPIRED handle (a leaked continuation, S2-14) still reports true:
 * guards keyed on this stay on the transactional path and the next query
 * fails loud in activeExecutor() — returning false would silently reroute the
 * leaked writes onto the pool, outside any transaction.
 */
export function isInTransaction(): boolean {
	return transactionStore.getStore() !== undefined;
}

/**
 * Acquire the transaction-scoped advisory lock for one node, byte-identical to
 * PHP matrix_db_manager::acquire_node_lock:
 *   SELECT pg_advisory_xact_lock(hashtext('<section_tipo>_<section_id>'))
 *
 * The hashtext input string MUST match PHP exactly — during PHP↔TS coexistence
 * both servers hash the same key, which is what makes them mutually exclusive
 * on the same node. The lock releases automatically at COMMIT/ROLLBACK. Callable
 * only inside a transaction (an advisory-xact lock outside a tx is a no-op).
 */
export async function acquireNodeLock(
	sectionTipo: string,
	sectionId: number | string,
): Promise<void> {
	if (!isInTransaction()) {
		throw new Error(
			'acquireNodeLock: called outside a transaction; the lock would be ineffective (call inside withTransaction)',
		);
	}
	const lockKey = `${sectionTipo}_${sectionId}`;
	await sql.unsafe('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);
}

/** Close the pool (tests and graceful shutdown). */
export async function closeDatabasePool(): Promise<void> {
	await pool.end();
}
