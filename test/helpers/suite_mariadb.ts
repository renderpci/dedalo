/**
 * THE SUITE MARIADB TARGET — the one primitive through which a gate reaches MariaDB
 * (PUB-05, audit 2026-09-26). The fourth suite-owned surface, beside the Postgres suite
 * database (`dedalo_test_marker`), the media root (`.dedalo_test_media`) and the vector
 * database (`dedalo_test_rag_marker`).
 *
 * BEFORE IT the diffusion gates borrowed the MACHINE's MariaDB: a test process read
 * `DEDALO_DIFFUSION_DB_SOCKET` from the installation's `../private/.env`, so on a
 * developer machine `diffusion_mariadb.test.ts` created and dropped tables in the
 * installation's publication database `web_numisdata_mib`, and on a runner without that
 * socket every live leg skipped GREEN (`test.if(HAVE_DB)`). One defect seen from two
 * sides: the target was not built by the suite.
 *
 * NOW:
 *   - `test/preload/suite_mariadb.ts` ARMS every `bun test` process at this lane's
 *     server, unconditionally (no I/O, cannot fail) — see `suite_mariadb_env.ts`;
 *   - `ensureSuiteMariadb()` installs, starts and provisions that server (idempotent;
 *     serialized across processes by a kernel-released flock, `suite_mariadb_lock.ts`)
 *     and never adopts a root it did not create;
 *   - `requireSuiteMariadb(file, databases)` is what a gate calls in `beforeAll`: it
 *     refuses a database the situations do not declare BY NAME, refuses an unarmed
 *     process, ensures the server, reads each database's MARKER ROW through the
 *     ENGINE's own pool (`getTargetPool`) and accepts only a row naming THIS lane —
 *     then appends an acquisition row to the ledger `scripts/ci/mariadb_tier.ts`
 *     checks. It throws on everything else. There is no skip path.
 *
 * THE MARKER cannot be forged by the code under test: it lives in its own schema
 * (`dedalo_test_mariadb_marker.targets`), and the diffusion user — the one the engine
 * connects as — holds SELECT on it and nothing else. Its per-database grants are the
 * production posture (no CREATE DATABASE, no global privilege); the provisioner proves
 * both on every ensure (errno 1044 / 1142) and throws if either widened.
 *
 * NO TCP FROM THIS MODULE. Measured 2026-09-30: Bun's `mariadb` adapter given a `path`
 * that does not exist silently falls back to `localhost:3306` — on a developer machine,
 * the installation's server. So every connection this module opens is preceded by a
 * socket check (`suiteSocketPresent`), and its own CLI calls force `--protocol=socket`;
 * a gate that acquires through `requireSuiteMariadb()` therefore only ever opens pools
 * while the socket exists. That is a guarantee about THESE doors, not about the engine:
 * any other caller of `getTargetPool` in an armed process still falls back when the
 * server is down, until PUB-05b makes `buildTargetOptions` refuse a missing socket.
 *
 * Guarded by test/unit/suite_mariadb_target_native.test.ts (and, as a stage, by
 * scripts/ci/mariadb_tier.ts). Controlled by scripts/ci/suite_mariadb.ts
 * start|stop|status|sweep. The sweep (one lane, or the shard runner's many) is
 * suite_mariadb_lanes.ts.
 */

import { spawn } from 'node:child_process';
import {
	appendFileSync,
	chmodSync,
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { readEnv } from '../../src/config/env.ts';
import { getTargetPool, type MariadbErrorLike } from '../../src/diffusion/targets/mariadb/db.ts';
import {
	databasesOf,
	FOREIGN_CONTROL_DB,
	FOREIGN_SUITE_DB,
	GRANTED_ABSENT_CONTROL_DB,
	isArmed,
	MARKER_PURPOSE,
	MARKER_SCHEMA,
	MARKER_TABLE,
	SUITE_MARIADB_MARKER_FILE,
	SUITE_MARIADB_PASSWORD,
	SUITE_MARIADB_USER,
	type SuiteMariadbPaths,
	suiteMariadbPaths,
	suiteSocketPresent,
	UNMARKED_CONTROL_DB,
} from './suite_mariadb_env.ts';
import { acquireSuiteMariadbLock } from './suite_mariadb_lock.ts';
import { testDatabaseName } from './test_database.ts';
import { zzdTargetDatabases } from './zzd_diffusion_fixture.ts';
import { ZZDIF_SITUATION } from './zzdif_diffusion_domain.ts';

export {
	databasesOf,
	FOREIGN_CONTROL_DB,
	FOREIGN_SUITE_DB,
	GRANTED_ABSENT_CONTROL_DB,
	MARKER_PURPOSE,
	MARKER_SCHEMA,
	MARKER_TABLE,
	SUITE_MARIADB_MARKER_FILE,
	SUITE_MARIADB_USER,
	type SuiteMariadbPaths,
	suiteMariadbEnvironment,
	suiteMariadbPaths,
	suiteSocketPresent,
	UNMARKED_CONTROL_DB,
} from './suite_mariadb_env.ts';

/** Thrown when the machine cannot host a suite server (binaries missing) — a RED, never a skip. */
export class SuiteMariadbUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SuiteMariadbUnavailableError';
	}
}

// ── the target list ───────────────────────────────────────────────────────────────

/**
 * Every database the suite server hosts: the union of the `database` nodes of the
 * registered situations (zzd + zzdif). The ONLY list of target names — the provisioner
 * and the gates both read it, so a gate cannot name a database the situations do not
 * declare (an installation's `web_numisdata_mib` is refused by name).
 */
export function SUITE_MARIADB_DATABASES(): string[] {
	return [...new Set([...zzdTargetDatabases(), ...databasesOf(ZZDIF_SITUATION)])].sort();
}

// ── the classifier (pure) ─────────────────────────────────────────────────────────

/** What one marker read returned: rows, or the driver's error. */
export type SuiteTargetProbe =
	| { ok: true; rows: { suite_db: string; purpose: string }[] }
	| { ok: false; errno: number | undefined; message: string };

export type SuiteTargetCause =
	| 'unarmed'
	| 'unreachable'
	| 'missing_database'
	| 'missing_marker'
	| 'no_row'
	| 'foreign'
	| 'bad_purpose';

export type SuiteTargetVerdict =
	| { ready: true }
	| { ready: false; cause: SuiteTargetCause; detail: string };

/**
 * THE VERDICT on one target. Pure. Every way a target can be wrong is a REFUSE, with its
 * cause; only an armed process whose marker row names THIS lane with the suite purpose
 * is ready. There is no third answer — in particular, no "skip".
 */
export function classifySuiteTarget(input: {
	armed: boolean;
	lane: string;
	database: string;
	probe: SuiteTargetProbe;
}): SuiteTargetVerdict {
	const { armed, lane, database, probe } = input;
	const refuse = (cause: SuiteTargetCause, detail: string): SuiteTargetVerdict => ({
		ready: false,
		cause,
		detail: `'${database}': ${detail}`,
	});
	if (!armed)
		return refuse(
			'unarmed',
			'this process is not armed at the suite MariaDB server (test/preload/suite_mariadb.ts did not run, or something re-pointed DEDALO_DIFFUSION_DB_SOCKET)',
		);
	if (!probe.ok) {
		const { errno, message } = probe;
		if (errno === 1049 || errno === 1044)
			return refuse(
				'missing_database',
				`the database is absent or not granted (errno ${errno}): ${message}`,
			);
		if (errno === 1146 || errno === 1142)
			return refuse(
				'missing_marker',
				`the marker table ${MARKER_TABLE} is absent or unreadable (errno ${errno}) — not a suite server: ${message}`,
			);
		return refuse(
			'unreachable',
			`the suite server did not answer (errno ${errno ?? 'none'}): ${message}`,
		);
	}
	const row = probe.rows[0];
	if (row === undefined)
		return refuse('no_row', `no marker row names it — a database the suite did not provision`);
	if (row.suite_db !== lane)
		return refuse(
			'foreign',
			`its marker row names suite '${row.suite_db}', not this lane '${lane}'`,
		);
	if (row.purpose !== MARKER_PURPOSE)
		return refuse('bad_purpose', `its marker purpose is '${row.purpose}', not '${MARKER_PURPOSE}'`);
	return { ready: true };
}

// ── arming and the live probe ─────────────────────────────────────────────────────

/** True when this process's engine config points at THIS lane's suite socket (light half). */
export { isArmed };

/**
 * Read one database's marker row THROUGH THE ENGINE'S POOL. Refuses to connect — and
 * reports `unreachable` — unless the process is armed and the suite socket exists,
 * because the driver would otherwise fall back to TCP (see the header).
 */
export async function probeSuiteTarget(database: string): Promise<SuiteTargetProbe> {
	const paths = suiteMariadbPaths();
	if (!isArmed(paths))
		return {
			ok: false,
			errno: undefined,
			message: `not armed (DEDALO_DIFFUSION_DB_SOCKET is '${readEnv('DEDALO_DIFFUSION_DB_SOCKET') ?? ''}', the suite socket is '${paths.socket}') — nothing was contacted`,
		};
	if (!suiteSocketPresent(paths.suiteDb))
		return {
			ok: false,
			errno: undefined,
			message: `no suite server socket at ${paths.socket} — nothing was contacted`,
		};
	try {
		const rows = (await getTargetPool(database).unsafe(
			`SELECT suite_db, purpose FROM ${MARKER_TABLE} WHERE database_name = ?`,
			[database],
		)) as { suite_db: unknown; purpose: unknown }[];
		return {
			ok: true,
			rows: rows.map((row) => ({ suite_db: String(row.suite_db), purpose: String(row.purpose) })),
		};
	} catch (error) {
		return {
			ok: false,
			errno: (error as MariadbErrorLike).errno,
			message: (error as MariadbErrorLike).message ?? String(error),
		};
	}
}

/**
 * THE GATE'S DOOR. Call it in `beforeAll` (with a 120 s hook timeout: a cold lane
 * installs and starts a server). Order is deliberate — the two checks that need no
 * connection come first:
 *   1. every name is a suite target (derived from the situations) — refused by name;
 *   2. the process is armed at this lane's socket;
 *   3. the server exists (ensure: install, start, provision, self-check);
 *   4. each marker row, read through `getTargetPool`, names this lane.
 * Then one acquisition row per database goes to the ledger. Anything else THROWS.
 */
export async function requireSuiteMariadb(
	callerPath: string,
	databases: readonly string[],
): Promise<void> {
	const targets = new Set(SUITE_MARIADB_DATABASES());
	const unknown = databases.filter((name) => !targets.has(name));
	if (databases.length === 0 || unknown.length > 0)
		throw new Error(
			`requireSuiteMariadb(${callerPath}): ${unknown.length > 0 ? `'${unknown.join("', '")}' is not a suite MariaDB target` : 'no database named'} — the targets are the database nodes of the registered situations: ${[...targets].join(', ')}. Nothing was contacted.`,
		);
	const paths = suiteMariadbPaths();
	if (!isArmed(paths))
		throw new Error(
			`requireSuiteMariadb(${callerPath}): preload not armed — DEDALO_DIFFUSION_DB_SOCKET is '${readEnv('DEDALO_DIFFUSION_DB_SOCKET') ?? ''}', this lane's suite socket is '${paths.socket}'. test/preload/suite_mariadb.ts must be in bunfig.toml's preload list. Nothing was contacted.`,
		);
	await ensureSuiteMariadb();
	const lane = testDatabaseName();
	for (const database of databases) {
		const verdict = classifySuiteTarget({
			armed: isArmed(paths),
			lane,
			database,
			probe: await probeSuiteTarget(database),
		});
		if (!verdict.ready)
			throw new Error(
				`requireSuiteMariadb(${callerPath}): REFUSED (${verdict.cause}) ${verdict.detail}`,
			);
	}
	for (const database of databases)
		appendFileSync(paths.acquisitions, `${JSON.stringify({ file: callerPath, database })}\n`);
}

// ── the server ────────────────────────────────────────────────────────────────────

interface Binaries {
	mariadbd: string;
	installDb: string;
	client: string;
}

const BINARY_DIRS = [
	'/usr/sbin',
	'/usr/bin',
	'/opt/homebrew/bin',
	'/usr/local/bin',
	'/usr/local/sbin',
];

function findBinary(names: readonly string[]): string | undefined {
	for (const name of names) {
		const found = Bun.which(name);
		if (found !== null) return found;
		for (const dir of BINARY_DIRS) if (existsSync(`${dir}/${name}`)) return `${dir}/${name}`;
	}
	return undefined;
}

function binaries(): Binaries {
	const mariadbd = findBinary(['mariadbd']);
	const installDb = findBinary(['mariadb-install-db']);
	const client = findBinary(['mariadb']);
	const missing = [
		mariadbd === undefined ? 'mariadbd' : null,
		installDb === undefined ? 'mariadb-install-db' : null,
		client === undefined ? 'mariadb' : null,
	].filter((name): name is string => name !== null);
	if (
		missing.length > 0 ||
		mariadbd === undefined ||
		installDb === undefined ||
		client === undefined
	)
		throw new SuiteMariadbUnavailableError(
			`the suite MariaDB target cannot be started: ${missing.join(', ')} not found (searched PATH and ${BINARY_DIRS.join(', ')}). Install MariaDB (the CI image ships it; Homebrew: \`brew install mariadb\`). The MariaDB gates are RED without it — they never skip.`,
		);
	return { mariadbd, installDb, client };
}

/**
 * Is `pid` a RUNNING process? A ZOMBIE is not: it has exited and only waits to be
 * reaped, yet `kill(pid, 0)` still answers for it. The suite server is spawned
 * DETACHED, so once killed it waits on PID 1 — and in the CI container PID 1 never
 * reaps orphans (perl waiting on its own child in ci:local's driver, `tail -f /dev/null` in a GitHub
 * container job). Measured 2026-10-01: a stopped never-answering server read as
 * alive forever there (leg o), and a killed claimer's leftover was never
 * collectable (leg r). Linux exposes the state in /proc/<pid>/stat (`Z`); without
 * /proc (macOS) a killed child is reaped by its waiting parent and kill(0) stands.
 */
export function pidAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
	let stat: string;
	try {
		stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
	} catch {
		return true; // no /proc (macOS), or gone between the two reads: kill(0) said alive
	}
	// `pid (comm) S …` — comm may hold spaces and parens, so the state follows the LAST ')'.
	return stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3) !== 'Z';
}

function readPid(file: string): number | undefined {
	try {
		const pid = Number(readFileSync(file, 'utf8').trim());
		return Number.isInteger(pid) && pid > 0 ? pid : undefined;
	} catch {
		return undefined;
	}
}

function tail(file: string, lines = 20): string {
	try {
		return readFileSync(file, 'utf8').split('\n').slice(-lines).join('\n');
	} catch {
		return '(no log)';
	}
}

/** Run the client as ROOT over the socket (never TCP). Resolves stdout+stderr+code. */
/**
 * DEADLINES (review 2026-09-30, S3). Every client call and the installer run while the
 * lane lock is held (ensure, provision, self-check), so a server that accepts and never
 * answers — a stuck DDL — or a wedged installer used to freeze every process of the
 * lane: each waiter gave up after the lock's 180 s naming the LOCK, never the cause.
 * Each process is now killed at its deadline and the call throws naming it. `timeoutMs`
 * on `ensureSuiteMariadb` / `suiteMariadbAdminQuery` overrides both (a gate plants a
 * hung binary). Held by suite_mariadb_target_native leg (n).
 */
const CLIENT_TIMEOUT_MS = 120_000;
const INSTALL_TIMEOUT_MS = 300_000;
/** A liveness probe answers in milliseconds or not at all. */
const PING_TIMEOUT_MS = 15_000;
/** A started server answers within it, or the start fails. */
const START_TIMEOUT_MS = 60_000;
/** SIGTERM → SIGKILL grace for a lane server being stopped. */
const STOP_WAIT_MS = 30_000;
/** SIGKILL → gone: the kernel's teardown of a killed process (a big buffer pool unmaps). */
const KILL_WAIT_MS = 5_000;

interface Deadlines {
	clientMs: number;
	installMs: number;
	pingMs: number;
	startMs: number;
	stopMs: number;
	killMs: number;
}

/** The defaults, or EVERY deadline set to `timeoutMs` (a gate planting a hung binary). */
function deadlines(timeoutMs?: number): Deadlines {
	return {
		clientMs: timeoutMs ?? CLIENT_TIMEOUT_MS,
		installMs: timeoutMs ?? INSTALL_TIMEOUT_MS,
		pingMs: timeoutMs ?? PING_TIMEOUT_MS,
		startMs: timeoutMs ?? START_TIMEOUT_MS,
		stopMs: timeoutMs ?? STOP_WAIT_MS,
		killMs: timeoutMs ?? KILL_WAIT_MS,
	};
}

/**
 * THE LONGEST A HOLDER KEEPS THE LANE LOCK, from the deadlines it runs under (review
 * 2026-09-30, S3): the worst ensure — the liveness probe, the installer behind its fence,
 * `start()` (fence the datadir, answer within `startMs` with one probe in flight at the
 * deadline, fence again to stop the server that never answered), then provisioning plus
 * the self-check (at most four client calls). A stop or a sweep holds it for one fence, a
 * reprovision for the four client calls: both fit inside. A step added under the lock
 * belongs in this sum.
 */
function lockHoldMs(limits: Deadlines): number {
	return (
		limits.pingMs +
		fenceMs(limits) +
		limits.installMs +
		fenceMs(limits) +
		limits.startMs +
		limits.pingMs +
		fenceMs(limits) +
		4 * limits.clientMs
	);
}

/** How long a waiter queues for the lane lock: the holder's worst case plus a margin. */
function lockWaitMs(limits: Deadlines): number {
	const hold = lockHoldMs(limits);
	return hold + Math.max(1_000, Math.ceil(hold / 10));
}

/** `lockHoldMs` for the defaults, or for `timeoutMs` (what `ensureSuiteMariadb` gets). */
export function suiteMariadbLockHoldMs(timeoutMs?: number): number {
	return lockHoldMs(deadlines(timeoutMs));
}

/** The lock wait `ensureSuiteMariadb({ timeoutMs })` queues with (the stop/sweep: the default). */
export function suiteMariadbLockWaitMs(timeoutMs?: number): number {
	return lockWaitMs(deadlines(timeoutMs));
}

async function runClient(
	paths: SuiteMariadbPaths,
	sql: string,
	as: { user: string; password?: string; database?: string } = { user: 'root' },
	timeoutMs = CLIENT_TIMEOUT_MS,
): Promise<{ code: number; stdout: string; stderr: string }> {
	const { client } = binaries();
	const args = [
		client,
		'--no-defaults',
		'--protocol=socket',
		`--socket=${paths.socket}`,
		`--user=${as.user}`,
		'--batch',
		'--skip-column-names',
		'--connect-timeout=5',
	];
	if (as.password !== undefined) args.push(`--password=${as.password}`);
	if (as.database !== undefined) args.push(as.database);
	const proc = Bun.spawn(args, { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		proc.kill('SIGKILL');
	}, timeoutMs);
	try {
		// A client that EXITS before reading its stdin (refused connection, `ERROR 1040`)
		// closes the pipe: the write then fails EPIPE, and that throw would REPLACE the
		// client's own error with "broken pipe" — a race the desk wins and the CI image
		// loses. Its exit code and stderr are the verdict; only EPIPE is swallowed.
		try {
			proc.stdin.write(sql);
			await proc.stdin.end();
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EPIPE') throw error;
		}
		const [stdout, stderr, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		if (timedOut)
			throw new Error(
				`suite_mariadb: the mariadb client did not finish within ${timeoutMs / 1000}s on ${paths.socket} (killed): ${stderr.trim().split('\n').slice(-5).join(' | ')}`,
			);
		return { code, stdout, stderr };
	} finally {
		clearTimeout(timer);
	}
}

/** Root query over the lane's socket; tab-separated rows. Throws on a client error. */
export async function suiteMariadbAdminQuery(
	sql: string,
	suiteDb?: string,
	options: { timeoutMs?: number } = {},
): Promise<string> {
	const paths = suiteMariadbPaths(suiteDb);
	if (!suiteSocketPresent(paths.suiteDb))
		throw new Error(`suite_mariadb: no server socket at ${paths.socket} — start it first`);
	const result = await runClient(paths, sql, undefined, deadlines(options.timeoutMs).clientMs);
	if (result.code !== 0)
		throw new Error(
			`suite_mariadb: admin query failed (exit ${result.code}): ${result.stderr.trim()}`,
		);
	return result.stdout;
}

/**
 * What the lane's socket says (review 2026-09-30, S3). `down` — no socket, or the client
 * could not reach a server through it (a CLIENT errno, >= 2000: nothing listening, the
 * connection lost) — is the only state `start()` may replace. A SERVER errno (< 2000:
 * 1040 too many connections, 1045 access denied, …) means a live server ANSWERED: it
 * is `refusing`, and ensure surfaces the error instead of signalling a server every
 * other process of the lane may be using. A client that never finishes throws (the
 * ping deadline, `runClient`). Held by suite_mariadb_target_native leg (p).
 */
type ServerState = { state: 'up' } | { state: 'down' } | { state: 'refusing'; error: string };

async function probeServer(paths: SuiteMariadbPaths, limits = deadlines()): Promise<ServerState> {
	if (!suiteSocketPresent(paths.suiteDb)) return { state: 'down' };
	const result = await runClient(paths, 'SELECT 1;', undefined, limits.pingMs);
	const errno = clientErrno(result);
	if (errno === null) return { state: 'up' };
	if (errno > 0 && errno < 2000) return { state: 'refusing', error: result.stderr.trim() };
	return { state: 'down' };
}

async function ping(paths: SuiteMariadbPaths, limits = deadlines()): Promise<boolean> {
	return (await probeServer(paths, limits)).state === 'up';
}

/**
 * True only when `pid` is a mariadbd serving THIS lane's datadir. A pid file outlives a
 * reboot, and a recycled pid may name any process: nothing is signalled on a pid file's
 * word alone.
 */
function isLaneServer(pid: number, paths: SuiteMariadbPaths): boolean {
	if (!pidAlive(pid)) return false;
	const ps = Bun.spawnSync(['ps', '-o', 'command=', '-p', String(pid)], { stdout: 'pipe' });
	const command = ps.stdout.toString();
	return command.includes('mariadbd') && command.includes(`--datadir=${paths.datadir}`);
}

/** How `terminateProcesses` signals, observes and waits — a gate scripts it (leg s). */
export interface ProcessControl {
	signal(pid: number, signal: 'SIGTERM' | 'SIGKILL'): void;
	/** True once `pid` holds nothing: no such process, or a zombie awaiting its reaper. */
	gone(pid: number): boolean;
	now(): number;
	sleep(ms: number): Promise<void>;
}

/** A zombie holds no file, lock or socket — it is gone for every purpose here. */
function processGone(pid: number): boolean {
	if (!pidAlive(pid)) return true;
	const ps = Bun.spawnSync(['ps', '-o', 'stat=', '-p', String(pid)], { stdout: 'pipe' });
	const state = ps.stdout.toString().trim();
	return state === '' || state.startsWith('Z');
}

const REAL_PROCESS_CONTROL: ProcessControl = {
	signal: (pid, signal) => process.kill(pid, signal),
	gone: processGone,
	now: () => Date.now(),
	sleep: (ms) => Bun.sleep(ms),
};

/**
 * SIGTERM `pids`, wait up to `termMs`, SIGKILL the survivors, and RETURN ONLY ONCE EVERY
 * ONE IS GONE — or throw naming the survivors after `killMs` (review 2026-09-30, S3).
 * Sending SIGKILL is not the process being gone: until the kernel has torn it down it
 * still holds the datadir, and the callers go on to start a server on it or rename it.
 * A pid already gone when signalled (ESRCH) is gone. Held by suite_mariadb_target_native
 * leg (s).
 */
export async function terminateProcesses(
	pids: number[],
	what: string,
	waits: { termMs: number; killMs: number },
	control: ProcessControl = REAL_PROCESS_CONTROL,
): Promise<void> {
	/** Pids the kernel said do not exist (ESRCH) — gone, whatever a probe says after. */
	const vanished = new Set<number>();
	const send = (signal: 'SIGTERM' | 'SIGKILL', targets: number[]) => {
		for (const pid of targets)
			try {
				control.signal(pid, signal);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
				vanished.add(pid);
			}
	};
	const living = () => pids.filter((pid) => !vanished.has(pid) && !control.gone(pid));
	const waitGone = async (ms: number) => {
		const deadline = control.now() + ms;
		while (living().length > 0 && control.now() < deadline) await control.sleep(100);
		return living();
	};
	send('SIGTERM', pids);
	const stubborn = await waitGone(waits.termMs);
	if (stubborn.length === 0) return;
	send('SIGKILL', stubborn);
	const survivors = await waitGone(waits.killMs);
	if (survivors.length > 0)
		throw new Error(
			`suite_mariadb: ${what} — pid ${survivors.join(', ')} survived SIGKILL for ${waits.killMs / 1000} s; refusing to go on over a live process`,
		);
}

/** A worst-case fence: two rounds of SIGTERM grace + SIGKILL wait. */
function fenceMs(limits: Deadlines): number {
	return 2 * (limits.stopMs + limits.killMs);
}

/** `--datadir=<datadir>` as a whole argument of a process command line. */
function namesDatadir(command: string, datadir: string): boolean {
	let at = command.indexOf(`--datadir=${datadir}`);
	while (at !== -1) {
		const end = at + `--datadir=${datadir}`.length;
		if (
			(at === 0 || /\s/.test(command[at - 1] as string)) &&
			(end === command.length || /\s/.test(command[end] as string))
		)
			return true;
		at = command.indexOf(`--datadir=${datadir}`, at + 1);
	}
	return false;
}

/** Every process (but this one) whose command line names the lane's datadir. */
function laneProcesses(paths: SuiteMariadbPaths): number[] {
	const ps = Bun.spawnSync(['ps', '-A', '-ww', '-o', 'pid=,command='], {
		stdout: 'pipe',
		stderr: 'pipe',
	});
	// A scan that could not run is not "nothing is running": the fence would open blind.
	if (ps.exitCode !== 0)
		throw new Error(
			`suite_mariadb: cannot list processes to fence ${paths.datadir} (ps exit ${ps.exitCode}): ${ps.stderr.toString().trim()}`,
		);
	const pids: number[] = [];
	for (const line of ps.stdout.toString().split('\n')) {
		const match = /^\s*(\d+)\s+(.*)$/.exec(line);
		if (match === null) continue;
		const pid = Number(match[1]);
		if (pid !== process.pid && namesDatadir(match[2] as string, paths.datadir)) pids.push(pid);
	}
	return pids;
}

/**
 * FENCE THE DATADIR: stop EVERY process whose command line names it — the pid-file
 * server, and what no pid file names: the installer of a holder killed mid-install (the
 * kernel freed its lock, not its `mariadb-install-db`), a stray `mariadbd`, the
 * `--bootstrap` server an orphaned installer started (review 2026-09-30, S3). The caller
 * holds the lane lock and is about to rebuild, start on, or remove the datadir. A second
 * scan catches a child the first round's victim spawned meanwhile; anything still there
 * after it is a throw. Held by suite_mariadb_target_native leg (t).
 */
async function fenceLane(paths: SuiteMariadbPaths, limits: Deadlines): Promise<void> {
	for (let round = 0; round < 2; round++) {
		const pids = laneProcesses(paths).filter((pid) => !processGone(pid));
		if (pids.length === 0) return;
		await terminateProcesses(pids, `a process on the lane datadir ${paths.datadir}`, {
			termMs: limits.stopMs,
			killMs: limits.killMs,
		});
	}
	const left = laneProcesses(paths).filter((pid) => !processGone(pid));
	if (left.length > 0)
		throw new Error(
			`suite_mariadb: processes keep appearing on ${paths.datadir} (pid ${left.join(', ')}) — refusing to install, start or remove it under them`,
		);
}

function isRoot(): boolean {
	return typeof process.getuid === 'function' && process.getuid() === 0;
}

async function install(
	paths: SuiteMariadbPaths,
	bins: Binaries,
	limits = deadlines(),
): Promise<void> {
	// A datadir without the stamp is a partial install (a crash mid-way): rebuild it —
	// once nothing runs on it any more (an orphaned installer would write under us).
	await fenceLane(paths, limits);
	rmSync(paths.datadir, { recursive: true, force: true });
	const args = [
		bins.installDb,
		'--no-defaults',
		'--auth-root-authentication-method=normal',
		'--skip-test-db',
		`--datadir=${paths.datadir}`,
	];
	// Never `id -un`: GitHub runs the image as a uid with no passwd entry. Only uid 0
	// needs a name, and root always has one.
	if (isRoot()) args.push('--user=root');
	const proc = Bun.spawnSync(args, {
		stdout: 'pipe',
		stderr: 'pipe',
		timeout: limits.installMs,
		killSignal: 'SIGKILL',
	});
	writeFileSync(paths.installLog, `${proc.stdout.toString()}\n${proc.stderr.toString()}`);
	if (proc.exitedDueToTimeout) {
		rmSync(paths.datadir, { recursive: true, force: true });
		throw new Error(
			`suite_mariadb: mariadb-install-db did not finish within ${limits.installMs / 1000}s (killed):\n${tail(paths.installLog)}`,
		);
	}
	if (proc.exitCode !== 0) {
		rmSync(paths.datadir, { recursive: true, force: true });
		throw new Error(
			`suite_mariadb: mariadb-install-db failed (exit ${proc.exitCode}):\n${tail(paths.installLog)}`,
		);
	}
	writeFileSync(paths.installedStamp, `${new Date().toISOString()}\n`);
}

async function start(
	paths: SuiteMariadbPaths,
	bins: Binaries,
	limits = deadlines(),
): Promise<void> {
	// Alive but not answering (the pid-file server), or in no pid file at all (a stray, an
	// orphaned installer's bootstrap server): nothing else may hold the datadir we start on.
	await fenceLane(paths, limits);
	rmSync(paths.socket, { force: true });
	const args = [
		'--no-defaults',
		`--datadir=${paths.datadir}`,
		`--socket=${paths.socket}`,
		`--pid-file=${paths.pidFile}`,
		`--log-error=${paths.errorLog}`,
		'--skip-networking',
		// Per-user row counters (information_schema.USER_STATISTICS): what
		// scripts/ci/mariadb_tier.ts measures to prove the GATES wrote here.
		'--userstat=1',
		'--character-set-server=utf8mb4',
		'--collation-server=utf8mb4_unicode_ci',
	];
	if (isRoot()) args.push('--user=root');
	// DETACHED: the server belongs to the lane, not to this process — a later `bun test`
	// reuses it, `scripts/ci/suite_mariadb.ts stop` ends it.
	const child = spawn(bins.mariadbd, args, { detached: true, stdio: 'ignore' });
	child.unref();
	const pid = child.pid;
	const deadline = Date.now() + limits.startMs;
	while (Date.now() < deadline) {
		if (await ping(paths, limits)) return;
		if (pid === undefined || !pidAlive(pid))
			throw new Error(`suite_mariadb: mariadbd exited during start:\n${tail(paths.errorLog)}`);
		await Bun.sleep(250);
	}
	// Never leave the DETACHED server we spawned running behind a failed start (review
	// 2026-09-30, S3; leg (o)): the fence signals only processes on THIS datadir.
	const log = tail(paths.errorLog);
	await fenceLane(paths, limits);
	rmSync(paths.socket, { force: true });
	throw new Error(
		`suite_mariadb: mariadbd did not answer within ${limits.startMs / 1000} s:\n${log}`,
	);
}

const q = (name: string) => `\`${name}\``;
const lit = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;

/** The provisioning SQL. Idempotent. `reset` first strips every privilege of the suite user. */
function provisionSql(lane: string, reset: boolean): string {
	const user = `${lit(SUITE_MARIADB_USER)}@'localhost'`;
	const targets = SUITE_MARIADB_DATABASES();
	const granted = [...targets, UNMARKED_CONTROL_DB, FOREIGN_CONTROL_DB];
	const rows = [
		...targets.map((db) => `(${lit(db)}, ${lit(lane)}, ${lit(MARKER_PURPOSE)})`),
		`(${lit(FOREIGN_CONTROL_DB)}, ${lit(FOREIGN_SUITE_DB)}, ${lit(MARKER_PURPOSE)})`,
	];
	const marked = [...targets, FOREIGN_CONTROL_DB];
	return [
		// A server started before `--userstat` joined the start args still gets it.
		'SET GLOBAL userstat = ON;',
		`CREATE USER IF NOT EXISTS ${user} IDENTIFIED BY ${lit(SUITE_MARIADB_PASSWORD)};`,
		`ALTER USER ${user} IDENTIFIED BY ${lit(SUITE_MARIADB_PASSWORD)};`,
		...(reset ? [`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${user};`] : []),
		...granted.flatMap((db) => [
			`CREATE DATABASE IF NOT EXISTS ${q(db)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
			`GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX ON ${q(db)}.* TO ${user};`,
		]),
		// The 1049 control: granted, never created. No CREATE in its grant, so the suite
		// user cannot create it; anything else that did is undone here.
		`DROP DATABASE IF EXISTS ${q(GRANTED_ABSENT_CONTROL_DB)};`,
		`GRANT SELECT, INSERT, UPDATE, DELETE ON ${q(GRANTED_ABSENT_CONTROL_DB)}.* TO ${user};`,
		// The self-check's CREATE DATABASE target: must never exist (a leftover would
		// mean a widened grant once let it through).
		`DROP DATABASE IF EXISTS ${q(SELF_CHECK_DENIED_DB)};`,
		`CREATE DATABASE IF NOT EXISTS ${q(MARKER_SCHEMA)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
		`CREATE TABLE IF NOT EXISTS ${MARKER_TABLE} (
  database_name VARCHAR(64) NOT NULL PRIMARY KEY,
  suite_db VARCHAR(128) NOT NULL,
  purpose VARCHAR(32) NOT NULL CHECK (purpose = ${lit(MARKER_PURPOSE)}),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
		`DELETE FROM ${MARKER_TABLE} WHERE database_name NOT IN (${marked.map(lit).join(', ')});`,
		`INSERT INTO ${MARKER_TABLE} (database_name, suite_db, purpose) VALUES ${rows.join(', ')} ON DUPLICATE KEY UPDATE suite_db = VALUES(suite_db), purpose = VALUES(purpose);`,
		`GRANT SELECT ON ${MARKER_TABLE} TO ${user};`,
		'FLUSH PRIVILEGES;',
	].join('\n');
}

/** The database the self-check tries (and must fail) to CREATE as the suite user. */
const SELF_CHECK_DENIED_DB = 'dedalo_ts_test_probe_denied';

/** The errno of a client failure (`ERROR 1044 (42000) …`), or null when it succeeded. */
function clientErrno(result: { code: number; stderr: string }): number | null {
	if (result.code === 0) return null;
	return Number(result.stderr.match(/ERROR (\d+)/)?.[1] ?? -1);
}

/**
 * Prove the grants are the production posture, AS the diffusion user: CREATE DATABASE
 * denied (1044), the marker read-only (1142). A widened grant is a THROW.
 */
async function selfCheck(
	paths: SuiteMariadbPaths,
	anyTarget: string,
	limits = deadlines(),
): Promise<void> {
	const as = { user: SUITE_MARIADB_USER, password: SUITE_MARIADB_PASSWORD, database: anyTarget };
	const created = await runClient(
		paths,
		`CREATE DATABASE ${q(SELF_CHECK_DENIED_DB)};`,
		as,
		limits.clientMs,
	);
	if (clientErrno(created) !== 1044) {
		if (created.code === 0)
			await runClient(
				paths,
				`DROP DATABASE IF EXISTS ${q(SELF_CHECK_DENIED_DB)};`,
				undefined,
				limits.clientMs,
			);
		throw new Error(
			`suite_mariadb: self-check FAILED — the diffusion user must not CREATE DATABASE (expected errno 1044, got ${clientErrno(created) ?? 'success'}): ${created.stderr.trim()}`,
		);
	}
	const forged = await runClient(
		paths,
		`INSERT INTO ${MARKER_TABLE} (database_name, suite_db, purpose) VALUES ('zzd_forged', ${lit(paths.suiteDb)}, ${lit(MARKER_PURPOSE)});`,
		as,
		limits.clientMs,
	);
	if (clientErrno(forged) !== 1142) {
		if (forged.code === 0)
			await runClient(
				paths,
				`DELETE FROM ${MARKER_TABLE} WHERE database_name = 'zzd_forged';`,
				undefined,
				limits.clientMs,
			);
		throw new Error(
			`suite_mariadb: self-check FAILED — the marker must be read-only to the diffusion user (expected errno 1142, got ${clientErrno(forged) ?? 'success'}): ${forged.stderr.trim()}`,
		);
	}
}

function fsyncPath(path: string): void {
	const fd = openSync(path, 'r');
	try {
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}

let claimSequence = 0;

/**
 * Create the lane root MARKED — or accept it only if it is ALREADY marked. The suite
 * never adopts a directory it did not create.
 *
 * ATOMIC (review 2026-09-30, S3). `mkdir(root)` then `write(marker)` left, for a process
 * killed between the two, an UNMARKED root that every later ensure refused and every
 * sweep kept — the lane blocked for good. The root is now built under
 * `.<lane>.claim-<pid>-<n>` beside it, marked and fsynced, and RENAMED onto the lane
 * path: the path is absent or marked at every instant. EEXIST/ENOTEMPTY = another
 * process won; its root is marked, and this temp is removed. A killed claim's temp is
 * collected by the next sweep of the lane once its pid is dead (`laneLeftoverOf`).
 * Held by suite_mariadb_target_native leg (r).
 */
async function claimRoot(paths: SuiteMariadbPaths): Promise<void> {
	const base = dirname(paths.root);
	mkdirSync(base, { recursive: true });
	if (!existsSync(paths.root)) {
		const temp = join(base, `.${paths.suiteDb}.claim-${process.pid}-${claimSequence++}`);
		mkdirSync(temp);
		const marker = join(temp, SUITE_MARIADB_MARKER_FILE);
		writeFileSync(
			marker,
			`${JSON.stringify({ suite_db: paths.suiteDb, purpose: MARKER_PURPOSE, created_at: new Date().toISOString() })}\n`,
		);
		fsyncPath(marker);
		fsyncPath(temp);
		try {
			// Checked, because rename() REPLACES an empty directory: an empty root nobody
			// marked is refused below, never adopted.
			if (!existsSync(paths.root)) {
				renameSync(temp, paths.root);
				fsyncPath(base);
				return;
			}
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== 'EEXIST' && code !== 'ENOTEMPTY') {
				rmSync(temp, { recursive: true, force: true });
				throw error;
			}
		}
		rmSync(temp, { recursive: true, force: true });
	}
	if (!existsSync(paths.markerFile))
		throw new Error(
			`suite_mariadb: ${paths.root} exists but carries no ${basename(paths.markerFile)} — the suite never adopts a directory it did not create. Move it away.`,
		);
}

/** Take `suiteDb`'s lane root: create and mark it, or accept it only when already marked. */
export async function claimSuiteMariadbRoot(suiteDb?: string): Promise<SuiteMariadbPaths> {
	const paths = suiteMariadbPaths(suiteDb);
	await claimRoot(paths);
	return paths;
}

const ensured = new Map<string, Promise<SuiteMariadbPaths>>();

/**
 * Install (once), start (when not answering), provision and self-check this lane's
 * server. Idempotent; memoized per process; serialized across processes by the root's
 * lane lock (`suite_mariadb_lock.ts`). `reset` (the CLI's `start`) strips and re-grants the suite user.
 */
export function ensureSuiteMariadb(
	options: { suiteDb?: string; reset?: boolean; timeoutMs?: number } = {},
): Promise<SuiteMariadbPaths> {
	const paths = suiteMariadbPaths(options.suiteDb);
	const key = `${paths.suiteDb}|${options.reset === true}`;
	const cached = ensured.get(key);
	if (cached !== undefined) return cached;
	const work = ensureUncached(paths, options.reset === true, deadlines(options.timeoutMs));
	ensured.set(key, work);
	work.catch(() => ensured.delete(key));
	return work;
}

async function ensureUncached(
	paths: SuiteMariadbPaths,
	reset: boolean,
	limits: Deadlines,
): Promise<SuiteMariadbPaths> {
	const bins = binaries();
	await claimRoot(paths);
	const release = await acquireSuiteMariadbLock(paths.suiteDb, lockWaitMs(limits));
	try {
		mkdirSync(paths.socketDir, { recursive: true, mode: 0o700 });
		chmodSync(paths.socketDir, 0o700);
		const server = await probeServer(paths, limits);
		if (server.state === 'refusing')
			throw new Error(
				`suite_mariadb: the lane server on ${paths.socket} is ALIVE but refused the client: ${server.error} — not restarted (other processes of the lane may be using it)`,
			);
		if (server.state === 'down') {
			if (!existsSync(paths.installedStamp)) await install(paths, bins, limits);
			await start(paths, bins, limits);
		}
		await provisionLocked(paths, reset, limits);
		return paths;
	} finally {
		release();
	}
}

/** Provision + self-check. The caller holds the lane lock. */
async function provisionLocked(
	paths: SuiteMariadbPaths,
	reset: boolean,
	limits = deadlines(),
): Promise<void> {
	const provisioned = await runClient(
		paths,
		provisionSql(paths.suiteDb, reset),
		undefined,
		limits.clientMs,
	);
	if (provisioned.code !== 0)
		throw new Error(`suite_mariadb: provisioning failed: ${provisioned.stderr.trim()}`);
	await selfCheck(paths, SUITE_MARIADB_DATABASES()[0] as string, limits);
}

/**
 * Re-run provisioning and the self-check on a server that is ANSWERING (never starts
 * one), under the lane lock, without the privilege reset. Exactly the work every
 * process's first `ensureSuiteMariadb()` does on a warm lane — exported so a gate can
 * prove what that work does and does not move (suite_mariadb_target_native, leg h).
 */
export async function reprovisionSuiteMariadb(suiteDb?: string): Promise<void> {
	const paths = suiteMariadbPaths(suiteDb);
	if (!(await ping(paths)))
		throw new Error(`suite_mariadb: no server answering on ${paths.socket} — ensure it first`);
	const release = await acquireSuiteMariadbLock(paths.suiteDb, lockWaitMs(deadlines()));
	try {
		await provisionLocked(paths, false);
	} finally {
		release();
	}
}

/**
 * Stop this lane's server (SIGTERM, then wait) and remove its socket directory. Under
 * the lane lock when the root exists, so a stop never interleaves with another
 * process's ensure (install/start) on the same lane — held by
 * suite_mariadb_target_native leg (j): a stop issued while another process holds the
 * lock returns, and signals the server, only after that process released it.
 */
export async function stopSuiteMariadb(suiteDb?: string): Promise<{ stopped: boolean }> {
	const paths = suiteMariadbPaths(suiteDb);
	const release = existsSync(paths.root)
		? await acquireSuiteMariadbLock(paths.suiteDb, lockWaitMs(deadlines()))
		: () => {};
	try {
		return await stopLocked(paths);
	} finally {
		release();
	}
}

/** The stop itself. The caller holds the lane lock (or the lane has no root). */
async function stopLocked(paths: SuiteMariadbPaths): Promise<{ stopped: boolean }> {
	const pid = readPid(paths.pidFile);
	const stopped = pid !== undefined && isLaneServer(pid, paths);
	// The pid-file server AND anything else on the datadir: a sweep renames it next.
	await fenceLane(paths, deadlines());
	rmSync(paths.socketDir, { recursive: true, force: true });
	for (const key of [...ensured.keys()])
		if (key.startsWith(`${paths.suiteDb}|`)) ensured.delete(key);
	return { stopped };
}

/**
 * A lane's leftovers beside its root: `.<lane>.swept-<pid>-<ms>` (a root a sweep took off
 * its path and is deleting) and `.<lane>.claim-<pid>-<n>` (a root a claim is building).
 */
const LANE_LEFTOVER = /^\.(.+)\.(swept|claim)-(\d+)-\d+$/;

/**
 * The lane a leftover belongs to and whether it may be collected now — a sweep's always
 * (the marker, not the name, licenses the rm), a claim's only once its pid is dead (a
 * live one is still building it) — or null when `entry` is not a leftover.
 */
export function laneLeftoverOf(entry: string): { lane: string; collectable: boolean } | null {
	const match = LANE_LEFTOVER.exec(entry);
	if (match === null) return null;
	const [, lane, kind, pid] = match as unknown as [string, string, string, string];
	return { lane, collectable: kind === 'swept' || !pidAlive(Number(pid)) };
}

/**
 * The LOCKED half of a lane sweep: stop the lane's server and every other process on its
 * datadir, then RENAME the root off its path to `trash` (same directory, atomic) — both
 * while the lane lock is held, so the lane path is marked until the instant it is absent
 * and a process queued on the lock re-validates it and is told the lane was swept
 * (`suite_mariadb_lock.ts`). The caller has checked the marker; deleting `trash` is
 * the caller's (marker-last, after this returns and the lock is released).
 *
 * The sweep itself — collecting a killed sweep's or claim's leftovers, the refusal of an
 * unmarked root, the marker-last delete — is `sweepSuiteMariadb` in
 * suite_mariadb_lanes.ts: it LISTS the lane base, and every gate that acquires the
 * suite target imports this module, so a listing here would make each of them a walker
 * of a root it does not choose (census_derivation_tripwire, PUB-05 review 2026-09-30).
 */
export async function detachSuiteMariadbRoot(
	paths: SuiteMariadbPaths,
	trash: string,
): Promise<{ stopped: boolean }> {
	const release = await acquireSuiteMariadbLock(paths.suiteDb, lockWaitMs(deadlines()));
	try {
		const { stopped } = await stopLocked(paths);
		renameSync(paths.root, trash);
		return { stopped };
	} finally {
		release();
	}
}

/**
 * A gate's TEARDOWN of its scratch tables on a suite target: DROP each, then COUNT what
 * is left — residue asserted, never trusted (review 2026-09-30, S3). A refused DROP used
 * to be swallowed (`.catch(() => {})`) and the next run inherited the table. Throws on a
 * DROP error and on any table that survived; refuses a database the situations do not
 * declare and a name that is not a plain identifier. The caller closes its pools after.
 */
export async function dropSuiteScratchTables(database: string, tables: string[]): Promise<void> {
	if (!SUITE_MARIADB_DATABASES().includes(database))
		throw new Error(`suite_mariadb: '${database}' is not a suite target — refusing to DROP in it`);
	if (tables.length === 0) return;
	for (const table of tables)
		if (!/^[A-Za-z0-9_]+$/.test(table))
			throw new Error(`suite_mariadb: scratch table '${table}' is not a plain identifier`);
	const pool = getTargetPool(database);
	for (const table of tables) await pool.unsafe(`DROP TABLE IF EXISTS ${q(table)}`, []);
	const left = (await pool.unsafe(
		`SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (${tables.map(() => '?').join(', ')})`,
		[database, ...tables],
	)) as { name: string }[];
	if (left.length > 0)
		throw new Error(
			`suite_mariadb: scratch table(s) ${left.map((row) => row.name).join(', ')} survived the DROP on ${database}`,
		);
}

/** Rows the SUITE USER changed, as the server counts them (USER_STATISTICS). */
export interface SuiteUserWrites {
	rows_inserted: number;
	rows_deleted: number;
	rows_updated: number;
}

/**
 * The server's per-user row counters for the suite's diffusion user — the rows the
 * code under test actually inserted, deleted and updated here. Cumulative since the
 * server started; the caller diffs two reads. What it deliberately does NOT count:
 * root's provisioning (another user), and statements the server REFUSED (the
 * self-check's denied INSERT changes no row) — the two things a global `Com_*`
 * counter could not tell from a gate's write (measured 2026-09-30). Throws when the
 * server is not counting (`userstat` off), never answers a silent zero.
 */
export async function suiteUserWrites(suiteDb?: string): Promise<SuiteUserWrites> {
	// Two statements: read inside the aggregate over USER_STATISTICS, @@userstat
	// answers 0 even when it is ON (measured, MariaDB 12.2) — so it is read alone.
	const out = await suiteMariadbAdminQuery(
		`SELECT @@global.userstat; SELECT COALESCE(SUM(ROWS_INSERTED), 0), COALESCE(SUM(ROWS_DELETED), 0), COALESCE(SUM(ROWS_UPDATED), 0) FROM information_schema.USER_STATISTICS WHERE USER = ${lit(SUITE_MARIADB_USER)};`,
		suiteDb,
	);
	const [statLine = '', rowsLine = ''] = out.trim().split('\n');
	const userstat = Number(statLine.trim());
	const [inserted, deleted, updated] = rowsLine.trim().split('\t').map(Number);
	if (userstat !== 1)
		throw new Error(
			`suite_mariadb: the server is not counting per-user rows (@@global.userstat = ${statLine.trim()}) — provisioning sets it; was the server provisioned?`,
		);
	const writes = {
		rows_inserted: inserted as number,
		rows_deleted: deleted as number,
		rows_updated: updated as number,
	};
	for (const [name, value] of Object.entries(writes))
		if (!Number.isFinite(value))
			throw new Error(`suite_mariadb: USER_STATISTICS returned no number for ${name}: ${out}`);
	return writes;
}

/**
 * Every CONTACT the suite's diffusion user made with this server: connections opened
 * (`TOTAL_CONNECTIONS`) plus connections refused at the handshake (`DENIED_CONNECTIONS`
 * — an ungranted database answers 1044 there and never counts as opened). Cumulative
 * since the server started; the caller diffs two reads. Measured 2026-09-30 on MariaDB
 * 12.2: one query on a granted database moved TOTAL by 4 (the pool's connections) and
 * DENIED by 0; the same query on an ungranted name moved TOTAL by 0 and DENIED by 4; a
 * run that imports the pool module and opens nothing moved both by 0. Root's own
 * connections (this read, provisioning) are another user. Throws when the server is not
 * counting, never answers a silent zero.
 *
 * What scripts/ci/mariadb_tier.ts reads around the NO-CONTACT population: an armed
 * process that opens a pool without acquiring lands here, as this user.
 */
export async function suiteUserContacts(suiteDb?: string): Promise<number> {
	const out = await suiteMariadbAdminQuery(
		`SELECT @@global.userstat; SELECT COALESCE(SUM(TOTAL_CONNECTIONS), 0) + COALESCE(SUM(DENIED_CONNECTIONS), 0) FROM information_schema.USER_STATISTICS WHERE USER = ${lit(SUITE_MARIADB_USER)};`,
		suiteDb,
	);
	const [statLine = '', contactsLine = ''] = out.trim().split('\n');
	if (Number(statLine.trim()) !== 1)
		throw new Error(
			`suite_mariadb: the server is not counting per-user connections (@@global.userstat = ${statLine.trim()}) — provisioning sets it; was the server provisioned?`,
		);
	const contacts = Number(contactsLine.trim());
	if (contactsLine.trim() === '' || !Number.isFinite(contacts))
		throw new Error(`suite_mariadb: USER_STATISTICS returned no connection count: ${out}`);
	return contacts;
}

/** Where this lane's server is and whether it answers. */
export async function suiteMariadbStatus(suiteDb?: string): Promise<{
	paths: SuiteMariadbPaths;
	pid: number | undefined;
	running: boolean;
	answering: boolean;
}> {
	const paths = suiteMariadbPaths(suiteDb);
	const pid = readPid(paths.pidFile);
	return {
		paths,
		pid,
		running: pid !== undefined && isLaneServer(pid, paths),
		answering: existsSync(paths.root) ? await ping(paths) : false,
	};
}

/** Empty the acquisition ledger (the CLI's `start`: a stage counts only its own run). */
export function truncateAcquisitions(suiteDb?: string): void {
	const paths = suiteMariadbPaths(suiteDb);
	if (existsSync(paths.root)) writeFileSync(paths.acquisitions, '');
}
