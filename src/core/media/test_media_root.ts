/**
 * THE TEST-MEDIA-ROOT MARKER — the filesystem twin of the test-database marker
 * row (src/core/test_data/test_database_marker.ts).
 *
 * WHY THIS EXISTS. The 2026-08-19 work closed the DATABASE hole: the suite runs
 * on a database that says, in a row of its own, that it is disposable, and every
 * test-data writer asks it before moving anything. It left one shared surface
 * open and ledgered it: `MEDIA_PATH`. Media writes from the client suite, from
 * `ensureMediaKit`, from the media unit gates and from any tool that builds a
 * derivative landed in the INSTALLATION's media root — 32 GB of irreplaceable
 * heritage masters, next to which a test's `deleted/` move, a rewritten
 * `.publication` marker store or a regenerated thumb is not an experiment
 * anybody wants to run on a distracted afternoon.
 *
 * THE SHAPE, AND WHY IT MIRRORS THE DATABASE ONE. A directory cannot carry a row,
 * so it carries a FILE: `.dedalo_test_media` in its root. A path is a claim about
 * a directory (`…/test_media/…` looks like a test root and may be a symlink to
 * the install's tree); the marker is the DIRECTORY ITSELF declaring what it is,
 * and every door that resolves a media root asks it.
 *
 * ARMED BY THE ROOT, NOT BY A SECOND FLAG. `config.media.testRoot`
 * (env DEDALO_TEST_MEDIA_ROOT) is BOTH the test root and the arming signal — one
 * key, so the two halves cannot disagree:
 *
 *   - UNSET (every real installation): {@link assertTestMediaRoot} is inert. It
 *     returns after one property read, and the production media path grammar is
 *     byte-identical to what it was.
 *   - SET (the unit tier's preload, `test:db:setup`, the client-suite server):
 *     the configured root IS the test root, and ANY root a door resolves — the
 *     configured one, or a scratch root a gate passes as `mediaRoot` — must carry
 *     the marker or the door refuses BEFORE it writes.
 *
 * That second clause is the half that matters in practice: a gate that mkdtemps
 * its own root and hands it to a derivative builder is writing to a directory
 * nobody declared, and until now the only thing standing between that root and a
 * fat-fingered constant was the author's attention.
 *
 * FAIL-CLOSED, NAMED, AND "NOTHING WAS WRITTEN". The refusal names the DOOR, the
 * root it was pointed at, and states plainly that nothing was written — the same
 * three facts `assertTestDatabase` gives, for the same reason: a guard whose
 * message does not tell you which call refused is a guard people disable.
 *
 * WHERE IT IS CALLED. At the root RESOLVERS, never at the ~40 individual
 * `writeFileSync`/`renameSync` call sites — a per-call-site guard is a list that
 * rots. The resolvers are enumerated and gated by
 * `test/unit/test_media_root_tripwire.test.ts`, which DERIVES them from a source
 * scan of every `config.media.rootPath` reader.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from '../../config/config.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import { deriveProcessesDir, testProcessesDirFor } from './processes_dir.ts';

/**
 * The marker file a directory must carry before the suite may write media into
 * it. ONE definition — `src/core/test_data/test_corpus/ensure.ts` imports it
 * rather than keeping the second copy it used to hold.
 */
export const TEST_MEDIA_MARKER = '.dedalo_test_media';

/** Is `root` a directory that has DECLARED itself a test media root? */
export function mediaRootIsMarked(root: string): boolean {
	return existsSync(join(resolve(root), TEST_MEDIA_MARKER));
}

/** True when this process runs under the test-media seam (the guard is armed). */
export function testMediaGuardArmed(): boolean {
	return config.media.testRoot !== null;
}

/**
 * THE UNCONDITIONAL door: `root` must carry the marker, whatever the process
 * thinks it is. For doors that exist ONLY for tests — the media kit — where an
 * unmarked root is never legitimate, not even in production.
 *
 * @param door the name a refusal must print (the function refusing, not its file)
 */
export function requireTestMediaRoot(root: string, door: string): string {
	if (root === '') {
		throw new DedaloError('media.not_configured', {
			message: `${door} REFUSED: no media root was given, and nothing was written.`,
		});
	}
	if (!mediaRootIsMarked(root)) {
		throw new DedaloError('media.invalid_path', {
			message: `${door} REFUSED: the media root '${root}' carries no '${TEST_MEDIA_MARKER}' marker file, so it has not declared itself a disposable test root — it may be an installation's media tree. NOTHING WAS WRITTEN. Build the suite's root with 'bun run test:db:setup' (it creates and marks it), or, for a scratch root of your own, create the marker file in it first.`,
			coordinates: { root },
		});
	}
	return root;
}

/**
 * THE ARMED door, called by every media-root resolver. Inert unless this process
 * runs under the test-media seam; then `root` must carry the marker.
 *
 * Returns `root` unchanged so a resolver can write `return assertTestMediaRoot(x, 'd')`.
 */
export function assertTestMediaRoot(root: string, door: string): string {
	if (config.media.testRoot === null) return root;
	return requireTestMediaRoot(root, door);
}

// ---------------------------------------------------------------------------
// THE JOB-REGISTRY (processes) DIRECTORY — the same law for the pfile mirror.
// ---------------------------------------------------------------------------
//
// src/core/media/jobs.ts mirrors every background job (media, export, tool
// lanes) as `<processes dir>/<job id>.json`. Its default is the INSTALLATION's
// `<privateDir>/processes`, and until 2026-09-24 nothing moved it for a test
// run: every gate that forgot DEDALO_MEDIA_PROCESSES_DIR, and the client suite's
// own server (which inherits DEDALO_TEST_MEDIA_ROOT, not that key), wrote into
// the live registry — ~5.4k suite pfiles measured there, sharing a directory
// with the dev server's real jobs and its boot reconcile.
//
// SO, UNDER THE SEAM: the default derives to the MARKED suite sibling
// `<test media root>.processes` (the export store's `<root>.export_artifacts`
// rule), an explicit DEDALO_MEDIA_PROCESSES_DIR still wins, and EITHER must
// carry `.dedalo_test_processes` or the resolver refuses before it creates,
// reads or writes anything (the door is jobs.ts assertProcessesDirDeclared).
// The engine never plants the marker: the derived dir is declared beside the
// media root by test/helpers/test_media_root.ts ensureTestMediaRoot (the
// preload, test:db:setup, the client-suite server), and a gate's scratch dir
// declares itself with markProcessesDir. Unarmed (every
// real install) this is inert and the path grammar is unchanged.

/** The marker a processes directory must carry before an armed run writes a job file into it. */
export const TEST_PROCESSES_MARKER = '.dedalo_test_processes';

// The suite sibling `<root>.processes` — re-exported from the ONE pure
// derivation the runtime-path census shares (src/core/media/processes_dir.ts).
export { testProcessesDirFor };

/**
 * The job-registry directory this process uses: explicit
 * DEDALO_MEDIA_PROCESSES_DIR (empty = unset), else (armed) the suite sibling,
 * else `<privateDir>/processes`. Pure — no IO. The inputs are passed in so the
 * caller keeps reading the explicit key per call (it is test-settable). The
 * rule itself is deriveProcessesDir — the census calls the same function.
 */
export function resolveProcessesDir(explicit: string | undefined, installDefault: string): string {
	return deriveProcessesDir(explicit, config.media.testRoot, installDefault);
}
