/**
 * THE ONE PLACE THE TEST MEDIA ROOT'S PATH IS DERIVED — the filesystem twin of
 * `test/helpers/test_database.ts`, shared by the three processes that must agree
 * about it: the `bun test` preload (`test/preload/test_media.ts`), the builder
 * (`scripts/test_db_setup.ts`, which SWEEPS and rebuilds it) and the client
 * suite's own server (`scripts/client_test_server.ts`).
 *
 * WHERE IT LIVES, AND WHY THERE.
 *
 *   <repo>/../private/test_media/<suite database name>/
 *
 * Three properties decide that path, in this order:
 *
 *  1. `../private/` IS ALREADY THE HOME OF PER-INSTALL, NON-SERVED, NON-REPO
 *     STATE — `.env`, the session store, `processes/`, `ts_state.json`. It is
 *     outside every web root by construction (the media-protection subsystem
 *     relies on exactly that for the auth store), outside the repo, and it is
 *     the directory an operator already knows is "this checkout's private
 *     scratch". A test media tree is precisely that kind of thing.
 *  2. KEYED BY THE SUITE DATABASE NAME, because the media tree and the database
 *     are ONE fixture: `files_info.file_path` rows in the database name files in
 *     the tree. Two checkouts, or one checkout with `DEDALO_TEST_DATABASE`
 *     pointed somewhere else, get two trees and never plant one corpus's files
 *     where the other's rows expect them. It is also the reason a rebuild of the
 *     database rebuilds the tree in the same command.
 *  3. IT CANNOT COLLIDE WITH THE INSTALLATION'S `MEDIA_PATH`. The install root is
 *     `<projectRoot>/media` by default and an operator-chosen absolute path
 *     otherwise; neither is ever inside `../private/test_media/`. {@link
 *     assertDistinctFromInstallMediaRoot} proves it rather than assuming it —
 *     the derivation is a convention, and a convention is what the
 *     `.dedalo_test_media` marker exists to stop us from trusting.
 *
 * WHAT THIS MODULE MAY IMPORT. `src/config/env.ts` only, exactly like its
 * database twin: it is loaded BEFORE the process is repointed, and pulling in
 * `src/config/config.ts` would freeze the media root (and the DB connection) at
 * the installation's values before the seam could be set.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { projectRoot, readEnv } from '../../src/config/env.ts';
import { testDatabaseName } from './test_database.ts';

/**
 * The marker file. THE ONE PLACE IN THE TREE THIS LITERAL IS REPEATED, and it is
 * repeated under protest: the canonical constant lives in
 * `src/core/media/test_media_root.ts`, which imports `src/config/config.ts` —
 * importing it HERE would freeze the config (media root and DB connection alike)
 * at the installation's values before the preload could repoint them, which is
 * the same reason `test/helpers/test_database.ts` does not re-export the database
 * guard. `test/unit/test_media_root_tripwire.test.ts` asserts the two literals are
 * identical, so the copy cannot drift.
 */
export const TEST_MEDIA_MARKER = '.dedalo_test_media';

/** `<repo>/../private/test_media` — the parent of every suite's tree. */
export function testMediaBaseDir(): string {
	return resolve(projectRoot, '..', 'private', 'test_media');
}

/**
 * THE path: `<repo>/../private/test_media/<suite db>`. Pure — it neither creates
 * nor checks anything, so a caller can print it in a refusal.
 *
 * PASS `suiteDb` WHEN YOU KNOW IT. `testDatabaseName()` derives `<DB_NAME>_test`,
 * so it answers correctly only while `DB_NAME` still names the APPLICATION
 * database — after a repoint it would derive `<app>_test_test` and a second
 * caller on the other side of the repoint would disagree about where the tree is.
 * `scripts/test_db_setup.ts` and `scripts/client_test_server.ts` therefore pass
 * the name they already resolved; the `bun test` preload runs BEFORE the database
 * preload (bunfig.toml) precisely so the default is the right answer there.
 */
export function testMediaRootPath(suiteDb: string = testDatabaseName()): string {
	// The name reaches the filesystem as a directory segment. A database name is
	// operator-supplied (DEDALO_TEST_DATABASE), so it is sanitized, not trusted.
	const segment = suiteDb.replace(/[^A-Za-z0-9_.-]/g, '_');
	return join(testMediaBaseDir(), segment === '' ? 'dedalo_ts_test' : segment);
}

/**
 * The installation's media root as THIS process would resolve it before any
 * repoint — `MEDIA_PATH`, else the derived `<projectRoot>/media`. Duplicating
 * the derivation is not an option and reading `config.media.rootPath` is not
 * either (importing config here freezes it), so it reads the same two inputs the
 * catalog reads, and {@link assertDistinctFromInstallMediaRoot} is the only
 * consumer.
 */
function installMediaRoot(): string {
	const configured = readEnv('MEDIA_PATH');
	return resolve(
		configured !== undefined && configured !== '' ? configured : join(projectRoot, 'media'),
	);
}

/**
 * REFUSE a test root that is the installation's media root, or inside it, or
 * contains it. This is the check the whole file exists for: everything else is a
 * naming convention, and a naming convention is what let the suite write into a
 * live media tree in the first place.
 */
export function assertDistinctFromInstallMediaRoot(testRoot: string): string {
	const install = installMediaRoot();
	const root = resolve(testRoot);
	if (root === install || root.startsWith(install + sep) || install.startsWith(root + sep)) {
		throw new Error(
			`REFUSING to use '${root}' as the test media root: it is the installation's media root ('${install}'), or one contains the other. The suite must never write into the installation's media tree.`,
		);
	}
	return root;
}

/**
 * Create the test media root and PLANT ITS MARKER. Idempotent — the preload
 * calls it on every `bun test` run, so a developer who has never run
 * `test:db:setup` still gets a marked root instead of a refusal they have to
 * decode.
 *
 * It does NOT sweep: the corpus fixture and the media gates own their own files
 * and clean up after themselves, and a preload that emptied the tree would race
 * a parallel run. Sweeping is {@link rebuildTestMediaRoot}'s job, in the command
 * that rebuilds the database beside it.
 */
export function ensureTestMediaRoot(suiteDb?: string): string {
	const root = assertDistinctFromInstallMediaRoot(testMediaRootPath(suiteDb));
	mkdirSync(root, { recursive: true, mode: 0o775 });
	const marker = join(root, TEST_MEDIA_MARKER);
	if (!existsSync(marker)) {
		writeFileSync(
			marker,
			[
				'This directory is a DÉDALO TEST MEDIA ROOT.',
				'',
				'Its presence is what every media-root door in the engine checks before it',
				'writes, when the process runs under DEDALO_TEST_MEDIA_ROOT',
				'(src/core/media/test_media_root.ts). Everything under this directory is',
				'disposable and is rebuilt by `bun run test:db:setup`.',
				'',
				"NEVER place this file in an installation's media root.",
				'',
			].join('\n'),
		);
	}
	return root;
}

/** Sweep and recreate the tree — `test:db:setup`, beside the database rebuild. */
export function rebuildTestMediaRoot(suiteDb?: string): string {
	const root = assertDistinctFromInstallMediaRoot(testMediaRootPath(suiteDb));
	rmSync(root, { recursive: true, force: true });
	return ensureTestMediaRoot(suiteDb);
}
