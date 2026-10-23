/**
 * THE DATABASE RESET vs OTHER SESSIONS (`--abort` / a reinstall —
 * src/core/install/db_restore.ts resetDatabaseToEmpty).
 *
 * FOUND BY GATE-1 (2026-10-24, install_resume_drill leg E): the reset's one
 * transaction died with `deadlock detected` on `DROP EXTENSION pg_trgm
 * CASCADE` — another backend on the target held a lock the reset needed while
 * waiting for one the reset held. An operator hits the same on any `--abort`
 * while something else (a leftover engine backend, a psql, a dashboard) is
 * connected to the database; a session merely IDLE IN A TRANSACTION over one
 * of its tables makes the reset wait forever. Fixed structurally: before every
 * attempt the reset ENDS the other sessions on the TARGET database (never
 * another database, never the session holding the install lock — the caller's
 * own) and waits until they are gone; a deadlock victim (SQLSTATE 40P01) or a
 * lock timeout (55P03) — the transaction rolled back — is run again, a bounded
 * number of times, then fails loudly.
 *
 * Legs, each on its own scratch database this gate CREATES (stamped like a
 * seeded install, with pg_trgm and a trigram index like the seed) and DROPS:
 *  1. a session holding a conflicting lock on the target is ended and the reset
 *     completes (red before the fix: the reset blocks); the install-lock
 *     session on the target and a session on ANOTHER database survive;
 *  2. a deadlock victim (40P01 raised by the server inside the reset's own
 *     transaction, attempt 1) is rolled back and run again → reset;
 *  3. a persistent 40P01 fails loudly after RESET_ATTEMPTS, the database
 *     untouched (every attempt rolled back);
 *  4. a NON-retryable error fails at once (one attempt).
 *
 * Never the app or the suite database: every target is a `<prefix><pid>_<leg>`
 * scratch database, swept on entry (test/helpers/scratch_database.ts) and
 * dropped WITH (FORCE). Skips (named) when the role cannot CREATE DATABASE.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { isDedaloError } from '../../src/core/errors/index.ts';
import {
	holdInstallLock,
	inspectTargetDatabase,
	installStampOf,
	RESET_ATTEMPTS,
	resetDatabaseToEmpty,
} from '../../src/core/install/db_restore.ts';
import { resolvePgBinary } from '../../src/core/install/pg_bin.ts';
import {
	connArgs,
	type DbConnDescriptor,
	pgClientEnv,
	runPsql,
} from '../../src/core/install/pg_exec.ts';
import { sweepOrphanScratchDatabases } from '../helpers/scratch_database.ts';

const PREFIX = 'dedalo_install_reset_';
const dbName = (leg: string): string => `${PREFIX}${process.pid}_${leg}`;
const LEGS = ['lock', 'other', 'retry', 'persist', 'fatal'] as const;
const INSTALL_ID = '6d1c5a3e-0b7f-4c2a-9e41-2f8d7c6b5a40';

const admin: DbConnDescriptor = {
	database: 'postgres',
	host: config.db.host,
	port: config.db.port,
	user: config.db.user,
	password: config.db.password,
	socket: config.db.socket,
};
const connOf = (database: string): DbConnDescriptor => ({ ...admin, database });

async function adminCanCreateDatabase(): Promise<boolean> {
	const probe = await runPsql(admin, [
		'-tAc',
		'SELECT rolcreatedb OR rolsuper FROM pg_roles WHERE rolname = current_user',
	]);
	return probe.exitCode === 0 && probe.stdout.trim() === 't';
}
const available = await adminCanCreateDatabase();
const named = (what: string): string =>
	available ? what : `${what} — SKIPPED: the admin role cannot CREATE DATABASE`;

/** What the seed leaves that the reset must take back: pg_trgm + a trigram index, tables, a function, the stamp. */
const SEEDED_SQL = `CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE matrix_like (id serial PRIMARY KEY, term text);
CREATE INDEX matrix_like_term_trgm ON matrix_like USING gin (term gin_trgm_ops);
CREATE TABLE other_table (id int);
CREATE FUNCTION seeded_fn() RETURNS int LANGUAGE sql AS 'SELECT 1';
INSERT INTO matrix_like (term) VALUES ('alpha'), ('beta');
DO $s$ BEGIN EXECUTE format('COMMENT ON DATABASE %I IS %L', current_database(), 'dedalo_install_id:${INSTALL_ID}'); END $s$;`;

async function psqlOk(conn: DbConnDescriptor, sql: string): Promise<string> {
	const run = await runPsql(conn, ['-X', '-v', 'ON_ERROR_STOP=1', '-tA', '-f', '-'], {
		stdin: sql,
	});
	expect(run.exitCode, `${conn.database}: ${run.stderr}`).toBe(0);
	return run.stdout;
}

async function seededDatabase(leg: string): Promise<DbConnDescriptor> {
	const conn = connOf(dbName(leg));
	await psqlOk(conn, SEEDED_SQL);
	expect(await installStampOf(conn)).toBe(INSTALL_ID);
	expect((await inspectTargetDatabase(conn)).userObjectCount).toBeGreaterThan(3);
	return conn;
}

/** A long-lived psql session: runs `sql`, answers its backend pid, keeps the session (and its transaction) open. */
async function openSession(
	conn: DbConnDescriptor,
	sql: string,
): Promise<{ pid: number; close: () => Promise<void> }> {
	const child = Bun.spawn(
		[resolvePgBinary('psql'), `--dbname=${conn.database}`, ...connArgs(conn), '-XtAq'],
		{ stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', env: pgClientEnv(conn) },
	);
	child.stdin.write(`${sql}\nSELECT 'pid:' || pg_backend_pid();\n`);
	await child.stdin.flush();
	const reader = child.stdout.getReader();
	let out = '';
	while (!/pid:\d+\n/.test(out)) {
		const chunk = await reader.read();
		if (chunk.done) break;
		out += new TextDecoder().decode(chunk.value);
	}
	reader.releaseLock();
	const pid = Number(/pid:(\d+)/.exec(out)?.[1] ?? '0');
	expect(pid, `session on ${conn.database} did not start: ${out}`).toBeGreaterThan(0);
	return {
		pid,
		// psql idles on its stdin: a server-ended session is noticed only at EOF.
		close: async () => {
			try {
				await child.stdin.end();
			} catch {
				// already gone (terminated by the server)
			}
			await child.exited;
		},
	};
}

async function backendAlive(pid: number): Promise<boolean> {
	return (
		(await psqlOk(admin, `SELECT count(*) FROM pg_stat_activity WHERE pid = ${pid}`)).trim() === '1'
	);
}

/** The reset's script with a server-raised error just before COMMIT (the transaction then rolls back). */
const raising =
	(sqlstate: string) =>
	(script: string): string =>
		script.replace(
			/COMMIT;\s*$/,
			`DO $inject$ BEGIN RAISE EXCEPTION 'injected by the gate' USING ERRCODE = '${sqlstate}'; END $inject$;\nCOMMIT;`,
		);

beforeAll(async () => {
	if (!available) return;
	await sweepOrphanScratchDatabases(admin, PREFIX, { derivedSuffix: /^_[a-z]+$/ });
	for (const leg of LEGS) {
		await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${dbName(leg)}" WITH (FORCE)`]);
		const created = await runPsql(admin, ['-c', `CREATE DATABASE "${dbName(leg)}"`]);
		expect(created.exitCode, created.stderr).toBe(0);
	}
});

afterAll(async () => {
	if (!available) return;
	for (const leg of LEGS) {
		await runPsql(admin, ['-c', `DROP DATABASE IF EXISTS "${dbName(leg)}" WITH (FORCE)`]);
	}
});

describe('database reset vs other sessions on the target', () => {
	test.if(available)(
		named(
			'1: a session holding a conflicting lock is ended and the reset completes; the install-lock session and another database are untouched',
		),
		async () => {
			const conn = await seededDatabase('lock');
			const preexisting = ['plpgsql'];
			// Idle IN A TRANSACTION holding a lock the reset's DROPs conflict with.
			const holder = await openSession(
				conn,
				'BEGIN; LOCK TABLE matrix_like IN ACCESS SHARE MODE; SELECT term FROM other_table, matrix_like LIMIT 1;',
			);
			// The caller's own install lock (the executor holds it through every --abort).
			const lock = await holdInstallLock(conn, 'dedalo_install:reset_gate');
			expect(lock).not.toBeNull();
			const lockPid = Number(
				await psqlOk(
					admin,
					`SELECT pid FROM pg_stat_activity WHERE datname = '${conn.database}' AND application_name = 'dedalo_install:reset_gate'`,
				),
			);
			expect(lockPid).toBeGreaterThan(0);
			// A session on ANOTHER database, in a transaction too: never the reset's to end.
			const elsewhere = await openSession(
				connOf(dbName('other')),
				'BEGIN; SELECT count(*) FROM pg_class;',
			);

			const bound = 30000;
			const outcome = await Promise.race([
				resetDatabaseToEmpty(conn, preexisting, INSTALL_ID).then(
					(message) => ({ message }),
					(error: unknown) => ({ error }),
				),
				Bun.sleep(bound).then(() => ({ timedOut: true as const })),
			]);
			expect(
				'timedOut' in outcome,
				`the reset did not finish within ${bound / 1000} s — blocked by the session holding a lock on the target`,
			).toBe(false);
			expect('error' in outcome ? String(outcome.error) : '').toBe('');
			const message = (outcome as { message: string }).message;
			expect(message).toContain('reset to empty');
			expect(message).toContain(String(holder.pid));

			const after = await inspectTargetDatabase(conn);
			expect(after.userObjects).toEqual([]);
			expect(after.extensions).toEqual(preexisting);
			expect(after.installStamp).toBeNull();
			// The holder was ended by the server; the other two sessions were not.
			expect(await backendAlive(holder.pid)).toBe(false);
			expect(await backendAlive(lockPid)).toBe(true);
			expect(await backendAlive(elsewhere.pid)).toBe(true);
			await holder.close();
			await lock?.release();
			await elsewhere.close();
		},
		90000,
	);

	test.if(available)(
		named('2: a deadlock victim (40P01) is rolled back and run again → reset'),
		async () => {
			const conn = await seededDatabase('retry');
			const attempts: number[] = [];
			const message = await resetDatabaseToEmpty(conn, ['plpgsql'], INSTALL_ID, {
				scriptForAttempt: (script, attempt) => {
					attempts.push(attempt);
					return attempt === 1 ? raising('40P01')(script) : script;
				},
			});
			expect(attempts).toEqual([1, 2]);
			expect(message).toContain('reset to empty');
			const after = await inspectTargetDatabase(conn);
			expect(after.userObjects).toEqual([]);
			expect(after.installStamp).toBeNull();
		},
		60000,
	);

	test.if(available)(
		named('3: a persistent deadlock fails loudly after RESET_ATTEMPTS, every attempt rolled back'),
		async () => {
			const conn = await seededDatabase('persist');
			const before = (await inspectTargetDatabase(conn)).userObjects;
			const attempts: number[] = [];
			let caught: unknown = null;
			try {
				await resetDatabaseToEmpty(conn, ['plpgsql'], INSTALL_ID, {
					scriptForAttempt: (script, attempt) => {
						attempts.push(attempt);
						return raising('40P01')(script);
					},
				});
			} catch (error) {
				caught = error;
			}
			expect(RESET_ATTEMPTS).toBeGreaterThan(1);
			expect(attempts).toEqual(Array.from({ length: RESET_ATTEMPTS }, (_, i) => i + 1));
			expect(isDedaloError(caught) && caught.code).toBe('install.step_failed');
			expect(String((caught as Error).message)).toContain('40P01');
			expect(String((caught as Error).message)).toContain(`${RESET_ATTEMPTS} attempts`);
			const after = await inspectTargetDatabase(conn);
			expect(after.userObjects).toEqual(before);
			expect(after.installStamp).toBe(INSTALL_ID);
		},
		60000,
	);

	test.if(available)(
		named('4: a non-retryable error fails at once (one attempt), rolled back'),
		async () => {
			const conn = await seededDatabase('fatal');
			const attempts: number[] = [];
			let caught: unknown = null;
			try {
				await resetDatabaseToEmpty(conn, ['plpgsql'], INSTALL_ID, {
					scriptForAttempt: (script, attempt) => {
						attempts.push(attempt);
						return raising('42501')(script);
					},
				});
			} catch (error) {
				caught = error;
			}
			expect(attempts).toEqual([1]);
			expect(isDedaloError(caught) && caught.code).toBe('install.step_failed');
			expect(String((caught as Error).message)).toContain('42501');
			expect(await installStampOf(conn)).toBe(INSTALL_ID);
		},
		60000,
	);
});
