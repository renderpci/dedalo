/**
 * export_hierarchy.export_hierarchy — the psql dump ported natively 2026-08-19.
 *
 * The action was `engineDenied` on the premise that it "writes install hierarchy
 * dump files into the PHP tree". Post-cutover that premise is gone: the
 * destination is the ENGINE's own `install/import/hierarchy` — a fixed,
 * repo-root-derived constant (PHP took it from an `EXPORT_HIERARCHY_PATH`
 * operator constant that was never carried into the TS engine).
 *
 * What carries the risk, and is therefore driven here for real:
 *   - the tipo grammar. It is inlined into a psql `\copy` argument, where psql
 *     performs NO variable interpolation, so a bind parameter is impossible.
 *     Loosen `safeExportTipo` and the shell command is caller-shaped.
 *   - the file probe. `\copy … TO PROGRAM` reports psql's exit, not gzip's, so
 *     "the file exists" is the only honest verdict.
 *   - per-entry isolation: one bad tipo must produce an error LINE, never
 *     discard the files the other entries produced.
 *
 * SCRATCH HYGIENE: writes ride a `zzeh1` scratch section tipo in
 * matrix_hierarchy (never an install's `es1`/`rsc*` records — the generic-TLD
 * law), and the dumps land in a mkdtemp directory, NEVER in the repo's vendored
 * install/import/hierarchy — a stray `zzeh1.copy.gz` there would be offered by
 * the add_hierarchy panel as if it were a shipped hierarchy. Both are swept in
 * afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
	allScopeFileName,
	exportCopyCommand,
	exportDirRefusal,
	exportHierarchy,
	HIERARCHY_EXPORT_URL_PREFIX,
	importHint,
	parseExportScope,
	safeExportTipo,
	tableForTipo,
	widget,
} from '../../src/core/area_maintenance/widgets/export_hierarchy.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { HIERARCHY_IMPORT_DIR } from '../../src/core/install/paths.ts';

/** The scratch thesaurus tipo the row-level assertions dump. */
const SCRATCH_TIPO = 'zzeh1';
const SCRATCH_IDS = [90001, 90002];

let outDir: string;

beforeAll(async () => {
	outDir = mkdtempSync(join(tmpdir(), 'dedalo_export_hierarchy_'));
	for (const id of SCRATCH_IDS) {
		await sql`INSERT INTO matrix_hierarchy (section_id, section_tipo, data)
			VALUES (${id}, ${SCRATCH_TIPO}, ${JSON.stringify({ zzeh2: [{ value: `row ${id}` }] })}::text::jsonb)
			ON CONFLICT DO NOTHING`;
	}
});

afterAll(async () => {
	await sql`DELETE FROM matrix_hierarchy WHERE section_tipo = ${SCRATCH_TIPO}`;
	rmSync(outDir, { recursive: true, force: true });
});

describe('safeExportTipo — the shell/filename grammar', () => {
	test('accepts a real section tipo', () => {
		expect(safeExportTipo('es1')).toBe(true);
		expect(safeExportTipo('hierarchy125')).toBe(true);
	});

	test('rejects a bare tld, an uppercase or underscored name, and anything shell-shaped', () => {
		// Each of these would otherwise be inlined verbatim into the `\copy`
		// argument and into the produced file's basename.
		for (const bad of ['es', '1', 'ES1', 'zz_1', "es1'; DROP", 'es1 --help', '../es1', 'es1;ls']) {
			expect(safeExportTipo(bad), bad).toBe(false);
		}
	});
});

describe('tableForTipo — the two language sections live apart', () => {
	test('lg1 and lg2 route to matrix_langs', () => {
		expect(tableForTipo('lg1')).toBe('matrix_langs');
		expect(tableForTipo('lg2')).toBe('matrix_langs');
	});

	test('every other tipo routes to matrix_hierarchy', () => {
		expect(tableForTipo('es1')).toBe('matrix_hierarchy');
		expect(tableForTipo('lg11')).toBe('matrix_hierarchy'); // NOT a prefix match
	});
});

describe('parseExportScope — the three accepted forms', () => {
	test("'*' is every active hierarchy; 'all' is the whole table", () => {
		expect(parseExportScope('*')).toEqual({ kind: 'active' });
		expect(parseExportScope('all')).toEqual({ kind: 'all' });
	});

	test('a list is split and trimmed, empties dropped, INVALIDS KEPT', () => {
		// Invalid entries must survive parsing: they earn an error line in the
		// run. Filtering them here would make a typo vanish silently.
		expect(parseExportScope(' es1 , , ES1 ,ts1')).toEqual({
			kind: 'list',
			tipos: ['es1', 'ES1', 'ts1'],
		});
	});

	test('a non-string (or empty) input is an empty list, not a crash', () => {
		expect(parseExportScope(undefined)).toEqual({ kind: 'list', tipos: [] });
		expect(parseExportScope('   ')).toEqual({ kind: 'list', tipos: [] });
	});
});

describe('the psql command and its neighbours', () => {
	test('the copy streams through gzip to the final name in one pass', () => {
		const command = exportCopyCommand(
			'matrix_hierarchy',
			"section_tipo = 'es1'",
			'section_id ASC',
			'/tmp/es1.copy.gz',
		);
		expect(command.startsWith('\\copy (SELECT section_id,section_tipo,')).toBe(true);
		expect(command).toContain("TO PROGRAM 'gzip -c > /tmp/es1.copy.gz && sync'");
	});

	test('the import hint names the table it was produced from', () => {
		expect(importHint('matrix_langs')).toContain('\\copy matrix_langs(section_id,section_tipo,');
	});

	test("the 'all' file name is timestamped and matches the download allowlist", () => {
		const name = allScopeFileName(new Date(2026, 7, 19, 14, 25, 30));
		expect(name).toBe('all_2026-08-19_142530.copy.gz');
		expect(/^all_[0-9_-]+\.copy\.gz$/.test(name)).toBe(true);
	});

	test('a destination that would break out of the shell quoting is REFUSED', () => {
		expect(exportDirRefusal("/home/o'brien/dedalo/install/import/hierarchy")).toContain(
			'cannot be used in a shell command',
		);
	});

	test('a missing destination is refused, the real one is accepted', () => {
		expect(exportDirRefusal(join(tmpdir(), 'no_such_dedalo_export_dir'))).toContain(
			'does not exist',
		);
		expect(exportDirRefusal(HIERARCHY_IMPORT_DIR)).toBeNull();
	});
});

describe('the widget surface', () => {
	test('getValue serves the FIXED path — without it the panel renders its dead-end', async () => {
		const value = await widget.getValue?.({}, { userId: -1, isGlobalAdmin: true } as never);
		expect((value?.data as { export_hierarchy_path: string }).export_hierarchy_path).toBe(
			HIERARCHY_IMPORT_DIR,
		);
	});

	test('the export action is registered and no longer engine-denied', () => {
		expect(typeof widget.apiActions?.export_hierarchy).toBe('function');
	});
});

describe('a real dump of a scratch tipo', () => {
	test('produces a gzip file whose rows are the ones asked for', async () => {
		const response = await exportHierarchy({ section_tipo: SCRATCH_TIPO }, { outDir });
		expect(response.errors ?? []).toEqual([]);
		expect(response.data).toBe(true);

		const files = (
			response.extend as {
				files: { file_name: string; url: string; bytes: number | null; table: string }[];
			}
		).files;
		expect(files).toHaveLength(1);
		expect(files[0]?.file_name).toBe(`${SCRATCH_TIPO}.copy.gz`);
		expect(files[0]?.table).toBe('matrix_hierarchy');
		expect(files[0]?.url).toBe(`${HIERARCHY_EXPORT_URL_PREFIX}${SCRATCH_TIPO}.copy.gz`);
		expect(files[0]?.bytes).toBeGreaterThan(0);

		const text = gunzipSync(readFileSync(join(outDir, `${SCRATCH_TIPO}.copy.gz`))).toString('utf8');
		for (const id of SCRATCH_IDS) expect(text).toContain(String(id));
		// Scoped, not the whole table: no other section_tipo rode along.
		for (const line of text.split('\n').filter((l) => l !== '')) {
			expect(line.split('\t')[1]).toBe(SCRATCH_TIPO);
		}
	});

	test('an invalid tipo is an error LINE and writes nothing — the valid one still lands', async () => {
		const response = await exportHierarchy(
			{ section_tipo: `bad tipo,${SCRATCH_TIPO}` },
			{ outDir },
		);
		expect(response.data).toBe(true); // the good one produced a file
		expect(response.errors?.[0]).toContain('Ignored invalid section tipo: bad tipo');
		expect((response.extend as { files: unknown[] }).files).toHaveLength(1);
		expect(existsSync(join(outDir, 'bad tipo.copy.gz'))).toBe(false);
	});

	test('an unusable destination refuses the whole run without throwing', async () => {
		const response = await exportHierarchy(
			{ section_tipo: SCRATCH_TIPO },
			{ outDir: join(tmpdir(), 'no_such_dedalo_export_dir') },
		);
		expect(response.data).toBe(false);
		expect(response.errors?.[0]).toContain('does not exist');
		expect((response.extend as { files: unknown[] }).files).toHaveLength(0);
	});
});
