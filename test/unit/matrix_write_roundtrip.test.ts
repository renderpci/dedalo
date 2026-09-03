/**
 * Phase 2 gate (plan A3): full WRITE round-trip through the TS write path.
 *
 * Clones a real, component-rich record's columns into matrix_test (the
 * dedicated test table) under a reserved test section_tipo, reads it back, and
 * requires every jsonb column's canonical ::text to be byte-identical to the
 * source. Exercises: UPDATE→INSERT upsert fallback, raw-text passthrough,
 * codec-encoded writes, delete.
 *
 * Cleanup runs before AND after — a crashed previous run must not poison the
 * next one.
 */
// Migrated to the generic `test` TLD 2026-08-19: the clone SOURCE is the gate's
// own `testmint1` corpus record (provisioned/dropped here), not whatever record
// an install happens to hold.
//
// P1-15 (T2, one writer per family): the three doors that absorbed DML from
// save_component.ts / activity_log.ts / update/engine.ts are proven here by
// BYTES and BEHAVIOUR — the static gates (sql_confinement T2, ws_a GATE-18)
// see that the statements moved, this gate sees that they still write what
// their callers wrote: an atomic append survives a concurrent append, a
// sequence-id row is readable through readMatrixRecord with its jsonb intact
// (no double encoding), and a matrix_updates row lands as one object.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { MATRIX_JSONB_COLUMNS, readMatrixRecord } from '../../src/core/db/matrix.ts';
import {
	appendMatrixKeyItems,
	appendMatrixUpdateRow,
	deleteMatrixRecord,
	insertMatrixRowSequenceId,
	updateMatrixRecord,
} from '../../src/core/db/matrix_write.ts';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import {
	dropTestCorpus,
	ensureTestCorpus,
	TEST_CORPUS_TABLE,
} from '../../src/core/test_data/test_corpus/ensure.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

/** Reserved coordinates in matrix_test — 'testrt1' matches the tipo grammar and collides with nothing. */
const TEST_TABLE = TEST_CORPUS_TABLE;
/** The clone SOURCE: a corpus record this gate provisions itself. */
const SOURCE_SECTION_TIPO = 'testmint1';
const SOURCE_SECTION_ID = 1;
const TEST_SECTION_TIPO = 'testrt1';
const TEST_SECTION_ID = 900001;

async function cleanupTestRecord(): Promise<void> {
	await cleanScratchRecord(TEST_SECTION_TIPO, TEST_SECTION_ID);
}

describe('matrix write round-trip (Phase 2 gate, real DB)', () => {
	beforeAll(async () => {
		await ensureTestCorpus([SOURCE_SECTION_TIPO]);
		await cleanupTestRecord();
	});
	afterAll(async () => {
		await cleanupTestRecord();
		expect(await dropTestCorpus([SOURCE_SECTION_TIPO])).toBe(0);
	});

	test('clone a real record via raw-text passthrough → byte-identical columns', async () => {
		// A real, component-rich record — the gate's own corpus row.
		const source = await readMatrixRecord(TEST_TABLE, SOURCE_SECTION_TIPO, SOURCE_SECTION_ID);
		expect(source).not.toBeNull();

		// Build the write payload from the source's raw canonical text.
		const values: Record<string, string | null> = {};
		for (const column of MATRIX_JSONB_COLUMNS) {
			values[column] = source?.rawText[column] ?? null;
		}

		// First write hits the INSERT branch (record does not exist yet).
		const firstWrite = await updateMatrixRecord(
			TEST_TABLE,
			TEST_SECTION_TIPO,
			TEST_SECTION_ID,
			values,
			{ rawTextPassthrough: true },
		);
		expect(firstWrite).toBe('inserted');

		// Read back and compare every column's canonical text byte-for-byte.
		const clone = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		expect(clone).not.toBeNull();
		for (const column of MATRIX_JSONB_COLUMNS) {
			expect(clone?.rawText[column] ?? null).toBe(source?.rawText[column] ?? null);
		}
	});

	test('second write hits the UPDATE branch and codec-encoded values land correctly', async () => {
		const componentData = {
			testcomp1: [{ id: 1, value: 'codec-written value', lang: 'lg-spa' }],
		};
		const secondWrite = await updateMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID, {
			string: componentData,
			misc: null,
		});
		expect(secondWrite).toBe('updated');

		const readBack = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		expect(readBack?.columns.string).toEqual(componentData);
		expect(readBack?.rawText.misc ?? null).toBeNull();
	});

	test('independent client (psql-equivalent) sees exactly what TS wrote', async () => {
		// Cross-check through a separate query path (not readMatrixRecord):
		// the jsonb value as Postgres canonical text.
		const [row] = (await sql.unsafe(
			`SELECT string::text AS string_text FROM ${TEST_TABLE}
			 WHERE section_tipo = $1 AND section_id = $2`,
			[TEST_SECTION_TIPO, TEST_SECTION_ID],
		)) as { string_text: string }[];
		expect(row).toBeDefined();
		expect(JSON.parse((row as { string_text: string }).string_text)).toEqual({
			testcomp1: [{ id: 1, value: 'codec-written value', lang: 'lg-spa' }],
		});
	});

	test('delete removes exactly the test record', async () => {
		const deletedCount = await deleteMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		expect(deletedCount).toBe(1);
		const gone = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		expect(gone).toBeNull();
	});

	test('write path refuses non-allowlisted columns and empty payloads', async () => {
		await expect(
			updateMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID, {
				// biome-ignore lint/suspicious/noExplicitAny: deliberately hostile input
				['section_tipo; DROP TABLE matrix;--' as any]: {},
			}),
		).rejects.toThrow(/allowlisted jsonb column/);
		await expect(
			updateMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID, {}),
		).rejects.toThrow(/empty values/);
	});
});

describe('T2 doors moved into matrix_write.ts (P1-15) — bytes and behaviour', () => {
	const SEQUENCE_ID_TABLE = 'matrix_activity';
	const ACTIVITY_SECTION_TIPO = 'testrt2';
	const allocated: number[] = [];

	beforeAll(async () => {
		await cleanupTestRecord();
	});
	afterAll(async () => {
		await cleanupTestRecord();
		for (const sectionId of allocated) {
			await deleteMatrixRecord(SEQUENCE_ID_TABLE, ACTIVITY_SECTION_TIPO, sectionId);
		}
		await sql`DELETE FROM matrix_updates WHERE data ? 'zz_roundtrip_probe'`;
	});

	test('appendMatrixKeyItems: two CONCURRENT appends to the same key both survive (no lost update)', async () => {
		await updateMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID, {
			string: { testcomp1: [{ id: 1, value: 'first', lang: 'lg-spa' }] },
		});
		// Two transactions append at once: a read-modify-write would keep one.
		await Promise.all([
			withTransaction(() =>
				appendMatrixKeyItems(
					TEST_TABLE,
					TEST_SECTION_TIPO,
					TEST_SECTION_ID,
					'string',
					'testcomp1',
					[{ id: 2, value: 'second', lang: 'lg-spa' }],
				),
			),
			withTransaction(() =>
				appendMatrixKeyItems(
					TEST_TABLE,
					TEST_SECTION_TIPO,
					TEST_SECTION_ID,
					'string',
					'testcomp1',
					[{ id: 3, value: 'third', lang: 'lg-spa' }],
				),
			),
		]);
		const readBack = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		const items = (readBack?.columns.string as { testcomp1: { id: number }[] }).testcomp1;
		expect(items.map((item) => item.id).sort()).toEqual([1, 2, 3]);
		// A missing key is created ('[]' || items), a NULL column materializes '{}'.
		expect(
			await appendMatrixKeyItems(
				TEST_TABLE,
				TEST_SECTION_TIPO,
				TEST_SECTION_ID,
				'misc',
				'testcomp2',
				[{ id: 1, value: 'x' }],
			),
		).toBe(1);
		const again = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		expect(again?.columns.misc).toEqual({ testcomp2: [{ id: 1, value: 'x' }] });
		// 0 rows when the record is not there; refusals for a bad column / key / empty payload.
		expect(
			await appendMatrixKeyItems(
				TEST_TABLE,
				TEST_SECTION_TIPO,
				TEST_SECTION_ID + 1,
				'misc',
				'testcomp2',
				[{}],
			),
		).toBe(0);
		await expect(
			appendMatrixKeyItems(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID, 'misc', 'not a tipo', [
				{},
			]),
		).rejects.toThrow(/tipo grammar/);
		await expect(
			appendMatrixKeyItems(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID, 'misc', 'testcomp2', []),
		).rejects.toThrow(/empty items/);
	});

	test('insertMatrixRowSequenceId: the table allocates section_id; the jsonb lands once-encoded', async () => {
		const relation = {
			testcomp3: [
				{ type: 'dd151', section_id: 7, section_tipo: 'test1', from_component_tipo: 'testcomp3' },
			],
		};
		const stringColumn = { testcomp4: [{ lang: 'lg-nolan', value: 'héllo "quoted" \\ slash' }] };
		const first = await insertMatrixRowSequenceId(SEQUENCE_ID_TABLE, ACTIVITY_SECTION_TIPO, {
			relation,
			string: stringColumn,
			misc: null,
		});
		allocated.push(first);
		expect(Number.isInteger(first)).toBe(true);
		const second = await insertMatrixRowSequenceId(SEQUENCE_ID_TABLE, ACTIVITY_SECTION_TIPO, {
			string: stringColumn,
		});
		allocated.push(second);
		expect(second).toBeGreaterThan(first);
		const row = await readMatrixRecord(SEQUENCE_ID_TABLE, ACTIVITY_SECTION_TIPO, first);
		expect(row?.columns.relation).toEqual(relation);
		expect(row?.columns.string).toEqual(stringColumn);
		expect(row?.rawText.misc ?? null).toBeNull();
		// The canonical text is an OBJECT, not a jsonb string scalar (the double-encoding trap).
		expect(row?.rawText.string?.startsWith('{')).toBe(true);
		// Refused: a table without a section_id sequence, an empty payload, a bad column.
		await expect(
			insertMatrixRowSequenceId(TEST_TABLE, ACTIVITY_SECTION_TIPO, { string: {} }),
		).rejects.toThrow(/allocates no section_id sequence/);
		await expect(
			insertMatrixRowSequenceId(SEQUENCE_ID_TABLE, ACTIVITY_SECTION_TIPO, {}),
		).rejects.toThrow(/empty values/);
	});

	test('appendMatrixUpdateRow: one matrix_updates row, the object as written', async () => {
		const marker = {
			zz_roundtrip_probe: { origin: 'matrix_write_roundtrip', n: 1, nested: ['a', 2] },
		};
		await appendMatrixUpdateRow(marker);
		const rows = (await sql`SELECT data FROM matrix_updates WHERE data ? 'zz_roundtrip_probe'`) as {
			data: unknown;
		}[];
		expect(rows).toHaveLength(1);
		expect(rows[0]?.data).toEqual(marker);
	});
});
