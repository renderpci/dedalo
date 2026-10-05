/**
 * Declare a scratch publication-hosts base — the ONE writer of
 * PUBLICATION_HOSTS_TEST_MARKER (src/core/publication_host/test_marker.ts explains the
 * law). Used by the test fixture seam, the pair-CLI gate's child private dir and the
 * engine/agent/probe drills' scratch private dirs. Imports nothing from the engine but
 * the constant, so a drill may call it before engine config loads.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLICATION_HOSTS_TEST_MARKER } from '../../src/core/publication_host/test_marker.ts';

/** Declare `dir` (an existing directory under the OS temp dir) a scratch publication-hosts base. */
export function declareScratchPublicationHostsDir(dir: string, who: string): void {
	writeFileSync(
		join(dir, PUBLICATION_HOSTS_TEST_MARKER),
		`scratch publication-hosts base — ${who}\n`,
	);
}
