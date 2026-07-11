/**
 * Explicit-connection psql runner (DEC-19). The install engine must talk to a
 * Postgres described by POSTED credentials (test_db_connection) or by the CLI's
 * flags — NOT the frozen `config.db` sentinel. This is the one place install
 * subprocesses spawn psql, mirroring the sanctioned pattern in
 * ontology/data_io.ts (Bun.spawn, PGPASSWORD, no shell of our making).
 *
 * The browser path (post-restart) passes no descriptor and defaults to
 * `config.db` (the real, restarted config + pool for pure-SQL steps); the CLI
 * passes the posted descriptor so every DB write goes through psql without
 * depending on the sentinel pool.
 */

import { config } from '../../config/config.ts';
import { envSnapshot } from '../../config/env.ts';
import { resolvePgBinary } from './pg_bin.ts';

/** A Postgres connection described explicitly (posted creds or CLI flags). */
export interface DbConnDescriptor {
	database: string;
	host: string;
	port: string | number;
	user: string;
	password: string;
	/** Optional unix socket DIRECTORY; when set it is used as the host. */
	socket?: string;
}

/** Build a descriptor from the frozen config (the browser post-restart default). */
export function connFromConfig(): DbConnDescriptor {
	return {
		database: config.db.database,
		host: config.db.host,
		port: config.db.port,
		user: config.db.user,
		password: config.db.password,
	};
}

/** host/port/user flags (password rides PGPASSWORD, never argv). */
function connArgs(conn: DbConnDescriptor): string[] {
	const args: string[] = [];
	const host = conn.socket && conn.socket !== '' ? conn.socket : conn.host;
	if (host) args.push('-h', String(host));
	if (conn.port) args.push('-p', String(conn.port));
	if (conn.user) args.push('-U', String(conn.user));
	return args;
}

export interface PsqlRunResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

/**
 * Run psql against `conn` with the given extra args (e.g. `['-c', 'SELECT 1']`).
 * `stdin`, when provided, is piped in (used by \copy … FROM STDIN and --file via
 * stdin). ON_ERROR_STOP is the caller's responsibility (pass it in `args`).
 */
export async function runPsql(
	conn: DbConnDescriptor,
	args: string[],
	options: { stdin?: Uint8Array | string; database?: string } = {},
): Promise<PsqlRunResult> {
	const database = options.database ?? conn.database;
	const child = Bun.spawn([resolvePgBinary('psql'), database, ...connArgs(conn), ...args], {
		stdin: options.stdin !== undefined ? 'pipe' : 'ignore',
		stdout: 'pipe',
		stderr: 'pipe',
		env: {
			...(envSnapshot() as Record<string, string>),
			...(conn.password !== '' ? { PGPASSWORD: conn.password } : {}),
		},
	});
	if (options.stdin !== undefined && child.stdin) {
		child.stdin.write(options.stdin);
		await child.stdin.end();
	}
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

/** `SELECT 1` liveness against a connection (optionally a different database). */
export async function psqlSelect1(
	conn: DbConnDescriptor,
	database?: string,
): Promise<PsqlRunResult> {
	return runPsql(conn, ['-tAc', 'SELECT 1', '-v', 'ON_ERROR_STOP=1'], { database });
}
