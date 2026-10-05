/**
 * SUITE DATABASE ARMING — may a TEST process open this database?
 *
 * The suite reaches its own databases only because the bun test preloads
 * (`test/preload/*.ts`) repoint `DB_NAME`, the vector database and the diffusion
 * MariaDB before anything imports the config. They are wired through
 * `bunfig.toml` at the repo root, and Bun reads `bunfig.toml` from the CURRENT
 * DIRECTORY. A `bun test` started anywhere else — a scratch worktree, an agent's
 * scratchpad, another checkout — ran with no preload at all, and every test that
 * writes wrote into the INSTALLATION's databases (measured 2026-10-02: the same
 * test resolved `dedalo_mib_v7_test` from the repo root and `dedalo_mib_v7` from
 * a scratch directory; `dd128census_*` Time Machine rows were found in the app
 * database). 234 of the 302 unit test files that write carry no guard of their
 * own; they rely on the preload.
 *
 * So the guard lives where every one of them must pass: the pools
 * (`src/core/db/postgres.ts` buildSqlOptions, `src/ai/rag/vector_store.ts`,
 * `src/diffusion/targets/mariadb/db.ts`). In a TEST process — `NODE_ENV=test`,
 * which `bun test` sets and every child it spawns inherits — a pool refuses to
 * build when:
 *
 *   1. the suite preload never ran in this process or the parent that composed
 *      its environment: `DEDALO_TEST_DATABASE`, the name the preload pins, is
 *      absent from the PROCESS environment (a bare `Bun.spawn` passes the LAUNCH
 *      environment, so its children lose the pin too — and would otherwise read
 *      the installation's ../private/.env); or
 *   2. (matrix database) the database IS the application database named in
 *      `../private/.env` — whatever the pin says.
 *
 * A child a test deliberately points elsewhere (a shard, a scratch install
 * database, an operator script with the pin inherited) is allowed: the rule is
 * "a test never opens the installation's data", not "a test opens one name".
 *
 * The explicit opt-out is `DEDALO_TEST_DB_DISABLE=true` in the PROCESS
 * environment — the same place the preload reads it — never in
 * ../private/.env, where a line would disarm the guard for every run.
 *
 * Outside a test process (`NODE_ENV` anything but `test` — every server, script
 * and CLI) the answer is always "allowed": the guard can never stop an
 * installation. Limit, stated: `NODE_ENV=production bun test` disarms it — a
 * deliberate act, not an accident of the working directory.
 * Gate: test/unit/test_db_marker_tripwire.test.ts rule 9.
 */

import { privateFileValue } from './env.ts';

/** What the decision reads; injectable so the gate can drive every branch. */
export interface SuiteDatabaseEnv {
	readonly nodeEnv: string | undefined;
	/** `DEDALO_TEST_DATABASE` from the PROCESS environment (the preload's pin). */
	readonly armedDatabase: string | undefined;
	/** `DEDALO_TEST_DB_DISABLE` from the PROCESS environment. */
	readonly disabled: string | undefined;
	/** The installation's database as `../private/.env` names it (never process.env). */
	readonly applicationDatabase: string | undefined;
}

/**
 * The application database `../private/.env` names — the FILE values parsed once
 * at load (no I/O here: this runs on every pool build, request paths included).
 * Undefined where there is no file (the hosted CI tiers compose their env): rule 2
 * is then inert and rule 1 alone guards a database that is disposable anyway.
 */
function envFileDatabase(): string | undefined {
	const name = privateFileValue('DB_NAME');
	return name === undefined || name === '' ? undefined : name;
}

/** The decision's inputs as this process sees them. */
export function currentSuiteDatabaseEnv(): SuiteDatabaseEnv {
	return {
		nodeEnv: process.env.NODE_ENV,
		armedDatabase: process.env.DEDALO_TEST_DATABASE,
		disabled: process.env.DEDALO_TEST_DB_DISABLE,
		applicationDatabase: envFileDatabase(),
	};
}

/**
 * Is this a TEST process (`bun test` sets `NODE_ENV=test`; its children inherit it)?
 * No opt-out: callers use it to keep a test away from the installation's OUTSIDE world
 * (the publication-host agent door), which `DEDALO_TEST_DB_DISABLE` was never meant to open.
 */
export function isTestProcess(env: SuiteDatabaseEnv = currentSuiteDatabaseEnv()): boolean {
	return env.nodeEnv === 'test';
}

/** Is the guard live for this process? Only inside a test, and not opted out. */
function guardLive(env: SuiteDatabaseEnv): boolean {
	return env.nodeEnv === 'test' && env.disabled !== 'true';
}

function refusal(pool: string, target: string, why: string): string {
	return (
		`REFUSING to open ${pool} '${target}' from a test process: ${why}. ` +
		'Run `bun test` from the repository root (bunfig.toml holds the preload that points the suite at its own ' +
		'databases), pass a spawned child `env: { ...process.env }`, or set DEDALO_TEST_DB_DISABLE=true in the ' +
		'environment if you really mean to run the suite against this database.'
	);
}

const NOT_ARMED =
	'the suite preload never ran in this process or the parent that composed its environment ' +
	'(DEDALO_TEST_DATABASE is unset), so the configured INSTALLATION target would be used';

/**
 * Why the matrix database `database` may NOT be opened by this process, or null
 * when it may. The sentence names the cause and the fix; nothing in it is secret.
 */
export function suiteDatabaseRefusal(
	database: string,
	env: SuiteDatabaseEnv = currentSuiteDatabaseEnv(),
): string | null {
	if (!guardLive(env)) return null;
	if (env.armedDatabase === undefined) return refusal('database', database, NOT_ARMED);
	if (database === env.applicationDatabase) {
		return refusal('database', database, 'it is the APPLICATION database named in ../private/.env');
	}
	return null;
}

/**
 * Why a SIDE pool (`vector database`, `diffusion MariaDB database`) may NOT be
 * opened, or null. Rule 1 only: those pools have their own suite repoint and
 * marker, which a preload-less process never arms.
 */
export function suitePoolRefusal(
	pool: string,
	target: string,
	env: SuiteDatabaseEnv = currentSuiteDatabaseEnv(),
): string | null {
	if (!guardLive(env) || env.armedDatabase !== undefined) return null;
	return refusal(pool, target, NOT_ARMED);
}
