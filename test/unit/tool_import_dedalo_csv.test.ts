/**
 * R2 gate: tool_import_dedalo_csv. Module loads with its 6 actions (import_files
 * backgroundRunnable). get_section_components_list is DB-verified (reuses the
 * verified get_section_elements_context). The conform/plan core is tested in
 * import_data / import_csv; the CSV→DB execute drive is exercised here against a
 * SCRATCH record in the test3 playground (created and removed by the test).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../../src/config/config.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import type { ImportFileReport, ImportProgressFrame } from '../../src/core/tools/import_wire.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import { mustGet } from '../helpers/assert.ts';

const SECTION = 'numisdata4';

describe('tool_import_dedalo_csv module', () => {
	test('loads with the 6 actions + import_files backgroundRunnable', async () => {
		const loaded = await getLoadedTool('tool_import_dedalo_csv');
		expect(loaded).not.toBeNull();
		const actions = loaded!.module.apiActions;
		expect(Object.keys(actions).sort()).toEqual([
			'delete_csv_file',
			'get_csv_files',
			'get_section_components_list',
			'import_files',
			'process_uploaded_file',
			'validate_import',
		]);
		expect(loaded!.module.backgroundRunnable).toEqual(['import_files']);
		// The batch's targets ride inside options.files[] (one section per file), so
		// import_files gates on the LIST, not on a top-level section_tipo the client
		// never sends. process_uploaded_file has no section target at all.
		const importFiles = mustGet(actions.import_files, 'import_files');
		expect(importFiles.permission).toBe('section_list');
		expect(mustGet(actions.process_uploaded_file, 'process_uploaded_file').permission).toBeNull();
	});

	test('get_section_components_list resolves a VIRTUAL section through its real one', async () => {
		// test0 is virtual: it has NO components of its own (relations[0].tipo →
		// ontology1 owns them). A plain subtree walk returns an EMPTY list, and the
		// client then renders an empty <select> and auto-detects NOTHING — the column
		// mapper silently stays blank, which is exactly the reported bug.
		const loaded = await getLoadedTool('tool_import_dedalo_csv');
		const res = await mustGet(
			loaded!.module.apiActions.get_section_components_list,
			'get_section_components_list',
		).handler({
			principal: await resolvePrincipal(-1),
			userId: -1,
			background: false,
			options: { section_tipo: 'test0' },
		});
		const list = res.result as { value: string; model: string }[];
		expect(list.length).toBeGreaterThan(0);
		// The real section's components are what an exported test0 CSV is keyed on.
		expect(list.some((el) => el.value === 'ontology3')).toBe(true);
		// The section_id column of the CSV maps through this model (client rule).
		expect(list.some((el) => el.model === 'component_section_id')).toBe(true);
	});

	test('import_files gate reads every file section_tipo from the client payload', async () => {
		const loaded = await getLoadedTool('tool_import_dedalo_csv');
		const spec = mustGet(loaded!.module.apiActions.import_files, 'import_files');
		// The exact wire the client posts (render_tool_import_dedalo_csv fn_import).
		const options = {
			background_running: true,
			time_machine_save: true,
			files: [
				{ file: 'a.csv', section_tipo: 'oh1', ar_columns_map: [] },
				{ file: 'b.csv', section_tipo: SECTION, ar_columns_map: [] },
			],
		};
		expect(spec.sectionTipos?.(options)).toEqual(['oh1', SECTION]);
		// A batch with no files yields no targets → the gate denies (fail-closed).
		expect(spec.sectionTipos?.({ files: [] })).toEqual([]);
	});

	test('get_section_components_list returns {label,value,model}[] + top-level section label (client contract)', async () => {
		const loaded = await getLoadedTool('tool_import_dedalo_csv');
		const principal = await resolvePrincipal(-1);
		const res = await mustGet(
			loaded!.module.apiActions.get_section_components_list,
			'get_section_components_list',
		).handler({
			principal,
			userId: -1,
			background: false,
			options: { section_tipo: SECTION },
		});
		expect(res.result).not.toBe(false);
		// The client reads response.result (→ list), response.label, response.msg.
		expect(typeof res.label).toBe('string');
		const list = res.result as Record<string, unknown>[];
		expect(Array.isArray(list)).toBe(true);
		expect(list.length).toBeGreaterThan(0);
		for (const el of list) {
			expect(typeof el.value).toBe('string'); // the tipo
			expect(typeof el.model).toBe('string');
			expect('label' in el).toBe(true);
		}
	});
});

/**
 * The drive the client actually performs: a CSV staged in the user's import dir +
 * the column map the mapper UI produces → records written. Scratch surfaces only:
 * a disposable user's import dir and ONE test3 record id well outside the
 * canonical playground (removed in afterAll, together with its TM + dd800 rows).
 */
describe('import_files writes the mapped columns (scratch record, cleaned up)', () => {
	const SCRATCH_USER = 987656;
	const SCRATCH_ID = 900101; // far outside the canonical test3 ids (1, 2, 27)
	const root = config.media.rootPath ?? '';
	const userDir = resolve(root, 'import/files', String(SCRATCH_USER));
	const CSV = 'scratch_import.csv';
	const bulkProcessIds: number[] = [];

	beforeAll(() => {
		mkdirSync(userDir, { recursive: true });
		// ';' is the Dédalo CSV delimiter. test52 is component_input_text on test3.
		writeFileSync(
			resolve(userDir, CSV),
			`section_id;test52\n${SCRATCH_ID};imported by the csv tool\n`,
		);
	});
	afterAll(async () => {
		rmSync(userDir, { recursive: true, force: true });
		await sql.unsafe(`DELETE FROM matrix_test WHERE section_tipo = 'test3' AND section_id = $1`, [
			SCRATCH_ID,
		]);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = 'test3' AND section_id = $1`,
			[SCRATCH_ID],
		);
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

	test('creates the record at the CSV section_id and saves the mapped component', async () => {
		const loaded = await getLoadedTool('tool_import_dedalo_csv');
		const res = await mustGet(loaded!.module.apiActions.import_files, 'import_files').handler({
			principal: await resolvePrincipal(-1),
			userId: SCRATCH_USER,
			background: false,
			// The exact payload render_tool_import_dedalo_csv posts.
			options: {
				time_machine_save: true,
				files: [
					{
						file: CSV,
						section_tipo: 'test3',
						bulk_process_label: 'scratch import',
						ar_columns_map: [
							{ tipo: 'section_id', label: 'Section ID', model: 'section_id' },
							{
								tipo: 'test52',
								label: 'Text',
								model: 'component_input_text',
								checked: true,
								map_to: 'test52',
							},
						],
					},
				],
			},
		});

		const report = (res.result as ImportFileReport[])[0] as ImportFileReport;
		expect(report.ok).toBe(true);
		// THE CONTRACT: created/updated are the section_ids, not counts. The client
		// lists them and offers "copy as column"; a number has no .length and the
		// whole panel silently renders nothing (the bug this replaced).
		expect(report.created).toEqual([SCRATCH_ID]);
		expect(report.updated).toEqual([]);
		expect(report.failed).toEqual([]);
		expect(report.warnings).toEqual([]);
		expect(report.rows_total).toBe(1);
		bulkProcessIds.push(report.bulk_process_id as number);

		// The record exists at the id the CSV asked for — not at a counter-issued one —
		// and the mapped component landed in its matrix column (string, for input_text).
		const rows = (await sql.unsafe(
			`SELECT string -> 'test52' AS items
			   FROM matrix_test WHERE section_tipo = 'test3' AND section_id = $1`,
			[SCRATCH_ID],
		)) as { items: unknown }[];
		expect(rows.length).toBe(1);
		expect(JSON.stringify(rows[0]?.items)).toContain('imported by the csv tool');

		// The TM row is attributed to the dd800 run — this is what makes the whole
		// import revertable as ONE operation.
		const tm = (await sql.unsafe(
			`SELECT bulk_process_id FROM matrix_time_machine
			  WHERE section_tipo = 'test3' AND section_id = $1 AND tipo = 'test52'`,
			[SCRATCH_ID],
		)) as { bulk_process_id: number | null }[];
		expect(tm.length).toBeGreaterThan(0);
		expect(tm[0]?.bulk_process_id).toBe(report.bulk_process_id as number);
	});

	test('a flat human-authored DMY date IMPORTS (the capability the port was missing)', async () => {
		// test145 is component_date. '26/10/2023' in a column named test145_dmy is
		// exactly what a curator's spreadsheet contains — and until the importConform
		// facets landed, every such cell was refused and the column stayed empty.
		writeFileSync(resolve(userDir, CSV), `section_id;test145_dmy\n${SCRATCH_ID};26/10/2023\n`);
		const loaded = await getLoadedTool('tool_import_dedalo_csv');
		const res = await mustGet(loaded!.module.apiActions.import_files, 'import_files').handler({
			principal: await resolvePrincipal(-1),
			userId: SCRATCH_USER,
			background: false,
			options: {
				files: [
					{
						file: CSV,
						section_tipo: 'test3',
						ar_columns_map: [
							{ tipo: 'section_id', model: 'section_id' },
							{
								tipo: 'test145_dmy',
								model: 'component_date',
								checked: true,
								map_to: 'test145',
							},
						],
					},
				],
			},
		});
		const report = (res.result as ImportFileReport[])[0] as ImportFileReport;
		bulkProcessIds.push(report.bulk_process_id as number);
		expect(report.failed).toEqual([]);

		// The suffix chose the field order: 26 is the DAY, not the month.
		const rows = (await sql.unsafe(
			`SELECT date -> 'test145' AS items
			   FROM matrix_test WHERE section_tipo = 'test3' AND section_id = $1`,
			[SCRATCH_ID],
		)) as { items: { start?: Record<string, number> }[] }[];
		const stored = rows[0]?.items ?? [];
		expect(stored[0]?.start).toEqual({ day: 26, month: 10, year: 2023 });
	});

	test('an unchecked column is not imported, and a row without section_id is skipped', async () => {
		writeFileSync(resolve(userDir, CSV), `section_id;test52\n;skipped row\n`);
		const loaded = await getLoadedTool('tool_import_dedalo_csv');
		const res = await mustGet(loaded!.module.apiActions.import_files, 'import_files').handler({
			principal: await resolvePrincipal(-1),
			userId: SCRATCH_USER,
			background: false,
			options: {
				files: [
					{
						file: CSV,
						section_tipo: 'test3',
						ar_columns_map: [
							{ tipo: 'section_id', model: 'section_id' },
							{ tipo: 'test52', model: 'component_input_text', checked: true, map_to: 'test52' },
						],
					},
				],
			},
		});
		const report = (res.result as ImportFileReport[])[0] as ImportFileReport;
		bulkProcessIds.push(report.bulk_process_id as number);
		expect(report.created).toEqual([]);
		expect(report.updated).toEqual([]);
		expect(String(report.errors[0])).toContain('section_id');
	});

	test('publishes live progress frames while it runs (the panel is fed, not static)', async () => {
		writeFileSync(resolve(userDir, CSV), `section_id;test52\n${SCRATCH_ID};progress row\n`);
		const frames: ImportProgressFrame[] = [];
		const loaded = await getLoadedTool('tool_import_dedalo_csv');
		const res = await mustGet(loaded!.module.apiActions.import_files, 'import_files').handler({
			principal: await resolvePrincipal(-1),
			userId: SCRATCH_USER,
			background: true,
			publishProgress: (data: object) => frames.push(data as ImportProgressFrame),
			options: {
				files: [
					{
						file: CSV,
						section_tipo: 'test3',
						ar_columns_map: [
							{ tipo: 'section_id', model: 'section_id' },
							{ tipo: 'test52', model: 'component_input_text', checked: true, map_to: 'test52' },
						],
					},
				],
			},
		});
		bulkProcessIds.push((res.result as ImportFileReport[])[0]?.bulk_process_id as number);
		// At minimum the 'reading' phase frame — and it carries the file identity and
		// the batch position the progress bar needs.
		expect(frames.length).toBeGreaterThan(0);
		const first = frames[0] as ImportProgressFrame;
		expect(first.phase).toBe('reading');
		expect(first.file).toBe(CSV);
		expect(first.file_index).toBe(1);
		expect(first.files_total).toBe(1);
	});
});

describe('path traversal is REFUSED (fail-closed, canary-verified)', () => {
	// importDir() has no root-override seam, so these use a disposable user id
	// under the real media root (filesystem-only scratch; removed in afterAll).
	const SCRATCH_USER = 987654;
	const root = config.media.rootPath ?? '';
	const userDir = resolve(root, 'import/files', String(SCRATCH_USER));
	// Canary ONE level above the per-user dir: exactly the file a '../' escape
	// from delete_csv_file would move. It must survive every attempt below.
	const canary = resolve(root, 'import/files', `canary_${process.pid}.csv`);

	async function callAction(name: string, options: Record<string, unknown>) {
		const loaded = await getLoadedTool('tool_import_dedalo_csv');
		const handler = mustGet(loaded!.module.apiActions[name], name).handler;
		return handler({
			principal: await resolvePrincipal(-1),
			userId: SCRATCH_USER,
			background: false,
			options,
		});
	}

	beforeAll(() => {
		mkdirSync(userDir, { recursive: true });
		writeFileSync(canary, 'canary — must never be deleted/moved by a traversal');
	});
	afterAll(() => {
		rmSync(userDir, { recursive: true, force: true });
		rmSync(canary, { force: true });
		rmSync(resolve(root, config.media.upload.tmpSubdir, String(SCRATCH_USER)), {
			recursive: true,
			force: true,
		});
	});

	test('delete_csv_file refuses ../, absolute and %2f-encoded file_name (canary untouched)', async () => {
		for (const file_name of [
			`../canary_${process.pid}.csv`, // relative escape to the canary
			'../../../etc/passwd', // deep relative escape
			canary, // absolute path
			'/etc/passwd', // absolute system path
			`..%2fcanary_${process.pid}.csv`, // encoded '../' — must NOT be decoded into a traversal
			'..%2f..%2fetc%2fpasswd',
		]) {
			const res = await callAction('delete_csv_file', { file_name });
			expect(res.result).toBe(false); // refused via the error envelope, no throw
			expect(String(res.msg)).toStartWith('Error.');
		}
		expect(existsSync(canary)).toBe(true); // nothing outside the user dir was touched
		expect(existsSync('/etc/passwd')).toBe(true);
	});

	// get_csv_files takes NO client path (it lists the confined per-user dir), so
	// it has no traversal surface to deny-test.

	test('process_uploaded_file refuses a staged source path escaping the upload root', async () => {
		for (const file_data of [
			{ key_dir: '', tmp_name: '../../../../../etc/passwd' },
			{ key_dir: '', tmp_name: '/etc/passwd' },
			{ key_dir: '../../../../../etc', tmp_name: 'passwd' },
		]) {
			const res = await callAction('process_uploaded_file', { file_data });
			expect(res.result).toBe(false);
			expect(String(res.msg)).toStartWith('Error.');
		}
		expect(existsSync('/etc/passwd')).toBe(true); // never moved into the import dir
		expect(existsSync(resolve(userDir, 'passwd'))).toBe(false);
	});

	test('process_uploaded_file refuses key_dir="../<other_uid>" claiming another user\'s staged upload (SEC parity w/ sanitize_key_dir)', async () => {
		// A victim stages an upload under their own tmp dir.
		const VICTIM = 987655;
		const victimStaging = resolve(root, config.media.upload.tmpSubdir, String(VICTIM));
		mkdirSync(victimStaging, { recursive: true });
		const victimFile = resolve(victimStaging, 'victim.csv');
		writeFileSync(victimFile, 'a;b\n1;2\n');
		try {
			// SCRATCH_USER tries to reach it via key_dir='../<VICTIM>'. That path stays
			// INSIDE the shared staging root (so the old root-only check passed), but
			// sanitizeSegment rejects the '..' segment fail-closed.
			const res = await callAction('process_uploaded_file', {
				file_data: { key_dir: `../${VICTIM}`, tmp_name: 'victim.csv' },
			});
			expect(res.result).toBe(false);
			expect(String(res.msg)).toStartWith('Error.');
			expect(existsSync(victimFile)).toBe(true); // the victim's file was NOT moved/claimed
			expect(existsSync(resolve(userDir, 'victim.csv'))).toBe(false);
		} finally {
			rmSync(victimStaging, { recursive: true, force: true });
		}
	});

	test('process_uploaded_file refuses a destination file_name escaping the import dir (staged file stays)', async () => {
		const stagingDir = resolve(root, config.media.upload.tmpSubdir, String(SCRATCH_USER), 'kd');
		mkdirSync(stagingDir, { recursive: true });
		const staged = resolve(stagingDir, 'real.csv');
		writeFileSync(staged, 'a;b\n1;2\n');
		const escaped = resolve(root, 'import', `escape_${process.pid}.csv`);
		const res = await callAction('process_uploaded_file', {
			file_data: {
				key_dir: 'kd',
				tmp_name: 'real.csv',
				file_name: `../../escape_${process.pid}.csv`,
			},
		});
		expect(res.result).toBe(false);
		expect(existsSync(staged)).toBe(true); // the source was NOT moved
		expect(existsSync(escaped)).toBe(false); // nothing landed outside the import dir
	});
});
