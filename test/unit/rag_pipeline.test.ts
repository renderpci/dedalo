/**
 * Phase 8 gate: the TS RAG seam — index → hybrid retrieve → ACL.
 *
 * Runs fully OFFLINE via the deterministic hash embedder (no API keys): two
 * real records are created in the disposable test section, their texts
 * indexed into the pgvector store, then retrieved with the hybrid
 * (dense+lexical, RRF) search. The ACL gate is the DoD assertion: a user the
 * human API denies gets NOTHING from the same query. Everything created is
 * removed afterwards.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { indexComponentText, semanticSearch } from '../../src/ai/rag/retrieval.ts';
import { deleteRecordChunks, ragSql } from '../../src/ai/rag/vector_store.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

const SECTION_TIPO = 'test2';
const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const NO_ACCESS: Principal = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };

const createdIds: number[] = [];

beforeAll(async () => {
	// Two records with clearly different vocabularies.
	const coinId = await createSectionRecord(SECTION_TIPO, -1);
	const shipId = await createSectionRecord(SECTION_TIPO, -1);
	createdIds.push(coinId, shipId);

	await indexComponentText({
		section_tipo: SECTION_TIPO,
		section_id: coinId,
		component_tipo: 'numisdata16',
		lang: 'lg-spa',
		text: 'Moneda ibérica de bronce acuñada en la ceca de Abariltur, con jinete y leyenda ibérica.',
	});
	await indexComponentText({
		section_tipo: SECTION_TIPO,
		section_id: shipId,
		component_tipo: 'numisdata16',
		lang: 'lg-spa',
		text: 'Naufragio de un barco fenicio con ánforas de aceite frente a la costa de Cartagena.',
	});
});

afterAll(async () => {
	for (const id of createdIds) {
		await deleteRecordChunks(SECTION_TIPO, id);
		await cleanScratchRecord(SECTION_TIPO, id);
	}
	// Do NOT close the shared module-level ragSql pool here: other rag test files
	// in the same Bun process use it. Like the matrix `sql` pool, it is left to
	// process teardown. (Closing it mid-suite broke concurrently-running files.)
});

describe('RAG pipeline (Phase 8 gate — offline deterministic provider)', () => {
	test('hybrid retrieval ranks the vocabulary-matching record first', async () => {
		const coinHits = await semanticSearch(SUPERUSER, 'moneda de bronce con jinete ceca', 5);
		expect(coinHits.length).toBeGreaterThan(0);
		expect(coinHits[0]?.section_id).toBe(createdIds[0] as number);
		expect(coinHits[0]?.snippet).toContain('Abariltur');

		const shipHits = await semanticSearch(SUPERUSER, 'barco fenicio ánforas naufragio', 5);
		expect(shipHits.length).toBeGreaterThan(0);
		expect(shipHits[0]?.section_id).toBe(createdIds[1] as number);
	});

	test('a user the human API denies gets NOTHING from the same query (DoD)', async () => {
		const denied = await semanticSearch(NO_ACCESS, 'moneda de bronce con jinete ceca', 5);
		expect(denied).toEqual([]);
	});

	test('re-indexing a record replaces its chunks (no duplicates)', async () => {
		await indexComponentText({
			section_tipo: SECTION_TIPO,
			section_id: createdIds[0] as number,
			component_tipo: 'numisdata16',
			lang: 'lg-spa',
			text: 'Moneda ibérica de bronce acuñada en la ceca de Abariltur, con jinete y leyenda ibérica.',
		});
		const rows = (await ragSql.unsafe(
			'SELECT count(*)::int AS c FROM rag_embeddings WHERE section_tipo = $1 AND section_id = $2',
			[SECTION_TIPO, createdIds[0]],
		)) as { c: number }[];
		expect(rows[0]?.c).toBe(1); // one short text → one chunk, replaced not appended
	});
});
