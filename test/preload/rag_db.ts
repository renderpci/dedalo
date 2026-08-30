/**
 * bun test preload — point the WHOLE SUITE at its own VECTOR DATABASE.
 *
 * The third of the three seams, after `test_database.ts` (the matrix database)
 * and `test_media.ts` (the media tree). Those two closed the surfaces the suite
 * shared with the installation; this one closes the surface they never covered,
 * and the one the audit found still open: the pgvector store.
 *
 * WHY (audit 2026-08-26 REMEDIATION P1-16; measured 2026-08-29/30). The vector
 * store opens `ragSql`, a pool of its OWN (src/ai/rag/vector_store.ts), on a
 * database resolved from `DEDALO_RAG_DB_NAME ?? RAG_DB_NAME` — `dedalo7_rag` on
 * this machine, a REAL INSTALLATION INDEX. It is a separate pool, so it sits
 * outside `assertTestDatabase()` and outside the media marker: neither of the
 * other two preloads protected it, and none of them could. Every run of
 * `test/unit/rag_*.test.ts` therefore upserted rows, created partitions and ran
 * `DELETE FROM rag_embeddings` against a curator's live semantic index. (The
 * index is rebuildable — that makes the damage repairable, never permitted: a
 * silent multi-hour re-index nobody asked for is not a lesser bug.)
 *
 * ONE KEY, SET UNCONDITIONALLY. `DEDALO_TEST_RAG_DB_NAME` BOTH repoints the
 * pool (`buildRagSqlOptions`, where the seam outranks both operator spellings)
 * and ARMS the marker refusal (src/ai/rag/test_rag_db.ts): armed, every WRITE
 * door of the store refuses a database that does not carry the
 * `dedalo_test_rag_marker` row, and writes nothing. It is set BEFORE anything
 * below can fail — not "if the database exists", not "if Postgres is up" —
 * because, in this file's twin's words, a preload that sometimes arms the guard
 * is a preload that leaves the installation's index reachable on the day it does
 * not. A run whose provisioning failed is a run where every vector write refuses
 * by name; that is the correct outcome, and it is strictly better than one where
 * the writes land somewhere real.
 *
 * IT ALSO BUILDS THE DATABASE WHEN IT IS ABSENT, so `bun test` works on a fresh
 * clone that has never run `test:db:setup` — the media preload creates and marks
 * its root for exactly the same reason. What it will NOT do is stamp a database
 * it did not create: an existing UNMARKED database at the derived name refuses
 * (see `ensureSuiteRagDatabase`, mode `ensure`). Sweeping and rebuilding belongs
 * to `test:db:setup`, beside the matrix rebuild and the media sweep — the three
 * are one fixture.
 *
 * WARN, NEVER THROW, on a missing Postgres: the hermetic CI tier runs on a bare
 * runner and a throw here would take down ~2000 tests (bunfig.toml states the
 * rule). The two refusals that DO throw are misconfigurations, not absences —
 * a suite vector database that resolves to the installation's index, and an
 * unmarked database sitting at the derived name.
 *
 * WHY IT RUNS LAST (bunfig.toml). ARMING needs no particular position: the key
 * is read LIVE (`testRagDatabaseName()`), the rag pool is built by no preload,
 * and no test module has been imported yet. PROVISIONING is what constrains the
 * order. `ensureSuiteRagDatabase` reaches the marker writer
 * `src/ai/rag/test_rag_db.ts` through a DYNAMIC import (which is why the helper's
 * own static imports reach only `src/config/env.ts` and the config CATALOG
 * `src/config/catalog/ai.ts`, and nothing else), and that module's static
 * graph — 42 `src/` modules, re-derive it with
 * `bun build src/ai/rag/test_rag_db.ts --target=bun` — reaches two things that
 * latch at import: `src/config/config.ts` (via
 * `core/errors/index.ts` -> `log.ts` -> `core/api/counters.ts` ->
 * `core/security/session_store.ts` -> `core/media/protection.ts`), which freezes
 * `DB_NAME` and the media root; and, on that same edge,
 * `core/security/session_store.ts` itself, which opens the sqlite session store
 * at module scope on a path resolved at import. Placed above `test_media.ts`,
 * `test_database.ts` or `session_db.ts` this preload would therefore latch all
 * three onto the INSTALLATION — the precise defects those files exist to
 * prevent. Below them, every seam is already set and the latch happens on suite
 * values.
 *
 * WHAT IT DOES *NOT* REACH is `src/core/db/postgres.ts`: the matrix pool is
 * neither built nor connected here (`buildSqlOptions` does not appear in that
 * bundle). So `component_registry.ts` and `canonical_test3.ts` could equally sit
 * either side of this file. Of those two it is `component_registry.ts` that
 * builds the matrix pool — it statically imports
 * `src/core/components/registry.ts`, which reaches `core/ontology/resolver.ts`
 * and so `core/db/postgres.ts`; `canonical_test3.ts` has NO static imports at
 * all, only a guarded dynamic one. (An earlier revision of this comment named
 * canonical_test3 as the pool builder. It was wrong, and wrong about the one
 * fact the ordering argument rests on.) Last is simply the free position that
 * satisfies the one real constraint, and leaves nothing after it to disturb.
 *
 * `process.env` here is not a tripwire violation: config_env_tripwire covers
 * `src/` and `tools/`, and `test/` is where a process environment is composed.
 */

import { readEnv } from '../../src/config/env.ts';
import { ensureSuiteRagDatabase, suiteRagDatabaseName } from '../helpers/test_rag_database.ts';

/**
 * The SUITE database, read straight from the environment `test_database.ts` has
 * already rewritten — NOT `testDatabaseName()`.
 *
 * That helper derives `<DB_NAME>_test`, which is the right answer only while
 * `DB_NAME` still names the APPLICATION database. This preload runs AFTER the
 * repoint (see the header), so calling it here would derive `<suite>_test_test`
 * and build a vector database `scripts/test_db_setup.ts` — which resolves the
 * name on the other side of the repoint — would never touch. Reading `DB_NAME`
 * is therefore not a shortcut: it is the only expression that answers the same
 * thing on both sides. The `DEDALO_TEST_DB_DISABLE=true` escape hatch leaves the
 * application database here, and gets `<app db>_rag` — still never the
 * installation's index, which is what the derivation's refusal proves.
 */
const suiteDb = readEnv('DB_NAME') ?? readEnv('DEDALO_DATABASE_CONN') ?? 'dedalo_ts_test';
const ragDb = suiteRagDatabaseName(suiteDb);

// ARM FIRST, PROVISION SECOND. Everything below may fail; this line may not.
process.env.DEDALO_TEST_RAG_DB_NAME = ragDb;

try {
	const outcome = await ensureSuiteRagDatabase({ database: ragDb, mode: 'ensure' });
	console.log(
		outcome.created
			? `[test-preload] suite vector database CREATED: ${ragDb} (schema applied, marked 'dedalo_test_rag_marker'; the installation's index is untouched)`
			: `[test-preload] suite vector database: ${ragDb} (the installation's semantic index is untouched)`,
	);
} catch (error) {
	// LOUD, AND STILL ARMED. No Postgres (the hermetic tier), no pgvector, or a
	// target this suite may not have — the rag gates then fail on the guard's own
	// terms, naming the door that refused and the database it refused, having
	// written nothing. The installation's index is never the fallback.
	console.warn(
		`[test-preload] could NOT prepare the suite vector database '${ragDb}' — every vector WRITE will refuse (nothing is written) until it exists. Harmless on the hermetic (DB-less) tier. Build it with 'bun run test:db:setup'. Cause: ${(error as Error).message}`,
	);
}
