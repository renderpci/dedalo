/**
 * MEDIA PROCESSING — derivative generation (PHP build_version / regenerate_component).
 *
 * Given an ORIGINAL file, build the default-quality derivative, the thumbnail,
 * and any alternate-extension versions, per type. Uses the binary adapters
 * (imagemagick/ffmpeg/pdf) over the spawn discipline. Outputs are written to a
 * temp name in the destination dir then atomically renamed, so a coexisting PHP
 * reader never sees a partial derivative (Original law: the original is the
 * source of truth and is never mutated).
 *
 * PHP anchors: build_version (:3543), regenerate_component (:3153),
 * component_image build_version (:1461), component_pdf create_alternative_version
 * (:1375), component_av build_version (:1437, async transcode via jobs).
 */

import { copyFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../../config/config.ts';
import { type MediaTypeSpec, pixelAreaBudget } from '../concepts/media.ts';
import { buildThumb, convertImage, getColorspace, getDimensions } from './engine/imagemagick.ts';
import { type MediaIdentity, type MediaPathOptions, buildMediaLocation } from './path.ts';

/**
 * PDF thumbnail rasterization tunables (PHP component_pdf::create_thumb :273-275):
 * the first page is rendered at 72 dpi with jpeg quality 75. These are literals in
 * PHP (not DEDALO_* config), mirrored here verbatim.
 */
const PDF_THUMB_DENSITY = 72;
const PDF_THUMB_QUALITY = 75;

/** Resolve the media root for these path options (scratch override or config). */
function rootOf(pathOpts: MediaPathOptions): string {
	const root = pathOpts.mediaRoot ?? config.media.rootPath;
	if (root === null || root === undefined) throw new Error('MEDIA_PATH not configured');
	return root;
}

/**
 * A unique temp path in the same dir as `target` (atomic-rename staging). The
 * temp name MUST keep the target's extension: ImageMagick/ffmpeg infer the
 * OUTPUT FORMAT from the filename extension, so a temp like `x.jpg.tmp.123`
 * would make ImageMagick fall back to the SOURCE format (e.g. write TIFF bytes
 * into a `.jpg` file — which browsers can't display). Insert the uniqueness
 * BEFORE the extension: `<stem>.tmp.<pid>.<rand>.<ext>`.
 */
function tempSibling(target: string): string {
	const slash = target.lastIndexOf('/');
	const dir = target.slice(0, slash);
	const name = target.slice(slash + 1);
	const dot = name.lastIndexOf('.');
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot) : ''; // includes the leading dot
	const unique = `${process.pid}.${globalThis.performance.now().toString(36).replace('.', '')}`;
	return `${dir}/${stem}.tmp.${unique}${ext}`;
}

/** Ensure the parent dir of `absolutePath` exists. */
function ensureDir(absolutePath: string): void {
	const dir = dirname(absolutePath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o775 });
}

/**
 * Locate the best source file for regeneration: the original quality, preferring
 * the raw upload extension, then the normalized default extension. Returns the
 * absolute path or null when no original is present.
 */
export function resolveOriginalSource(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	rawExtension?: string | null,
): string | null {
	const candidates = [rawExtension, spec.defaultExtension, ...spec.allowedExtensions].filter(
		(e): e is string => typeof e === 'string' && e !== '',
	);
	for (const extension of candidates) {
		const loc = buildMediaLocation(spec, identity, spec.originalQuality, extension, pathOpts);
		if (existsSync(loc.absolutePath)) return loc.absolutePath;
	}
	return null;
}

/**
 * Build one image quality derivative from the source (PHP component_image
 * convert_quality). Resizes to the quality's pixel-area budget (never upscaling),
 * converting CMYK→sRGB when detected. Writes atomically. Returns the target path.
 */
export async function buildImageVersion(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	quality: string,
	source: string,
	pathOpts: MediaPathOptions,
): Promise<string> {
	const target = buildMediaLocation(
		spec,
		identity,
		quality,
		spec.defaultExtension,
		pathOpts,
	).absolutePath;
	ensureDir(target);
	const temp = tempSibling(target);
	const colorspace = await getColorspace(source).catch(() => '');
	const dims =
		pixelAreaBudget(quality) !== null
			? await getDimensions(source).catch(() => undefined)
			: undefined;
	await convertImage(source, temp, {
		quality,
		sourceWidth: dims?.width,
		sourceHeight: dims?.height,
		cmyk: /cmyk/i.test(colorspace),
	});
	renameSync(temp, target);
	return target;
}

/** Build the thumbnail (PHP create_thumb): dd_thumb recipe, atomic write. */
export async function buildThumbVersion(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	source: string,
	pathOpts: MediaPathOptions,
): Promise<string> {
	const thumbQuality = config.media.thumb.quality;
	const thumbExtension = config.media.thumb.extension;
	const target = buildMediaLocation(
		spec,
		identity,
		thumbQuality,
		thumbExtension,
		pathOpts,
	).absolutePath;
	ensureDir(target);
	const temp = tempSibling(target);
	if (spec.model === 'component_pdf') {
		// PHP component_pdf::create_thumb — rasterize ONLY the first page ([0]) via
		// the PDF-aware convert recipe (density/antialias/cropbox), fit to the thumb
		// box. The image dd_thumb recipe emits no scene selector, so a multi-page PDF
		// makes ImageMagick write <stem>-0.jpg/<stem>-1.jpg… and never the bare
		// <stem>.jpg the rename below expects → ENOENT (PHP guards with ar_layers=[0]).
		await convertImage(`${source}[0]`, temp, {
			quality: thumbQuality,
			pdfDensity: PDF_THUMB_DENSITY,
			thumbBox: { width: config.media.thumb.width, height: config.media.thumb.height },
			compression: PDF_THUMB_QUALITY,
		});
	} else {
		await buildThumb(source, temp);
	}
	renameSync(temp, target);
	return target;
}

/** Rasterize the PDF's first page to the jpg cover (PHP create_alternative_version). */
export async function buildPdfCover(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	source: string,
	pathOpts: MediaPathOptions,
): Promise<string> {
	const target = buildMediaLocation(
		spec,
		identity,
		spec.defaultQuality,
		'jpg',
		pathOpts,
	).absolutePath;
	ensureDir(target);
	const temp = tempSibling(target);
	await convertImage(`${source}[0]`, temp, {
		quality: spec.defaultQuality,
		pdfDensity: config.media.imagePrintDpi,
	});
	renameSync(temp, target);
	return target;
}

/** Copy the original to a target quality with the same extension (PHP base build_version copy). */
export function copyToQuality(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	quality: string,
	source: string,
	extension: string,
	pathOpts: MediaPathOptions,
): string {
	const target = buildMediaLocation(spec, identity, quality, extension, pathOpts).absolutePath;
	ensureDir(target);
	const temp = tempSibling(target);
	copyFileSync(source, temp);
	renameSync(temp, target);
	return target;
}

/**
 * Regenerate all derivatives for an image record: default quality + thumb.
 * (Higher tiers are built on demand by tool_media_versions.) Returns the paths
 * created. The original is never touched.
 */
export async function regenerateImage(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	rawExtension?: string | null,
): Promise<string[]> {
	const source = resolveOriginalSource(spec, identity, pathOpts, rawExtension);
	if (source === null) return [];
	const created: string[] = [];
	created.push(await buildImageVersion(spec, identity, spec.defaultQuality, source, pathOpts));
	created.push(await buildThumbVersion(spec, identity, source, pathOpts));
	// The edit view renders the raster through an SVG envelope (PHP
	// component_image regenerate re-creates it); without it the client falls back
	// to the placeholder and the image never shows. Built from the default tier.
	const { createDefaultSvgFile } = await import('./svg_overlay.ts');
	const svgPath = await createDefaultSvgFile(spec, identity, pathOpts);
	if (svgPath !== null) created.push(svgPath);
	return created;
}

/** Regenerate a PDF record: web copy + jpg cover + thumb. */
export async function regeneratePdf(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
): Promise<string[]> {
	const source = resolveOriginalSource(spec, identity, pathOpts, 'pdf');
	if (source === null) return [];
	const created: string[] = [];
	created.push(copyToQuality(spec, identity, spec.defaultQuality, source, 'pdf', pathOpts));
	created.push(await buildPdfCover(spec, identity, source, pathOpts));
	created.push(await buildThumbVersion(spec, identity, source, pathOpts));
	return created;
}

/** Regenerate an SVG record: web copy + raster thumb. */
export async function regenerateSvg(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
): Promise<string[]> {
	const source = resolveOriginalSource(spec, identity, pathOpts, 'svg');
	if (source === null) return [];
	const created: string[] = [];
	created.push(copyToQuality(spec, identity, spec.defaultQuality, source, 'svg', pathOpts));
	return created;
}

/** Regenerate a 3D record: web copy (converters are ledgered PHP-dead — naive copy). */
export function regenerate3d(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	rawExtension: string,
): string[] {
	const source = resolveOriginalSource(spec, identity, pathOpts, rawExtension);
	if (source === null) return [];
	return [
		copyToQuality(spec, identity, spec.defaultQuality, source, spec.defaultExtension, pathOpts),
	];
}
