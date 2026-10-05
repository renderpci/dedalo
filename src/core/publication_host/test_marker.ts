/**
 * The publication-hosts SCRATCH DECLARATION — a directory says it is a test's stores,
 * the same law as the suite database's `dedalo_test_marker` and the suite media root's
 * `.dedalo_test_media`: location is never the guarantee, the marker is.
 *
 * Its own module, importing nothing, because the drills declare their engine children's
 * scratch private dir BEFORE any engine module may load (loading config freezes it on the
 * first DEDALO_* it sees). registry.ts re-exports the constant. The WRITER is test/drill
 * tooling, not engine code: scripts/lib/publication_host_scratch.ts.
 *
 * Read by: registry.ts `overridePublicationHostsBaseForTests` (the in-process seam) and
 * `publicationHostsTestRefusal` (the agent door's test-process guard, rule 7 of
 * publication_host_door_tripwire).
 */

/** The marker a temp directory must carry before a test process may use it as the stores' base. */
export const PUBLICATION_HOSTS_TEST_MARKER = '.dedalo_test_publication_hosts';
