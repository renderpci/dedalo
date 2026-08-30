/**
 * THE TEST-RAG-DATABASE MARKER — the vector store's twin of the matrix marker
 * row (src/core/test_data/test_database_marker.ts) and of the media-root marker
 * file (src/core/media/test_media_root.ts).
 *
 * THE DEFECT THIS CLOSES (audit 2026-08-26, REMEDIATION P1-16). Every shared
 * surface the suite can write to says, in itself, that it is disposable — the
 * matrix database carries a `dedalo_test_marker` row and every test-data writer
 * calls `assertTestDatabase()` first; the media tree carries a
 * `.dedalo_test_media` file and every root resolver calls
 * `assertTestMediaRoot()`. The vector store had NEITHER, and it is not covered
 * by either of them: `ragSql` (vector_store.ts) is a SEPARATE pool on a
 * SEPARATE database, outside every guard the project relies on.
 *
 * MEASURED 2026-08-29/30 on this machine: `buildRagSqlOptions()` resolves the
 * database as `readEnv('DEDALO_RAG_DB_NAME') ?? readString('RAG_DB_NAME')`;
 * `DEDALO_RAG_DB_NAME` is undefined and `RAG_DB_NAME` resolves to
 * `dedalo7_rag` — a REAL INSTALLATION DATABASE. Nothing in `test/preload/`
 * repointed it. So every run of `test/unit/rag_*.test.ts` — indexing, upserts,
 * partition DDL, `DELETE FROM rag_embeddings` — landed in the installation's
 * semantic index. The failing INSERT those gates produce is not a symptom of a
 * missing sidecar alone: it is the PROOF that the suite writes there.
 *
 * (The index is rebuildable, unlike the media masters or the matrix rows. That
 * is a reason the damage is repairable, never a reason the write is allowed:
 * "the suite may write only where it was told it may write" is the law, and a
 * `DELETE FROM rag_embeddings WHERE section_tipo = …` against a curator's live
 * index is a silent, hours-long re-index nobody asked for.)
 *
 * THE SHAPE, AND WHY IT MIRRORS THE MATRIX ONE. A database cannot carry a file,
 * so it carries a ROW: one table, `dedalo_test_rag_marker`, one row, id = 1,
 * with the purpose sentence as a CHECK CONSTRAINT and the database's own name
 * in a column. Four properties, exactly as the matrix marker's header sets out:
 *
 *  1. NO OTHER PRODUCER. The table is in no schema install, in no migration,
 *     and the engine never creates it at boot. Only
 *     {@link writeTestRagDatabaseMarker} writes it, from the suite's setup.
 *  2. THE PURPOSE SENTENCE IS A CHECK CONSTRAINT. Reproducing it by accident on
 *     an installation's vector database is not a slip; it is a paragraph of
 *     deliberate typing that says what it is doing.
 *  3. IT NAMES ITS OWN DATABASE, verified against `current_database()` on every
 *     read. A dump of the test index restored into the installation's vector
 *     database — the one realistic way a marker could travel — refuses LOUDER
 *     than an absent marker, because that is a misrouted restore.
 *  4. IT IS ASSERTED, NOT ASSUMED. {@link assertTestRagDatabase} is called by
 *     every WRITE door of vector_store.ts, before its first statement.
 *
 * ARMED BY THE DATABASE NAME, NOT BY A SECOND FLAG. `DEDALO_TEST_RAG_DB_NAME`
 * is BOTH the test vector database and the arming signal — ONE key, so the two
 * halves cannot disagree (the media seam's rule, for the same reason):
 *
 *   - UNSET (every real installation, and every serving process): the assert is
 *     inert. It returns after one env read, issues no query, and the indexing
 *     path behaves EXACTLY as it did before this guard existed. This guard can
 *     never make production refuse to index — that is the property that makes
 *     it safe to ship.
 *   - SET (the suite's preload, `test:db:setup`): the key REPOINTS `ragSql` at
 *     that database (vector_store.ts `buildRagSqlOptions`) AND arms the
 *     refusal, so a run cannot be armed at the installation's index, nor
 *     repointed with the guard asleep. Armed + unmarked = REFUSAL, before any
 *     write.
 *
 * WHY THE CONNECTION IS A PARAMETER. The pool lives in vector_store.ts, which
 * imports this module; taking `ragSql` from there would make an import cycle,
 * which `import_scc_tripwire` forbids (an SCC of size > 1). Passing the handle
 * is also the honest signature: the guard's question is about the database a
 * caller is ABOUT TO WRITE TO, exactly as the media guard's question is about
 * the root a caller is about to write into.
 *
 * WHY NOTHING IS CACHED. The matrix marker caches its positive in a
 * `createOntologyCache` Map for the reason its own header gives — cheapness: it
 * stands in front of EVERY test-data write, and one process never changes
 * database under itself, so the Map turns the whole run's asking into one pair
 * of queries. This guard is asked far less. On an installation it is asked not
 * at all: unarmed, {@link assertTestRagDatabase} returns after a single env read
 * and issues no query, so there is no hot path to cache. Armed, it is asked once
 * per vector WRITE door, where two small queries are nothing beside the
 * embedding and upsert traffic they guard. A cache would buy nothing and add
 * module-level state that `module_state_tripwire` governs. A NEGATIVE must in
 * any case never be cached: a probe may remove the row inside a transaction it
 * then rolls back, which is how a tripwire proves the refusal is real.
 */

import type { SQL } from 'bun';
import { readEnv } from '../../config/env.ts';
import { DedaloError } from '../../core/errors/index.ts';

/**
 * The table a vector database must carry before the suite may write into it.
 * ONE definition — the setup script and the tripwire import it rather than
 * re-typing the literal (a marker whose name is spelled twice is a marker that
 * eventually gets checked in one place and written in the other).
 */
export const TEST_RAG_MARKER_TABLE = 'dedalo_test_rag_marker';

/**
 * The sentence the CHECK constraint pins. Long and explicit on purpose: it is
 * the half of the marker that cannot be reproduced by a stray `CREATE TABLE`.
 */
export const TEST_RAG_MARKER_PURPOSE =
	'This is a DISPOSABLE Dedalo test vector database. Its whole contents may be deleted, re-partitioned and re-embedded by the test suite at any moment. It is never an installation semantic index.';

/** The one row, as every reader sees it. */
export interface TestRagDatabaseMarker {
	/** The database the marker was written into — verified against `current_database()`. */
	database_name: string;
	/** ISO instant of the `test:db:setup` run that built it. */
	build_stamp: string;
	/** The checkout that built it (`git rev-parse HEAD`, or `unknown`). */
	git_rev: string;
}

/**
 * The test vector database this process is pointed at, or `null` on an
 * installation. Read live from the environment (never a boot snapshot) because
 * the suite's preload sets the key before any module imports it, and a gate may
 * legitimately set it later in the run.
 *
 * The live read fails in the safe direction in both stale cases: a key set
 * AFTER the pool was built leaves the pool on the installation's index with the
 * guard ARMED, so the first write refuses; a key removed after the pool was
 * built leaves the pool on the marked test index with the guard disarmed, so
 * the write lands where it was always going to land.
 */
export function testRagDatabaseName(): string | null {
	const raw = readEnv('DEDALO_TEST_RAG_DB_NAME');
	return raw !== undefined && raw !== '' ? raw : null;
}

/** True when this process runs under the test-vector-database seam (guard armed). */
export function testRagGuardArmed(): boolean {
	return testRagDatabaseName() !== null;
}

function refuse(message: string, coordinates: Record<string, string> = {}): never {
	throw new DedaloError('internal.invariant', { message, coordinates });
}

/**
 * The marker of the database `sql` is CONNECTED TO, or `null` when there is
 * none. A marker naming a DIFFERENT database is an absence with an explanation
 * — a misrouted restore — and refuses rather than returning null (header,
 * property 3).
 */
export async function readTestRagDatabaseMarker(sql: SQL): Promise<TestRagDatabaseMarker | null> {
	// ONE query for the miss path: the table's existence AND the live database
	// name. A missing table is the overwhelmingly common answer on an
	// installation, and it must not cost two round trips.
	const probe = (await sql.unsafe(
		'SELECT current_database() AS live, to_regclass($1) IS NOT NULL AS present',
		[`public.${TEST_RAG_MARKER_TABLE}`],
	)) as { live: string; present: boolean }[];
	const live = probe[0]?.live ?? '';
	if (probe[0]?.present !== true) return null;
	const rows = (await sql.unsafe(
		`SELECT database_name, purpose, build_stamp, git_rev
		   FROM "${TEST_RAG_MARKER_TABLE}" WHERE id = 1`,
	)) as (TestRagDatabaseMarker & { purpose: string })[];
	const row = rows[0];
	if (row === undefined) return null;
	if (row.purpose !== TEST_RAG_MARKER_PURPOSE) {
		refuse(
			`${TEST_RAG_MARKER_TABLE}: the row's purpose does not match the constant this engine ships — the marker was not written by 'bun run test:db:setup'. NOTHING WAS WRITTEN.`,
		);
	}
	if (row.database_name !== live) {
		refuse(
			`${TEST_RAG_MARKER_TABLE}: this marker names vector database '${row.database_name}' but the connection is to '${live}' — a test vector-database dump has been restored somewhere it does not belong. REFUSING every vector write until that is resolved.`,
			{ marker_database: row.database_name, live },
		);
	}
	return row;
}

/** Does the OPEN vector database carry the marker? (A refusal above still throws.) */
export async function ragDatabaseIsMarked(sql: SQL): Promise<boolean> {
	return (await readTestRagDatabaseMarker(sql)) !== null;
}

/**
 * THE UNCONDITIONAL door: the connected database must carry the marker,
 * whatever this process thinks it is. For callers that exist ONLY for tests,
 * where an unmarked vector database is never legitimate.
 *
 * @param door the name a refusal must print (the function refusing, not its file)
 */
export async function requireTestRagDatabase(sql: SQL, door: string): Promise<void> {
	const marker = await readTestRagDatabaseMarker(sql);
	if (marker !== null) return;
	const probe = (await sql.unsafe('SELECT current_database() AS live')) as { live: string }[];
	const live = probe[0]?.live ?? '(unknown)';
	refuse(
		`${door}: REFUSING to write to vector database '${live}' — it carries no '${TEST_RAG_MARKER_TABLE}' row, so it has not declared itself a disposable test index and may be an installation's semantic index. NOTHING WAS WRITTEN. Build the suite's vector database with 'bun run test:db:setup', or unset DEDALO_TEST_RAG_DB_NAME if this process is meant to index for real.`,
		{ door, live },
	);
}

/**
 * THE ARMED door, called by every WRITE door of the vector store. Inert unless
 * this process runs under the test-vector-database seam; then the connected
 * database must carry the marker or the write is refused before it starts.
 */
export async function assertTestRagDatabase(sql: SQL, door: string): Promise<void> {
	if (!testRagGuardArmed()) return;
	await requireTestRagDatabase(sql, door);
}

/** The provenance a `test:db:setup` run stamps into the marker. */
export interface TestRagDatabaseMarkerInput {
	build_stamp: string;
	git_rev: string;
}

/**
 * Create the table and write the single row. Called by the suite's vector
 * database setup ONLY, on a database it has just created or is entitled to wipe
 * (header, property 1). Idempotent: a re-run replaces the row.
 */
export async function writeTestRagDatabaseMarker(
	sql: SQL,
	input: TestRagDatabaseMarkerInput,
): Promise<TestRagDatabaseMarker> {
	const probe = (await sql.unsafe('SELECT current_database() AS live')) as { live: string }[];
	const live = probe[0]?.live ?? '';
	await sql.unsafe(`CREATE TABLE IF NOT EXISTS "${TEST_RAG_MARKER_TABLE}" (
		id            integer PRIMARY KEY CHECK (id = 1),
		purpose       text NOT NULL CHECK (purpose = '${TEST_RAG_MARKER_PURPOSE}'),
		database_name text NOT NULL,
		build_stamp   text NOT NULL,
		git_rev       text NOT NULL,
		created_at    timestamptz NOT NULL DEFAULT now()
	)`);
	await sql.unsafe(
		`INSERT INTO "${TEST_RAG_MARKER_TABLE}"
		   (id, purpose, database_name, build_stamp, git_rev)
		 VALUES (1, $1, $2, $3, $4)
		 ON CONFLICT (id) DO UPDATE SET
		   purpose = EXCLUDED.purpose, database_name = EXCLUDED.database_name,
		   build_stamp = EXCLUDED.build_stamp, git_rev = EXCLUDED.git_rev,
		   created_at = now()`,
		[TEST_RAG_MARKER_PURPOSE, live, input.build_stamp, input.git_rev],
	);
	const marker = await readTestRagDatabaseMarker(sql);
	if (marker === null) {
		refuse(`${TEST_RAG_MARKER_TABLE}: the row did not read back after writing it.`);
	}
	return marker;
}
