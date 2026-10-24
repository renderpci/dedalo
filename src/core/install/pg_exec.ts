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
 * THE SERVER-SIDE DEAD-CLIENT BOUND of every installer session (campaign 3e
 * F5, measured on RHEL 10 / Docker): a client that vanishes without its TCP
 * close reaching the server — a killed container whose network namespace went
 * with its unsent COPY data — left the seed restore's backend waiting on
 * ClientRead for the server's default keepalive (7200 s), so --resume and
 * --abort refused for two hours. These are the server's own per-session
 * settings (user-settable GUCs, sent as startup options): the server probes an
 * idle installer client after 30 s and drops it after three unanswered probes
 * 10 s apart, or after 60 s of unacknowledged data. Ignored on a unix socket
 * (no TCP to lose). An operator's own PGOPTIONS come after, so they win.
 */
export const INSTALL_SESSION_PGOPTIONS =
	'-c tcp_keepalives_idle=30 -c tcp_keepalives_interval=10 -c tcp_keepalives_count=3 -c tcp_user_timeout=60000';

/** An installer session's environment: the pg client env + the dead-client bound + its name. */
export function installSessionEnv(
	conn: DbConnDescriptor,
	appName?: string,
): Record<string, string> {
	const env = pgClientEnv(conn);
	const own = env.PGOPTIONS ?? '';
	return {
		...env,
		PGOPTIONS: own === '' ? INSTALL_SESSION_PGOPTIONS : `${INSTALL_SESSION_PGOPTIONS} ${own}`,
		...(appName === undefined ? {} : { PGAPPNAME: appName }),
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

/**
 * Record a long-lived child a step starts that is not psql (the developer
 * route's one `bun run dev` boot — dev_serve.ts) in the same scope, so an
 * interrupted install stops it and waits for it instead of orphaning a server
 * that holds the development port. Removed once it exits; a no-op outside the
 * executor.
 */
export function trackInstallChild(child: Subprocess): void {
	const tracked = psqlChildScope.getStore();
	tracked?.add(child);
	void child.exited.finally(() => tracked?.delete(child));
}

export interface PsqlRunResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

/**
 * Run psql against `conn` with the given extra args (e.g. `['-1', '-f', path]`).
 * SQL TEXT never goes in `args` — it goes through runPsqlScript (stdin). `stdin`,
 * when provided, is piped in (used by \copy … FROM STDIN and --file via stdin).
 * ON_ERROR_STOP is the caller's responsibility (pass it in `args`).
 *
 * A STREAMED stdin (a ReadableStream — the hierarchy import, cross-ops:r2) is read
 * by the child with backpressure, so a gigabyte script is never held in this
 * process; `signal` then KILLS the child (SIGKILL) when it fires — the producer's
 * failure must end the session BEFORE its input ends (psql reading an early EOF
 * would run what it got).
 */
export async function runPsql(
	conn: DbConnDescriptor,
	args: string[],
	options: {
		stdin?: Uint8Array | string | ReadableStream<Uint8Array>;
		/** Kills the child when it fires (see above). */
		signal?: AbortSignal;
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
	const streamed = options.stdin instanceof ReadableStream ? options.stdin : null;
	const child = Bun.spawn(
		[resolvePgBinary('psql'), `--dbname=${database}`, ...connArgs(conn), ...args],
		{
			stdin: streamed ?? (options.stdin !== undefined ? 'pipe' : 'ignore'),
			stdout: 'pipe',
			stderr: 'pipe',
			env: installSessionEnv(conn, options.appName),
		},
	);
	const tracked = psqlChildScope.getStore();
	tracked?.add(child);
	void child.exited.finally(() => tracked?.delete(child));
	killOnAbort(child, options.signal);
	if (streamed === null)
		await writeWholeStdin(child, options.stdin as Uint8Array | string | undefined);
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

/** SIGKILL `child` when `signal` fires (or already fired); the listener goes with the child. */
function killOnAbort(child: Subprocess, signal: AbortSignal | undefined): void {
	if (signal === undefined) return;
	const kill = () => child.kill('SIGKILL');
	if (signal.aborted) kill();
	signal.addEventListener('abort', kill, { once: true });
	void child.exited.finally(() => signal.removeEventListener('abort', kill));
}

/** A whole (non-streamed) stdin, written and closed. */
async function writeWholeStdin(
	child: Subprocess,
	stdin: Uint8Array | string | undefined,
): Promise<void> {
	if (stdin === undefined || !child.stdin) return;
	const sink = child.stdin as import('bun').FileSink;
	sink.write(stdin);
	await sink.end();
}

/**
 * THE ONE DOOR FOR SQL TEXT TO PSQL: the statement(s) ride the child's STDIN
 * (`-f -`), NEVER an argv element. Two reasons, both measured:
 *  - Linux caps ONE argv string at MAX_ARG_STRLEN (128 KiB): a `-c <sql>` past it
 *    fails posix_spawn with E2BIG (the int-clean census died this way in the CI
 *    image while macOS, with no per-string cap, stayed green — 4ad77190d7);
 *  - argv is world-readable in the process table for the child's whole life.
 *
 * Always `-X` (no ~/.psqlrc: its \set / \pset would reach stdout and the variable
 * table) and `ON_ERROR_STOP=1` — without it a script's failing statement leaves the
 * exit code 0, where `-c` answered 1; with it a failure exits non-zero (3) and
 * nothing after it runs. `flags` adds the caller's output shape (`-tA`, `-q`, `-1`,
 * `-v name=value`); a `-c`/`--command` there is the shape this door replaces
 * (psql_argv_sql_tripwire censuses src/ for it).
 *
 * WHAT STDIN CHANGES vs `-c` (each caller is written for it): the text is LEXED by
 * psql — quoted literals ('…', $tag$…$tag$, "…") reach the server verbatim, a
 * backslash outside them starts a meta-command (`\copy` is one, to the end of its
 * line), `:name` outside them is substituted only for a SET variable (with -X,
 * psql's built-ins and the caller's `-v`), and each statement autocommits on its
 * own unless the caller passes `-1` (a multi-statement `-c` string was one
 * implicit transaction).
 */
export async function runPsqlScript(
	conn: DbConnDescriptor,
	sql: string,
	options: {
		flags?: readonly string[];
		database?: string;
		appName?: string;
		signal?: AbortSignal;
	} = {},
): Promise<PsqlRunResult> {
	const { flags = [], ...rest } = options;
	return runPsql(conn, ['-X', '-v', 'ON_ERROR_STOP=1', ...flags, '-f', '-'], {
		...rest,
		stdin: sql,
	});
}

/** `SELECT 1` liveness against a connection (optionally a different database). */
export async function psqlSelect1(
	conn: DbConnDescriptor,
	database?: string,
): Promise<PsqlRunResult> {
	return runPsqlScript(conn, 'SELECT 1', { flags: ['-tA'], database });
}
