/**
 * IMAGEMAGICK ADAPTER — argv recipes ported from PHP class.ImageMagick.php.
 *
 * Each `build*Argv` is a PURE function returning the argument array (unit-tested
 * against the PHP command recipes without spawning); the `run*` wrappers execute
 * it via the spawn discipline (argv arrays, no shell). Outputs are written by the
 * caller to a temp name then atomically renamed (`../atomic.ts`).
 *
 * SCENE SELECTION (2026-08-04): an image source can hold N images — Photoshop
 * layers, TIFF/PDF pages, GIF frames. An argv that leaves N images in the
 * pipeline makes ImageMagick write N files (`<stem>-0.jpg`…) and never the bare
 * target, so EVERY recipe here names a scene and collapses the stack. See
 * `./probe.ts` for the shape abstraction and `SceneSelection` below for the rule.
 *
 * OUTPUT TOKENS (2026-08-07): every recipe's target goes through `coderToken`,
 * which states the coder explicitly (`AVIF:/abs/x.avif`) and requires an
 * absolute path. Without it ImageMagick silently writes PNG bytes under an
 * unrecognised extension — see `coderToken` for the measurement. The bare path
 * is still what `runMagickTo` receives: that is a FILESYSTEM path, not an argv
 * token.
 *
 * PHP anchors: dd_thumb (:184), convert (:275), rotate (:697), crop (:781),
 * get_dimensions (:1027).
 */

import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../../../config/config.ts';
import { pixelAreaBudget } from '../../concepts/media.ts';
import { DedaloError } from '../../errors/dedalo_error.ts';
import { magickPolicyEnv, resolveIdentify, resolveMagick } from './binaries.ts';
import { probeImageSource } from './probe.ts';
import { type SceneSelection, sceneToken } from './scene.ts';
import { describeSpawnFailure, runBinary, type SpawnResult } from './spawn.ts';

// The binary resolvers and the scene-selector token live in leaf modules so that
// `probe.ts` can use them without closing an import cycle with this file (see
// binaries.ts, scene.ts). Re-exported here because this is where every existing
// caller imports them from.
export { resolveIdentify, resolveMagick, type SceneSelection, sceneToken };

/**
 * Target extensions that CANNOT carry alpha, so a derivative must be composited
 * over an opaque background. Same rule as v6 `class.ImageMagick.php:269-273`,
 * and it subsumes v6's `is_opaque` source probe: what matters is what the target
 * can store, not what the source happens to contain.
 */
const OPAQUE_TARGET_EXTENSIONS: ReadonlySet<string> = new Set(['jpg', 'jpeg', 'bmp', 'pnm']);

/**
 * The `-background` value for a target file (or bare extension).
 *
 * This is NOT cosmetic. Bare JPEG encoding does not composite alpha: it drops
 * the alpha plane and keeps whatever hidden RGB the producing application left
 * underneath — measured as RED, BLACK and WHITE on different sources. Without
 * `-background X -flatten` every transparent-PNG thumbnail has a nondeterministic
 * background. `-alpha on/off/set` do NOT fix it; `-flatten` (or
 * `-alpha background`) does.
 */
export function backgroundForTarget(target: string): string {
	return OPAQUE_TARGET_EXTENSIONS.has(targetExtension(target)) ? '#ffffff' : 'none';
}

/**
 * The lowercase extension of a target — accepts a full path OR a bare extension
 * ('jpg'), because every caller of the three `*ForTarget` helpers has one or the
 * other and a second spelling of this two-liner is how they would drift apart.
 */
function targetExtension(target: string): string {
	const dot = target.lastIndexOf('.');
	return (dot >= 0 ? target.slice(dot + 1) : target).toLowerCase();
}

/**
 * Extension → the ImageMagick CODER NAME the engine states explicitly for it.
 *
 * Only the entries whose coder is not simply the uppercased extension, plus the
 * formats this engine itself writes — those are declared rather than derived so
 * a build that drops a convenience ALIAS cannot change what we encode. Measured
 * on IM 7.1.2-18: `JPG` and `TIF` are aliases of the `JPEG`/`TIFF` modules on
 * this box (`TIF:` and `TIFF:` wrote byte-identical files), but the canonical
 * module name is the one `-list format` prints, so that is the one we send.
 *
 * Anything not listed falls back to the UPPERCASED extension. That is not a
 * narrowing: an operator may configure any format their ImageMagick can encode,
 * and an unrecognised coder fails LOUDLY on an absolute path (measured below),
 * with `canWriteImageFormat` refusing it long before a record is touched.
 */
const CODER_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
	['jpg', 'JPEG'],
	['jpeg', 'JPEG'],
	['tif', 'TIFF'],
	['tiff', 'TIFF'],
	['png', 'PNG'],
	['webp', 'WEBP'],
	['avif', 'AVIF'],
	['heic', 'HEIC'],
	['heif', 'HEIF'],
	['gif', 'GIF'],
	['bmp', 'BMP'],
	['pnm', 'PNM'],
]);

/**
 * The OUTPUT ARGV TOKEN for a target path: `AVIF:/abs/path.avif`.
 *
 * WHY THE EXPLICIT CODER. ImageMagick picks the output format from the
 * extension, and when it does not recognise it, it does not refuse — it writes
 * SOMETHING. Measured (IM 7.1.2-18, repo policy dir, no JXL delegate):
 * `magick src.png out.jxl` exits 0 with an EMPTY stderr and leaves 316 bytes of
 * PNG in a file named `out.jxl`. That output passes `nonEmptyFile`, passes the
 * one-scene post-condition, enters files_info and is served with the wrong MIME.
 * With the coder stated, the same run fails loudly and writes nothing.
 *
 * WHY ABSOLUTE ONLY. The token is `<CODER>:<path>`, and when the coder is not
 * recognised ImageMagick treats the whole token as a FILENAME. Measured:
 * `magick src.png JXL:rel.jxl` exits 0, stderr empty, and creates a file
 * literally named `JXL:rel.jxl` in the cwd — the silent-wrong-format hazard
 * again, now with a bogus name and nothing to sweep it. The same token with an
 * absolute path (`JXL:/tmp/…/abs.jxl`) exits 1 ("unable to open image", the
 * literal name contains a directory that does not exist) and writes nothing. So
 * the absolute-path rule is what converts this whole failure class into a loud
 * one, and it is enforced here rather than trusted.
 *
 * It is FREE on the formats we already write: measured through the real 1.5MB
 * recipe, `JPEG:`/`JPG:`/`PNG:`/`WEBP:`/`AVIF:`/`TIFF:` outputs are BYTE-IDENTICAL
 * to the bare-path outputs.
 */
export function coderToken(target: string): string {
	if (!target.startsWith('/')) {
		throw new Error(
			`ImageMagick output token needs an ABSOLUTE path, got '${target}': with a relative path an unrecognised coder prefix is taken as part of the FILENAME (measured: 'JXL:rel.jxl' exits 0 and creates a file literally named 'JXL:rel.jxl')`,
		);
	}
	const slash = target.lastIndexOf('/');
	const extension = target.slice(slash + 1).includes('.') ? targetExtension(target) : '';
	if (extension === '') {
		throw new Error(
			`ImageMagick output token needs a target with an extension, got '${target}': the extension is what names the coder`,
		);
	}
	return `${CODER_BY_EXTENSION.get(extension) ?? extension.toUpperCase()}:${target}`;
}

/**
 * Target extensions whose `-quality` is NOT a lossy quality knob and must stay
 * high. See `compressionForTarget`.
 */
const HIGH_COMPRESSION_TARGET_EXTENSIONS: ReadonlySet<string> = new Set(['png', 'webp']);

/**
 * The `-quality` value for a target file (or bare extension). An EXPLICIT
 * `compression` from the caller always wins — this is the DEFAULT, not a policy
 * override.
 *
 * 82 is the PHP default and the right lossy setting for jpg/avif/tif. PNG IS THE
 * TRAP: its `-quality` is not a quality at all, it encodes `zlib_level*10 +
 * filter_type`, so 82 means "zlib level 8, filter 2" — a WORSE lossless
 * compressor than 90, on a format that cannot lose anything either way.
 * MEASURED here through the real 1.5MB recipe: the layered medal master gives
 * 721 858 B at 82 vs 535 300 B at 90 (+34.9% for nothing), and this install's
 * largest master (1849x2047) at full size gives 12 347 424 B vs 9 957 081 B
 * (+24.0%). webp's `-quality` is a genuine quality knob, but it is the alpha
 * delivery format and 90 is its usual working point.
 */
export function compressionForTarget(target: string, explicit?: number): number {
	if (explicit !== undefined) return explicit;
	return HIGH_COMPRESSION_TARGET_EXTENSIONS.has(targetExtension(target)) ? 90 : 82;
}

/**
 * The two ICC profiles shipped with the engine, absolute. They are REAL FILES in
 * `./icc/` (copied from v6's `core/media_engine/lib/color_profiles_icc/`, so the
 * recipe is byte-parity with the PHP oracle) — `media_engine.test.ts` asserts
 * both paths exist, because an argv naming a file the repo does not contain is a
 * recipe that cannot run: measured, ImageMagick then exits 1 and writes NOTHING,
 * i.e. every CMYK master would silently lose its whole derivative ladder.
 */
export const CMYK_SOURCE_PROFILE = new URL('./icc/Generic_CMYK_Profile.icc', import.meta.url)
	.pathname;
export const SRGB_TARGET_PROFILE = new URL('./icc/sRGB_Profile.icc', import.meta.url).pathname;

/** The CMYK→sRGB ICC profile pair + -strip (PHP :408-448). */
function cmykProfileArgs(): string[] {
	// Fail HERE, naming the profile, rather than through a generic "produced no
	// output file" 400 lines away: this branch is unreachable in a correct deploy,
	// so if it fires the install is missing shipped assets.
	for (const profile of [CMYK_SOURCE_PROFILE, SRGB_TARGET_PROFILE]) {
		if (!existsSync(profile)) {
			throw new DedaloError('media.engine_unavailable', {
				message: `ImageMagick CMYK→sRGB conversion needs the shipped ICC profile ${profile}, which is not installed`,
				coordinates: { profile },
			});
		}
	}
	return ['-profile', CMYK_SOURCE_PROFILE, '-profile', SRGB_TARGET_PROFILE, '-strip'];
}

/**
 * The `-channel-fx` fragment that promotes a source's FIRST meta channel to the
 * alpha plane. v6 anchor: `class.ImageMagick.php:279-284` (`$middle_flags`).
 *
 * The value carries NO quotes. v6 built a SHELL string, so it wrote
 * `-channel-fx "meta0=>alpha"`; here the argv array is handed to spawn directly,
 * and a quoted token would reach ImageMagick as the literal `"meta0=>alpha"`.
 */
const META_ALPHA_ARGS: readonly string[] = ['-channel-fx', 'meta0=>alpha'];

/**
 * Shared documentation anchor for the `applyMetaAlpha` option on both recipes.
 *
 * WHAT A META CHANNEL IS: a TIFF/PSD "extra sample" — the plane Photoshop writes
 * a saved selection or a layer mask into. ImageMagick does NOT treat it as alpha,
 * so a master whose transparency lives there renders fully opaque, retouch paint
 * and all. `meta0=>alpha` copies the first one into the alpha plane.
 *
 * THREE MEASURED PROPERTIES OF THE EXPRESSION (IM 7.1.2-18), all load-bearing:
 *
 *  1. IT READS IMAGE 0 ONLY. `magick meta.tif plain.jpg -channel-fx 'meta0=>alpha'`
 *     exits 0; reverse the order and it fails. Whether the REST of the sequence has
 *     a meta channel is irrelevant.
 *  2. IT COLLAPSES THE SEQUENCE TO ONE IMAGE. A 2-scene source in, one image out
 *     (`0|srgba 5.1`) — every image after the first is DISCARDED. This is why
 *     `processing.ts` refuses to combine it with the `composite` selection, whose
 *     whole purpose is to keep the stack for `-flatten`.
 *  3. IT HARD-FAILS WITHOUT `meta0` on image 0: `magick: missing image channel
 *     'meta0' @ error/channel.c/ChannelFxImage/318`, exit 1, NO OUTPUT FILE.
 *     Applied unconditionally it would break every ordinary image, so it MUST be
 *     probe-gated (`probeMetaChannels`). Under the runMagickTo output contract
 *     that surfaces as a loud "produced no output file", but broken is broken.
 *
 * v6 anchor `class.ImageMagick.php:276-284` knew (2): it set `$composite = false;
 * $flatten = false;` in the very same branch.
 *
 * WE APPLY IT FOR OPAQUE TARGETS TOO — deliberately unlike v6, which guarded the
 * branch with `!in_array($extension, $ar_opaque_extensions)` and therefore left
 * the jpg tiers unmasked. That guard is the reported defect: the meta channel IS
 * the transparency, so for a jpg it decides WHAT GETS COMPOSITED ONTO WHITE. The
 * masked-away region becomes background instead of surviving as paint — which is
 * the whole point of the mask.
 *
 * WHETHER THE PLANE REALLY IS A MASK IS NOT KNOWABLE FROM ITS EXISTENCE, and
 * getting that wrong blanks the picture. `processing.ts` owns the decision rules
 * and the post-condition that catches it; this module only emits the tokens.
 */
type MetaAlphaOption = boolean;

/** Scene/background/colorspace decisions a recipe needs from the caller's probe. */
export interface ThumbOptions {
	/** Which image of the source to thumbnail (see SceneSelection). */
	selection: SceneSelection;
	/** Flatten background — from `backgroundForTarget(target)`. */
	background: string;
	/** Inject the CMYK→sRGB ICC profiles + -strip (when the source is CMYK). */
	cmyk?: boolean;
	/**
	 * Promote the source's first META CHANNEL to the alpha plane before anything
	 * else touches the pipeline. See `MetaAlphaOption` above for what that is, why
	 * it MUST be probe-gated (it hard-fails and writes nothing when meta0 is
	 * absent) and why — unlike v6 — it is applied for opaque targets too.
	 */
	applyMetaAlpha?: MetaAlphaOption;
}

/**
 * dd_thumb recipe (PHP :206-209): a shrink-only, auto-oriented, centered,
 * lightly-sharpened jpeg thumbnail. `-thumbnail 'WxH>'` (the '>' = shrink only).
 *
 * `-background <bg> -flatten` sits in this recipe with TWO jobs: on a single
 * image it is the mandatory alpha composite (see `backgroundForTarget`), on N
 * images it is the stack collapse. Flattening AFTER `-thumbnail` also collapses
 * (measured), but the composite must happen BEFORE the resize for correct edge
 * geometry and so the `jpeg:size` decode hint still applies to the source.
 *
 * The CMYK trio closes a live defect: this recipe had no CMYK branch at all, so
 * every thumb built straight off a CMYK master emitted a CMYK JPEG, which
 * browsers render inverted.
 */
export function buildThumbArgv(
	source: string,
	target: string,
	width: number,
	height: number,
	options: ThumbOptions,
): string[] {
	const argv: string[] = [
		resolveMagick(),
		'-define',
		'jpeg:size=400x400',
		sceneToken(source, options.selection),
	];
	// IMMEDIATELY after the source and BEFORE the profiles and the background:
	// v6's ordering (a `$middle_flags` that precedes the background/merge). The
	// mask has to exist as alpha before anything composites against it.
	if (options.applyMetaAlpha === true) {
		argv.push(...META_ALPHA_ARGS);
	}
	if (options.cmyk === true) {
		argv.push(...cmykProfileArgs());
	}
	argv.push(
		'-background',
		options.background,
		'-flatten',
		'-thumbnail',
		`${width}x${height}>`,
		'-auto-orient',
		'-gravity',
		'center',
		'-unsharp',
		'0x.5',
		'-quality',
		'90',
		// The OUTPUT token, never the bare path — see coderToken for the measured
		// silent-wrong-format hazard it closes.
		coderToken(target),
	);
	return argv;
}

/** Options for the central convert recipe. */
export interface ConvertOptions {
	/** Target quality name (drives the pixel-area budget when it is an MB tier). */
	quality: string;
	/**
	 * Which image of the source to convert. REQUIRED (no default) so that every
	 * call site is forced by `tsc` to decide: a silent default is exactly how a
	 * layered source reached the old recipe and split into `<stem>-N.jpg`.
	 */
	selection: SceneSelection;
	/**
	 * Flatten background — `backgroundForTarget(target)`. REQUIRED for the same
	 * reason: the old literal '#ffffff' was right for the jpg tiers by accident
	 * and would silently white-out an alpha-capable target.
	 */
	background: string;
	/** Source pixel dimensions (never upscale past these). */
	sourceWidth?: number;
	sourceHeight?: number;
	/**
	 * Force a specific -quality. Default is `compressionForTarget(target)`: 82
	 * (the PHP default) for the lossy targets, 90 for png/webp — png's -quality
	 * is a zlib/filter code, not a quality, and 82 costs measured bytes.
	 */
	compression?: number;
	/** Inject the CMYK→sRGB ICC profiles + -strip (when the source is CMYK). */
	cmyk?: boolean;
	/**
	 * Promote the source's first META CHANNEL to the alpha plane before anything
	 * else touches the pipeline. See `MetaAlphaOption` above for what that is, why
	 * it MUST be probe-gated (it hard-fails and writes nothing when meta0 is
	 * absent) and why — unlike v6 — it is applied for opaque targets too.
	 */
	applyMetaAlpha?: MetaAlphaOption;
	/** PDF source: rasterization density (dpi) + cropbox. */
	pdfDensity?: number;
	/**
	 * Explicit thumbnail box (WxH, shrink-only). When set it OVERRIDES the quality
	 * pixel-area budget — for the fixed-size thumb tier whose dimensions come from
	 * config, not an MB budget (PHP create_thumb `resize` option).
	 */
	thumbBox?: { width: number; height: number };
}

/**
 * Central image conversion recipe (PHP convert :275). Builds a resize to the
 * quality's pixel-area budget without upscaling, optional CMYK→sRGB ICC
 * conversion, opaque-white flatten, and jpeg quality. This is a faithful subset
 * of the PHP builder covering the resize/colorspace path the derivative ladder
 * uses; the exotic TIFF/PSD meta-channel branches are applied by the caller via
 * extra flags when a probe detects them.
 */
export function buildConvertArgv(
	source: string,
	target: string,
	options: ConvertOptions,
): string[] {
	const argv: string[] = [resolveMagick()];
	// PDF source: density + antialias + cropbox BEFORE the input (PHP :342-351).
	if (options.pdfDensity !== undefined) {
		argv.push(
			'-density',
			String(options.pdfDensity),
			'-antialias',
			'-define',
			'pdf:use-cropbox=true',
		);
	}
	argv.push(sceneToken(source, options.selection));
	// IMMEDIATELY after the source and BEFORE the profiles and the background:
	// v6's ordering (a `$middle_flags` that precedes the background/merge). The
	// mask has to exist as alpha before -flatten composites onto the background,
	// because on an opaque target that composite is what the mask is FOR.
	if (options.applyMetaAlpha === true) {
		argv.push(...META_ALPHA_ARGS);
	}
	// CMYK → sRGB via ICC profiles then strip (PHP :408-448).
	if (options.cmyk === true) {
		argv.push(...cmykProfileArgs());
	}
	// `-background <bg> -flatten` does TWO jobs: it composites alpha onto an
	// opaque target (a bare jpg encode does not — it keeps the source's hidden
	// RGB, measured red/black/white) AND it collapses whatever images are still
	// in the pipeline into one, which is what stops a sequence source from
	// writing <stem>-0.jpg, <stem>-1.jpg… instead of the target.
	argv.push('-background', options.background, '-flatten', '-auto-orient', '-quiet');
	// Resize to the pixel-area budget, shrink-only ('>'), never upscaling.
	const geometry = resizeGeometry(options);
	if (geometry !== null) {
		argv.push('-resize', geometry);
	}
	// The compression DEFAULT is per-target (png's -quality is not a quality —
	// see compressionForTarget); an explicit options.compression still wins.
	argv.push(
		'-quality',
		String(compressionForTarget(target, options.compression)),
		coderToken(target),
	);
	return argv;
}

/**
 * Compute the resize geometry for a quality tier. Uses the pixel-area budget
 * (MB × 350000) as `@<area>` (ImageMagick area geometry), shrink-only. Returns
 * null for unbounded tiers (original/modified) — no resize.
 */
export function resizeGeometry(options: ConvertOptions): string | null {
	// An explicit thumb box (fixed WxH from config) wins over the pixel-area budget.
	if (options.thumbBox !== undefined) {
		return `${options.thumbBox.width}x${options.thumbBox.height}>`;
	}
	const budget = pixelAreaBudget(options.quality);
	if (budget === null) return null;
	// If the source area is already within budget, the '>' guard prevents upscale.
	return `@${budget}>`;
}

/** rotate recipe (PHP :697): +distort (expanded canvas) or -distort (fixed) SRT. */
export function buildRotateArgv(
	source: string,
	target: string,
	degrees: number,
	mode: 'expanded' | 'default',
	background: string | null,
): string[] {
	const argv: string[] = [resolveMagick(), source];
	if (background !== null && background !== '') {
		argv.push('-virtual-pixel', 'background', '-background', background, '-interpolate', 'Mesh');
	} else {
		argv.push(
			'-alpha',
			'set',
			'-virtual-pixel',
			'transparent',
			'-background',
			'none',
			'-interpolate',
			'Mesh',
		);
	}
	argv.push(
		mode === 'expanded' ? '+distort' : '-distort',
		'SRT',
		String(degrees),
		'+repage',
		coderToken(target),
	);
	return argv;
}

/** crop recipe (PHP :781): -crop WxH+x+y +repage. */
export interface CropBox {
	x: number;
	y: number;
	width: number;
	height: number;
}
export function buildCropArgv(source: string, target: string, box: CropBox): string[] {
	return [
		resolveMagick(),
		source,
		'-crop',
		`${box.width}x${box.height}+${box.x}+${box.y}`,
		'+repage',
		coderToken(target),
	];
}

/**
 * Crop THEN pad to a fixed canvas with a white background, gravity-centered
 * (PHP tool_import_files crop_50 :101-115 — used to bring a shorter crop up
 * to match the taller one's height so two split images read as a matched
 * pair). `extentWidth`/`extentHeight` are the FINAL canvas size; passing the
 * box's own width and a taller `extentHeight` pads vertically only, which is
 * the crop_50 use — a general caller may pad on both axes.
 */
export function buildCropAndPadArgv(
	source: string,
	target: string,
	box: CropBox,
	extentWidth: number,
	extentHeight: number,
): string[] {
	return [
		resolveMagick(),
		source,
		'-crop',
		`${box.width}x${box.height}+${box.x}+${box.y}`,
		'+repage',
		'-background',
		'white',
		'-gravity',
		'center',
		'-extent',
		`${extentWidth}x${extentHeight}`,
		coderToken(target),
	];
}

/**
 * Bilevel foreground/background mask recipe (PHP tool_import_files crop_50
 * :53 — the numisdata "split obverse/reverse" script). Grayscale, negate,
 * threshold at 5%, collapse to 1-bit: a near-white background lands at
 * gray(0), anything else (the subject) lands at gray(255). Feeds
 * `buildConnectedComponentsArgv` — this recipe alone never claims a subject
 * was found, it only prepares the mask.
 */
export function buildBilevelMaskArgv(source: string, target: string): string[] {
	return [
		resolveMagick(),
		source,
		'-colorspace',
		'gray',
		'-negate',
		'-threshold',
		'5%',
		'-type',
		'bilevel',
		coderToken(target),
	];
}

/**
 * Connected-components analysis recipe (PHP tool_import_files crop_50 :63 —
 * the numisdata script). Writes NO image (`null:` sink) — the verbose report
 * is what's wanted, on stdout, one line per labelled blob:
 *   `  <id>: <w>x<h>+<x>+<y> <cx>,<cy> <area> gray(<mean>)`
 * `areaThreshold` merges/drops components smaller than that many pixels
 * (ImageMagick's own noise floor, BEFORE this module's own dimension filter).
 * Run this one through `runBinary` directly (not `runMagickTo` — there is no
 * output file to verify) and parse the result with
 * `parseConnectedComponentsReport` (`../coin_split.ts`).
 */
export function buildConnectedComponentsArgv(source: string, areaThreshold: number): string[] {
	return [
		resolveMagick(),
		source,
		'-define',
		'connected-components:verbose=true',
		'-define',
		`connected-components:area-threshold=${areaThreshold}`,
		'-connected-components',
		'8',
		'null:',
	];
}

// -------- runners --------

/**
 * Run a magick command that must PRODUCE `expectedOutput`, and prove it did.
 *
 * The check is EXISTENCE-FIRST, not text-first, because the three failure modes
 * measured here are not distinguishable by stderr:
 *
 *  - a NON-ZERO exit that still wrote a sound file is an ImageMagick *warning*
 *    (TIFF tag noise, a truncated-but-decodable JPEG). It must not fail a
 *    conversion — the old text-only rule got this right and is preserved as a
 *    `console.warn`.
 *  - a ZERO exit with NO file is the sequence split: the pipeline held N images,
 *    ImageMagick wrote `<stem>-0.jpg`… and nothing named `<stem>.jpg`. Measured
 *    2026-08-04: exit 0, EMPTY stderr. No text check can ever see this class.
 *  - a ZERO exit with a file holding N>1 scenes is the same failure against a
 *    CONTAINER target (tif, avif): one file, three scenes. `existsSync` alone
 *    passes it, which is why the scene count is a post-condition and not a
 *    debugging aid.
 *
 * `fatalStderr` lets a caller keep its own, better diagnostic ahead of the
 * generic "produced no output" (crop's out-of-bounds geometry).
 */
async function runMagickTo(
	argv: string[],
	expectedOutput: string,
	fatalStderr?: RegExp,
): Promise<SpawnResult> {
	// `magickPolicyEnv()` (engine/binaries.ts) is the hardened policy.xml every
	// ImageMagick process in this engine loads — see that module for why the
	// identify spawns carry it too.
	const result = await runBinary(argv, { env: magickPolicyEnv() });
	// A KILLED magick, not merely a TIMED-OUT one (audit 2026-08 B2, corrected
	// 2026-08-09). `timedOut` is `capExpired && signal !== null` — a strict SUBSET
	// of the kills — so `if (result.timedOut)` let through every kill we did not
	// order, and on this engine that is the LIKELY one: the measurements in
	// `probe.ts` put a gigapixel TIFF convert at 23.8 GB RSS, which is an OOM kill,
	// not a timeout. The partial file it leaves behind is non-empty and, cut inside
	// a single-scene encode, pings back as ONE image — so the existence check passes
	// and the scene post-condition passes, and a truncated derivative is published
	// over a good one. The two conditions that made B2 invisible, met by a check
	// that only ever looked at our own cap.
	//
	// The NON-ZERO EXIT stays tolerated below (the `console.warn` path): that is a
	// real ImageMagick behaviour on sound output — TIFF-tag noise, a truncated but
	// decodable JPEG — and failing it would narrow a capability the oracle had.
	// A kill is categorically different: nothing was tolerated, the process died.
	if (result.signal !== null) {
		throw new Error(
			`ImageMagick was killed writing ${expectedOutput}: ${describeSpawnFailure(result)}`,
		);
	}
	if (fatalStderr?.test(result.stderr) === true) {
		throw new Error(`ImageMagick failed: ${result.stderr}`);
	}
	if (nonEmptyFile(expectedOutput)) {
		// A file exists: the only remaining question is whether it is ONE image.
		// A probe failure here is itself fatal — an output we cannot verify is not
		// an output we ship. The caller's atomic writer removes the temp.
		const probe = await probeImageSource(expectedOutput);
		if (probe.sceneCount === 1) {
			if (result.exitCode !== 0 || /ERROR:/i.test(result.stderr) || /ERROR:/i.test(result.stdout)) {
				console.warn(
					`ImageMagick warning (exit ${String(result.exitCode)}) writing ${expectedOutput}, output is sound: ${(
						result.stderr || result.stdout
					).slice(0, 400)}`,
				);
			}
			return result;
		}
		rmSync(expectedOutput, { force: true });
		throw new Error(
			`ImageMagick wrote ${probe.sceneCount} images into ${expectedOutput} — the source sequence was not reduced to one image (scene selection missing from the recipe)`,
		);
	}
	const swept = sweepSequenceSiblings(expectedOutput);
	throw new Error(
		`ImageMagick produced no output file ${expectedOutput} (exit ${String(result.exitCode)})${
			swept.length > 0
				? `; it wrote ${swept.length} sequence file(s) instead, now removed: ${swept.join(', ')}`
				: ''
		}: ${(result.stderr || result.stdout).slice(0, 400) || '<empty stderr>'}`,
	);
}

/** True when `path` exists and holds bytes (a 0-byte output is not an output). */
function nonEmptyFile(path: string): boolean {
	try {
		return statSync(path).size > 0;
	} catch {
		return false;
	}
}

/**
 * Remove the `<stem>-N<ext>` files ImageMagick writes when the pipeline still
 * held a sequence, and return what was removed (for the diagnostic).
 *
 * The stem is REGEX-ESCAPED: a media filename is dotted
 * (`rsc29_rsc170_440866.tmp.1234.<uuid>.jpg`) and an unescaped '.' matches any
 * character, so the pattern would reach a SIBLING RECORD's files. Every fs error
 * is swallowed — a sweep failure must never mask the real error.
 */
export function sweepSequenceSiblings(expectedOutput: string): string[] {
	// Split dir/stem/ext exactly as tempSibling does.
	const slash = expectedOutput.lastIndexOf('/');
	const dir = expectedOutput.slice(0, slash);
	const name = expectedOutput.slice(slash + 1);
	const dot = name.lastIndexOf('.');
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot) : ''; // includes the leading dot
	const pattern = new RegExp(`^${escapeRegExp(stem)}-\\d+${escapeRegExp(ext)}$`);
	const removed: string[] = [];
	try {
		for (const entry of readdirSync(dir)) {
			if (!pattern.test(entry)) continue;
			const path = `${dir}/${entry}`;
			rmSync(path, { force: true });
			removed.push(path);
		}
	} catch {
		// Unreadable dir / racing remover: report what we did manage to remove.
		return removed;
	}
	return removed;
}

/** Escape a literal string for use inside a RegExp. */
function escapeRegExp(literal: string): string {
	return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function buildThumb(
	source: string,
	target: string,
	options: ThumbOptions,
): Promise<void> {
	await runMagickTo(
		buildThumbArgv(source, target, config.media.thumb.width, config.media.thumb.height, options),
		target,
	);
}

export async function convertImage(
	source: string,
	target: string,
	options: ConvertOptions,
): Promise<void> {
	await runMagickTo(buildConvertArgv(source, target, options), target);
}

export async function rotateImage(
	source: string,
	target: string,
	degrees: number,
	mode: 'expanded' | 'default' = 'expanded',
	background: string | null = '#ffffff',
): Promise<void> {
	await runMagickTo(buildRotateArgv(source, target, degrees, mode, background), target);
}

export async function cropImage(source: string, target: string, box: CropBox): Promise<void> {
	// The out-of-bounds geometry check keeps its own message and runs FIRST: an
	// impossible crop box is a caller error, not a missing-output mystery.
	await runMagickTo(buildCropArgv(source, target, box), target, /geometry does not contain image/i);
}

/** Crop-and-pad-to-canvas (see {@link buildCropAndPadArgv}). Same geometry guard as `cropImage`. */
export async function cropAndPadImage(
	source: string,
	target: string,
	box: CropBox,
	extentWidth: number,
	extentHeight: number,
): Promise<void> {
	await runMagickTo(
		buildCropAndPadArgv(source, target, box, extentWidth, extentHeight),
		target,
		/geometry does not contain image/i,
	);
}

/** Bilevel mask (see {@link buildBilevelMaskArgv}) — a real single-image output, runs through `runMagickTo`. */
export async function buildBilevelMask(source: string, target: string): Promise<void> {
	await runMagickTo(buildBilevelMaskArgv(source, target), target);
}

/**
 * Run the connected-components analysis (see {@link buildConnectedComponentsArgv})
 * and return the RAW verbose report text. `null:` writes no file, so this goes
 * through `runBinary` directly rather than `runMagickTo` — there is nothing for
 * that runner's existence/scene-count postcondition to check. A non-zero exit or
 * a kill is always fatal here: unlike an encode, there is no "sound output despite
 * a warning exit" case for a text report — either the report is trustworthy or it
 * is not used.
 */
export async function runConnectedComponents(source: string, areaThreshold: number): Promise<string> {
	const result = await runBinary(buildConnectedComponentsArgv(source, areaThreshold), {
		env: magickPolicyEnv(),
	});
	if (!result.ok) {
		throw new Error(`ImageMagick connected-components analysis failed: ${describeSpawnFailure(result)}`);
	}
	return result.stdout;
}

/**
 * Per-PROCESS memo of "can this ImageMagick, under OUR policy, write a `.<ext>`
 * file". Keyed by the lowercase extension, value is the in-flight probe promise
 * so N concurrent uploads of the same configured format spawn ONE probe.
 *
 * ONLY A `true` IS KEPT. A positive answer really is a fact about the HOST (the
 * delegate is built in) plus the shipped policy.xml, and neither can change under
 * a running server — that is the ffmpeg.ts:cachedAudioCodec class, and caching it
 * is what keeps a bulk ingest from spawning a probe per file. A NEGATIVE is not
 * the same kind of fact: the probe is a process spawn writing into os.tmpdir(),
 * so it also fails when the fd/PID table is saturated by the very bulk ingest
 * that asked, when tmp is full, or when tmp is momentarily unwritable. Memoized,
 * one such failure would take the format out for the lifetime of the server and
 * every subsequent pass would RETIRE the twins it could no longer rebuild — a
 * transient condition turned into archive damage. Re-probing costs ~16 ms and
 * only on a box that genuinely lacks the format, where it is asked once per
 * buildAlternateVersions pass, not once per tier.
 *
 * Request-INDEPENDENT by construction: the key is a file extension and the value
 * a boolean. Allowlisted in module_state_tripwire.
 */
const writableFormatCache = new Map<string, Promise<boolean>>();

/**
 * Can this host actually WRITE `extension`? Probed by encoding a real 1x1 image
 * through the very runner the derivative ladder uses, once per process.
 *
 * WHY NOT `magick -list format`. It answers a different question. Measured on
 * IM 7.1.2-18 with the repo policy dir:
 *
 *  - it reports `PS  PS  rw+`, yet `magick src.png PS:/tmp/out.ps` exits 1 with
 *    "attempt to perform an operation not allowed by the security policy `PS'".
 *    The listing describes the BUILD; what decides is the build AND the hardened
 *    policy.xml (without MAGICK_CONFIGURE_PATH the same command exits 0 and
 *    writes 14 036 bytes — that gap is MEDIA-02's whole point).
 *  - it reports `PNG* PNG rw-` and `JPG* JPEG rw-`. The `+` is multi-image
 *    support, not writability, so a "require rw+" check would refuse PNG and
 *    JPG — the engine's own DEFAULT extension.
 *
 * A real write through `runMagickTo` asks exactly the question the caller has:
 * will the file I am about to produce exist, hold bytes, and be one image.
 * Never throws — an unwritable format is an answer, not an error.
 */
export function canWriteImageFormat(extension: string): Promise<boolean> {
	const normalized = extension.toLowerCase().replace(/^\./, '');
	const cached = writableFormatCache.get(normalized);
	if (cached !== undefined) return cached;
	const probe = probeWritableFormat(normalized);
	// The in-flight promise is cached immediately (no stampede: N concurrent first
	// callers share ONE spawn) and a `false` is DROPPED once it resolves — see the
	// cache's lifecycle note. Dropping it after resolution, not before, is what
	// keeps both properties.
	writableFormatCache.set(normalized, probe);
	const dropIfStillOurs = (): void => {
		if (writableFormatCache.get(normalized) === probe) writableFormatCache.delete(normalized);
	};
	// TWO arms, both required. This `.then` is a SECOND consumer of the shared
	// promise, so a rejection needs its own handler here or it surfaces as a
	// process-level unhandled rejection attached to no caller (under `bun test`
	// that is a file whose tests count as neither pass nor fail). And a REJECTED
	// probe must leave the cache exactly like a `false` one: memoized, a single
	// transient tmpdir error would take the format out for the process's life and
	// every later pass would retire twins it could no longer rebuild — the damage
	// the note above exists to prevent.
	void probe.then((writable) => {
		if (!writable) dropIfStillOurs();
	}, dropIfStillOurs);
	return probe;
}

/** The one 1x1 encode behind `canWriteImageFormat`. Temp removed in a finally. */
async function probeWritableFormat(extension: string): Promise<boolean> {
	// os.tmpdir(), never the media tree: a probe artefact inside a quality dir
	// would be scanned into files_info before the finally could remove it. The
	// uuid keeps two concurrent probes of the same format apart.
	const target = join(tmpdir(), `dedalo_format_probe_${randomUUID()}.${extension}`);
	try {
		// `xc:white` is a 1x1 canvas generated in-process — no source file, so the
		// probe measures the ENCODER alone. The output token carries the coder, so
		// an unrecognised format fails here instead of writing PNG bytes under the
		// configured name (see coderToken).
		await runMagickTo([resolveMagick(), '-size', '1x1', 'xc:white', coderToken(target)], target);
		return true;
	} catch {
		return false;
	} finally {
		// `force` swallows ENOENT only: EACCES/EPERM/EISDIR on the tmp target
		// would still throw OUT of the finally and reject a promise whose whole
		// contract is "never throws — an unwritable format is an answer". The
		// leftover 1x1 file is inert (os.tmpdir(), uuid-named), the exception is
		// not.
		try {
			rmSync(target, { force: true });
		} catch {
			/* the probe's ANSWER outranks its own cleanup */
		}
	}
}

/**
 * Refuse a target extension this host cannot encode, LOUDLY and before anything
 * is written. `context` names who asked (the config key, the tier) so the
 * operator reads why the engine was asked for a format it cannot produce —
 * a format configured but silently not built is the defect class this whole
 * subsystem exists to end.
 */
export async function assertWritableTargetExtension(
	extension: string,
	context?: string,
): Promise<void> {
	if (await canWriteImageFormat(extension)) return;
	throw new DedaloError('media.engine_unavailable', {
		message: `ImageMagick on this host cannot write '.${extension}' files (probed with a real 1x1 encode under the hardened policy)${
			context === undefined || context === '' ? '' : ` — requested by ${context}`
		}`,
		coordinates: { extension },
	});
}

/**
 * Image dimensions with EXIF-orientation swap (PHP get_dimensions :1027).
 *
 * Returns the probe's CANVAS (the union of the page boxes), not scene 0's pixel
 * size: a scene sitting at a `+50+30` offset inside a larger page makes the two
 * differ, and the callers of this function set the resize budget and the SVG
 * envelope — both of which must describe the file that will actually be written.
 */
export async function getDimensions(source: string): Promise<{ width: number; height: number }> {
	const probe = await probeImageSource(source);
	// LeftBottom / RightTop orientations store the image rotated 90° — swap.
	if (probe.orientation === 'LeftBottom' || probe.orientation === 'RightTop') {
		return { width: probe.canvasHeight, height: probe.canvasWidth };
	}
	return { width: probe.canvasWidth, height: probe.canvasHeight };
}
