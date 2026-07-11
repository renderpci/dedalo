/**
 * Media LIST VALUES — the per-quality file-info projection media components
 * show in list mode.
 *
 * SOURCE (verified against the live DB + PHP output): the STORED `files_info`
 * array inside the component's media-column item — populated at upload/processing
 * time by the media engine. The list value is a PROJECTION of that array filtered
 * to the model's public list qualities. No filesystem access at read time — the
 * stored stats (file_size/file_time/file_exist) ship as stored.
 *
 * The quality catalog now comes from the media CONTRACT (concepts/media.ts →
 * env-based config), NOT a hardcoded table — so av/3d are covered and an install
 * can retune qualities without code changes (engineering/MEDIA_SPEC.md §3/§5).
 */

import { isMediaModel as contractIsMediaModel, mediaTypeOf } from '../concepts/media.ts';

/** Whether `model` is a media model (delegates to the contract). */
export function isMediaModel(model: string): boolean {
	return contractIsMediaModel(model);
}

/**
 * Project the stored media items' files_info to the model's list qualities.
 * Returns null when the model is not media or has no stored media items.
 */
export function getMediaListValue(
	model: string,
	storedItems: unknown[] | null,
): Record<string, unknown>[] | null {
	const spec = mediaTypeOf(model);
	if (spec === null || storedItems === null || storedItems.length === 0) {
		return null;
	}
	const qualities = spec.listQualities;
	const entries: Record<string, unknown>[] = [];
	for (const item of storedItems) {
		const filesInfo = (item as { files_info?: Record<string, unknown>[] } | null)?.files_info;
		if (!Array.isArray(filesInfo)) continue;
		// ONE entry per quality: the primary extension wins over modern
		// alternates (jpg over avif/webp — PHP best_extensions preference).
		// Entries without a real file (file_exist false / null name) are dropped.
		for (const quality of qualities) {
			const candidates = filesInfo.filter(
				(info) => info.quality === quality && info.file_exist === true && info.file_name != null,
			);
			if (candidates.length === 0) continue;
			const preferred =
				candidates.find((info) => info.extension !== 'avif' && info.extension !== 'webp') ??
				candidates[0];
			entries.push(preferred as Record<string, unknown>);
		}
	}
	// Stored items with no surviving projection → EMPTY ARRAY (PHP emits []).
	return entries;
}
