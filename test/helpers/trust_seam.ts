/**
 * The trust-store seam, proven on an installer CHILD's outcome.
 *
 * A developer-route install a test spawns (the CLI e2e, the resume drill) runs
 * the real `dev_trust_ca` step. It changes no trust store only because the
 * child INHERITS `DEDALO_TEST_TRUST_STORE_OFF` (test/preload/session_db.ts) —
 * and a child env that drops it (an allowlist env, a widened prefix filter)
 * once put scratch authorities into the developer's real login keychain
 * (2026-10-16). So each such run asserts the outcome: the step reported the
 * seam's reason, the certificate step really ran (the floor), and nothing was
 * recorded as added to a store.
 */

import { expect } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEV_CA_NAME } from '../../src/core/install/dev_certificate.ts';
import { readTrustRecord } from '../../src/core/install/dev_trust.ts';

export function expectTrustSeamHeld(out: string, privateDir: string): void {
	const tls = join(privateDir, 'tls');
	expect(existsSync(join(tls, DEV_CA_NAME)), 'the development certificate step ran').toBe(true);
	expect(out, 'the trust step must report the seam (the child inherited it)').toContain(
		'DEDALO_TEST_TRUST_STORE_OFF',
	);
	expect(readTrustRecord(tls), 'no trust-store entry recorded by a test install').toEqual([]);
}
