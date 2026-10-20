/**
 * THE RESUME DRILL — an install killed ANYWHERE is finished by `--resume` into
 * the SAME install a clean run makes, and `--abort` takes back exactly what the
 * install created (terminal installer phase 1, 2026-10-11;
 * src/core/install/executor.ts, steps.ts, db_restore.ts, scripts/install.ts).
 *
 * Real installs (the real step table, the real seed, the real ontology and
 * thesaurus imports) into scratch databases this gate CREATES and DROPS, each
 * with its own scratch private dir, server-state path and session store — the
 * live install and the suite database are never touched.
 *
 *  A  clean: one fresh run. Then, on it: `--resume` says "already complete" and
 *     runs nothing; a second fresh run REFUSES on the install record and leaves
 *     the .env's bytes and mtime alone; `--resume --entity other` refuses and
 *     names `entity`; the WIZARD's seed step on that seeded database still
 *     refuses (install.state_conflict); `--abort` of the SEALED install refuses
 *     and changes nothing.
 *  B  chained: killed (SIGKILL through the DEDALO_INSTALL_FAULT seam) right AFTER
 *     each plan step in turn — run 1 dies after step 1, its `--resume` after
 *     step 2, … — then a clean `--resume`. Every resume repeats the original
 *     command line (the documented way: the same answers + `--resume`).
 *  C  mid-seed: killed (the whole process group, psql included) WHILE the seed
 *     restore runs (seen in pg_stat_activity as `dedalo_install_seed`): the
 *     database is EMPTY afterwards (the restore is one transaction), then
 *     resumed with a kill BEFORE install_ontologies and another BEFORE
 *     install_hierarchies (steps left `running`, rerun), then finished.
 *  FINGERPRINT: B and C equal A — per-TLD record counts of dd_ontology, the row
 *     count of every matrix table but the audit LOGS (activity, time machine,
 *     counters: an interrupted step's retry legitimately logs twice), the
 *     thesaurus registry's active flags, the root password set (and verifying),
 *     install_status `sealed`, the written .env (owned keys, the per-install
 *     ones aside).
 *  SECRETS: no root (or, on a trust connection, database) password in any plan
 *     file, state file or printed line of any run; the generated
 *     DEDALO_SALT_STRING printed EXACTLY ONCE per install, chain included.
 *  E  abort: killed after install_ontologies; `--abort` without (or with a
 *     wrong) `--confirm-database` touches nothing; confirmed, the database is
 *     back to ZERO user objects with only its pre-install extensions, the .env
 *     and every backup/sample the install wrote are gone, and the run dir too.
 *  F  what is the install's (review 2026-10-11): a fresh run while another
 *     session HOLDS the server-side install lock is refused, writing nothing; a
 *     database that became non-empty (a backup restored into it) between a
 *     killed pre-seed run and its `--resume` is neither adopted nor seeded, and
 *     `--abort` refuses to reset it (its table survives) — the seed's STAMP is
 *     what makes a database the install's; a resume while an orphan installer
 *     session is connected is refused; and a seed step left `running` over a
 *     HALF-ACTIVATED Languages hierarchy (hierarchy125 + hierarchy59 gone) is
 *     re-run, not adopted — its verify (seedComplete) says not ok before and
 *     ok after, and the registry row is whole again.
 *  PREFLIGHT REFUSALS (the database half of install_validation_upfront): on the
 *     empty database E, a weak root password is refused with the database left
 *     at zero objects; with one stray table, the install refuses ("not empty")
 *     leaving exactly that table; a database that does not exist is refused —
 *     each writing NOTHING to its private dir.
 *
 * Skips (named, not silent) when the admin role cannot CREATE DATABASE. Crash
 * teardown: every DROP is WITH (FORCE), and beforeAll sweeps this gate's own
 * orphaned `<prefix><dead pid>_<x>` databases (test/helpers/scratch_database.ts).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { config } from '../../src/config/config.ts';
import { parseEnvFile } from '../../src/config/env.ts';
import {
	holdInstallLock,
	inspectTargetDatabase,
	SEED_APP_NAME,
	seedAppName,
} from '../../src/core/install/db_restore.ts';
import { resolvePgBinary } from '../../src/core/install/pg_bin.ts';
import type { DbConnDescriptor } from '../../src/core/install/pg_exec.ts';
import { connArgs, pgClientEnv, runPsql } from '../../src/core/install/pg_exec.ts';
import { rootPasswordMatches, rootPasswordState } from '../../src/core/install/root_pw.ts';
import type { InstallState, PlanFile } from '../../src/core/install/run_files.ts';
import { devServeIsolationEnv, devServeSocketArgs } from '../helpers/dev_serve_isolation.ts';
import { freeTcpPort } from '../helpers/free_tcp_port.ts';
import { sweepOrphanScratchDatabases } from '../helpers/scratch_database.ts';
import { expectTrustSeamHeld } from '../helpers/trust_seam.ts';

/** The developer listener's port for every run of this file (one value: a resume compares answers). */
const DEV_PORT = freeTcpPort();

const PREFIX = 'dedalo_install_drill_';
const dbName = (scenario: string): string => `${PREFIX}${process.pid}_${scenario}`;
const ROOT = resolve(import.meta.dir, '../..');
const CLI = join(ROOT, 'scripts/install.ts');
const scratchRoot = mkdtempSync(join(tmpdir(), 'dedalo_install_drill_'));

const admin: DbConnDescriptor = {
	database: 'postgres',
	host: config.db.host,
	port: config.db.port,
	user: config.db.user,
	password: config.db.password,
	socket: config.db.socket,
};

/** Decided at collection time (test.if reads it then — see install_e2e's header). */
async function adminCanCreateDatabase(): Promise<boolean> {
	const probe = await runPsql(admin, [
		'-tAc',
		'SELECT rolcreatedb OR rolsuper FROM pg_roles WHERE rolname = current_user',
	]);
	return probe.exitCode === 0 && probe.stdout.trim() === 't';
}
const available = await adminCanCreateDatabase();
const WHY_SKIPPED =
	'SKIPPED: no admin Postgres connection (DB_ADMIN_* unset, or the role lacks CREATEDB)';
const named = (what: string): string => (available ? what : `${what} — ${WHY_SKIPPED}`);

/** The root password (passes the policy; distinctive, so a leak is findable). */
const ROOT_PASSWORD = 'Sentinel-Root-Kestrel-91';
/**
 * The database password: the admin's own when the server asks for one (CI's
 * scram); otherwise (a desk's trust auth ignores it) a SENTINEL — and only a
 * sentinel is scanned for, never a real password that may be a common word.
 */
const DB_PASSWORD = config.db.password || 'SENTINEL-drill-db-6Wq4';
const SCANNED_SECRETS = config.db.password ? [ROOT_PASSWORD] : [ROOT_PASSWORD, DB_PASSWORD];

const SCENARIOS = ['a', 'b', 'c', 'e', 'f'] as const;

beforeAll(async () => {
	if (!available) return;
	await sweepOrphanScratchDatabases(admin, PREFIX, { derivedSuffix: /^_[a-z]+$/ });
	for (const scenario of SCENARIOS) {
		await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${dbName(scenario)}" WITH (FORCE)`]);
		const created = await runPsql(admin, ['-c', `CREATE DATABASE "${dbName(scenario)}"`]);
		expect(created.exitCode, `CREATE DATABASE ${dbName(scenario)}: ${created.stderr}`).toBe(0);
	}
});

afterAll(async () => {
	if (available) {
		for (const scenario of [...SCENARIOS, 'missing']) {
			await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${dbName(scenario)}" WITH (FORCE)`]);
		}
	}
	rmSync(scratchRoot, { recursive: true, force: true });
});

// ── running the CLI ──────────────────────────────────────────────────────────

/** The answers every install gives (`none`: only the thesauri the release declares). */
function answersArgv(db: string): string[] {
	return [
		'--db-name',
		db,
		'--db-user',
		config.db.user,
		'--db-host',
		config.db.host,
		'--db-port',
		String(config.db.port),
		...(config.db.socket === '' ? [] : ['--db-socket', config.db.socket]),
		'--entity',
		'drill',
		'--hierarchies',
		'none',
		// A free development port: 3500 may be a running `bun run dev` here (D3 refuses it).
		'--dev-port',
		String(DEV_PORT),
		// Its own socket: the written .env's SERVER_UNIX_SOCKET is what the serve check boots on.
		...devServeSocketArgs(),
	];
}

interface Run {
	exitCode: number | null;
	signal: string | number | null;
	out: string;
}

/** A scratch private dir (server state + session store inside it). */
function privateDir(name: string): string {
	return mkdtempSync(join(scratchRoot, `${name}_`));
}

/** The child environment: inherited, minus every DEDALO_INSTALL_*, plus this run's. */
function childEnv(dir: string, extra: Record<string, string> = {}): Record<string, string> {
	const base = Object.fromEntries(
		Object.entries(Bun.env).filter(
			([key, value]) => value !== undefined && !key.startsWith('DEDALO_INSTALL_'),
		),
	) as Record<string, string>;
	return {
		...base,
		DEDALO_INSTALL_PRIVATE_DIR: dir,
		DEDALO_TS_STATE_PATH: join(dir, 'ts_state.json'),
		DEDALO_SESSION_DB_PATH: join(dir, 'sessions.sqlite'),
		DEDALO_INSTALL_ROOT_PASSWORD: ROOT_PASSWORD,
		DEDALO_INSTALL_DB_PASSWORD: DB_PASSWORD,
		// The serve check boots this install's server (verify_dev_server): its own socket,
		// media root and processes dir — never the suite's (dev_serve_isolation.ts).
		...devServeIsolationEnv(),
		...extra,
	};
}

function runCli(dir: string, argv: readonly string[], extra: Record<string, string> = {}): Run {
	const proc = Bun.spawnSync([process.execPath, 'run', CLI, ...argv], {
		cwd: ROOT,
		env: childEnv(dir, extra),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	return {
		exitCode: proc.exitCode,
		signal: proc.signalCode ?? null,
		out: proc.stdout.toString() + proc.stderr.toString(),
	};
}

/** A run killed by the fault seam at `<step>:<when>`: it must have died of SIGKILL. */
function faultedRun(
	dir: string,
	argv: readonly string[],
	fault: string,
	extra: Record<string, string> = {},
): Run {
	const run = runCli(dir, argv, { ...extra, DEDALO_INSTALL_FAULT: fault });
	expect(run.signal, `${fault}: expected a SIGKILL, got exit ${run.exitCode}\n${run.out}`).toBe(
		'SIGKILL',
	);
	return run;
}

const runDir = (dir: string): string => join(dir, 'install');
const readState = (dir: string): InstallState =>
	JSON.parse(readFileSync(join(runDir(dir), 'install.state.json'), 'utf8')) as InstallState;
const readPlan = (dir: string): PlanFile =>
	JSON.parse(readFileSync(join(runDir(dir), 'install.plan.json'), 'utf8')) as PlanFile;

/** The run files' text (plan, state, a lock if left; the staging dir is not a run file). */
function runFilesText(dir: string): string {
	if (!existsSync(runDir(dir))) return '';
	return readdirSync(runDir(dir))
		.filter((name) => name.startsWith('install.'))
		.map((name) => readFileSync(join(runDir(dir), name), 'utf8'))
		.join('\n');
}

const leaked = (text: string): string[] =>
	SCANNED_SECRETS.filter((secret) => text.includes(secret));

// ── reading an install back ──────────────────────────────────────────────────

const connOf = (db: string): DbConnDescriptor => ({ ...admin, database: db });

async function rows(db: string, query: string): Promise<string[]> {
	const res = await runPsql(connOf(db), ['-tAF', '|', '-v', 'ON_ERROR_STOP=1', '-c', query]);
	expect(res.exitCode, `${query}: ${res.stderr}`).toBe(0);
	return res.stdout.split('\n').filter((line) => line !== '');
}

/**
 * Audit LOGS are excluded: a step interrupted after its work and re-run, or a
 * re-verified activation, legitimately appends rows there. Everything else is
 * install CONTENT and must be equal.
 */
const LOG_TABLE = /^matrix_(activity|time_machine|counter.*)$/;

/** The .env keys that differ per install by design. */
const PER_INSTALL_ENV_KEYS = new Set(['DB_NAME', 'DEDALO_SALT_STRING', 'DB_PASSWORD']);

interface Fingerprint {
	ontology: string[];
	tables: string[];
	registry: string[];
	rootPassword: string;
	rootPasswordVerifies: boolean;
	installStatus: unknown;
	env: Record<string, string>;
}

async function fingerprint(db: string, dir: string): Promise<Fingerprint> {
	const tables = (
		await rows(
			db,
			"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name LIKE 'matrix%' ORDER BY 1",
		)
	).filter((table) => !LOG_TABLE.test(table));
	const counts: string[] = [];
	for (const table of tables) {
		const [count] = await rows(db, `SELECT count(*) FROM "${table}"`);
		counts.push(`${table}=${count}`);
	}
	const env = parseEnvFile(readFileSync(join(dir, '.env'), 'utf8'));
	for (const key of PER_INSTALL_ENV_KEYS) delete env[key];
	// A path inside the install's OWN private dir (the developer listener's
	// local-CA pair, <private>/tls) is compared relative to it: each run has its own dir.
	for (const [key, value] of Object.entries(env)) env[key] = value.split(dir).join('<private>');
	return {
		ontology: await rows(db, 'SELECT tld, count(*) FROM dd_ontology GROUP BY tld ORDER BY tld'),
		tables: counts,
		registry: await rows(
			db,
			`SELECT lower(string->'hierarchy6'->0->>'value'), coalesce(relation->'hierarchy4'->0->>'section_id', '-')
			   FROM matrix_hierarchy_main WHERE section_tipo = 'hierarchy1' ORDER BY 1, 2`,
		),
		rootPassword: await rootPasswordState(connOf(db)),
		rootPasswordVerifies: await rootPasswordMatches(ROOT_PASSWORD, connOf(db)),
		installStatus: (
			JSON.parse(readFileSync(join(dir, 'ts_state.json'), 'utf8')) as { install_status?: unknown }
		).install_status,
		env,
	};
}

/** Every step done, the outcome complete. */
function expectComplete(dir: string): void {
	const state = readState(dir);
	expect(state.outcome).toBe('complete');
	for (const [step, record] of Object.entries(state.steps)) {
		expect(record.status, step).toBe('done');
	}
}

/** The salt this install generated, and how often the given output printed it. */
function saltCount(dir: string, out: string): number {
	const salt = parseEnvFile(readFileSync(join(dir, '.env'), 'utf8')).DEDALO_SALT_STRING ?? '';
	expect(salt.length).toBeGreaterThan(8);
	return out.split(salt).length - 1;
}

// ── the scenarios ────────────────────────────────────────────────────────────

const dirA = privateDir('a');
const dirB = privateDir('b');
const dirC = privateDir('c');
let clean: Fingerprint | null = null;

describe('install resume drill', () => {
	test.if(available)(
		named(
			'A: a clean install; resume says already complete; re-run, other answers and abort-after-seal refuse',
		),
		async () => {
			const first = runCli(dirA, answersArgv(dbName('a')));
			expect(first.exitCode, first.out).toBe(0);
			// childEnv strips DEDALO_INSTALL_*: the trust seam must still reach the child.
			expectTrustSeamHeld(first.out, dirA);
			expectComplete(dirA);
			expect(leaked(first.out + runFilesText(dirA))).toEqual([]);
			expect(saltCount(dirA, first.out)).toBe(1);
			clean = await fingerprint(dbName('a'), dirA);
			expect(clean.installStatus).toBe('sealed');
			expect(clean.rootPassword).toBe('set');
			expect(clean.rootPasswordVerifies).toBe(true);
			expect(clean.ontology.length).toBeGreaterThan(3);
			// Anti-vacuity: the fingerprint compares real content.
			expect(clean.tables.some((entry) => /^matrix_ontology=\d{3,}$/.test(entry))).toBe(true);

			const resumed = runCli(dirA, ['--resume']);
			expect(resumed.exitCode, resumed.out).toBe(0);
			expect(resumed.out).toContain(
				'install already complete — every done step that has a check was verified again',
			);
			// It ran nothing: every step still has its one attempt.
			for (const [step, record] of Object.entries(readState(dirA).steps)) {
				expect(record.attempts, step).toBe(1);
			}

			const envPath = join(dirA, '.env');
			const envBefore = { text: readFileSync(envPath, 'utf8'), mtime: statSync(envPath).mtimeMs };
			const again = runCli(dirA, answersArgv(dbName('a')));
			expect(again.exitCode).toBe(1);
			expect(again.out).toContain('an install record exists');
			expect(readFileSync(envPath, 'utf8')).toBe(envBefore.text);
			expect(statSync(envPath).mtimeMs).toBe(envBefore.mtime);

			const other = runCli(dirA, [
				...answersArgv(dbName('a')).map((arg) => (arg === 'drill' ? 'other' : arg)),
				'--resume',
			]);
			expect(other.exitCode).toBe(1);
			expect(other.out).toMatch(/answers differ from the saved plan: [a-z_, ]*\bentity\b/);

			// The seed step WITHOUT this install's id on the same seeded database still
			// REFUSES (the executor's resumable variant is its own input — installId).
			const unstampedSeed = Bun.spawnSync(
				[
					process.execPath,
					'-e',
					[
						"const { STEP_RUNS } = await import('./src/core/install/step_runs.ts');",
						"try { await STEP_RUNS.install_db_from_default_file({ posted: {}, createDirectories: false, actorUserId: -1 }); console.log('NOT REFUSED'); }",
						'catch (error) { console.log(`${error.code}: ${error.message}`); }',
					].join('\n'),
				],
				{
					cwd: ROOT,
					env: { ...childEnv(dirA), DB_NAME: dbName('a') },
					stdout: 'pipe',
					stderr: 'pipe',
				},
			);
			expect(unstampedSeed.stdout.toString(), unstampedSeed.stderr.toString()).toContain(
				'install.state_conflict: Database is not empty (matrix_users already exists)',
			);

			const abort = runCli(dirA, ['--abort', '--confirm-database', dbName('a')]);
			expect(abort.exitCode).toBe(1);
			expect(abort.out).toContain('SEALED');
			expect(await fingerprint(dbName('a'), dirA)).toEqual(clean);
		},
		600000,
	);

	test.if(available)(
		named('B: killed after EACH step in turn, resumed every time → the clean install'),
		async () => {
			expect(clean, 'scenario A ran first').not.toBeNull();
			const argv = answersArgv(dbName('b'));
			const steps = readPlan(dirA).steps;
			expect(steps.length).toBeGreaterThan(7);
			let out = '';
			for (const [index, step] of steps.entries()) {
				const run = faultedRun(dirB, index === 0 ? argv : [...argv, '--resume'], `${step}:after`);
				out += run.out;
				const state = readState(dirB);
				// The killed run checkpointed its step done (and nothing beyond it ran).
				expect(state.steps[step]?.status, step).toBe('done');
				for (const later of steps.slice(index + 1)) {
					expect(state.steps[later]?.status, `${later} after a kill at ${step}`).toBe('pending');
				}
				expect(leaked(runFilesText(dirB)), `run files after ${step}`).toEqual([]);
			}
			const last = runCli(dirB, [...argv, '--resume']);
			out += last.out;
			expect(last.exitCode, last.out).toBe(0);
			expectComplete(dirB);
			// No step ran twice: each was attempted exactly once across the chain.
			for (const [step, record] of Object.entries(readState(dirB).steps)) {
				expect(record.attempts, step).toBe(1);
			}
			expect(readState(dirB).runs.length).toBe(steps.length + 1);
			expect(leaked(out)).toEqual([]);
			expect(saltCount(dirB, out)).toBe(1);
			expect(await fingerprint(dbName('b'), dirB)).toEqual(clean as Fingerprint);
		},
		900000,
	);

	test.if(available)(
		named(
			'C: killed DURING the seed restore → empty database; then killed before two steps; resumed → the clean install',
		),
		async () => {
			expect(clean, 'scenario A ran first').not.toBeNull();
			const db = dbName('c');
			const argv = answersArgv(db);
			const out: string[] = [];

			// The whole process group (bun + its psql children) dies while the seed runs.
			const child = spawn(process.execPath, ['run', CLI, ...argv], {
				cwd: ROOT,
				env: childEnv(dirC),
				detached: true,
				stdio: ['ignore', 'pipe', 'pipe'],
			});
			child.stdout?.on('data', (chunk: Buffer) => out.push(chunk.toString()));
			child.stderr?.on('data', (chunk: Buffer) => out.push(chunk.toString()));
			const exited = new Promise<void>((done) => child.on('exit', () => done()));
			const seedSeen = await waitFor(async () => (await seedBackends(db)) > 0, 120000);
			expect(seedSeen, `the seed restore never showed in pg_stat_activity:\n${out.join('')}`).toBe(
				true,
			);
			process.kill(-(child.pid as number), 'SIGKILL');
			await exited;
			// The server may take a moment to end the killed backend (and roll it back).
			expect(await waitFor(async () => (await installerBackends(db)) === 0, 60000)).toBe(true);
			const afterKill = await inspectTargetDatabase(connOf(db));
			expect(afterKill.userObjects, 'the killed restore left objects behind').toEqual([]);
			expect(afterKill.emptyForInstall).toBe(true);
			expect(readState(dirC).steps.install_db_from_default_file?.status).toBe('running');

			let all = out.join('');
			const beforeOntologies = faultedRun(dirC, [...argv, '--resume'], 'install_ontologies:before');
			all += beforeOntologies.out;
			expect(readState(dirC).steps.install_ontologies?.status).toBe('running');
			const beforeHierarchies = faultedRun(
				dirC,
				[...argv, '--resume'],
				'install_hierarchies:before',
			);
			all += beforeHierarchies.out;
			expect(readState(dirC).steps.install_hierarchies?.status).toBe('running');

			const last = runCli(dirC, [...argv, '--resume']);
			all += last.out;
			expect(last.exitCode, last.out).toBe(0);
			expectComplete(dirC);
			const steps = readState(dirC).steps;
			expect(steps.install_db_from_default_file?.attempts).toBe(2);
			expect(steps.install_ontologies?.attempts).toBe(2);
			expect(steps.install_hierarchies?.attempts).toBe(2);
			expect(leaked(all + runFilesText(dirC))).toEqual([]);
			expect(saltCount(dirC, all)).toBe(1);
			expect(await fingerprint(db, dirC)).toEqual(clean as Fingerprint);
		},
		900000,
	);

	test.if(available)(
		named(
			'E: --abort takes back exactly what the install created (confirmed only); then the preflight refusals',
		),
		async () => {
			const db = dbName('e');
			const conn = connOf(db);
			const preexisting = (await inspectTargetDatabase(conn)).extensions;
			const dirE = privateDir('e');
			const argv = answersArgv(db);
			// The backups a host route's units write (C3-55): the engine checks THAT directory.
			const unitBackups = join(privateDir('e_backups'), 'db');
			faultedRun(dirE, argv, 'install_ontologies:after', { DEDALO_BACKUP_DIR: unitBackups });
			expect((await inspectTargetDatabase(conn)).userObjectCount).toBeGreaterThan(100);
			expect(existsSync(join(dirE, '.env'))).toBe(true);
			expect(existsSync(unitBackups)).toBe(true);
			expect(existsSync(join(dirE, 'backups'))).toBe(false);
			// The server's runtime files exist now (the abort below must take them back — C3-9).
			expect(existsSync(join(dirE, 'ts_state.json'))).toBe(true);

			// Unconfirmed / wrongly confirmed: refused, nothing touched.
			const stateBefore = readFileSync(join(runDir(dirE), 'install.state.json'), 'utf8');
			const objectsBefore = (await inspectTargetDatabase(conn)).userObjectCount;
			for (const confirm of [[], ['--confirm-database', `${db}_typo`]]) {
				const refused = runCli(dirE, ['--abort', ...confirm]);
				expect(refused.exitCode, refused.out).toBe(1);
				expect(refused.out).toContain(`confirm with --confirm-database ${db}`);
				expect(readFileSync(join(runDir(dirE), 'install.state.json'), 'utf8')).toBe(stateBefore);
				expect((await inspectTargetDatabase(conn)).userObjectCount).toBe(objectsBefore);
			}

			const aborted = runCli(dirE, ['--abort', '--confirm-database', db]);
			expect(aborted.exitCode, aborted.out).toBe(0);
			const after = await inspectTargetDatabase(conn);
			expect(after.userObjects).toEqual([]);
			expect(after.emptyForInstall).toBe(true);
			expect(after.extensions).toEqual(preexisting);
			const left = readdirSync(dirE);
			for (const name of left) {
				expect(
					name === '.env' ||
						name.startsWith('.env.') ||
						name === 'sample.env' ||
						name === 'install',
					name,
				).toBe(false);
			}
			// The runtime files the install created are gone (C3-9: a developer abort left them),
			// and so is the backup directory it made.
			expect(existsSync(join(dirE, 'ts_state.json'))).toBe(false);
			expect(existsSync(join(dirE, 'sessions.sqlite'))).toBe(false);
			expect(existsSync(unitBackups)).toBe(false);
			expect(leaked(aborted.out)).toEqual([]);

			// ── the preflight refusals, on the now-empty database ──
			const weak = privateDir('e_weak');
			const weakRun = runCli(weak, argv, { DEDALO_INSTALL_ROOT_PASSWORD: 'Kestrel-Harbor-6789' });
			expect(weakRun.exitCode).toBe(1);
			expect(weakRun.out).toContain('root password does not meet the password policy (sequence)');
			expect(readdirSync(weak)).toEqual([]);
			expect((await inspectTargetDatabase(conn)).userObjects).toEqual([]);

			const stray = await runPsql(conn, ['-c', 'CREATE TABLE stray_before_install (x int)']);
			expect(stray.exitCode, stray.stderr).toBe(0);
			const busy = privateDir('e_busy');
			const busyRun = runCli(busy, argv);
			expect(busyRun.exitCode).toBe(1);
			expect(busyRun.out).toContain(`database '${db}' is not empty (1 objects`);
			expect(readdirSync(busy)).toEqual([]);
			expect((await inspectTargetDatabase(conn)).userObjects).toEqual([
				'public.stray_before_install',
			]);

			const missing = privateDir('e_missing');
			const missingRun = runCli(missing, answersArgv(dbName('missing')));
			expect(missingRun.exitCode).toBe(1);
			expect(missingRun.out).toContain(`database '${dbName('missing')}' must exist first`);
			expect(readdirSync(missing)).toEqual([]);
		},
		600000,
	);

	test.if(available)(
		named(
			"F: the install lock, a database that is not the install's (resume + abort refuse), an orphan session, a half-activated lg re-run",
		),
		async () => {
			const db = dbName('f');
			const conn = connOf(db);
			const argv = answersArgv(db);

			// ── another session holds the server-side install lock ──
			const holder = await holdInstallLock(conn, 'dedalo_install:drill-holder');
			expect(holder, 'the drill could take the lock itself').not.toBeNull();
			const locked = privateDir('f_locked');
			try {
				const lockedRun = runCli(locked, argv);
				expect(lockedRun.exitCode).toBe(1);
				expect(lockedRun.out).toContain(`another install is running against database '${db}'`);
				expect(readdirSync(locked)).toEqual([]);
			} finally {
				await holder?.release();
			}
			expect((await inspectTargetDatabase(conn)).userObjects).toEqual([]);

			// ── killed before the seed; a backup is restored into the database ──
			const dirF = privateDir('f');
			faultedRun(dirF, argv, 'check_directories:after');
			expect(readState(dirF).steps.install_db_from_default_file?.status).toBe('pending');
			const foreign = await runPsql(conn, ['-c', 'CREATE TABLE restored_backup (x int)']);
			expect(foreign.exitCode, foreign.stderr).toBe(0);
			const resumed = runCli(dirF, ['--resume']);
			expect(resumed.exitCode).toBe(1);
			expect(resumed.out).toContain('was not seeded by this install — refusing to restore into it');
			expect((await inspectTargetDatabase(conn)).userObjects).toEqual(['public.restored_backup']);
			const refusedAbort = runCli(dirF, ['--abort', '--confirm-database', db]);
			expect(refusedAbort.exitCode).toBe(1);
			expect(refusedAbort.out).toContain('is not stamped by this install');
			expect((await inspectTargetDatabase(conn)).userObjects).toEqual(['public.restored_backup']);
			expect(existsSync(join(dirF, '.env')), 'nothing was undone').toBe(true);
			// The table goes (by its owner); the unstamped EMPTY database has nothing to reset.
			expect((await runPsql(conn, ['-c', 'DROP TABLE restored_backup'])).exitCode).toBe(0);
			const aborted = runCli(dirF, ['--abort', '--confirm-database', db]);
			expect(aborted.exitCode, aborted.out).toBe(0);
			expect(aborted.out).toContain('nothing to reset');

			// ── a half-activated lg under a seed step left running ──
			const dirLg = privateDir('f_lg');
			faultedRun(dirLg, argv, 'install_db_from_default_file:after');
			const installId = readState(dirLg).install_id;
			expect(await seedVerdict(db, dirLg, installId)).toMatchObject({ ok: true });
			const lgRow = `section_tipo = 'hierarchy1' AND lower(string->'hierarchy6'->0->>'value') = 'lg'`;
			const [whole] = await rows(
				db,
				`SELECT (relation->'hierarchy125') || (relation->'hierarchy59') FROM matrix_hierarchy_main WHERE ${lgRow}`,
			);
			expect(whole?.length ?? 0).toBeGreaterThan(10);
			// A crash after activation's first commit (hierarchy4) and before the rest.
			await rows(
				db,
				`UPDATE matrix_hierarchy_main SET relation = relation - 'hierarchy125' - 'hierarchy59' WHERE ${lgRow} RETURNING section_id`,
			);
			const statePath = join(runDir(dirLg), 'install.state.json');
			const crashed = readState(dirLg);
			(crashed.steps.install_db_from_default_file as { status: string }).status = 'running';
			await Bun.write(statePath, JSON.stringify(crashed));
			const verdict = await seedVerdict(db, dirLg, installId);
			expect(verdict.ok, JSON.stringify(verdict)).toBe(false);
			expect(String(verdict.detail)).toContain("core hierarchy 'lg' is not usable");

			// ── an orphan installer session refuses the resume ──
			const orphan = Bun.spawn(
				[
					resolvePgBinary('psql'),
					`--dbname=${db}`,
					...connArgs(conn),
					'-tAc',
					'SELECT pg_sleep(60)',
				],
				{
					env: { ...pgClientEnv(conn), PGAPPNAME: 'dedalo_install:orphan' },
					stdout: 'ignore',
					stderr: 'ignore',
				},
			);
			try {
				expect(await waitFor(async () => (await installerBackends(db)) > 0, 30000)).toBe(true);
				const blocked = runCli(dirLg, ['--resume']);
				expect(blocked.exitCode).toBe(1);
				expect(blocked.out).toContain('another installer session is still active');
			} finally {
				orphan.kill('SIGKILL');
				await orphan.exited;
			}
			expect(await waitFor(async () => (await installerBackends(db)) === 0, 60000)).toBe(true);

			// ── a seed restore orphaned on the server (campaign 3e F5: its client died
			// with its container) — ANOTHER install's is refused and left alone ──
			const foreignSeed = sleeper(conn, `${SEED_APP_NAME}:00000000-0000-4000-8000-000000000000`);
			try {
				expect(await waitFor(async () => (await seedBackends(db)) > 0, 30000)).toBe(true);
				const refusedSeed = runCli(dirLg, ['--resume']);
				expect(refusedSeed.exitCode).toBe(1);
				expect(refusedSeed.out).toContain(`a seed restore into '${db}' is still running`);
				expect(await seedBackends(db)).toBe(1);
			} finally {
				// The server ends a sleeping backend only when asked (pg_sleep never reads its client).
				await terminateSeedSleepers(db);
				foreignSeed.kill('SIGKILL');
				await foreignSeed.exited;
			}
			expect(await waitFor(async () => (await installerBackends(db)) === 0, 60000)).toBe(true);
			// ── THIS install's: the resume holds the install lock, so no live installer
			// owns it — ended (said), and the resume finishes ──
			const ownSeed = sleeper(conn, seedAppName(installId));
			expect(await waitFor(async () => (await seedBackends(db)) > 0, 30000)).toBe(true);

			const finished = runCli(dirLg, ['--resume']);
			await ownSeed.exited;
			expect(finished.out).toContain('ended the seed restore an interrupted run left on');
			expect(await seedBackends(db)).toBe(0);
			expect(finished.exitCode, finished.out).toBe(0);
			expectComplete(dirLg);
			expect(readState(dirLg).steps.install_db_from_default_file?.attempts).toBe(2);
			expect(await seedVerdict(db, dirLg, installId)).toMatchObject({ ok: true });
			const [again] = await rows(
				db,
				`SELECT (relation->'hierarchy125') || (relation->'hierarchy59') FROM matrix_hierarchy_main WHERE ${lgRow}`,
			);
			expect(again).toBe(whole);
		},
		900000,
	);
});

/**
 * The seed step's verify (db_restore.ts seedComplete) against `db`, run in a
 * CHILD whose engine pool points at it (the core-hierarchy check reads through
 * the pool; this process's points at the suite database).
 */
async function seedVerdict(
	db: string,
	dir: string,
	installId: string,
): Promise<{ ok?: boolean; detail?: string }> {
	const probe = Bun.spawnSync(
		[
			process.execPath,
			'-e',
			[
				"const { seedComplete } = await import('./src/core/install/db_restore.ts');",
				"const { connFromConfig } = await import('./src/core/install/pg_exec.ts');",
				`console.log(JSON.stringify(await seedComplete(connFromConfig(), ${JSON.stringify(installId)})));`,
				'process.exit(0);',
			].join('\n'),
		],
		{ cwd: ROOT, env: { ...childEnv(dir), DB_NAME: db }, stdout: 'pipe', stderr: 'pipe' },
	);
	const lines = probe.stdout.toString().trim().split('\n');
	try {
		return JSON.parse(lines[lines.length - 1] ?? '') as { ok?: boolean; detail?: string };
	} catch {
		return { detail: `probe failed: ${probe.stdout.toString()} ${probe.stderr.toString()}` };
	}
}

// ── polling the server ───────────────────────────────────────────────────────

/** Poll `probe` every 25 ms until it holds or `timeoutMs` passes. */
async function waitFor(probe: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await probe()) return true;
		await Bun.sleep(25);
	}
	return false;
}

async function backendCount(db: string, filter: string): Promise<number> {
	const res = await runPsql(admin, [
		'-tAc',
		`SELECT count(*) FROM pg_stat_activity WHERE datname = '${db}' AND ${filter}`,
	]);
	return res.exitCode === 0 ? Number(res.stdout.trim()) : 0;
}

const seedBackends = (db: string): Promise<number> =>
	backendCount(db, "application_name LIKE 'dedalo\\_install\\_seed%'");

/** End every seed-named backend on `db` (the terminate in the SELECT list of the filtered rows). */
async function terminateSeedSleepers(db: string): Promise<void> {
	await runPsql(admin, [
		'-tAc',
		`SELECT pg_terminate_backend(pid, 5000) FROM (SELECT pid FROM pg_stat_activity WHERE datname = '${db}' AND application_name LIKE 'dedalo\\_install\\_seed%' OFFSET 0) AS seeds`,
	]);
}

/** A psql session named `appName` sleeping on `conn` (a stand-in for an orphaned backend). */
function sleeper(conn: DbConnDescriptor, appName: string) {
	return Bun.spawn(
		[
			resolvePgBinary('psql'),
			`--dbname=${conn.database}`,
			...connArgs(conn),
			'-tAc',
			'SELECT pg_sleep(120)',
		],
		{ env: { ...pgClientEnv(conn), PGAPPNAME: appName }, stdout: 'ignore', stderr: 'ignore' },
	);
}
const installerBackends = (db: string): Promise<number> =>
	backendCount(db, "application_name LIKE 'dedalo_install%'");
