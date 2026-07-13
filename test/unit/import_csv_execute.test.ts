/**
 * CSV import EXECUTOR gate (src/core/tools/import_csv_execute.ts) — the write half,
 * driven through the tool's real `import_files` handler against the REAL DB on a
 * SCRATCH record (created and removed here; the canonical test3 playground is
 * never touched).
 *
 * These are the behaviours the planner/conform tests CANNOT see, because they only
 * exist once something is actually written:
 *
 *  1. METADATA COLUMNS. created_date/modified_date (dd199/dd201) and
 *     created_by_user/modified_by_user (dd200/dd197) need a DUAL write — the audit
 *     component AND the record's own `data`-column metadata — with the record's
 *     modified stamp SUPPRESSED for that row. Miss the suppression and the save
 *     that carries the imported timestamp overwrites it with "now, by the importer"
 *     one column later.
 *  2. WARNINGS. The one warning the engine produces: a lang that resolves but is
 *     not a project language. It must be IMPORTED and flagged — not rejected.
 *  3. PREFLIGHT. validate_import must catch a bad column map and write NOTHING.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../../src/config/config.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import type { ImportFileReport } from '../../src/core/tools/import_wire.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import { mustGet } from '../helpers/assert.ts';

const SECTION = 'test3';
const USER = 987670;
const ID = 900700; // far outside the canonical test3 ids
const CSV = 'execute_gate.csv';
const dir = resolve(config.media.rootPath ?? '', 'import/files', String(USER));

/** Audit tipos (concepts/section.ts AUDIT_TIPOS). */
const CREATED_DATE = 'dd199';
const MODIFIED_DATE = 'dd201';
const SELECT_LANG = 'test89';
const TEXT = 'test52';

const bulkProcessIds: number[] = [];

beforeAll(() => {
	mkdirSync(dir, { recursive: true });
});

afterAll(async () => {
	rmSync(dir, { recursive: true, force: true });
	await sql.unsafe('DELETE FROM matrix_test WHERE section_tipo = $1 AND section_id = $2', [
		SECTION,
		ID,
	]);
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2', [
		SECTION,
		ID,
	]);
	for (const id of bulkProcessIds) {
		await sql.unsafe(`DELETE FROM matrix_dd WHERE section_tipo = 'dd800' AND section_id = $1`, [
			id,
		]);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = 'dd800' AND section_id = $1`,
			[id],
		);
	}
});

/** Run the tool's real import_files over a CSV written for this test. */
async function importCsv(
	csv: string,
	columnsMap: Record<string, unknown>[],
): Promise<ImportFileReport> {
	writeFileSync(resolve(dir, CSV), csv);
	const loaded = await getLoadedTool('tool_import_dedalo_csv');
	const res = await mustGet(loaded!.module.apiActions.import_files, 'import_files').handler({
		principal: await resolvePrincipal(-1),
		userId: USER,
		background: false,
		options: {
			time_machine_save: true,
			files: [
				{
					file: CSV,
					section_tipo: SECTION,
					bulk_process_label: 'execute gate',
					ar_columns_map: columnsMap,
				},
			],
		},
	});
	const report = (res.result as ImportFileReport[])[0] as ImportFileReport;
	if (report.bulk_process_id !== null) bulkProcessIds.push(report.bulk_process_id);
	return report;
}

const KEY_COLUMN = { tipo: 'section_id', model: 'section_id' };

describe('metadata columns get the dual write, with the modified stamp suppressed', () => {
	test('an imported created_date lands in BOTH the component and the record metadata', async () => {
		const report = await importCsv(
			`section_id;${CREATED_DATE}_dmy;${MODIFIED_DATE}_dmy;${TEXT}\n` +
				`${ID};21-05-1998;03-04-2001;a record with history\n`,
			[
				KEY_COLUMN,
				{
					tipo: `${CREATED_DATE}_dmy`,
					model: 'component_date',
					checked: true,
					map_to: CREATED_DATE,
				},
				{
					tipo: `${MODIFIED_DATE}_dmy`,
					model: 'component_date',
					checked: true,
					map_to: MODIFIED_DATE,
				},
				{ tipo: TEXT, model: 'component_input_text', checked: true, map_to: TEXT },
			],
		);
		expect(report.failed).toEqual([]);
		expect(report.created).toEqual([ID]);

		const rows = (await sql.unsafe(
			`SELECT date -> '${CREATED_DATE}' AS created_component,
			        date -> '${MODIFIED_DATE}' AS modified_component,
			        data ->> 'created_date'   AS created_metadata
			   FROM matrix_test WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION, ID],
		)) as {
			created_component: { start?: Record<string, number> }[];
			modified_component: { start?: Record<string, number> }[];
			created_metadata: string | null;
		}[];
		const row = rows[0];

		// 1. the audit COMPONENT carries the imported date (the edit view reads this)
		expect(row?.created_component?.[0]?.start).toEqual({ day: 21, month: 5, year: 1998 });

		// 2. the record's own `data` METADATA carries it too (list views read THIS).
		// Writing only the component leaves a record whose edit view says 1998 while
		// every list says "created today".
		expect(row?.created_metadata).toContain('1998-05-21');

		// 3. THE SUPPRESSION: the imported modified_date survived. Every other column
		// of this row was saved AFTER it; without skipModifiedStamp each of those
		// saves re-stamps dd201 with "now", silently destroying the value we imported.
		expect(row?.modified_component?.[0]?.start).toEqual({ day: 3, month: 4, year: 2001 });
	});
});

describe('the warnings channel (imported, but flagged)', () => {
	test('a lang outside the project languages is IMPORTED and warned about', async () => {
		// lg-vtvn resolves to a real lg1 record but is not in DEDALO_PROJECTS_DEFAULT_LANGS.
		const outsider = 'lg-vtvn';
		expect(config.menu.projectsDefaultLangs).not.toContain(outsider);

		const report = await importCsv(`section_id;${SELECT_LANG}\n${ID};${outsider}\n`, [
			KEY_COLUMN,
			{
				tipo: SELECT_LANG,
				model: 'component_select_lang',
				checked: true,
				map_to: SELECT_LANG,
			},
		]);

		// A warning is NOT a rejection: the row still imported.
		expect(report.failed).toEqual([]);
		expect(report.warnings).toHaveLength(1);
		expect(report.warnings[0]?.msg).toContain('not be accessible until the project languages');
		expect(report.warnings[0]?.component_tipo).toBe(SELECT_LANG);
		expect(report.warnings[0]?.row).toBe(2); // the header is row 1

		// …and the data really is on the record.
		const rows = (await sql.unsafe(
			`SELECT relation -> '${SELECT_LANG}' AS langs
			   FROM matrix_test WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION, ID],
		)) as { langs: { section_tipo?: string }[] }[];
		expect(rows[0]?.langs?.[0]?.section_tipo).toBe('lg1');
	});
});

describe('validate_import (preflight) — catches the map BEFORE anything is written', () => {
	test('a column mapped outside the section is reported, and nothing is imported', async () => {
		writeFileSync(resolve(dir, CSV), `section_id;ontology5\n${ID};not my component\n`);
		const loaded = await getLoadedTool('tool_import_dedalo_csv');
		const res = await mustGet(loaded!.module.apiActions.validate_import, 'validate_import').handler(
			{
				principal: await resolvePrincipal(-1),
				userId: USER,
				background: false,
				options: {
					files: [
						{
							file: CSV,
							section_tipo: SECTION,
							// ontology5 is a real component tipo — of a DIFFERENT section.
							ar_columns_map: [
								KEY_COLUMN,
								{
									tipo: 'ontology5',
									model: 'component_input_text',
									checked: true,
									map_to: 'ontology5',
								},
							],
						},
					],
				},
			},
		);
		const file = (res.result as Record<string, unknown>[])[0] as Record<string, unknown>;
		expect(file.ok).toBe(false);
		expect((file.errors as string[]).join(' ')).toContain('not a component of section');

		// The preflight is READ-ONLY: it must not have created the record.
		const rows = (await sql.unsafe(
			'SELECT 1 FROM matrix_test WHERE section_tipo = $1 AND section_id = $2',
			[SECTION, 900701],
		)) as unknown[];
		expect(rows).toHaveLength(0);
	});

	test('a clean map + parseable values preflight OK', async () => {
		writeFileSync(resolve(dir, CSV), `section_id;${TEXT}\n${ID};fine\n`);
		const loaded = await getLoadedTool('tool_import_dedalo_csv');
		const res = await mustGet(loaded!.module.apiActions.validate_import, 'validate_import').handler(
			{
				principal: await resolvePrincipal(-1),
				userId: USER,
				background: false,
				options: {
					files: [
						{
							file: CSV,
							section_tipo: SECTION,
							ar_columns_map: [
								KEY_COLUMN,
								{ tipo: TEXT, model: 'component_input_text', checked: true, map_to: TEXT },
							],
						},
					],
				},
			},
		);
		const file = (res.result as Record<string, unknown>[])[0] as Record<string, unknown>;
		expect(file.ok).toBe(true);
		expect(file.errors).toEqual([]);
		expect(file.failed).toEqual([]);
		expect(file.rows_total).toBe(1);
	});
});
