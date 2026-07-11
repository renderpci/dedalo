import { describe, expect, test } from 'bun:test';
import { type MatrixQueryer, type RagIndexerLike, RagQueue } from '../../src/ai/rag/queue.ts';
import type { RecordLocator } from '../../src/ai/rag/types.ts';

/**
 * Unit tests for the RAG queue against an IN-MEMORY fake of the rag_index_queue
 * matrix table (ported from `src/ai/rag2/test/rag_queue.test.ts`, Brick 3). The
 * fake models exactly the semantics the queue relies on: PK coalesce via ON
 * CONFLICT, ready filter + oldest-first, advisory-lock single-flight,
 * delete-by-observed-enqueued_at, backoff + attempts cap. `enqueued_at` is a
 * monotonic logical clock so ordering + the mid-drain re-enqueue are deterministic.
 */

interface Row {
	section_tipo: string;
	section_id: number;
	op: string;
	attempts: number;
	last_error: string | null;
	next_attempt_at: number; // logical clock value; ready when <= now
	enqueued_at: number;
}

/** A fake matrix queryer that interprets the queue's exact SQL by shape. */
class FakeMatrix implements MatrixQueryer {
	rows: Row[] = [];
	clock = 1;
	locked = false;
	/** When true, the next advisory-lock attempt fails (simulates another worker). */
	lockHeldByOther = false;

	private now(): number {
		return this.clock;
	}

	/** Advance the logical clock (e.g. between a save and a mid-drain re-enqueue). */
	tick(by = 1): void {
		this.clock += by;
	}

	async query<T = unknown>(text: string, params: unknown[] = []): Promise<T[]> {
		const sql = text.trim();

		if (sql.startsWith('SELECT pg_try_advisory_lock')) {
			if (this.lockHeldByOther || this.locked) return [{ got: false } as unknown as T];
			this.locked = true;
			return [{ got: true } as unknown as T];
		}
		if (sql.startsWith('SELECT pg_advisory_unlock')) {
			this.locked = false;
			return [];
		}

		if (sql.startsWith('INSERT INTO rag_index_queue')) {
			const [st, sid, op] = params as [string, number, string];
			const existing = this.rows.find((r) => r.section_tipo === st && r.section_id === sid);
			const stamp = this.now();
			if (existing) {
				existing.op = op;
				existing.attempts = 0;
				existing.last_error = null;
				existing.next_attempt_at = stamp;
				existing.enqueued_at = stamp;
			} else {
				this.rows.push({
					section_tipo: st,
					section_id: sid,
					op,
					attempts: 0,
					last_error: null,
					next_attempt_at: stamp,
					enqueued_at: stamp,
				});
			}
			this.tick();
			return [];
		}

		if (sql.startsWith('SELECT section_tipo, section_id, op, attempts, enqueued_at')) {
			const limit = params[0] as number;
			const ready = this.rows
				.filter((r) => r.next_attempt_at <= this.now())
				.sort((a, b) => a.enqueued_at - b.enqueued_at)
				.slice(0, limit);
			return ready.map((r) => ({
				section_tipo: r.section_tipo,
				section_id: r.section_id,
				op: r.op,
				attempts: r.attempts,
				enqueued_at: String(r.enqueued_at),
			})) as unknown as T[];
		}

		if (sql.startsWith('DELETE FROM rag_index_queue')) {
			const [st, sid, ts] = params as [string, number, string];
			this.rows = this.rows.filter(
				(r) => !(r.section_tipo === st && r.section_id === sid && String(r.enqueued_at) === ts),
			);
			return [];
		}

		if (sql.startsWith('UPDATE rag_index_queue')) {
			const [st, sid, ts, lastError, backoffMin] = params as [
				string,
				number,
				string,
				string,
				string,
			];
			const row = this.rows.find(
				(r) => r.section_tipo === st && r.section_id === sid && String(r.enqueued_at) === ts,
			);
			if (row) {
				row.attempts += 1;
				row.last_error = lastError;
				row.next_attempt_at = this.now() + Number(backoffMin); // minutes → logical ticks
			}
			return [];
		}

		if (sql.startsWith('SELECT\n')) {
			// stats
			const pending = this.rows.length;
			const ready = this.rows.filter((r) => r.next_attempt_at <= this.now()).length;
			const blocked = this.rows.filter((r) => r.next_attempt_at > this.now()).length;
			const failed = this.rows.filter((r) => r.attempts > 0).length;
			const oldest = this.rows.length ? Math.min(...this.rows.map((r) => r.enqueued_at)) : null;
			return [
				{
					pending,
					ready,
					blocked,
					failed,
					oldest_age_sec: oldest === null ? null : this.now() - oldest,
				},
			] as unknown as T[];
		}

		return [];
	}
}

/** An indexer stub whose verdicts are scripted per (op, section_id). */
function stubIndexer(
	verdict: (op: 'index' | 'delete', locator: RecordLocator) => boolean,
	log?: Array<{ op: 'index' | 'delete'; id: number }>,
): RagIndexerLike {
	return {
		async indexRecord(locator) {
			log?.push({ op: 'index', id: locator.sectionId });
			return verdict('index', locator);
		},
		async deleteRecord(locator) {
			log?.push({ op: 'delete', id: locator.sectionId });
			return verdict('delete', locator);
		},
	};
}

describe('RagQueue.enqueue', () => {
	test('coalesces repeated saves of the same record into ONE pending row', async () => {
		const m = new FakeMatrix();
		const q = new RagQueue(m);
		await q.enqueue({ sectionTipo: 'dd_x', sectionId: 5 }, 'index');
		await q.enqueue({ sectionTipo: 'dd_x', sectionId: 5 }, 'index');
		await q.enqueue({ sectionTipo: 'dd_x', sectionId: 5 }, 'index');
		expect(m.rows.length).toBe(1);
	});

	test('a later op flips a pending row (delete → index)', async () => {
		const m = new FakeMatrix();
		const q = new RagQueue(m);
		await q.enqueue({ sectionTipo: 'dd_x', sectionId: 5 }, 'delete');
		await q.enqueue({ sectionTipo: 'dd_x', sectionId: 5 }, 'index');
		expect(m.rows.length).toBe(1);
		expect(m.rows[0]!.op).toBe('index');
	});

	test('ignores invalid locators and never throws on a DB error', async () => {
		const throwing: MatrixQueryer = {
			async query() {
				throw new Error('db down');
			},
		};
		const q = new RagQueue(throwing);
		await q.enqueue({ sectionTipo: '', sectionId: 1 }); // skipped (empty tipo)
		await q.enqueue({ sectionTipo: 'dd_x', sectionId: 0 }); // skipped (id<1)
		// a real DB error is swallowed (best-effort)
		await expect(q.enqueue({ sectionTipo: 'dd_x', sectionId: 9 })).resolves.toBeUndefined();
	});
});

describe('RagQueue.drain', () => {
	test('processes ready rows oldest-first and deletes them on success', async () => {
		const m = new FakeMatrix();
		const log: Array<{ op: 'index' | 'delete'; id: number }> = [];
		const q = new RagQueue(m).setIndexer(stubIndexer(() => true, log));

		await q.enqueue({ sectionTipo: 'dd_x', sectionId: 1 }); // enqueued_at=1
		await q.enqueue({ sectionTipo: 'dd_x', sectionId: 2 }); // enqueued_at=2
		await q.enqueue({ sectionTipo: 'dd_x', sectionId: 3 }, 'delete'); // enqueued_at=3

		const res = await q.drain();
		expect(res.processed).toBe(3);
		expect(res.ranSingleFlight).toBe(true);
		expect(m.rows.length).toBe(0);
		// oldest-first
		expect(log.map((l) => l.id)).toEqual([1, 2, 3]);
		// op dispatch: id 3 was a delete
		expect(log[2]).toEqual({ op: 'delete', id: 3 });
	});

	test('single-flight: bails when another worker holds the advisory lock', async () => {
		const m = new FakeMatrix();
		m.lockHeldByOther = true;
		const q = new RagQueue(m).setIndexer(stubIndexer(() => true));
		await q.enqueue({ sectionTipo: 'dd_x', sectionId: 1 });
		const res = await q.drain();
		expect(res.ranSingleFlight).toBe(false);
		expect(res.processed).toBe(0);
		expect(m.rows.length).toBe(1); // untouched
	});

	test('delete-by-observed-enqueued_at: an edit mid-drain survives the delete', async () => {
		const m = new FakeMatrix();
		// A drain that, AFTER the indexer succeeds but BEFORE the delete, re-enqueues the
		// same record (a save landing mid-drain). The fake re-enqueue bumps enqueued_at,
		// so the delete (keyed on the OLD enqueued_at) matches nothing → the marker stays.
		const racingQueue = new RagQueue(m);
		const indexer: RagIndexerLike = {
			async indexRecord(locator) {
				m.tick(5);
				await racingQueue.enqueue(locator, 'index');
				return true;
			},
			async deleteRecord() {
				return true;
			},
		};
		const q = new RagQueue(m).setIndexer(indexer);
		await q.enqueue({ sectionTipo: 'dd_x', sectionId: 1 }); // enqueued_at=1

		const res = await q.drain();
		expect(res.processed).toBe(1);
		// The marker was re-enqueued (newer enqueued_at) and NOT deleted → still pending.
		expect(m.rows.length).toBe(1);
		expect(m.rows[0]!.section_id).toBe(1);
	});

	test('retryable failure backs off (attempts++ , next_attempt_at in the future)', async () => {
		const m = new FakeMatrix();
		const q = new RagQueue(m).setIndexer(stubIndexer(() => false));
		await q.enqueue({ sectionTipo: 'dd_x', sectionId: 7 }); // enqueued_at=1, ready

		const res = await q.drain();
		expect(res.processed).toBe(0);
		expect(res.failed).toBe(1);
		expect(m.rows.length).toBe(1);
		const row = m.rows[0]!;
		expect(row.attempts).toBe(1);
		expect(row.last_error).toContain('returned false');
		expect(row.next_attempt_at).toBeGreaterThan(m.clock); // backed off (not ready now)
	});

	test('drops a row after the attempts cap (default 5)', async () => {
		const m = new FakeMatrix();
		const q = new RagQueue(m).setIndexer(stubIndexer(() => false));
		await q.enqueue({ sectionTipo: 'dd_x', sectionId: 7 });
		// pre-age attempts to 4 so the next failure (→5) hits the cap and drops it.
		m.rows[0]!.attempts = 4;

		const res = await q.drain();
		expect(res.failed).toBe(1);
		expect(res.droppedAfterMaxAttempts).toBe(1);
		expect(m.rows.length).toBe(0);
	});

	test('a thrown indexer is treated as a retryable failure (not a crash)', async () => {
		const m = new FakeMatrix();
		const q = new RagQueue(m).setIndexer({
			async indexRecord() {
				throw new Error('boom');
			},
			async deleteRecord() {
				return true;
			},
		});
		await q.enqueue({ sectionTipo: 'dd_x', sectionId: 7 });
		const res = await q.drain();
		expect(res.failed).toBe(1);
		expect(m.rows[0]!.attempts).toBe(1); // backed off, not dropped
	});

	test('without an indexer, every record fails (retryable) — drain never throws', async () => {
		const m = new FakeMatrix();
		const q = new RagQueue(m); // no setIndexer
		await q.enqueue({ sectionTipo: 'dd_x', sectionId: 7 });
		const res = await q.drain();
		expect(res.processed).toBe(0);
		expect(res.failed).toBe(1);
	});
});

describe('RagQueue.stats', () => {
	test('reports pending / ready / blocked / failed counts', async () => {
		const m = new FakeMatrix();
		const q = new RagQueue(m);
		await q.enqueue({ sectionTipo: 'dd_x', sectionId: 1 });
		await q.enqueue({ sectionTipo: 'dd_x', sectionId: 2 });
		// block + fail row 2
		m.rows[1]!.attempts = 2;
		m.rows[1]!.next_attempt_at = m.clock + 100;

		const stats = await q.stats();
		expect(stats.pending).toBe(2);
		expect(stats.ready).toBe(1);
		expect(stats.blocked).toBe(1);
		expect(stats.failed).toBe(1);
		expect(stats.oldestAgeSec).not.toBeNull();
	});
});
