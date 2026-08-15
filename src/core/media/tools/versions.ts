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
import {
	assertValidQuality,
	type MediaTypeSpec,
	NO_ALTERNATE_BUILDER_REASON,
} from '../../concepts/media.ts';
import { DedaloError } from '../../errors/dedalo_error.ts';
import { submitAvVersionBuild } from '../av_versions.ts';
import { conformHeader } from '../engine/ffmpeg.ts';
import { moveToDeleted } from '../file_ops.ts';
import { type FileInfoEntry, type ScanContext, scanFilesInfo } from '../files_info.ts';
import { buildMediaLocation, type MediaIdentity, type MediaPathOptions } from '../path.ts';
import {
	buildAlternateVersions,
	buildImageVersion,
	buildPdfCovers,
	copyToQuality,
	derivedTwinQualities,
	regenerateImage,
	regeneratePdf,
	regenerateSvg,
	resolveMasterSource,
	retireOrphanTwins,
} from '../processing.ts';
import { rebuildThumb } from '../thumb.ts';
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
	/**
	 * NON-FATAL failures of the pass — today, alternate-extension twins that could
	 * not be encoded on this host. The requested tier itself still built (a fatal
	 * failure throws), so `result` stays true and these travel to the panel, which
	 * renders `errors`. Without the field the operator would be told a build
	 * succeeded while the configured format was never written.
	 */
	errors: string[];
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
 *
 * THE TWO EXTENSION PARAMETERS ARE DIFFERENT QUESTIONS (2026-08-07), which is
 * why the old single `extension` was REMOVED from the handler with no alias:
 *
 *  - `sourceExtension` (formerly `rawExtension`) selects WHICH MASTER FILE to
 *    build from — it is the raw upload extension behind a normalized name, fed by
 *    the stored `original_normalized_name`. It is not a target and never was;
 *    named `extension` it read like one, so an API caller sending
 *    `extension:'avif'` got a jpg built from a different master.
 *  - `targetExtension` builds EXACTLY ONE FILE: that tier's file in that
 *    container. Delete is already granular (delete_version takes an extension),
 *    so without it recovering one twin meant rebuilding the tier's jpg as well —
 *    destroying any rotation an operator had applied to it.
 *
 * OMITTING `targetExtension` builds the tier COMPLETE: its normalized file plus
 * every configured alternate twin. A tier minted on demand must not arrive
 * half-built: nothing would then rebuild the missing twin until the next master
 * change, and a tier the operator just asked for would sit incomplete meanwhile
 * (processing.ts buildAlternateVersions owns the companion rule).
 */
export async function buildVersionCore(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	quality: string,
	sourceExtension?: string | null,
	targetExtension?: string | null,
	/** Who asked — stamped on the background job so it reaches their activity tray. */
	userId?: number,
): Promise<BuildVersionResult> {
	assertValidQuality(spec, quality);
	const target = assertBuildableTargetExtension(spec, quality, targetExtension);
	if (spec.masterQualities.includes(quality)) {
		// PUBLIC: `quality` reached here through `assertValidQuality`, so it is one
		// of the type's own tiers — engine data, not a raw caller string.
		const reason = `build_version: '${quality}' is a MASTER tier, not a derivative — a master is uploaded, never generated. Upload the file into '${quality}' instead.`;
		throw new DedaloError('media.unsupported_operation', {
			message: reason,
			publicMessage: reason,
		});
	}
	const thumbQuality = config.media.thumb.quality;

	// THE THUMB IS ONE OPERATION FOR ALL FIVE MODELS — `thumb.ts rebuildThumb`
	// resolves the source from the census (the delivered file, or the posterframe),
	// mints the source when the engine can (av), and refuses with the remedy when it
	// cannot (3d needs a browser). This branch used to be three: an av/3d
	// posterframe path, a default-else-master path, and a pdf/svg fallback comment —
	// each with its own source rule.
	if (quality === thumbQuality) {
		const outcome = await rebuildThumb({ spec, identity, pathOpts });
		// A minted posterframe rides in `built` because it IS a file this click
		// wrote: the operator asked for a thumb and also got the still the record
		// now shows in every list, and the panel lists what was built.
		return {
			built: [outcome.mintedPosterframe, outcome.built].filter(
				(path): path is string => path !== null,
			),
			jobId: null,
			errors: [],
		};
	}
	if (spec.model === 'component_av') {
		// ONE quality — the tier the operator clicked. Pre-flight refusals surface
		// as a failed request, not as an accepted job that dies later.
		return {
			built: [],
			jobId: await submitAvVersionBuild(spec, identity, pathOpts, quality, sourceExtension, userId),
			errors: [],
		};
	}

	const source = resolveMasterSource(spec, identity, pathOpts, sourceExtension);
	if (source === null) {
		throw new DedaloError('media.file_not_found', {
			message: 'build_version: master not found',
			publicMessage: 'build_version: master not found',
		});
	}

	if (spec.model === 'component_image') {
		// ONE FILE when the caller named a target extension (recovering a single
		// twin without re-encoding — and possibly un-rotating — the tier's jpg);
		// otherwise the tier COMPLETE: its normalized file plus every configured
		// twin, so a tier minted here arrives COMPLETE rather than half-built.
		if (target !== null && target !== spec.defaultExtension) {
			const alternates = await buildAlternateVersions(spec, identity, pathOpts, source, {
				qualities: [quality],
				extensions: [target],
			});
			// A twin is a COMPANION: with no tier file to accompany, the reconciler
			// builds nothing (and would retire the twin). Say so, rather than return
			// an empty success the panel renders as "done".
			if (alternates.created.length === 0 && alternates.errors.length === 0) {
				const reason = `build_version: nothing to accompany — '${quality}' holds no .${spec.defaultExtension} file, and a .${target} version is a companion of it. Build the '${quality}' version itself first.`;
				throw new DedaloError('media.unsupported_operation', {
					message: reason,
					publicMessage: reason,
				});
			}
			return { built: alternates.created, jobId: null, errors: alternates.errors };
		}
		const built = [await buildImageVersion(spec, identity, quality, source, pathOpts)];
		if (target !== null) return { built, jobId: null, errors: [] };
		const alternates = await buildAlternateVersions(spec, identity, pathOpts, source, {
			qualities: [quality],
		});
		built.push(...alternates.created);
		return { built, jobId: null, errors: alternates.errors };
	}
	if (spec.model === 'component_pdf') {
		// pdf 'web' = copy; the covers (jpg + every configured alternate) ride along.
		// A cover this host cannot encode travels in `errors` beside a SUCCESS,
		// exactly like an image twin — the copy landed, and telling the operator the
		// build failed would be a lie about what is on disk.
		const built = [copyToQuality(spec, identity, quality, source, 'pdf', pathOpts)];
		const covers = await buildPdfCovers(spec, identity, source, pathOpts);
		built.push(...covers.created);
		return { built, jobId: null, errors: covers.errors };
	}
	// svg / 3d: naive copy to the target quality.
	return {
		built: [copyToQuality(spec, identity, quality, source, spec.defaultExtension, pathOpts)],
		jobId: null,
		errors: [],
	};
}

/**
 * Validate an operator-supplied `target_extension` and return it (null = "the
 * whole tier", the default).
 *
 * IT IS A CLOSED LIST, and the refusal names the config key. The buildable set of
 * a derived tier is exactly `[defaultExtension, ...alternateExtensions]` — the
 * same list `assertNormalizedExtensionForTier` admits an upload for — because
 * `spec.alternateExtensions` is already narrowed at construction to the models
 * that HAVE a writer (concepts/media.ts ALTERNATE_BUILDER_BY_MODEL). So on av /
 * svg / 3d this refuses everything but the model's own extension, and says which
 * code would have to exist for it not to; on image/pdf it refuses a format the
 * install did not configure instead of quietly encoding it into a file nothing
 * will ever scan (files_info walks the configured list).
 *
 * The THUMB tier is fixed by `config.media.thumb.extension`: files_info scans it
 * with that extension alone, so any other target would be written and never seen.
 */
function assertBuildableTargetExtension(
	spec: MediaTypeSpec,
	quality: string,
	targetExtension: string | null | undefined,
): string | null {
	if (targetExtension === undefined || targetExtension === null || targetExtension === '') {
		return null;
	}
	const target = targetExtension.toLowerCase().replace(/^\./, '');
	if (spec.hasThumb && quality === config.media.thumb.quality) {
		if (target !== config.media.thumb.extension) {
			const reason = `build_version: the '${quality}' tier is scanned with the '${config.media.thumb.extension}' extension alone, so a '.${target}' file there could never be indexed`;
			throw new DedaloError('media.unsupported_operation', {
				message: reason,
				publicMessage: reason,
			});
		}
		return target;
	}
	const buildable = [spec.defaultExtension, ...spec.alternateExtensions];
	if (!buildable.includes(target)) {
		const reason = NO_ALTERNATE_BUILDER_REASON[spec.model];
		const sentence =
			`build_version: cannot build a '.${target}' version of ${spec.model} — this engine writes ${buildable.map((value) => `.${value}`).join(' / ')} here` +
			(reason === null
				? `. Add it to ${spec.alternateExtensionsConfigKey} to have it built.`
				: `, and it has NO alternate-extension builder at all: ${reason}`);
		throw new DedaloError('media.unsupported_operation', {
			message: sentence,
			publicMessage: sentence,
		});
	}
	return target;
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
			case 'component_image': {
				// The twin failures ride in `errors` beside a successful rebuild: the
				// delete landed and the tiers were rebuilt, but a configured format was
				// not written. withRebuildFailure (the tool) puts that in front of the
				// operator instead of leaving it in a return value nobody reads.
				const outcome = await regenerateImage(spec, identity, pathOpts);
				return { rebuilt: outcome.created, errors: outcome.errors };
			}
			case 'component_pdf': {
				const outcome = await regeneratePdf(spec, identity, pathOpts);
				return { rebuilt: outcome.created, errors: outcome.errors };
			}
			case 'component_svg': {
				const outcome = await regenerateSvg(spec, identity, pathOpts);
				return { rebuilt: outcome.created, errors: outcome.errors };
			}
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
	/**
	 * Alternate twins moved to deleted/ because the delete took their companion —
	 * '<quality>.<extension>' labels. The operator deleted ONE file and more than
	 * one left the tier, so this must reach the screen (see retireOrphanTwins).
	 */
	retired: string[];
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
 *
 * THE ORPHAN-TWIN RETIREMENT IS PART OF THAT ORDER (2026-08-07), and it is the
 * reason a delete is a seam at all rather than a one-line move. A twin is a
 * companion: taking a tier's own file away leaves the twin indexed, openable, and
 * — because `files_info` order makes it the tier's FIRST entry once the jpg is
 * gone — served as that quality by every reader that picks a tier by quality
 * alone. Measured on the shipped code, one panel click produced exactly that. It
 * runs AFTER the rebuild (which may legitimately put the companion back) and
 * BEFORE the scan, so the files_info the caller persists is honest.
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
	// NO TWIN WITHOUT ITS COMPANION — every derived tier, not just the one named:
	// deleting a MASTER can rebuild some tiers and leave others behind, and
	// delete_quality on a derived tier removes the companion outright.
	const retired = retireOrphanTwins(spec, identity, pathOpts, derivedTwinQualities(spec));
	if (retired.length > 0) {
		console.warn(
			`[media] ${spec.model} ${identity.componentTipo}_${identity.sectionTipo}_${String(identity.sectionId)}: retired to deleted/ with the file just removed — a twin is a companion of its tier's .${spec.defaultExtension}, not an independent version: ${retired.join(', ')}`,
		);
	}
	return {
		moved,
		rebuilt: rebuild.rebuilt,
		retired,
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
		throw new DedaloError('media.unsupported_operation', {
			message: 'conform_headers: only supported for component_av',
			publicMessage: 'conform_headers: only supported for component_av',
		});
	}
	assertValidQuality(spec, quality);
	const extension = rawExtension ?? spec.defaultExtension;
	const source = buildMediaLocation(spec, identity, quality, extension, pathOpts).absolutePath;
	if (!existsSync(source)) {
		throw new DedaloError('media.file_not_found', {
			message: 'conform_headers: file does not exist',
			publicMessage: 'conform_headers: file does not exist',
		});
	}
	await conformHeader(source);
	return true;
}

export interface RotateVersionResult {
	/** true when every file of the tier rotated; false with the reasons in `errors`. */
	ok: boolean;
	errors: string[];
}

/**
 * Rotate one quality tier in place (PHP tool_media_versions::rotate →
 * component_image::rotate, rotation_mode 'expanded'). image-only; rotates every
 * on-disk file of the requested quality (there may be more than one extension)
 * by `degrees`. The original tier is never mutated (Original law). Returns
 * ok=false with the collected per-file errors on any failure.
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
		throw new DedaloError('media.unsupported_operation', {
			message: 'rotate: only supported for component_image',
			publicMessage: 'rotate: only supported for component_image',
		});
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
		return { ok: false, errors: [`rotate: no file found for quality '${quality}'`] };
	}
	const rotation = await applyRotationCore(spec, identity, pathOpts, entries, {
		degrees: Number(degrees),
		mode: 'expanded',
	});
	return { ok: rotation.errors.length === 0, errors: rotation.errors };
}
