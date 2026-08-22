import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { RagIndexerLike } from '../../src/ai/rag/queue.ts';
import { defaultMatrixQueryer, ensureRagQueueTable, RagQueue } from '../../src/ai/rag/queue.ts';
import type { RecordLocator } from '../../src/ai/rag/types.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	fireRagRecordEvent,
	registerRagRecordHook,
} from '../../src/core/section_record/save_event.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

/**
 * Queue mechanics + the save-hook seam against the SUITE matrix DB, Brick 3.
 * Exercises the actual `rag_index_queue` table, the advisory-lock drain on a
 * reserved connection, and the record-write → enqueue wiring.
 *
 * clean() OWNS THE WHOLE TABLE, not just this file's rows. drain() is global by
 * contract — it processes every ready marker — so a section-scoped clean left
 * `result.processed` counting whatever markers sibling gates had enqueued in the
 * same run (measured: 2 own + 10 foreign = 12). Table-wide is what makes
 * `processed === 2` a statement about the ENGINE. Safe because the suite
 * database is marked and disposable; assertTestDatabase refuses any other.
 */

const TEST_SECTION = 'test99ragqueue';

async function clean(): Promise<void> {
	await assertTestDatabase('rag_queue_integration.clean');
	await sql.unsafe('DELETE FROM rag_index_queue');
}

async function rowsFor(): Promise<{ section_id: number; op: string; attempts: number }[]> {
	return (await sql.unsafe(
		'SELECT section_id, op, attempts FROM rag_index_queue WHERE section_tipo = $1 ORDER BY section_id',
		[TEST_SECTION],
	)) as { section_id: number; op: string; attempts: number }[];
}

/** A spy indexer whose verdict is fixed; records the locators it saw. */
function spyIndexer(verdict: boolean, seen: RecordLocator[]): RagIndexerLike {
	return {
		async indexRecord(locator) {
			seen.push(locator);
			return verdict;
		},
		async deleteRecord(locator) {
			seen.push(locator);
			return verdict;
		},
	};
}

beforeAll(async () => {
	await ensureRagQueueTable();
	await clean();
});

afterAll(async () => {
	await clean();
	registerRagRecordHook(null); // don't leak the hook into other suites
	// Do NOT close the shared matrix `sql` pool (other suites use it).
});

describe('rag queue (suite rag_index_queue)', () => {
	test('enqueue → drain indexes ready markers and removes them', async () => {
		const seen: RecordLocator[] = [];
		const queue = new RagQueue(defaultMatrixQueryer()).setIndexer(spyIndexer(true, seen));

		await queue.enqueue({ sectionTipo: TEST_SECTION, sectionId: 11 }, 'index');
		await queue.enqueue({ sectionTipo: TEST_SECTION, sectionId: 12 }, 'delete');
		expect((await rowsFor()).length).toBe(2);

		const result = await queue.drain({ batch: 50 });
		expect(result.ranSingleFlight).toBe(true);
		expect(result.processed).toBe(2);
		expect((await rowsFor()).length).toBe(0);
		expect(seen.map((l) => l.sectionId).sort((a, b) => a - b)).toEqual([11, 12]);
	});

	test('a failing index backs off (attempts++, marker retained)', async () => {
		await clean();
		const queue = new RagQueue(defaultMatrixQueryer()).setIndexer(spyIndexer(false, []));
		await queue.enqueue({ sectionTipo: TEST_SECTION, sectionId: 13 }, 'index');

		const result = await queue.drain({ batch: 50 });
		expect(result.processed).toBe(0);
		expect(result.failed).toBe(1);
		const rows = await rowsFor();
		expect(rows.length).toBe(1);
		expect(rows[0]!.attempts).toBe(1); // backed off, not dropped
	});

	test('the save-event hook enqueues into the real queue', async () => {
		await clean();
		const queue = new RagQueue(defaultMatrixQueryer());
		registerRagRecordHook((event) =>
			queue.enqueue({ sectionTipo: event.sectionTipo, sectionId: event.sectionId }, event.kind),
		);

		await fireRagRecordEvent({ kind: 'index', sectionTipo: TEST_SECTION, sectionId: 21 });
		await fireRagRecordEvent({ kind: 'delete', sectionTipo: TEST_SECTION, sectionId: 22 });

		const rows = await rowsFor();
		expect(rows.map((r) => r.section_id)).toEqual([21, 22]);
		expect(rows.find((r) => r.section_id === 22)!.op).toBe('delete');
	});
});
