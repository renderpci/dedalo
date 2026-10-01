/**
 * THE IMPORTERS' CREATE DOOR AND LEGACY FRAME SLOTS (closure Step 3 req 10 —
 * refuter-surviving S2, 2026-10-01).
 *
 * WHAT WAS UNGATED. req 10 put every importer write through the write door, and
 * authz_door_matrix_native probes the MATCHED-record half (an EXISTING record,
 * one plain column → `authorizeRecordAccess`). Three other halves shipped with
 * no behavioural gate — every caller that reached them ran as a global admin,
 * which the door admits whatever the code does:
 *
 *   1. the mapped-record importer's CREATE (core/tools/import_execute.ts
 *      `recordIdFor`, door 'import_execute.create' — MARC21 / Zotero / RDF): a
 *      record with no matched id is born only after the section is asked at 2;
 *   2. the CSV importer's CREATE (core/tools/import_csv_execute.ts, door
 *      'import_csv.create') and its per-column gate on a row it CREATES
 *      (`componentRefusal`'s `isNew` branch — the pair at 2, no record yet);
 *   3. the CSV legacy `{data, dataframe}` envelope: each frame names its own
 *      slot (`from_component_tipo`), and that slot is a component write of its
 *      own (`legacyFrameSlots`) — refused, the WHOLE column is skipped.
 *
 * THE IDENTITIES are authz_door_fixture's, asserted through the real resolver
 * first: LEVEL_1 (test3 at 1 — read, never write), READ_COMPONENT (test3 at 2,
 * test52 at 0), CONTROL (test3 + test52 at 2, test60 — the dataframe slot — at
 * 0). Every refusal has a SERVED twin, so an importer that refused everything
 * is red too. Residue is asserted on the rows, never on the report alone.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { deleteMatrixRecord } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { getPermissions, type Principal } from '../../src/core/security/permissions.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { planCsvImport } from '../../src/core/tools/import_csv.ts';
import { executeCsvImport } from '../../src/core/tools/import_csv_execute.ts';
import { importMappedRecords } from '../../src/core/tools/import_execute.ts';
import {
	AUTHZ_PROJECT_P,
	AUTHZ_SECTION,
	AUTHZ_TEXT,
	type AuthzIdentities,
	assertAuthzDoorContrast,
	createDoorRecord,
	installAuthzDoorFixture,
	removeAuthzDoorFixture,
	resolveAuthzIdentities,
} from '../helpers/authz_door_fixture.ts';
import { DB_READY } from '../helpers/db_ready.ts';

const TABLE = 'matrix_test';
/** test60 — a component_dataframe of the test3 family: the legacy frames' slot. */
const FRAME_SLOT = 'test60';

let ids: AuthzIdentities;
/** test3 records the IMPORTERS created (swept with their TM rows). */
const importedIds = new Set<number>();
/** dd800 run records the importers / this file minted. */
const runIds = new Set<number>();

async function rowCount(): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM ${TABLE} WHERE section_tipo = $1`,
		[AUTHZ_SECTION],
	)) as { n: number }[];
	return rows[0]?.n ?? 0;
}

async function recordColumns(
	sectionId: number,
): Promise<{ text: unknown; frames: unknown } | null> {
	const rows = (await sql.unsafe(
		`SELECT string -> '${AUTHZ_TEXT}' AS text, relation -> '${FRAME_SLOT}' AS frames
		   FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`,
		[AUTHZ_SECTION, sectionId],
	)) as { text: unknown; frames: unknown }[];
	return rows[0] ?? null;
}

/** An id no test3 record holds yet (the CSV importer creates AT the row's id). */
async function freshId(): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT COALESCE(MAX(section_id), 0)::int + 1 AS id FROM ${TABLE} WHERE section_tipo = $1`,
		[AUTHZ_SECTION],
	)) as { id: number }[];
	const id = rows[0]?.id ?? 1;
	expect(await recordColumns(id)).toBeNull();
	return id;
}

/** The MARC21 / Zotero / RDF engine on ONE record with no matched id. */
async function importNew(principal: Principal) {
	const report = await importMappedRecords(
		[{ sectionId: null, fields: [{ component_tipo: AUTHZ_TEXT, values: ['zzimport create'] }] }],
		AUTHZ_SECTION,
		principal,
		{ bulkLabel: 'import create door gate' },
	);
	if (report.bulkProcessId !== null) runIds.add(report.bulkProcessId);
	for (const id of report.createdIds) importedIds.add(id);
	return report;
}

/** The CSV engine on ONE row (section_id + one test52 cell), as `principal`. */
async function importCsvRow(principal: Principal, sectionId: number, cell: string) {
	const plan = await planCsvImport(
		[[String(sectionId), cell]],
		[
			{
				tipo: 'section_id',
				model: 'component_section_id',
				columnName: 'section_id',
				lang: 'lg-nolan',
			},
			{ tipo: AUTHZ_TEXT, model: 'component_input_text', columnName: AUTHZ_TEXT, lang: 'lg-nolan' },
		],
		AUTHZ_SECTION,
	);
	const bulkProcessId = await createSectionRecord('dd800', -1);
	runIds.add(bulkProcessId);
	const report = await executeCsvImport({
		plan,
		sectionTipo: AUTHZ_SECTION,
		principal,
		bulkProcessId,
		errors: [],
		notices: [],
		progress: {
			file: 'zzimport_create.csv',
			fileIndex: 1,
			filesTotal: 1,
			labels: new Map(),
			publish: () => {},
		},
	});
	for (const id of report.created) importedIds.add(id);
	return report;
}

const REFUSED = /not writable by the importer \(perm\.[a-z_]+\)/;

describe.if(DB_READY)(
	'req 10 — the importers ask the write door to CREATE, and per frame slot',
	() => {
		beforeAll(async () => {
			await installAuthzDoorFixture();
			ids = await resolveAuthzIdentities();
		});
		afterAll(async () => {
			await assertTestDatabase('import_create_door_native');
			for (const id of importedIds) {
				await deleteMatrixRecord(TABLE, AUTHZ_SECTION, id);
				await sql.unsafe(
					'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
					[AUTHZ_SECTION, id],
				);
			}
			for (const id of runIds) {
				await deleteMatrixRecord('matrix_notes', 'dd800', id);
				await sql.unsafe(
					`DELETE FROM matrix_time_machine WHERE section_tipo = 'dd800' AND section_id = $1`,
					[id],
				);
			}
			await removeAuthzDoorFixture();
		});

		test('the identities are what they claim (the contrast is live)', async () => {
			await assertAuthzDoorContrast(ids);
			expect(await getPermissions(ids.level1, AUTHZ_SECTION, AUTHZ_SECTION)).toBe(1);
			expect(await getPermissions(ids.readComponent, AUTHZ_SECTION, AUTHZ_SECTION)).toBe(2);
			expect(await getPermissions(ids.readComponent, AUTHZ_SECTION, AUTHZ_TEXT)).toBe(0);
			expect(await getPermissions(ids.control, AUTHZ_SECTION, AUTHZ_TEXT)).toBe(2);
			expect(await getPermissions(ids.control, AUTHZ_SECTION, FRAME_SLOT)).toBe(0);
		});

		// --- 1. the mapped-record importer (MARC21 / Zotero / RDF) ----------------

		test('MAPPED, NEW record, section READ-only (LEVEL_1): refused — nothing created, no row left', async () => {
			const before = await rowCount();
			const report = await importNew(ids.level1);
			expect({ created: report.created, createdIds: report.createdIds }).toEqual({
				created: 0,
				createdIds: [],
			});
			expect(report.failed.map((failure) => String(failure.msg))).toEqual([
				expect.stringContaining('the record was not written'),
			]);
			expect(await rowCount()).toBe(before);
		});

		test('MAPPED, NEW record, the served twin (CONTROL): created, its field written', async () => {
			const before = await rowCount();
			const report = await importNew(ids.control);
			expect(report.created).toBe(1);
			// The floor under the empty-failure verdict below: the import really ran and
			// really created a row (an importer that did nothing would also fail nothing).
			expect(report.createdIds).toHaveLength(1);
			expect(await rowCount()).toBeGreaterThan(before);
			expect(report.failed).toEqual([]);
			const created = report.createdIds[0] as number;
			expect(JSON.stringify((await recordColumns(created))?.text)).toContain('zzimport create');
		});

		// --- 2. the CSV importer: the create, and a column of a CREATED row ---------

		test('CSV, NEW row, section READ-only (LEVEL_1): refused — the row rolled back, no record at its id', async () => {
			const sectionId = await freshId();
			const report = await importCsvRow(ids.level1, sectionId, 'zzcsv create refused');
			expect(report.created).toEqual([]);
			expect(report.failed.map((failure) => String(failure.msg))).toEqual([
				expect.stringContaining('the row was rolled back'),
			]);
			expect(await recordColumns(sectionId)).toBeNull();
		});

		test('CSV, NEW row, section writable but the column at 0 (READ_COMPONENT): created, the column IGNORED and unwritten', async () => {
			const sectionId = await freshId();
			const report = await importCsvRow(ids.readComponent, sectionId, 'zzcsv column refused');
			expect(report.created).toEqual([sectionId]);
			expect(report.failed).toEqual([
				expect.objectContaining({
					component_tipo: AUTHZ_TEXT,
					msg: expect.stringMatching(REFUSED),
				}),
			]);
			expect((await recordColumns(sectionId))?.text ?? null).toBeNull();
		});

		test('CSV, NEW row, the served twin (CONTROL): created, the column written', async () => {
			const sectionId = await freshId();
			const report = await importCsvRow(ids.control, sectionId, 'zzcsv create served');
			expect(report.created).toEqual([sectionId]);
			expect(report.failed).toEqual([]);
			expect(JSON.stringify((await recordColumns(sectionId))?.text)).toContain(
				'zzcsv create served',
			);
		});

		// --- 3. the CSV legacy {data, dataframe} envelope's frame slots ------------

		const envelope = (withFrame: boolean, sectionId: number): string =>
			JSON.stringify({
				dedalo_data: {
					data: [{ id: 1, value: withFrame ? 'zzframe refused' : 'zzframe served' }],
					dataframe: withFrame
						? [
								{
									section_tipo: AUTHZ_SECTION,
									section_id: sectionId,
									from_component_tipo: FRAME_SLOT,
									id_key: 1,
									type: 'dd490',
								},
							]
						: [],
				},
			});

		test('CSV legacy envelope whose frame names a slot she holds 0 on: the slot IGNORED, the frame AND the main column unwritten', async () => {
			const sectionId = await createDoorRecord(AUTHZ_SECTION, AUTHZ_PROJECT_P);
			const report = await importCsvRow(ids.control, sectionId, envelope(true, sectionId));
			expect(report.updated).toEqual([sectionId]);
			expect(report.failed).toEqual([
				expect.objectContaining({
					component_tipo: FRAME_SLOT,
					msg: expect.stringMatching(REFUSED),
				}),
			]);
			const stored = await recordColumns(sectionId);
			expect({ text: stored?.text ?? null, frames: stored?.frames ?? null }).toEqual({
				text: null,
				frames: null,
			});
		});

		test('CSV legacy envelope, the served twin (no frame): the main column written', async () => {
			const sectionId = await createDoorRecord(AUTHZ_SECTION, AUTHZ_PROJECT_P);
			const report = await importCsvRow(ids.control, sectionId, envelope(false, sectionId));
			expect(report.failed).toEqual([]);
			expect(JSON.stringify((await recordColumns(sectionId))?.text)).toContain('zzframe served');
		});
	},
);
