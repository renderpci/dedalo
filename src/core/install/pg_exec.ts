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

/**
 * Reject a connection field that psql could parse as an OPTION or that would
 * break the argv/env (CMD-01, 2026-07-28 audit). The posted `db_database`
 * used to ride as a BARE POSITIONAL argv element, so a value like
 * `--command=\! sh` was parsed by psql as an option → shell execution on the
 * host. Every field is now passed via a flag AND screened here: no leading `-`
 * (option shape) and no CR/LF/NUL (argv/line corruption). A real Postgres
 * identifier never starts with `-`, so this rejects only hostile input.
 */
export function assertSafeConnField(name: string, value: string): void {
	if (/^-/.test(value)) {
		throw new Error(`install: refusing ${name} that looks like a command-line option ('${value}')`);
	}
	if (/[\r\n\0]/.test(value)) {
		throw new Error(`install: refusing ${name} with a control character`);
	}
}

/** host/port/user flags (password rides PGPASSWORD, never argv). */
function connArgs(conn: DbConnDescriptor): string[] {
	const args: string[] = [];
	const host = conn.socket && conn.socket !== '' ? conn.socket : conn.host;
	if (host) {
		assertSafeConnField('host', String(host));
		args.push('-h', String(host));
	}
	if (conn.port) args.push('-p', String(conn.port));
	if (conn.user) {
		assertSafeConnField('user', String(conn.user));
		args.push('-U', String(conn.user));
	}
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
	assertSafeConnField('database', String(database));
	// `--dbname=<db>` as ONE glued token: getopt takes everything after the
	// first `=` as the value, so even a `--command=…`-shaped database can never
	// be re-parsed as a psql option (CMD-01). Was a bare positional argv element.
	const child = Bun.spawn(
		[resolvePgBinary('psql'), `--dbname=${database}`, ...connArgs(conn), ...args],
		{
			stdin: options.stdin !== undefined ? 'pipe' : 'ignore',
			stdout: 'pipe',
			stderr: 'pipe',
			env: {
				...(envSnapshot() as Record<string, string>),
				...(conn.password !== '' ? { PGPASSWORD: conn.password } : {}),
			},
		},
	);
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
