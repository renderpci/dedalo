/**
 * IMAGEMAGICK BINARY RESOLUTION — the one place the magick/identify executables
 * are located, and the one place `identify` is SPAWNED.
 *
 * These two resolvers used to live in `imagemagick.ts`. They were extracted
 * because BOTH layers need them and those layers depend on each other in ONE
 * direction only:
 *
 *   imagemagick.ts (argv + runners) ──▶ probe.ts (source shape)
 *
 * `runMagickTo` probes what it just wrote (the scene-count post-condition), so
 * the argv layer imports the probe. If the probe had to import `resolveIdentify`
 * back from `imagemagick.ts` that edge would CLOSE a static-import cycle, which
 * `test/unit/import_scc_tripwire.test.ts` fails by design (any value-import SCC
 * of size >1). A third, leaf module is the seam that keeps the graph acyclic.
 *
 * `imagemagick.ts` re-exports both names, so every existing import site
 * (`file_date.ts`, `tools/rotation.ts`, the media test suites) is unchanged —
 * link, never duplicate.
 *
 * IT ALSO OWNS THE `identify` SPAWN (2026-08-04). Every ImageMagick process must
 * load the hardened `policy.xml` (MEDIA-02): ImageMagick dispatches by CONTENT,
 * not by the claimed extension, so `identify -ping` on a file named `.png` whose
 * bytes are PostScript selects the PS coder — measured: `magick identify -ping`
 * reports `PS` and exits 0 without the policy, and is refused with
 * "not allowed by the security policy 'PS'" with it. That path is reachable from
 * an authenticated upload (`createStagedThumbnail` probes the raw staged bytes),
 * so an unpoliced identify would re-open the CVE-2018-16509 Ghostscript-delegate
 * class the policy exists to close. `probe.ts` and `file_date.ts` therefore go
 * through `runIdentify` here rather than building their own spawn — which is what
 * `media_writer_discipline_tripwire` enforces.
 */

import { existsSync } from 'node:fs';
import { config } from '../../../config/config.ts';
import { runBinary, type SpawnResult } from './spawn.ts';

/** Resolve the ImageMagick binary: `magick` (v7) if present, else `convert` (v6). */
export function resolveMagick(): string {
	const magick = config.media.binaries.magick;
	if (existsSync(magick)) return magick;
	// config.media.binaries.magick is '<base>/magick'; the v6 fallback is '<base>/convert'.
	const convert = magick.replace(/magick$/, 'convert');
	return existsSync(convert) ? convert : magick;
}

/** Resolve the identify binary: `magick identify` (v7) or `identify` (v6). */
export function resolveIdentify(): string[] {
	const magick = config.media.binaries.magick;
	if (existsSync(magick)) return [magick, 'identify'];
	const identify = config.media.binaries.identify;
	return [identify];
}

/** True when the resolved identify binary is actually installed on this host. */
export function identifyAvailable(): boolean {
	return existsSync(resolveIdentify()[0] as string);
}

/**
 * The hardened policy.xml directory (MEDIA-02). MAGICK_CONFIGURE_PATH makes
 * ImageMagick load OUR policy FIRST — disabling the PS/EPS/XPS/MSL/MVG/URL
 * coders and the remote delegates, so a hostile upload cannot reach the
 * Ghostscript-delegate RCE / SSRF / file-read vectors. Kept next to this module
 * so it ships with the app.
 */
const IMAGEMAGICK_POLICY_DIR = new URL('./imagemagick-policy/', import.meta.url).pathname;

/**
 * The env EVERY ImageMagick spawn must carry. A fresh object per call: a shared
 * module-level one would be a mutable singleton every media spawn shares.
 */
export function magickPolicyEnv(): Record<string, string> {
	return { MAGICK_CONFIGURE_PATH: IMAGEMAGICK_POLICY_DIR };
}

/**
 * Run `identify` under the hardened policy. `args` is everything AFTER the
 * binary (identify is read-only, so there is no output contract to prove here —
 * that is `runMagickTo`'s job in imagemagick.ts).
 *
 * `nice` is off because the callers that sit on the request path are HEADER READS
 * — `probeImageSource` (`-ping`), an EXIF date — measured at ~12 ms, and
 * de-prioritising those only lengthens the request.
 *
 * TWO CALLERS ARE NOT HEADER READS and must stay deliberate about it:
 * `probeMetaChannels` (cannot use `-ping`, measured 7.23 s / 14.4 GB RSS on a
 * 40000x30000 TIFF) and `probeContentSpread` (statistics over a written
 * derivative). Both are gated to the rare paths that need them — see their own doc
 * comments in probe.ts. If a THIRD non-ping caller ever appears here, `nice` stops
 * being obviously right.
 */
export async function runIdentify(args: readonly string[]): Promise<SpawnResult> {
	return runBinary([...resolveIdentify(), ...args], {
		nice: false,
		env: magickPolicyEnv(),
	});
}
