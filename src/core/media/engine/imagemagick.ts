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
 * PHP anchors: dd_thumb (:184), convert (:275), rotate (:697), crop (:781),
 * get_dimensions (:1027).
 */

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { config } from '../../../config/config.ts';
import { pixelAreaBudget } from '../../concepts/media.ts';
import { magickPolicyEnv, resolveIdentify, resolveMagick } from './binaries.ts';
import { probeImageSource } from './probe.ts';
import { runBinary, type SpawnResult } from './spawn.ts';

// The binary resolvers live in a leaf module so that `probe.ts` can use them
// without closing an import cycle with this file (see binaries.ts). Re-exported
// here because this is where every existing caller imports them from.
export { resolveIdentify, resolveMagick };

/**
 * Which image of a multi-image source a recipe operates on.
 *
 * - `representative` — take the source's OWN first image (`SOURCE[0]`). Correct
 *   whenever `probeImageSource().hasRepresentativeScene` is true: a merged
 *   PSD/TIFF composite, page 1 of a paged source, frame 1 of a GIF.
 * - `composite` — hand ImageMagick the whole sequence and let `-flatten` stack
 *   it. The fallback for a source that declares no representative image.
 *
 * Measured on the 2026-08-04 layered TIFFs: `[0]` vs `-flatten` differ by
 * RMSE 0.005 (an antialias halo from re-compositing already-composited content)
 * — scene 0 ALREADY contains the layers. Meanwhile a blanket `-flatten` is
 * measurably WRONG for paged/framed sources, which are allow-listed today:
 * multi-page TIFF → page 3, animated GIF → last frame, delta GIF → a stack
 * matching no frame. Hence: take the source's own image when it declares one.
 *
 * v6's `-layers merge` and `remove_layer_0` are deliberately NOT ported:
 * `-layers merge` can GROW the canvas and emit negative page offsets
 * (200x100 → 250x180, `240x120+-40+-20`), desynchronising the tier from
 * `getDimensions` and the SVG envelope; `remove_layer_0` was 59.7 % wrong here.
 */
export type SceneSelection = 'representative' | 'composite';

/** The source token a recipe feeds ImageMagick for this selection. */
export function sceneToken(source: string, selection: SceneSelection): string {
	return selection === 'representative' ? `${source}[0]` : source;
}

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
	const dot = target.lastIndexOf('.');
	// Accept a full path or a bare extension ('jpg').
	const extension = (dot >= 0 ? target.slice(dot + 1) : target).toLowerCase();
	return OPAQUE_TARGET_EXTENSIONS.has(extension) ? '#ffffff' : 'none';
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
			throw new Error(
				`ImageMagick CMYK→sRGB conversion needs the shipped ICC profile ${profile}, which is not installed`,
			);
		}
	}
	return ['-profile', CMYK_SOURCE_PROFILE, '-profile', SRGB_TARGET_PROFILE, '-strip'];
}

/** Scene/background/colorspace decisions a recipe needs from the caller's probe. */
export interface ThumbOptions {
	/** Which image of the source to thumbnail (see SceneSelection). */
	selection: SceneSelection;
	/** Flatten background — from `backgroundForTarget(target)`. */
	background: string;
	/** Inject the CMYK→sRGB ICC profiles + -strip (when the source is CMYK). */
	cmyk?: boolean;
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
		target,
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
	/** Force a specific -quality (jpeg compression); default 82 (PHP default). */
	compression?: number;
	/** Inject the CMYK→sRGB ICC profiles + -strip (when the source is CMYK). */
	cmyk?: boolean;
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
	argv.push('-quality', String(options.compression ?? 82), target);
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
		target,
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
		target,
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
	if (result.timedOut) {
		throw new Error(`ImageMagick timed out writing ${expectedOutput}`);
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
