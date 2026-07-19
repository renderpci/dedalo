/**
 * MEDIA REPAIR KERNEL — refresh a component's stored media items against the
 * filesystem, optionally rebuilding the derivative files first.
 *
 * `files_info` is a DISK-DERIVED CACHE the read path serves verbatim for
 * image/pdf/svg/3d (only component_av re-scans per read — component_emit.ts).
 * When it goes stale (e.g. a write that ran while MEDIA_PATH pointed at the
 * wrong tree), the record renders nothing although the files are on disk.
 * This module is the ONE copy of the fix, composed from the existing seams:
 *
 * - regenerate*  (processing.ts)  — rebuild default quality + thumb (+ image
 *   SVG envelope) from the original, where the original is on this box;
 * - refreshStoredFilesInfo (files_info.ts) — re-scan the disk and splice a
 *   fresh files_info into each stored item, preserving the sibling keys
 *   (original_* / modified_* / lib_data / external_source).
 *
 * Callers and their division of labor:
 * - tools/tool_update_cache (in-app, per-section, SQO-driven): regenerate:true,
 *   persists every refreshed component;
 * - scripts/media_repair_files_info.ts (terminal, cross-section ops sweep):
 *   regenerate:false, adjudicates GROW/DIFF/SHRINK before persisting.
 * PERSISTENCE IS THE CALLER'S STEP (per-key jsonb via updateMatrixKeyData, NO
 * Time Machine entry — the files_info_persist.ts discipline): the sweep must
 * be able to scan without writing (dry-run), so the kernel never touches the DB.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { type MediaTypeSpec, mediaTypeOf } from '../concepts/media.ts';
import { moveToDeleted } from './file_ops.ts';
import { refreshStoredFilesInfo } from './files_info.ts';
import { resolveMediaPathOptions } from './ontology_path.ts';
import { type MediaIdentity, type MediaPathOptions, buildMediaLocation } from './path.ts';
import {
	buildImageVersion,
	buildThumbVersion,
	regenerate3d,
	regeneratePdf,
	regenerateSvg,
	resolveOriginalSource,
} from './processing.ts';
import { createDefaultSvgFile, defaultRasterUrl, svgOverlayLocation } from './svg_overlay.ts';

export interface MediaItemsRefreshResult {
	/** The stored items with a fresh files_info spliced per item (same order, same length). */
	refreshedItems: unknown[];
	/** Derivative-rebuild failures, one message per failed item. The files_info
	 * refresh still applied to those items — the scan reports whatever exists. */
	errors: string[];
	/** Items whose stored index was KEPT because the rescan found fewer existing
	 * files than stored (holdShrink) — see the option's doc for why. */
	heldShrinks: number;
}

/** Count of entries that claim an existing file — the shrink-guard comparison unit. */
function existingFileCount(filesInfo: unknown): number {
	if (!Array.isArray(filesInfo)) return 0;
	return filesInfo.filter((entry) => (entry as Record<string, unknown> | null)?.file_exist === true)
		.length;
}

/**
 * Refresh every stored media item of one component on one record.
 *
 * With `regenerate: true` the derivative files are rebuilt from the original
 * first (image/pdf/svg/3d — a no-op when the original is absent on this box;
 * component_av is never transcoded here, that is an async job owned by
 * tool_media_versions). Non-object items pass through untouched.
 *
 * Throws when `model` is not a media model — callers gate on isMediaModel/
 * mediaTypeOf, so reaching here with anything else is a programming error.
 */
export async function refreshMediaItems(input: {
	componentTipo: string;
	sectionTipo: string;
	sectionId: number;
	/** The component's resolved model (must satisfy mediaTypeOf(model) !== null). */
	model: string;
	/** The record's stored media items for this component. */
	items: readonly unknown[];
	/** Rebuild MISSING derivative files from the original before scanning (v6
	 * regenerate_component parity: an existing derivative is NEVER re-encoded;
	 * the image thumb is re-created always; the SVG envelope is created only
	 * when absent, with its embedded raster path fixed when it drifted). */
	regenerate: boolean;
	/**
	 * v6 delete_normalized_files (the tool's per-media-component regenerate
	 * option, UI default false): move the NORMALIZED files of the default
	 * quality (default + alternate extensions, never the uploaded original) to
	 * their `deleted/` folder before rebuilding. Guarded — a deliberate v6
	 * divergence — on a LOCALLY PRESENT original: on a partial-media box the
	 * v6 behavior would delete the only local copies and rebuild nothing.
	 */
	deleteNormalized?: boolean;
	/** The dd800 bulk-process run id: deleted files land in `deleted/<id>/` (v6
	 * move_deleted_file bulk mode), tying the moved files to the run. */
	bulkProcessId?: number | null;
	/**
	 * KEEP the stored files_info when the rescan finds FEWER existing files than
	 * stored. On a box holding a PARTIAL media copy (dev laptops — buckets not
	 * synced) an unguarded rescan destroys the valid index of every record whose
	 * files live elsewhere; a runaway tool_update_cache sweep did exactly that
	 * (2026-07-19, ~86k rsc170 records, restored from the pinned backup).
	 * Bulk/tool callers MUST pass true; only a caller that adjudicates shrinks
	 * itself (scripts/media_repair_files_info.ts --allow-shrink) passes false.
	 */
	holdShrink: boolean;
}): Promise<MediaItemsRefreshResult> {
	const { componentTipo, sectionTipo, sectionId, model, items, regenerate, holdShrink } = input;
	const deleteNormalized = input.deleteNormalized === true;
	const spec = mediaTypeOf(model);
	if (spec === null) {
		throw new Error(`refreshMediaItems: '${model}' is not a media model`);
	}
	const pathOpts = await resolveMediaPathOptions(componentTipo, sectionTipo);

	const refreshedItems: unknown[] = [];
	const errors: string[] = [];
	let heldShrinks = 0;
	for (const raw of items) {
		if (raw === null || typeof raw !== 'object') {
			refreshedItems.push(raw);
			continue;
		}
		const item = raw as Record<string, unknown>;
		const identity = {
			componentTipo,
			sectionTipo,
			sectionId,
			lang: (item.lang as string | null) ?? null,
		};
		// The raw upload extension (e.g. the '.png' behind a normalized '.jpg')
		// steers resolveOriginalSource to the right original file.
		const rawName = item.original_normalized_name;
		const rawExtension = typeof rawName === 'string' ? (rawName.split('.').pop() ?? null) : null;
		if (regenerate) {
			try {
				await regenerateMissingDerivatives(model, spec, identity, pathOpts, {
					rawExtension,
					deleteNormalized,
					bulkProcessId: input.bulkProcessId ?? null,
				});
			} catch (error) {
				errors.push((error as Error).message);
			}
		}
		const refreshed = refreshStoredFilesInfo(item, spec, identity, pathOpts);
		if (
			holdShrink &&
			existingFileCount(refreshed.files_info) < existingFileCount(item.files_info)
		) {
			heldShrinks++;
			refreshedItems.push(item); // stored index kept — see holdShrink doc
			continue;
		}
		refreshedItems.push(refreshed);
	}
	return { refreshedItems, errors, heldShrinks };
}

/**
 * v6 component_media_common::regenerate_component (:2614) parity — the TOOL
 * regenerate builds only what is MISSING (upload ingest keeps its unconditional
 * builders — a fresh original SHOULD re-encode):
 *
 *  1. delete_normalized_files (option, UI default false): move the default
 *     quality's normalized files to `deleted/` first — only when the original
 *     is locally present (our guard; v6 assumed the full media store).
 *  2. default quality: build ONLY when the file is absent (needs the original).
 *  3. image thumb: re-create ALWAYS, FROM THE DEFAULT-QUALITY FILE — v6
 *     component_image::create_thumb (:393) reads get_media_filepath(default)
 *     and NEVER touches the original; when the default file is absent it skips
 *     (v6 returns false). This must NOT be gated on the original: on a
 *     partial-media box most records have the default file but no original.
 *  4. image SVG envelope: create when absent (needs only the default file);
 *     when present, FIX the embedded raster path if it drifted (v6 str_replace).
 *  5. pdf/svg/3d: their whole derivative set builds only when the default
 *     quality file is absent (the builders are internally idempotent copies;
 *     they need the original).
 *
 * Alternate-extension builds (v6 checks them too) are a LEDGERED gap: the TS
 * processing layer has no alternate-extension builder yet.
 *
 * Exported for the unit gate (tool_update_cache.test.ts thumb parity).
 */
export async function regenerateMissingDerivatives(
	model: string,
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	options: {
		rawExtension: string | null;
		deleteNormalized: boolean;
		bulkProcessId: number | null;
	},
): Promise<void> {
	// The original is needed only by the ORIGINAL-SOURCED steps (default-quality
	// build, delete_normalized). Thumb + envelope derive from the DEFAULT file —
	// they must run even when the original is not on this box (v6 create_thumb).
	const source = resolveOriginalSource(spec, identity, pathOpts, options.rawExtension);

	const defaultLocation = buildMediaLocation(
		spec,
		identity,
		spec.defaultQuality,
		spec.defaultExtension,
		pathOpts,
	);

	// 1. delete_normalized_files — move (never unlink) the normalized default-
	//    quality files to deleted/; the uploaded original itself is never touched.
	if (options.deleteNormalized && source !== null) {
		const extensions = [spec.defaultExtension, ...spec.alternateExtensions];
		for (const extension of extensions) {
			const location = buildMediaLocation(spec, identity, spec.defaultQuality, extension, pathOpts);
			if (location.absolutePath !== source && existsSync(location.absolutePath)) {
				moveToDeleted(location.absolutePath, {
					mediaRoot: pathOpts.mediaRoot ?? undefined,
					bulkProcessId: options.bulkProcessId !== null ? String(options.bulkProcessId) : undefined,
				});
			}
		}
	}

	switch (model) {
		case 'component_image': {
			// 2. default quality only when absent — and only when the original is here
			if (!existsSync(defaultLocation.absolutePath) && source !== null) {
				await buildImageVersion(spec, identity, spec.defaultQuality, source, pathOpts);
			}
			// 3. thumb ALWAYS — from the DEFAULT-QUALITY file (v6 create_thumb);
			//    skip when it is absent (v6 logs + returns false).
			if (existsSync(defaultLocation.absolutePath)) {
				await buildThumbVersion(spec, identity, defaultLocation.absolutePath, pathOpts);
				// 4. envelope: create when absent, else fix a drifted raster path
				const overlay = svgOverlayLocation(spec, identity, pathOpts);
				if (!existsSync(overlay.absolutePath)) {
					await createDefaultSvgFile(spec, identity, pathOpts);
				} else {
					fixEnvelopeRasterPath(overlay.absolutePath, spec, identity, pathOpts);
				}
			}
			break;
		}
		case 'component_pdf':
			if (!existsSync(defaultLocation.absolutePath) && source !== null) {
				await regeneratePdf(spec, identity, pathOpts);
			}
			break;
		case 'component_svg':
			if (!existsSync(defaultLocation.absolutePath) && source !== null) {
				await regenerateSvg(spec, identity, pathOpts);
			}
			break;
		case 'component_3d':
			if (
				!existsSync(defaultLocation.absolutePath) &&
				source !== null &&
				options.rawExtension !== null
			) {
				regenerate3d(spec, identity, pathOpts, options.rawExtension);
			}
			break;
		// component_av: async transcode — deliberately not enqueued here.
	}
}

/**
 * v6 component_image::regenerate_component (:1799) drifted-path fix: the
 * persisted envelope must embed the CURRENT default-quality relative raster URL
 * (an install that moved/renamed its media dir leaves stale hrefs behind).
 */
function fixEnvelopeRasterPath(
	overlayPath: string,
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
): void {
	const content = readFileSync(overlayPath, 'utf8');
	const match = content.match(new RegExp(`xlink:href="(\\S+\\.${spec.defaultExtension})"`));
	if (match?.[1] === undefined) return;
	const expected = defaultRasterUrl(spec, identity, pathOpts);
	if (match[1] === expected) return;
	writeFileSync(overlayPath, content.replace(match[1], expected));
}
