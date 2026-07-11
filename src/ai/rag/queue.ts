/**
 * RAG dirty-marker queue (TS port of core/rag/class.rag_queue.php; reference
 * `src/ai/rag2/src/rag_queue.ts`, Brick 3), on this branch's matrix Bun.sql pool.
 *
 * The marker table `rag_index_queue` lives in the MATRIX database (dedalo7_mib),
 * so enqueue runs on the SAME connection as the editor save and a DOWN vector
 * store can never block a save. The vectors live in dedalo7_rag; the two are
 * NEVER joined.
 *
 * enqueue() is BEST-EFFORT (swallows every error). drain() is single-flighted
 * with a Postgres advisory lock and deletes only the row whose observed
 * enqueued_at is unchanged, so an edit landing mid-drain is preserved. Failed
 * records back off exponentially and are dropped after a capped attempt count.
 *
 * No module-global mutable state: the matrix queryer is INJECTED.
 */

import { sql } from '../../core/db/postgres.ts';
import { buildRagIndexer } from './indexer.ts';
import type { RecordLocator } from './types.ts';

/** The desired action recorded against a queued record. */
export type RagQueueOp = 'index' | 'delete';

/**
 * The minimal matrix-DB read/write surface the queue needs — a parameterised
 * `query(text, params)` returning rows. Kept as a narrow interface so the queue
 * is unit-testable with an in-memory fake.
 */
export interface MatrixQueryer {
	query<T = unknown>(text: string, params?: unknown[]): Promise<T[]>;
	/**
	 * Reserve a single dedicated connection (optional). The drain uses it so its
	 * advisory lock/unlock and all its statements run on ONE session — a pooled
	 * lock+unlock could otherwise land on different connections and leak the lock.
	 * Absent on the in-memory test fake (which is inherently single-session).
	 */
	reserve?(): Promise<MatrixSession>;
}

/** A reserved single-connection session (release it when done). */
export interface MatrixSession extends MatrixQueryer {
	release(): void;
}

/**
 * A record-indexing engine the drain dispatches to. `indexRecord` returns true on
 * success (or a clean no-op), false on a RETRYABLE failure (so the queue retries
 * with backoff). `deleteRecord` removes a record's vectors.
 */
export interface RagIndexerLike {
	indexRecord(locator: RecordLocator): Promise<boolean>;
	deleteRecord(locator: RecordLocator): Promise<boolean>;
}

export interface DrainOptions {
	/** Max markers to claim in one drain pass. Default 100. */
	batch?: number;
	/** Max attempts before a failing record is dropped. Default 5. */
	maxAttempts?: number;
}

export interface QueueStats {
	pending: number;
	ready: number;
	blocked: number;
	failed: number;
	oldestAgeSec: number | null;
}

/** Operational snapshot of one drain pass. */
export interface DrainResult {
	processed: number;
	failed: number;
	droppedAfterMaxAttempts: number;
	/** false when another worker held the advisory lock (this pass was a no-op). */
	ranSingleFlight: boolean;
}

/** Advisory-lock key that single-flights the drain across workers (matches PHP). */
const DRAIN_LOCK_KEY = 918273645;
const DEFAULT_BATCH = 100;
const DEFAULT_MAX_ATTEMPTS = 5;
/** Backoff cap in minutes (matches PHP). */
const BACKOFF_CAP_MIN = 30;

export class RagQueue {
	constructor(private readonly db: MatrixQueryer) {}

	/**
	 * Mark a record dirty (best-effort; NEVER throws). `op` defaults to 'index'.
	 * The save/delete hook also guards + try/catches this, but the swallow here is
	 * the load-bearing guarantee: a queue write must never fail a save.
	 */
	async enqueue(locator: RecordLocator, op: RagQueueOp = 'index'): Promise<void> {
		if (locator.sectionId < 1 || locator.sectionTipo === '') return;
		try {
			await this.db.query(
				`INSERT INTO rag_index_queue
						(section_tipo, section_id, op, attempts, last_error, next_attempt_at, enqueued_at)
					VALUES ($1, $2, $3, 0, NULL, now(), now())
					ON CONFLICT (section_tipo, section_id)
					DO UPDATE SET
						op = EXCLUDED.op,
						attempts = 0,
						last_error = NULL,
						next_attempt_at = now(),
						enqueued_at = now()`,
				[locator.sectionTipo, locator.sectionId, op],
			);
		} catch {
			// Never propagate — a queue failure must not fail the save.
		}
	}

	/**
	 * Drain up to `batch` ready markers oldest-first, single-flighted via a Postgres
	 * advisory lock. On success deletes the marker only if its observed enqueued_at
	 * is unchanged (an edit that re-enqueued mid-drain survives). On a retryable
	 * failure applies exponential backoff (2^attempt minutes, capped) and bumps
	 * attempts; drops the row after maxAttempts so it can't loop forever.
	 */
	async drain(opts: DrainOptions = {}): Promise<DrainResult> {
		const batch = Math.max(1, opts.batch ?? DEFAULT_BATCH);
		const maxAttempts = Math.max(1, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
		const result: DrainResult = {
			processed: 0,
			failed: 0,
			droppedAfterMaxAttempts: 0,
			ranSingleFlight: false,
		};

		// Run the whole pass on ONE connection when the queryer supports it, so the
		// advisory lock/unlock and every statement share a session (see MatrixQueryer).
		const session = this.db.reserve ? await this.db.reserve() : null;
		const db: MatrixQueryer = session ?? this.db;
		try {
			// single-flight: bail if another drain holds the lock
			const lock = await db.query<{ got: boolean }>('SELECT pg_try_advisory_lock($1) AS got', [
				DRAIN_LOCK_KEY,
			]);
			if (!toBool(lock[0]?.got)) return result;
			result.ranSingleFlight = true;

			try {
				const rows = await db.query<RawQueueRow>(
					`SELECT section_tipo, section_id, op, attempts, enqueued_at::text AS enqueued_at
						FROM rag_index_queue
						WHERE next_attempt_at <= now()
						ORDER BY enqueued_at ASC
						LIMIT $1`,
					[batch],
				);

				for (const r of rows) {
					const locator: RecordLocator = {
						sectionTipo: String(r.section_tipo),
						sectionId: Number(r.section_id),
					};
					const op: RagQueueOp = r.op === 'delete' ? 'delete' : 'index';
					const attempts = Number(r.attempts);
					const observedTs = String(r.enqueued_at);

					let ok = false;
					try {
						ok =
							op === 'delete'
								? await this.indexerDelete(locator)
								: await this.indexerIndex(locator);
					} catch {
						ok = false; // a thrown indexer is a retryable failure
					}

					if (ok) {
						// delete only if not re-enqueued meanwhile (newer enqueued_at survives)
						await db.query(
							`DELETE FROM rag_index_queue
								WHERE section_tipo=$1 AND section_id=$2 AND enqueued_at=$3::timestamptz`,
							[locator.sectionTipo, locator.sectionId, observedTs],
						);
						result.processed++;
					} else {
						result.failed++;
						if (attempts + 1 >= maxAttempts) {
							await db.query(
								`DELETE FROM rag_index_queue
									WHERE section_tipo=$1 AND section_id=$2 AND enqueued_at=$3::timestamptz`,
								[locator.sectionTipo, locator.sectionId, observedTs],
							);
							result.droppedAfterMaxAttempts++;
						} else {
							const backoffMin = Math.min(BACKOFF_CAP_MIN, 2 ** (attempts + 1));
							await db.query(
								`UPDATE rag_index_queue
									SET attempts = attempts + 1,
											last_error = $4,
											next_attempt_at = now() + ($5 || ' minutes')::interval
									WHERE section_tipo=$1 AND section_id=$2 AND enqueued_at=$3::timestamptz`,
								[
									locator.sectionTipo,
									locator.sectionId,
									observedTs,
									`indexer returned false (op=${op})`,
									String(backoffMin),
								],
							);
						}
					}
				}
			} finally {
				await db.query('SELECT pg_advisory_unlock($1)', [DRAIN_LOCK_KEY]);
			}
		} finally {
			session?.release();
		}

		return result;
	}

	/**
	 * Operational snapshot for monitoring — queue depth, ready/blocked counts, failed
	 * (attempts>0), oldest pending age. Cheap; safe to expose via an API.
	 */
	async stats(): Promise<QueueStats> {
		const rows = await this.db.query<RawStatsRow>(
			`SELECT
					count(*) AS pending,
					count(*) FILTER (WHERE next_attempt_at <= now()) AS ready,
					count(*) FILTER (WHERE next_attempt_at > now()) AS blocked,
					count(*) FILTER (WHERE attempts > 0) AS failed,
					EXTRACT(EPOCH FROM (now() - min(enqueued_at)))::int AS oldest_age_sec
				FROM rag_index_queue`,
		);
		const row = rows[0];
		return {
			pending: Number(row?.pending ?? 0),
			ready: Number(row?.ready ?? 0),
			blocked: Number(row?.blocked ?? 0),
			failed: Number(row?.failed ?? 0),
			oldestAgeSec:
				row?.oldest_age_sec === null || row?.oldest_age_sec === undefined
					? null
					: Number(row.oldest_age_sec),
		};
	}

	// The drain dispatch points are injected via setIndexer(); kept private so the
	// queue owns the dispatch protocol (op → method).
	private indexer: RagIndexerLike | null = null;

	/** Bind the record-indexing engine the drain dispatches to. Returns this. */
	setIndexer(indexer: RagIndexerLike): this {
		this.indexer = indexer;
		return this;
	}

	private async indexerIndex(locator: RecordLocator): Promise<boolean> {
		if (this.indexer === null) return false;
		return this.indexer.indexRecord(locator);
	}

	private async indexerDelete(locator: RecordLocator): Promise<boolean> {
		if (this.indexer === null) return false;
		return this.indexer.deleteRecord(locator);
	}
}

interface RawQueueRow {
	section_tipo: string;
	section_id: number | string;
	op: string;
	attempts: number | string;
	enqueued_at: string;
}

interface RawStatsRow {
	pending: number | string;
	ready: number | string;
	blocked: number | string;
	failed: number | string;
	oldest_age_sec: number | string | null;
}

/** Tolerate the 't'/'f'/1 forms a bool can arrive as. */
function toBool(v: unknown): boolean {
	return v === true || v === 't' || v === 'true' || v === 1 || v === '1';
}

// ─────────────────────────────── production wiring ───────────────────────────────

/** The production MatrixQueryer over the matrix Bun.sql pool (dedalo7_mib). */
export function defaultMatrixQueryer(): MatrixQueryer {
	return {
		query: <T = unknown>(text: string, params: unknown[] = []) =>
			sql.unsafe(text, params as (string | number | null)[]) as unknown as Promise<T[]>,
		reserve: async (): Promise<MatrixSession> => {
			const reserved = await sql.reserve();
			return {
				query: <T = unknown>(text: string, params: unknown[] = []) =>
					reserved.unsafe(text, params as (string | number | null)[]) as unknown as Promise<T[]>,
				release: () => reserved.release(),
			};
		},
	};
}

/** DDL for the dirty-marker queue (idempotent). Lives in the matrix DB. */
const QUEUE_DDL = `CREATE TABLE IF NOT EXISTS rag_index_queue (
		section_tipo	varchar(64)		NOT NULL,
		section_id		integer			NOT NULL,
		op				varchar(8)		NOT NULL DEFAULT 'index',
		attempts		integer			NOT NULL DEFAULT 0,
		last_error		text,
		next_attempt_at	timestamptz		NOT NULL DEFAULT now(),
		enqueued_at		timestamptz		NOT NULL DEFAULT now(),
		PRIMARY KEY (section_tipo, section_id)
	)`;
const QUEUE_INDEX_DDL = `CREATE INDEX IF NOT EXISTS rag_index_queue_ready_idx
	ON rag_index_queue (next_attempt_at, enqueued_at)`;

/** Idempotently provision the queue table + ready-order index in the matrix DB. */
export async function ensureRagQueueTable(): Promise<void> {
	await sql.unsafe(QUEUE_DDL);
	await sql.unsafe(QUEUE_INDEX_DDL);
}

/**
 * Build the production queue bound to the full-record indexer. Used by the drain
 * CLI and the save-hook bootstrap. The indexer's boundary (ontology, get_value,
 * store) is wired by buildRagIndexer(); the queue reads/writes the matrix DB.
 */
export function buildRagQueue(): RagQueue {
	const indexer = buildRagIndexer();
	return new RagQueue(defaultMatrixQueryer()).setIndexer({
		indexRecord: (locator) => indexer.indexRecord(locator),
		deleteRecord: (locator) => indexer.deleteRecord(locator),
	});
}
