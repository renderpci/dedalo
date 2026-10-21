/**
 * export_hierarchy — a FAILED or TORN dump never reaches the final name, and
 * hierarchy.json never certifies one (review-diff 2026-10-21, ops-durability S2).
 *
 * The defect it pins: the dump streamed `gzip -c > <tipo>.copy.gz` straight to
 * the FINAL name and judged the run by "the file exists" alone, never by psql's
 * exit code. psql opens the gzip pipe BEFORE the server answers, so a COPY that
 * fails (a server error, a cancelled backend, a dropped connection) still leaves
 * a valid — but short or empty — gzip stream at the final name, reported "OK";
 * and the manifest action then digested it, so the installer's checksum check
 * passed and a fresh install imported a partial thesaurus.
 *
 * The failures are REAL where they can be: a psql whose COPY really errors on
 * the server (the injected runner rewrites the WHERE so the scan divides by zero
 * — real psql, real gzip, real produced file). Where the real stack cannot be
 * made to fail on demand (a torn stream with exit 0, a row count that disagrees),
 * the injected runner runs the real dump and then damages its output.
 *
 * SCRATCH: an ACTIVE `zzep` registry row + two `zzep1` term rows in the suite DB
 * (never an install's hierarchy), dumps into a mkdtemp directory. Swept after.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	truncateSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
	exportHierarchy,
	exportHierarchyJson,
} from '../../src/core/area_maintenance/widgets/export_hierarchy.ts';
import {
	deleteMatrixRecord,
	insertMatrixRecordWithCounter,
} from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { type PsqlRunResult, runPsql } from '../../src/core/install/pg_exec.ts';
import {
	HIERARCHY_MANIFEST_FILE,
	parseHierarchyManifestText,
	sha256Hex,
} from '../../src/core/ontology/hierarchy_manifest_format.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const TLD = 'zzep';
const TIPO = 'zzep1';
const FILE = `${TIPO}.copy.gz`;
const IDS = [90011, 90012];
const SPANISH_LG1 = 17344;
const REGISTRY_TABLE = 'matrix_hierarchy_main';
const REGISTRY = 'hierarchy1';
const registryIds: number[] = [];
let outDir: string;

const dd64 = (tipo: string, id: 1 | 2) => [
	{ id: 1, type: 'dd151', section_id: id, section_tipo: 'dd64', from_component_tipo: tipo },
];
const text = (value: string) => [{ id: 1, lang: 'lg-nolan', value }];

async function sweep(): Promise<void> {
	await sql`DELETE FROM matrix_hierarchy WHERE section_tipo = ${TIPO}`;
	await sql.unsafe(
		`DELETE FROM "${REGISTRY_TABLE}" WHERE section_tipo = $1
		   AND lower(string->'hierarchy6'->0->>'value') = $2`,
		[REGISTRY, TLD],
	);
	for (const id of registryIds.splice(0)) await deleteMatrixRecord(REGISTRY_TABLE, REGISTRY, id);
}

beforeAll(async () => {
	await assertTestDatabase('export_hierarchy_partial_dump_native');
	await sweep();
	outDir = mkdtempSync(join(tmpdir(), 'dedalo_export_partial_'));
	registryIds.push(
		await insertMatrixRecordWithCounter(REGISTRY_TABLE, REGISTRY, {
			string: {
				hierarchy5: [{ id: 1, lang: 'lg-eng', value: 'Scratch zzep' }],
				hierarchy6: text(TLD.toUpperCase()),
				hierarchy53: text(TIPO),
				hierarchy58: text(`${TLD}2`),
				hierarchy109: text('hierarchy20'),
			},
			relation: {
				hierarchy4: dd64('hierarchy4', 1),
				hierarchy125: dd64('hierarchy125', 1),
				hierarchy8: [
					{
						id: 1,
						type: 'dd151',
						section_id: SPANISH_LG1,
						section_tipo: 'lg1',
						from_component_tipo: 'hierarchy8',
					},
				],
				hierarchy9: [
					{
						id: 1,
						type: 'dd151',
						section_id: 2,
						section_tipo: 'hierarchy13',
						from_component_tipo: 'hierarchy9',
					},
				],
			},
		}),
	);
	for (const id of IDS) {
		await sql`INSERT INTO matrix_hierarchy (section_id, section_tipo, data)
			VALUES (${id}, ${TIPO}, ${JSON.stringify({ zzep2: [{ value: `row ${id}` }] })}::text::jsonb)
			ON CONFLICT DO NOTHING`;
	}
});

afterAll(async () => {
	await sweep();
	rmSync(outDir, { recursive: true, force: true });
});

/** The file the copy command pipes gzip into (whatever name the export chose). */
function gzipTarget(args: readonly string[]): string {
	const match = /gzip -c > (\S+) && sync/.exec(args.join(' '));
	if (match?.[1] === undefined) throw new Error('no gzip target in the psql command');
	return match[1];
}

/** A REAL psql whose COPY fails on the server: the scan divides by zero. */
const failingPsql = (conn: Parameters<typeof runPsql>[0], args: string[]) =>
	runPsql(
		conn,
		args.map((arg) =>
			arg.replace(
				`WHERE section_tipo = '${TIPO}'`,
				`WHERE section_tipo = '${TIPO}' AND 1 / (section_id - ${IDS[1]}) IS NOT NULL`,
			),
		),
	);

/** The real dump, then its gzip stream TORN (exit 0 — the damage psql never saw). */
const tearingPsql = async (
	conn: Parameters<typeof runPsql>[0],
	args: string[],
): Promise<PsqlRunResult> => {
	const run = await runPsql(conn, args);
	const target = gzipTarget(args);
	truncateSync(target, Math.max(1, readFileSync(target).byteLength - 12));
	return run;
};

/** The real dump, but psql's reported row count disagrees with the file. */
const miscountingPsql = async (
	conn: Parameters<typeof runPsql>[0],
	args: string[],
): Promise<PsqlRunResult> => {
	const run = await runPsql(conn, args);
	return { ...run, stdout: run.stdout.replace(/COPY (\d+)/, (_all, n) => `COPY ${Number(n) + 1}`) };
};

/**
 * The real, whole dump — but psql exits nonzero (gzip or `sync` failed at the pipe's
 * close, after the rows were counted): only the exit code says so.
 */
const exitingPsql = async (
	conn: Parameters<typeof runPsql>[0],
	args: string[],
): Promise<PsqlRunResult> => {
	const run = await runPsql(conn, args);
	return { ...run, exitCode: 1, stderr: 'program "gzip" failed' };
};

/** Every name in the export directory that is not the final dump or the manifest. */
function residue(): string[] {
	return readdirSync(outDir).filter((name) => name !== FILE && name !== HIERARCHY_MANIFEST_FILE);
}

describe('a dump that fails or is torn never reaches the final name', () => {
	test('a COPY the server FAILS: an error line, no final file, no residue', async () => {
		rmSync(join(outDir, FILE), { force: true });
		const response = await exportHierarchy({ section_tipo: TIPO }, { outDir, psql: failingPsql });
		expect(response.data).toBe(false);
		expect(response.errors?.join('\n')).toContain(`Export failed for section_tipo: ${TIPO}`);
		expect(existsSync(join(outDir, FILE))).toBe(false);
		expect(residue()).toEqual([]);
	}, 30000);

	test('a failed RE-export keeps the previous good dump byte for byte', async () => {
		const good = await exportHierarchy({ section_tipo: TIPO }, { outDir });
		expect(good.data).toBe(true);
		const before = readFileSync(join(outDir, FILE));
		for (const psql of [failingPsql, tearingPsql, miscountingPsql, exitingPsql]) {
			const response = await exportHierarchy({ section_tipo: TIPO }, { outDir, psql });
			expect(response.data, psql.name).toBe(false);
			expect(readFileSync(join(outDir, FILE)).equals(before), psql.name).toBe(true);
			expect(residue(), psql.name).toEqual([]);
		}
	}, 60000);

	test('a torn stream with exit 0 is refused (full gunzip read)', async () => {
		rmSync(join(outDir, FILE), { force: true });
		const response = await exportHierarchy({ section_tipo: TIPO }, { outDir, psql: tearingPsql });
		expect(response.data).toBe(false);
		expect(existsSync(join(outDir, FILE))).toBe(false);
	}, 30000);

	test('a row count that disagrees with psql’s COPY report is refused', async () => {
		rmSync(join(outDir, FILE), { force: true });
		const response = await exportHierarchy(
			{ section_tipo: TIPO },
			{ outDir, psql: miscountingPsql },
		);
		expect(response.data).toBe(false);
		expect(existsSync(join(outDir, FILE))).toBe(false);
	}, 30000);

	test('positive control: a clean dump lands with every row, and nothing beside it', async () => {
		rmSync(join(outDir, FILE), { force: true });
		const response = await exportHierarchy({ section_tipo: TIPO }, { outDir });
		expect(response.errors ?? []).toEqual([]);
		expect(response.data).toBe(true);
		expect(existsSync(join(outDir, FILE))).toBe(true);
		// The corpus floor every emptiness verdict in this file is read against: the
		// directory walk sees the dump, and the dump holds every scratch row.
		expect(readdirSync(outDir).length).toBeGreaterThan(0);
		const rows = gunzipSync(readFileSync(join(outDir, FILE)))
			.toString('utf8')
			.split('\n')
			.filter((line) => line !== '');
		expect(rows).toHaveLength(2);
		expect(residue()).toEqual([]);
	}, 30000);
});

describe('hierarchy.json never certifies a torn data file', () => {
	test('a torn dump in the directory: the manifest is REFUSED, the previous one kept', async () => {
		// A good dump + manifest first.
		await exportHierarchy({ section_tipo: TIPO }, { outDir });
		const first = await exportHierarchyJson({ outDir });
		expect(first.data).toBe(true);
		const manifestPath = join(outDir, HIERARCHY_MANIFEST_FILE);
		const goodManifest = readFileSync(manifestPath, 'utf8');
		const entry = parseHierarchyManifestText(goodManifest).active_hierarchies.find(
			(item) => item.tld === TLD,
		);
		expect(entry?.data_files).toEqual([
			{ file: FILE, sha256: sha256Hex(readFileSync(join(outDir, FILE))) },
		]);

		// A torn file at the final name (a pre-fix leftover, a copy cut short).
		const whole = gzipSync(Buffer.from(`${IDS[0]}\t${TIPO}\n${IDS[1]}\t${TIPO}\n`));
		writeFileSync(join(outDir, FILE), whole.subarray(0, whole.byteLength - 10));
		const refused = await exportHierarchyJson({ outDir });
		expect(refused.data).toBe(false);
		expect(refused.errors?.join('\n')).toContain(FILE);
		expect(readFileSync(manifestPath, 'utf8')).toBe(goodManifest);
		expect(residue().filter((name) => name !== FILE)).toEqual([]);
	}, 30000);
});
