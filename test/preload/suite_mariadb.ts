/**
 * bun test preload — ARM the whole suite at its own MARIADB SERVER (PUB-05, audit
 * 2026-09-26). The fourth seam, after `test_media.ts` (the media tree),
 * `test_database.ts` (the matrix database) and `rag_db.ts` (the vector database).
 *
 * WHY. The diffusion engine reaches MariaDB through `getTargetPool`
 * (src/diffusion/targets/mariadb/db.ts), which resolves its socket, user and password
 * from `DEDALO_DIFFUSION_DB_*` with `readEnv` — process env first, then
 * `../private/.env`. Nothing re-pointed those keys inside a test process, so every
 * MariaDB-touching gate reached the INSTALLATION's server: on a developer machine
 * `diffusion_mariadb.test.ts` created and dropped tables in the installation's
 * publication database; on a runner without that socket every live leg skipped GREEN.
 *
 * ONE COMPOSITION, SET UNCONDITIONALLY. The keys come from `suiteMariadbEnvironment`
 * (test/helpers/suite_mariadb_env.ts): the socket of THIS LANE's suite server
 * (`/tmp/dedalo_tmdb_<hash of ../private/test_mariadb/<suite db>>/s`), the suite's
 * diffusion user, and a BLANK host and port so no lookup can fall back to a TCP server
 * named in `../private/.env`. They are set whether or not that server exists — in the
 * RAG preload's words, a preload that sometimes arms is a preload that leaves the
 * installation reachable on the day it does not. The engine's pool therefore never
 * sees the installation's socket, host or credentials.
 *
 * WHAT ARMING DOES NOT CLOSE (measured 2026-09-30). Bun's `mariadb` adapter, handed a
 * socket `path` that does not exist, silently connects to `localhost:3306` instead —
 * on a developer machine, the installation's server (as `dedalo_test_diffusion`: an
 * authentication attempt, which fails, but a contact). So while the lane's server is
 * NOT running, an armed process can still reach the installation through any
 * `getTargetPool` caller. What holds today: every MariaDB gate acquires the server
 * through `requireSuiteMariadb()` (which starts it, or throws) before it opens a pool;
 * every other test/unit AND test/parity file whose import closure reaches the pool
 * module (the preload arms both roots alike) is RUN by scripts/ci/mariadb_tier.ts with
 * the suite server up, and must make no contact with it (measured, not declared — a
 * contact made only in a situation the suite database does not hold is not seen there);
 * the one test/integration file outside the stage's set (diffusion_publish_e2e,
 * INSTALL_BOUND_EXEMPT) contacts nothing while `suiteContactRefusal()` refuses (unarmed, or
 * armed at an absent socket) — held by suite_mariadb_target_native (M7).
 * What closes it for EVERY caller is the engine seam PUB-05b — `buildTargetOptions`
 * refusing a configured socket that is not a unix socket — not this file.
 *
 * NO I/O, NO `src/` GRAPH. This file imports only the light half of the helper (paths
 * and the env composer — `node:` modules, `src/config/env.ts` and the lane-name
 * derivation) and performs no connection, so it cannot fail and the hermetic tier is
 * unaffected. Starting the server is NOT its job: that costs seconds, belongs to the
 * gates that need it (`beforeAll`), and in CI to `scripts/ci/suite_mariadb.ts start`.
 *
 * ORDER. Place it after `test_database.ts`. The lane name is `testDatabaseName()`,
 * which `test_database.ts` makes idempotent by pinning `DEDALO_TEST_DATABASE` — so this
 * file and every later `requireSuiteMariadb()` derive the SAME lane, and a nested
 * `bun test` (the tier census) re-derives it unchanged. (Unlike `rag_db.ts` it does not
 * read `DB_NAME`: under `DEDALO_TEST_DB_DISABLE=true` that is the application database,
 * while `requireSuiteMariadb()` keys on `testDatabaseName()`; one derivation on both
 * sides is what keeps the armed socket and the checked socket equal.)
 *
 * `process.env` here is not a tripwire violation: config_env_tripwire covers `src/`
 * and `tools/`, and `test/` is where a process environment is composed.
 */

import { suiteMariadbEnvironment } from '../helpers/suite_mariadb_env.ts';
import { testDatabaseName } from '../helpers/test_database.ts';

Object.assign(process.env, suiteMariadbEnvironment(testDatabaseName()));
