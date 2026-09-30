/**
 * SUITE MARIADB TARGET — every `bun test` process reaches a MariaDB server the SUITE
 * started and MARKED for this lane, and nothing else (PUB-05, audit 2026-09-26).
 *
 * MariaDB is the fourth suite-owned surface, beside the Postgres suite database
 * (`dedalo_test_marker`), the media root (`.dedalo_test_media`) and the vector database
 * (`dedalo_test_rag_marker`). Before it, the diffusion gates borrowed the MACHINE's
 * MariaDB: `readEnv('DEDALO_DIFFUSION_DB_SOCKET')` inside a test process answered the
 * installation's `../private/.env` value, so on a developer machine
 * `diffusion_mariadb.test.ts` created and dropped tables in the installation's
 * publication database, and on a runner without that socket every live leg skipped
 * GREEN. Both halves are one defect: the target was not built by the suite.
 *
 * WHAT IS HELD (outcomes):
 *   PURE  — the verdict table of `classifySuiteTarget` (unarmed, unreachable, missing
 *           database, missing marker, no row, foreign lane, bad purpose → REFUSE; a row
 *           naming this lane → ready); `mariadbTierFaults` over planted runs (a skip, 0
 *           assertions, a missing file, no acquisition, a zero write delta → each a
 *           fault; a clean run → none); `calibrationFaults` (a measure the harness
 *           moves, a blind one, one that did not run → each a fault); two lanes → two different sockets, each within
 *           the unix-socket path limit; the target list is DERIVED from the situations.
 *   LIVE  — (a) this process is ARMED: the socket `readEnv` answers is the suite's for
 *           this lane, not the installation's and not the engine default; (b) through the
 *           ENGINE's own pool (`getTargetPool`) the marker row of every suite target names
 *           this lane; (c) the diffusion user cannot CREATE DATABASE (1044) nor write the
 *           marker (1142); (d) it holds no global privilege; (e) the two control databases
 *           — reachable, granted, one without a row, one with a FOREIGN row — are refused
 *           by the classifier on the live marker read, and the granted-never-created
 *           control answers 1049 (an ungranted name 1044); (f) a writer round trip lands and
 *           reads back; (g) the gate door itself (`requireSuiteMariadb`) refuses a
 *           DECLARED target whose marker names another lane and an UNDECLARED database
 *           that is granted and marked for this lane — each plant acceptable to the other
 *           rule — and ledgers neither; (h) the tier's write measure (the suite user's
 *           USER_STATISTICS rows) is moved 0 by the harness and ≥1 by a real row; (i) the
 *           lane lock admits one process at a time and a killed holder frees it.
 *
 * SAFETY — NO CONTACT UNLESS ARMED. Every live leg first asks `armingFaults()` (helper-
 * free, reads only the environment and the private file) and throws WITHOUT opening a
 * connection when this process would reach the installation's socket or the engine's
 * default one; the write legs additionally require the marker row. A red here never
 * touched the installation.
 *
 * WHY THE HELPER IS IMPORTED DYNAMICALLY: the live legs measure the ENGINE (readEnv +
 * getTargetPool), not the helper, so they keep reporting the true state even when the
 * helper module is absent or broken; the legs that need the helper throw its import
 * error by name.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	type Acquisition,
	type CalibrationRun,
	calibrationFaults,
	contactCalibrationFaults,
	hasComputedImport,
	INSTALL_BOUND_EXEMPT,
	importChain,
	MARIADB_POOL_MODULE,
	type MariadbTierListing,
	MEASURE_SELF_GATE,
	mariadbTierFaults,
	mariadbTierSet,
	NO_CONTACT_IDLE,
	NO_CONTACT_PARITY_FLOOR,
	NO_CONTACT_POPULATION_FLOOR,
	noContactFaults,
	ROW_CONTRACT,
	type RowContract,
	realListing,
	runMariadbTier,
	runtimeImports,
	SEAM_EDGES,
	type SeamEdge,
	type SuiteMariadbHelper as SuiteMariadbHelperShape,
	WRITE_COUNTERS,
	type WriteDeltas,
} from '../../scripts/ci/mariadb_tier.ts';
import {
	childEnv,
	type FileCounts,
	type ParityCase,
	type ParityRun,
	REPO_ROOT,
} from '../../scripts/lib/parity_census.ts';
import { parseEnvFile, privateDir, readEnv } from '../../src/config/env.ts';
import type { FieldPlan, PublicationPlan, SectionPlan } from '../../src/diffusion/plan/types.ts';
import {
	closeAllTargetPools,
	getTargetPool,
	type MariadbErrorLike,
} from '../../src/diffusion/targets/mariadb/db.ts';
import { mariadbSqlWriter } from '../../src/diffusion/writers/mariadb_sql.ts';
import {
	SUITE_SOCKET_ABSENT_REFUSAL,
	SUITE_UNARMED_REFUSAL,
	suiteContactRefusal,
	suiteMariadbPaths,
} from '../helpers/suite_mariadb_env.ts';
import { testDatabaseName } from '../helpers/test_database.ts';
import { SQL_KEY_ONE, SQL_KEY_TWO } from '../helpers/zzd_diffusion_fixture.ts';
import { ZZDIF_SITUATION } from '../helpers/zzdif_diffusion_domain.ts';

// ── the helper, loaded without letting its absence hide the live verdicts ───────────

type SuiteMariadbHelper = typeof import('../helpers/suite_mariadb.ts');
const loaded: { module: SuiteMariadbHelper | null; error: unknown } = await import(
	'../helpers/suite_mariadb.ts'
).then(
	(module: SuiteMariadbHelper) => ({ module, error: null }),
	(error: unknown) => ({ module: null, error }),
);
function helper(): SuiteMariadbHelper {
	if (loaded.module === null)
		throw new Error(
			`test/helpers/suite_mariadb.ts could not be loaded — the suite owns no MariaDB target: ${String(loaded.error).split('\n')[0]}`,
		);
	return loaded.module;
}

// ── helper-free facts about this process ────────────────────────────────────────────

/** The engine's own fallback when no socket and no host are configured (db.ts). */
const ENGINE_DEFAULT_SOCKET = '/tmp/mysql.sock';
const LANE = testDatabaseName();
const MARKER = 'dedalo_test_mariadb_marker.targets';

/** The INSTALLATION's configured socket — the private file, never the process env. */
function installationSocket(): string | undefined {
	const file = join(privateDir, '.env');
	if (!existsSync(file)) return undefined;
	const value = parseEnvFile(readFileSync(file, 'utf8')).DEDALO_DIFFUSION_DB_SOCKET;
	return value === undefined || value === '' ? undefined : value;
}

/** Why this process must not open a MariaDB connection, or [] when it is armed. */
function armingFaults(): string[] {
	const armed = readEnv('DEDALO_DIFFUSION_DB_SOCKET');
	const install = installationSocket();
	const faults: string[] = [];
	if (armed === undefined || armed === '')
		faults.push(
			'DEDALO_DIFFUSION_DB_SOCKET is unset in this process — the engine falls back to the TCP host or the default socket',
		);
	else {
		if (install !== undefined && armed === install)
			faults.push(
				`this process's MariaDB socket is the INSTALLATION's (${armed}, from ../private/.env) — nothing re-pointed it at a suite server`,
			);
		if (armed === ENGINE_DEFAULT_SOCKET)
			faults.push(`this process's MariaDB socket is the engine default ${ENGINE_DEFAULT_SOCKET}`);
	}
	return faults;
}

function refuseUnlessArmed(): void {
	const faults = armingFaults();
	if (faults.length > 0)
		throw new Error(
			`REFUSING to open a MariaDB connection from this process (nothing was contacted): ${faults.join('; ')}`,
		);
}

/**
 * Armed, AND the suite server acquired through the gate door (`requireSuiteMariadb`:
 * ensure + the marker of every suite target names this lane + an acquisition row).
 * Before any live leg opens a pool: the Bun `mariadb` adapter given a socket path that
 * does not exist falls back to TCP localhost:3306 — the installation's server on a
 * developer machine — so "armed" alone is not "safe to connect".
 */
let acquired: Promise<void> | undefined;
function ready(): Promise<void> {
	refuseUnlessArmed();
	if (acquired === undefined) {
		const { requireSuiteMariadb, SUITE_MARIADB_DATABASES } = helper();
		acquired = requireSuiteMariadb(import.meta.path, SUITE_MARIADB_DATABASES());
	}
	return acquired;
}

/** The zzd targets, as the delete gates key them (`<database>|<table>`). */
const ZZD_DATABASES = [SQL_KEY_ONE, SQL_KEY_TWO].map((key) => key.split('|')[0] as string);
/** The zzdif targets: the situation's `database` nodes, by term. */
const ZZDIF_DATABASES = ZZDIF_SITUATION.nodes
	.filter((node) => node.model === 'database')
	.map((node) => Object.values(node.term ?? {})[0] as string);

async function markerRows(database: string): Promise<{ suite_db: string; purpose: string }[]> {
	return (await getTargetPool(database).unsafe(
		`SELECT suite_db, purpose FROM ${MARKER} WHERE database_name = ?`,
		[database],
	)) as { suite_db: string; purpose: string }[];
}

async function refuseUnlessMarked(database: string): Promise<void> {
	await ready();
	const rows = await markerRows(database);
	if (rows.length !== 1 || rows[0]?.suite_db !== LANE)
		throw new Error(
			`REFUSING to write to '${database}': its marker row does not name this lane (${LANE}): ${JSON.stringify(rows)}`,
		);
}

async function errnoOf(work: Promise<unknown>): Promise<number | 'no error'> {
	try {
		await work;
		return 'no error';
	} catch (error) {
		return (error as MariadbErrorLike).errno ?? -1;
	}
}

afterAll(async () => {
	await closeAllTargetPools();
});

// ─────────────────────────────────────────────────────────────────────────────
// PURE
// ─────────────────────────────────────────────────────────────────────────────

describe('suite MariaDB target — pure', () => {
	test('classifier: every way a target can be wrong is a REFUSE; only a row naming this lane is ready', () => {
		const { classifySuiteTarget, MARKER_PURPOSE } = helper();
		const row = (suite_db: string, purpose = MARKER_PURPOSE) => ({
			ok: true as const,
			rows: [{ suite_db, purpose }],
		});
		const err = (errno: number | undefined, message = 'x') => ({
			ok: false as const,
			errno,
			message,
		});
		const base = { armed: true, lane: 'dedalo_x_test_l1', database: 'zzd_probe_db' };
		const table: [string, Parameters<typeof classifySuiteTarget>[0], string | null][] = [
			['armed, row names this lane', { ...base, probe: row('dedalo_x_test_l1') }, null],
			[
				'UNARMED even with a good row',
				{ ...base, armed: false, probe: row('dedalo_x_test_l1') },
				'unarmed',
			],
			[
				'connection refused (no errno)',
				{ ...base, probe: err(undefined, 'ECONNREFUSED') },
				'unreachable',
			],
			['socket missing (2002)', { ...base, probe: err(2002) }, 'unreachable'],
			['unknown database (1049)', { ...base, probe: err(1049) }, 'missing_database'],
			['database not granted (1044)', { ...base, probe: err(1044) }, 'missing_database'],
			['no marker table (1146)', { ...base, probe: err(1146) }, 'missing_marker'],
			['marker not readable (1142)', { ...base, probe: err(1142) }, 'missing_marker'],
			['auth refused (1045)', { ...base, probe: err(1045) }, 'unreachable'],
			['no row for this database', { ...base, probe: { ok: true as const, rows: [] } }, 'no_row'],
			['FOREIGN lane', { ...base, probe: row('dedalo_foreign_suite_control') }, 'foreign'],
			['wrong purpose', { ...base, probe: row('dedalo_x_test_l1', 'production') }, 'bad_purpose'],
		];
		for (const [label, input, cause] of table) {
			const verdict = classifySuiteTarget(input);
			if (cause === null) expect(verdict, label).toEqual({ ready: true });
			else expect(verdict, label).toMatchObject({ ready: false, cause });
		}
	});

	test('paths: two lanes get two sockets, each within the unix-socket limit, never the installation’s', () => {
		const { suiteMariadbPaths } = helper();
		const one = suiteMariadbPaths('dedalo_mib_v7_test_l1');
		const two = suiteMariadbPaths('dedalo_mib_v7_test_l2');
		expect(one.socket).not.toBe(two.socket);
		expect(one.root).not.toBe(two.root);
		for (const paths of [one, two]) {
			expect(paths.socket.length).toBeLessThanOrEqual(100);
			expect(paths.socket).not.toBe(ENGINE_DEFAULT_SOCKET);
			expect(paths.socket).not.toBe(installationSocket() ?? '');
			expect(paths.acquisitions.startsWith(paths.root)).toBe(true);
		}
	});

	test('environment: the composer arms the socket and blanks the TCP fallback', () => {
		const { suiteMariadbEnvironment, suiteMariadbPaths, SUITE_MARIADB_USER } = helper();
		const env = suiteMariadbEnvironment('dedalo_mib_v7_test_l3');
		expect(env.DEDALO_DIFFUSION_DB_SOCKET).toBe(suiteMariadbPaths('dedalo_mib_v7_test_l3').socket);
		expect(env.DEDALO_DIFFUSION_DB_USER).toBe(SUITE_MARIADB_USER);
		expect(env.DEDALO_DIFFUSION_DB_HOST).toBe('');
		expect(env.DEDALO_DIFFUSION_DB_PORT).toBe('');
	});

	test('targets: the list is DERIVED from the situations, and names no installation database', async () => {
		const { SUITE_MARIADB_DATABASES, requireSuiteMariadb } = helper();
		expect(new Set(SUITE_MARIADB_DATABASES())).toEqual(
			new Set([...ZZD_DATABASES, ...ZZDIF_DATABASES]),
		);
		// Refused BY NAME, before any connection: the NAME rule's own text (the later marker
		// refusal also names the database, so matching the name alone let a removed name
		// rule pass here while this leg went on to ensure and contact the server — M4), and
		// no acquisition row appended.
		const { suiteMariadbPaths } = helper();
		const ledger = suiteMariadbPaths().acquisitions;
		const rows = () => (existsSync(ledger) ? readFileSync(ledger, 'utf8') : '');
		const before = rows();
		await expect(requireSuiteMariadb(import.meta.path, ['web_numisdata_mib'])).rejects.toThrow(
			/'web_numisdata_mib' is not a suite MariaDB target — .*Nothing was contacted\.$/,
		);
		expect(rows()).toBe(before);
	});

	test('tier faults: planted controls — each defect is a fault, a clean run is none', () => {
		const set = {
			files: ['a.test.ts', 'b.test.ts', 'r.test.ts'],
			mustAcquire: ['a.test.ts', 'b.test.ts', 'r.test.ts'],
			noContact: [],
			chains: new Map<string, readonly string[]>(),
		};
		const contract = new Map<string, RowContract>([
			['a.test.ts', { rises: ['rows_inserted', 'rows_deleted'] }],
			['b.test.ts', { rises: ['rows_updated'] }],
			['r.test.ts', { none: 'a reader'.padEnd(61, '.') }],
		]);
		const ok = { tests: 3, skipped: 0, assertions: 9 };
		const cases: ParityCase[] = [];
		const ledger: Acquisition[] = set.files.map((file) => ({ file, database: 'zzd_probe_db' }));
		const idle: WriteDeltas = { rows_inserted: 0, rows_deleted: 0, rows_updated: 0 };
		const deltas = new Map<string, WriteDeltas>([
			['a.test.ts', { ...idle, rows_inserted: 4, rows_deleted: 2 }],
			['b.test.ts', { ...idle, rows_updated: 1 }],
			['r.test.ts', idle],
		]);
		const clean: { cases: ParityCase[]; perFile: Record<string, FileCounts> } = {
			cases,
			perFile: { 'a.test.ts': ok, 'b.test.ts': ok, 'r.test.ts': ok },
		};
		expect(mariadbTierFaults(clean, ledger, deltas, set, contract)).toEqual([]);

		const faultsOf = (run: typeof clean, l = ledger, d = deltas) =>
			mariadbTierFaults(run, l, d, set, contract);
		// A PARTIAL skip in an otherwise green file.
		expect(
			faultsOf({ cases, perFile: { ...clean.perFile, 'b.test.ts': { ...ok, skipped: 1 } } }),
		).toEqual([expect.stringMatching(/^b\.test\.ts: skipped 1 of 3/)]);
		expect(
			faultsOf({ cases, perFile: { ...clean.perFile, 'b.test.ts': { ...ok, assertions: 0 } } }),
		).toEqual([expect.stringMatching(/^b\.test\.ts: executed 0 assertions/)]);
		expect(faultsOf({ cases, perFile: { 'a.test.ts': ok, 'r.test.ts': ok } })).toEqual([
			expect.stringMatching(/^b\.test\.ts: reported nothing/),
		]);
		expect(
			faultsOf({
				cases: [{ file: 'a.test.ts', name: 'x', status: 'fail' }],
				perFile: clean.perFile,
			}),
		).toEqual([expect.stringMatching(/^a\.test\.ts: 1 case\(s\) failed/)]);
		expect(
			faultsOf(
				clean,
				ledger.filter((row) => row.file !== 'b.test.ts'),
			),
		).toEqual([expect.stringMatching(/^b\.test\.ts: never acquired/)]);
		expect(faultsOf(clean, [...ledger, { file: 'c.test.ts', database: 'zzd_probe_db' }])).toEqual([
			expect.stringMatching(/^c\.test\.ts: acquired the suite target but is not in the tier set/),
		]);
		// Leg 4 is judged PER FILE against its declared contract.
		for (const counter of ['rows_inserted', 'rows_deleted'] as const) {
			const moved = new Map(deltas).set('a.test.ts', {
				...(deltas.get('a.test.ts') as WriteDeltas),
				[counter]: 0,
			});
			expect(faultsOf(clean, ledger, moved)).toEqual([
				expect.stringMatching(
					new RegExp(`^a\\.test\\.ts: the suite user's ${counter} did not rise`),
				),
			]);
		}
		// THE AGGREGATE DEFECT, planted (review 2026-09-30): another file's writes cannot
		// stand in — `a` wrote plenty, `b` (declares rows_updated) wrote nothing: red for b.
		expect(
			faultsOf(
				clean,
				ledger,
				new Map(deltas)
					.set('a.test.ts', { rows_inserted: 99, rows_deleted: 99, rows_updated: 99 })
					.set('b.test.ts', idle),
			),
		).toEqual([expect.stringMatching(/^b\.test\.ts: the suite user's rows_updated did not rise/)]);
		// A declared reader that writes is red (the declaration lies).
		expect(
			faultsOf(clean, ledger, new Map(deltas).set('r.test.ts', { ...idle, rows_inserted: 1 })),
		).toEqual([
			expect.stringMatching(
				/^r\.test\.ts: declared row-less, but its own run moved rows_inserted by 1/,
			),
		]);
		// A file with no measured window is never read as a pass.
		const unmeasured = new Map(deltas);
		unmeasured.delete('r.test.ts');
		expect(faultsOf(clean, ledger, unmeasured)).toEqual([
			expect.stringMatching(/^r\.test\.ts: no write measurement for its own window/),
		]);
	});

	test('write-measure calibration: planted controls — a measure that counts the harness, or is blind, or did not run, is a fault', () => {
		const zero: WriteDeltas = { rows_inserted: 0, rows_deleted: 0, rows_updated: 0 };
		const moved: WriteDeltas = { rows_inserted: 1, rows_deleted: 1, rows_updated: 1 };
		const idle: CalibrationRun = { ran: true, deltas: zero };
		const wrote: CalibrationRun = { ran: true, deltas: moved };
		expect(calibrationFaults(idle, wrote)).toEqual([]);
		for (const counter of WRITE_COUNTERS) {
			// The Com_* defect, planted: the harness alone moves the counter.
			expect(calibrationFaults({ ran: true, deltas: { ...zero, [counter]: 1 } }, wrote)).toEqual([
				expect.stringContaining(`only ACQUIRES moved ${counter} by 1`),
			]);
			// A blind measure: a real write moves nothing.
			expect(calibrationFaults(idle, { ran: true, deltas: { ...moved, [counter]: 0 } })).toEqual([
				expect.stringContaining(`moved ${counter} by 0 — the measure is blind`),
			]);
		}
		// A calibration that did not run is never a pass, even with plausible deltas.
		expect(calibrationFaults({ ...idle, ran: false }, wrote)).toEqual([
			expect.stringContaining('acquire-only control did not run'),
		]);
		expect(calibrationFaults(idle, { ...wrote, ran: false })).toEqual([
			expect.stringContaining('write-one-row control did not run'),
		]);
	});

	test('sweep: deletes a lane root ONLY when the suite marked it; an unmarked one is refused untouched', async () => {
		const { sweepSuiteMariadb, suiteMariadbPaths, SUITE_MARIADB_MARKER_FILE } = helper();
		const lane = `zz_sweep_probe_${process.pid}`;
		const paths = suiteMariadbPaths(lane);
		try {
			// No root: a no-op, never an error.
			expect(await sweepSuiteMariadb(lane)).toEqual({ stopped: false, removed: false });
			// An UNMARKED root (not created by the suite): refused, and still there after.
			mkdirSync(join(paths.root, 'data'), { recursive: true });
			writeFileSync(join(paths.root, 'data', 'keep'), 'not the suite’s');
			await expect(sweepSuiteMariadb(lane)).rejects.toThrow(/REFUSING to sweep/);
			expect(existsSync(join(paths.root, 'data', 'keep'))).toBe(true);
			// Marked: removed whole.
			writeFileSync(join(paths.root, SUITE_MARIADB_MARKER_FILE), '{}\n');
			expect(await sweepSuiteMariadb(lane)).toEqual({ stopped: false, removed: true });
			expect(existsSync(paths.root)).toBe(false);
		} finally {
			rmSync(paths.root, { recursive: true, force: true });
		}
	});

	test('lane sweep: every MARKED lane root the matcher names is stopped and removed; an unmarked one is refused and kept; others untouched', async () => {
		// The shard runner's teardown (integrator request: sweepShardClones hands it its
		// own `<template>__shard<N>` grammar). A planted "server" — a process whose command
		// line names mariadbd and the lane's datadir, which is what the helper checks
		// before signalling — must be stopped by the sweep, not orphaned.
		const { suiteMariadbPaths, SUITE_MARIADB_MARKER_FILE } = helper();
		const { sweepSuiteMariadbLanes } = await import('../helpers/suite_mariadb_lanes.ts');
		const template = `zz_lanes_probe_${process.pid}`;
		const marked = suiteMariadbPaths(`${template}__shard1`);
		const unmarked = suiteMariadbPaths(`${template}__shard2`);
		const other = suiteMariadbPaths(`${template}__other`);
		const grammar = new RegExp(`^${template}__shard\\d+$`);
		let server: ReturnType<typeof Bun.spawn> | undefined;
		try {
			for (const paths of [marked, unmarked, other]) mkdirSync(paths.datadir, { recursive: true });
			for (const paths of [marked, other])
				writeFileSync(join(paths.root, SUITE_MARIADB_MARKER_FILE), '{}\n');
			server = Bun.spawn(
				['bun', '-e', 'await Bun.sleep(120000)', 'mariadbd', `--datadir=${marked.datadir}`],
				{ stdout: 'ignore', stderr: 'ignore' },
			);
			writeFileSync(marked.pidFile, `${server.pid}\n`);
			await Bun.sleep(200);
			const report = await sweepSuiteMariadbLanes((lane) => grammar.test(lane));
			expect(report).toEqual({ swept: [`${template}__shard1`], refused: [`${template}__shard2`] });
			expect(existsSync(marked.root)).toBe(false);
			expect(await server.exited, 'the lane server was signalled, not orphaned').not.toBe(0);
			expect(existsSync(unmarked.datadir), 'an unmarked root is never deleted').toBe(true);
			expect(existsSync(other.root), 'a lane the matcher does not name is untouched').toBe(true);
		} finally {
			server?.kill('SIGKILL');
			for (const paths of [marked, unmarked, other])
				rmSync(paths.root, { recursive: true, force: true });
		}
	}, 30_000);

	test('(j) stop WAITS for the lane lock: while another process holds it, the server is not signalled', async () => {
		// The claim "a stop never interleaves with another process's ensure" (the helper,
		// engineering/CI.md) had no gate: with stop's lock removed this file stayed green
		// (mutation M11, review 2026-09-30). A scratch lane with a planted "server"
		// process; a child holds the lock; the in-process stop must neither return nor
		// signal until the child released it.
		const { stopSuiteMariadb, suiteMariadbPaths, SUITE_MARIADB_MARKER_FILE } = helper();
		const lane = `zz_stoplock_probe_${process.pid}`;
		const paths = suiteMariadbPaths(lane);
		const releaseSignal = join(paths.root, 'release_now');
		const lockModule = join(import.meta.dir, '..', 'helpers', 'suite_mariadb_lock.ts');
		let server: ReturnType<typeof Bun.spawn> | undefined;
		let holder: ReturnType<typeof Bun.spawn> | undefined;
		try {
			mkdirSync(paths.datadir, { recursive: true });
			writeFileSync(join(paths.root, SUITE_MARIADB_MARKER_FILE), '{}\n');
			server = Bun.spawn(
				['bun', '-e', 'await Bun.sleep(120000)', 'mariadbd', `--datadir=${paths.datadir}`],
				{ stdout: 'ignore', stderr: 'ignore' },
			);
			writeFileSync(paths.pidFile, `${server.pid}\n`);
			holder = Bun.spawn(
				[
					'bun',
					'-e',
					`import { existsSync } from 'node:fs';
const { acquireSuiteMariadbLock } = await import(${JSON.stringify(lockModule)});
const release = await acquireSuiteMariadbLock(${JSON.stringify(lane)}, 20_000);
console.log('held');
while (!existsSync(${JSON.stringify(releaseSignal)})) await Bun.sleep(25);
const at = Date.now();
release();
console.log(JSON.stringify({ released: at }));`,
				],
				{ stdout: 'pipe', stderr: 'pipe' },
			);
			const out = holder.stdout as ReadableStream<Uint8Array>;
			const reader = out.getReader();
			const first = await reader.read();
			expect(new TextDecoder().decode(first.value)).toContain('held');

			let settledAt: number | undefined;
			const stopping = stopSuiteMariadb(lane).then((result) => {
				settledAt = Date.now();
				return result;
			});
			await Bun.sleep(1_500);
			expect(settledAt, 'stop returned while another process held the lane lock').toBeUndefined();
			expect(
				server.exitCode,
				'stop signalled the server while another process held the lane lock',
			).toBeNull();

			writeFileSync(releaseSignal, '');
			let rest = '';
			for (;;) {
				const chunk = await reader.read();
				if (chunk.done) break;
				rest += new TextDecoder().decode(chunk.value);
			}
			const { released } = JSON.parse(rest.trim().split('\n').at(-1) as string) as {
				released: number;
			};
			expect(await stopping).toEqual({ stopped: true });
			expect(settledAt as number).toBeGreaterThanOrEqual(released);
			expect(await server.exited, 'the lane server was stopped once the lock was free').not.toBe(0);
		} finally {
			holder?.kill('SIGKILL');
			server?.kill('SIGKILL');
			rmSync(paths.root, { recursive: true, force: true });
		}
	}, 60_000);

	test('the STAGE itself, with every input planted: calibration and measure faults reach the verdict, no file’s writes stand in for another’s, and a no-contact file that contacts is named', async () => {
		// runMariadbTier over the REAL set derivation with a fake helper (scripted
		// USER_STATISTICS) and a fake runner (scripted JUnit counts + ledger rows), so the
		// composition — not only the pure halves — is held: mutations M4 (drop the
		// calibration from the verdict) and M8 (a measure failure escaping as an uncaught
		// throw) and the aggregate defect of leg 4 (review 2026-09-30) each turn this red,
		// and so does leg 1b's: a population file that opens a pool without acquiring, a
		// blind contact measure, a population file that acquires through a wrapper.
		const root = mkdtempSync(join(tmpdir(), 'dedalo_mtier_stage_'));
		const { set } = mariadbTierSet(realListing());
		type Plant = {
			idleMoves?: Partial<WriteDeltas>;
			writes?: (file: string) => Partial<WriteDeltas>;
			measureFailsFrom?: number;
			/** Contacts a file makes WHEN IT RUNS (population or calibration). */
			contacts?: (file: string) => number;
			/** Population files that append an acquisition row when they run. */
			acquiresInBatch?: readonly string[];
			/** Population files whose `beforeAll` throws: one failed '(unnamed)' case, 0 assertions. */
			hookFails?: readonly string[];
		};
		const stage = async (plant: Plant) => {
			const counters: WriteDeltas = { rows_inserted: 0, rows_deleted: 0, rows_updated: 0 };
			let contactCount = 0;
			const bump = (moves: Partial<WriteDeltas>) => {
				for (const counter of WRITE_COUNTERS) counters[counter] += moves[counter] ?? 0;
			};
			let reads = 0;
			const acquisitions = join(root, `acquisitions_${Math.random().toString(36).slice(2)}.ndjson`);
			const acquire = (file: string) =>
				writeFileSync(acquisitions, `${JSON.stringify({ file, database: 'zzd_probe_db' })}\n`, {
					flag: 'a',
				});
			const fakeHelper: SuiteMariadbHelperShape = {
				suiteMariadbPaths: () => ({ root, acquisitions }),
				ensureSuiteMariadb: async () => undefined,
				suiteUserWrites: async () => {
					reads++;
					if (plant.measureFailsFrom !== undefined && reads >= plant.measureFailsFrom)
						throw new Error('the server is not counting per-user rows (@@global.userstat = 0)');
					return { ...counters };
				},
				suiteUserContacts: async () => contactCount,
			};
			const declared = (file: string): Partial<WriteDeltas> => {
				const row = ROW_CONTRACT.get(file);
				if (row === undefined || 'none' in row) return {};
				return Object.fromEntries(row.rises.map((c) => [c, 2]));
			};
			// The honest defaults: the one-contact control contacts, nothing else does.
			const contactsOf =
				plant.contacts ?? ((file: string) => (file.includes('tier_one_contact') ? 4 : 0));
			const population = new Set(set.noContact);
			const runner = (files: string[]): ParityRun => {
				for (const file of files) {
					contactCount += contactsOf(file);
					if (file.includes('tier_acquire_only')) bump(plant.idleMoves ?? {});
					else if (file.includes('tier_write_one_row'))
						bump({ rows_inserted: 1, rows_deleted: 1, rows_updated: 1 });
					else if (file.includes('/calibration/')) {
						// the contact controls write nothing and acquire nothing
					} else if (population.has(file)) {
						if (plant.acquiresInBatch?.includes(file)) acquire(file);
					} else {
						acquire(file);
						bump((plant.writes ?? declared)(file));
					}
				}
				// Bun's own shapes: an idle-by-construction file skips every case; a file
				// whose hook threw reports one failed '(unnamed)' case and no assertion.
				const countsOf = (file: string): FileCounts =>
					NO_CONTACT_IDLE.has(file)
						? { tests: 2, skipped: 2, assertions: 0 }
						: plant.hookFails?.includes(file)
							? { tests: 1, skipped: 0, assertions: 0 }
							: { tests: 1, skipped: 0, assertions: 1 };
				return {
					cases: files.map((file) => ({ file, name: 'x', status: 'pass' as const })),
					files,
					totals: { tests: files.length, pass: files.length, fail: 0, skip: 0 },
					perFile: Object.fromEntries(files.map((file) => [file, countsOf(file)])),
				};
			};
			const lines: string[] = [];
			const log = {
				out: (line: string) => lines.push(line),
				err: (line: string) => lines.push(line),
			};
			return runMariadbTier({ runner, helper: fakeHelper, log });
		};
		try {
			// The planted harness is honest: every declared writer writes → GREEN.
			expect(await stage({})).toEqual({ code: 0, faults: [] });

			// M4 — the acquire-only calibration moves a counter: the stage is RED on it.
			const idle = await stage({ idleMoves: { rows_inserted: 1 } });
			expect(idle.code).toBe(1);
			expect(idle.faults).toEqual([
				expect.stringMatching(/^calibration: a gate that only ACQUIRES moved rows_inserted by 1/),
			]);

			// THE AGGREGATE DEFECT — only the measure's own gate writes (and plenty): every
			// product writer is red on its own window.
			const onlySelf = await stage({
				writes: (file) =>
					file === MEASURE_SELF_GATE
						? { rows_inserted: 50, rows_deleted: 50, rows_updated: 50 }
						: {},
			});
			const writers = [...ROW_CONTRACT]
				.filter(([file, row]) => file !== MEASURE_SELF_GATE && 'rises' in row)
				.map(([file]) => file);
			expect(writers.length).toBeGreaterThanOrEqual(5);
			expect(onlySelf.code).toBe(1);
			for (const file of writers)
				expect(onlySelf.faults).toContainEqual(
					expect.stringMatching(
						new RegExp(
							`^${file.replace(/[.]/g, '\\.')}: the suite user's rows_\\w+ did not rise during ITS OWN run`,
						),
					),
				);
			expect(onlySelf.faults.every((fault) => !fault.startsWith(MEASURE_SELF_GATE))).toBe(true);

			// M8 — the measure fails once the set starts (userstat off): a STRUCTURED red,
			// naming the measure per file, with the calibration fault found earlier still
			// in the report — never an uncaught throw that loses both.
			const blind = await stage({
				idleMoves: { rows_deleted: 3 },
				measureFailsFrom: 5, // 4 reads calibrate; the set's first read fails
			});
			expect(blind.code).toBe(1);
			expect(blind.faults).toContainEqual(
				expect.stringMatching(/^calibration: a gate that only ACQUIRES moved rows_deleted by 3/),
			);
			for (const file of set.files)
				expect(blind.faults).toContainEqual(
					`${file}: the write measure could not be read BEFORE the run, so nothing was run (Error: the server is not counting per-user rows (@@global.userstat = 0))`,
				);

			// LEG 1b — a population file (one the old one-hop derivation held by a NO_CONTACT
			// row, and one it never saw) opens a pool without acquiring: the batch moves the
			// contacts, the per-file re-run NAMES exactly those two, with their chains.
			const direct = 'test/unit/media_index_store.test.ts';
			const transitive = set.noContact.find(
				(file) => (set.chains.get(file)?.length ?? 0) >= 4,
			) as string;
			expect(set.noContact).toContain(direct);
			expect(transitive, 'the population holds a file ≥3 hops from the pool module').toBeDefined();
			const contacted = await stage({
				contacts: (file) =>
					file === direct || file === transitive || file.includes('tier_one_contact') ? 4 : 0,
			});
			expect(contacted.code).toBe(1);
			const escaped = (file: string) => file.replace(/[.]/g, '\\.');
			expect(contacted.faults).toEqual(
				[direct, transitive]
					.sort((a, b) => set.noContact.indexOf(a) - set.noContact.indexOf(b))
					.map((file) =>
						expect.stringMatching(
							new RegExp(
								`^${escaped(file)}: opened 4 MariaDB connection\\(s\\) as the suite user WITHOUT acquiring the suite target \\(${escaped(file)} → `,
							),
						),
					),
			);
			expect(contacted.faults.join('\n')).toContain('src/diffusion/targets/mariadb/db.ts');

			// A BLIND contact measure (the one-contact control reads 0 — an unarmed child)
			// and a COUNTING one (the no-contact control reads 2) are each red.
			const unarmed = await stage({ contacts: () => 0 });
			expect(unarmed.faults).toEqual([
				expect.stringMatching(
					/^calibration: a gate that opens one pool without acquiring moved the suite user's contacts by 0/,
				),
			]);
			const counting = await stage({
				contacts: (file) =>
					file.includes('tier_no_contact') ? 2 : file.includes('tier_one_contact') ? 4 : 0,
			});
			expect(counting.faults).toEqual([
				expect.stringMatching(
					/^calibration: a gate that opens NO pool moved the suite user's contacts by 2/,
				),
			]);

			// A population file whose beforeAll THREW (one failed '(unnamed)' case, 0
			// assertions) never reached its code: red, whatever its case count says.
			const hooked = await stage({ hookFails: [direct] });
			expect(hooked.faults).toEqual([
				expect.stringMatching(
					new RegExp(`^${escaped(direct)}: reached .* but executed 0 assertions`),
				),
			]);

			// A population file that ACQUIRES through a wrapper is red: the set must derive it.
			const wrapped = await stage({ acquiresInBatch: [direct] });
			expect(wrapped.faults).toEqual([
				expect.stringMatching(
					new RegExp(
						`^${direct.replace(/[.]/g, '\\.')}: acquired the suite target during the no-contact batch`,
					),
				),
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('tier set: integration minus the install-bound rows, plus every unit acquirer; floor and stale rows', () => {
		const HELPER = 'test/helpers/suite_mariadb.ts';
		const listing = (extraUnit: number): MariadbTierListing => {
			const units = Array.from({ length: extraUnit }, (_, i) => `test/unit/u${i}.test.ts`);
			return {
				integration: ['test/integration/i1.test.ts', 'test/integration/bound.test.ts'],
				unit: ['test/unit/plain.test.ts', ...units],
				parity: [],
				imports: new Map<string, string[]>([
					['test/integration/i1.test.ts', [HELPER]],
					['test/integration/bound.test.ts', []],
					['test/unit/plain.test.ts', ['test/helpers/test_database.ts']],
					...units.map((file) => [file, [HELPER]] as [string, string[]]),
					// A product module that opens pools, so the graph sees the pool module.
					['src/zz_pool_user.ts', [MARIADB_POOL_MODULE]],
				]),
				opaque: [],
			};
		};
		const exempt = new Map([['test/integration/bound.test.ts', 'x'.repeat(61)]]);
		const noSeams = new Map<string, SeamEdge>();
		const contractFor = (extraUnit: number) =>
			new Map<string, RowContract>([
				['test/integration/i1.test.ts', { rises: ['rows_inserted'] }],
				...Array.from(
					{ length: extraUnit },
					(_, i) =>
						[`test/unit/u${i}.test.ts`, { rises: ['rows_inserted'] }] as [string, RowContract],
				),
			]);
		// The planted graphs are small: the population floor is the real tree's, asserted
		// below on the real listing; here it is the one expected fault of every planted set.
		const populationFloor = expect.stringMatching(
			/no-contact population has \d+ test\/unit \+ \d+ test\/parity file\(s\), below the floor/,
		);
		// The planted maps carry no idle rows (the real ones name real files).
		const noIdle = new Map<string, string>();
		const setOf = (
			extraUnit: number,
			ex: ReadonlyMap<string, string> = exempt,
			ct: ReadonlyMap<string, RowContract> = contractFor(extraUnit),
		) => {
			const { set, faults } = mariadbTierSet(listing(extraUnit), ex, ct, noSeams, noIdle);
			return { set, faults: faults.filter((fault) => !/no-contact population has/.test(fault)) };
		};
		const five = setOf(4);
		expect(five.faults).toEqual([]);
		// A graph in which nothing imports the pool module is a fault of the derivation.
		const blindGraph = listing(4);
		(blindGraph.imports as Map<string, string[]>).delete('src/zz_pool_user.ts');
		expect(mariadbTierSet(blindGraph, exempt, contractFor(4), noSeams, noIdle).faults).toEqual([
			expect.stringMatching(/the import graph lost src\/diffusion\/targets\/mariadb\/db\.ts/),
			populationFloor,
		]);
		expect(five.set.files).toEqual([
			'test/integration/i1.test.ts',
			'test/unit/u0.test.ts',
			'test/unit/u1.test.ts',
			'test/unit/u2.test.ts',
			'test/unit/u3.test.ts',
		]);
		expect(five.set.mustAcquire).toEqual(five.set.files);
		// Below the floor.
		expect(setOf(3).faults).toEqual([
			expect.stringMatching(/tier set has 4 file\(s\), below the floor of 5/),
			expect.stringMatching(/only 4 product gate\(s\) declare writes, below the floor of 5/),
		]);
		// A stale exempt row, and a reason that says nothing.
		const stale = setOf(4, new Map([...exempt, ['test/integration/gone.test.ts', 'short']]));
		expect(stale.faults).toEqual([
			expect.stringMatching(/gone\.test\.ts, which no longer exists/),
			expect.stringMatching(/gone\.test\.ts: the reason must say why/),
		]);
		// Exempting a file that ACQUIRES the suite target is a contradiction, never a
		// quiet shrink of the stage (mutation-verified 2026-09-30: an exempted live gate
		// left the stage GREEN at 5 files).
		expect(
			setOf(
				5,
				new Map([...exempt, ['test/integration/i1.test.ts', 'y'.repeat(61)]]),
				new Map([...contractFor(5)].filter(([file]) => file !== 'test/integration/i1.test.ts')),
			).faults,
		).toEqual([expect.stringMatching(/i1\.test\.ts: it acquires the suite MariaDB target/)]);

		// LEG 1b (review 2026-09-30): the no-contact population is the TRANSITIVE closure.
		// Planted: a test that imports B, which imports A, which imports the pool module,
		// is in the population (the old one-hop derivation never saw it), with its chain;
		// an acquirer is in the set, never the population; a cycle terminates.
		const A = 'src/zz_a.ts';
		const B = 'src/zz_b.ts';
		const graph = (): MariadbTierListing => {
			const base = listing(4);
			const imports = new Map(base.imports);
			imports.set('test/unit/hop2.test.ts', [B]);
			imports.set('test/unit/direct.test.ts', [MARIADB_POOL_MODULE]);
			imports.set(B, [A, 'src/zz_cycle.ts']);
			imports.set('src/zz_cycle.ts', [B]);
			imports.set(A, [MARIADB_POOL_MODULE]);
			imports.set(MARIADB_POOL_MODULE, []);
			(imports.get('test/unit/u0.test.ts') as string[]).push(B);
			return {
				...base,
				unit: [...base.unit, 'test/unit/hop2.test.ts', 'test/unit/direct.test.ts'],
				imports,
			};
		};
		const hop = mariadbTierSet(graph(), exempt, contractFor(4), noSeams, noIdle);
		expect(hop.faults).toEqual([populationFloor]);
		expect(hop.set.noContact).toEqual(['test/unit/hop2.test.ts', 'test/unit/direct.test.ts']);
		expect(hop.set.chains.get('test/unit/hop2.test.ts')).toEqual([
			'test/unit/hop2.test.ts',
			B,
			A,
			MARIADB_POOL_MODULE,
		]);
		expect(hop.set.files).toContain('test/unit/u0.test.ts');
		expect(importChain(graph().imports, 'test/unit/plain.test.ts', MARIADB_POOL_MODULE)).toBeNull();
		// test/parity is in the population too — the preload arms it alike (review
		// 2026-09-30: 37 parity files reach the pool module). An idle row must name a
		// population file and say why.
		const withParity = graph();
		withParity.parity = ['test/parity/p.test.ts', 'test/parity/leaf.test.ts'];
		(withParity.imports as Map<string, string[]>).set('test/parity/p.test.ts', [B]);
		(withParity.imports as Map<string, string[]>).set('test/parity/leaf.test.ts', []);
		const parityHop = mariadbTierSet(withParity, exempt, contractFor(4), noSeams, noIdle);
		expect(parityHop.faults).toEqual([populationFloor]);
		expect(parityHop.set.noContact).toEqual([
			'test/unit/hop2.test.ts',
			'test/unit/direct.test.ts',
			'test/parity/p.test.ts',
		]);
		expect(
			mariadbTierSet(
				withParity,
				exempt,
				contractFor(4),
				noSeams,
				new Map([
					['test/parity/p.test.ts', 'i'.repeat(61)],
					['test/parity/leaf.test.ts', 'short'],
				]),
			).faults,
		).toEqual([
			populationFloor,
			expect.stringMatching(
				/^NO_CONTACT_IDLE names test\/parity\/leaf\.test\.ts, which is not in the no-contact population/,
			),
			expect.stringMatching(
				/^NO_CONTACT_IDLE row test\/parity\/leaf\.test\.ts: the reason must say why/,
			),
		]);
		// THE TWO FLOORS, each judged on its own half (review 2026-09-30, M3b: every planted
		// set above faults on BOTH halves, so dropping either half from the verdict left
		// this file GREEN). A population exactly at the unit floor is judged by its parity
		// half alone, and the reverse; both at their floor is clean.
		const halves = (units: number, parities: number): MariadbTierListing => {
			const base = listing(4);
			const imports = new Map(base.imports);
			imports.set(A, [MARIADB_POOL_MODULE]);
			imports.set(MARIADB_POOL_MODULE, []);
			const unitReachers = Array.from({ length: units }, (_, i) => `test/unit/r${i}.test.ts`);
			const parityReachers = Array.from(
				{ length: parities },
				(_, i) => `test/parity/r${i}.test.ts`,
			);
			for (const file of [...unitReachers, ...parityReachers]) imports.set(file, [A]);
			return { ...base, unit: [...base.unit, ...unitReachers], parity: parityReachers, imports };
		};
		const halfFaults = (units: number, parities: number) => {
			const derived = mariadbTierSet(
				halves(units, parities),
				exempt,
				contractFor(4),
				noSeams,
				noIdle,
			);
			expect(derived.set.noContact.length).toBe(units + parities);
			return derived.faults;
		};
		expect(halfFaults(NO_CONTACT_POPULATION_FLOOR, NO_CONTACT_PARITY_FLOOR)).toEqual([]);
		expect(halfFaults(NO_CONTACT_POPULATION_FLOOR + 40, NO_CONTACT_PARITY_FLOOR - 1)).toEqual([
			populationFloor,
		]);
		expect(halfFaults(NO_CONTACT_POPULATION_FLOOR - 1, NO_CONTACT_PARITY_FLOOR + 40)).toEqual([
			populationFloor,
		]);

		// THE SEAMS are exact both ways: a product module importing by a computed path
		// with no row is red (it would cut the graph); a row for a module that no longer
		// does is stale; a row must say why and name what it loads.
		const seam: SeamEdge = { loads: ['tools/*/server/**/*.ts'], reason: 'w'.repeat(61) };
		expect(
			mariadbTierSet({ ...graph(), opaque: [A] }, exempt, contractFor(4), noSeams, noIdle).faults,
		).toEqual([
			populationFloor,
			expect.stringMatching(/^src\/zz_a\.ts: imports by a computed path/),
		]);
		expect(
			mariadbTierSet(
				{ ...graph(), opaque: [A] },
				exempt,
				contractFor(4),
				new Map([[A, seam]]),
				noIdle,
			).faults,
		).toEqual([populationFloor]);
		expect(
			mariadbTierSet(
				graph(),
				exempt,
				contractFor(4),
				new Map([[B, { loads: [], reason: 'short' }]]),
				noIdle,
			).faults,
		).toEqual([
			populationFloor,
			expect.stringMatching(
				/SEAM_EDGES names src\/zz_b\.ts, which no longer imports by a computed path/,
			),
			expect.stringMatching(/SEAM_EDGES row src\/zz_b\.ts: the reason must say why/),
			expect.stringMatching(/SEAM_EDGES row src\/zz_b\.ts: 'loads' names nothing/),
		]);
		// The computed-import detector reads the transpiled code: literals (static and
		// dynamic, template without substitution) are not seams; a comment is not code.
		expect(hasComputedImport("const m = await import('./x.ts');")).toBe(false);
		expect(hasComputedImport('const m = await import(`./x.ts`);')).toBe(false);
		expect(hasComputedImport('// await import(path)\nexport const x = 1;')).toBe(false);
		expect(hasComputedImport('export const f = (p: string) => import(p);')).toBe(true);
		expect(hasComputedImport('export const f = (n: string) => import(`./t/${n}.ts`);')).toBe(true);

		// THE ROW CONTRACT is exact both ways, and the product-writer floor holds.
		const missing = contractFor(4);
		missing.delete('test/unit/u3.test.ts');
		expect(setOf(4, exempt, missing).faults).toEqual([
			expect.stringMatching(/^test\/unit\/u3\.test\.ts: no ROW_CONTRACT row/),
			expect.stringMatching(/only 4 product gate\(s\) declare writes, below the floor of 5/),
		]);
		expect(
			setOf(
				4,
				exempt,
				new Map([...contractFor(4), ['test/unit/gone.test.ts', { rises: ['rows_inserted'] }]]),
			).faults,
		).toEqual([
			expect.stringMatching(
				/ROW_CONTRACT names test\/unit\/gone\.test\.ts, which is not in the tier set/,
			),
		]);
		const readers = new Map<string, RowContract>(
			[...contractFor(4)].map(([file]) => [file, { none: 'n'.repeat(61) }]),
		);
		expect(setOf(4, exempt, readers).faults).toEqual([
			expect.stringMatching(/only 0 product gate\(s\) declare writes, below the floor of 5/),
		]);
		// The measure's own gate never counts toward the product-writer floor: four
		// product writers plus K is below it, however much K declares (mutation-verified
		// 2026-09-30: counting K left this file GREEN, since the real tree has 5 + K).
		const withSelf = listing(3);
		(withSelf.unit as string[]).push(MEASURE_SELF_GATE);
		(withSelf.imports as Map<string, string[]>).set(MEASURE_SELF_GATE, [HELPER]);
		expect(
			mariadbTierSet(
				withSelf,
				exempt,
				new Map([...contractFor(3), [MEASURE_SELF_GATE, { rises: ['rows_inserted'] }]]),
				noSeams,
				noIdle,
			).faults.filter((fault) => !/no-contact population has/.test(fault)),
		).toEqual([
			expect.stringMatching(/only 4 product gate\(s\) declare writes, below the floor of 5/),
		]);

		// The real maps: shrink-only. INSTALL_BOUND's one row is the e2e the owner retires.
		expect(INSTALL_BOUND_EXEMPT.size).toBeLessThanOrEqual(1);
		// NO_CONTACT_IDLE's three rows are the live-PHP-oracle differentials the owner
		// twins or deletes (integrator request 10).
		expect(NO_CONTACT_IDLE.size).toBeLessThanOrEqual(3);
		const real = realListing();
		// Floors bound to the walks: the derivation saw the trees it claims to.
		expect(real.unit.length).toBeGreaterThan(900);
		expect(real.integration.length).toBeGreaterThan(3);
		expect(real.parity.length).toBeGreaterThan(70);
		expect(real.imports.size).toBeGreaterThan(1000);
		const derived = mariadbTierSet(real);
		expect(derived.faults).toEqual([]);
		// Each half on the real tree, never their sum: 136 unit files alone clear a summed
		// floor of 80, so a derivation blind to test/parity would pass it (M3b). The floors
		// themselves are measured values — fix the derivation, never lower them.
		expect(NO_CONTACT_POPULATION_FLOOR).toBeGreaterThanOrEqual(60);
		expect(NO_CONTACT_PARITY_FLOOR).toBeGreaterThanOrEqual(20);
		const realHalf = (root: string) =>
			derived.set.noContact.filter((file) => file.startsWith(`${root}/`)).length;
		expect(realHalf('test/unit')).toBeGreaterThanOrEqual(NO_CONTACT_POPULATION_FLOOR);
		expect(realHalf('test/parity')).toBeGreaterThanOrEqual(NO_CONTACT_PARITY_FLOOR);
		expect(realHalf('test/unit') + realHalf('test/parity')).toBe(derived.set.noContact.length);
		// The finding's parity examples (review 2026-09-30) are measured, not declared.
		for (const file of [
			'test/parity/count_differential.test.ts',
			'test/parity/widgets_differential.test.ts',
			'test/parity/ts_mutations_differential.test.ts',
			'test/parity/area_dashboard_differential.test.ts',
		])
			expect(derived.set.noContact, file).toContain(file);
		// The finding's own examples are in the population — each reaches the pool module
		// only TRANSITIVELY (never by a direct import), which the one-hop leg could not see.
		for (const file of [
			'test/unit/reconcile_registry_native.test.ts',
			'test/unit/diffusion_server_control.test.ts',
			'test/unit/queue_fence_native.test.ts',
			'test/unit/delete_multi_native.test.ts',
		]) {
			expect(derived.set.noContact, file).toContain(file);
			expect((derived.set.chains.get(file) ?? []).length, file).toBeGreaterThan(2);
		}
		// Every SEAM_EDGES row is a live computed import in the graph, and its targets are
		// edges of the seam module (the closure crosses it).
		expect([...SEAM_EDGES.keys()].sort()).toEqual([...real.opaque]);
		expect(real.imports.get('src/core/tools/loader.ts')).toContain(
			'tools/tool_export/server/index.ts',
		);
		expect(real.imports.get('src/server.ts')).toContain('src/core/reconcile/catalog.ts');
	});

	test('(M7) the install-bound e2e contacts NOTHING unless armed at a present socket: the guard’s verdicts, and the file run UNARMED against a planted counting socket', async () => {
		// The one test/integration file outside the stage's set (INSTALL_BOUND_EXEMPT)
		// opens a pool without requireSuiteMariadb(); its guard is all that stands between
		// it and the installation's server. On the suite DB its plan never compiles, so
		// removing the guard changes no pass/skip count — hence the guard's own verdicts,
		// and the file's logged refusal plus a contact count, are what is held here.
		const dir = mkdtempSync('/tmp/dd_m7_');
		const planted = join(dir, 's');
		let contacts = 0;
		const listener = Bun.listen({
			unix: planted,
			socket: {
				open(socket) {
					contacts++;
					socket.end();
				},
				data() {},
			},
		});
		const saved = process.env.DEDALO_DIFFUSION_DB_SOCKET;
		try {
			// THE VERDICTS, over planted paths: armed at a live unix socket → may contact;
			// armed elsewhere → unarmed; armed at a missing path, or at a regular file → absent.
			const at = (socket: string) => ({ ...suiteMariadbPaths(), socket });
			const plain = join(dir, 'plain');
			writeFileSync(plain, '');
			const verdict = (armedAt: string, paths: ReturnType<typeof at>) => {
				process.env.DEDALO_DIFFUSION_DB_SOCKET = armedAt;
				return suiteContactRefusal(paths);
			};
			expect(verdict(planted, at(planted))).toBeNull();
			expect(verdict(join(dir, 'other'), at(planted))).toBe(SUITE_UNARMED_REFUSAL);
			expect(verdict(join(dir, 'absent'), at(join(dir, 'absent')))).toBe(
				SUITE_SOCKET_ABSENT_REFUSAL,
			);
			expect(verdict(plain, at(plain))).toBe(SUITE_SOCKET_ABSENT_REFUSAL);
		} finally {
			if (saved === undefined) delete process.env.DEDALO_DIFFUSION_DB_SOCKET;
			else process.env.DEDALO_DIFFUSION_DB_SOCKET = saved;
		}
		try {
			// THE FILE, UNARMED: a preload after the suite's re-points the engine at the
			// planted socket (so even a contact that got past the guard lands HERE, never on
			// the installation's server). It must log the unarmed refusal, run nothing, and
			// contact the socket 0 times.
			const preload = join(dir, 'unarm.ts');
			writeFileSync(
				preload,
				`process.env.DEDALO_DIFFUSION_DB_SOCKET = ${JSON.stringify(planted)};\n`,
			);
			const child = Bun.spawn(
				[
					process.execPath,
					'test',
					'--timeout=120000',
					'--preload',
					preload,
					'test/integration/diffusion_publish_e2e.test.ts',
				],
				{
					// The census's child env: the per-run seams stripped and the lane passed
					// explicitly, so the child's preloads re-arm THIS lane (never re-derive).
					cwd: REPO_ROOT,
					env: childEnv() as Record<string, string>,
					stdout: 'pipe',
					stderr: 'pipe',
				},
			);
			const [out, err, code] = await Promise.all([
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
				child.exited,
			]);
			const log = `${out}\n${err}`;
			expect(code, log).toBe(0);
			expect(log).toContain(`[diffusion_publish_e2e] SKIPPED`);
			expect(log).toContain(SUITE_UNARMED_REFUSAL);
			expect(log).toMatch(/^\s*0 pass$/m);
			expect(log).toMatch(/^\s*0 fail$/m);
			expect(log).toMatch(/^\s*[1-9]\d* skip$/m);
			expect(contacts).toBe(0);
			// Calibration: the planted socket COUNTS a contact.
			await Bun.connect({ unix: planted, socket: { data() {} } });
			for (let i = 0; i < 100 && contacts === 0; i++) await Bun.sleep(20);
			expect(contacts).toBe(1);
		} finally {
			listener.stop(true);
			rmSync(dir, { recursive: true, force: true });
		}
	}, 180_000);

	test('leg 1b verdict: planted controls — a zero batch that ran is clean; a contact, an acquisition, a silent file and a blind measure are each red', () => {
		const set = {
			files: ['s.test.ts'],
			mustAcquire: ['s.test.ts'],
			noContact: ['p.test.ts', 'q.test.ts'],
			chains: new Map<string, readonly string[]>([
				['p.test.ts', ['p.test.ts', 'src/b.ts', 'src/a.ts', MARIADB_POOL_MODULE]],
			]),
		};
		const ran = { tests: 2, skipped: 0, assertions: 3 };
		const run = { perFile: { 'p.test.ts': ran, 'q.test.ts': ran } };
		const clean = { run, contacts: 0, perFile: new Map<string, number>(), acquired: [] };
		expect(noContactFaults(clean, set)).toEqual([]);
		// Contact, attributed: the file is named with its chain; the other is not.
		expect(
			noContactFaults({ ...clean, contacts: 4, perFile: new Map([['p.test.ts', 4]]) }, set),
		).toEqual([
			expect.stringMatching(
				/^p\.test\.ts: opened 4 MariaDB connection\(s\) .* \(p\.test\.ts → src\/b\.ts → src\/a\.ts → src\/diffusion\/targets\/mariadb\/db\.ts\)/,
			),
		]);
		// Contact no single file reproduces: the batch itself is red, never green.
		expect(noContactFaults({ ...clean, contacts: 4, perFile: new Map() }, set)).toEqual([
			expect.stringMatching(
				/^the no-contact batch opened 4 MariaDB connection\(s\).*order-dependent/,
			),
		]);
		// A population file that never ran, or ran 0 cases, proves nothing.
		expect(
			noContactFaults({ ...clean, run: { perFile: { 'p.test.ts': { ...ran, tests: 0 } } } }, set),
		).toEqual([
			expect.stringMatching(/^p\.test\.ts: reached .* but ran no case/),
			expect.stringMatching(/^q\.test\.ts: reached .* but ran no case/),
		]);
		// ALL SKIPPED is ran-nothing too (bun's `tests` counts skipped cases): a file whose
		// every case skipped cannot vouch for a zero. A partial skip is reported, not red.
		expect(
			noContactFaults(
				{
					...clean,
					run: {
						perFile: {
							'p.test.ts': { tests: 3, skipped: 3, assertions: 0 },
							'q.test.ts': { tests: 3, skipped: 1, assertions: 2 },
						},
					},
				},
				set,
			),
		).toEqual([
			expect.stringMatching(/^p\.test\.ts: reached .* but ran no case .*3 case\(s\), 3 skipped/),
		]);
		// ZERO ASSERTIONS is never-ran too (measured, bun 1.4.2): a file whose beforeAll
		// throws reports tests=1, skipped=0, assertions=0 — one failed '(unnamed)' case.
		expect(
			noContactFaults(
				{
					...clean,
					run: {
						perFile: {
							'p.test.ts': { tests: 1, skipped: 0, assertions: 0 },
							'q.test.ts': ran,
						},
					},
				},
				set,
			),
		).toEqual([
			expect.stringMatching(/^p\.test\.ts: reached .* but executed 0 assertions .*'\(unnamed\)'/),
		]);
		// An IDLE row excuses an all-skipped file (and only that); a row whose file RUNS
		// is stale; a row never excuses a file that did not report or hit 0 assertions.
		const idle = new Map([['p.test.ts', 'i'.repeat(61)]]);
		const pIdle = { tests: 2, skipped: 2, assertions: 0 };
		expect(
			noContactFaults(
				{ ...clean, run: { perFile: { 'p.test.ts': pIdle, 'q.test.ts': ran } } },
				set,
				idle,
			),
		).toEqual([]);
		expect(noContactFaults(clean, set, idle)).toEqual([
			expect.stringMatching(
				/^NO_CONTACT_IDLE names p\.test\.ts, which now RUNS \(2 case\(s\), 0 skipped\)/,
			),
		]);
		expect(
			noContactFaults({ ...clean, run: { perFile: { 'q.test.ts': ran } } }, set, idle),
		).toEqual([expect.stringMatching(/^p\.test\.ts: reached .* but ran no case .*no report/)]);
		// An acquisition inside the batch: the set must derive that file.
		expect(noContactFaults({ ...clean, acquired: ['q.test.ts', 'q.test.ts'] }, set)).toEqual([
			expect.stringMatching(/^q\.test\.ts: acquired the suite target during the no-contact batch/),
		]);
		// The measure's own pair.
		expect(
			contactCalibrationFaults({ ran: true, contacts: 0 }, { ran: true, contacts: 4 }),
		).toEqual([]);
		expect(
			contactCalibrationFaults({ ran: true, contacts: 1 }, { ran: true, contacts: 4 }),
		).toEqual([expect.stringMatching(/opens NO pool moved the suite user's contacts by 1/)]);
		expect(
			contactCalibrationFaults({ ran: true, contacts: 0 }, { ran: false, contacts: Number.NaN }),
		).toEqual([
			expect.stringMatching(/the one-contact control did not run cleanly/),
			expect.stringMatching(
				/opens one pool without acquiring moved the suite user's contacts by NaN/,
			),
		]);
	});

	test('runtime imports: through the transpiler — type-only erased, dynamic counted, a dangling one throws', () => {
		const file = 'test/unit/x.test.ts';
		expect(
			runtimeImports(
				file,
				[
					"import type { A } from '../helpers/suite_mariadb.ts';",
					"type H = typeof import('../helpers/suite_mariadb_env.ts');",
					"// import { x } from '../helpers/zzd_diffusion_fixture.ts';",
					"const m = await import('../helpers/suite_mariadb_lock.ts');",
					"import { y } from '../helpers/test_database.ts';",
				].join('\n'),
			).sort(),
		).toEqual(['test/helpers/suite_mariadb_lock.ts', 'test/helpers/test_database.ts']);
		expect(() => runtimeImports(file, "import { z } from '../helpers/no_such_module.ts';")).toThrow(
			/resolves to no file/,
		);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// LIVE
// ─────────────────────────────────────────────────────────────────────────────

describe('suite MariaDB target — live, through the engine', () => {
	// A cold lane installs and starts its server: pay that here, under a hook timeout
	// sized for it. A failure is NOT swallowed — each leg awaits the same promise and
	// reports its message; an unarmed process starts nothing (leg (a) says why).
	beforeAll(async () => {
		if (armingFaults().length === 0 && loaded.module !== null) await ready().catch(() => {});
	}, 120_000);

	test('(a) this bun test process is ARMED at the suite server for this lane — never the installation’s socket', () => {
		expect(armingFaults(), 'this process would reach a MariaDB the suite did not start').toEqual(
			[],
		);
		const { suiteMariadbPaths, SUITE_MARIADB_USER } = helper();
		expect(readEnv('DEDALO_DIFFUSION_DB_SOCKET')).toBe(suiteMariadbPaths(LANE).socket);
		expect(readEnv('DEDALO_DIFFUSION_DB_USER')).toBe(SUITE_MARIADB_USER);
	});

	test('(b) through getTargetPool, the marker row of EVERY suite target names this lane', async () => {
		await ready();
		const { MARKER_PURPOSE } = helper();
		const names = [...ZZD_DATABASES, ...ZZDIF_DATABASES];
		expect(names.length).toBeGreaterThanOrEqual(3);
		for (const database of names) {
			expect(await markerRows(database), database).toEqual([
				{ suite_db: LANE, purpose: MARKER_PURPOSE },
			]);
		}
	});

	test('(c) the diffusion user can neither CREATE DATABASE (1044) nor write the marker (1142)', async () => {
		const database = ZZD_DATABASES[0] as string;
		await refuseUnlessMarked(database);
		const pool = getTargetPool(database);
		const created = await errnoOf(pool.unsafe('CREATE DATABASE dedalo_ts_test_probe_denied', []));
		if (created === 'no error') await pool.unsafe('DROP DATABASE dedalo_ts_test_probe_denied', []);
		expect(created, 'CREATE DATABASE must be denied to the diffusion user').toBe(1044);
		const forged = await errnoOf(
			pool.unsafe(
				`INSERT INTO ${MARKER} (database_name, suite_db, purpose) VALUES ('zzd_forged', ?, 'dedalo-suite-target')`,
				[LANE],
			),
		);
		if (forged === 'no error')
			await pool.unsafe(`DELETE FROM ${MARKER} WHERE database_name = 'zzd_forged'`, []);
		expect(forged, 'the marker must be read-only to the diffusion user').toBe(1142);
	});

	test('(d) the diffusion user holds no global privilege', async () => {
		const database = ZZD_DATABASES[0] as string;
		await refuseUnlessMarked(database);
		const grants = (await getTargetPool(database).unsafe('SHOW GRANTS', [])) as Record<
			string,
			string
		>[];
		const lines = grants.map((row) => Object.values(row)[0] as string);
		expect(lines.length).toBeGreaterThan(0);
		const global = lines.filter(
			(line) => / ON \*\.\* /.test(line) && !/^GRANT USAGE ON \*\.\* /.test(line),
		);
		expect(global).toEqual([]);
	});

	test('(e) the control databases are reachable and granted, and the classifier REFUSES both on the live marker read', async () => {
		await ready();
		const { classifySuiteTarget, probeSuiteTarget, UNMARKED_CONTROL_DB, FOREIGN_CONTROL_DB } =
			helper();
		const unmarked = await probeSuiteTarget(UNMARKED_CONTROL_DB);
		expect(unmarked).toEqual({ ok: true, rows: [] });
		expect(
			classifySuiteTarget({
				armed: true,
				lane: LANE,
				database: UNMARKED_CONTROL_DB,
				probe: unmarked,
			}),
		).toMatchObject({
			ready: false,
			cause: 'no_row',
		});
		const foreign = await probeSuiteTarget(FOREIGN_CONTROL_DB);
		expect(foreign).toMatchObject({
			ok: true,
			rows: [{ suite_db: 'dedalo_foreign_suite_control' }],
		});
		expect(
			classifySuiteTarget({
				armed: true,
				lane: LANE,
				database: FOREIGN_CONTROL_DB,
				probe: foreign,
			}),
		).toMatchObject({
			ready: false,
			cause: 'foreign',
		});
		// The third control: GRANTED and never created — the one name the server answers
		// 1049 for (every ungranted absent name answers 1044 first). The delete/writer
		// gates' 1049 legs depend on exactly this errno; an ungranted name for contrast.
		const { GRANTED_ABSENT_CONTROL_DB } = helper();
		expect(await errnoOf(getTargetPool(GRANTED_ABSENT_CONTROL_DB).unsafe('SELECT 1', []))).toBe(
			1049,
		);
		expect(await errnoOf(getTargetPool('zzd_never_granted_control').unsafe('SELECT 1', []))).toBe(
			1044,
		);
	});

	test('(h) the write measure counts the suite user’s rows and nothing else: the harness moves it by 0, one real row by ≥1', async () => {
		// What scripts/ci/mariadb_tier.ts leg 4 reads. Its first form (global Com_*)
		// rose from the harness alone — provisioning as root, the self-check's REFUSED
		// insert — so a set that wrote nothing passed (review 2026-09-30). The stage
		// calibrates itself on every run; this is the same claim held in the unit suite.
		const database = ZZD_DATABASES[0] as string;
		await refuseUnlessMarked(database);
		const { reprovisionSuiteMariadb, suiteUserWrites } = helper();
		const before = await suiteUserWrites(LANE);
		await reprovisionSuiteMariadb(LANE); // root provisioning + the refused self-check writes
		await markerRows(database); // the gate door's marker read
		const idle = await suiteUserWrites(LANE);
		expect(idle, 'the harness alone must move no suite-user row').toEqual(before);

		const pool = getTargetPool(database);
		await pool.unsafe('CREATE TABLE IF NOT EXISTS zz_write_measure (id INT PRIMARY KEY)', []);
		try {
			await pool.unsafe('INSERT INTO zz_write_measure (id) VALUES (1), (2)', []);
			await pool.unsafe('DELETE FROM zz_write_measure WHERE id = 1', []);
		} finally {
			await pool.unsafe('DROP TABLE IF EXISTS zz_write_measure', []);
		}
		const after = await suiteUserWrites(LANE);
		expect(after.rows_inserted - idle.rows_inserted).toBeGreaterThanOrEqual(2);
		expect(after.rows_deleted - idle.rows_deleted).toBeGreaterThanOrEqual(1);
	});

	test('(g) the gate door REFUSES a declared target whose marker names another lane, and an undeclared database even when granted and marked for this lane — and ledgers neither', async () => {
		// Both plants are otherwise ACCEPTABLE to one of the door's two rules, so each
		// refusal below is that rule's outcome, not a side effect of the other (or of a
		// grant the plant lacks). Mutation-verified 2026-09-30: dropping the door's
		// marker loop, or its by-name rule, left every other leg green.
		await ready();
		const {
			classifySuiteTarget,
			FOREIGN_SUITE_DB,
			probeSuiteTarget,
			requireSuiteMariadb,
			SUITE_MARIADB_USER,
			suiteMariadbAdminQuery,
			suiteMariadbPaths,
		} = helper();
		const ledger = suiteMariadbPaths(LANE).acquisitions;
		const ledgerLines = () => readFileSync(ledger, 'utf8').split('\n').filter(Boolean).length;
		const before = ledgerLines();

		// 1. A DECLARED target whose marker row names a FOREIGN lane: the name rule
		//    admits it, the marker read must refuse it.
		const declared = ZZD_DATABASES[1] as string;
		try {
			await suiteMariadbAdminQuery(
				`UPDATE ${MARKER} SET suite_db = '${FOREIGN_SUITE_DB}' WHERE database_name = '${declared}';`,
				LANE,
			);
			await expect(requireSuiteMariadb(import.meta.path, [declared])).rejects.toThrow(
				/REFUSED \(foreign\)/,
			);
		} finally {
			await suiteMariadbAdminQuery(
				`UPDATE ${MARKER} SET suite_db = '${LANE}' WHERE database_name = '${declared}';`,
				LANE,
			);
		}
		expect(await markerRows(declared), 'the planted foreign row was restored').toEqual([
			{ suite_db: LANE, purpose: 'dedalo-suite-target' },
		]);

		// 2. An UNDECLARED database, granted and marked for THIS lane: the marker read
		//    admits it (proven live), the by-name rule must refuse it.
		const undeclared = 'zzd_undeclared_lane_control';
		const user = `'${SUITE_MARIADB_USER}'@'localhost'`;
		try {
			await suiteMariadbAdminQuery(
				[
					`CREATE DATABASE IF NOT EXISTS \`${undeclared}\`;`,
					`GRANT SELECT ON \`${undeclared}\`.* TO ${user};`,
					`INSERT INTO ${MARKER} (database_name, suite_db, purpose) VALUES ('${undeclared}', '${LANE}', 'dedalo-suite-target') ON DUPLICATE KEY UPDATE suite_db = VALUES(suite_db);`,
				].join('\n'),
				LANE,
			);
			expect(
				classifySuiteTarget({
					armed: true,
					lane: LANE,
					database: undeclared,
					probe: await probeSuiteTarget(undeclared),
				}),
				'the undeclared plant must pass the marker read — otherwise this leg proves nothing about the name rule',
			).toEqual({ ready: true });
			await expect(requireSuiteMariadb(import.meta.path, [undeclared])).rejects.toThrow(
				/is not a suite MariaDB target/,
			);
		} finally {
			await suiteMariadbAdminQuery(
				[
					`DELETE FROM ${MARKER} WHERE database_name = '${undeclared}';`,
					`REVOKE ALL PRIVILEGES ON \`${undeclared}\`.* FROM ${user};`,
					`DROP DATABASE IF EXISTS \`${undeclared}\`;`,
				].join('\n'),
				LANE,
			);
		}
		expect(ledgerLines(), 'a refused acquisition must leave no ledger row').toBe(before);
	});

	test('(f) a writer round trip lands on the suite target and reads back', async () => {
		const database = ZZD_DATABASES[0] as string;
		await refuseUnlessMarked(database);
		const table = 'dedalo_ts_test_suite_roundtrip';
		const pool = getTargetPool(database);
		await pool.unsafe(`DROP TABLE IF EXISTS ${table}`, []);
		const field: FieldPlan = {
			id: 'testdd1',
			columnName: 'title',
			sourceChain: [],
			transform: [],
			column: { fieldModel: 'field_varchar', varcharLength: 50 },
			policy: {},
		};
		const section: SectionPlan = {
			sectionTipo: 'test3',
			tableName: table,
			tableTipo: 'testdd0',
			fields: [field],
		};
		const plan: PublicationPlan = {
			planId: 'suite-roundtrip',
			elementTipo: 'testdd_element',
			format: 'sql',
			serviceName: null,
			target: { kind: 'table', database },
			sections: [section],
			recursion: { maxLevels: 1 },
			langPolicy: { langs: ['lg-eng'], mainLang: 'lg-eng' },
			warnings: [],
		};
		try {
			const session = await mariadbSqlWriter.open(plan);
			await session.ensureSchema();
			expect(
				await session.writeRows(section, [
					{ sectionId: 7, lang: 'lg-eng', columns: { title: 'suite 🏛️' } },
				]),
			).toEqual({ written: 1, deleted: 0 });
			await session.close();
			const rows = (await pool.unsafe(
				`SELECT section_id, lang, title FROM ${table}`,
				[],
			)) as unknown[];
			expect(rows).toEqual([{ section_id: 7, lang: 'lg-eng', title: 'suite 🏛️' }]);
		} finally {
			await pool.unsafe(`DROP TABLE IF EXISTS ${table}`, []);
		}
	});

	test('(i) the lane lock admits ONE process at a time, and a KILLED holder frees it at once', async () => {
		// The first lock (O_EXCL + "dead pid → rm") let two processes hold it together
		// (review 2026-09-30); the kernel-released flock has no stale step to race. Held
		// here from real child processes, so a regression to any file-content lock shows
		// as overlapping holds or a lock a killed holder never gives back.
		await ready(); // the lane root exists
		const lockModule = join(import.meta.dir, '..', 'helpers', 'suite_mariadb_lock.ts');
		const env = { ...process.env, DEDALO_TEST_DATABASE: LANE };
		const holder = (holdMs: number) =>
			Bun.spawn(
				[
					'bun',
					'-e',
					`const { acquireSuiteMariadbLock } = await import(${JSON.stringify(lockModule)});
const release = await acquireSuiteMariadbLock(${JSON.stringify(LANE)}, 60_000);
const from = performance.timeOrigin + performance.now();
console.log('held');
await Bun.sleep(${holdMs});
const to = performance.timeOrigin + performance.now();
release();
console.log(JSON.stringify([from, to]));`,
				],
				{ env, stdout: 'pipe', stderr: 'pipe' },
			);

		// 1. Exclusive: four concurrent holders, 300 ms each — no two intervals overlap.
		const children = Array.from({ length: 4 }, () => holder(300));
		const outputs = await Promise.all(
			children.map(async (child) => {
				const [out, err, code] = await Promise.all([
					new Response(child.stdout).text(),
					new Response(child.stderr).text(),
					child.exited,
				]);
				expect(code, err).toBe(0);
				return JSON.parse(out.trim().split('\n').at(-1) as string) as [number, number];
			}),
		);
		const spans = outputs.sort((a, b) => a[0] - b[0]);
		expect(spans).toHaveLength(4);
		for (let i = 1; i < spans.length; i++)
			expect(
				(spans[i] as [number, number])[0],
				'a holder began before the previous one released',
			).toBeGreaterThanOrEqual((spans[i - 1] as [number, number])[1]);

		// 2. Kernel-released: a holder killed mid-hold (no release, no cleanup) frees the
		//    lock immediately — this process takes it well inside a 5 s budget.
		const victim = holder(60_000);
		const reader = victim.stdout.getReader();
		const first = await reader.read();
		expect(new TextDecoder().decode(first.value)).toContain('held');
		victim.kill('SIGKILL');
		await victim.exited;
		const { acquireSuiteMariadbLock } = await import('../helpers/suite_mariadb_lock.ts');
		const started = Date.now();
		const release = await acquireSuiteMariadbLock(LANE, 5_000);
		release();
		expect(Date.now() - started).toBeLessThan(5_000);
	}, 60_000);
});
