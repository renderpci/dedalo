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
 * step. `persistScannedFilesInfo` never creates items — a component with no
 * stored media item is left untouched (nothing to refresh). Minting one is the
 * job of `persistUploadedMedia` below, reached only from an INGEST or the
 * operator's explicit sync_files reconcile; a passive scan must never do it.
 */

import { config } from '../../../config/config.ts';
import type { MediaTypeSpec } from '../../concepts/media.ts';
import type { MatrixJsonbColumn } from '../../db/matrix.ts';
import { readMatrixKeyForUpdate, updateMatrixKeysData } from '../../db/matrix_write.ts';
import { withTransaction } from '../../db/postgres.ts';
import { getMatrixTableFromTipo } from '../../ontology/resolver.ts';
import { type DdDate, type FileInfoEntry, ddDateFromMtime } from '../files_info.ts';

const MEDIA_COLUMN: MatrixJsonbColumn = 'media';

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

/** What a reconcile actually did to the stored value. */
export type FilesInfoReconcileAction =
	/** An existing item's files_info was refreshed. */
	| 'refreshed'
	/** The component had NO item and one was minted from the scan (repair only). */
	| 'created'
	/** Nothing to write: no item to refresh, or nothing found on disk. */
	| 'noop'
	/**
	 * The RECORD is not there — deleted mid-flight, or a section with no matrix
	 * table. Distinct from 'noop' on purpose: "nothing needed doing" and "the
	 * thing you asked about does not exist" must not report the same to an
	 * operator (S2-02 fail-loud). A 'noop' guard alone can never see this.
	 */
	| 'missing';

export interface FilesInfoReconcileResult {
	action: FilesInfoReconcileAction;
	/** Rows the UPDATE touched — 1 on a real write, 0 otherwise. */
	affected: number;
}

/**
 * Throw when the reconcile found no record. Shared by every caller so the five
 * media write-back sites have ONE failure posture: the tool handlers turn the
 * throw into their `fail(...)` response instead of each inventing a check (or,
 * as they did, silently reporting a write that never happened).
 */
export function assertRecordPresent(
	outcome: FilesInfoReconcileResult,
	target: { sectionTipo: string; sectionId: number },
): FilesInfoReconcileResult {
	if (outcome.action === 'missing') {
		throw new Error(
			`media write-back: record ${target.sectionTipo}/${target.sectionId} no longer exists — nothing was written`,
		);
	}
	return outcome;
}

/**
 * Reconcile a component's stored media items against a FRESH DISK SCAN — the
 * single writer for every files_info write-back (tool mutations, the AV
 * job-completion write-back, the sync_files repair).
 *
 * ONE LOCKED transaction: the stored items are re-read here under a `FOR UPDATE`
 * row lock and written in the same transaction. Callers must NOT hand in a
 * snapshot — theirs is always stale by the time the write lands (an AV
 * transcode ends minutes after its request; a tool's own persist can commit
 * between a request's read and its write), and because the write replaces the
 * WHOLE component key, a stale snapshot silently reverts whatever another
 * session committed on it.
 *
 * NEVER mints: a component with no stored item is left alone. That is the
 * passive-scan rule — a background or incidental scan must not resurrect media
 * someone removed. Minting is a DIFFERENT, deliberately differently-named entry
 * point (repairStoredFilesInfo) rather than a boolean anyone can flip on this
 * one: the two have different blast radii and should not look alike at a call
 * site.
 */
export async function reconcileStoredFilesInfo(
	input: FilesInfoReconcileInput,
): Promise<FilesInfoReconcileResult> {
	return await runReconcile(input, false);
}

export interface FilesInfoReconcileInput {
	sectionTipo: string;
	sectionId: number;
	componentTipo: string;
	lang: string | null;
	freshFilesInfo: readonly FileInfoEntry[];
}

/**
 * The OPERATOR'S REPAIR — reconcile, and MINT the stored item when the component
 * has none and the scan found files.
 *
 * Exactly what PHP update_component_data_files_info (:3748) did unconditionally
 * on save: `{files_info}` from scratch, no provenance keys, when the data is
 * empty and files exist. Reachable only from tool_media_versions' explicit
 * sync_files action — an operator looking at THIS record's unsync warning. Do
 * not call it from a scan, a job, or an ingest.
 */
export async function repairStoredFilesInfo(
	input: FilesInfoReconcileInput,
): Promise<FilesInfoReconcileResult> {
	return await runReconcile(input, true);
}

async function runReconcile(
	input: FilesInfoReconcileInput,
	allowCreate: boolean,
): Promise<FilesInfoReconcileResult> {
	const table = await getMatrixTableFromTipo(input.sectionTipo);
	if (table === null) return { action: 'missing', affected: 0 };

	return await withTransaction(async () => {
		const stored = await readMatrixKeyForUpdate(
			table,
			input.sectionTipo,
			input.sectionId,
			MEDIA_COLUMN,
			input.componentTipo,
		);
		if (stored === null) return { action: 'missing', affected: 0 }; // row gone
		const items = stored as StoredMediaItem[];

		if (items.length === 0) {
			if (!allowCreate || input.freshFilesInfo.length === 0) {
				return { action: 'noop', affected: 0 };
			}
			const created = buildUploadedMediaItems({
				lang: input.lang,
				existingItems: [],
				filesInfo: input.freshFilesInfo,
				nameKeys: null, // provenance is unknown to a scan — PHP writes files_info alone
			});
			return { action: 'created', affected: await writeItems(table, input, created) };
		}

		const { items: updated, changed } = mergeFilesInfoIntoItems(
			items,
			input.lang,
			input.freshFilesInfo,
		);
		if (!changed) return { action: 'noop', affected: 0 };
		return { action: 'refreshed', affected: await writeItems(table, input, updated) };
	});
}

/** The one media-key write: `media -> <componentTipo>` = items. */
async function writeItems(
	table: string,
	target: { sectionTipo: string; sectionId: number; componentTipo: string },
	items: readonly StoredMediaItem[],
): Promise<number> {
	return await updateMatrixKeysData(table, target.sectionTipo, target.sectionId, [
		{ column: MEDIA_COLUMN, key: target.componentTipo, value: items },
	]);
}

/**
 * Which name-key trio an ingest stamps on the stored item, mirroring PHP
 * component_image::process_uploaded_file (:778): the tier the file actually
 * landed in decides. 'original' → original_file_name/_normalized_name/_upload_date,
 * 'modified' → the modified_* twins (the retouched tier), and null → NEITHER,
 * which is both PHP's behaviour for any other target quality and the shape
 * update_component_data_files_info (:3756) creates when it mints a data item
 * from scratch for files it found on disk.
 */
export type MediaNameKeys = 'original' | 'modified' | null;

/**
 * The name trio a given TARGET QUALITY stamps (PHP component_image::
 * process_uploaded_file :778-791 — an if/else-if over get_original_quality() /
 * get_modified_quality(), with no else). The modified tier is an IMAGE concept
 * (the retouched quality); every other type only ever stamps 'original'.
 */
export function nameKeysForQuality(
	spec: MediaTypeSpec,
	quality: string | null | undefined,
): MediaNameKeys {
	const target = quality == null || quality === '' ? spec.originalQuality : quality;
	if (target === spec.originalQuality) return 'original';
	if (spec.model === 'component_image' && target === config.media.imageQualityRetouched) {
		return 'modified';
	}
	return null;
}

/** The pure inputs of the item build (no record identity — see UploadedMediaInput). */
export interface UploadedMediaItemsInput {
	lang: string | null;
	existingItems: readonly StoredMediaItem[];
	filesInfo: readonly FileInfoEntry[];
	/** The uploaded file's own name; required unless nameKeys is null. */
	originalFileName?: string;
	/** The stored `<media identifier>.<ext>`; required unless nameKeys is null. */
	originalNormalizedName?: string;
	uploadDate?: DdDate;
	/** Defaults to 'original' — the tier every plain upload lands in. */
	nameKeys?: MediaNameKeys;
}

/**
 * The item list an upload/repair writes — the whole decision, DB-free so it can
 * be gated directly. Throws when a caller asks to stamp provenance without the
 * names: a programming error, not a data condition, and half a trio is worse
 * than none.
 */
export function buildUploadedMediaItems(input: UploadedMediaItemsInput): StoredMediaItem[] {
	const nameKeys = input.nameKeys === undefined ? 'original' : input.nameKeys;
	if (
		nameKeys !== null &&
		(input.originalFileName === undefined || input.originalNormalizedName === undefined)
	) {
		throw new Error(`persistUploadedMedia: nameKeys '${nameKeys}' requires the file names`);
	}

	const items: StoredMediaItem[] = input.existingItems.map((item) => ({ ...item }));
	// Locate the item to update: the lang-matched item (translatable) or the
	// first item (non-translatable). Create it when absent.
	const targetIndex =
		input.lang !== null
			? items.findIndex((item) => (item.lang ?? null) === input.lang)
			: items.findIndex(() => true);

	const uploadDate = input.uploadDate ?? ddDateFromMtime(new Date());
	const names: Record<string, unknown> =
		nameKeys === null
			? {}
			: {
					[`${nameKeys}_file_name`]: input.originalFileName,
					[`${nameKeys}_normalized_name`]: input.originalNormalizedName,
					[`${nameKeys}_upload_date`]: uploadDate,
				};
	const applied = (base: StoredMediaItem): StoredMediaItem => ({
		...base,
		files_info: input.filesInfo,
		...names,
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
	return items;
}

export interface UploadedMediaInput extends Omit<UploadedMediaItemsInput, 'existingItems'> {
	sectionTipo: string;
	sectionId: number;
	componentTipo: string;
}

/**
 * Persist a fresh UPLOAD onto the record's stored media item (PHP
 * process_uploaded_file → component->save()): sets files_info + the name keys,
 * CREATING the item when the component had none. Without this the record
 * kept its old files_info after an upload, so the client rendered the stale
 * image (or the placeholder) instead of the newly uploaded one.
 *
 * Non-translatable media (lang null) → the single item id:1. Translatable →
 * the item for that lang, created if absent. files_info is a filesystem-derived
 * cache, so this is a direct jsonb write without a Time Machine entry (matching
 * the other media write-backs); the name keys ride along on the same write.
 *
 * The existing items are RE-READ here under the row lock, never taken from the
 * caller: an ingest's snapshot predates its own derivative generation, and a
 * second upload (or an AV job's write-back) can commit on the same key while
 * the first is still building files — and this write replaces the whole key.
 *
 * `nameKeys: null` writes files_info alone — the file did not land in a tier
 * whose provenance the component records (see MediaNameKeys).
 *
 * THROWS when the write touched no row — no matrix table, or the record was
 * deleted mid-flight. The file is already on disk at that point, so answering
 * the operator "uploaded" would leave exactly the silent-loss state the
 * sync_files repair exists to clean up. The tool handlers turn the throw into
 * their `fail(...)` response (S2-02 fail-loud).
 */
export async function persistUploadedMedia(input: UploadedMediaInput): Promise<void> {
	const table = await getMatrixTableFromTipo(input.sectionTipo);
	const affected =
		table === null
			? 0
			: await withTransaction(async () => {
					const stored = await readMatrixKeyForUpdate(
						table,
						input.sectionTipo,
						input.sectionId,
						MEDIA_COLUMN,
						input.componentTipo,
					);
					if (stored === null) return 0; // row gone — write nothing, report nothing
					const items = buildUploadedMediaItems({
						...input,
						existingItems: stored as StoredMediaItem[],
					});
					return await writeItems(table, input, items);
				});
	if (affected === 0) {
		throw new Error(
			`media upload: record ${input.sectionTipo}/${input.sectionId} no longer exists — the file is on disk but nothing was recorded`,
		);
	}
}
