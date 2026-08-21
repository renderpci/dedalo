/**
 * SCRATCH MEDIA ROOTS FOR GATES — a temp directory that has DECLARED itself one.
 *
 * A media gate builds its situation in a throwaway directory and hands it to a
 * media door as `mediaRoot`. Under the test-media seam every such door asks the
 * directory for a `.dedalo_test_media` marker before it writes
 * (src/core/media/test_media_root.ts), so a scratch root has to carry one.
 *
 * THAT IS NOT BUREAUCRACY, IT IS THE POINT. The refusal cannot ask "is this path
 * under /tmp?" — a path is a claim, and the class of accident being prevented is
 * precisely a root that LOOKS disposable and is not (a symlinked tree, a
 * `join(…, mediaDirFromConfig)` that resolved to the installation's, an env the
 * gate forgot to override). One declaration per scratch root is what makes the
 * guard total, and going through this helper is what makes the declaration
 * automatic rather than remembered.
 *
 * Use `scratchMediaRoot()` to create one, `markMediaRoot()` when the gate
 * already has a directory (a subdirectory of its own scratch tree, say).
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TEST_MEDIA_MARKER } from './test_media_root.ts';

/** Plant the marker in an existing directory (created if missing). Returns it. */
export function markMediaRoot(dir: string): string {
	mkdirSync(dir, { recursive: true });
	const marker = join(dir, TEST_MEDIA_MARKER);
	if (!existsSync(marker)) writeFileSync(marker, 'scratch media root — a test gate created this\n');
	return dir;
}

/** A fresh, MARKED scratch media root under the OS temp dir. */
export function scratchMediaRoot(prefix = 'dedalo_media_scratch_'): string {
	return markMediaRoot(mkdtempSync(join(tmpdir(), prefix)));
}

/**
 * Empty a scratch root and re-declare it — the shape a gate that resets between
 * cases needs, because `rmSync(root, {recursive:true})` takes the marker with it.
 */
export function resetMediaRoot(dir: string): string {
	rmSync(dir, { recursive: true, force: true });
	return markMediaRoot(dir);
}
