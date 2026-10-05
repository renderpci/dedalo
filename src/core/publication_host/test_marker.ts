/**
 * The publication-hosts SCRATCH DECLARATION — a directory says it is a test's stores,
 * the same law as the suite database's `dedalo_test_marker` and the suite media root's
 * `.dedalo_test_media`: location is never the guarantee, the marker is.
 *
 * Its own module, importing nothing but node builtins, because the drills declare their
 * engine children's scratch private dir BEFORE any engine module may load (loading
 * config freezes it on the first DEDALO_* it sees). registry.ts re-exports the constant.
 *
 * Read by: registry.ts `overridePublicationHostsBaseForTests` (the in-process seam) and
 * `publicationHostsTestRefusal` (the agent door's test-process guard, rule 7 of
 * publication_host_door_tripwire).
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The marker a temp directory must carry before a test process may use it as the stores' base. */
export const PUBLICATION_HOSTS_TEST_MARKER = '.dedalo_test_publication_hosts';

/** Declare `dir` (an existing directory under the OS temp dir) a scratch publication-hosts base. */
export function declareScratchPublicationHostsDir(dir: string, who: string): void {
	writeFileSync(
		join(dir, PUBLICATION_HOSTS_TEST_MARKER),
		`scratch publication-hosts base — ${who}\n`,
	);
}
