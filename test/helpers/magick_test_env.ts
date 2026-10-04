/**
 * THE ENV A TEST'S OWN ImageMagick SPAWN CARRIES — the engine's, never the host's.
 *
 * The engine points every ImageMagick process it starts at the SHIPPED policy
 * (`magickPolicyEnv()`, src/core/media/engine/binaries.ts → MAGICK_CONFIGURE_PATH).
 * A test that builds its fixture with a bare `magick` instead runs under whatever
 * policy the HOST installed — Debian's own `policy.xml` in the CI image, Homebrew's
 * on a Mac — so the same test measures two different ImageMagicks, and a red on
 * one host is a fact about that host's package, not about the engine. The CI image
 * deliberately does NOT install the shipped policy system-wide (ci/Dockerfile: its
 * build context is that one file); the engine's spawns never needed it to.
 *
 * So a test spawn passes this env, exactly as the engine does. Gate:
 * `magick_policy_tripwire` — every ImageMagick spawn under test/ carries
 * MAGICK_CONFIGURE_PATH (directly, or through this helper / magickPolicyEnv).
 *
 * The pixel-cache spill (MAGICK_TMPDIR, required by magickPolicyEnv) goes to a
 * per-process directory under the OS temp dir: a test fixture is a few hundred
 * pixels and never spills, and the OS temp dir is the suite's scratch, not an
 * installation's database volume.
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { magickPolicyEnv } from '../../src/core/media/engine/binaries.ts';

export function magickTestEnv(): Record<string, string> {
	return magickPolicyEnv(join(tmpdir(), `dedalo-test-magick-spill-${process.pid}`));
}
