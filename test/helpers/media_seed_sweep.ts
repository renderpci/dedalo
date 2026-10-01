/**
 * SWEEP THE MEDIA FILES A GATE SEEDED — by NAME, under a MARKED test media root.
 *
 * A media gate plants files under the lane's suite media root (or a scratch
 * root) whose names carry its own scratch identifiers (`<component>_<section>_…`,
 * a bucket folder only it writes), and removes them in afterAll by walking that
 * root. The walk lives HERE, in one module, for the reason
 * `zzarc_media_digests.ts` gives: the root is the CALLER's media root — a runtime
 * value, never a repo directory — so a walk written inside each gate made every
 * such gate a private root-chooser `census_derivation_tripwire` could not
 * evaluate. Registered there as a SHARED_LISTERS entry with no roots ("NOT a
 * corpus").
 *
 * REFUSES A ROOT WITHOUT THE `.dedalo_test_media` MARKER (throws, deletes
 * nothing): a sweep that matches by name prefix must never run over the
 * installation's media tree, whatever path a gate's config resolved to. A
 * `null` or absent root is a no-op (no media root configured, nothing seeded).
 */

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TEST_MEDIA_MARKER } from './test_media_root.ts';

/**
 * Delete every entry under `<root>/<subdir>` (recursively) that `matches`
 * accepts — a matched directory goes whole; an unmatched one is descended into.
 * Returns the paths removed, so a gate can FLOOR its cleanup: a sweep that found
 * none of the files the gate seeded walks a root the doors never wrote to.
 */
export function sweepSeededMediaEntries(
	root: string | null,
	subdir: string,
	matches: (name: string, isDirectory: boolean) => boolean,
): string[] {
	if (root === null || !existsSync(root)) return [];
	if (!existsSync(join(root, TEST_MEDIA_MARKER))) {
		throw new Error(
			`sweepSeededMediaEntries: refusing '${root}' — it carries no ${TEST_MEDIA_MARKER} marker, so it is not a test media root; nothing was deleted`,
		);
	}
	const removed: string[] = [];
	const walk = (dir: string): void => {
		if (!existsSync(dir)) return;
		for (const name of readdirSync(dir)) {
			const path = join(dir, name);
			const isDirectory = statSync(path).isDirectory();
			if (matches(name, isDirectory)) {
				rmSync(path, { recursive: true, force: true });
				removed.push(path);
			} else if (isDirectory) {
				walk(path);
			}
		}
	};
	walk(join(root, subdir));
	return removed;
}
