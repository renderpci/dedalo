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
 * start|stop|status|sweep. The shard runner's teardown is suite_mariadb_lanes.ts.
 */

import { spawn } from 'node:child_process';
import {
	appendFileSync,
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { basename, dirname } from 'node:path';
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

function pidAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
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
async function runClient(
	paths: SuiteMariadbPaths,
	sql: string,
	as: { user: string; password?: string; database?: string } = { user: 'root' },
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
	proc.stdin.write(sql);
	await proc.stdin.end();
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { code, stdout, stderr };
}

/** Root query over the lane's socket; tab-separated rows. Throws on a client error. */
export async function suiteMariadbAdminQuery(sql: string, suiteDb?: string): Promise<string> {
	const paths = suiteMariadbPaths(suiteDb);
	if (!suiteSocketPresent(paths.suiteDb))
		throw new Error(`suite_mariadb: no server socket at ${paths.socket} — start it first`);
	const result = await runClient(paths, sql);
	if (result.code !== 0)
		throw new Error(
			`suite_mariadb: admin query failed (exit ${result.code}): ${result.stderr.trim()}`,
		);
	return result.stdout;
}

async function ping(paths: SuiteMariadbPaths): Promise<boolean> {
	if (!suiteSocketPresent(paths.suiteDb)) return false;
	return (await runClient(paths, 'SELECT 1;')).code === 0;
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

async function stopPid(pid: number, paths: SuiteMariadbPaths, waitMs = 30_000): Promise<void> {
	if (!isLaneServer(pid, paths)) return;
	process.kill(pid, 'SIGTERM');
	const deadline = Date.now() + waitMs;
	while (pidAlive(pid) && Date.now() < deadline) await Bun.sleep(100);
	if (pidAlive(pid)) process.kill(pid, 'SIGKILL');
}

function isRoot(): boolean {
	return typeof process.getuid === 'function' && process.getuid() === 0;
}

async function install(paths: SuiteMariadbPaths, bins: Binaries): Promise<void> {
	// A datadir without the stamp is a partial install (a crash mid-way): rebuild it.
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
	const proc = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' });
	writeFileSync(paths.installLog, `${proc.stdout.toString()}\n${proc.stderr.toString()}`);
	if (proc.exitCode !== 0) {
		rmSync(paths.datadir, { recursive: true, force: true });
		throw new Error(
			`suite_mariadb: mariadb-install-db failed (exit ${proc.exitCode}):\n${tail(paths.installLog)}`,
		);
	}
	writeFileSync(paths.installedStamp, `${new Date().toISOString()}\n`);
}

async function start(paths: SuiteMariadbPaths, bins: Binaries): Promise<void> {
	const stale = readPid(paths.pidFile);
	if (stale !== undefined) await stopPid(stale, paths); // alive but not answering: replace it
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
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		if (await ping(paths)) return;
		if (pid === undefined || !pidAlive(pid))
			throw new Error(`suite_mariadb: mariadbd exited during start:\n${tail(paths.errorLog)}`);
		await Bun.sleep(250);
	}
	throw new Error(`suite_mariadb: mariadbd did not answer within 60 s:\n${tail(paths.errorLog)}`);
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
async function selfCheck(paths: SuiteMariadbPaths, anyTarget: string): Promise<void> {
	const as = { user: SUITE_MARIADB_USER, password: SUITE_MARIADB_PASSWORD, database: anyTarget };
	const created = await runClient(paths, `CREATE DATABASE ${q(SELF_CHECK_DENIED_DB)};`, as);
	if (clientErrno(created) !== 1044) {
		if (created.code === 0)
			await runClient(paths, `DROP DATABASE IF EXISTS ${q(SELF_CHECK_DENIED_DB)};`);
		throw new Error(
			`suite_mariadb: self-check FAILED — the diffusion user must not CREATE DATABASE (expected errno 1044, got ${clientErrno(created) ?? 'success'}): ${created.stderr.trim()}`,
		);
	}
	const forged = await runClient(
		paths,
		`INSERT INTO ${MARKER_TABLE} (database_name, suite_db, purpose) VALUES ('zzd_forged', ${lit(paths.suiteDb)}, ${lit(MARKER_PURPOSE)});`,
		as,
	);
	if (clientErrno(forged) !== 1142) {
		if (forged.code === 0)
			await runClient(paths, `DELETE FROM ${MARKER_TABLE} WHERE database_name = 'zzd_forged';`);
		throw new Error(
			`suite_mariadb: self-check FAILED — the marker must be read-only to the diffusion user (expected errno 1142, got ${clientErrno(forged) ?? 'success'}): ${forged.stderr.trim()}`,
		);
	}
}

/**
 * Create the lane root and mark it — or accept it only if it is ALREADY marked. The
 * suite never adopts a directory it did not create. A concurrent creator gets a few
 * seconds to write its marker (the window between its mkdir and its write).
 */
async function claimRoot(paths: SuiteMariadbPaths): Promise<void> {
	mkdirSync(dirname(paths.root), { recursive: true });
	let created = false;
	try {
		mkdirSync(paths.root);
		created = true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
	}
	if (created) {
		writeFileSync(
			paths.markerFile,
			`${JSON.stringify({ suite_db: paths.suiteDb, purpose: MARKER_PURPOSE, created_at: new Date().toISOString() })}\n`,
		);
		return;
	}
	const deadline = Date.now() + 5_000;
	while (!existsSync(paths.markerFile)) {
		if (Date.now() > deadline)
			throw new Error(
				`suite_mariadb: ${paths.root} exists but carries no ${basename(paths.markerFile)} — the suite never adopts a directory it did not create. Move it away.`,
			);
		await Bun.sleep(100);
	}
}

const ensured = new Map<string, Promise<SuiteMariadbPaths>>();

/**
 * Install (once), start (when not answering), provision and self-check this lane's
 * server. Idempotent; memoized per process; serialized across processes by the root's
 * lane lock (`suite_mariadb_lock.ts`). `reset` (the CLI's `start`) strips and re-grants the suite user.
 */
export function ensureSuiteMariadb(
	options: { suiteDb?: string; reset?: boolean } = {},
): Promise<SuiteMariadbPaths> {
	const paths = suiteMariadbPaths(options.suiteDb);
	const key = `${paths.suiteDb}|${options.reset === true}`;
	const cached = ensured.get(key);
	if (cached !== undefined) return cached;
	const work = ensureUncached(paths, options.reset === true);
	ensured.set(key, work);
	work.catch(() => ensured.delete(key));
	return work;
}

async function ensureUncached(
	paths: SuiteMariadbPaths,
	reset: boolean,
): Promise<SuiteMariadbPaths> {
	const bins = binaries();
	await claimRoot(paths);
	const release = await acquireSuiteMariadbLock(paths.suiteDb);
	try {
		mkdirSync(paths.socketDir, { recursive: true, mode: 0o700 });
		chmodSync(paths.socketDir, 0o700);
		if (!(await ping(paths))) {
			if (!existsSync(paths.installedStamp)) await install(paths, bins);
			await start(paths, bins);
		}
		await provisionLocked(paths, reset);
		return paths;
	} finally {
		release();
	}
}

/** Provision + self-check. The caller holds the lane lock. */
async function provisionLocked(paths: SuiteMariadbPaths, reset: boolean): Promise<void> {
	const provisioned = await runClient(paths, provisionSql(paths.suiteDb, reset));
	if (provisioned.code !== 0)
		throw new Error(`suite_mariadb: provisioning failed: ${provisioned.stderr.trim()}`);
	await selfCheck(paths, SUITE_MARIADB_DATABASES()[0] as string);
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
	const release = await acquireSuiteMariadbLock(paths.suiteDb);
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
	const release = existsSync(paths.root) ? await acquireSuiteMariadbLock(paths.suiteDb) : () => {};
	try {
		const pid = readPid(paths.pidFile);
		const stopped = pid !== undefined && isLaneServer(pid, paths);
		if (pid !== undefined) await stopPid(pid, paths);
		rmSync(paths.socketDir, { recursive: true, force: true });
		for (const key of [...ensured.keys()])
			if (key.startsWith(`${paths.suiteDb}|`)) ensured.delete(key);
		return { stopped };
	} finally {
		release();
	}
}

/**
 * SWEEP a lane: stop its server and delete its whole root (datadir, logs, ledger) —
 * for a disposable lane (a shard clone) or a rebuild (`test:db:setup`). Deletes ONLY a
 * root that carries `.dedalo_test_mariadb`, the file the suite writes when it creates
 * one; any other directory at that path is refused, loudly, untouched (the media
 * root's rule). A lane with no root is a no-op.
 */
export async function sweepSuiteMariadb(
	suiteDb?: string,
): Promise<{ stopped: boolean; removed: boolean }> {
	const paths = suiteMariadbPaths(suiteDb);
	if (!existsSync(paths.root)) {
		rmSync(paths.socketDir, { recursive: true, force: true });
		return { stopped: false, removed: false };
	}
	if (!existsSync(paths.markerFile))
		throw new Error(
			`suite_mariadb: REFUSING to sweep ${paths.root} — it carries no ${SUITE_MARIADB_MARKER_FILE}, so the suite did not create it. Nothing was stopped or deleted.`,
		);
	const { stopped } = await stopSuiteMariadb(paths.suiteDb);
	rmSync(paths.root, { recursive: true, force: true });
	return { stopped, removed: true };
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
