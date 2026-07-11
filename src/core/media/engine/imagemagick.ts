/**
 * IMAGEMAGICK ADAPTER — argv recipes ported from PHP class.ImageMagick.php.
 *
 * Each `build*Argv` is a PURE function returning the argument array (unit-tested
 * against the PHP command recipes without spawning); the `run*` wrappers execute
 * it via the spawn discipline (argv arrays, no shell). Outputs are written by the
 * caller to a temp name then atomically renamed.
 *
 * PHP anchors: dd_thumb (:184), convert (:275), rotate (:697), crop (:781),
 * get_media_attributes json: (:861), get_dimensions (:1027).
 */

import { existsSync } from 'node:fs';
import { config } from '../../../config/config.ts';
import { pixelAreaBudget } from '../../concepts/media.ts';
import { type SpawnResult, runBinary } from './spawn.ts';

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

/**
 * dd_thumb recipe (PHP :206-209): a shrink-only, auto-oriented, centered,
 * lightly-sharpened jpeg thumbnail. `-thumbnail 'WxH>'` (the '>' = shrink only).
 */
export function buildThumbArgv(
	source: string,
	target: string,
	width: number,
	height: number,
): string[] {
	return [
		resolveMagick(),
		'-define',
		'jpeg:size=400x400',
		source,
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
	];
}

/** Options for the central convert recipe. */
export interface ConvertOptions {
	/** Target quality name (drives the pixel-area budget when it is an MB tier). */
	quality: string;
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
	argv.push(source);
	// CMYK → sRGB via ICC profiles then strip (PHP :408-448).
	if (options.cmyk === true) {
		const iccDir = new URL('./icc/', import.meta.url).pathname;
		argv.push(
			'-profile',
			`${iccDir}Generic_CMYK_Profile.icc`,
			'-profile',
			`${iccDir}sRGB_Profile.icc`,
			'-strip',
		);
	}
	// Opaque white background flatten (jpg has no alpha) + auto-orient.
	argv.push('-background', '#ffffff', '-flatten', '-auto-orient', '-quiet');
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
 * The hardened policy.xml directory (MEDIA-02). MAGICK_CONFIGURE_PATH makes
 * ImageMagick load OUR policy first — disabling the PS/EPS/MSL/MVG/URL coders
 * and remote delegates so a hostile upload cannot reach the Ghostscript-delegate
 * RCE / SSRF / file-read vectors. Kept next to this module so it ships with the app.
 */
const IMAGEMAGICK_POLICY_DIR = new URL('./imagemagick-policy/', import.meta.url).pathname;

/** Run a magick command; non-zero exit is fatal ONLY when stderr carries 'ERROR:'. */
async function runMagick(argv: string[]): Promise<SpawnResult> {
	const result = await runBinary(argv, {
		env: { MAGICK_CONFIGURE_PATH: IMAGEMAGICK_POLICY_DIR },
	});
	if (/ERROR:/i.test(result.stderr) || /ERROR:/i.test(result.stdout)) {
		throw new Error(`ImageMagick failed: ${result.stderr || result.stdout}`);
	}
	return result;
}

export async function buildThumb(source: string, target: string): Promise<void> {
	await runMagick(
		buildThumbArgv(source, target, config.media.thumb.width, config.media.thumb.height),
	);
}

export async function convertImage(
	source: string,
	target: string,
	options: ConvertOptions,
): Promise<void> {
	await runMagick(buildConvertArgv(source, target, options));
}

export async function rotateImage(
	source: string,
	target: string,
	degrees: number,
	mode: 'expanded' | 'default' = 'expanded',
	background: string | null = '#ffffff',
): Promise<void> {
	await runMagick(buildRotateArgv(source, target, degrees, mode, background));
}

export async function cropImage(source: string, target: string, box: CropBox): Promise<void> {
	const result = await runBinary(buildCropArgv(source, target, box));
	if (/geometry does not contain image/i.test(result.stderr) || /ERROR:/i.test(result.stderr)) {
		throw new Error(`ImageMagick crop failed: ${result.stderr}`);
	}
}

/** Image dimensions with EXIF-orientation swap (PHP get_dimensions :1027). */
export async function getDimensions(source: string): Promise<{ width: number; height: number }> {
	const identify = resolveIdentify();
	const orientation = (
		await runBinary([...identify, '-format', '%[orientation]', `${source}[0]`])
	).stdout.trim();
	const width = Number(
		(await runBinary([...identify, '-format', '%w', `${source}[0]`])).stdout.trim(),
	);
	const height = Number(
		(await runBinary([...identify, '-format', '%h', `${source}[0]`])).stdout.trim(),
	);
	// LeftBottom / RightTop orientations store the image rotated 90° — swap.
	if (orientation === 'LeftBottom' || orientation === 'RightTop') {
		return { width: height, height: width };
	}
	return { width, height };
}

/** Colorspace probe (PHP :330) — used to decide the CMYK→sRGB branch. */
export async function getColorspace(source: string): Promise<string> {
	const identify = resolveIdentify();
	return (
		await runBinary([...identify, '-quiet', '-format', '%[colorspace]', `${source}[0]`])
	).stdout.trim();
}

/** Full media attributes as parsed JSON (PHP get_media_attributes json: :861). */
export async function getMediaAttributes(source: string): Promise<unknown> {
	const result = await runBinary([resolveMagick(), source, 'json:']);
	try {
		return JSON.parse(result.stdout);
	} catch {
		return null;
	}
}
