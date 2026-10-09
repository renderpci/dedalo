/**
 * THE MAIN-DATABASE TRANSPORT — one rule, every connection (src/config/pg_transport.ts).
 *
 * THE DEFECT (2026-10-09). The installers took a PostgreSQL unix-socket answer
 * (`--db-socket`, the wizard's socket field), the install probe connected THROUGH
 * it, and install_plan.ts wrote it as DEDALO_SOCKET_CONN — a key the engine read
 * nowhere. An install reachable only over the socket passed its probe and then
 * booted an engine that connected to DB_HOST. DB_SOCKET is now the canonical key
 * (DEDALO_SOCKET_CONN its PHP_KEY_ALIASES fallback), and the pool, the probe and
 * every spawned psql/pg_dump take their route from ONE resolver.
 *
 * Legs:
 *   A. the resolver's decision table (socket vs host, file form, port, refusal);
 *   B. the installer writes DB_SOCKET, never the alias — and the CLI boot env
 *      carries it, so the CLI's own pool takes the same route;
 *   C. OUTCOMES over the suite PostgreSQL's real unix socket, with DB_HOST set to a
 *      name that resolves nowhere: the install probe connects, a separate engine
 *      process connects (over the socket — inet_server_addr() is NULL) to the
 *      SAME server, a legacy DEDALO_SOCKET_CONN-only .env does too, and a socket
 *      that does not exist FAILS in both — never a silent fallback to TCP
 *      localhost (Bun.sql's own behaviour for a missing `path`, measured).
 *
 * No DB writes: every statement is a SELECT. Scratch namespace: zzpgt.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { PHP_KEY_ALIASES, privateDir } from '../../src/config/env.ts';
import { V6_MIGRATION } from '../../src/config/migration_map.ts';
import {
	bunSqlTransportOptions,
	libpqTransportArgs,
	pgSocketProblem,
	resolvePgTransport,
} from '../../src/config/pg_transport.ts';
import { testDbConnection } from '../../src/core/install/db_probe.ts';
import { pgConnFromOptions } from '../../src/core/install/db_probe_plan.ts';
import { buildInstallPlan, cliBootEnv } from '../../src/core/install/install_plan.ts';
import { connArgs, runPsql } from '../../src/core/install/pg_exec.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
/** A host name that resolves nowhere (RFC 6761 `.invalid`). */
const NOWHERE = 'zzpgt-no-such-host.invalid';

describe('A. resolvePgTransport — the decision table', () => {
	test('a socket WINS over the host; the file is <dir>/.s.PGSQL.<port>', () => {
		expect(
			resolvePgTransport({ host: 'db.example.org', port: '5433', socket: '/var/run/postgresql' }),
		).toEqual({
			kind: 'socket',
			directory: '/var/run/postgresql',
			socketPath: '/var/run/postgresql/.s.PGSQL.5433',
			port: 5433,
		});
	});

	test('no socket: a TCP host, an empty host is localhost, an unusable port is 5432', () => {
		expect(resolvePgTransport({ host: 'db.example.org', port: 6000, socket: '' })).toEqual({
			kind: 'tcp',
			hostname: 'db.example.org',
			port: 6000,
		});
		expect(resolvePgTransport({ host: '', port: 'abc' })).toEqual({
			kind: 'tcp',
			hostname: 'localhost',
			port: 5432,
		});
	});

	test('a `/` host is a socket directory (libpq rule), trailing slash trimmed', () => {
		expect(resolvePgTransport({ host: '/tmp/', port: 5432 })).toMatchObject({
			kind: 'socket',
			directory: '/tmp',
			socketPath: '/tmp/.s.PGSQL.5432',
		});
	});

	test('a socket FILE path: its directory, and the port its name carries', () => {
		expect(resolvePgTransport({ host: 'x', port: 5432, socket: '/run/pg/.s.PGSQL.6543' })).toEqual({
			kind: 'socket',
			directory: '/run/pg',
			socketPath: '/run/pg/.s.PGSQL.6543',
			port: 6543,
		});
		expect(resolvePgTransport({ host: 'x', port: 1, socket: '/.s.PGSQL.7000' })).toEqual({
			kind: 'socket',
			directory: '/',
			socketPath: '/.s.PGSQL.7000',
			port: 7000,
		});
	});

	test('Bun options: socket sets path AND hostname to the file (no TCP fallback); libpq gets the dir', () => {
		const socket = resolvePgTransport({ host: 'localhost', port: 5432, socket: '/tmp' });
		expect(bunSqlTransportOptions(socket)).toEqual({
			path: '/tmp/.s.PGSQL.5432',
			hostname: '/tmp/.s.PGSQL.5432',
			port: 5432,
		});
		expect(libpqTransportArgs(socket)).toEqual(['-h', '/tmp', '-p', '5432']);
		const tcp = resolvePgTransport({ host: 'db', port: 5432 });
		expect(bunSqlTransportOptions(tcp)).toEqual({ hostname: 'db', port: 5432 });
		expect(libpqTransportArgs(tcp)).toEqual(['-h', 'db', '-p', '5432']);
	});

	test('a relative socket is refused (libpq would read it as a TCP host)', () => {
		expect(pgSocketProblem('var/run/postgresql')).toContain('not an absolute path');
		expect(pgSocketProblem('')).toBeNull();
		expect(pgSocketProblem(undefined)).toBeNull();
		expect(pgSocketProblem('/tmp')).toBeNull();
		expect(() => connArgs({ ...pgConnFromOptions({ db_socket: 'tmp' }) })).toThrow(
			'not an absolute path',
		);
	});

	test("the probe's psql argv goes to the socket even when a host is given", () => {
		const args = connArgs(
			pgConnFromOptions({
				db_hostname: NOWHERE,
				db_port: 5433,
				db_socket: '/tmp',
				db_username: 'u',
			}),
		);
		expect(args).toEqual(['-h', '/tmp', '-p', '5433', '-U', 'u']);
	});
});

describe('B. the installer writes the key the engine reads', () => {
	const answers = { db_database: 'zzpgt_db', db_username: 'u', entity: 'e', db_socket: '/run/pg' };

	test('the plan writes DB_SOCKET, never DEDALO_SOCKET_CONN (now an alias)', () => {
		expect(PHP_KEY_ALIASES.DB_SOCKET).toBe('DEDALO_SOCKET_CONN');
		const plan = buildInstallPlan(answers, { salt: 's' });
		// Floor: the plan really produced its key list (an empty plan has no errors either).
		expect(plan.envKeys.length).toBeGreaterThan(5);
		expect(plan.errors).toEqual([]);
		expect(plan.envKeys).toContain('DB_SOCKET');
		expect(plan.envKeys).not.toContain('DEDALO_SOCKET_CONN');
		const written = plan.env.flatMap((s) => s.entries).find((e) => e.key === 'DB_SOCKET');
		expect(written?.value).toBe('/run/pg');
	});

	test("the CLI's boot env carries the socket, so the CLI's own pool takes the same route", () => {
		expect(cliBootEnv(buildInstallPlan(answers, { salt: 's' })).DB_SOCKET).toBe('/run/pg');
	});

	test('a relative socket answer is a plan error (it would refuse the boot)', () => {
		const plan = buildInstallPlan({ ...answers, db_socket: 'run/pg' }, { salt: 's' });
		expect(plan.errors.some((e) => e.startsWith('db_socket:'))).toBe(true);
	});

	test('the v6 migration carries DEDALO_SOCKET_CONN to DB_SOCKET (no longer DROPPED)', () => {
		expect(V6_MIGRATION.DEDALO_SOCKET_CONN).toEqual({ cls: 'ALIAS', target: 'DB_SOCKET' });
	});
});

/** The suite PostgreSQL's socket directory, or null when the suite reaches it over TCP. */
function suiteSocketDirectory(): string | null {
	const transport = resolvePgTransport(config.db);
	return transport.kind === 'socket' && existsSync(transport.socketPath)
		? transport.directory
		: null;
}

const SOCKET_DIR = suiteSocketDirectory();
const scratch = mkdtempSync(join(tmpdir(), 'zzpgt_'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Server identity: which postmaster answered, over which route. */
const IDENTITY_SQL =
	"SELECT current_database() || '|' || pg_postmaster_start_time()::text || '|' || coalesce(inet_server_addr()::text, 'unix')";

/**
 * Run `IDENTITY_SQL` in a SEPARATE engine process (config frozen at its import,
 * the real pool from src/core/db/postgres.ts). `env` overrides the inherited
 * environment; a value of `undefined` removes the key.
 */
async function engineIdentity(
	env: Record<string, string | undefined>,
): Promise<{ exitCode: number; out: string; err: string }> {
	const code = [
		`const { sql } = await import(${JSON.stringify(join(REPO_ROOT, 'src/core/db/postgres.ts'))});`,
		`const rows = await sql.unsafe(${JSON.stringify(IDENTITY_SQL)}, []);`,
		'console.log(`IDENTITY=${Object.values(rows[0])[0]}`);',
		'process.exit(0);',
	].join('\n');
	const merged: Record<string, string> = {};
	for (const [key, value] of Object.entries({ ...process.env, ...env })) {
		if (value !== undefined) merged[key] = value;
	}
	const child = Bun.spawn([process.execPath, '-e', code], {
		cwd: REPO_ROOT,
		env: merged,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const timer = setTimeout(() => child.kill(), 20_000);
	const [exitCode, out, err] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	clearTimeout(timer);
	const line = out.split('\n').find((l) => l.startsWith('IDENTITY='));
	return { exitCode, out: line?.slice('IDENTITY='.length) ?? '', err };
}

/** The install answers the wizard would post, pointing at the suite DB through the socket. */
function socketAnswers(socket: string): Record<string, unknown> {
	return {
		db_database: config.db.database,
		db_username: config.db.user,
		db_password: config.db.password,
		db_port: config.db.port,
		db_hostname: NOWHERE,
		db_socket: socket,
	};
}

/** A private dir whose .env is the installation's minus every transport line, plus `extra`. */
function scratchPrivateDir(name: string, extra: string): string {
	const dir = join(scratch, name);
	const source = join(privateDir, '.env');
	const dropped = ['DB_SOCKET', 'DEDALO_SOCKET_CONN', 'DB_HOST', 'DEDALO_HOSTNAME_CONN'];
	// Original lines verbatim (parseEnvFile does not unescape, so re-quoting JSON would corrupt it).
	const kept = existsSync(source)
		? readFileSync(source, 'utf8')
				.split('\n')
				.filter((line) => !dropped.includes(line.split('=')[0]?.trim() ?? ''))
		: [];
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, '.env'), `${kept.join('\n')}\n${extra}\n`, { mode: 0o600 });
	return dir;
}

const socketTest = SOCKET_DIR === null ? test.skip : test;
const SKIP_REASON =
	SOCKET_DIR === null
		? ' [SKIPPED: the suite PostgreSQL is reached over TCP here — no local unix socket to connect through]'
		: '';

describe('C. probe and engine take ONE route (real suite socket)', () => {
	test('a relative DB_SOCKET refuses the engine at pool build — nothing is contacted', async () => {
		const engine = await engineIdentity({
			DB_SOCKET: 'zzpgt/relative',
			DEDALO_SOCKET_CONN: undefined,
		});
		expect(engine.exitCode).not.toBe(0);
		expect(engine.err).toContain("Config key 'DB_SOCKET'");
		expect(engine.out).toBe('');
	}, 30_000);

	socketTest(
		`the install probe and a separate engine process reach the SAME server over the socket, DB_HOST unresolvable${SKIP_REASON}`,
		async () => {
			const dir = SOCKET_DIR as string;
			const probe = await testDbConnection(socketAnswers(dir));
			expect(probe, probe.msg).toMatchObject({ ok: true, can_connect: true, db_exists: true });

			const viaProbe = await runPsql(pgConnFromOptions(socketAnswers(dir)), [
				'-tAc',
				IDENTITY_SQL,
				'-v',
				'ON_ERROR_STOP=1',
			]);
			expect(viaProbe.exitCode, viaProbe.stderr).toBe(0);

			const engine = await engineIdentity({
				DB_HOST: NOWHERE,
				DEDALO_HOSTNAME_CONN: undefined,
				DB_SOCKET: dir,
			});
			expect(engine.exitCode, engine.err).toBe(0);
			expect(engine.out.endsWith('|unix')).toBe(true);
			expect(engine.out).toBe(viaProbe.stdout);
		},
		30_000,
	);

	socketTest(
		`a legacy .env holding only DEDALO_SOCKET_CONN is read as DB_SOCKET${SKIP_REASON}`,
		async () => {
			const dir = SOCKET_DIR as string;
			const legacy = scratchPrivateDir(
				'legacy',
				`DB_HOST=${NOWHERE}\nDEDALO_SOCKET_CONN=${JSON.stringify(dir)}`,
			);
			const engine = await engineIdentity({
				DEDALO_PRIVATE_DIR: legacy,
				DB_HOST: undefined,
				DEDALO_HOSTNAME_CONN: undefined,
				DB_SOCKET: undefined,
				DEDALO_SOCKET_CONN: undefined,
			});
			expect(engine.exitCode, engine.err).toBe(0);
			expect(engine.out).toBe(`${config.db.database}|${engine.out.split('|')[1]}|unix`);
		},
		30_000,
	);

	socketTest(
		`a socket that does not exist FAILS in the probe and the engine — no fallback to TCP localhost${SKIP_REASON}`,
		async () => {
			const missing = join(scratch, 'no_socket_here');
			const answers = { ...socketAnswers(missing), db_hostname: 'localhost' };
			const probe = await testDbConnection(answers);
			expect(probe.can_connect).toBe(false);
			const engine = await engineIdentity({
				DB_HOST: 'localhost',
				DEDALO_HOSTNAME_CONN: undefined,
				DB_SOCKET: missing,
			});
			expect(engine.exitCode).not.toBe(0);
			expect(engine.out).toBe('');
		},
		30_000,
	);
});
