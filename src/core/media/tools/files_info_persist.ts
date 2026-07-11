/**
 * files_info write-back (Media R1 tail). After a mutating media op
 * (build_version / rotate / delete_version), refresh the stored media item's
 * files_info in the matrix so the DB is immediately consistent instead of waiting
 * for the next component save.
 *
 * This is a METADATA refresh (files_info reflects the filesystem, not user data),
 * so it uses the per-key jsonb write (updateMatrixKeyData) WITHOUT a Time Machine
 * entry — PHP re-derives files_info by scanning on every read/save, so the stored
 * copy is a cache, not authoritative history. The live-scanned value the tools
 * already return to the client is unchanged; this only keeps the stored cache in
 * step. It never creates items — a component with no stored media item is left
 * untouched (nothing to refresh).
 */

import { updateMatrixKeyData } from '../../db/matrix_write.ts';
import { getMatrixTableFromTipo } from '../../ontology/resolver.ts';
import { type DdDate, type FileInfoEntry, ddDateFromMtime } from '../files_info.ts';

const MEDIA_COLUMN = 'media';

interface StoredMediaItem {
	id?: number;
	lang?: string | null;
	files_info?: unknown;
	[key: string]: unknown;
}

/**
 * Merge fresh files_info into the stored items whose lang matches the operated
 * identity. `lang === null` (non-translatable media) updates every item; a lang
 * updates only items with that lang (or lang-less items). Returns whether any
 * item changed so the caller can skip a no-op DB write.
 */
export function mergeFilesInfoIntoItems(
	items: readonly StoredMediaItem[],
	lang: string | null,
	freshFilesInfo: readonly FileInfoEntry[],
): { items: StoredMediaItem[]; changed: boolean } {
	if (items.length === 0) return { items: [...items], changed: false };
	let changed = false;
	const updated = items.map((item) => {
		const itemLang = item.lang ?? null;
		if (lang !== null && itemLang !== null && itemLang !== lang) return item;
		changed = true;
		return { ...item, files_info: freshFilesInfo };
	});
	return { items: updated, changed };
}

/**
 * Persist the fresh files_info onto the stored media items. No-op when there is
 * no matrix table, no stored item, or nothing to change.
 */
export async function persistScannedFilesInfo(input: {
	sectionTipo: string;
	sectionId: number;
	componentTipo: string;
	lang: string | null;
	items: readonly StoredMediaItem[];
	freshFilesInfo: readonly FileInfoEntry[];
}): Promise<boolean> {
	const { items: updated, changed } = mergeFilesInfoIntoItems(
		input.items,
		input.lang,
		input.freshFilesInfo,
	);
	if (!changed) return false;
	const table = await getMatrixTableFromTipo(input.sectionTipo);
	if (table === null) return false;
	await updateMatrixKeyData(
		table,
		input.sectionTipo,
		input.sectionId,
		MEDIA_COLUMN,
		input.componentTipo,
		updated,
	);
	return true;
}

/**
 * Persist a fresh UPLOAD onto the record's stored media item (PHP
 * process_uploaded_file → component->save()): sets files_info + the original_*
 * keys, CREATING the item when the component had none. Without this the record
 * kept its old files_info after an upload, so the client rendered the stale
 * image (or the placeholder) instead of the newly uploaded one.
 *
 * Non-translatable media (lang null) → the single item id:1. Translatable →
 * the item for that lang, created if absent. files_info is a filesystem-derived
 * cache, so this is a direct jsonb write without a Time Machine entry (matching
 * the other media write-backs); the original_* keys ride along on the same write.
 */
export async function persistUploadedMedia(input: {
	sectionTipo: string;
	sectionId: number;
	componentTipo: string;
	lang: string | null;
	existingItems: readonly StoredMediaItem[];
	filesInfo: readonly FileInfoEntry[];
	originalFileName: string;
	originalNormalizedName: string;
	uploadDate?: DdDate;
}): Promise<void> {
	const table = await getMatrixTableFromTipo(input.sectionTipo);
	if (table === null) return;

	const items: StoredMediaItem[] = input.existingItems.map((item) => ({ ...item }));
	// Locate the item to update: the lang-matched item (translatable) or the
	// first item (non-translatable). Create it when absent.
	const targetIndex =
		input.lang !== null
			? items.findIndex((item) => (item.lang ?? null) === input.lang)
			: items.findIndex(() => true);

	const uploadDate = input.uploadDate ?? ddDateFromMtime(new Date());
	const applied = (base: StoredMediaItem): StoredMediaItem => ({
		...base,
		files_info: input.filesInfo,
		original_file_name: input.originalFileName,
		original_normalized_name: input.originalNormalizedName,
		original_upload_date: uploadDate,
		lib_data: base.lib_data ?? null,
	});

	if (targetIndex >= 0) {
		items[targetIndex] = applied(items[targetIndex] as StoredMediaItem);
	} else {
		const nextId =
			items.reduce((max, i) => (typeof i.id === 'number' && i.id > max ? i.id : max), 0) + 1;
		const fresh: StoredMediaItem = { id: nextId };
		if (input.lang !== null) fresh.lang = input.lang;
		items.push(applied(fresh));
	}

	await updateMatrixKeyData(
		table,
		input.sectionTipo,
		input.sectionId,
		MEDIA_COLUMN,
		input.componentTipo,
		items,
	);
}
