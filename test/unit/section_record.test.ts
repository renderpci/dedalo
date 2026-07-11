/**
 * section_record chokepoint gate (Wave 0 of the section_record rebuild).
 *
 * Covers, against the real dev DB (matrix_test, reserved coordinates):
 *   - persistRecordKeys: component value + dd197/dd201 modified-audit stamps
 *     land in ONE call (PHP save_component_data merge);
 *   - audit skip rules: audit=false, Activity section (dd542), userId 0;
 *   - key removal (value null) + EMPTY-COLUMN PRUNING to SQL NULL
 *     (PHP save_key_data columns_to_delete rule);
 *   - multi-key writes in one savePath (same and different columns);
 *   - persistRecordColumns: whole-column write + audit merge + RAG seam;
 *   - virtual_record: model→column routing, null-removes-key, rawText
 *     voiding, clone isolation, virtual markers, section_id refusal.
 *
 * Cleanup runs before AND after — a crashed previous run must not poison the
 * next one (same pattern as matrix_write_roundtrip.test.ts).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { deleteMatrixRecord, updateMatrixRecord } from '../../src/core/db/matrix_write.ts';
import {
	buildModifiedAuditWrites,
	cloneRecord,
	injectComponentData,
	isVirtualRecord,
	makeVirtualRecord,
	persistModifiedStamp,
	persistRecordColumns,
	persistRecordKeys,
	registerRagRecordHook,
} from '../../src/core/section_record/index.ts';
import type { RagRecordEvent } from '../../src/core/section_record/index.ts';

/** Reserved coordinates in matrix_test — collide with nothing real. */
const TEST_TABLE = 'matrix_test';
const TEST_SECTION_TIPO = 'testsr1';
const TEST_SECTION_ID = 900002;

const target = {
	table: TEST_TABLE,
	sectionTipo: TEST_SECTION_TIPO,
	sectionId: TEST_SECTION_ID,
};

async function cleanupTestRecord(): Promise<void> {
	await deleteMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
	registerRagRecordHook(null);
}

/** Seed a fresh row with one string item so update paths hit the UPDATE branch. */
async function seedRecord(): Promise<void> {
	await cleanupTestRecord();
	await updateMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID, {
		string: { test1: [{ id: 1, value: 'seed', lang: 'lg-eng' }] },
	});
}

describe('persistRecordKeys — the write chokepoint (real DB)', () => {
	beforeAll(cleanupTestRecord);
	afterAll(cleanupTestRecord);

	test('component value + modified-audit stamps land together (PHP save_component_data)', async () => {
		await seedRecord();
		const now = new Date(2026, 6, 4, 12, 30, 45); // fixed for a deterministic dd201
		await persistRecordKeys(
			target,
			[{ column: 'string', key: 'test1', value: [{ id: 1, value: 'edited', lang: 'lg-eng' }] }],
			{ userId: 7, now },
		);

		const row = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		const stringColumn = row?.columns.string as Record<string, unknown>;
		expect(stringColumn.test1).toEqual([{ id: 1, value: 'edited', lang: 'lg-eng' }]);

		// dd197: the modified-by-user locator (PHP build_modification_data shape).
		const relation = row?.columns.relation as Record<string, unknown>;
		expect(relation.dd197).toEqual([
			{
				id: 1,
				type: 'dd151',
				section_id: '7',
				section_tipo: 'dd128',
				from_component_tipo: 'dd197',
			},
		]);

		// dd201: the modified virtual date.
		const dateColumn = row?.columns.date as Record<string, unknown>;
		const dd201 = dateColumn.dd201 as { id: number; lang: string; start: { year: number } }[];
		expect(dd201).toHaveLength(1);
		expect(dd201[0]?.id).toBe(1);
		expect(dd201[0]?.lang).toBe('lg-nolan');
		expect(dd201[0]?.start.year).toBe(2026);
	});

	test('audit=false writes ONLY the savePath (PHP plain save_key_data)', async () => {
		await seedRecord();
		await persistRecordKeys(
			target,
			[{ column: 'number', key: 'test2', value: [{ id: 1, value: 42 }] }],
			false,
		);
		const row = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		expect((row?.columns.number as Record<string, unknown>).test2).toEqual([{ id: 1, value: 42 }]);
		expect(row?.columns.relation).toBeNull();
		expect(row?.columns.date).toBeNull();
	});

	test('Activity section and userId 0 skip the stamps (PHP :1584)', async () => {
		// Pure rule: the Activity section never gets modification stamps.
		expect(buildModifiedAuditWrites('dd542', { userId: 5 })).toEqual([]);
		expect(buildModifiedAuditWrites(TEST_SECTION_TIPO, { userId: 0 })).toEqual([]);
		expect(buildModifiedAuditWrites(TEST_SECTION_TIPO, false)).toEqual([]);

		await seedRecord();
		await persistRecordKeys(
			target,
			[{ column: 'string', key: 'test1', value: [{ id: 1, value: 'x', lang: 'lg-eng' }] }],
			{ userId: 0 },
		);
		const row = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		expect(row?.columns.relation).toBeNull();
		expect(row?.columns.date).toBeNull();
	});

	test('null value removes the key with PHP end-state semantics (oracle-verified)', async () => {
		await seedRecord();
		// Two keys in 'string', remove one → key gone, sibling survives.
		await persistRecordKeys(
			target,
			[{ column: 'string', key: 'test2', value: [{ id: 1, value: 'second', lang: 'lg-eng' }] }],
			false,
		);
		await persistRecordKeys(target, [{ column: 'string', key: 'test2', value: null }], false);
		let row = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		const stringColumn = row?.columns.string as Record<string, unknown>;
		expect(stringColumn.test2).toBeUndefined();
		expect(stringColumn.test1).toBeDefined();

		// Remove the LAST key → the column keeps '{}' (the PHP update_by_key
		// contract, confirmed against the live oracle by delete_data_differential).
		await persistRecordKeys(target, [{ column: 'string', key: 'test1', value: null }], false);
		row = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		expect(row?.columns.string).toEqual({});
		expect(row?.rawText.string).toBe('{}');

		// Removing a key from a NULL column leaves it NULL (the PHP save_key_data
		// "columns_to_delete" guard — '{}' is never materialized by a removal).
		await persistRecordKeys(target, [{ column: 'number', key: 'test9', value: null }], false);
		row = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		expect(row?.columns.number).toBeNull();
		expect(row?.rawText.number).toBeNull();
	});

	test('multi-key savePath: same column and cross-column in one call', async () => {
		await seedRecord();
		await persistRecordKeys(
			target,
			[
				{ column: 'string', key: 'test2', value: [{ id: 1, value: 'a', lang: 'lg-eng' }] },
				{ column: 'string', key: 'test3', value: [{ id: 1, value: 'b', lang: 'lg-eng' }] },
				{ column: 'number', key: 'test4', value: [{ id: 1, value: 9 }] },
			],
			false,
		);
		const row = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		const stringColumn = row?.columns.string as Record<string, unknown>;
		expect(stringColumn.test2).toEqual([{ id: 1, value: 'a', lang: 'lg-eng' }]);
		expect(stringColumn.test3).toEqual([{ id: 1, value: 'b', lang: 'lg-eng' }]);
		expect((row?.columns.number as Record<string, unknown>).test4).toEqual([{ id: 1, value: 9 }]);
	});

	test('empty savePath is refused', async () => {
		await expect(persistRecordKeys(target, [], false)).rejects.toThrow('empty savePath');
	});
});

describe('S2-02 fail-loud: save racing a delete (real DB, scratch row)', () => {
	beforeAll(cleanupTestRecord);
	afterAll(cleanupTestRecord);

	test('persistRecordKeys THROWS when the record was concurrently deleted', async () => {
		await seedRecord();
		// The race: the record is deleted between the caller's read and its write.
		await deleteMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		await expect(
			persistRecordKeys(
				target,
				[{ column: 'string', key: 'test1', value: [{ id: 1, value: 'lost?', lang: 'lg-eng' }] }],
				{ userId: 7 },
			),
		).rejects.toThrow('deleted concurrently');
		// Nothing was silently resurrected.
		const row = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		expect(row).toBeNull();
	});

	test('persistModifiedStamp THROWS on a deleted record (no silent ok)', async () => {
		await seedRecord();
		await deleteMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		await expect(persistModifiedStamp(target, { userId: 7 })).rejects.toThrow(
			'deleted concurrently',
		);
	});

	test('persistModifiedStamp stays a no-op when the stamps themselves are skipped', async () => {
		// userId 0 produces no writes (PHP :1584) — the existence check must not
		// fire for a write that never happens.
		await deleteMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		await expect(persistModifiedStamp(target, { userId: 0 })).resolves.toBeUndefined();
	});
});

describe('persistRecordColumns — whole-column writes (real DB)', () => {
	beforeAll(cleanupTestRecord);
	afterAll(cleanupTestRecord);

	test('writes provided columns, merges audit stamps, fires the RAG seam', async () => {
		await seedRecord();
		const ragEvents: RagRecordEvent[] = [];
		registerRagRecordHook(async (event) => {
			ragEvents.push(event);
		});

		const now = new Date(2026, 6, 4, 9, 0, 0);
		const result = await persistRecordColumns(
			target,
			{
				string: { test1: [{ id: 1, value: 'restored', lang: 'lg-eng' }] },
				relation: { test5: [{ section_tipo: 'testsr1', section_id: 3 }] },
				date: null,
			},
			{ userId: 3, now },
		);
		expect(result).toBe('updated');

		const row = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		const relation = row?.columns.relation as Record<string, unknown>;
		// caller content survives the audit merge...
		expect(relation.test5).toEqual([{ section_tipo: 'testsr1', section_id: 3 }]);
		// ...and dd197 is merged in.
		expect(relation.dd197).toBeDefined();
		// audit dd201 merged into the null-provided date column (bag created).
		expect((row?.columns.date as Record<string, unknown>).dd201).toBeDefined();

		expect(ragEvents).toEqual([
			{ kind: 'index', sectionTipo: TEST_SECTION_TIPO, sectionId: TEST_SECTION_ID },
		]);
		registerRagRecordHook(null);
	});

	test('a failing RAG hook never fails the write (PHP best-effort posture)', async () => {
		await seedRecord();
		registerRagRecordHook(async () => {
			throw new Error('rag backend down');
		});
		const result = await persistRecordColumns(
			target,
			{ string: { test1: [{ id: 1, value: 'still ok', lang: 'lg-eng' }] } },
			false,
		);
		expect(result).toBe('updated');
		registerRagRecordHook(null);
	});
});

describe('write-chokepoint grep gate', () => {
	/**
	 * Direct updateMatrixKeyData callers OUTSIDE the chokepoint. Every entry is a
	 * DELIBERATE exception with a PHP-faithful reason; a new caller must either
	 * use persistRecordKeys (section_record/record_write.ts) or join this list
	 * with a reason:
	 *  - ontology/hierarchy provisioning + ts tree engine: PHP writes these via
	 *    unstamped save()/its own verified engine (tree rebuild has its own gates);
	 *  - relations engine: separately parity-verified strangler-fig subsystem;
	 *  - files_info_persist: documented no-TM/no-stamp technical-metadata write.
	 */
	const ALLOWED_DIRECT_CALLERS = [
		'src/core/db/matrix_write.ts', // the definition + single-key wrapper
		'src/core/section_record/record_write.ts', // the chokepoint itself
		'src/core/ts_object/ts_api.ts',
		'src/core/ontology/hierarchy_provision.ts',
		'src/core/relations/parent.ts',
		'src/core/relations/save.ts',
		'src/core/relations/dataframe.ts', // fixDataframeOrphanEntries: maintenance fix-mode, no-TM/no-stamp per-key strip (S2-06)
		'src/core/ontology/ontology_write.ts',
		'src/core/media/tools/files_info_persist.ts',
		// portalize_data executor (UPDATE_PROCESS Phase 5, WC-025): a deliberate
		// matrix-COLUMN-level transform — copies component data to a new record,
		// nulls the source keys, relocates TM with save_tm suppressed by design
		// (no new snapshots). EXECUTE-gated behind the update-engine
		// standalone-ownership COEX gate; never a request-path write.
		'src/core/update/transform/portalize.ts',
	];

	test('no new direct updateMatrixKeyData callers appear outside the allowlist', async () => {
		const { Glob } = await import('bun');
		const root = new URL('../../', import.meta.url).pathname;
		const offenders: string[] = [];
		for await (const file of new Glob('{src,tools}/**/*.ts').scan(root)) {
			const content = await Bun.file(`${root}${file}`).text();
			// Match usage (call or import), not mentions in comments — a plain
			// substring check is enough to force a conscious decision either way.
			if (/\bupdateMatrixKeysData?\(/.test(content) && !ALLOWED_DIRECT_CALLERS.includes(file)) {
				offenders.push(file);
			}
		}
		expect(offenders).toEqual([]);
	});
});

describe('virtual_record — substitution API (pure)', () => {
	test('routes items into the model-mapped column, keyed by tipo', () => {
		const record = makeVirtualRecord('dd15', 12345);
		expect(isVirtualRecord(record)).toBe(true);

		injectComponentData(record, 'test6', 'component_input_text', [{ id: 1, value: 'hello' }]);
		injectComponentData(record, 'test7', 'component_portal', [
			{ section_tipo: 'testsr1', section_id: 1 },
		]);
		injectComponentData(record, 'test8', 'component_number', [{ id: 1, value: 3 }]);

		expect((record.columns.string as Record<string, unknown>).test6).toEqual([
			{ id: 1, value: 'hello' },
		]);
		expect((record.columns.relation as Record<string, unknown>).test7).toEqual([
			{ section_tipo: 'testsr1', section_id: 1 },
		]);
		expect((record.columns.number as Record<string, unknown>).test8).toEqual([{ id: 1, value: 3 }]);
	});

	test('null removes the key; injection voids the rawText twin', () => {
		const record = makeVirtualRecord('dd15', 1);
		record.rawText.string = '{"test6": [{"id": 1}]}'; // pretend a DB twin existed
		injectComponentData(record, 'test6', 'component_input_text', [{ id: 1 }]);
		expect(record.rawText.string).toBeNull();
		injectComponentData(record, 'test6', 'component_input_text', null);
		expect((record.columns.string as Record<string, unknown>).test6).toBeUndefined();
	});

	test('unknown model and component_section_id are refused', () => {
		const record = makeVirtualRecord('dd15', 1);
		expect(() => injectComponentData(record, 'test9', 'component_bogus', [])).toThrow(
			'no matrix column',
		);
		expect(() => injectComponentData(record, 'test9', 'component_section_id', [])).toThrow(
			'non-jsonb column',
		);
	});

	test('cloneRecord isolates grafts from the shared original', () => {
		const original = makeVirtualRecord('testsr1', 5);
		injectComponentData(original, 'test6', 'component_input_text', [{ id: 1, value: 'shared' }]);

		const copy = cloneRecord(original);
		injectComponentData(copy, 'test6', 'component_input_text', [{ id: 1, value: 'grafted' }]);
		injectComponentData(copy, 'test7', 'component_number', [{ id: 1, value: 99 }]);

		expect((original.columns.string as Record<string, unknown>).test6).toEqual([
			{ id: 1, value: 'shared' },
		]);
		expect(original.columns.number).toBeUndefined();
	});
});
