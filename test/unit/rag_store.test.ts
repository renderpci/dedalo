import { afterAll, describe, expect, test } from 'bun:test';
import type { EmbeddingRow } from '../../src/ai/rag/types.ts';
import {
	deleteRecord,
	deleteStale,
	diffHashes,
	listSectionIds,
	ragSql,
	upsertEmbeddingRows,
} from '../../src/ai/rag/vector_store.ts';

/**
 * Store I/O against the REAL dedalo7_rag pgvector DB. Adapted from
 * `src/ai/rag2/test/rag_store_integration_php_port.test.ts` (Brick 2) to this
 * branch's functional store on Bun.sql. Uses a UNIQUE throwaway model + synthetic
 * section so it never collides with real data; drops its partition in teardown.
 *
 * NOTE: the rag2 reference DEFERRED the diffHashes round-trip (it had only ever
 * skipped, lacking a RAG DB). Here it runs and passes — the round-trip is exact.
 */

const TEST_MODEL = `ragstoretest${process.pid}`;
const TEST_SECTION = 'ragstoretest99';
const DIM = 4;

function row(
	sectionId: number,
	chunkIndex: number,
	embedding: number[],
	sourceHash: string,
	sourceText: string,
): EmbeddingRow {
	return {
		sectionTipo: TEST_SECTION,
		sectionId,
		componentTipo: 'c_text',
		lang: 'lg-eng',
		chunkIndex,
		provider: 'deterministic-test',
		model: TEST_MODEL,
		dimension: DIM,
		embedding,
		sourceHash,
		sourceText,
		tokenCount: 4,
		parentKey: null,
		chunkMeta: null,
	};
}

afterAll(async () => {
	// Drop the throwaway partition; do NOT close the shared ragSql pool (other rag
	// test files in the same process use it — left to process teardown).
	await ragSql.unsafe(`DROP TABLE IF EXISTS "rag_embeddings_${TEST_MODEL}"`).catch(() => {});
});

describe('vector store (dedalo7_rag pgvector)', () => {
	test('upsertEmbeddingRows creates the partition and writes rows atomically', async () => {
		await upsertEmbeddingRows([
			row(1, 0, [1, 0, 0, 0], 'hash-1', 'record one obverse'),
			row(2, 0, [0, 1, 0, 0], 'hash-2', 'record two reverse'),
		]);
		const ids = (await listSectionIds(TEST_SECTION)).sort((a, b) => a - b);
		expect(ids).toEqual([1, 2]);
	});

	test('diffHashes reflects stored hashes; re-upsert replaces (idempotent)', async () => {
		const locator = { sectionTipo: TEST_SECTION, sectionId: 3 };
		await upsertEmbeddingRows([row(3, 0, [1, 0, 0, 0], 'hash-A', 'first')]);
		let diff = await diffHashes(locator, TEST_MODEL);
		expect(diff.get('c_text|lg-eng|0')).toBe('hash-A');

		// Same natural key + new hash → replaces, not duplicates.
		await upsertEmbeddingRows([row(3, 0, [1, 0, 0, 0], 'hash-B', 'second')]);
		diff = await diffHashes(locator, TEST_MODEL);
		expect(diff.size).toBe(1);
		expect(diff.get('c_text|lg-eng|0')).toBe('hash-B');
	});

	test('deleteStale prunes the tail from a chunk_index floor', async () => {
		const locator = { sectionTipo: TEST_SECTION, sectionId: 6 };
		await upsertEmbeddingRows([
			row(6, 0, [1, 0, 0, 0], 'h0', 'chunk zero'),
			row(6, 1, [0, 1, 0, 0], 'h1', 'chunk one'),
			row(6, 2, [0, 0, 1, 0], 'h2', 'chunk two'),
		]);
		// value shrank to 1 chunk → prune chunk_index >= 1.
		const removed = await deleteStale(locator, 'c_text', 'lg-eng', TEST_MODEL, 1);
		expect(removed).toBe(2);
		expect((await diffHashes(locator, TEST_MODEL)).size).toBe(1);
	});

	test('deleteRecord removes ALL chunks for a record', async () => {
		const locator = { sectionTipo: TEST_SECTION, sectionId: 4 };
		await upsertEmbeddingRows([
			row(4, 0, [1, 0, 0, 0], 'd0', 'chunk zero'),
			row(4, 1, [0, 1, 0, 0], 'd1', 'chunk one'),
		]);
		expect((await diffHashes(locator, TEST_MODEL)).size).toBe(2);
		await deleteRecord(locator);
		expect((await diffHashes(locator, TEST_MODEL)).size).toBe(0);
	});
});
