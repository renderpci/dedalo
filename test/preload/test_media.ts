/**
 * bun test preload — point the WHOLE SUITE at its own MEDIA ROOT.
 *
 * The twin of `test_database.ts`, one directory over. That preload closed the
 * database hole; this one closes the surface it ledgered as still shared:
 * `MEDIA_PATH`. Until now a media unit gate, `ensureMediaKit`, a derivative
 * builder and any tool that regenerates a thumb wrote into the INSTALLATION's
 * media tree — the same tree holding the heritage masters an institution cannot
 * re-acquire.
 *
 * ONE KEY, SET BEFORE ANY MODULE IMPORTS `src/config/config.ts` (which freezes
 * the media root at import, exactly as it freezes the connection):
 * `DEDALO_TEST_MEDIA_ROOT` BOTH repoints the root and ARMS the marker guard
 * (src/core/media/test_media_root.ts). It is set UNCONDITIONALLY — not "if the
 * directory exists", not "if the suite database is present" — because a preload
 * that sometimes arms the guard is a preload that leaves the installation's root
 * reachable on the day it does not.
 *
 * It also CREATES the root and plants the marker, so `bun test` on a fresh clone
 * works without `test:db:setup` having run. The sweep belongs to that command
 * (see test/helpers/test_media_root.ts).
 *
 * IT RUNS BEFORE `test_database.ts`, and that order is load-bearing twice over:
 * both must beat the config freeze, and the media tree is KEYED BY THE SUITE
 * DATABASE NAME, which `testMediaRootPath()` derives as `<DB_NAME>_test` — so it
 * has to read `DB_NAME` while it still names the APPLICATION database. Run the
 * other way round and the tree would be keyed `<app>_test_test`, disagreeing with
 * `test:db:setup` and `client_test_server.ts`, which pass the name they resolved.
 *
 * `scripts/` is outside the `process.env` ban and so is `test/` — the tripwire
 * (config_env_tripwire) covers `src/` and `tools/`, and it has to: this IS the
 * place a process environment is composed.
 */

import { ensureTestMediaRoot, testMediaRootPath } from '../helpers/test_media_root.ts';

try {
	const root = ensureTestMediaRoot();
	process.env.DEDALO_TEST_MEDIA_ROOT = root;
	console.log(
		`[test-preload] suite media root: ${root} (the installation's media tree is untouched)`,
	);
} catch (error) {
	// FAIL LOUD, AND STILL ARM. If the root cannot be created (a read-only
	// ../private, a path that collides with the installation's media root) the
	// key is set ANYWAY: an armed guard on a missing directory refuses every
	// media write naming itself, which is the correct outcome. Leaving the key
	// unset would hand the suite the installation's tree — the one thing this
	// file exists to prevent.
	process.env.DEDALO_TEST_MEDIA_ROOT = testMediaRootPath();
	console.error(
		`[test-preload] could NOT prepare the suite media root (${(error as Error).message}). Every media door will refuse until it exists — build it with 'bun run test:db:setup'. The installation's media tree is NOT used as a fallback.`,
	);
}
