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

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Subprocess } from 'bun';
import { config } from '../../config/config.ts';
import { envSnapshot } from '../../config/env.ts';
import {
	connFieldDefect,
	libpqTransportArgs,
	pgSocketProblem,
	resolvePgTransport,
} from '../../config/pg_transport.ts';
import { DedaloError } from '../errors/index.ts';
import { resolvePgBinary } from './pg_bin.ts';

/** A Postgres connection described explicitly (posted creds or CLI flags). */
export interface DbConnDescriptor {
	database: string;
	host: string;
	port: string | number;
	user: string;
	password: string;
	/**
	 * Optional unix socket DIRECTORY; when set it WINS over `host` — the same
	 * rule the engine's pool applies (resolvePgTransport, src/config/pg_transport.ts).
	 */
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
		socket: config.db.socket,
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
	// The rule itself is pg_transport.ts connFieldDefect — the install plan
	// reports the same defect up front (install_validation.ts).
	const defect = connFieldDefect(value);
	if (defect === 'option') {
		// The submitted VALUE stays out of the wire sentence (log-only `message`).
		throw new DedaloError('install.invalid_input', {
			message: `install: refusing ${name} that looks like a command-line option ('${value}')`,
			publicMessage: `The ${name} value looks like a command-line option and was refused`,
			coordinates: { field: name },
		});
	}
	if (defect === 'control') {
		throw new DedaloError('install.invalid_input', {
			message: `install: refusing ${name} with a control character`,
			publicMessage: `The ${name} value contains a control character and was refused`,
			coordinates: { field: name },
		});
	}
}

/**
 * The `-h <host|socket dir> -p <port>` pair for a descriptor, decided by the ONE
 * transport rule the engine's pool also takes (resolvePgTransport): DB_SOCKET
 * wins, a `/` host is a socket directory, anything else is TCP. So the install
 * probe connects over exactly the route the configured engine will use.
 * Exported for every psql/pg_dump/pg_restore door (restore, recovery, backup).
 */
export function pgTransportArgs(conn: DbConnDescriptor): string[] {
	const socketProblem = pgSocketProblem(conn.socket);
	if (socketProblem !== null) {
		throw new DedaloError('install.invalid_input', {
			message: `install: ${socketProblem}`,
			publicMessage: 'The database socket must be an absolute path',
			coordinates: { field: 'socket' },
		});
	}
	const args = libpqTransportArgs(
		resolvePgTransport({ host: String(conn.host ?? ''), port: conn.port, socket: conn.socket }),
	);
	assertSafeConnField('host', args[1] as string);
	return args;
}

/**
 * host/port/user flags (password rides PGPASSWORD, never argv) and `-w`.
 * Exported for the pg client spawns that cannot go through runPsql (a streamed
 * pg_dump): one argv law for every pg client this engine starts.
 *
 * `-w` (--no-password, accepted by psql, pg_dump and pg_restore alike): a pg
 * client this engine starts NEVER prompts. Without it, a server asking for a
 * password the descriptor does not carry made libpq open /dev/tty and wait —
 * measured in install campaign 3 (C3-12): a suite run sat ten minutes at
 * `Password for user dedalo:`. With it the child fails at once with libpq's
 * own "no password supplied", which the caller reports.
 */
export function connArgs(conn: DbConnDescriptor): string[] {
	const args = pgTransportArgs(conn);
	if (conn.user) {
		assertSafeConnField('user', String(conn.user));
		args.push('-U', String(conn.user));
	}
	args.push('-w');
	return args;
}

/** Seconds a pg client waits for its connection unless the environment says otherwise. */
export const PG_CONNECT_TIMEOUT_SECONDS = '10';

/**
 * The child environment of a pg client: the engine's env + PGPASSWORD (never
 * argv) + PGCONNECT_TIMEOUT, so an unreachable server ends the child instead of
 * holding it (an operator's own PGCONNECT_TIMEOUT wins).
 */
export function pgClientEnv(conn: DbConnDescriptor): Record<string, string> {
	const env = envSnapshot() as Record<string, string>;
	return {
		...env,
		PGCONNECT_TIMEOUT: env.PGCONNECT_TIMEOUT ?? PG_CONNECT_TIMEOUT_SECONDS,
		...(conn.password !== '' ? { PGPASSWORD: conn.password } : {}),
	};
}

/**
 * THE INSTALLER'S CHILD SCOPE. The terminal installer (executor.ts) runs every
 * step inside `trackPsqlChildren`, so a SIGINT/SIGTERM can kill the psql
 * children a step started and AWAIT their exit before it records the step
 * failed and releases its locks — an orphan psql must never COMMIT after the
 * state says `failed` (a concurrent --resume would race it). Request-independent
 * and scoped by AsyncLocalStorage, never a module-level registry: outside the
 * executor the store is absent and nothing is tracked.
 */
const psqlChildScope = new AsyncLocalStorage<Set<Subprocess>>();

/** Run `work` with every psql child it spawns recorded in `children` (removed once it exits). */
export function trackPsqlChildren<T>(
	children: Set<Subprocess>,
	work: () => Promise<T>,
): Promise<T> {
	return psqlChildScope.run(children, work);
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
	options: {
		stdin?: Uint8Array | string;
		database?: string;
		/**
		 * The session's application_name (PGAPPNAME): the seed restore names itself
		 * `dedalo_install_seed` so a resume can see a restore still running on the
		 * server (db_restore.ts inspectTargetDatabase).
		 */
		appName?: string;
	} = {},
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
				...pgClientEnv(conn),
				...(options.appName === undefined ? {} : { PGAPPNAME: options.appName }),
			},
		},
	);
	const tracked = psqlChildScope.getStore();
	tracked?.add(child);
	void child.exited.finally(() => tracked?.delete(child));
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
