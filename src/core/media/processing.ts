/**
 * MEDIA PROCESSING — derivative generation (PHP build_version / regenerate_component).
 *
 * Given an ORIGINAL file, build the default-quality derivative, the thumbnail,
 * and any alternate-extension versions, per type. Uses the binary adapters
 * (imagemagick/ffmpeg/pdf) over the spawn discipline. Every output goes through
 * `./atomic.ts` (temp sibling + rename + debris sweep), so a coexisting reader
 * never sees a partial derivative and a failed run leaves nothing behind
 * (Original law: the original is the source of truth and is never mutated).
 *
 * SCENE SELECTION (2026-08-04): a source can hold N images (Photoshop layers,
 * TIFF/PDF pages, GIF frames). Each recipe here PROBES its source once
 * (`./engine/probe.ts`) and hands the argv layer an explicit scene selection, a
 * flatten background and the CMYK flag. Before that, a layered TIFF made
 * ImageMagick write `<stem>-0.jpg`… instead of the temp, the rename threw ENOENT
 * and the record was left with `matrix.media` NULL.
 *
 * PHP anchors: build_version (:3543), regenerate_component (:3153),
 * component_image build_version (:1461), component_pdf create_alternative_version
 * (:1375), component_av build_version (:1437, async transcode via jobs).
 */

import { copyFileSync, existsSync } from 'node:fs';
import { config } from '../../config/config.ts';
import type { MediaTypeSpec } from '../concepts/media.ts';
import { writeAtomically, writeAtomicallySync } from './atomic.ts';
import {
	backgroundForTarget,
	buildThumb,
	convertImage,
	type SceneSelection,
	type ThumbOptions,
} from './engine/imagemagick.ts';
import { type ImageSourceProbe, probeImageSource } from './engine/probe.ts';
import {
	buildMediaIdentifier,
	buildMediaLocation,
	type MediaIdentity,
	type MediaPathOptions,
} from './path.ts';

/**
 * PDF thumbnail rasterization tunables (PHP component_pdf::create_thumb :273-275):
 * the first page is rendered at 72 dpi with jpeg quality 75. These are literals in
 * PHP (not DEDALO_* config), mirrored here verbatim.
 */
const PDF_THUMB_DENSITY = 72;
const PDF_THUMB_QUALITY = 75;

/** Resolve the media root for these path options (scratch override or config). */
function _rootOf(pathOpts: MediaPathOptions): string {
	const root = pathOpts.mediaRoot ?? config.media.rootPath;
	if (root === null || root === undefined) throw new Error('MEDIA_PATH not configured');
	return root;
}

/**
 * Turn one probe into the three decisions every image recipe needs: which image
 * of the source to take, what to composite it over, and whether to run the
 * CMYK→sRGB profile pair.
 *
 * `label` names the thing being built (a media identifier, a staging path) and
 * appears in the composite warning — a source with no representative image is
 * the ONE class the measurements do not cover empirically (a PSD saved without
 * a merged composite), so it must be visible in the log rather than inferred
 * later from a wrong-looking derivative.
 *
 * The warning is a LOG line and not a `derivativeErrors` entry on purpose: since
 * the probe rule was corrected (2026-08-04 review) this branch is only reached
 * when scene 0 is a partial patch of a SHARED page — layers of one canvas —
 * where compositing them is the right answer and `-flatten` yields exactly that
 * page. It is a judgement the operator may want to know about, not a derivative
 * that failed. Paged/multi-resolution containers, where compositing WAS
 * destructive, no longer take this branch at all.
 */
function recipeFromProbe(probe: ImageSourceProbe, target: string, label: string): ThumbOptions {
	const selection: SceneSelection = probe.hasRepresentativeScene ? 'representative' : 'composite';
	if (probe.sceneCount > 1 && selection === 'composite') {
		console.warn(
			`[media] ${label}: source declares no representative image (${probe.sceneCount} scenes, canvas ${probe.canvasWidth}x${probe.canvasHeight}) — compositing the whole stack`,
		);
	}
	return {
		selection,
		// The background is decided by the TARGET extension, never by the source's
		// alpha: what matters is what the target can store (see backgroundForTarget).
		background: backgroundForTarget(target),
		cmyk: /cmyk/i.test(probe.colorspace),
	};
}

/**
 * Thumbnail an arbitrary image file into an arbitrary target path, atomically.
 *
 * The shared "probe then buildThumb" gear for the three call sites that own a
 * raw path pair rather than a media identity: the staged-upload preview and the
 * two posterframe thumbs. Each of those sources is arbitrary bytes (a layered
 * TIFF upload, a client canvas snapshot), so none of them may assume a single
 * image. Returns the target path.
 */
export async function buildThumbAtomically(
	source: string,
	target: string,
	label: string,
): Promise<string> {
	const probe = await probeImageSource(source);
	const options = recipeFromProbe(probe, target, label);
	return writeAtomically(target, async (temp) => {
		await buildThumb(source, temp, options);
	});
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
 *
 * ONE probe supplies all three derived facts (scene selection, CMYK, source
 * dimensions) — it replaces the previous `getColorspace`/`getDimensions` pair,
 * each of which swallowed its own failure (`.catch(() => '')`). Those swallows
 * are gone: an unreadable source silently disabled the CMYK branch and the
 * resize budget, and per the ingest change it no longer costs the record its
 * index to fail here.
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
	const probe = await probeImageSource(source);
	const recipe = recipeFromProbe(probe, target, `${buildMediaIdentifier(identity)} ${quality}`);
	return writeAtomically(target, async (temp) => {
		await convertImage(source, temp, {
			quality,
			selection: recipe.selection,
			background: recipe.background,
			// The CANVAS, not scene 0's raster: a scene at a page offset makes the two
			// differ, and this must describe the file that will actually be written.
			sourceWidth: probe.canvasWidth,
			sourceHeight: probe.canvasHeight,
			cmyk: recipe.cmyk,
		});
	});
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
	if (spec.model === 'component_pdf') {
		// PHP component_pdf::create_thumb — rasterize ONLY the first page via the
		// PDF-aware convert recipe (density/antialias/cropbox), fit to the thumb box.
		// Page 1 is declared by the MODEL here, not discovered by a probe: a pdf is a
		// paged source by definition and page 1 is its cover. The selection is built
		// in exactly one place (sceneToken), so the inline scene-index suffix that
		// used to be concatenated onto the source path here is gone.
		return writeAtomically(target, async (temp) => {
			await convertImage(source, temp, {
				quality: thumbQuality,
				selection: 'representative',
				background: backgroundForTarget(target),
				pdfDensity: PDF_THUMB_DENSITY,
				thumbBox: { width: config.media.thumb.width, height: config.media.thumb.height },
				compression: PDF_THUMB_QUALITY,
			});
		});
	}
	return buildThumbAtomically(source, target, `${buildMediaIdentifier(identity)} ${thumbQuality}`);
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
	// Page 1 by model declaration (see buildThumbVersion's pdf branch).
	return writeAtomically(target, async (temp) => {
		await convertImage(source, temp, {
			quality: spec.defaultQuality,
			selection: 'representative',
			background: backgroundForTarget(target),
			pdfDensity: config.media.imagePrintDpi,
		});
	});
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
	// SYNCHRONOUS on purpose (writeAtomicallySync, not writeAtomically): this is
	// called by regenerate3d, which is itself sync and is called UNAWAITED from
	// ingest/process_uploaded_file.ts. Returning a promise from here would turn a
	// copy failure into an unhandled rejection three call sites away.
	return writeAtomicallySync(target, (temp) => {
		copyFileSync(source, temp);
	});
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
	const defaultPath = await buildImageVersion(
		spec,
		identity,
		spec.defaultQuality,
		source,
		pathOpts,
	);
	created.push(defaultPath);
	// THE THUMB'S SOURCE IS THE DEFAULT TIER, NEVER THE RAW ORIGINAL.
	// v6 component_image::create_thumb (class.component_image.php:393-431) reads
	// get_media_filepath(quality_default): single-scene, already composited, already
	// CMYK-converted, so the thumb recipe cannot meet a sequence at all.
	// repair.ts:232-233 already does this and versions.ts:87-100 already prefers it.
	created.push(await buildThumbVersion(spec, identity, defaultPath, pathOpts));
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
