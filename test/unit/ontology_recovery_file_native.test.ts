/**
 * Ontology recovery-file pair + restoreSnapshots (CRAP tier-2, item 2.4).
 *
 * Targets:
 *   src/core/ontology/recovery_file.ts  buildRecoveryVersionFile / restoreDdOntologyRecoveryFromFile
 *   src/core/ontology/ontology_update.ts restoreSnapshots
 *
 * Scratch surfaces (namespace zzt04 / section ids 904000-904999):
 *   - matrix_ontology rows with section_tipo IN ('zzt04','zzt04b'), section_id 904001..904003
 *   - matrix_time_machine rows for those tipos (none are written, swept + asserted anyway)
 *   - the dd_ontology_recovery slice table (created and dropped by the code under test)
 *   - a mkdtemp() scratch directory for every .gz / .copy artifact
 *
 * NEVER assert a table-global count: every count here is a delta taken inside the
 * same test body, or is scoped to the zzt04 namespace.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { sql } from '../../src/core/db/postgres.ts';
import { connFromConfig, type DbConnDescriptor } from '../../src/core/install/pg_exec.ts';
import { restoreSnapshots, snapshotTableRows } from '../../src/core/ontology/ontology_update.ts';
import {
	buildRecoveryVersionFile,
	RECOVERY_PRESERVE_TLDS,
	restoreDdOntologyRecoveryFromFile,
} from '../../src/core/ontology/recovery_file.ts';

const TIPO_A = 'zzt04';
const TIPO_B = 'zzt04b';
const IDS = [904001, 904002, 904003];

let workDir = '';
let conn: DbConnDescriptor;

/** All matrix_ontology rows of one scratch tipo, ordered, as plain objects. */
async function readScratchRows(tipo: string): Promise<Record<string, unknown>[]> {
	const rows = await sql.unsafe(
		`SELECT section_id, section_tipo, data::text AS data, string::text AS string
		 FROM matrix_ontology WHERE section_tipo = $1 ORDER BY section_id ASC`,
		[tipo],
	);
	return (rows as unknown as Record<string, unknown>[]).map((row) => ({ ...row }));
}

async function seedScratchRows(tipo: string, ids: number[], marker: string): Promise<void> {
	await sql.unsafe(`DELETE FROM matrix_ontology WHERE section_tipo = $1`, [tipo]);
	for (const id of ids) {
		await sql.unsafe(
			`INSERT INTO matrix_ontology (section_id, section_tipo, data)
			 VALUES ($1, $2, $3::text::jsonb)`,
			[String(id), tipo, JSON.stringify({ marker, id })],
		);
	}
}

beforeAll(() => {
	conn = connFromConfig();
	workDir = mkdtempSync(join(tmpdir(), 'zzt04-recovery-'));
	// confinedPath() rejects whitespace/quotes anywhere in the resolved path, and
	// importFromCopyFile screens filePath with /^[a-zA-Z0-9_/.-]+$/ — fail loud
	// here rather than as a confusing "file_path is not valid" three tests later.
	expect(/^[a-zA-Z0-9_/.-]+$/.test(workDir)).toBe(true);
});

afterAll(async () => {
	rmSync(workDir, { recursive: true, force: true });
	await sql.unsafe(`DROP TABLE IF EXISTS "dd_ontology_recovery" CASCADE`, []);
	for (const tipo of [TIPO_A, TIPO_B]) {
		await sql.unsafe(`DELETE FROM matrix_ontology WHERE section_tipo = $1`, [tipo]);
		await sql.unsafe(`DELETE FROM matrix_time_machine WHERE section_tipo = $1`, [tipo]);
	}
	const left = await sql.unsafe(
		`SELECT
			(SELECT count(*)::int FROM matrix_ontology WHERE section_tipo IN ($1, $2)) AS matrix_left,
			(SELECT count(*)::int FROM matrix_time_machine WHERE section_tipo IN ($1, $2)) AS tm_left,
			(SELECT count(*)::int FROM matrix_ontology WHERE section_id::int BETWEEN 904000 AND 904999) AS range_left,
			(SELECT to_regclass('dd_ontology_recovery')::text) AS slice`,
		[TIPO_A, TIPO_B],
	);
	const row = (left as unknown as Record<string, unknown>[])[0];
	// Fail loud: a half-cleaned scratch surface poisons every later suite run.
	expect(row).toBeDefined();
	expect(row?.matrix_left).toBe(0);
	expect(row?.tm_left).toBe(0);
	expect(row?.range_left).toBe(0);
	expect(row?.slice).toBeNull();
});

// ---------------------------------------------------------------------------
// buildRecoveryVersionFile
// ---------------------------------------------------------------------------

describe('buildRecoveryVersionFile', () => {
	test('RECOVERY_PRESERVE_TLDS is the PHP installer whitelist, in order', () => {
		expect([...RECOVERY_PRESERVE_TLDS]).toEqual([
			'dd',
			'rsc',
			'lg',
			'hierarchy',
			'ontology',
			'ontologytype',
			'test',
		]);
	});

	test('happy path dumps ONLY whitelisted tlds and drops the slice afterwards', async () => {
		const outFile = join(workDir, 'build_ok.sql.gz');
		// DEFAULT conn on purpose: createRecoverySlice runs on the global pool, so a
		// foreign conn would dump a header-only (empty) table.
		const response = await buildRecoveryVersionFile(conn, outFile);

		expect(response.errors).toEqual([]);
		expect(response.result).toBe(true);
		expect(response.msg).toBe('OK. Request done successfully');
		expect(response.file_size).toBe(`${statSync(outFile).size} Bytes`);

		const plain = gunzipSync(readFileSync(outFile)).toString('utf8');
		const { columns, rows } = parseCopyBlock(plain, 'dd_ontology_recovery');
		const tldIndex = columns.indexOf('tld');
		expect(tldIndex).toBeGreaterThanOrEqual(0);
		expect(rows.length).toBeGreaterThan(0);
		const tlds = new Set(rows.map((cells) => cells[tldIndex]));
		for (const tld of tlds) {
			expect(RECOVERY_PRESERVE_TLDS as readonly string[]).toContain(tld as string);
		}
		expect(tlds.has('dd')).toBe(true);

		// the finally-block drop always runs
		const after = await sql.unsafe(`SELECT to_regclass('dd_ontology_recovery')::text AS t`, []);
		expect((after as unknown as { t: string | null }[])[0]?.t).toBeNull();
	}, 60_000);

	test('pg_dump failure leaves NO artifact in the recovery slot (D9 fixed 2026-08-09)', async () => {
		const outFile = join(workDir, 'build_fail.sql.gz');
		const badConn: DbConnDescriptor = { ...conn, database: 'zzt04_no_such_database' };
		const response = await buildRecoveryVersionFile(badConn, outFile);

		expect(response.result).toBe(false);
		expect(response.msg).toBe('Error. pg_dump failed building the recovery file');
		expect(response.errors[0]?.startsWith('pg_dump failed:')).toBe(true);
		expect(response.file_size).toBeUndefined();

		// D9 FIXED 2026-08-09 (.part + rename): the dump streams to `<out>.part`
		// and is renamed onto the slot only after pg_dump exits 0, so a failure
		// can no longer overwrite the last good recovery artifact with a
		// partial-but-valid gzip that restores as a silently truncated table.
		expect(existsSync(outFile)).toBe(false);
		expect(existsSync(`${outFile}.part`)).toBe(false);

		const after = await sql.unsafe(`SELECT to_regclass('dd_ontology_recovery')::text AS t`, []);
		expect((after as unknown as { t: string | null }[])[0]?.t).toBeNull();
	}, 60_000);

	test('a failed build does not destroy the PREVIOUS recovery artifact (D9)', async () => {
		// The production caller passes no outFile, so every failure landed on the
		// single RECOVERY_FILE_PATH slot — this is the loss that D9 caused.
		const outFile = join(workDir, 'build_keeps_previous.sql.gz');
		const previous = gzipSync(Buffer.from('-- previous good dump\n'));
		writeFileSync(outFile, previous);

		const badConn: DbConnDescriptor = { ...conn, database: 'zzt04_no_such_database' };
		const response = await buildRecoveryVersionFile(badConn, outFile);

		expect(response.result).toBe(false);
		expect(readFileSync(outFile)).toEqual(previous);
		expect(existsSync(`${outFile}.part`)).toBe(false);
	}, 60_000);
});

// ---------------------------------------------------------------------------
// restoreDdOntologyRecoveryFromFile
// ---------------------------------------------------------------------------

describe('restoreDdOntologyRecoveryFromFile', () => {
	test('missing source file is refused with the PHP byte message', async () => {
		const missing = join(workDir, 'not_here.sql.gz');
		expect(existsSync(missing)).toBe(false);
		const response = await restoreDdOntologyRecoveryFromFile(conn, missing);
		expect(response).toEqual({
			result: false,
			msg: 'Error. source sql_file do not exists',
			errors: ['source sql_file do not exists'],
		});
	});

	test('restore recreates the slice table and leaves dd_ontology untouched', async () => {
		const outFile = join(workDir, 'restore_scope.sql.gz');
		const built = await buildRecoveryVersionFile(conn, outFile);
		expect(built.result).toBe(true);

		// Baselines taken immediately before the restore (never suite-global truth).
		const before = await sql.unsafe(
			`SELECT (SELECT count(*)::int FROM dd_ontology) AS n,
			        (SELECT row_to_json(t)::text FROM (SELECT * FROM dd_ontology ORDER BY tipo ASC LIMIT 1) t) AS sample,
			        (SELECT count(*)::int FROM dd_ontology WHERE tld = ANY($1::text[])) AS whitelisted`,
			[whitelistLiteral()],
		);
		const baseline = (before as unknown as Record<string, unknown>[])[0];
		expect(baseline?.n).toBeGreaterThan(0);
		expect(baseline?.whitelisted).toBeGreaterThan(0);
		// The whitelist is a real subset here, so "restored dd_ontology by accident"
		// would be visible as a count change.
		expect(baseline?.whitelisted).toBeLessThan(baseline?.n as number);

		const response = await restoreDdOntologyRecoveryFromFile(conn, outFile);
		expect(response.errors).toEqual([]);
		expect(response.result).toBe(true);
		expect(response.msg).toBe('OK. Request done successfully');

		const after = await sql.unsafe(
			`SELECT (SELECT count(*)::int FROM dd_ontology) AS n,
			        (SELECT row_to_json(t)::text FROM (SELECT * FROM dd_ontology ORDER BY tipo ASC LIMIT 1) t) AS sample,
			        (SELECT count(*)::int FROM dd_ontology_recovery) AS slice_n,
			        (SELECT to_regclass('dd_ontology_recovery')::text) AS slice`,
			[],
		);
		const now = (after as unknown as Record<string, unknown>[])[0];
		expect(now?.slice).toBe('dd_ontology_recovery');
		expect(now?.slice_n).toBe(baseline?.whitelisted);
		expect(now?.n).toBe(baseline?.n);
		expect(now?.sample).toBe(baseline?.sample as string);

		// the uncompressed intermediate is always removed
		expect(existsSync(outFile.slice(0, -'.gz'.length))).toBe(false);

		await sql.unsafe(`DROP TABLE IF EXISTS "dd_ontology_recovery" CASCADE`, []);
	}, 90_000);

	test('bad SQL fails through ON_ERROR_STOP and still removes the plain file', async () => {
		const outFile = join(workDir, 'restore_bad.sql.gz');
		writeFileSync(outFile, gzipSync(Buffer.from('SELECT this is not sql;\n', 'utf8')));
		const response = await restoreDdOntologyRecoveryFromFile(conn, outFile);

		expect(response.result).toBe(false);
		expect(response.msg).toBe('Error. Request failed [restore_dd_ontology_recovery_from_file]');
		expect(response.errors[0]?.startsWith('psql restore failed:')).toBe(true);
		expect(existsSync(outFile.slice(0, -'.gz'.length))).toBe(false);
	}, 60_000);

	test('a non-gzip source fails in the gunzip step, not in psql', async () => {
		const outFile = join(workDir, 'restore_notgz.sql.gz');
		writeFileSync(outFile, Buffer.from('this is not gzip at all', 'utf8'));
		const response = await restoreDdOntologyRecoveryFromFile(conn, outFile);

		expect(response.result).toBe(false);
		expect(response.msg).toBe('Error. Request failed [restore_dd_ontology_recovery_from_file]');
		expect(response.errors.length).toBe(1);
		expect(response.errors[0]?.startsWith('psql restore failed:')).toBe(false);
		expect(existsSync(outFile.slice(0, -'.gz'.length))).toBe(false);
	}, 60_000);
});

// ---------------------------------------------------------------------------
// restoreSnapshots
// ---------------------------------------------------------------------------

describe('restoreSnapshots', () => {
	test('undoes a SUCCESSFUL destructive import, byte for byte', async () => {
		await seedScratchRows(TIPO_A, IDS, 'original');
		const original = await readScratchRows(TIPO_A);
		expect(original.length).toBe(3);

		const snapshot = join(workDir, `${TIPO_A}.copy`);
		const ok = await snapshotTableRows('matrix_ontology', TIPO_A, snapshot, conn);
		expect(ok).toBe(true);
		expect(statSync(snapshot).size).toBeGreaterThan(0);

		// Destructive step that COMMITS: replace the three rows with one different
		// row through the same importFromCopyFile the pipeline uses.
		const replacement = join(workDir, `${TIPO_A}_replacement.copy`);
		writeFileSync(replacement, copyLine(904009, TIPO_A, { marker: 'REPLACED', id: 904009 }));
		const { importFromCopyFile } = await import('../../src/core/ontology/data_io_import.ts');
		const imported = await importFromCopyFile({
			filePath: replacement,
			matrixTable: 'matrix_ontology',
			sectionTipo: TIPO_A,
			conn,
		});
		expect(imported.errors).toEqual([]);
		expect(imported.result).toBe(true);

		// state really CHANGED (without this the restore assertion is vacuous)
		const mutated = await readScratchRows(TIPO_A);
		expect(mutated.length).toBe(1);
		expect(Number(mutated[0]?.section_id)).toBe(904009);
		expect(mutated).not.toEqual(original);

		const errors: string[] = [];
		await restoreSnapshots(
			[{ tld: TIPO_A, sectionTipo: TIPO_A, stagedPath: replacement }],
			workDir,
			conn,
			errors,
		);
		expect(errors).toEqual([]);
		expect(await readScratchRows(TIPO_A)).toEqual(original);
	}, 90_000);

	test('restores ONLY the listed tld — a sibling section_tipo is untouched', async () => {
		await seedScratchRows(TIPO_A, IDS, 'a-original');
		await seedScratchRows(TIPO_B, [904011, 904012], 'b-untouched');
		const bBefore = await readScratchRows(TIPO_B);
		expect(bBefore.length).toBe(2);

		const snapshot = join(workDir, `${TIPO_A}.copy`);
		expect(await snapshotTableRows('matrix_ontology', TIPO_A, snapshot, conn)).toBe(true);

		// mutate BOTH tipos, then restore only A
		await sql.unsafe(`DELETE FROM matrix_ontology WHERE section_tipo = $1`, [TIPO_A]);
		expect((await readScratchRows(TIPO_A)).length).toBe(0);

		const errors: string[] = [];
		await restoreSnapshots(
			[{ tld: TIPO_A, sectionTipo: TIPO_A, stagedPath: snapshot }],
			workDir,
			conn,
			errors,
		);
		expect(errors).toEqual([]);
		expect((await readScratchRows(TIPO_A)).length).toBe(3);
		expect(await readScratchRows(TIPO_B)).toEqual(bBefore);
	}, 90_000);

	test('a missing snapshot is reported loudly and does not stop the other files', async () => {
		await seedScratchRows(TIPO_A, IDS, 'still-here');
		const before = await readScratchRows(TIPO_A);
		const snapshot = join(workDir, `${TIPO_A}.copy`);
		expect(await snapshotTableRows('matrix_ontology', TIPO_A, snapshot, conn)).toBe(true);
		await sql.unsafe(`DELETE FROM matrix_ontology WHERE section_tipo = $1`, [TIPO_A]);

		const errors: string[] = [];
		await restoreSnapshots(
			[
				{ tld: 'zzt04missing', sectionTipo: 'zzt04missing', stagedPath: '' },
				{ tld: TIPO_A, sectionTipo: TIPO_A, stagedPath: snapshot },
			],
			workDir,
			conn,
			errors,
		);
		expect(errors).toEqual([
			'recovery snapshot missing for zzt04missing — MANUAL RESTORE REQUIRED',
		]);
		// the second entry still ran
		expect(await readScratchRows(TIPO_A)).toEqual(before);
	}, 90_000);

	test('a path-traversing tld is refused as a missing snapshot (confinedPath)', async () => {
		const errors: string[] = [];
		await restoreSnapshots(
			[{ tld: '../escape', sectionTipo: TIPO_A, stagedPath: '' }],
			workDir,
			conn,
			errors,
		);
		expect(errors).toEqual(['recovery snapshot missing for ../escape — MANUAL RESTORE REQUIRED']);
	});

	test('a failed import is reported as RESTORE FAILED naming the snapshot', async () => {
		await seedScratchRows(TIPO_A, IDS, 'survivor');
		const before = await readScratchRows(TIPO_A);

		// A malformed .copy: wrong tab arity ⇒ importFromCopyFile refuses BEFORE any
		// destructive statement, so the rows must survive.
		const snapshot = join(workDir, `${TIPO_A}.copy`);
		// Two DISTINCT lines: copySanityCheck tolerates a possibly-truncated last
		// line (compared by value), so a one-line — or two identical-line — file
		// would slip past the arity check and only fail inside psql.
		writeFileSync(snapshot, 'only\tthree\tcolumns\nand\tanother\trow\n');

		const errors: string[] = [];
		await restoreSnapshots(
			[{ tld: TIPO_A, sectionTipo: TIPO_A, stagedPath: snapshot }],
			workDir,
			conn,
			errors,
		);
		expect(errors.length).toBe(1);
		expect(errors[0]?.startsWith(`RESTORE FAILED for ${TIPO_A}: `)).toBe(true);
		expect(errors[0]).toContain('copy sanity check failed');
		expect(errors[0]).toContain(`MANUAL RESTORE REQUIRED from ${snapshot}`);
		expect(await readScratchRows(TIPO_A)).toEqual(before);
	}, 60_000);

	test('an empty file list is a no-op', async () => {
		const errors: string[] = [];
		await restoreSnapshots([], workDir, conn, errors);
		expect(errors).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** The whitelist as a Postgres text[] literal (the driver does not bind JS arrays). */
function whitelistLiteral(): string {
	return `{${RECOVERY_PRESERVE_TLDS.join(',')}}`;
}

/** One MATRIX_COPY_COLUMNS-shaped COPY text line (13 columns, 12 tabs). */
function copyLine(sectionId: number, sectionTipo: string, data: unknown): string {
	const cells = [
		String(sectionId),
		sectionTipo,
		JSON.stringify(data),
		'\\N',
		'\\N',
		'\\N',
		'\\N',
		'\\N',
		'\\N',
		'\\N',
		'\\N',
		'\\N',
		'\\N',
	];
	return `${cells.join('\t')}\n`;
}

/** Extract the `COPY … FROM stdin;` block of `table` from a plain pg_dump. */
function parseCopyBlock(dump: string, table: string): { columns: string[]; rows: string[][] } {
	const lines = dump.split('\n');
	const headerIndex = lines.findIndex(
		(line) => line.startsWith('COPY ') && line.includes(table) && line.endsWith('FROM stdin;'),
	);
	if (headerIndex === -1) throw new Error(`no COPY block for ${table} in the dump`);
	const header = lines[headerIndex] as string;
	const columns = (header.slice(header.indexOf('(') + 1, header.lastIndexOf(')')) as string)
		.split(',')
		.map((name) => name.trim().replace(/^"|"$/g, ''));
	const rows: string[][] = [];
	for (let index = headerIndex + 1; index < lines.length; index += 1) {
		const line = lines[index] as string;
		if (line === '\\.') break;
		rows.push(line.split('\t'));
	}
	return { columns, rows };
}
