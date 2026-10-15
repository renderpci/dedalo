/**
 * install_db_from_default_file (PHP installer_database_manager). Restores the
 * vendored seed dump into an EMPTY database: schema (30+ tables), extensions,
 * functions, indexes, the CORE ontologies (`CORE_ONTOLOGY_TLDS` — nothing else:
 * the seed is core-only, compiled from repo sources by seed_build.ts), the languages
 * thesaurus terms, root user (empty pw), and the default project/profiles. Then,
 * on the default connection, it completes the install's base: the derived search
 * stores (the seed ships them empty) and the core hierarchies.
 *
 * NO TEST FIXTURES. An installation receives no `test` TLD and no test3
 * playground: those belong to the SUITE database, which `bun run test:db:setup`
 * builds through this same door and then adds its fixtures to. Domain
 * ontologies (oh, tch…) are the installer's next step (ontology_install.ts),
 * never part of the restore.
 *
 * Gate: the target DB must be empty (no `matrix_users` table) — a populated DB
 * is never clobbered. The dump is plain-format SQL, gunzipped in-process and fed
 * to psql with ON_ERROR_STOP=1 AND `--single-transaction` (2026-10-11): the seed
 * holds no CONCURRENTLY, VACUUM or top-level BEGIN/COMMIT, so the whole restore
 * is ONE transaction — a failed or killed restore leaves the database exactly as
 * empty as it found it, and the terminal installer resumes by simply running it
 * again. PGPASSWORD + -h/-p make it remote-safe.
 *
 * THE TERMINAL INSTALLER'S DATABASE DOORS live here too (executor.ts):
 * inspectTargetDatabase (the preflight — a fresh terminal install only goes into
 * a database with ZERO user objects), seedComplete (the seed step's verify),
 * installDbFromSeedForInstall (the executor's seed step), resetDatabaseToEmpty
 * (`--abort` only) and holdInstallLock (the session advisory lock that makes one
 * install per database the SERVER's rule, not a file's).
 *
 * THE INSTALL STAMP binds a database to ONE terminal install: the seed's single
 * transaction also sets the database's comment to `dedalo_install_id:<install
 * id>` (installStampSql), so the stamp exists exactly when this install's seed
 * committed. The executor's seed step completes ONLY a database carrying its own
 * stamp and otherwise restores only into an EMPTY one; `--abort` resets ONLY a
 * database carrying its own stamp (an unstamped empty one has nothing to
 * reset). A database restored, or installed, by anything else between two runs
 * is therefore never adopted and never wiped.
 */

import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { CORE_ONTOLOGY_TLDS } from '../ontology/core_tlds.ts';
import { DEDALO_VERSION } from '../update/version.ts';
import { SEED_DUMP_PATH } from './paths.ts';
import { resolvePgBinary } from './pg_bin.ts';
import {
	connArgs,
	connFromConfig,
	type DbConnDescriptor,
	installSessionEnv,
	runPsql,
} from './pg_exec.ts';
import { refuseInstall } from './refuse.ts';

/** The seed restore's application_name — what a resume looks for on the server. */
export const SEED_APP_NAME = 'dedalo_install_seed';

/**
 * The application_name of a TERMINAL INSTALL's seed restore: SEED_APP_NAME +
 * `:<install id>` (56 characters, under the server's 63) — so the server
 * itself says WHICH install a running restore belongs to (campaign 3e F5): an
 * install may end its own orphaned restore, never another's.
 */
export function seedAppName(installId?: string): string {
	if (installId === undefined) return SEED_APP_NAME;
	assertInstallId(installId);
	return `${SEED_APP_NAME}:${installId}`;
}

/** Every installer psql session's application_name starts with this. */
export const INSTALL_APP_PREFIX = 'dedalo_install';

/** The database comment a terminal install's seed writes (see the header). */
export const INSTALL_STAMP_PREFIX = 'dedalo_install_id:';

/** An install id the stamp may carry (a UUID — never anything SQL could misread). */
const INSTALL_ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Refuse anything but an install id (it is spliced into SQL). */
function assertInstallId(installId: string): void {
	if (!INSTALL_ID_SHAPE.test(installId)) {
		refuseInstall('install.invalid_input', `not an install id: '${installId}'`);
	}
}

/** The SQL that stamps the current database with `installId` (appended to the seed's transaction). */
function installStampSql(installId: string): string {
	assertInstallId(installId);
	return `\nDO $stamp$ BEGIN EXECUTE format('COMMENT ON DATABASE %I IS %L', current_database(), '${INSTALL_STAMP_PREFIX}${installId}'); END $stamp$;\n`;
}

/** The step's answer on the ONLY path that returns: restored (every refusal throws). */
export interface DbRestoreResult {
	ok: true;
	msg: string;
}

/** Is the target DB empty (no matrix_users table)? */
async function targetIsEmpty(conn: DbConnDescriptor): Promise<boolean> {
	const probe = await runPsql(conn, ['-tAc', "SELECT to_regclass('public.matrix_users')"]);
	if (probe.exitCode !== 0) {
		// Cannot even query → treat as "not safely empty"; the caller reports it.
		return false;
	}
	// to_regclass returns the relation name when it exists, empty/NULL otherwise.
	return probe.stdout.trim() === '';
}

/** One returned (never thrown) store error as text. */
function errorText(error: unknown): string {
	if (typeof error === 'string') return error;
	return error instanceof Error ? error.message : JSON.stringify(error);
}

/**
 * The default-config half of the restore — everything that writes through the ENGINE'S
 * pool, which is guaranteed to point at the restored database only when no explicit
 * connection was given. Answers the step's sentence.
 *
 * ORDER IS LOAD-BEARING. The seed ships the derived search stores EMPTY
 * (seed_build.ts SEED_EMPTY_STORES), and the relation-index
 * reader THROWS `search.index_unavailable` on an empty store while relation data
 * exists (search_store.ts requireRelationIndex) — so the stores are filled
 * FIRST, through the engine's own door (the one a booting server runs), before
 * any engine write or read can touch them.
 */
export async function completeFreshInstall(): Promise<string> {
	// DERIVED SEARCH STORES — per-(store, table) refill of everything the seed
	// restored (db_assets.ts ensureSearchStores). Its errors are RETURNED (a
	// booting server logs and serves); an install whose search stores did not
	// build is not an install that worked, so here they refuse.
	const { ensureSearchStores } = await import('../db/db_assets.ts');
	const stores = await ensureSearchStores();
	if (stores.errors.length > 0) {
		refuseInstall(
			'install.step_failed',
			`Derived search stores could not be built: ${stores.errors.map(errorText).join(' | ')}`,
		);
	}
	// CORE HIERARCHIES (A7): Languages is ACTIVATED against the terms the seed
	// already ships in matrix_langs — never imported (hierarchy_activate.ts
	// header carries the measurement). Here, in the restore, so every surface
	// that restores the seed (the installer, install.sh, the suite builder) gets
	// it with no step of its own; a failure fails the restore — an install
	// without its languages thesaurus is not an install that worked (the door
	// itself refuses `install.step_failed`, naming each failed tld).
	const { activateCoreHierarchies } = await import('./hierarchy_activate.ts');
	const core = await activateCoreHierarchies(-1);
	return `Database installed from seed (core ontologies: ${CORE_ONTOLOGY_TLDS.join(', ')}) + derived search stores + core hierarchies activated (${core.activated.join(', ')}) — OK`;
}

/**
 * Restore the seed dump — ONE transaction (`--single-transaction`), named
 * SEED_APP_NAME on the server. No emptiness check here: the caller owns that
 * gate (installDbFromSeed's matrix_users check, or the terminal installer's
 * zero-object preflight). A failure throws `install.step_failed` with the
 * database rolled back to what it was.
 */
/*
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): a ONE-SHOT install procedure that
 * MUTATES THE MACHINE (a database restore). Gated by outcome in
 * test/unit/install_db_restore.test.ts and the install e2e.
 */
export async function restoreSeed(
	connection: DbConnDescriptor,
	seedPath: string = SEED_DUMP_PATH,
	/** The terminal installer's install id: stamped INSIDE the restore's one transaction. */
	stampInstallId?: string,
): Promise<void> {
	// Decompress the seed to a temp .sql and restore with `psql -f` — far more
	// robust than streaming ~14 MB through stdin (backpressure/EPIPE). The temp
	// file is always removed.
	const tmpSql = join(tmpdir(), `dedalo_seed_${process.pid}_${Date.now()}.sql`);
	const stamp = stampInstallId === undefined ? '' : installStampSql(stampInstallId);
	try {
		writeFileSync(
			tmpSql,
			Buffer.concat([gunzipSync(readFileSync(seedPath)), Buffer.from(stamp, 'utf8')]),
			{ mode: 0o600 },
		);
	} catch (error) {
		rmSync(tmpSql, { force: true });
		refuseInstall(
			'install.step_failed',
			`Cannot read/decompress seed: ${(error as Error).message}`,
			error,
		);
	}
	try {
		const restore = await runPsql(
			connection,
			['-v', 'ON_ERROR_STOP=1', '--single-transaction', '--quiet', '-f', tmpSql],
			{ appName: seedAppName(stampInstallId) },
		);
		if (restore.exitCode !== 0) {
			refuseInstall(
				'install.step_failed',
				`Restore failed (rolled back — the database is unchanged): ${restore.stderr || 'psql nonzero exit'}`,
			);
		}
	} finally {
		rmSync(tmpSql, { force: true });
	}
}

/** Restore the seed dump into an empty database. `conn` defaults to config.db. */
/*
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): a ONE-SHOT install procedure that
 * MUTATES THE MACHINE — config files, a database restore, root credentials, a
 * 126 MB hierarchy import, or a process restart. Blocked by DANGER, not by
 * fixture: the hermetic logic in the same subsystem (deriveLangConfig,
 * pgBinaryCandidates, the hierarchy_meta readers) IS gated
 * (test/unit/tier1_install_native.test.ts).
 */
export async function installDbFromSeed(
	conn?: DbConnDescriptor,
	/** The dump to restore — the vendored seed; a freshly BUILT one in its gate (seed_build_native). */
	seedPath: string = SEED_DUMP_PATH,
): Promise<DbRestoreResult> {
	const connection = conn ?? connFromConfig();

	// Empty-DB gate: never restore over an existing install.
	const reachable = await runPsql(connection, ['-tAc', 'SELECT 1']);
	if (reachable.exitCode !== 0) {
		refuseInstall('install.step_failed', `Database not reachable: ${reachable.stderr}`);
	}
	if (!(await targetIsEmpty(connection))) {
		refuseInstall(
			'install.state_conflict',
			'Database is not empty (matrix_users already exists) — restore refused',
		);
	}
	await restoreSeed(connection, seedPath);
	// Default-config path only: the search stores and the core
	// hierarchies go through the pool, which is guaranteed to point
	// at this DB only when no explicit conn was given.
	if (conn === undefined) return { ok: true, msg: await completeFreshInstall() };
	return {
		ok: true,
		msg: 'Database installed from seed — OK (explicit connection: derived search stores and core hierarchies are not completed here)',
	};
}

// ── the terminal installer's database doors ──────────────────────────────────

/** One scalar (trimmed stdout) from `conn`, or null when psql failed. */
async function scalar(
	conn: DbConnDescriptor,
	query: string,
	database?: string,
): Promise<string | null> {
	const run = await runPsql(conn, ['-tAc', query, '-v', 'ON_ERROR_STOP=1'], { database });
	return run.exitCode === 0 ? run.stdout.trim() : null;
}

/** The engine version a committed seed stamped (matrix_updates), or null. */
async function seededVersion(conn: DbConnDescriptor): Promise<string | null> {
	const present = await scalar(conn, "SELECT to_regclass('public.matrix_updates') IS NOT NULL");
	if (present !== 't') return null;
	const version = await scalar(
		conn,
		"SELECT data->>'dedalo_version' FROM matrix_updates WHERE data ? 'dedalo_version' ORDER BY string_to_array(data->>'dedalo_version', '.')::int[] DESC LIMIT 1",
	);
	return version === null || version === '' ? null : version;
}

/** What the terminal installer's preflight learns about its target database. */
export interface TargetDatabaseState {
	/** psql reached the server (the target, or the maintenance database). */
	reachable: boolean;
	exists: boolean;
	/**
	 * ZERO relations, routines, types and extra schemas outside the system
	 * schemas, extension members excluded. Stricter than "no matrix_users" — it is
	 * what makes `--abort`'s reset safe: every object present afterwards is the
	 * install's own.
	 */
	emptyForInstall: boolean;
	/** How many such objects. */
	userObjectCount: number;
	/** Up to 20 of their names. */
	userObjects: string[];
	extensions: string[];
	/** The backend pid of a seed restore running on it, or null. */
	seedRestoreRunning: number | null;
	/** The terminal install that restore belongs to (its application_name), null when unnamed. */
	seedRestoreInstallId: string | null;
	/** Backend pids of OTHER installer sessions (any `dedalo_install*` application name). */
	installSessions: number[];
	/** The terminal install id the database is stamped with (see the header), or null. */
	installStamp: string | null;
	/** The connecting role may stamp it (owns the database, or is a superuser). */
	canStamp: boolean;
}

/** Not a system schema (the catalog's own, toast, temp). */
const USER_NAMESPACE = `n.nspname NOT IN ('pg_catalog', 'information_schema')
	AND n.nspname NOT LIKE 'pg\\_toast%' AND n.nspname NOT LIKE 'pg\\_temp\\_%'`;

/** `<alias>` is not a member of an extension (pg_depend deptype 'e'). */
function notExtensionMember(catalog: string, oid: string): string {
	return `NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = '${catalog}'::regclass AND d.objid = ${oid} AND d.deptype = 'e')`;
}

/** Every user object of the database, `kind:name`, one per row. */
const USER_OBJECTS_SQL = `
	SELECT 'relation', format('%I.%I', n.nspname, c.relname) FROM pg_class c
	  JOIN pg_namespace n ON n.oid = c.relnamespace
	 WHERE ${USER_NAMESPACE} AND ${notExtensionMember('pg_class', 'c.oid')}
	UNION ALL
	SELECT 'routine', format('%I.%I', n.nspname, p.proname) FROM pg_proc p
	  JOIN pg_namespace n ON n.oid = p.pronamespace
	 WHERE ${USER_NAMESPACE} AND ${notExtensionMember('pg_proc', 'p.oid')}
	UNION ALL
	SELECT 'type', format('%I.%I', n.nspname, t.typname) FROM pg_type t
	  JOIN pg_namespace n ON n.oid = t.typnamespace
	 WHERE ${USER_NAMESPACE} AND t.typrelid = 0 AND NOT (t.typcategory = 'A' AND t.typelem <> 0)
	   AND ${notExtensionMember('pg_type', 't.oid')}
	UNION ALL
	SELECT 'schema', format('%I', n.nspname) FROM pg_namespace n
	 WHERE ${USER_NAMESPACE} AND n.nspname <> 'public' AND ${notExtensionMember('pg_namespace', 'n.oid')}`;

/** Parse `count\tname,name,…`. */
function objectSummary(line: string | null): { count: number; names: string[] } {
	if (line === null) return { count: -1, names: [] };
	const [count = '0', names = ''] = line.split('\t');
	return { count: Number(count), names: names === '' ? [] : names.split(',') };
}

/** The installer sessions on the target other than this process's own. */
async function installerSessions(
	conn: DbConnDescriptor,
	ownAppName: string | undefined,
): Promise<{ seed: number | null; seedInstallId: string | null; others: number[] }> {
	const own =
		ownAppName === undefined ? '' : ` AND application_name <> '${ownAppName.replace(/'/g, "''")}'`;
	const rows = await scalar(
		conn,
		`SELECT coalesce(string_agg(pid || ':' || application_name, ','), '') FROM pg_stat_activity
		  WHERE datname = current_database() AND pid <> pg_backend_pid()
		    AND application_name LIKE '${INSTALL_APP_PREFIX}%'${own}`,
	);
	const sessions = (rows ?? '')
		.split(',')
		.filter((row) => row !== '')
		.map((row) => ({
			pid: Number(row.slice(0, row.indexOf(':'))),
			app: row.slice(row.indexOf(':') + 1),
		}));
	const seed = sessions.find(
		(session) => session.app === SEED_APP_NAME || session.app.startsWith(`${SEED_APP_NAME}:`),
	);
	const owner = seed?.app.slice(SEED_APP_NAME.length + 1) ?? '';
	return {
		seed: seed?.pid ?? null,
		seedInstallId: INSTALL_ID_SHAPE.test(owner) ? owner : null,
		others: sessions.map((session) => session.pid),
	};
}

/**
 * The terminal installer's DATABASE PREFLIGHT: does the target exist, is it
 * empty for an install (zero user objects), which extensions predate the
 * install, and is any other installer session (a seed restore above all) still
 * running on it. Never writes. `ownAppName` = this process's PGAPPNAME, so its
 * own pool and psql sessions are not counted.
 */
export async function inspectTargetDatabase(
	conn: DbConnDescriptor,
	ownAppName?: string,
): Promise<TargetDatabaseState> {
	const absent: TargetDatabaseState = {
		reachable: false,
		exists: false,
		emptyForInstall: false,
		userObjectCount: 0,
		userObjects: [],
		extensions: [],
		seedRestoreRunning: null,
		seedRestoreInstallId: null,
		installSessions: [],
		installStamp: null,
		canStamp: false,
	};
	if ((await scalar(conn, 'SELECT 1')) === null) {
		const maintenance = await scalar(
			conn,
			`SELECT count(*) FROM pg_database WHERE datname = '${conn.database.replace(/'/g, "''")}'`,
			'postgres',
		);
		return { ...absent, reachable: maintenance !== null, exists: maintenance === '1' };
	}
	const objects = objectSummary(
		await scalar(
			conn,
			`SELECT count(*) || E'\\t' || coalesce(string_agg(name, ',') FILTER (WHERE rn <= 20), '')
			   FROM (SELECT name, row_number() OVER (ORDER BY name) AS rn
			           FROM (${USER_OBJECTS_SQL}) AS objects(kind, name)) AS ranked`,
		),
	);
	const extensions = await scalar(
		conn,
		"SELECT coalesce(string_agg(extname, ',' ORDER BY extname), '') FROM pg_extension",
	);
	const sessions = await installerSessions(conn, ownAppName);
	const canStamp = await scalar(
		conn,
		`SELECT pg_has_role(current_user, d.datdba, 'USAGE')
		        OR coalesce((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false)
		   FROM pg_database d WHERE d.datname = current_database()`,
	);
	return {
		reachable: true,
		exists: true,
		emptyForInstall: objects.count === 0,
		userObjectCount: objects.count,
		userObjects: objects.names,
		extensions: (extensions ?? '').split(',').filter((name) => name !== ''),
		seedRestoreRunning: sessions.seed,
		seedRestoreInstallId: sessions.seedInstallId,
		installSessions: sessions.others,
		installStamp: await installStampOf(conn),
		canStamp: canStamp === 't',
	};
}

/**
 * END THIS INSTALL'S SEED RESTORE on the server (campaign 3e F5): terminate
 * every backend named `seedAppName(installId)` on the target database and wait
 * (up to 5 s each) for it to be gone. The restore is ONE transaction, so the
 * server rolls it back and the database is as empty as the restore found it.
 * Called by the engine's own Ctrl-C path (its psql may die without its close
 * reaching the server) and by a resume/abort that HOLDS the install lock — no
 * live installer can then own that restore. Answers the pids it ended; never
 * touches a restore named for another install, or an unnamed one. Gated by
 * outcome in test/unit/install_resume_drill.test.ts (scenario F).
 */
export async function endSeedRestore(conn: DbConnDescriptor, installId: string): Promise<number[]> {
	const name = seedAppName(installId);
	// The terminate call sits in the SELECT list of the filtered rows — never in a
	// WHERE the planner could evaluate before the name filter.
	const ended = await scalar(
		conn,
		`SELECT coalesce(string_agg(pid::text, ',' ORDER BY pid) FILTER (WHERE ended), '')
		   FROM (SELECT pid, pg_terminate_backend(pid, 5000) AS ended
		           FROM (SELECT pid FROM pg_stat_activity
		                  WHERE datname = current_database() AND pid <> pg_backend_pid()
		                    AND application_name = '${name}' OFFSET 0) AS mine) AS done`,
	);
	return (ended ?? '')
		.split(',')
		.filter((pid) => pid !== '')
		.map(Number);
}

/** The install id the database's comment carries, or null (none, or not an install stamp). */
export async function installStampOf(conn: DbConnDescriptor): Promise<string | null> {
	const comment = await scalar(
		conn,
		"SELECT coalesce(shobj_description(d.oid, 'pg_database'), '') FROM pg_database d WHERE d.datname = current_database()",
	);
	if (comment === null || !comment.startsWith(INSTALL_STAMP_PREFIX)) return null;
	return comment.slice(INSTALL_STAMP_PREFIX.length);
}

/** How many user objects the database holds (-1 when it cannot be asked). */
async function userObjectCount(conn: DbConnDescriptor): Promise<number> {
	const count = await scalar(conn, `SELECT count(*) FROM (${USER_OBJECTS_SQL}) AS objects`);
	return count === null ? -1 : Number(count);
}

/**
 * The seed step's VERIFY: THIS install's committed seed (the database carries
 * its stamp — another install's stamp is a CONFLICT) of THIS engine whose engine
 * half (completeFreshInstall) also finished — matrix_users present,
 * matrix_updates stamped with DEDALO_VERSION, the derived relation index
 * filled, and every core
 * hierarchy USABLE (hierarchy_state.ts inspectHierarchy: active, active in the
 * thesaurus, ontology, targets, both roots — not a single registry field, which
 * activation writes first and in its own commit).
 */
export async function seedComplete(
	conn: DbConnDescriptor,
	installId: string,
): Promise<SeedVerdict> {
	const problem =
		(await stampProblem(conn, installId)) ??
		(await seedTablesProblem(conn)) ??
		(await engineHalfProblem(conn));
	return problem ?? { ok: true, detail: `seed ${DEDALO_VERSION} restored and completed` };
}

/** The seed verify's answer (a conflict: the database is another install's). */
export interface SeedVerdict {
	ok: boolean;
	detail: string;
	conflict?: boolean;
}

/** Not this install's stamp: absent (not ok), or another install's (a CONFLICT). */
async function stampProblem(
	conn: DbConnDescriptor,
	installId: string,
): Promise<SeedVerdict | null> {
	const stamp = await installStampOf(conn);
	if (stamp === installId) return null;
	return stamp === null
		? { ok: false, detail: "the database does not carry this install's stamp" }
		: {
				ok: false,
				conflict: true,
				detail: `the database is stamped by another install (${stamp})`,
			};
}

/** The seed's own tables: matrix_users present, matrix_updates stamped with this engine. */
async function seedTablesProblem(conn: DbConnDescriptor): Promise<SeedVerdict | null> {
	if ((await scalar(conn, "SELECT to_regclass('public.matrix_users') IS NOT NULL")) !== 't') {
		return { ok: false, detail: 'matrix_users is missing (no seed restored)' };
	}
	const version = await seededVersion(conn);
	return version === DEDALO_VERSION
		? null
		: {
				ok: false,
				detail: `the seed is stamped ${version ?? 'nothing'}, this engine is ${DEDALO_VERSION}`,
			};
}

/** completeFreshInstall's work: the relation index, every core hierarchy usable. */
async function engineHalfProblem(conn: DbConnDescriptor): Promise<SeedVerdict | null> {
	if ((await scalar(conn, 'SELECT EXISTS (SELECT 1 FROM matrix_relation_index)')) !== 't') {
		return { ok: false, detail: 'the derived relation index is empty' };
	}
	const { coreHierarchiesProblem } = await import('./hierarchy_activate.ts');
	const hierarchies = await coreHierarchiesProblem();
	return hierarchies === null ? null : { ok: false, detail: hierarchies };
}

/**
 * The terminal installer's seed step, decided by the database itself (its
 * stamp), never by what an earlier run recorded:
 *  - stamped by THIS install: the seed committed in an earlier run (its single
 *    transaction made it whole) — completeFreshInstall converges, so it is
 *    simply run again;
 *  - stamped by another install: refused;
 *  - unstamped and EMPTY (zero user objects): the restore, stamped;
 *  - unstamped and not empty: refused — whatever is there is not this
 *    install's (a backup restored, an earlier install, another tool).
 * Re-checked on EVERY run of the step, fresh or resumed. Without an install id
 * (installDbFromSeed: the suite builder, the seed compiler) a seeded database is
 * refused.
 */
/*
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): mutates the machine (database restore).
 */
export async function installDbFromSeedForInstall(installId: string): Promise<DbRestoreResult> {
	const connection = connFromConfig();
	const db = connection.database;
	const stamp = await installStampOf(connection);
	if (stamp === installId) {
		const version = await seededVersion(connection);
		if (version !== DEDALO_VERSION) {
			refuseInstall(
				'install.state_conflict',
				`database '${db}' carries this install's seed stamped ${version ?? 'nothing'}; this engine is ${DEDALO_VERSION}`,
			);
		}
		return {
			ok: true,
			msg: `${await completeFreshInstall()} (seed committed by an earlier run — completed)`,
		};
	}
	if (stamp !== null) {
		refuseInstall(
			'install.state_conflict',
			`database '${db}' was seeded by another install (${stamp}) — refusing to touch it`,
		);
	}
	const objects = await userObjectCount(connection);
	if (objects !== 0) {
		refuseInstall(
			'install.state_conflict',
			objects < 0
				? `database '${db}' cannot be inspected — refusing to restore into it`
				: `database '${db}' is not empty (${objects} objects) and was not seeded by this install — refusing to restore into it`,
		);
	}
	await restoreSeed(connection, SEED_DUMP_PATH, installId);
	return { ok: true, msg: await completeFreshInstall() };
}

/**
 * `--abort` ONLY: put the database back to the empty state the preflight
 * recorded — in ONE transaction: every extension the install added (CASCADE),
 * every schema it created, then every remaining relation, routine and type in
 * `public`, and the install stamp removed. The schema `public` itself, its owner
 * and grants stay; the database is never dropped.
 *
 * Only a database carrying THIS install's stamp is reset (checked again inside
 * the reset's own transaction): its objects are the seed's, restored into a
 * database the step proved empty. An unstamped EMPTY database has nothing to
 * reset (a seed that never committed); anything else is refused.
 */
/*
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): mutates the machine (drops database
 * objects). Gated by outcome in test/unit/install_resume_drill.test.ts.
 */
export async function resetDatabaseToEmpty(
	conn: DbConnDescriptor,
	preexistingExtensions: readonly string[],
	installId: string,
): Promise<string> {
	assertInstallId(installId);
	const stamp = await installStampOf(conn);
	if (stamp !== installId) {
		const objects = await userObjectCount(conn);
		if (objects === 0)
			return `database '${conn.database}' holds nothing of this install — nothing to reset`;
		refuseInstall(
			'install.state_conflict',
			`database '${conn.database}' is not stamped by this install (${stamp ?? 'no stamp'}; ${objects} objects) — refusing to reset it`,
		);
	}
	const keep =
		preexistingExtensions.map((name) => `'${name.replace(/'/g, "''")}'`).join(',') || "''";
	const expected = `${INSTALL_STAMP_PREFIX}${installId}`;
	const sql = `BEGIN;
DO $reset$
DECLARE r record;
BEGIN
  IF coalesce((SELECT shobj_description(d.oid, 'pg_database') FROM pg_database d
                WHERE d.datname = current_database()), '') <> '${expected}' THEN
    RAISE EXCEPTION 'the database is not stamped by this install — refusing to reset it';
  END IF;
  FOR r IN SELECT extname FROM pg_extension WHERE extname NOT IN (${keep}) LOOP
    EXECUTE format('DROP EXTENSION IF EXISTS %I CASCADE', r.extname);
  END LOOP;
  FOR r IN SELECT n.nspname FROM pg_namespace n WHERE ${USER_NAMESPACE} AND n.nspname <> 'public'
             AND ${notExtensionMember('pg_namespace', 'n.oid')} LOOP
    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', r.nspname);
  END LOOP;
  FOR r IN SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
               AND ${notExtensionMember('pg_class', 'c.oid')} LOOP
    EXECUTE format(CASE r.relkind WHEN 'v' THEN 'DROP VIEW IF EXISTS public.%I CASCADE'
                                  WHEN 'm' THEN 'DROP MATERIALIZED VIEW IF EXISTS public.%I CASCADE'
                                  WHEN 'f' THEN 'DROP FOREIGN TABLE IF EXISTS public.%I CASCADE'
                                  ELSE 'DROP TABLE IF EXISTS public.%I CASCADE' END, r.relname);
  END LOOP;
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind = 'S' AND ${notExtensionMember('pg_class', 'c.oid')} LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS public.%I CASCADE', r.relname);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND ${notExtensionMember('pg_proc', 'p.oid')} LOOP
    EXECUTE format('DROP ROUTINE IF EXISTS %s CASCADE', r.sig);
  END LOOP;
  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
             WHERE n.nspname = 'public' AND t.typrelid = 0 AND NOT (t.typcategory = 'A' AND t.typelem <> 0)
               AND ${notExtensionMember('pg_type', 't.oid')} LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
  END LOOP;
  EXECUTE format('COMMENT ON DATABASE %I IS NULL', current_database());
END
$reset$;
COMMIT;`;
	const run = await runPsql(conn, ['-v', 'ON_ERROR_STOP=1', '--quiet'], { stdin: sql });
	if (run.exitCode !== 0) {
		refuseInstall('install.step_failed', `Database reset failed (rolled back): ${run.stderr}`);
	}
	const after = await inspectTargetDatabase(conn);
	if (!after.emptyForInstall) {
		refuseInstall(
			'install.step_failed',
			`Database reset left ${after.userObjectCount} object(s) (e.g. ${after.userObjects.slice(0, 5).join(', ')})`,
		);
	}
	return `database '${conn.database}' reset to empty (extensions kept: ${preexistingExtensions.join(', ') || 'none'})`;
}

/** A held install lock; `release` ends the holding session (the server frees the lock). */
export interface InstallLockHandle {
	release(): Promise<void>;
}

/**
 * ONE INSTALL PER DATABASE, decided by the SERVER: a session advisory lock on
 * the target database, held by a dedicated psql whose stdin this process keeps
 * open. When this process dies — however it dies — psql reads EOF, exits, and
 * Postgres frees the lock. So a crashed run never leaves a lock behind (the
 * stale-file problem of a lock in a container's private dir), and two installs
 * aimed at one database from two private directories cannot both pass the
 * preflight. Answers null when another session holds it.
 */
/*
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): spawns a long-lived database session.
 */
export async function holdInstallLock(
	conn: DbConnDescriptor,
	/** This process's own installer application name (so its preflight does not count the lock). */
	appName: string,
): Promise<InstallLockHandle | null> {
	const child = Bun.spawn(
		[
			resolvePgBinary('psql'),
			`--dbname=${conn.database}`,
			...connArgs(conn),
			'-tAq',
			'-v',
			'ON_ERROR_STOP=1',
		],
		{
			stdin: 'pipe',
			stdout: 'pipe',
			stderr: 'pipe',
			env: installSessionEnv(conn, appName),
		},
	);
	child.stdin.write("SELECT pg_try_advisory_lock(hashtext('dedalo_install'));\n");
	await child.stdin.flush();
	const reader = child.stdout.getReader();
	let answer = '';
	while (!answer.includes('\n')) {
		const chunk = await reader.read();
		if (chunk.done) break;
		answer += new TextDecoder().decode(chunk.value);
	}
	reader.releaseLock();
	const release = async (): Promise<void> => {
		await child.stdin.end();
		await child.exited;
	};
	if (answer.trim() !== 't') {
		await release();
		if (answer.trim() === 'f') return null;
		refuseInstall(
			'install.step_failed',
			`Cannot take the install lock on '${conn.database}': ${(await new Response(child.stderr).text()).trim() || 'psql failed'}`,
		);
	}
	return { release };
}
