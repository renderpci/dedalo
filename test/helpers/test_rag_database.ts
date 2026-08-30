/**
 * THE ONE PLACE THE SUITE'S VECTOR DATABASE IS DERIVED AND BUILT — the third
 * sibling of `test/helpers/test_database.ts` (the matrix database) and
 * `test/helpers/test_media_root.ts` (the media tree), for the surface those two
 * never covered: the pgvector store.
 *
 * THE DEFECT (audit 2026-08-26, REMEDIATION P1-16; measured 2026-08-29/30).
 * `src/ai/rag/vector_store.ts` opens `ragSql`, a pool of its OWN, on a database
 * resolved as `DEDALO_RAG_DB_NAME ?? RAG_DB_NAME`. On this machine that is
 * `dedalo7_rag` — a REAL INSTALLATION INDEX — and NOTHING in `test/preload/`
 * repointed it. So every `bun test` that touched `test/unit/rag_*.test.ts`
 * upserted rows, created partitions and ran `DELETE FROM rag_embeddings`
 * against the installation's semantic index. The failing INSERT those gates
 * produce today is not merely a missing sidecar: it is the proof the suite
 * writes there.
 *
 * THE DERIVATION: `<suite matrix database>_rag`.
 *
 * KEYED BY THE SUITE DATABASE, exactly as the media tree is, and for the same
 * reason — the three are ONE fixture. An embedding row names a matrix record by
 * `(section_tipo, section_id)`; a media file is named by a `files_info` row.
 * Point `DEDALO_TEST_DATABASE` at a second suite database and you get a second
 * vector index too, instead of one index whose rows point at another corpus's
 * ids. It is also why a rebuild of the matrix database rebuilds this one in the
 * same command (`scripts/test_db_setup.ts`).
 *
 * WHAT THIS MODULE MAY IMPORT at module scope — `src/config/env.ts` and the
 * config CATALOG (`src/config/catalog/ai.ts`: a frozen data literal behind a
 * type-only import, no side effect, no config freeze), and nothing else. It is
 * loaded by a preload, i.e. before the process is repointed, and
 * `src/ai/rag/test_rag_db.ts` (the marker writer) reaches `src/config/config.ts`
 * through `core/errors/index.ts` -> `log.ts` -> `core/api/counters.ts` ->
 * `core/security/session_store.ts` -> `core/media/protection.ts`: importing it
 * FREEZES `DB_NAME` and the media root at the installation's values, and on that
 * same edge `session_store.ts` opens the sqlite session store at a path resolved
 * at import. It does NOT reach `src/core/db/postgres.ts` — the matrix pool is
 * neither built nor connected by that graph (measured 2026-08-30: `bun build
 * src/ai/rag/test_rag_db.ts --target=bun` contains no `buildSqlOptions` and no
 * `core/db/postgres` marker). The config/session latch alone is the reason.
 * Everything that needs that module is therefore reached through a DYNAMIC
 * import inside {@link ensureSuiteRagDatabase}, at a moment the caller has
 * already repointed the environment. This is the same restriction the two
 * sibling helpers carry in their own headers, for the same reason.
 *
 * THE NAME IS A CONVENTION; THE MARKER IS THE GUARANTEE. Everything here
 * derives a NAME, and a name is a claim about a database. The mechanical half
 * lives in `src/ai/rag/test_rag_db.ts`: the `dedalo_test_rag_marker` row, which
 * every WRITE door of the vector store asks for before its first statement when
 * `DEDALO_TEST_RAG_DB_NAME` is set. This module WRITES that marker (through
 * that module's own writer — the literals are never re-typed here) and refuses
 * to drop a database that does not already carry it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AI_KEYS } from '../../src/config/catalog/ai.ts';
import { parseEnvFile, privateDir, projectRoot, readEnv } from '../../src/config/env.ts';

/**
 * The vendored schema of the vector store — the parent table, its indexes and
 * `rag_create_model_partition()`. ONE copy, applied both by an operator
 * provisioning a real install and by the suite building its fixture; see that
 * file's header for why it stopped being a fenced block in the cookbook.
 */
export const RAG_SCHEMA_SQL = join(projectRoot, 'install', 'db', 'rag_embeddings.sql');

/**
 * The INSTALLATION's vector database — the one this whole file exists to keep
 * the suite away from.
 *
 * READ FROM `../private/.env` ONLY, never through `readEnv`, and that
 * restriction is load-bearing in exactly the way
 * `applicationDatabaseName()`'s is (test/helpers/test_database.ts): a process
 * running under the seam has `DEDALO_TEST_RAG_DB_NAME` in its environment, and
 * a future spelling of the seam that reused `DEDALO_RAG_DB_NAME` would make
 * `readEnv` answer with the SUITE's own name — a distinctness check comparing a
 * database against itself, which is how the matrix twin ran vacuous for months.
 *
 * CONFIGURING NOTHING IS THE COMMONEST INSTALL, so the unconfigured case is the
 * one that matters most: on this machine neither key is in `../private/.env`,
 * `dedalo7_rag` therefore IS the live index (measured 2026-08-30: 5201 rows in
 * `rag_embeddings`, no marker), and treating "unconfigured" as "nothing to
 * protect" would leave exactly that database unguarded.
 *
 * The fallback is READ FROM THE CATALOG, never re-typed. `AI_KEYS.RAG_DB_NAME`
 * is the single source of the engine's own default (src/config/readers.ts
 * `defaultOf` resolves `readString('RAG_DB_NAME')` from the same entry, which is
 * what `buildRagSqlOptions()` calls), so the guard cannot drift away from the
 * database the engine actually opens: change the catalog and this moves with it.
 * A literal here would be a stated invariant with no mechanical tie — the one
 * thing DEC-12 forbids — and the thing it guards is a real semantic index.
 */
export function installationRagDatabaseName(): string {
	const envFilePath = join(privateDir, '.env');
	const fileValues = existsSync(envFilePath)
		? parseEnvFile(readFileSync(envFilePath, 'utf-8'))
		: {};
	const configured = fileValues.DEDALO_RAG_DB_NAME ?? fileValues.RAG_DB_NAME;
	return configured === undefined || configured === '' ? AI_KEYS.RAG_DB_NAME.default : configured;
}

/**
 * REFUSE a suite vector database that is the installation's. The counterpart of
 * `assertDistinctFromInstallMediaRoot`, and the reason it THROWS rather than
 * warning is the matrix preload's, verbatim: declining to redirect is the wrong
 * move when the thing you are declining to redirect is the installation's
 * index. A caller that means it points `DEDALO_TEST_RAG_DATABASE` elsewhere.
 */
export function assertDistinctFromInstallRagDatabase(name: string): string {
	const install = installationRagDatabaseName();
	if (name === install) {
		throw new Error(
			`REFUSING to use '${name}' as the suite's vector database: it is the installation's semantic index (../private/.env). The suite must never write vectors into it. Set DEDALO_TEST_RAG_DATABASE to a distinct name.`,
		);
	}
	return name;
}

/**
 * `<suiteDb>_rag`, or an explicit `DEDALO_TEST_RAG_DATABASE`.
 *
 * PASS `suiteDb` — always, and from a caller that KNOWS it. There is no safe
 * default here: `testDatabaseName()` derives `<DB_NAME>_test`, so its answer
 * depends on whether the process has already been repointed, and two callers on
 * opposite sides of that repoint would build one database and write to another.
 * `test/preload/rag_db.ts` and `scripts/test_db_setup.ts` both resolve the suite
 * database first and hand it in.
 *
 * The name reaches SQL as a quoted identifier (CREATE/DROP DATABASE below), so
 * an operator-supplied one is REFUSED rather than escaped — escaping is where
 * the next injection lives, and no database anyone would really use needs a
 * quote in it. Same rule, same grammar as scripts/test_db_setup.ts.
 */
export function suiteRagDatabaseName(suiteDb: string): string {
	const explicit = readEnv('DEDALO_TEST_RAG_DATABASE');
	const name = explicit !== undefined && explicit !== '' ? explicit : `${suiteDb}_rag`;
	return assertDistinctFromInstallRagDatabase(assertPlainRagDatabaseName(name));
}

/**
 * ONE charset law for every name this module interpolates into a SQL identifier
 * — the derived suite name, and any name a sweeper hands to
 * {@link dropSuiteRagDatabase}. Factored out rather than repeated so the two
 * doors cannot drift: a sweeper is precisely the caller that arrives with a name
 * it read from `pg_database` rather than derived, and REFUSE-rather-than-escape
 * is the same rule scripts/test_db_setup.ts states.
 */
function assertPlainRagDatabaseName(name: string): string {
	if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
		throw new Error(
			`REFUSING the vector database name '${name}': it contains characters outside [A-Za-z0-9_.-] and is interpolated into a SQL identifier. Pick a plain name.`,
		);
	}
	return name;
}

/**
 * Where the vector database LIVES. Duplicated under protest from
 * `buildRagSqlOptions()` (src/ai/rag/vector_store.ts), which owns this rule —
 * this module may not import it: that module freezes the config at import
 * (`src/config/config.ts`) and BUILDS `ragSql`, the store's own module-scope
 * pool, from whatever the environment says at that instant, i.e. the
 * installation's index while a preload is still composing the environment.
 * `test/preload/test_database.ts` carries the same duplication of
 * `buildSqlOptions` for the same reason and says so; keep the copies in step.
 *
 * The one rule that is easy to get wrong: a host starting with `/` is a socket
 * DIRECTORY, and the socket inside it is `.s.PGSQL.<port>`. Passing the
 * directory as `hostname` does not fail loudly — it fails as
 * `PostgresError: Connection closed`, which reads as "the database is missing".
 */
function ragConnection(database: string): Record<string, unknown> {
	const socket = readEnv('DEDALO_RAG_DB_SOCKET_CONN') ?? '';
	const host = readEnv('DEDALO_RAG_DB_HOSTNAME_CONN') ?? readEnv('DB_HOST') ?? 'localhost';
	const portRaw = Number(readEnv('DEDALO_RAG_DB_PORT_CONN') ?? readEnv('DB_PORT') ?? 5432);
	const port = Number.isFinite(portRaw) && portRaw > 0 ? Math.trunc(portRaw) : 5432;
	const password = readEnv('DEDALO_RAG_DB_PASSWORD_CONN') ?? readEnv('DB_PASSWORD') ?? '';
	const common = {
		database,
		username: readEnv('DEDALO_RAG_DB_USERNAME_CONN') ?? readEnv('DB_USER'),
		password: password === '' ? undefined : password,
		max: 1,
	};
	if (socket !== '') return { ...common, path: socket };
	if (host.startsWith('/')) return { ...common, path: `${host}/.s.PGSQL.${port}` };
	return { ...common, hostname: host, port };
}

/** What {@link ensureSuiteRagDatabase} did, so the caller can print the truth. */
export interface SuiteRagDatabaseOutcome {
	database: string;
	/** True when this call issued the CREATE DATABASE. */
	created: boolean;
	/** True when this call dropped a previous one (`rebuild` only). */
	dropped: boolean;
	/** True when an existing, already-marked database was accepted untouched. */
	reused: boolean;
}

/**
 * Build the suite's vector database: CREATE it, apply {@link RAG_SCHEMA_SQL},
 * stamp the `dedalo_test_rag_marker` row.
 *
 * TWO CALLERS, ONE IMPLEMENTATION, TWO MODES — and the difference between them
 * is the whole safety argument:
 *
 *  - `rebuild` (`scripts/test_db_setup.ts`): DROP and build again, because a
 *    fixture is reproducible only if it is swept — exactly as the media tree is
 *    swept beside the matrix database. The drop is gated by PROVENANCE, never by
 *    the name: a database that exists and carries no marker is refused, since
 *    the name guard only knows THIS checkout's `../private/.env` and a
 *    colleague's index, a second checkout's, or a restore sitting at the derived
 *    name all pass it. `force` is the operator's typed-out override, wired to
 *    `test:db:setup --force` — the same flag that overrides the matrix
 *    provenance gate.
 *
 *  - `ensure` (`test/preload/rag_db.ts`, every `bun test` run): build it ONLY if
 *    it is absent, so a fresh clone that has never run `test:db:setup` still
 *    gets a MARKED vector database instead of a refusal it has to decode (the
 *    media preload's rule). An existing MARKED database is reused untouched — no
 *    DDL, no marker rewrite, nothing to race a parallel run. An existing
 *    UNMARKED database THROWS: stamping a database this process did not create
 *    would hand out the "disposable" declaration to whatever is sitting at the
 *    derived name, which is the one thing the marker exists to make impossible.
 *
 * FAILURE IS THE CALLER'S TO INTERPRET: this function THROWS (no Postgres, the
 * schema will not apply, the target is unproven). The preload turns that into a
 * warning — the hermetic CI tier has no Postgres at all and a throw there would
 * take down ~2000 tests — while the setup script lets it kill the build.
 */
export async function ensureSuiteRagDatabase(options: {
	database: string;
	mode: 'ensure' | 'rebuild';
	force?: boolean;
}): Promise<SuiteRagDatabaseOutcome> {
	const { database, mode, force = false } = options;
	assertDistinctFromInstallRagDatabase(database);
	const { SQL } = await import('bun');

	const admin = new SQL(ragConnection('postgres'));
	let existing: boolean;
	let dropped = false;
	try {
		existing = (await admin`SELECT 1 FROM pg_database WHERE datname = ${database}`).length > 0;

		if (existing) {
			// ASK THE DATABASE WHAT IT IS. The probe connection is opened and CLOSED
			// again before any DROP: a held session makes `DROP DATABASE` fail with
			// "is being accessed by other users", which is how a guard turns into a
			// broken build.
			const marked = await targetIsMarked(SQL, database);
			if (mode === 'ensure') {
				if (!marked) {
					throw new Error(
						`REFUSING the suite vector database '${database}': it exists and carries no 'dedalo_test_rag_marker' row, so this suite did not build it — it may be a real semantic index. It is NOT stamped as disposable here (only 'bun run test:db:setup' may do that, on a database it created). Every vector WRITE will refuse until it is resolved.`,
					);
				}
				return { database, created: false, dropped: false, reused: true };
			}
			if (!marked && !force) {
				throw new Error(
					`REFUSING to DROP vector database '${database}': it exists but carries no 'dedalo_test_rag_marker' row, so 'bun run test:db:setup' did not build it — it may be a real semantic index (a second checkout's, a colleague's, a restore). Nothing was dropped. Re-run with --force if it truly is disposable.`,
				);
			}
			if (!marked) {
				console.warn(
					`[test-db] --force: dropping EXISTING vector database '${database}' WITHOUT provenance. If that was someone's real index, this line is where it went.`,
				);
			}
			await admin.unsafe(`DROP DATABASE IF EXISTS "${database}"`);
			dropped = true;
		}

		await admin.unsafe(`CREATE DATABASE "${database}"`);
	} finally {
		await admin.end();
	}

	// The schema and the marker, on a database THIS CALL just created — which is
	// the provenance the marker row means (src/ai/rag/test_rag_db.ts, property 1:
	// this and `writeTestRagDatabaseMarker` are its only producers).
	const target = new SQL(ragConnection(database));
	try {
		if (!existsSync(RAG_SCHEMA_SQL)) {
			throw new Error(`vector-store schema not found: ${RAG_SCHEMA_SQL}`);
		}
		// ONE simple-protocol statement batch: the file carries dollar-quoted
		// function bodies, which no naive `;` split survives.
		await target.unsafe(readFileSync(RAG_SCHEMA_SQL, 'utf-8'));

		// The marker, through ITS OWN writer — the table name and the purpose
		// sentence are never re-typed here (a marker spelled twice gets checked in
		// one place and written in the other). Imported DYNAMICALLY and only at
		// this point: src/ai/rag/test_rag_db.ts freezes the config and latches the
		// sqlite session store at import (header), which a preload may not do at
		// module scope — and on a machine with no Postgres this line is never
		// reached, so the DB-less tier never imports it either.
		const { writeTestRagDatabaseMarker } = await import('../../src/ai/rag/test_rag_db.ts');
		await writeTestRagDatabaseMarker(target, {
			build_stamp: new Date().toISOString(),
			git_rev: await gitRev(),
		});
	} finally {
		await target.end();
	}

	return { database, created: true, dropped, reused: false };
}

/**
 * Does the target already carry the marker row this engine ships? Opens its own
 * short-lived connection and closes it, so nothing is held on a database the
 * caller may be about to drop.
 */
async function targetIsMarked(SQL: typeof import('bun').SQL, database: string): Promise<boolean> {
	const probe = new SQL(ragConnection(database));
	try {
		const { ragDatabaseIsMarked } = await import('../../src/ai/rag/test_rag_db.ts');
		return await ragDatabaseIsMarked(probe);
	} finally {
		await probe.end();
	}
}

/** The checkout that built the fixture, for the marker's provenance. */
async function gitRev(): Promise<string> {
	const proc = Bun.spawn(['git', '-C', projectRoot, 'rev-parse', 'HEAD'], {
		stdout: 'pipe',
		stderr: 'ignore',
	});
	const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
	return code === 0 ? out.trim() : 'unknown';
}

// ── sweeping the shard twins ─────────────────────────────────────────────────
//
// A SHARD RUN BUILDS VECTOR DATABASES TOO. `test/preload/rag_db.ts` derives its
// database from whatever `DB_NAME` says, so inside a shard child that is
// `<template>__shard<N>_rag`, created on the spot by `ensureSuiteRagDatabase`
// (mode `ensure`). Nothing would have dropped them: scripts/lib/test_shard_db.ts
// swept only the matrix clones and their media twins, and `test:db:setup`
// REFUSES a shard name outright — so a shard run would have left a vector
// database behind for ever, against the "three surfaces, ONE fixture, swept and
// rebuilt" rule the seam itself states. Conditional, not historical: the vector
// preload that creates them and the sweep that removes them landed in the same
// change (2026-08-30), so no such database was ever actually orphaned. The two
// doors below are what the shard sweeper needs, and they
// live HERE because this module already owns the vector-store connection rule
// (`ragConnection`) and the marker's dynamic-import discipline: a sweeper that
// re-derived either would be the second source of truth that drifts.

/** What a vector database says about ITSELF, when asked. */
export type RagDatabaseProvenance =
	| { state: 'absent' }
	| { state: 'marked' }
	| { state: 'unmarked' }
	/** The marker is present but REFUSED it (wrong purpose, or it names another database). */
	| { state: 'refused'; detail: string };

/**
 * Every database on the VECTOR SERVER whose name starts with `prefix`.
 *
 * The server is the vector store's own (`ragConnection`), which is not
 * necessarily the matrix one — `DEDALO_RAG_DB_*_CONN` exists precisely so the
 * index can live elsewhere, and a sweeper enumerating the matrix server would
 * quietly find nothing and report a clean sweep.
 *
 * `prefix` is matched with LIKE metacharacters ESCAPED: in LIKE a bare `_` is a
 * single-character wildcard, and `<template>__shard` is all underscores — an
 * unescaped pattern enumerates NEIGHBOURING databases, which is the last thing a
 * caller about to drop things should be handed.
 */
export async function listRagDatabases(prefix: string): Promise<string[]> {
	const { SQL } = await import('bun');
	const admin = new SQL(ragConnection('postgres'));
	try {
		const pattern = `${prefix.replace(/([\\%_])/g, '\\$1')}%`;
		const rows = (await admin`
			SELECT datname FROM pg_database WHERE datname LIKE ${pattern} ESCAPE '\\' ORDER BY datname
		`) as { datname: string }[];
		return rows.map((row) => row.datname);
	} finally {
		await admin.end();
	}
}

/**
 * ASK THE DATABASE WHAT IT IS. Fail-closed by shape: `marked` is the only state
 * that licenses a drop, and a marker that REFUSES (misrouted restore, foreign
 * purpose sentence) becomes `refused` with the refusal's own words rather than
 * an exception — a sweeper must be able to name what it left alone and carry on
 * to the next candidate.
 *
 * The probe connection is opened and CLOSED before anyone can DROP: a held
 * session makes `DROP DATABASE` fail with "is being accessed by other users",
 * which is how a guard turns into a broken build.
 */
export async function probeRagDatabaseProvenance(database: string): Promise<RagDatabaseProvenance> {
	assertPlainRagDatabaseName(database);
	const { SQL } = await import('bun');
	const admin = new SQL(ragConnection('postgres'));
	let exists: boolean;
	try {
		exists = (await admin`SELECT 1 FROM pg_database WHERE datname = ${database}`).length > 0;
	} finally {
		await admin.end();
	}
	if (!exists) return { state: 'absent' };
	try {
		return (await targetIsMarked(SQL, database)) ? { state: 'marked' } : { state: 'unmarked' };
	} catch (error) {
		return { state: 'refused', detail: (error as Error).message };
	}
}

/**
 * DROP one suite vector database — and ONLY one that says, itself, that it is
 * disposable. The provenance is probed HERE rather than trusted from the caller,
 * for the reason the whole marker system exists: a name is a claim ABOUT a
 * database, and the derived name of a shard twin is as reachable by a colleague's
 * index or a restore as any other. The returned state is the caller's report
 * line: anything other than `marked` was left untouched.
 */
export async function dropSuiteRagDatabase(database: string): Promise<RagDatabaseProvenance> {
	assertDistinctFromInstallRagDatabase(assertPlainRagDatabaseName(database));
	const provenance = await probeRagDatabaseProvenance(database);
	if (provenance.state !== 'marked') return provenance;
	const { SQL } = await import('bun');
	const admin = new SQL(ragConnection('postgres'));
	try {
		await admin.unsafe(`DROP DATABASE IF EXISTS "${database}"`);
	} finally {
		await admin.end();
	}
	return provenance;
}
