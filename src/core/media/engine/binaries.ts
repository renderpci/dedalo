/**
 * MEDIA BINARY RESOLUTION — the one place the magick/identify/qt-faststart
 * executables are located, and the one place `identify` is SPAWNED.
 *
 * (`ffmpeg`/`ffprobe` resolve inside `ffmpeg.ts`, which is their only caller.
 * `qt-faststart` resolves HERE, one layer down from its caller, because it is
 * OPTIONAL: "which binary, or none?" is a CONFIGURATION question — its answer
 * selects a whole different relocation route — and this module is where a media
 * binary's location is decided. `ffmpeg.ts` is the argv/runner layer and must not
 * also own a discovery rule.)
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
 * class the policy exists to close (the policy now denies the `gs` delegate
 * outright — engine/ghostscript.ts owns the PDF render). `probe.ts` and `file_date.ts` therefore go
 * through `runIdentify` here rather than building their own spawn — which is what
 * `media_writer_discipline_tripwire` enforces.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { config } from '../../../config/config.ts';
import { withConverterSlot } from './admission.ts';
import { runBinary, type SpawnResult } from './spawn.ts';

/** Resolve the ImageMagick binary: `magick` (v7) if present, else `convert` (v6). */
export function resolveMagick(): string {
	const magick = config.media.binaries.magick;
	if (existsSync(magick)) return magick;
	// config.media.binaries.magick is '<base>/magick'; the v6 fallback is '<base>/convert'.
	const convert = magick.replace(/magick$/, 'convert');
	return existsSync(convert) ? convert : magick;
}

/**
 * Resolve the `qt-faststart` binary, or NULL when this install does not have it.
 *
 * Discovery is the CONFIGURED path only (`DEDALO_AV_FASTSTART_PATH`, default
 * `/usr/bin/qt-faststart`) — deliberately no `$PATH` sniffing: which binary an
 * archive's derivatives were produced with must be a property of the install's
 * configuration, not of the shell environment whichever operator restarted the
 * server happened to have.
 *
 * Null is a real answer, not an error: the moov relocation has a second route
 * through ffmpeg itself (`ffmpeg.ts applyFaststart`), which is why this returns
 * null instead of the unusable path `resolveMagick` returns.
 */
export function resolveFaststart(): string | null {
	const configured = config.media.binaries.qtFaststart;
	return configured !== '' && existsSync(configured) ? configured : null;
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
 *
 * `scratchDir` IS REQUIRED, and it is the twin of the `TMPDIR` the PDF rasterizer
 * hands Ghostscript. `-limit disk` does not stop the pixel cache from spilling —
 * it BUDGETS the spill, and the budget is spent on a real filesystem: measured
 * 2026-09-05, one 2.4 MB 20000x20000 TIFF wrote 16 GiB apparent / 8.2 GiB real of
 * `magick-*` cache files. ImageMagick chooses that filesystem from
 * MAGICK_TMPDIR/TMPDIR, and the OS temp dir is, on both shipped compose stacks,
 * the volume the DATABASE lives on. Callers pass a directory INSIDE the media
 * root — the directory of the file being written or read — so a spill lands on
 * the storage the archive already sized for media, and a killed process leaves its
 * debris where the media sweeps look.
 *
 * The directory is ensured rather than trusted: an unwritable MAGICK_TMPDIR is not
 * a refusal, ImageMagick silently falls back to the OS temp dir — which is exactly
 * the state this argument exists to leave.
 */
export function magickPolicyEnv(scratchDir: string): Record<string, string> {
	mkdirSync(scratchDir, { recursive: true });
	return { MAGICK_CONFIGURE_PATH: IMAGEMAGICK_POLICY_DIR, MAGICK_TMPDIR: scratchDir };
}

/**
 * THE RESOURCE BOUND EVERY IMAGEMAGICK PROCESS RUNS UNDER (audit MEDIA-01).
 *
 * The hardened policy bounds WHAT ImageMagick may parse. It bounded nothing about
 * HOW MUCH it may allocate, and the engine passed no `-limit` anywhere: a
 * 40000x30000 solid-colour TIFF is a few MB on the wire, passes the magic-byte
 * sniff and the upload cap, and decodes to 14.4 GB RSS — on the AUTHENTICATED
 * UPLOAD REQUEST PATH, because `createStagedThumbnail` builds the preview inline.
 * The measurements are in `probe.ts`, which named this exposure in the code's own
 * words before there was anything to bound it.
 *
 * TWO HALVES, BOTH REQUIRED:
 *  - the shipped `imagemagick-policy/policy.xml` `domain="resource"` block is the
 *    HARD CEILING. A process may only lower a resource below its policy value,
 *    never raise it above (measured), and the policy also binds the ImageMagick
 *    invocations this engine does not build — an operator's shell, a maintenance
 *    `convert` — which no argv of ours can reach. It is also where the GHOSTSCRIPT
 *    DELEGATE is denied: a delegate is a child the engine never spawns, so it
 *    inherits neither of these halves and is not the process our cap kills
 *    (measured, engine/ghostscript.ts). PDF pages are rendered by gs spawned BY
 *    THE ENGINE instead;
 *  - THESE ARGV are the OPERATING limit, read from the DEDALO_MAGICK_LIMIT_*
 *    catalog keys, so an install tunes its own bound without editing a shipped
 *    file. A 40000x30000 large-format map scan IS a legitimate heritage master,
 *    so the dimension ceilings had to be configuration, not a constant.
 *
 * memory/map/area/disk DEGRADE (the pixel cache moves to disk); width/height/time
 * REFUSE. The refusing three are what stop a decode bomb, and the dimensions stop
 * it at header-parse time, before a pixel is allocated.
 *
 * POSITION IS LOAD-BEARING: these tokens go directly after the resolved binary
 * tokens and before the source path. Measured — `magick -limit width N identify
 * … file` (limits before the `identify` subcommand) fails with "no decode
 * delegate for this image format `identify'", so `runIdentify` splices AFTER
 * `resolveIdentify()`, not after `argv[0]`.
 *
 * A fresh array per call, for the same reason `magickPolicyEnv()` is: a shared
 * module-level one would be a mutable singleton every media spawn holds.
 */
export function magickResourceLimitArgs(): string[] {
	const limits = config.media.magickLimits;
	return [
		// THE SEQUENCE CEILING, and the only one of these that bounds a HEADER READ.
		// `-ping` does not decode pixels, but it still ENUMERATES EVERY SCENE, and a
		// scene is a struct: measured 2026-09-05, a hand-written 4.6 MB GIF89a of
		// 200000 1x1 frames (0.2 % of the upload cap) cost `identify -ping` 26.3 s and
		// 8.73 GB RSS under `-limit memory 2GiB` — the pixel-cache budgets never see
		// it, because scene structs are not the pixel cache. `list-length` is the one
		// limit that does: the same file under `-limit list-length 4096` is refused at
		// 180 MB ("list length exceeds limit"), and a legitimate 63-frame animation
		// still probes. It bounds `magick` too, not only `identify`, so a composite
		// recipe cannot be handed the sequence the probe refused.
		'-limit',
		'list-length',
		String(limits.listLength),
		'-limit',
		'memory',
		limits.memory,
		'-limit',
		'map',
		limits.map,
		'-limit',
		'area',
		limits.area,
		'-limit',
		'disk',
		limits.disk,
		'-limit',
		'width',
		String(limits.width),
		'-limit',
		'height',
		String(limits.height),
		'-limit',
		'time',
		String(limits.time),
	];
}

/**
 * Run `identify` under the hardened policy. `args` is everything AFTER the
 * binary (identify is read-only, so there is no output contract to prove here —
 * that is `runMagickTo`'s job in imagemagick.ts).
 *
 * `nice` is off because the callers that sit on the request path are HEADER READS
 * — `probeImageSource` (`-ping`), an EXIF date — and with the sequence ceiling in
 * `magickResourceLimitArgs()` those really are cheap; de-prioritising them only
 * lengthens the request.
 *
 * EVERY CALL HOLDS A CONVERTER PERMIT, `-ping` or not. The runner used to be
 * exempt on the argument that a header read costs ~12 ms, with the permit taken by
 * the two callers that cannot use `-ping` (`probeMetaChannels`, 7.23 s / 14.4 GB
 * RSS on a 40000x30000 TIFF, and `probeContentSpread`, statistics over a written
 * derivative). That argument was REFUTED by measurement 2026-09-05: `-ping` skips
 * the pixels but still enumerates every SCENE, so a 4.6 MB 200000-frame GIF cost
 * 26.3 s / 8.73 GB RSS on this exact argv — reachable from the authenticated
 * upload through `createStagedThumbnail`, four concurrent probes measured at four
 * concurrent identify processes. A cost that holds for typical input is not a
 * bound. Both halves are now structural: the permit is unconditional HERE, and the
 * `list-length` limit makes a header read cheap for every input, not just the
 * benign one.
 *
 * `scratchDir` is the directory ImageMagick may spill its pixel cache into: see
 * `magickPolicyEnv`. A `-ping` read never spills, but the argument is required of
 * every caller anyway — an unspilled probe costs nothing by naming a directory,
 * and an optional one would be omitted exactly where it matters.
 */
export async function runIdentify(
	args: readonly string[],
	scratchDir: string,
): Promise<SpawnResult> {
	// A CONVERTER PERMIT, UNCONDITIONALLY (engine/admission.ts). Every ImageMagick
	// spawn is a converter spawn: the `-ping` exemption this runner used to enjoy
	// was refuted by measurement (the 200000-scene GIF above — 26.3 s / 8.73 GB on
	// the argv the upload preview builds), and an exemption argued from a typical
	// cost is not a bound. The cost worry is answered where it belongs, by making
	// the read genuinely cheap: `list-length` bounds a header read BEFORE it runs,
	// so a permit here is held for milliseconds.
	//
	// NEVER NEST: no caller of this function may wrap it in its own
	// `withConverterSlot` — two permits held at once deadlock at concurrency 1.
	// `magick_policy_tripwire` asserts both halves (this runner holds one, no
	// `runIdentify` call site takes a second).
	return withConverterSlot('identify', () =>
		runBinary([...resolveIdentify(), ...magickResourceLimitArgs(), ...args], {
			nice: false,
			env: magickPolicyEnv(scratchDir),
			// The same cap `runMagickTo` uses, and for the same reason: a permit is
			// only a bound if it is released, and the default spawn budget (10 minutes)
			// outlives the `-limit time` this very argv declares.
			timeoutMs: config.media.magickLimits.time * 1000,
		}),
	);
}
