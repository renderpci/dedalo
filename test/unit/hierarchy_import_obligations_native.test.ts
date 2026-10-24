/**
 * A THESAURUS IMPORT / RESET OWES THE RECORD-DATA FAN-OUT (cross-ops:r2 S2).
 *
 * THE DEFECT. `importHierarchyRows` (the installer's hierarchy step and the
 * add_hierarchy widget — "Install" and the confirmed "Reset to seed") writes
 * matrix_hierarchy through ONE out-of-band psql session: on reset a scoped
 * `DELETE … WHERE section_tipo ~ '^<tld>[0-9]+$'`, then the `\copy` of the listed
 * files. Nothing fired the save/delete event channel (save_event.ts fireSaveEvent),
 * so every data-derived cache keyed on `<tld>1` / `<tld>2` (datalists, browse counts,
 * select_lang, …) kept serving the pre-reset terms until the process restarted —
 * deleted operator terms still offered, edited labels still shown. And the import
 * stored the files' PHP-era STRING record addresses verbatim (a writer minting the
 * repealed form — WC-2026-10-21-seed-and-thesaurus-int-clean).
 *
 * THE LAW (measured through the REAL psql path on scratch tld `zzhio`, the lane
 * SUITE database, a section-data listener standing for every data cache):
 *  (a) an import fires the channel for every LISTED section once it COMMITTED;
 *  (b) a reset fires it too for every `<tld>N` section its DELETE emptied — one the
 *      files do not list included;
 *  (c) an import that rolled back fires nothing (nothing changed);
 *  (d) the imported rows carry their record addresses in the INT form, every other
 *      value as the file had it.
 *  (e) STREAMED, STILL VERIFIED BEFORE COMMITTED: a file whose bytes no longer hash to
 *      the digest verified before the load (changed under it) fails the unit before its
 *      COMMIT — a reset's DELETE, already sent, rolls back with it: the operator's rows
 *      are intact.
 * The obligations an import deliberately does NOT run (RAG, observer mirrors,
 * diffusion, Time Machine) are declared next to the code
 * (hierarchy_import.ts HIERARCHY_IMPORT_SKIPPED_OBLIGATIONS) and censused by
 * psql_matrix_write_obligations_tripwire.
 *
 * SURFACES. assertTestDatabase first; `zzhio1/2/3` rows of matrix_hierarchy and their
 * matrix_counter rows, swept before and after; the seed files in a mkdtemp dir.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { encodeCopyField } from '../../src/core/db/copy_text.ts';
import { MATRIX_COPY_COLUMNS } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { importHierarchyRows, runImportUnit } from '../../src/core/install/hierarchy_import.ts';
import { connFromConfig } from '../../src/core/install/pg_exec.ts';
import {
	type HierarchyDataFile,
	sha256Hex,
} from '../../src/core/ontology/hierarchy_manifest_format.ts';
import {
	registerSectionDataListener,
	unregisterSectionDataListener,
} from '../../src/core/section_record/save_event.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const TLD = 'zzhio';
const conn = connFromConfig();
let importDir = '';

/** The sections the channel was told about, in order (a data cache's view of the world). */
const notified: string[] = [];
const listener = (sectionTipo: string): void => {
	if (sectionTipo.startsWith(TLD)) notified.push(sectionTipo);
};

async function sweep(): Promise<void> {
	await sql.unsafe(`DELETE FROM matrix_hierarchy WHERE section_tipo ~ '^${TLD}[0-9]+$'`, []);
	await sql.unsafe(`DELETE FROM matrix_counter WHERE tipo ~ '^${TLD}[0-9]+$'`, []);
}

/** One COPY row (MATRIX_COPY_COLUMNS order). */
function copyRow(sectionTipo: string, sectionId: number, columns: Record<string, unknown>): string {
	return MATRIX_COPY_COLUMNS.map((column) => {
		if (column === 'section_id') return String(sectionId);
		if (column === 'section_tipo') return sectionTipo;
		const value = columns[column];
		return encodeCopyField(value === undefined ? null : JSON.stringify(value));
	}).join('\t');
}

/** Write one listed data file; answers its manifest `data_files` item. */
function writeListed(section: string, rows: string[]): HierarchyDataFile {
	const bytes = gzipSync(Buffer.from(`${rows.join('\n')}\n`));
	writeFileSync(join(importDir, `${section}.copy.gz`), bytes);
	return { file: `${section}.copy.gz`, sha256: sha256Hex(bytes) };
}

/** The PHP-era shape: string record addresses, a float the jsonb keeps as written. */
const TERMS = [
	copyRow(`${TLD}1`, 1, {
		data: { label: 'term one' },
		relation: {
			hierarchy36: [{ type: 'dd47', section_id: '2', section_tipo: `${TLD}1` }],
			dd197: [{ type: 'dd151', section_id: '-1', section_tipo: 'dd128' }],
		},
	}),
	copyRow(`${TLD}1`, 2, {
		data: { label: 'term two' },
		relation: { hierarchy36: [{ section_id: '001338683', section_tipo: 'zzhiox1' }] },
	}),
];
const MODELS = [copyRow(`${TLD}2`, 1, { data: { label: 'model' } })];

beforeAll(async () => {
	await assertTestDatabase('hierarchy_import_obligations_native');
	const [db] = (await sql.unsafe('SELECT current_database() AS name', [])) as { name: string }[];
	expect(conn.database).toBe(db?.name ?? '');
	importDir = mkdtempSync(join(tmpdir(), 'dedalo-hierarchy-obligations-'));
	registerSectionDataListener(listener);
});

afterAll(async () => {
	unregisterSectionDataListener(listener);
	await sweep();
	rmSync(importDir, { recursive: true, force: true });
});

beforeEach(async () => {
	await sweep();
	notified.length = 0;
});

describe('importHierarchyRows fires the record-data channel for what it changed', () => {
	test('(a) an import notifies every LISTED section once it committed', async () => {
		const dataFiles = [writeListed(`${TLD}1`, TERMS), writeListed(`${TLD}2`, MODELS)];
		const result = await importHierarchyRows(conn, TLD, { importDir, dataFiles });
		expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
		// Non-vacuity: the listener really sees the channel (the "nothing" legs below lean on it).
		expect(notified.length).toBeGreaterThan(0);
		expect([...new Set(notified)].sort()).toEqual([`${TLD}1`, `${TLD}2`]);
	});

	test('(b) a reset notifies every section its DELETE emptied — one the files do not list included', async () => {
		await sql.unsafe(
			`INSERT INTO matrix_hierarchy (section_id, section_tipo, data) VALUES (1, '${TLD}1', '{}'), (5, '${TLD}3', '{}')`,
			[],
		);
		const dataFiles = [writeListed(`${TLD}1`, TERMS)];
		const result = await importHierarchyRows(conn, TLD, { replace: true, importDir, dataFiles });
		expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
		expect([...new Set(notified)].sort()).toEqual([`${TLD}1`, `${TLD}3`]);
		const left = (await sql.unsafe(
			`SELECT section_tipo FROM matrix_hierarchy WHERE section_tipo = '${TLD}3'`,
			[],
		)) as unknown[];
		expect(left).toHaveLength(0);
	});

	test('(c) an import that rolled back notifies nothing', async () => {
		const dataFiles = [writeListed(`${TLD}1`, [...TERMS, 'not-an-integer\tzzhio1'])];
		const result = await importHierarchyRows(conn, TLD, { replace: true, importDir, dataFiles });
		expect(result.ok).toBe(false);
		expect(notified).toEqual([]);
	});
});

describe('importHierarchyRows stores record addresses in the int form', () => {
	test('(d) convertible strings land as ints; an external id and every other value as written', async () => {
		const dataFiles = [writeListed(`${TLD}1`, TERMS)];
		const result = await importHierarchyRows(conn, TLD, { importDir, dataFiles });
		expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
		const rows = (await sql.unsafe(
			`SELECT section_id, relation::text AS relation, data::text AS data FROM matrix_hierarchy
			  WHERE section_tipo = '${TLD}1' ORDER BY section_id`,
			[],
		)) as { section_id: number; relation: string; data: string }[];
		expect(rows.map((row) => JSON.parse(row.relation))).toEqual([
			{
				dd197: [{ type: 'dd151', section_id: -1, section_tipo: 'dd128' }],
				hierarchy36: [{ type: 'dd47', section_id: 2, section_tipo: `${TLD}1` }],
			},
			{ hierarchy36: [{ section_id: '001338683', section_tipo: 'zzhiox1' }] },
		]);
		expect(rows.map((row) => JSON.parse(row.data))).toEqual([
			{ label: 'term one' },
			{ label: 'term two' },
		]);
	});
});

describe('runImportUnit refuses a file that changed after it was verified', () => {
	test('(e) the digest is re-checked as the bytes stream: nothing commits, the reset DELETE rolls back', async () => {
		await sql.unsafe(
			`INSERT INTO matrix_hierarchy (section_id, section_tipo, data) VALUES (1, '${TLD}1', '{"operator": true}')`,
			[],
		);
		const listed = writeListed(`${TLD}1`, TERMS);
		const path = join(importDir, listed.file);
		// Verified as one file, loaded as another: the digest the unit holds is not these bytes'.
		const verified = {
			file: listed.file,
			path,
			sha256: 'f'.repeat(64),
			section: `${TLD}1`,
			rows: 2,
		};
		const result = await runImportUnit(conn, TLD, true, {
			files: [verified],
			dataRows: new Map([[`${TLD}1`, 2]]),
		});
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain(`${TLD}1.copy.gz changed while it was imported`);
		const rows = (await sql.unsafe(
			`SELECT section_id, data::text AS data FROM matrix_hierarchy WHERE section_tipo ~ '^${TLD}[0-9]+$'`,
			[],
		)) as { section_id: number; data: string }[];
		expect(rows.map((row) => `${row.section_id}:${row.data}`)).toEqual(['1:{"operator": true}']);
		expect(notified).toEqual([]);
	});
});
