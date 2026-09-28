/**
 * THE UNDO-LOG WRITERS of a bulk run (src/core/db/time_machine.ts, 2026-09-27)
 * and the visibility narrowing that keeps their hidden rows out of history
 * (record_generation.ts withTmHistory), against the real matrix_time_machine
 * with migration 0010's `tm_role` column.
 *
 * WHAT IS PINNED (the foundation the capture and revert lanes build on):
 *   - recordBulkPair: BEFORE (tm_role 1, hidden) then the VISIBLE after-row
 *     (tm_role NULL), both carrying the bulk id, BEFORE's id lower, ONE shared
 *     timestamp; an absent key stored as SQL NULL and told apart from a JSON
 *     null / [] by `data IS NULL`; a no-op writes NOTHING; an unaudited
 *     address writes nothing; a fault after the pair inside the caller's
 *     transaction leaves NEITHER row.
 *   - recordBulkBirth (role 3) / recordBulkCascadeDelete (role 4) shapes.
 *   - the database refuses a role outside the closed set (the CHECK constraint).
 *   - readTimeMachineRow / readTimeMachineHistory never serve a hidden row.
 *
 * SITUATION: rows are written on a `zz*` scratch section tipo that addresses
 * no record and no ontology node, so the sweep is exact and nothing ambient is
 * read. assertTestDatabase before the first write.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import { withTmHistory } from '../../src/core/db/record_generation.ts';
import {
	decodeTmImage,
	readTimeMachineHistory,
	readTimeMachineRow,
	recordBulkBirth,
	recordBulkCascadeDelete,
	recordBulkPair,
	TM_IMAGE_ABSENT_COLUMN,
	TM_ROLE,
} from '../../src/core/db/time_machine.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const SECTION = 'zzundo1';
const COMPONENT = 'zzundo2';
const SPA = 'lg-spa';
/** A bulk id no door minted: the rows are this file's own, swept by section. */
const BULK = 987_650_001;

interface UndoRowRead {
	id: number;
	tipo: string;
	lang: string;
	timestamp: string;
	user_id: number;
	bulk_process_id: number | null;
	tm_role: number | null;
	data: unknown;
	data_absent: boolean;
}

async function rowsOf(sectionId: number): Promise<UndoRowRead[]> {
	return (await sql.unsafe(
		`SELECT id, tipo, lang, timestamp::text AS timestamp, user_id, bulk_process_id, tm_role, data,
		        ${TM_IMAGE_ABSENT_COLUMN}
		   FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2 ORDER BY id ASC`,
		[SECTION, sectionId],
	)) as UndoRowRead[];
}

async function sweep(): Promise<void> {
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1', [SECTION]);
}

const coords = (sectionId: number) => ({
	sectionTipo: SECTION,
	sectionId,
	componentTipo: COMPONENT,
});

beforeAll(async () => {
	await assertTestDatabase('tm_undo_log_writers_native');
	await sweep();
});
beforeEach(sweep);
afterAll(async () => {
	await sweep();
	const residue = (await sql.unsafe(
		'SELECT count(*)::int AS n FROM matrix_time_machine WHERE section_tipo = $1',
		[SECTION],
	)) as { n: number }[];
	expect(residue[0]?.n).toBe(0);
});

describe('recordBulkPair — the pair law', () => {
	test('BEFORE (hidden, role 1) then the VISIBLE after-row, one stamp, one bulk id', async () => {
		const before = [{ id: 1, lang: SPA, value: 'old' }];
		const after = [{ id: 1, lang: SPA, value: 'new' }];
		const ids = await recordBulkPair({
			coords: coords(1),
			lang: SPA,
			userId: 7,
			bulkId: BULK,
			before,
			after,
		});
		expect(ids).not.toBeNull();
		const rows = await rowsOf(1);
		expect(rows.map((row) => row.id)).toEqual([ids?.beforeId as number, ids?.afterId as number]);
		expect(ids?.beforeId).toBeLessThan(ids?.afterId as number);
		const [b, a] = rows as [UndoRowRead, UndoRowRead];
		expect([b.tm_role, a.tm_role]).toEqual([TM_ROLE.before, null]);
		expect([b.bulk_process_id, a.bulk_process_id]).toEqual([BULK, BULK]);
		expect(b.timestamp).toBe(a.timestamp);
		expect([b.tipo, b.lang, Number(b.user_id)]).toEqual([COMPONENT, SPA, 7]); // user_id is a text column
		expect(decodeTmImage(b.data, b.data_absent)).toEqual(before);
		expect(decodeTmImage(a.data, a.data_absent)).toEqual(after);
	});

	test('an ABSENT key is SQL NULL, distinct from []; a JSON null image IS absence', async () => {
		await recordBulkPair({
			coords: coords(2),
			lang: SPA,
			userId: 1,
			bulkId: BULK,
			before: undefined,
			after: [],
		});
		// A stored JSON null holds nothing (lang_region.ts keyImage): null → absent
		// is NO change, so nothing is written; null → [] records B absent.
		const noChange = await recordBulkPair({
			coords: coords(3),
			lang: SPA,
			userId: 1,
			bulkId: BULK,
			before: null,
			after: undefined,
		});
		expect(noChange).toBeNull();
		expect(await rowsOf(3)).toEqual([]);
		await recordBulkPair({
			coords: coords(3),
			lang: SPA,
			userId: 1,
			bulkId: BULK,
			before: null,
			after: [],
		});
		const [absentBefore, emptyAfter] = (await rowsOf(2)) as [UndoRowRead, UndoRowRead];
		expect(decodeTmImage(absentBefore.data, absentBefore.data_absent)).toBeUndefined();
		expect(decodeTmImage(emptyAfter.data, emptyAfter.data_absent)).toEqual([]);
		const [nullBefore, emptyAfter3] = (await rowsOf(3)) as [UndoRowRead, UndoRowRead];
		expect(nullBefore.data_absent).toBe(true);
		expect(decodeTmImage(nullBefore.data, nullBefore.data_absent)).toBeUndefined();
		expect(decodeTmImage(emptyAfter3.data, emptyAfter3.data_absent)).toEqual([]);
	});

	test('a NO-OP writes nothing (key order is not a change)', async () => {
		const ids = await recordBulkPair({
			coords: coords(4),
			lang: SPA,
			userId: 1,
			bulkId: BULK,
			before: [{ value: 'same', lang: SPA }],
			after: [{ lang: SPA, value: 'same' }],
		});
		expect(ids).toBeNull();
		expect(
			await recordBulkPair({
				coords: coords(4),
				lang: SPA,
				userId: 1,
				bulkId: BULK,
				before: undefined,
				after: undefined,
			}),
		).toBeNull();
		expect(await rowsOf(4)).toEqual([]);
	});

	test('an unaudited address writes nothing (dd15 itself, non-positive id)', async () => {
		expect(
			await recordBulkPair({
				coords: { sectionTipo: 'dd15', sectionId: 5, componentTipo: COMPONENT },
				lang: SPA,
				userId: 1,
				bulkId: BULK,
				before: [],
				after: [1],
			}),
		).toBeNull();
		expect(
			await recordBulkPair({
				coords: coords(0),
				lang: SPA,
				userId: 1,
				bulkId: BULK,
				before: [],
				after: [1],
			}),
		).toBeNull();
		expect(
			await recordBulkBirth({ sectionTipo: SECTION, sectionId: -1, userId: 1, bulkId: BULK }),
		).toBeNull();
	});

	test('a fault later in the CALLER’s transaction leaves neither row', async () => {
		const fault = new Error('injected fault after the pair');
		const outcome = await withTransaction(async () => {
			await recordBulkPair({
				coords: coords(5),
				lang: SPA,
				userId: 1,
				bulkId: BULK,
				before: [],
				after: [1],
			});
			// Inside the tx both rows exist...
			expect((await rowsOf(5)).length).toBe(2);
			throw fault;
		}).catch((error: unknown) => error);
		expect(outcome).toBe(fault);
		expect(await rowsOf(5)).toEqual([]);
	});
});

describe('record markers', () => {
	test('birth (role 3): tipo = section_tipo, lg-nolan, data absent', async () => {
		const id = await recordBulkBirth({
			sectionTipo: SECTION,
			sectionId: 6,
			userId: 3,
			bulkId: BULK,
		});
		const [row] = (await rowsOf(6)) as [UndoRowRead];
		expect(row.id).toBe(id as number);
		expect([row.tipo, row.lang, row.tm_role, row.bulk_process_id]).toEqual([
			SECTION,
			'lg-nolan',
			TM_ROLE.birth,
			BULK,
		]);
		expect(row.data_absent).toBe(true);
	});

	test('cascade delete (role 4): the whole-record snapshot, with the bulk id', async () => {
		const snapshot = {
			string: { [COMPONENT]: [{ id: 1, lang: SPA, value: 'gone' }] },
			relation: null,
		};
		await recordBulkCascadeDelete({
			sectionTipo: SECTION,
			sectionId: 7,
			userId: 3,
			bulkId: BULK,
			snapshot,
			timestamp: '2026-09-27 10:00:00',
		});
		const [row] = (await rowsOf(7)) as [UndoRowRead];
		expect([row.tipo, row.lang, row.tm_role, row.timestamp]).toEqual([
			SECTION,
			'lg-nolan',
			TM_ROLE.cascadeDelete,
			'2026-09-27 10:00:00',
		]);
		expect(row.data).toEqual(snapshot);
	});

	test('the database refuses a role outside the closed set (role 2 was dropped, D1)', async () => {
		const refused = await sql
			.unsafe(
				`INSERT INTO matrix_time_machine (section_id, section_tipo, tipo, lang, timestamp, user_id, tm_role)
				 VALUES (8, $1, $2, 'lg-nolan', '2026-09-27 10:00:00', 1, 2)`,
				[SECTION, COMPONENT],
			)
			.then(() => null)
			.catch((error: unknown) => error as { errno?: string });
		expect(refused?.errno).toBe('23514'); // check_violation
		expect(await rowsOf(8)).toEqual([]);
	});
});

describe('visibility — a hidden row is never history', () => {
	test('readTimeMachineRow: the after-row is served, the BEFORE and marker ids are not', async () => {
		const ids = await recordBulkPair({
			coords: coords(9),
			lang: SPA,
			userId: 1,
			bulkId: BULK,
			before: [0],
			after: [1],
		});
		const birth = await recordBulkBirth({
			sectionTipo: SECTION,
			sectionId: 9,
			userId: 1,
			bulkId: BULK,
		});
		expect((await readTimeMachineRow(ids?.afterId as number))?.data).toEqual([1]);
		expect(await readTimeMachineRow(ids?.beforeId as number)).toBeNull();
		expect(await readTimeMachineRow(birth as number)).toBeNull();
	});

	test('readTimeMachineHistory lists only the visible row', async () => {
		const ids = await recordBulkPair({
			coords: coords(10),
			lang: SPA,
			userId: 1,
			bulkId: BULK,
			before: [0],
			after: [1],
		});
		const history = await readTimeMachineHistory(SECTION, 10, COMPONENT);
		expect(history.map((row) => row.id)).toEqual([ids?.afterId as number]);
	});

	test('withTmHistory narrows a raw statement; the un-narrowed one sees every role', async () => {
		await recordBulkPair({
			coords: coords(11),
			lang: SPA,
			userId: 1,
			bulkId: BULK,
			before: [0],
			after: [1],
		});
		await recordBulkBirth({ sectionTipo: SECTION, sectionId: 11, userId: 1, bulkId: BULK });
		const count = async (where: string) =>
			(
				(await sql.unsafe(`SELECT count(*)::int AS n FROM matrix_time_machine WHERE ${where}`, [
					SECTION,
				])) as { n: number }[]
			)[0]?.n;
		const scope = 'matrix_time_machine.section_tipo = $1 AND matrix_time_machine.section_id = 11';
		expect(await count(scope)).toBe(3);
		expect(await count(withTmHistory(scope))).toBe(1);
	});
});
