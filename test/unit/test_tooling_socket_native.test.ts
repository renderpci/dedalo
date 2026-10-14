/**
 * THE DEVELOPER ROUTE'S TEST TOOLING AND DEV SERVER, as install campaign 3 found
 * them on fresh Ubuntu 26.04 / RHEL 10 machines (package P4). Each case is an
 * OUTCOME — the options a connection is built with, the argv and environment a
 * psql runs with, what a real psql does against a server that asks for a
 * password, the database a failed vector build leaves, the temp dir a run
 * leaves — never a source spelling.
 *
 *  A. C3-12 — the suite reaches PostgreSQL the way the installed .env says:
 *     DB_SOCKET wins over DB_HOST in the preload's existence probe and in the
 *     vector helper (both used to read DB_HOST only: "the test database does
 *     not exist" about one that existed, then 28P01 over TCP).
 *  B. C3-12 — no pg client the suite or the engine starts can prompt: `-w` and
 *     PGCONNECT_TIMEOUT on every argv/env builder, and a REAL psql against a
 *     fake server that demands a password exits by itself (a run once sat ten
 *     minutes at `Password for user dedalo:`).
 *  C. C3-32 — a server without pgvector is refused BEFORE CREATE DATABASE; a
 *     build that fails in the schema had already written its marker and drops
 *     its own database (an unmarked leftover refused its own re-run).
 *  D. C3-31 — the dev TCP listener binds 127.0.0.1 unless SERVER_TCP_HOST says
 *     otherwise (it bound every address, with debug errors on).
 *  E. C3-60 — the unconfigured-media line names no nginx reload on a dev server.
 *  F. C3-65 — the per-run session scratch dir is gone when the process exits.
 *
 * Writes: one scratch vector database (C), dropped by the code under test and
 * again in afterAll; temp dirs under its own TMPDIR, removed.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SQL } from 'bun';
import { TEST_RAG_MARKER_TABLE } from '../../src/ai/rag/test_rag_db.ts';
import { SERVER_KEYS } from '../../src/config/catalog/server.ts';
import { devTcpListener } from '../../src/config/tcp_listener.ts';
import { resolvePgBinary } from '../../src/core/install/pg_bin.ts';
import {
	connArgs,
	PG_CONNECT_TIMEOUT_SECONDS,
	pgClientEnv,
} from '../../src/core/install/pg_exec.ts';
import { unconfiguredMediaProtectionNotice } from '../../src/core/media/unconfigured_notice.ts';
import { DB_READY } from '../helpers/db_ready.ts';
import { suitePsqlConnArgs, suitePsqlEnv } from '../helpers/suite_pg.ts';
import { ensureSuiteRagDatabase, ragConnectionOptions } from '../helpers/test_rag_database.ts';
import { connectionTarget } from '../preload/test_database.ts';

const ROOT = resolve(import.meta.dir, '../..');
const scratch = mkdtempSync(join(tmpdir(), 'dedalo_tooling_gate_'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** A fake environment: only these keys exist. */
const envOf =
	(values: Record<string, string>) =>
	(key: string): string | undefined =>
		values[key];

/** The installer's .env on a socket-only developer install (C3R5/C3R6). */
const SOCKET_INSTALL = { DB_HOST: 'localhost', DB_PORT: '5432', DB_SOCKET: '/var/run/postgresql' };

describe('A. C3-12: the suite connects over DB_SOCKET when the .env names one', () => {
	test('the preload existence probe dials the socket file, not localhost', () => {
		const target = connectionTarget(envOf(SOCKET_INSTALL));
		expect(target).toMatchObject({ path: '/var/run/postgresql/.s.PGSQL.5432' });
		// Without a socket it is TCP, as before.
		expect(connectionTarget(envOf({ DB_HOST: 'db', DB_PORT: '5433' }))).toEqual({
			hostname: 'db',
			port: 5433,
		});
	});

	test('the vector helper inherits the main socket; its own keys still win', () => {
		expect(ragConnectionOptions('x_rag', envOf(SOCKET_INSTALL))).toMatchObject({
			database: 'x_rag',
			path: '/var/run/postgresql/.s.PGSQL.5432',
		});
		expect(
			ragConnectionOptions(
				'x_rag',
				envOf({
					...SOCKET_INSTALL,
					DEDALO_RAG_DB_SOCKET_CONN: '/tmp',
					DEDALO_RAG_DB_PORT_CONN: '5440',
				}),
			),
		).toMatchObject({ path: '/tmp/.s.PGSQL.5440' });
		const tcp = ragConnectionOptions(
			'x_rag',
			envOf({ ...SOCKET_INSTALL, DEDALO_RAG_DB_HOSTNAME_CONN: 'vectors' }),
		);
		expect(tcp).toMatchObject({ hostname: 'vectors', port: 5432 });
		expect('path' in tcp).toBe(false);
	});

	test('a peer install (empty DB_PASSWORD) sends no password at all', () => {
		expect(
			ragConnectionOptions('x_rag', envOf({ ...SOCKET_INSTALL, DB_PASSWORD: '' })).password,
		).toBe(undefined);
	});
});

/** A fake PostgreSQL server that answers any startup message with "send a cleartext password". */
function passwordDemandingServer(): { port: number; stop: () => void } {
	const listener = Bun.listen({
		hostname: '127.0.0.1',
		port: 0,
		socket: {
			data(socket) {
				// AuthenticationCleartextPassword: 'R', int32 length 8, int32 code 3.
				socket.write(new Uint8Array([0x52, 0, 0, 0, 8, 0, 0, 0, 3]));
			},
		},
	});
	return { port: listener.port, stop: () => listener.stop(true) };
}

/** Run argv; kill it after `ms`. Returns whether it ended by itself, and its stderr. */
async function runBounded(argv: string[], env: Record<string, string | undefined>, ms: number) {
	const child = Bun.spawn(argv, { env, stdin: 'ignore', stdout: 'ignore', stderr: 'pipe' });
	let killed = false;
	const timer = setTimeout(() => {
		killed = true;
		child.kill('SIGKILL');
	}, ms);
	const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
	clearTimeout(timer);
	return { endedByItself: !killed, code, stderr };
}

let psqlBinary: string | null = null;
try {
	psqlBinary = resolvePgBinary('psql');
} catch {
	console.warn('[test_tooling_socket] no psql on this machine — the real-psql case is SKIPPED');
}

describe('B. C3-12: no pg client prompts for a password', () => {
	test('every argv builder carries -w and every env builder a connect timeout', () => {
		const engine = connArgs({
			database: 'd',
			host: 'localhost',
			port: 5432,
			user: 'u',
			password: '',
		});
		expect(engine).toContain('-w');
		const engineEnv = pgClientEnv({
			database: 'd',
			host: 'h',
			port: 5432,
			user: 'u',
			password: '',
		});
		expect(engineEnv.PGCONNECT_TIMEOUT).toBe(
			process.env.PGCONNECT_TIMEOUT ?? PG_CONNECT_TIMEOUT_SECONDS,
		);
		expect('PGPASSWORD' in engineEnv && engineEnv.PGPASSWORD === '').toBe(false);

		const suite = suitePsqlConnArgs(envOf(SOCKET_INSTALL), 'dedalo');
		expect(suite).toEqual(['-h', '/var/run/postgresql', '-p', '5432', '-U', 'dedalo', '-w']);
		const suiteEnv = suitePsqlEnv({}, '');
		expect(suiteEnv.PGCONNECT_TIMEOUT).toBe('10');
		expect('PGPASSWORD' in suiteEnv).toBe(false);
		expect(suitePsqlEnv({ PGCONNECT_TIMEOUT: '3' }, 'p')).toMatchObject({
			PGCONNECT_TIMEOUT: '3',
			PGPASSWORD: 'p',
		});
	});

	test.if(psqlBinary !== null)(
		'a REAL psql against a server that demands a password ends by itself, saying so',
		async () => {
			const server = passwordDemandingServer();
			try {
				const conn = {
					database: 'postgres',
					host: '127.0.0.1',
					port: server.port,
					user: 'nobody',
					password: '',
				};
				const { PGPASSWORD: _drop, ...clientEnv } = pgClientEnv(conn);
				// The fake speaks no TLS/GSS negotiation: go straight to the startup message.
				const env = { ...clientEnv, PGSSLMODE: 'disable', PGGSSENCMODE: 'disable' };
				const run = await runBounded(
					[psqlBinary as string, '--dbname=postgres', ...connArgs(conn), '-tAc', 'SELECT 1'],
					env,
					8000,
				);
				expect(run.endedByItself).toBe(true);
				expect(run.code).not.toBe(0);
				expect(run.stderr).toMatch(/no password supplied/);
				// Without -w psql PROMPTS (on a terminal it then waits for ever; with no
				// terminal it prints the prompt and gives up — measured, psql 18).
				expect(run.stderr).not.toContain('Password for user');
			} finally {
				server.stop();
			}
		},
		15_000,
	);
});

describe('C. C3-32: a vector build never leaves an unmarked database', () => {
	const GATE_DB = `zz_tooling_rag_gate_${process.pid}`;
	const adminOptions = () => ({
		...ragConnectionOptions('postgres', (key) => process.env[key]),
		max: 1,
	});
	afterAll(async () => {
		if (!DB_READY) return;
		const admin = new SQL(adminOptions());
		try {
			await admin.unsafe(`DROP DATABASE IF EXISTS "${GATE_DB}" WITH (FORCE)`);
		} finally {
			await admin.end();
		}
	});

	/** A SQL class whose instances answer "no pgvector" and record every statement. */
	function noVectorSql(statements: string[]): typeof SQL {
		function FakeSQL() {
			const tag = (strings: TemplateStringsArray) => {
				statements.push(strings.join('?'));
				return Promise.resolve([]);
			};
			return Object.assign(tag, {
				unsafe: (query: string) => {
					statements.push(query);
					return Promise.resolve([]);
				},
				end: () => Promise.resolve(),
			});
		}
		return FakeSQL as unknown as typeof SQL;
	}

	test('no pgvector: refused naming pgvector, before any CREATE or DROP', async () => {
		const statements: string[] = [];
		const error = await ensureSuiteRagDatabase({
			database: GATE_DB,
			mode: 'rebuild',
			SQL: noVectorSql(statements),
		}).then(
			() => null,
			(caught: unknown) => caught as Error,
		);
		expect(error?.message).toContain('pgvector');
		expect(error?.message).toContain('Nothing was created');
		expect(statements.some((statement) => statement.includes('pg_available_extensions'))).toBe(
			true,
		);
		expect(statements.some((statement) => /CREATE DATABASE|DROP DATABASE/.test(statement))).toBe(
			false,
		);
	});

	test.if(DB_READY)(
		'a schema failure: the marker was already there, and the database is dropped',
		async () => {
			const seen: { markerAtSchema: boolean | null } = { markerAtSchema: null };
			const RealSQL = SQL;
			// Real connections; the vector schema statement fails AFTER peeking at the marker.
			function SchemaFailingSQL(options: ConstructorParameters<typeof SQL>[0]) {
				const real = new RealSQL(options);
				return new Proxy(real, {
					get(target, property, receiver) {
						if (property !== 'unsafe') return Reflect.get(target, property, receiver);
						return async (query: string, ...rest: unknown[]) => {
							if (query.includes('rag_embeddings') && query.length > 500) {
								const rows = await target.unsafe(
									`SELECT to_regclass('public.${TEST_RAG_MARKER_TABLE}') IS NOT NULL AS present`,
								);
								seen.markerAtSchema = (rows as { present: boolean }[])[0]?.present === true;
								throw new Error('planted schema failure');
							}
							return (target.unsafe as (...args: unknown[]) => unknown)(query, ...rest);
						};
					},
				});
			}
			const error = await ensureSuiteRagDatabase({
				database: GATE_DB,
				mode: 'rebuild',
				SQL: SchemaFailingSQL as unknown as typeof SQL,
			}).then(
				() => null,
				(caught: unknown) => caught as Error,
			);
			expect(error?.message).toBe('planted schema failure');
			expect(seen.markerAtSchema).toBe(true);
			const admin = new SQL(adminOptions());
			try {
				const left = await admin`SELECT 1 FROM pg_database WHERE datname = ${GATE_DB}`;
				expect(left.length).toBe(0);
			} finally {
				await admin.end();
			}
		},
		60_000,
	);
});

describe('D. C3-31: the dev listener binds this machine only, unless told otherwise', () => {
	test('the catalog default is 127.0.0.1, and an empty value is that default', () => {
		expect(SERVER_KEYS.SERVER_TCP_HOST.default).toBe('127.0.0.1');
		expect(devTcpListener('3600', '')).toMatchObject({
			hostname: '127.0.0.1',
			port: 3600,
			url: 'http://localhost:3600/dedalo/core/page/',
			networkReachable: false,
		});
	});

	test('no SERVER_TCP_PORT: no listener (production is socket-only)', () => {
		expect(devTcpListener('', '0.0.0.0')).toBeNull();
		expect(devTcpListener('  ', '0.0.0.0')).toBeNull();
	});

	test('an operator address is used and flagged as reachable from the network', () => {
		expect(devTcpListener('3600', '0.0.0.0')).toMatchObject({
			hostname: '0.0.0.0',
			networkReachable: true,
		});
	});

	test('a server started with the default options is bound to loopback only', () => {
		const options = devTcpListener('0', '') as NonNullable<ReturnType<typeof devTcpListener>>;
		const server = Bun.serve({
			hostname: options.hostname,
			port: 0,
			fetch: () => new Response('ok'),
		});
		try {
			expect(server.hostname).toBe('127.0.0.1');
		} finally {
			server.stop(true);
		}
	});
});

describe('E. C3-60: the media line is worded for the server that prints it', () => {
	test('a dev server is not told to reload nginx; a proxied one is', () => {
		const dev = unconfiguredMediaProtectionNotice('publication', true);
		expect(dev).not.toMatch(/nginx|reload/i);
		expect(dev).toContain('DEDALO_MEDIA_ACCESS_MODE');
		expect(unconfiguredMediaProtectionNotice('publication', false)).toContain(
			'NGINX NEEDS A RELOAD',
		);
	});
});

describe('F. C3-65: a test run leaves no session scratch dir behind', () => {
	test('the preload creates it for the run and removes it at exit', () => {
		const own = mkdtempSync(join(scratch, 'tmp_'));
		const run = Bun.spawnSync(
			[
				process.execPath,
				'-e',
				"await import('./test/preload/session_db.ts'); const { existsSync } = await import('node:fs'); const { dirname } = await import('node:path'); const dir = dirname(process.env.DEDALO_SESSION_DB_PATH); console.log(JSON.stringify({ dir, during: existsSync(dir) }));",
			],
			{
				cwd: ROOT,
				env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', TMPDIR: own },
			},
		);
		const lines = new TextDecoder().decode(run.stdout).trim().split('\n');
		const report = JSON.parse(lines.at(-1) ?? '{}') as { dir?: string; during?: boolean };
		// It was made for the run, under this TMPDIR (anti-vacuity) ...
		expect(report.during).toBe(true);
		expect(String(report.dir).startsWith(own)).toBe(true);
		// ... and is gone once the process has exited.
		expect(existsSync(String(report.dir))).toBe(false);
	});
});
