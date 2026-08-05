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
import {
	canCarryMetaChannel,
	type ImageSourceProbe,
	probeContentSpread,
	probeImageSource,
	probeMetaChannels,
} from './engine/probe.ts';
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
async function recipeFromProbe(
	probe: ImageSourceProbe,
	source: string,
	target: string,
	label: string,
): Promise<ThumbOptions> {
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
		applyMetaAlpha: await shouldApplyMetaAlpha(probe, source, selection, label),
	};
}

/**
 * Below this standard deviation a derivative carries no picture at all — it is one
 * flat colour. 0.01 is 1 % of the dynamic range.
 *
 * MEASURED separation on written jpgs (the numbers this threshold sits between):
 *
 *   medal master 440866, correct mask   0.190   ← must pass
 *   medal master 440867, correct mask   0.189   ← must pass
 *   ————————————————————————— 0.01 —————————————————————————
 *   inverted saved selection            0.0038  ← must be refused
 *   empty (all-black) extra sample      0       ← must be refused
 *   spot-ink plate promoted as a mask   0       ← must be refused
 *
 * 19x of headroom below the real masters, 2.6x above the worst destructive case.
 */
const MASK_DEGENERATE_SPREAD = 0.01;

/**
 * Decide whether `-channel-fx meta0=>alpha` belongs in this recipe.
 *
 * WHY IT EXISTS: Photoshop stores a saved selection / layer mask as a TIFF extra
 * sample (a "meta channel"), and ImageMagick does not read that as transparency —
 * it renders the image opaque. On the 2026-08-04 medal masters scene 0's meta
 * channel IS the medal silhouette; unapplied, the retouch paint that sits outside
 * the silhouette survives into every tier (the reported blue blobs). Applied, the
 * derivative is cut at the edge of the medal, which is what the master says.
 *
 * THIS IS AN INFERENCE, NOT A FACT THE FILE STATES. `tiffinfo` on those very
 * masters prints `Extra Samples: 1<unspecified>`: the format declares the plane
 * has NO declared meaning. (When a TIFF does declare an extra sample to be alpha —
 * ExtraSamples 1 or 2 — ImageMagick promotes it to a real alpha plane itself and
 * no meta channel is reported, so a meta channel is by construction always an
 * `unspecified` one.) Photoshop puts other things there, and the rules below plus
 * the post-condition in `writeGuardedAgainstABlankingMask` are what keep a wrong
 * guess from destroying a record. Every refusal is LOUD.
 *
 * THE RULES, each with the measurement that forces it:
 *
 *  - NEVER ON 'composite'. `-channel-fx` COLLAPSES the image list to image 0.
 *    Measured: a 2-scene source (layer 0 red, layer 1 green, both `srgb 4.1`)
 *    flattened WITHOUT the fx gives p(50,50) = srgb(0,128,1), the composited
 *    stack; WITH the fx it gives srgb(254,0,0) — layer 1 silently discarded,
 *    exit 0, one file, and the `-flatten` that follows has nothing left to
 *    composite. The composite selection exists precisely to keep the stack, so the
 *    two are mutually exclusive. v6 agreed: `class.ImageMagick.php:276-281` sets
 *    `$composite = false; $flatten = false;` in this branch.
 *  - EXACTLY ONE META CHANNEL. With two (`srgb 5.2`) `meta0` is whichever plane
 *    the producing application happened to write first. Measured on a master whose
 *    meta0 is a spot-ink plate and whose meta1 is the real silhouette: promoting
 *    meta0 yields a COMPLETELY BLANK white derivative (std 0, mean 1), and simply
 *    reversing the channel order renders correctly. The engine cannot inspect that
 *    order, so a multi-meta source is unknowable and must fall through unmasked.
 *    v6 said the same in a comment ("multiple meta channels are not supported")
 *    but never checked; this refuses, and says so.
 *  - TRUE ALPHA WINS. When image 0 carries a real alpha plane AND a meta channel,
 *    do not apply the fx: it OVERWRITES the alpha plane, so v6's rule would
 *    destroy real transparency with whatever selection a retoucher had saved. The
 *    alpha plane is the unambiguous carrier; the meta channel is only a stand-in
 *    for a source that has none.
 *  - ONLY FOR CONTAINERS THAT CAN CARRY ONE, so the expensive count is never asked
 *    for a JPEG/PNG/GIF. See `probeMetaChannels` for what asking costs.
 *
 * EXPORTED FOR ITS GATE. The 'composite' rule cannot be reached end-to-end with the
 * containers ImageMagick can WRITE on this box — a TIFF does not round-trip page
 * offsets (so its scene 0 is always full-frame and the probe never selects
 * composite) and IM's PSD writer drops meta channels — so the rule is gated here,
 * on the function that owns it, plus a companion gate that reproduces the damage it
 * prevents. A real Photoshop-authored PSD is not bound by IM's writer limits, which
 * is exactly why the rule is not left to chance.
 */
export async function shouldApplyMetaAlpha(
	probe: ImageSourceProbe,
	source: string,
	selection: SceneSelection,
	label: string,
): Promise<boolean> {
	if (selection === 'composite') return false;
	if (probe.scenes[0] === undefined) return false;
	if (!canCarryMetaChannel(probe)) return false;
	// ALPHA IS READ FROM THIS CALL, NOT FROM `probe.scenes[0].hasAlpha`. `-ping`
	// under-reports alpha on a TIFF that stores it as an extra sample — measured
	// `srgb 3.0` under -ping against `srgba 5.1` on a full read, i.e. the -ping
	// probe sees neither the alpha nor the meta channel. Deciding "true alpha wins"
	// from the -ping flag would apply the fx to exactly those files and overwrite a
	// real alpha plane, which is the damage the rule exists to prevent.
	const { metaChannels, hasAlpha } = await probeMetaChannels(source);
	if (hasAlpha) return false;
	if (metaChannels === 1) return true;
	if (metaChannels > 1) {
		// Loud, per the "never silently narrow scope" law: this source HAS a mask the
		// engine is choosing not to apply, and the operator is the only one who can
		// say which plane it is.
		console.warn(
			`[media] ${label}: source carries ${metaChannels} meta channels — cannot tell which is the transparency mask, so NONE is applied and the derivative keeps everything the master shows`,
		);
	}
	return false;
}

/**
 * Write a derivative that may have a promoted meta channel in it, and REFUSE to
 * ship the result if that promotion blanked the picture.
 *
 * WHY THIS EXISTS: "the file has an extra sample" does not mean "the extra sample
 * is a keep-mask". Measured, end-to-end, all exiting 0 with a file written:
 *
 *   - an EMPTY extra sample (a channel Photoshop initialised to black, never
 *     painted) → derivative mean 1.000, std 0 — a pure white rectangle;
 *   - an INVERTED saved selection (the ordinary "select the background, save
 *     selection" workflow) → mean 0.9995, std 0.0038 — the object erased;
 *   - a spot/ink plate in meta0 → mean 1.000, std 0.
 *
 * Without this guard each of those silently replaces a record's default tier, its
 * thumb and its SVG envelope with a blank the moment tool_update_cache sweeps the
 * archive, and nothing anywhere says so. That is the worst failure a heritage
 * engine can have, so the promotion is verified rather than trusted.
 *
 * The fallback is not a failure path: rebuilding WITHOUT the mask yields exactly
 * what this engine shipped before the promotion existed, and exactly what v6
 * shipped for jpg tiers. A genuinely blank master stays blank either way, so the
 * check cannot invent damage — it can only decline to cause it.
 *
 * RESIDUAL, KNOWN-OPEN: this catches a mask that destroys the WHOLE picture, not
 * one that damages part of it. An inverted selection over a busy background leaves
 * a non-uniform derivative and passes here. Detecting that needs a judgement about
 * which region is the subject, which no measurement on this box supports today.
 */
async function writeGuardedAgainstABlankingMask(
	temp: string,
	label: string,
	applyMetaAlpha: boolean,
	build: (applyMetaAlpha: boolean) => Promise<void>,
): Promise<void> {
	await build(applyMetaAlpha);
	if (!applyMetaAlpha) return;
	const spread = await probeContentSpread(temp);
	// A measurement we could not take is NOT evidence of damage: never condemn a
	// derivative on a failed identify.
	if (spread === null || spread >= MASK_DEGENERATE_SPREAD) return;
	console.warn(
		`[media] ${label}: the source's meta channel is not a transparency mask — promoting it left a blank derivative (pixel spread ${spread.toFixed(4)} < ${String(MASK_DEGENERATE_SPREAD)}); rebuilding WITHOUT it, so the tier shows everything the master shows`,
	);
	await build(false);
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
	const options = await recipeFromProbe(probe, source, target, label);
	return writeAtomically(target, async (temp) => {
		// The guard runs INSIDE the atomic write, against the temp: a blanked thumb is
		// discarded and rebuilt before anything is renamed into place, so no reader
		// ever sees it.
		await writeGuardedAgainstABlankingMask(
			temp,
			label,
			options.applyMetaAlpha === true,
			async (applyMetaAlpha) => {
				await buildThumb(source, temp, { ...options, applyMetaAlpha });
			},
		);
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
	const label = `${buildMediaIdentifier(identity)} ${quality}`;
	const recipe = await recipeFromProbe(probe, source, target, label);
	return writeAtomically(target, async (temp) => {
		// The guard runs INSIDE the atomic write, against the temp (see
		// writeGuardedAgainstABlankingMask): a mask that blanked the tier is
		// discarded and rebuilt before the rename, so the archive never holds it.
		await writeGuardedAgainstABlankingMask(
			temp,
			label,
			recipe.applyMetaAlpha === true,
			async (applyMetaAlpha) => {
				await convertImage(source, temp, {
					quality,
					selection: recipe.selection,
					background: recipe.background,
					// The CANVAS, not scene 0's raster: a scene at a page offset makes the two
					// differ, and this must describe the file that will actually be written.
					sourceWidth: probe.canvasWidth,
					sourceHeight: probe.canvasHeight,
					cmyk: recipe.cmyk,
					applyMetaAlpha,
				});
			},
		);
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
