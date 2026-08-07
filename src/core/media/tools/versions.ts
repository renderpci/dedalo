/**
 * tool_media_versions core (PHP tool_media_versions).
 *
 * get_files_info (re-scan), build_version (one quality derivative; av async via
 * the job manager), delete_version / delete_quality (soft-delete), sync_files
 * (re-scan → the fresh files_info). No MASTER tier is ever a build target here
 * (buildVersionCore refuses one), and the archival original is never mutated.
 */

import { existsSync } from 'node:fs';
import { config } from '../../../config/config.ts';
import { assertValidQuality, type MediaTypeSpec } from '../../concepts/media.ts';
import { submitAvVersionBuild } from '../av_versions.ts';
import { conformHeader } from '../engine/ffmpeg.ts';
import { moveToDeleted } from '../file_ops.ts';
import { type FileInfoEntry, type ScanContext, scanFilesInfo } from '../files_info.ts';
import { buildMediaLocation, type MediaIdentity, type MediaPathOptions } from '../path.ts';
import {
	buildImageVersion,
	buildPdfCover,
	buildThumbVersion,
	copyToQuality,
	regenerateImage,
	regeneratePdf,
	regenerateSvg,
	resolveMasterSource,
} from '../processing.ts';
import { buildAvThumbFromPosterframe } from './posterframe.ts';
import { applyRotationCore } from './rotation.ts';

/**
 * Re-scan and return the current files_info (get_files_info / sync_files).
 * `context` carries the stored data[0] cues (external_source, original/modified
 * normalized names) so external media and the raw-original twin resolve exactly
 * as PHP get_files_info does.
 */
export function getFilesInfoCore(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	context: ScanContext = {},
): FileInfoEntry[] {
	return scanFilesInfo(spec, identity, pathOpts, context);
}

export interface BuildVersionResult {
	built: string[];
	jobId: string | null;
}

/**
 * Build one quality DERIVATIVE from the best master (PHP build_version). Image
 * tiers resize; the thumb tier thumbnails; pdf 'web' copies + covers; av
 * transcodes via the job manager (returns a job id). Throws on an unknown
 * quality, a master target, or a missing master.
 *
 * A MASTER IS NEVER A BUILD TARGET (2026-08-07). A master is authored — uploaded
 * by a person — never generated, which is what makes it a master; the retouched
 * tier means "a human retouched this object", and a machine-made file there is a
 * lie about provenance that then OUTRANKS the archival original as the source of
 * every other tier. Without this refusal the panel's build gear on the retouched
 * row was live and self-destructive: MEASURED, one click on a delivered retouch
 * (jpeg quality 100, 3,169,136 bytes) resolved that very file as its own source
 * and rewrote it at quality 82, 1,798,308 bytes — the human's master destroyed,
 * irreversibly, by a button that looked like every other build button.
 *
 * v6 allowed it (build_version had a master-target branch, frozen
 * class.component_image.php:1391 — no resize, quality 100) and its
 * get_image_source needed a special case at :1575 to stop 'original' being
 * built out of 'modified'. Refusing the whole class here is the same rule with
 * no exceptions to keep in step, and it also removes the self-source. The
 * client already hides the gear for the literal 'original'
 * (render_tool_media_versions.js:1147); this is the chokepoint that does not
 * depend on a hardcoded tier name in a JS file.
 */
export async function buildVersionCore(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	quality: string,
	rawExtension?: string | null,
): Promise<BuildVersionResult> {
	assertValidQuality(spec, quality);
	if (spec.masterQualities.includes(quality)) {
		throw new Error(
			`build_version: '${quality}' is a MASTER tier, not a derivative — a master is uploaded, never generated. Upload the file into '${quality}' instead.`,
		);
	}
	const thumbQuality = config.media.thumb.quality;

	if (spec.model === 'component_av') {
		// The av thumb is NOT a transcode: PHP component_av::create_thumb resizes
		// the POSTERFRAME (ImageMagick), so routing it through ffmpeg would build a
		// video into the thumb tier. No posterframe ⇒ refuse loudly; the operator's
		// next step is tool_posterframe, not a longer wait.
		if (quality === thumbQuality) {
			return {
				built: [await buildAvThumbFromPosterframe({ spec, identity, pathOpts })],
				jobId: null,
			};
		}
		// ONE quality — the tier the operator clicked. Pre-flight refusals surface
		// as a failed request, not as an accepted job that dies later.
		return {
			built: [],
			jobId: await submitAvVersionBuild(spec, identity, pathOpts, quality, rawExtension),
		};
	}

	// THUMB builds from the DEFAULT-QUALITY file, not the original (v6
	// component_image::create_thumb :393 — get_media_filepath(default_quality)).
	// On a partial-media box the default file is usually present while the
	// original is not; requiring the original here made the thumb gear fail with
	// 'original not found' for exactly those records.
	//
	// The fallback to the ORIGINAL is deliberately kept (2026-08-04): the
	// component_pdf / component_svg thumb gears reach it by design — their
	// defaultExtension is not a raster tier — and deleting it would break exactly
	// the partial-media boxes above. It is safe on a raw master because
	// buildThumbVersion now probes its source, selects a scene and converts CMYK.
	if (quality === thumbQuality) {
		const defaultLocation = buildMediaLocation(
			spec,
			identity,
			spec.defaultQuality,
			spec.defaultExtension,
			pathOpts,
		);
		const thumbSource = existsSync(defaultLocation.absolutePath)
			? defaultLocation.absolutePath
			: resolveMasterSource(spec, identity, pathOpts, rawExtension);
		if (thumbSource === null) {
			throw new Error(
				`build_version: no ${spec.defaultQuality} file and no original to build the thumb from`,
			);
		}
		return { built: [await buildThumbVersion(spec, identity, thumbSource, pathOpts)], jobId: null };
	}

	const source = resolveMasterSource(spec, identity, pathOpts, rawExtension);
	if (source === null) throw new Error('build_version: master not found');

	if (spec.model === 'component_image') {
		return {
			built: [await buildImageVersion(spec, identity, quality, source, pathOpts)],
			jobId: null,
		};
	}
	if (spec.model === 'component_pdf') {
		// pdf 'web' = copy; the jpg cover rides along.
		const built = [
			copyToQuality(spec, identity, quality, source, 'pdf', pathOpts),
			await buildPdfCover(spec, identity, source, pathOpts),
		];
		return { built, jobId: null };
	}
	// svg / 3d: naive copy to the target quality.
	return {
		built: [copyToQuality(spec, identity, quality, source, spec.defaultExtension, pathOpts)],
		jobId: null,
	};
}

/**
 * Soft-delete one quality×extension file (PHP delete_version): move it into
 * deleted/. Returns the moved path or null (absent). thumb routing is implicit
 * (the caller passes the thumb quality + extension).
 */
export function deleteVersionCore(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	quality: string,
	extension: string,
): string | null {
	assertValidQuality(spec, quality);
	const path = buildMediaLocation(spec, identity, quality, extension, pathOpts).absolutePath;
	return moveToDeleted(path, { mediaRoot: pathOpts.mediaRoot });
}

/**
 * Soft-delete EVERY extension of one quality tier (PHP delete_quality →
 * delete_file($quality) → remove_component_media_files([$quality], null), which
 * iterates all known extensions). We scan the live files_info for that quality
 * (this also surfaces the raw-original / modified twins under 'original'/'modified')
 * and move each present, non-external file into deleted/. Returns the moved paths.
 */
export function deleteQualityCore(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	quality: string,
	context: ScanContext = {},
): string[] {
	assertValidQuality(spec, quality);
	const moved: string[] = [];
	for (const entry of scanFilesInfo(spec, identity, pathOpts, context)) {
		if (entry.quality !== quality || entry.external || entry.extension == null) continue;
		const path = buildMediaLocation(
			spec,
			identity,
			quality,
			entry.extension,
			pathOpts,
		).absolutePath;
		const target = moveToDeleted(path, { mediaRoot: pathOpts.mediaRoot });
		if (target !== null) moved.push(target);
	}
	return moved;
}

/**
 * The master file the derived tiers currently depict — captured BEFORE a delete
 * so the rebuild below can tell whether the delete actually changed anything.
 * `null` when the record has no master at all.
 */
export function resolveMasterFingerprint(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
): string | null {
	return resolveMasterSource(spec, identity, pathOpts);
}

/**
 * After a delete, put the derived tiers back in step with the best REMAINING
 * master — the third half of the two-masters rule (2026-08-07).
 *
 * Deleting the RETOUCHED master is the operator saying "that retouch was wrong";
 * what is served must go back to depicting the original AT ONCE, not at some
 * later repair sweep. Anything else leaves every derived tier showing a retouch
 * the record no longer holds, with a files_info that reports them all present.
 *
 * IT REBUILDS ONLY WHEN THE RESOLVED MASTER FILE ACTUALLY CHANGED, which is why
 * `masterBefore` is a parameter and not something this function can work out on
 * its own. The comparison is on the PATH, because the tier alone does not decide
 * it: master resolution walks tiers AND extensions, so deleting a
 * lower-precedence twin ('.tif' beside the '.jpg' the tiers were actually built
 * from) leaves the very same file in charge, and deleting the ORIGINAL while a
 * retouch survives leaves the retouch — already the source — in charge. Both
 * must be no-ops. MEASURED before this guard, on the shipped code: each of them
 * rebuilt 3 files, and the first reverted a derived tier an operator had rotated
 * to portrait (600x900 back to 887x592) on a delete that touched nothing the
 * tiers were built from. A rebuild is not free — see regenerateImage, which
 * replaces bytes.
 *
 * DELETING THE LAST MASTER DOES NOT WIPE THE DERIVED TIERS. There is nothing to
 * rebuild them from, and on a partial-media box (masters on a bucket that is not
 * mounted) they are the only surviving picture of the object. Destroying them
 * would turn one deletion into total loss of the record's image, which is the
 * exact opposite of what a Cultural Heritage archive may do. They are left
 * standing and the caller's re-scan reports them honestly.
 *
 * Returns the rebuilt paths ([] when nothing needed doing). NON-FATAL by
 * contract, like every other derivative pass: the delete already happened, so a
 * rebuild failure is reported, never thrown over the top of it.
 */
export async function rebuildDerivedTiersAfterMasterDelete(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	deletedQuality: string,
	masterBefore: string | null,
): Promise<{ rebuilt: string[]; errors: string[] }> {
	if (!spec.masterQualities.includes(deletedQuality)) return { rebuilt: [], errors: [] };
	// Re-resolved AFTER the delete: a tier that still holds another extension
	// (a '.jpg' beside the removed '.tif') is still a master, and still wins.
	const survivor = resolveMasterSource(spec, identity, pathOpts);
	if (survivor === null) return { rebuilt: [], errors: [] }; // last master — see above
	if (survivor === masterBefore) return { rebuilt: [], errors: [] }; // nothing changed
	try {
		switch (spec.model) {
			case 'component_image':
				return { rebuilt: await regenerateImage(spec, identity, pathOpts), errors: [] };
			case 'component_pdf':
				return { rebuilt: await regeneratePdf(spec, identity, pathOpts), errors: [] };
			case 'component_svg':
				return { rebuilt: await regenerateSvg(spec, identity, pathOpts), errors: [] };
			default:
				// component_3d needs the raw extension it cannot know here; component_av
				// derivatives are an async transcode owned by the job manager. Neither
				// model has a second master (only the image ladder has a retouched tier),
				// so this branch is reachable only by deleting the sole master — which
				// the survivor check above has already returned on.
				return { rebuilt: [], errors: [] };
		}
	} catch (error) {
		return { rebuilt: [], errors: [(error as Error).message] };
	}
}

export interface DeleteAndResyncResult {
	/** Paths moved into deleted/ by the delete itself. */
	moved: string[];
	/** Derived tiers rebuilt because the delete changed the best master. */
	rebuilt: string[];
	/** Non-fatal rebuild failures — the delete itself already landed. */
	errors: string[];
	/** The disk scan taken AFTER the rebuild (see the ordering note). */
	filesInfo: FileInfoEntry[];
}

/**
 * THE WHOLE DELETE SEAM, in one gateable place: delete → rebuild-if-the-master-
 * changed → re-scan. `extension === null` deletes the whole quality tier
 * (delete_quality), a string deletes one file (delete_version).
 *
 * IT LIVES HERE, NOT IN THE TOOL, because the ORDER is the invariant and the
 * tool layer is documented as thin wrappers. The rebuild MUST run before the
 * scan: a files_info taken between the delete and the rebuild records tiers that
 * still depict the master just removed, and that value is what gets persisted.
 * As a sequence spelled out inside a tool handler, the ordering had no gate at
 * all — replacing both call sites with a stub left the entire media suite green.
 */
export async function deleteAndResyncCore(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	quality: string,
	extension: string | null,
	context: ScanContext = {},
): Promise<DeleteAndResyncResult> {
	const masterBefore = resolveMasterFingerprint(spec, identity, pathOpts);
	const moved =
		extension === null
			? deleteQualityCore(spec, identity, pathOpts, quality, context)
			: [deleteVersionCore(spec, identity, pathOpts, quality, extension)].filter(
					(path): path is string => path !== null,
				);
	const rebuild = await rebuildDerivedTiersAfterMasterDelete(
		spec,
		identity,
		pathOpts,
		quality,
		masterBefore,
	);
	return {
		moved,
		rebuilt: rebuild.rebuilt,
		errors: rebuild.errors,
		filesInfo: getFilesInfoCore(spec, identity, pathOpts, context),
	};
}

/**
 * Conform an AV container's headers in place (PHP tool_media_versions::
 * conform_headers → component_av::conform_headers). av-only; remuxes the quality
 * file (stream copy) and relocates the moov atom via qt-faststart, preserving the
 * pre-conform file as `<stem>_untouched.<ext>`. Throws on a wrong model, unknown
 * quality, or missing source file.
 */
export async function conformHeadersCore(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	quality: string,
	rawExtension?: string | null,
): Promise<boolean> {
	if (spec.model !== 'component_av') {
		throw new Error('conform_headers: only supported for component_av');
	}
	assertValidQuality(spec, quality);
	const extension = rawExtension ?? spec.defaultExtension;
	const source = buildMediaLocation(spec, identity, quality, extension, pathOpts).absolutePath;
	if (!existsSync(source)) throw new Error('conform_headers: file does not exist');
	await conformHeader(source);
	return true;
}

export interface RotateVersionResult {
	result: boolean;
	errors: string[];
}

/**
 * Rotate one quality tier in place (PHP tool_media_versions::rotate →
 * component_image::rotate, rotation_mode 'expanded'). image-only; rotates every
 * on-disk file of the requested quality (there may be more than one extension)
 * by `degrees`. The original tier is never mutated (Original law). Returns
 * result=false with the collected per-file errors on any failure.
 */
export async function rotateVersionCore(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	quality: string,
	degrees: number,
	context: ScanContext = {},
): Promise<RotateVersionResult> {
	if (spec.model !== 'component_image') {
		throw new Error('rotate: only supported for component_image');
	}
	assertValidQuality(spec, quality);
	const entries = scanFilesInfo(spec, identity, pathOpts, context)
		.filter((entry) => entry.quality === quality && entry.file_exist && entry.extension != null)
		.map((entry) => ({
			quality: entry.quality,
			extension: entry.extension as string,
			file_exist: true,
		}));
	if (entries.length === 0) {
		return { result: false, errors: [`rotate: no file found for quality '${quality}'`] };
	}
	const rotation = await applyRotationCore(spec, identity, pathOpts, entries, {
		degrees: Number(degrees),
		mode: 'expanded',
	});
	return { result: rotation.errors.length === 0, errors: rotation.errors };
}
