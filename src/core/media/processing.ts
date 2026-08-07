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
import { moveToDeleted, renameOldFiles } from './file_ops.ts';
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
 * Locate the best source file for regeneration — THE MASTER, in precedence
 * order (`spec.masterQualities`, highest first), preferring within each tier the
 * raw upload extension, then the normalized default extension, then the
 * allowlist. Returns the absolute path or null when no master is present.
 *
 * PRECEDENCE IS THE POINT, and it is surprising: for component_image the
 * RETOUCHED master ('modified') OUTRANKS the original, so while a retouch
 * exists EVERY derived tier is built from it — including the tiers rebuilt when
 * a NEW ORIGINAL is ingested. That is deliberate (v6
 * component_image::get_image_source, frozen class.component_image.php:1569): the
 * retouch is a human-authored better look of the image, and silently reverting
 * the web tiers to the raw scan the moment someone re-scans the object would
 * throw that work away. The ingest path names the record in a console.info when
 * this happens — see ingest/process_uploaded_file.ts — because an operator whose
 * new scan did not change the visible image must be able to find out why.
 *
 * A MASTER IS NEVER A BUILD TARGET, so this walk needs no "do not build the
 * original out of the retouch" exception: v6 needed one (get_image_source
 * :1575) because its build_version accepted a master tier as a target and would
 * happily convert modified → original. tool_media_versions' buildVersionCore
 * REFUSES a master target outright (see it), which is the same rule enforced one
 * level up, where it also stops the retouch being rebuilt out of itself.
 */
export function resolveMasterSource(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	rawExtension?: string | null,
): string | null {
	return resolveMaster(spec, identity, pathOpts, rawExtension)?.path ?? null;
}

/**
 * WHICH master tier `resolveMasterSource` resolves to. Exists so the ingest and
 * posterframe paths can SAY SO to the operator (see that function's precedence
 * note) without re-deriving the resolution rule at the call site.
 */
export function resolveMasterQuality(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	rawExtension?: string | null,
): string | null {
	return resolveMaster(spec, identity, pathOpts, rawExtension)?.quality ?? null;
}

/** The ONE master-resolution walk both accessors above read (tier, then extension). */
function resolveMaster(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	rawExtension: string | null | undefined,
): { quality: string; path: string } | null {
	const candidates = [rawExtension, spec.defaultExtension, ...spec.allowedExtensions].filter(
		(e): e is string => typeof e === 'string' && e !== '',
	);
	for (const quality of spec.masterQualities) {
		for (const extension of candidates) {
			const loc = buildMediaLocation(spec, identity, quality, extension, pathOpts);
			if (existsSync(loc.absolutePath)) return { quality, path: loc.absolutePath };
		}
	}
	return null;
}

/**
 * SAY IT OUT LOUD when the file just written into `writtenQuality` is NOT the
 * master the derived tiers will be built from.
 *
 * The retouched master outranks the original for as long as it exists, so
 * putting a fresh scan in the archive — by upload, or by writing a new av
 * posterframe — leaves the visible image unchanged. That is the intended domain
 * rule, and it is precisely the kind of outcome an operator cannot deduce from a
 * successful operation, so every path that writes a master names the record.
 *
 * Silent when the tier just written IS the resolved master (the ordinary case),
 * because a line that fires on every upload is a line nobody reads — and then
 * the one occurrence that matters is indistinguishable from the noise.
 */
export function noteOutrankingMaster(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	writtenQuality: string,
	whatWasWritten: string,
): void {
	const resolved = resolveMasterQuality(spec, identity, pathOpts);
	if (resolved === null || resolved === writtenQuality) return;
	console.info(
		`[media] ${spec.model} ${buildMediaIdentifier(identity)}: ${whatWasWritten} into '${writtenQuality}', but the '${resolved}' master outranks it — every derived tier is (re)built from '${resolved}', so the visible image does not change`,
	);
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
 * Regenerate the derivatives of an image record from its best master: default
 * quality + thumb + SVG envelope, PLUS a re-encode of every other ladder tier
 * that ALREADY EXISTS on disk. Returns the paths created. No master is touched
 * by THIS path (the one deliberate master mutation in the engine is
 * tool_image_rotation — see tools/rotation.ts, which rotates the retouched
 * master in place on purpose).
 *
 * WHY THE EXISTING HIGHER TIERS ARE RE-ENCODED (2026-08-07): this function runs
 * whenever a MASTER CHANGES — a fresh original or a fresh retouch is ingested, a
 * master is deleted and the surviving one takes over. After such a change every
 * derived tier must depict the new best master, and a '6MB' built from the
 * previous one would keep serving the previous picture forever, with a
 * files_info that reports it as present and current. An absent tier is still NOT
 * created here: tiers are minted on demand by tool_media_versions, and building
 * a 100MB derivative nobody asked for on every upload is a different decision
 * than keeping an existing one honest.
 *
 * WHAT THAT COSTS, AND WHY IT IS RECOVERABLE. A derived tier is not necessarily
 * machine-authored: tool_image_rotation rotates and crops the DERIVED tiers in
 * place, and an operator can park a curated file in any tier by uploading into
 * it. Re-encoding replaces that work. Measured before this pass: a hand-placed
 * blue '6MB' came back green (the new master) with no trace. So every file this
 * loop replaces goes to `deleted/` FIRST (renameOldFiles — the engine's
 * No-hard-delete law, PHP rename_old_files :1193) and the replacement is named
 * in a console.warn. The tiers stay honest AND the operator's bytes survive.
 *
 * The DEFAULT tier and the thumb above are deliberately NOT backed up: they have
 * been rebuilt unconditionally on every master ingest since long before this
 * change, and turning every upload on the install into deleted/ churn is a
 * different decision from making a newly-destructive loop recoverable. That
 * asymmetry is the honest state, not an oversight — see the report gap on
 * per-tier provenance, which is what would let the engine tell "machine-built"
 * from "operator-authored" and stop guessing.
 */
export async function regenerateImage(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	rawExtension?: string | null,
): Promise<string[]> {
	const master = resolveMaster(spec, identity, pathOpts, rawExtension);
	if (master === null) return [];
	const source = master.path;
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
	// Re-encode the OTHER ladder tiers that already exist, and retire the stale
	// alternate-extension twins of every derived tier (see the header note).
	// Masters are excluded — they are sources, never rebuilt — and so is the thumb
	// (built above, from the default tier, and it has no alternate twin: its
	// extension is fixed by config.media.thumb).
	const replaced: string[] = [];
	const retired: string[] = [];
	for (const quality of spec.qualities) {
		if (spec.masterQualities.includes(quality)) continue;
		if (quality === config.media.thumb.quality) continue;
		if (quality !== spec.defaultQuality) {
			const existing = buildMediaLocation(
				spec,
				identity,
				quality,
				spec.defaultExtension,
				pathOpts,
			).absolutePath;
			if (existsSync(existing)) {
				// deleted/ FIRST, then rebuild: the operator's previous bytes must
				// survive the replacement (header note). If the rebuild then fails the
				// tier is ABSENT rather than stale — which is the honest of the two
				// states, the re-scan reports it, and the backup is one move away.
				renameOldFiles(existing, new Date(), pathOpts.mediaRoot);
				created.push(await buildImageVersion(spec, identity, quality, source, pathOpts));
				replaced.push(quality);
			}
		}
		// THE ALTERNATE TWINS ARE RETIRED, NOT REBUILT, because this engine has no
		// builder for them: nothing in src/ ever writes an .avif/.png twin (v6's
		// create_alternative_version was not ported), so a twin on disk came from
		// v6 or from an operator. It now depicts a master the record no longer
		// has, and files_info reports it present and current — the panel offers a
		// cell that opens the PREVIOUS picture. Measured: 6MB.jpg went blue while
		// 6MB.avif stayed red. Serving a lie is the one thing an archive may not
		// do, so the twin goes to deleted/ and is named below.
		// GAP, stated rather than narrowed: files_info also scans the UPLOAD
		// ALLOWLIST in derived tiers, so a legacy '6MB/<id>.tif' goes just as
		// stale and is NOT retired here — only the configured alternate twins are.
		// The durable fix for both is porting an alternate-version builder.
		for (const extension of spec.alternateExtensions) {
			const twin = buildMediaLocation(spec, identity, quality, extension, pathOpts).absolutePath;
			if (!existsSync(twin)) continue;
			if (moveToDeleted(twin, { mediaRoot: pathOpts.mediaRoot }) !== null) {
				retired.push(`${quality}.${extension}`);
			}
		}
	}
	if (replaced.length > 0 || retired.length > 0) {
		// LOUD ON PURPOSE. Everything this line names was replaced or removed by a
		// master change the operator may not connect to it — a rotation or crop
		// that lived only in these tiers is gone from them. Every file is in the
		// sibling deleted/ directory under its `_deleted_<stamp>` name.
		console.warn(
			`[media] ${spec.model} ${buildMediaIdentifier(identity)}: master '${master.quality}' rebuilt the derived tiers.` +
				(replaced.length > 0 ? ` Re-encoded (previous bytes in deleted/): ${replaced.join(', ')}.` : '') +
				(retired.length > 0
					? ` Retired to deleted/ — this engine cannot rebuild them: ${retired.join(', ')}.`
					: '') +
				' Any rotation or crop applied to those tiers no longer applies to them.',
		);
	}
	return created;
}

/** Regenerate a PDF record: web copy + jpg cover + thumb. */
export async function regeneratePdf(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
): Promise<string[]> {
	const source = resolveMasterSource(spec, identity, pathOpts, 'pdf');
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
	const source = resolveMasterSource(spec, identity, pathOpts, 'svg');
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
	const source = resolveMasterSource(spec, identity, pathOpts, rawExtension);
	if (source === null) return [];
	return [
		copyToQuality(spec, identity, spec.defaultQuality, source, spec.defaultExtension, pathOpts),
	];
}
