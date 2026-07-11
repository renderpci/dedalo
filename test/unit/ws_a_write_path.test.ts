/**
 * WS-A WRITE-PATH INTEGRITY GATES (audit REMEDIATION WS-A; scratch surfaces
 * only: matrix_test + zztws* counter tipos, cleaned up after each block).
 *
 *  1. S1-02 / DEC-01: two CONCURRENT saveComponentData calls to different
 *     items of the same component lose NEITHER edit — the tx-wrap makes the
 *     FOR UPDATE hold to COMMIT (the Wave-1 probe3_lost_update scenario,
 *     which reproduced the loss 6/6 before the fix).
 *  2. S2-01: a stale matrix_counter (squatter row above the counter value)
 *     self-heals — realign to GREATEST(value, MAX(section_id)) + one retry,
 *     the PHP 23505 posture (probe8 scenario).
 *  3. S2-14: a continuation leaked past withTransaction (an unawaited async
 *     started inside the callback) fails LOUD on its next query — the expired
 *     ambient handle throws and the statement is never sent (before the fix:
 *     timing-dependent autocommit on the released connection).
 *  4. S2-02: updateMatrixKeysData returns the affected-row count (a writer
 *     racing a record delete can detect the 0 instead of silently no-oping);
 *     and deleteSectionRecord's DB steps are ATOMIC — joined to an ambient
 *     transaction that rolls back, the record survives and no 'deleted' TM
 *     snapshot remains.
 *  5. S2-13: the RAG producers EXIST — an ordinary component save fires
 *     {kind:'index'} and a record delete fires {kind:'delete'} through the
 *     save_event hook (PHP class.section_record.php:988 enqueues both).
 *  6. S2-32 (WS-E wiring): pool saturation is observable — queries queueing
 *     for a pooled connection feed the db_pool_waits counter.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { getCounters } from '../../src/core/api/counters.ts';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import {
	insertMatrixRecordWithCounter,
	updateMatrixKeysData,
} from '../../src/core/db/matrix_write.ts';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import {
	type RagRecordEvent,
	registerRagRecordHook,
} from '../../src/core/section_record/save_event.ts';
import { cleanScratchRecord, cleanScratchTipo, createScratchRecord } from '../helpers/test_data.ts';

const TEST_TABLE = 'matrix_test';
/** Real ontology section resolving to matrix_test (see save_roundtrip.test.ts). */
const TEST_SECTION_TIPO = 'test2';
/** High ids keep us clear of genuine test records and other suites' scratch. */
const LOST_UPDATE_ID = 917031;
const RAG_SAVE_ID = 917032;
/** Scratch counter tipo for the self-heal scenario (rows + counter cleaned). */
const COUNTER_TIPO = 'zztws1';

/** Seed a matrix_test record whose string column carries two numisdata16 items. */
async function seedTwoItemRecord(sectionId: number): Promise<void> {
	await cleanScratchRecord(TEST_SECTION_TIPO, sectionId);
	await createScratchRecord(TEST_SECTION_TIPO, sectionId, {
		string: {
			numisdata16: [
				{ id: 1, lang: 'lg-spa', value: 'first-original' },
				{ id: 2, lang: 'lg-spa', value: 'second-original' },
			],
		},
	});
}

afterAll(async () => {
	await cleanScratchRecord(TEST_SECTION_TIPO, LOST_UPDATE_ID);
	await cleanScratchRecord(TEST_SECTION_TIPO, RAG_SAVE_ID);
	await cleanScratchTipo(COUNTER_TIPO);
});

// ---------------------------------------------------------------------------
// 1. S1-02 — concurrent saves: NO lost update.
// ---------------------------------------------------------------------------

describe('S1-02 — tx-wrapped save (DEC-01: stronger than the PHP oracle)', () => {
	test('two concurrent updates to different items of one component both land', async () => {
		await seedTwoItemRecord(LOST_UPDATE_ID);

		const saveItem = (id: number, value: string) =>
			saveComponentData({
				componentTipo: 'numisdata16', // input_text → string column, translatable
				sectionTipo: TEST_SECTION_TIPO,
				sectionId: LOST_UPDATE_ID,
				lang: 'lg-spa',
				changedData: [{ action: 'update', id, value: { id, lang: 'lg-spa', value } }],
				userId: -1,
			});

		// Fire both saves CONCURRENTLY (the Wave-1 probe interleave: both read,
		// both write — one edit lost 6/6 before the tx-wrap).
		const [first, second] = await Promise.all([
			saveItem(1, 'first-UPDATED'),
			saveItem(2, 'second-UPDATED'),
		]);
		expect(first.ok).toBe(true);
		expect(second.ok).toBe(true);

		const after = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, LOST_UPDATE_ID);
		const items = (after?.columns.string as Record<string, { id: number; value: string }[]>)
			?.numisdata16;
		const byId = new Map((items ?? []).map((item) => [Number(item.id), item.value]));
		// BOTH edits survived — the lost-update window is closed.
		expect(byId.get(1)).toBe('first-UPDATED');
		expect(byId.get(2)).toBe('second-UPDATED');
		expect(items?.length).toBe(2);
	}, 30000);
});

// ---------------------------------------------------------------------------
// 2. S2-01 — stale-counter self-heal (probe8 scenario).
// ---------------------------------------------------------------------------

describe('S2-01 — insertMatrixRecordWithCounter self-heals a lagging counter', () => {
	test('squatter row above the counter: realign + retry instead of wedging', async () => {
		await cleanScratchTipo(COUNTER_TIPO);

		// First create initializes the counter (value 1, row section_id 1).
		const firstId = await insertMatrixRecordWithCounter(TEST_TABLE, COUNTER_TIPO, {});
		expect(firstId).toBe(1);

		// External write the counter never saw (post-restore / PHP-side import):
		// a squatter at counter+1.
		await sql.unsafe(`INSERT INTO ${TEST_TABLE} (section_id, section_tipo) VALUES ($1, $2)`, [
			2,
			COUNTER_TIPO,
		]);

		// Before the fix: allocate 2 → unique violation → counter stuck at 2 →
		// EVERY create fails until an admin repairs the counter by hand.
		const healedId = await insertMatrixRecordWithCounter(TEST_TABLE, COUNTER_TIPO, {});
		expect(healedId).toBe(3); // realigned to MAX(2), retried once → 3

		const counter = (await sql.unsafe('SELECT value FROM matrix_counter WHERE tipo = $1', [
			COUNTER_TIPO,
		])) as { value: number }[];
		expect(Number(counter[0]?.value)).toBe(3); // counter healed past the squatter

		// And the next create is back to normal.
		expect(await insertMatrixRecordWithCounter(TEST_TABLE, COUNTER_TIPO, {})).toBe(4);
	}, 30000);
});

// ---------------------------------------------------------------------------
// 3. S2-14 — leaked continuation fails loud on the expired tx handle.
// ---------------------------------------------------------------------------

describe('S2-14 — withTransaction expires its ambient handle', () => {
	test('a query from a leaked continuation throws; the write is never sent', async () => {
		let leaked: Promise<unknown> | null = null;
		await withTransaction(async () => {
			await sql`SELECT 1`;
			// The leak: an async started inside the callback but NOT awaited —
			// the ALS store (and before the fix, the released tx connection)
			// propagates into it.
			leaked = (async () => {
				await Bun.sleep(80); // outlive the transaction
				return await sql.unsafe(
					`INSERT INTO ${TEST_TABLE} (section_id, section_tipo) VALUES ($1, $2)`,
					[990001, COUNTER_TIPO],
				);
			})();
		});
		expect(leaked).not.toBeNull();
		// Deterministic fail-loud (before: timing-dependent — the statement
		// could throw AND still autocommit on the released connection).
		await expect(leaked as unknown as Promise<unknown>).rejects.toThrow(/EXPIRED/);
		const rows = (await sql.unsafe(
			`SELECT 1 FROM ${TEST_TABLE} WHERE section_tipo = $1 AND section_id = $2`,
			[COUNTER_TIPO, 990001],
		)) as unknown[];
		expect(rows.length).toBe(0); // the leaked write never landed
	}, 30000);

	test('isInTransaction still reports true inside; helpers stay routable', async () => {
		const inside = await withTransaction(async () => {
			const { isInTransaction } = await import('../../src/core/db/postgres.ts');
			return isInTransaction();
		});
		expect(inside).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 4. S2-02 — delete atomicity + affected-row count.
// ---------------------------------------------------------------------------

describe('S2-02 — delete atomicity and racing-writer detection', () => {
	test('updateMatrixKeysData reports 1 for a live record, 0 for a vanished one', async () => {
		await seedTwoItemRecord(LOST_UPDATE_ID);
		const hit = await updateMatrixKeysData(TEST_TABLE, TEST_SECTION_TIPO, LOST_UPDATE_ID, [
			{ column: 'string', key: 'numisdata16', value: [{ id: 1, lang: 'lg-spa', value: 'x' }] },
		]);
		expect(hit).toBe(1);
		await cleanScratchRecord(TEST_SECTION_TIPO, LOST_UPDATE_ID);
		const miss = await updateMatrixKeysData(TEST_TABLE, TEST_SECTION_TIPO, LOST_UPDATE_ID, [
			{ column: 'string', key: 'numisdata16', value: [{ id: 1, lang: 'lg-spa', value: 'x' }] },
		]);
		expect(miss).toBe(0); // concurrently-deleted record is DETECTABLE (S2-02)
	}, 30000);

	test('deleteSectionRecord DB steps join ONE transaction: rollback restores everything', async () => {
		// test3 also resolves to matrix_test (the widget parity gate's fixture).
		const id = await createSectionRecord('test3', -1);
		try {
			await expect(
				withTransaction(async () => {
					const outcome = await deleteSectionRecord('test3', id, -1);
					expect(outcome.removed).toBe(true); // delete DID run…
					throw new Error('injected-crash-after-delete');
				}),
			).rejects.toThrow('injected-crash-after-delete');

			// …but the ambient rollback undid the WHOLE sequence (before S2-02,
			// the snapshot/TM/inverse-ref/DELETE steps were separate autocommits
			// and the record would be gone with a 'deleted' TM snapshot left).
			const record = await readMatrixRecord(TEST_TABLE, 'test3', id);
			expect(record).not.toBeNull();
			const tmRows = (await sql`
				SELECT 1 FROM matrix_time_machine
				WHERE section_tipo = 'test3' AND section_id = ${id} AND tipo = 'test3'
			`) as unknown[];
			expect(tmRows.length).toBe(0); // no orphaned 'deleted' snapshot
		} finally {
			await deleteSectionRecord('test3', id, -1).catch(() => {});
			await cleanScratchRecord('test3', id);
		}
	}, 30000);
});

// (4b retired at the 2026-07-11 cutover: the S2-05 coexistence advisory lock
// around item-id allocation is deleted with the PHP engine — TS↔TS safety is
// the single-statement atomic increment, gated by matrix_write_counter_gates.)

// ---------------------------------------------------------------------------
// 5. S2-13 — the RAG producers exist (index on save, delete on delete).
// ---------------------------------------------------------------------------

describe('S2-13 — RAG record events fire from the write/delete pipelines', () => {
	test('component save fires {kind:index}; record delete fires {kind:delete}', async () => {
		const events: RagRecordEvent[] = [];
		registerRagRecordHook(async (event) => {
			events.push(event);
		});
		try {
			await seedTwoItemRecord(RAG_SAVE_ID);
			const saved = await saveComponentData({
				componentTipo: 'numisdata16',
				sectionTipo: TEST_SECTION_TIPO,
				sectionId: RAG_SAVE_ID,
				lang: 'lg-spa',
				changedData: [
					{ action: 'update', id: 1, value: { id: 1, lang: 'lg-spa', value: 'rag-index-me' } },
				],
				userId: -1,
			});
			expect(saved.ok).toBe(true);
			expect(events).toContainEqual({
				kind: 'index',
				sectionTipo: TEST_SECTION_TIPO,
				sectionId: RAG_SAVE_ID,
			});

			const deleteId = await createSectionRecord('test3', -1);
			await deleteSectionRecord('test3', deleteId, -1);
			expect(events).toContainEqual({
				kind: 'delete',
				sectionTipo: 'test3',
				sectionId: deleteId,
			});
			await cleanScratchRecord('test3', deleteId);
		} finally {
			registerRagRecordHook(null);
		}
	}, 30000);
});

// ---------------------------------------------------------------------------
// 5b. S2-06 — dataframe fix-mode writes per KEY from a re-read, never a
//     full-column overwrite of the stale scan snapshot.
// ---------------------------------------------------------------------------

describe('S2-06 — fixDataframeOrphanEntries (per-key, re-read under lock)', () => {
	test('removes only the signed orphans; sibling keys and edited entries survive', async () => {
		const { fixDataframeOrphanEntries } = await import('../../src/core/relations/dataframe.ts');
		await cleanScratchRecord(TEST_SECTION_TIPO, LOST_UPDATE_ID);
		const orphan = {
			id_key: 99,
			type: 'dd490',
			section_id: '1',
			section_tipo: 'dd1706',
			main_component_tipo: 'test52',
			from_component_tipo: 'test218',
		};
		const paired = { ...orphan, id_key: 1 };
		const siblingKeyEntry = {
			section_id: '7',
			section_tipo: 'dd1706',
			from_component_tipo: 'test999',
		};
		await createScratchRecord(TEST_SECTION_TIPO, LOST_UPDATE_ID, {
			relation: { test218: [paired, orphan], test999: [siblingKeyEntry] },
		});

		// The scan works on rows READ FROM the DB (jsonb-canonical key order) —
		// mirror that: take the orphan object from a read-back, exactly as
		// dataframeControlScan hands it over.
		const seeded = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, LOST_UPDATE_ID);
		const seededEntries = (seeded?.columns.relation as Record<string, unknown[]>).test218 as {
			id_key: number;
		}[];
		const scannedOrphan = seededEntries.find((entry) => entry.id_key === 99) as Record<
			string,
			unknown
		>;

		// The scan snapshot listed TWO orphans — but one (id_key 98) does not
		// exist in the live row anymore (edited/removed since the scan): its
		// signature misses and only the byte-identical orphan is removed.
		const removed = await fixDataframeOrphanEntries(TEST_TABLE, TEST_SECTION_TIPO, LOST_UPDATE_ID, [
			scannedOrphan,
			{ ...scannedOrphan, id_key: 98 }, // drifted since the scan → left alone
		]);
		expect(removed).toBe(1);

		const after = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, LOST_UPDATE_ID);
		const relation = after?.columns.relation as Record<string, unknown[]>;
		// Orphan gone, paired frame kept.
		expect(relation.test218?.length).toBe(1);
		expect((relation.test218?.[0] as { id_key?: number }).id_key).toBe(1);
		// SIBLING component key untouched (per-key jsonb_set contract).
		expect(relation.test999).toEqual([siblingKeyEntry]);
		await cleanScratchRecord(TEST_SECTION_TIPO, LOST_UPDATE_ID);
	}, 30000);
});

// ---------------------------------------------------------------------------
// 6. S2-32 — pool saturation is observable (WS-E wiring, done by WS-A).
// ---------------------------------------------------------------------------

describe('S2-32 — pool acquire gate feeds the db_pool_waits counter', () => {
	test('queries queueing beyond DB_POOL_MAX record waits', async () => {
		const before = getCounters().db_pool_waits ?? 0;
		// 3x the default pool max (10) of slow-ish statements: some MUST queue.
		await Promise.all(Array.from({ length: 30 }, () => sql.unsafe('SELECT pg_sleep(0.03)', [])));
		const after = getCounters().db_pool_waits ?? 0;
		expect(after).toBeGreaterThan(before);
	}, 30000);
});
