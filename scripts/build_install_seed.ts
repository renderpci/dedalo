/**
 * BUILD THE INSTALL SEED (`bun run seed:build`) — the ONE reproducible way to
 * produce `install/db/dedalo_install.pgsql.gz` (installer unification A2).
 *
 *   bun run seed:build [--source <path.gz>] [--out <path.gz>] [--keep-scratch]
 *
 * Defaults: source = out = the committed seed (rewritten atomically: tmp + rename).
 *
 * THE PROCEDURE — every step on a SCRATCH database this script creates and drops;
 * the application database, the suite database and any database named on the
 * command line are never touched (it accepts no database name at all):
 *   1. connection from the private config (`readEnv` DB_HOST/DB_PORT/DB_USER/
 *      DB_PASSWORD, PHP aliases honoured), `psql`/`pg_dump` resolved the way the
 *      engine resolves them (src/core/install/pg_bin.ts — a client older than the
 *      server refuses to dump);
 *   2. scratch `dedalo_seedbuild_<pid>_<epochSeconds>` (scripts/lib/install_seed.ts
 *      seedScratchDatabaseName) — refused if it exists, else CREATE … TEMPLATE
 *      template0 ENCODING 'UTF8';
 *   3. the source seed gunzipped and restored with ON_ERROR_STOP;
 *   4. every NON-CORE row deleted, in ONE transaction (the statements below):
 *      dd_ontology, dd_ontology_recovery, matrix_ontology, the ontology registry
 *      (matrix_ontology_main / ontology35), main_dd (core + localontology kept),
 *      matrix_dd (lists of non-core TLDs) and the whole of matrix_test (the
 *      test3 playground is the suite's). NO statement touches matrix_counter /
 *      matrix_counter_dd or a sequence: counters only ever rise (the counter
 *      law, matrix_counter_monotonic_tripwire);
 *   5. `pg_dump` with SEED_DUMP_OPTIONS (plain SQL, the derived search stores'
 *      DATA excluded — the installer refills them through ensureSearchStores);
 *   6. the dump MEASURED before it is written (seedCensus + seedCoreViolations —
 *      the same readers the drift gate holds the committed seed to): any
 *      violation refuses and nothing is written;
 *   7. gzip -9 → `<out>.tmp` → rename, then the provenance sidecar
 *      (install/db/dedalo_install.build.json: source sha256, pg_dump version,
 *      exact options, rows removed per table, COPY row counts, output sha256);
 *   8. finally: DROP DATABASE … WITH (FORCE) (unless --keep-scratch) and the
 *      temp files removed — on success AND on failure.
 *
 * Idempotent by construction: run on its own output it removes 0 rows.
 *
 * psql CHANNEL (sql_confinement_tripwire T2_PSQL_WRITE_CHANNEL): the `-f`
 * restore and the scoped strip DELETEs, on the scratch database alone. The DML
 * text lives HERE, never in the pure helper module.
 */

import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { readEnv } from '../src/config/env.ts';
import { libpqTransportArgs, resolvePgTransport } from '../src/config/pg_transport.ts';
import { CORE_ONTOLOGY_TLDS } from '../src/core/ontology/core_tlds.ts';
import {
	formatSidecarJson,
	SEED_BUILD_SCRIPT,
	SEED_BUILD_SIDECAR_PATH,
	SEED_DUMP_OPTIONS,
	SEED_KEEP_COUNTER_TLDS,
	SEED_PATH,
	type SeedBuildSidecar,
	seedCensus,
	seedCoreViolations,
	seedScratchDatabaseName,
} from './lib/install_seed.ts';

const REPO = resolve(import.meta.dir, '..');

interface BuildArgs {
	source: string;
	out: string;
	keepScratch: boolean;
}

interface Connection {
	args: string[];
	env: Record<string, string | undefined>;
	psql: string;
	pgDump: string;
}

interface SpawnResult {
	stdout: string;
	stderr: string;
	code: number;
}

/** The tables the strip touches, in the order its statements run (psql prints one `DELETE n` each). */
const STRIPPED_TABLES: readonly string[] = [
	'dd_ontology',
	'dd_ontology_recovery',
	'matrix_ontology',
	'matrix_ontology_main',
	'main_dd',
	'matrix_dd',
	'matrix_test',
];

function sha256(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

function fail(message: string): never {
	throw new Error(`[seed:build] ${message}`);
}

function parseArgs(argv: readonly string[]): BuildArgs {
	const args: BuildArgs = {
		source: join(REPO, SEED_PATH),
		out: join(REPO, SEED_PATH),
		keepScratch: false,
	};
	for (let index = 0; index < argv.length; index++) {
		const flag = argv[index];
		if (flag === '--keep-scratch') args.keepScratch = true;
		else if (flag === '--source' || flag === '--out') {
			const value = argv[++index];
			if (value === undefined || value === '') fail(`${flag} needs a path`);
			args[flag === '--source' ? 'source' : 'out'] = resolve(value);
		} else
			fail(`unknown argument '${flag}' (flags: --source <path.gz> --out <path.gz> --keep-scratch)`);
	}
	return args;
}

/** A path as the sidecar records it: repo-relative when inside the repo. */
function recordedPath(path: string): string {
	const rel = relative(REPO, path);
	return rel.startsWith('..') || isAbsolute(rel) ? path : rel;
}

async function connection(): Promise<Connection> {
	// Dynamic: pg_bin reads config, which only this runner (never the pure lib) may load.
	const { resolvePgBinary } = await import('../src/core/install/pg_bin.ts');
	const transport = resolvePgTransport({
		host: readEnv('DB_HOST') ?? 'localhost',
		port: readEnv('DB_PORT') ?? '',
		socket: readEnv('DB_SOCKET'),
	});
	const user = readEnv('DB_USER') ?? '';
	return {
		// The engine's ONE transport rule (DB_SOCKET wins) — src/config/pg_transport.ts.
		args: [...libpqTransportArgs(transport), '-U', user],
		env: { ...process.env, PGPASSWORD: readEnv('DB_PASSWORD') ?? '' },
		psql: resolvePgBinary('psql'),
		pgDump: resolvePgBinary('pg_dump'),
	};
}

async function spawn(
	argv: readonly string[],
	env: Record<string, string | undefined>,
	stdin?: string,
): Promise<SpawnResult> {
	const proc = Bun.spawn([...argv], {
		env,
		stdin: stdin === undefined ? 'ignore' : new TextEncoder().encode(stdin),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { stdout, stderr, code };
}

/** psql on `database`, ON_ERROR_STOP, no psqlrc; throws on a nonzero exit. */
async function psql(
	conn: Connection,
	database: string,
	args: readonly string[],
	stdin?: string,
): Promise<string> {
	const argv = [conn.psql, '-X', ...conn.args, '-d', database, '-v', 'ON_ERROR_STOP=1', ...args];
	const result = await spawn(argv, conn.env, stdin);
	if (result.code !== 0) fail(`psql (${database}) exited ${result.code}: ${result.stderr.trim()}`);
	return result.stdout;
}

async function createScratch(conn: Connection, name: string): Promise<void> {
	const exists = await psql(
		conn,
		'postgres',
		['-tA', '-v', `db=${name}`, '-f', '-'],
		"SELECT 1 FROM pg_database WHERE datname = :'db'\n",
	);
	if (exists.trim() !== '')
		fail(`scratch database '${name}' already exists — refusing to reuse it`);
	await psql(conn, 'postgres', [
		'-c',
		`CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8'`,
	]);
}

async function dropScratch(conn: Connection, name: string): Promise<void> {
	await psql(conn, 'postgres', ['-c', `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`]);
}

/** Gunzip the source seed into `workDir` and restore it into the scratch database. */
async function restoreSource(
	conn: Connection,
	name: string,
	sourceBytes: Uint8Array,
	workDir: string,
): Promise<void> {
	const sqlPath = join(workDir, 'source.sql');
	writeFileSync(sqlPath, gunzipSync(sourceBytes));
	await psql(conn, name, ['-q', '-f', sqlPath]);
	rmSync(sqlPath, { force: true });
}

/**
 * A validated TLD list as a SQL text-array literal, each value + `suffix` (the
 * only interpolated values; anything but /^[a-z]+$/ refuses).
 */
function tldArrayLiteral(tlds: readonly string[], suffix = ''): string {
	for (const tld of tlds) {
		if (!/^[a-z]+$/.test(tld)) fail(`'${tld}' is not a TLD — refusing to build SQL with it`);
	}
	return `ARRAY[${tlds.map((tld) => `'${tld}${suffix}'`).join(',')}]::text[]`;
}

/**
 * The strip, as ONE script (run with -1: one transaction). Tables are
 * schema-qualified because a plain-format dump restores them under `public` and
 * this session keeps the default search_path.
 */
function stripScript(core: readonly string[]): string {
	const coreTlds = tldArrayLiteral(core);
	const coreSections = tldArrayLiteral(core, '0');
	const keptCounters = tldArrayLiteral([...core, ...SEED_KEEP_COUNTER_TLDS]);
	return `
DELETE FROM public.dd_ontology WHERE coalesce(tld, '') <> ALL(${coreTlds});
DELETE FROM public.dd_ontology_recovery WHERE coalesce(tld, '') <> ALL(${coreTlds});
DELETE FROM public.matrix_ontology WHERE section_tipo <> ALL(${coreSections});
DELETE FROM public.matrix_ontology_main WHERE section_tipo = 'ontology35' AND coalesce(string->'hierarchy6'->0->>'value', '') <> ALL(${coreTlds});
DELETE FROM public.main_dd WHERE coalesce(tld, '') <> ALL(${keptCounters});
DELETE FROM public.matrix_dd WHERE regexp_replace(section_tipo, '[0-9]+$', '') <> ALL(${coreTlds});
DELETE FROM public.matrix_test;
`;
}

/** Run the strip; answers the rows removed per table (from psql's `DELETE n` command tags). */
async function stripNonCore(conn: Connection, name: string): Promise<Record<string, number>> {
	const out = await psql(conn, name, ['-1', '-f', '-'], stripScript(CORE_ONTOLOGY_TLDS));
	const tags = [...out.matchAll(/^DELETE (\d+)$/gm)].map((match) => Number(match[1]));
	if (tags.length !== STRIPPED_TABLES.length) {
		fail(
			`expected ${STRIPPED_TABLES.length} DELETE tags from the strip, got ${tags.length}:\n${out}`,
		);
	}
	return Object.fromEntries(STRIPPED_TABLES.map((table, index) => [table, tags[index] as number]));
}

async function dumpScratch(conn: Connection, name: string): Promise<string> {
	const result = await spawn(
		[conn.pgDump, ...conn.args, ...SEED_DUMP_OPTIONS, '-d', name],
		conn.env,
	);
	if (result.code !== 0)
		fail(`pg_dump exited ${result.code}: ${result.stderr.trim().slice(-2000)}`);
	return result.stdout;
}

async function pgDumpVersion(conn: Connection): Promise<string> {
	const result = await spawn([conn.pgDump, '--version'], conn.env);
	return result.stdout.trim();
}

async function gitRev(): Promise<string> {
	const result = await spawn(['git', '-C', REPO, 'rev-parse', 'HEAD'], process.env);
	return result.code === 0 ? result.stdout.trim() : 'unknown';
}

/** Atomic write: `<path>.tmp` then rename. */
function writeAtomic(path: string, bytes: Uint8Array | string): void {
	const tmp = `${path}.tmp`;
	writeFileSync(tmp, bytes);
	renameSync(tmp, path);
}

interface BuildRecord {
	args: BuildArgs;
	sourceSha: string;
	removed: Record<string, number>;
	dumpText: string;
	pgDump: string;
}

/** Measure, then write the seed + its sidecar (nothing is written when the dump fails the census). */
async function writeSeed(record: BuildRecord): Promise<SeedBuildSidecar> {
	const census = seedCensus(record.dumpText);
	const violations = seedCoreViolations(census, CORE_ONTOLOGY_TLDS);
	if (violations.length > 0)
		fail(`the stripped dump is not core-only — nothing written:\n  ${violations.join('\n  ')}`);
	const gz = gzipSync(record.dumpText, { level: 9 });
	writeAtomic(record.args.out, gz);
	const sidecar: SeedBuildSidecar = {
		_doc: `Provenance of the install seed — GENERATED by ${SEED_BUILD_SCRIPT} (bun run seed:build), never hand-edited. Gate: test/unit/install_seed_drift_tripwire.test.ts holds seed_sha256 and tables to the committed seed.`,
		script: SEED_BUILD_SCRIPT,
		built_at: new Date().toISOString(),
		git_rev: await gitRev(),
		source: { path: recordedPath(record.args.source), sha256: record.sourceSha },
		pg_dump: record.pgDump,
		dump_options: [...SEED_DUMP_OPTIONS],
		core_tlds: [...CORE_ONTOLOGY_TLDS],
		removed: record.removed,
		seed_sha256: sha256(gz),
		tables: census.tables,
	};
	writeAtomic(sidecarPath(record.args.out), formatSidecarJson(sidecar));
	return sidecar;
}

/** The sidecar beside `out`: the committed one for the committed seed, `<out stem>.build.json` otherwise. */
function sidecarPath(out: string): string {
	if (out === join(REPO, SEED_PATH)) return join(REPO, SEED_BUILD_SIDECAR_PATH);
	return out.endsWith('.pgsql.gz')
		? out.replace(/\.pgsql\.gz$/, '.build.json')
		: `${out}.build.json`;
}

async function build(args: BuildArgs): Promise<SeedBuildSidecar> {
	const conn = await connection();
	const name = seedScratchDatabaseName(process.pid, Date.now() / 1000);
	const workDir = mkdtempSync(join(tmpdir(), 'dedalo_seedbuild_'));
	const sourceBytes = readFileSync(args.source);
	let created = false;
	try {
		await createScratch(conn, name);
		created = true;
		console.log(`[seed:build] scratch database '${name}' created`);
		await restoreSource(conn, name, sourceBytes, workDir);
		const removed = await stripNonCore(conn, name);
		console.log(`[seed:build] removed: ${JSON.stringify(removed)}`);
		const dumpText = await dumpScratch(conn, name);
		const pgDump = await pgDumpVersion(conn);
		return await writeSeed({ args, sourceSha: sha256(sourceBytes), removed, dumpText, pgDump });
	} finally {
		rmSync(workDir, { recursive: true, force: true });
		if (created && !args.keepScratch) {
			await dropScratch(conn, name);
			console.log(`[seed:build] scratch database '${name}' dropped`);
		} else if (created) console.log(`[seed:build] --keep-scratch: '${name}' left in place`);
	}
}

if (import.meta.main) {
	const started = Date.now();
	try {
		const args = parseArgs(process.argv.slice(2));
		const sidecar = await build(args);
		console.log(
			`[seed:build] wrote ${recordedPath(args.out)} (sha256 ${sidecar.seed_sha256}) from source sha256 ${sidecar.source.sha256} with ${sidecar.pg_dump} in ${((Date.now() - started) / 1000).toFixed(1)} s`,
		);
		console.log(`[seed:build] tables: ${JSON.stringify(sidecar.tables)}`);
	} catch (error) {
		console.error((error as Error).message);
		process.exit(1);
	}
}
