import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { RagQueue, defaultMatrixQueryer, ensureRagQueueTable } from '../../src/ai/rag/queue.ts';
import type { RagIndexerLike } from '../../src/ai/rag/queue.ts';
import type { RecordLocator } from '../../src/ai/rag/types.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	fireRagRecordEvent,
	registerRagRecordHook,
} from '../../src/core/section_record/save_event.ts';

/**
 * Queue mechanics + the save-hook seam against the REAL matrix DB (dedalo7_mib),
 * Brick 3. Exercises the actual `rag_index_queue` table, the advisory-lock drain
 * on a reserved connection, and the record-write → enqueue wiring. Uses a unique
 * synthetic section so it never collides with real data; cleans up after itself.
 */

const TEST_SECTION = 'ragqueueitest99';

async function clean(): Promise<void> {
	await sql.unsafe('DELETE FROM rag_index_queue WHERE section_tipo = $1', [TEST_SECTION]);
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

describe('rag queue (dedalo7_mib rag_index_queue)', () => {
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
