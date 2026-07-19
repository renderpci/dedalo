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

import { mediaTypeOf } from '../concepts/media.ts';
import { refreshStoredFilesInfo } from './files_info.ts';
import { resolveMediaPathOptions } from './ontology_path.ts';
import { regenerate3d, regenerateImage, regeneratePdf, regenerateSvg } from './processing.ts';

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
	/** Rebuild derivative files from the original before scanning. */
	regenerate: boolean;
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
				switch (model) {
					case 'component_image':
						await regenerateImage(spec, identity, pathOpts, rawExtension);
						break;
					case 'component_pdf':
						await regeneratePdf(spec, identity, pathOpts);
						break;
					case 'component_svg':
						await regenerateSvg(spec, identity, pathOpts);
						break;
					case 'component_3d':
						if (rawExtension !== null) regenerate3d(spec, identity, pathOpts, rawExtension);
						break;
					// component_av: async transcode — deliberately not enqueued here.
				}
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
