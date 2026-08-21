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
