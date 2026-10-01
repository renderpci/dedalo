/**
 * files_info write-back (Media R1 tail). After a mutating media op
 * (build_version / rotate / delete_version), refresh the stored media item's
 * files_info in the matrix so the DB is immediately consistent instead of waiting
 * for the next component save.
 *
 * THE ONE MEDIA-KEY WRITER (CLOSURE_PLAN Step 2: TOOLS-5,
 * WC-2026-09-30-media-key-locked-transform). Every write of a `media[tipo]` array
 * outside the component save is a LOCKED TRANSFORM (transformStoredMediaItems):
 * the stored items are read under the row's `FOR UPDATE` lock and the caller's
 * pure function decides, from THOSE items, what to write. A door that did its
 * file work first and then wrote the array it had read before (tool_update_cache,
 * the files_info reconcile sweep, the duplicate's media refresh) silently
 * reverted anything a curator committed in between — an upload's name keys, a
 * second item. The private `writeItems` has exactly one caller, the transform
 * (write_obligations_tripwire leg B4).
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
import { canonicalEquals } from '../../concepts/canonical_json.ts';
import type { MediaTypeSpec } from '../../concepts/media.ts';
import type { MatrixJsonbColumn } from '../../db/matrix.ts';
import { readMatrixKeyForUpdate, updateMatrixKeysData } from '../../db/matrix_write.ts';
import {
	isInTransaction,
	MAINTENANCE_LOCK_TIMEOUT,
	sql,
	sqlStateOf,
	withTransaction,
} from '../../db/postgres.ts';
import { DedaloError } from '../../errors/dedalo_error.ts';
import { getMatrixTableFromTipo } from '../../ontology/resolver.ts';
import { type DdDate, ddDateFromMtime, type FileInfoEntry } from '../files_info.ts';

const MEDIA_COLUMN: MatrixJsonbColumn = 'media';

export interface StoredMediaItem {
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

/**
 * What a locked transform decides for the items it was handed: the items to
 * WRITE, or a reason to write nothing — `noop` (already current) or `held` (the
 * transform refused a change it may not make here, e.g. a shrink). SYNCHRONOUS
 * BY TYPE: the row lock is held while it runs, so no file work, no network,
 * no await ever happens under it — do the slow half before, key it by identity.
 */
export type MediaItemsTransform = (
	locked: readonly StoredMediaItem[],
) => { write: StoredMediaItem[] } | { skip: 'noop' | 'held' };

/** What one locked transform did. */
export interface MediaItemsTransformResult {
	/**
	 * `written` — the transform's items were written; `noop`/`held` — it chose not
	 * to write (or wrote what was already there, which is a noop); `missing` — the
	 * record (or its section's table) is not there; `locked` — the row lock could
	 * not be had within the lock timeout (SQLSTATE 55P03), nothing written.
	 */
	action: 'written' | 'noop' | 'held' | 'missing' | 'locked';
	/** Rows the UPDATE touched — 1 on a write, 0 otherwise. */
	affected: number;
	/** The items as written (`written` only). */
	items?: StoredMediaItem[];
}

/**
 * How a transform's row-lock WAIT is bounded — declared by every caller:
 *  - `per-record`: a door that visits MANY records (tool_update_cache, the
 *    files_info sweep) bounds each wait itself, on whatever pool it runs — the
 *    request pool bounds no lock wait (DB_STATEMENT_TIMEOUT_MS defaults to 0 =
 *    wait forever; a configured ceiling cancels the wait as a statement timeout,
 *    which no per-record outcome classifies). `SET LOCAL lock_timeout` to the
 *    maintenance bound (MAINTENANCE_LOCK_TIMEOUT) — or, under a request ceiling
 *    shorter than that, to half the ceiling, so the WAIT always ends first, as
 *    55P03 — makes one held row the `locked` outcome of that record alone.
 *  - `request`: one record a caller is waiting for (an upload, a write-back, the
 *    duplicate's refresh of its own clone) waits under the caller's own bounds.
 */
export interface MediaTransformOptions {
	lockWait: 'per-record' | 'request';
}

/**
 * The per-record lock-wait bound, in ms: the maintenance bound, below any
 * request ceiling (`ceiling` = the request pool's statement_timeout, 0 = none).
 */
export function perRecordLockWaitMs(ceiling: number = config.ops.dbStatementTimeoutMs): number {
	const maintenance = parseDurationMs(MAINTENANCE_LOCK_TIMEOUT);
	return ceiling > 0 ? Math.max(1, Math.min(maintenance, Math.floor(ceiling / 2))) : maintenance;
}

function parseDurationMs(duration: string): number {
	const match = /^(\d+)(ms|s)$/.exec(duration);
	if (match === null) {
		throw new DedaloError('internal.invariant', {
			message: `files_info_persist: MAINTENANCE_LOCK_TIMEOUT '${duration}' is not an ms/s duration`,
		});
	}
	return Number(match[1]) * (match[2] === 's' ? 1000 : 1);
}

/**
 * THE LOCKED TRANSFORM — read `media[componentTipo]` under the row lock, hand it
 * to `transform`, write what it returns in the same transaction. The one door to
 * `writeItems`.
 *
 * REFUSED inside a caller's transaction: the row lock would then be held to the
 * caller's COMMIT — for a sweep, the whole run. Each call is its own short unit.
 * A lock timeout is per record (`locked`), never an escape that aborts a sweep;
 * a sweep declares `lockWait: 'per-record'` so the wait HAS a timeout on every
 * pool (MediaTransformOptions).
 */
export async function transformStoredMediaItems(
	target: { sectionTipo: string; sectionId: number; componentTipo: string },
	transform: MediaItemsTransform,
	options: MediaTransformOptions,
): Promise<MediaItemsTransformResult> {
	if (isInTransaction()) {
		throw new DedaloError('internal.invariant', {
			message: `transformStoredMediaItems: refusing to run inside a caller's transaction — the row lock on ${target.sectionTipo}/${target.sectionId} would be held to that transaction's COMMIT; call it outside one`,
			coordinates: {
				section_tipo: target.sectionTipo,
				section_id: target.sectionId,
				component_tipo: target.componentTipo,
			},
		});
	}
	const table = await getMatrixTableFromTipo(target.sectionTipo);
	if (table === null) return { action: 'missing', affected: 0 };
	try {
		return await withTransaction(async (): Promise<MediaItemsTransformResult> => {
			if (options.lockWait === 'per-record') {
				await sql.unsafe(`SET LOCAL lock_timeout = '${perRecordLockWaitMs()}ms'`, []);
			}
			const stored = await readMatrixKeyForUpdate(
				table,
				target.sectionTipo,
				target.sectionId,
				MEDIA_COLUMN,
				target.componentTipo,
			);
			if (stored === null) return { action: 'missing', affected: 0 }; // row gone
			const locked = stored as StoredMediaItem[];
			const decision = transform(locked);
			if ('skip' in decision) return { action: decision.skip, affected: 0 };
			// "the transform wrote what was already stored" is a noop (key order ignored)
			if (canonicalEquals(decision.write, locked)) return { action: 'noop', affected: 0 };
			const affected = await writeItems(table, target, decision.write);
			return affected === 0
				? { action: 'missing', affected: 0 }
				: { action: 'written', affected, items: decision.write };
		});
	} catch (error) {
		if (isLockTimeout(error)) return { action: 'locked', affected: 0 };
		throw error;
	}
}

/** The row lock was not granted within the wait (raw SQLSTATE 55P03, or its typed twin). */
function isLockTimeout(error: unknown): boolean {
	if (sqlStateOf(error) === '55P03') return true;
	return error instanceof DedaloError && error.code === 'db.lock_timeout';
}

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
		throw new DedaloError('resource.not_found', {
			message: `media write-back: record ${target.sectionTipo}/${target.sectionId} no longer exists — nothing was written`,
			publicMessage: 'media write-back: the record no longer exists — nothing was written',
			coordinates: { section_tipo: target.sectionTipo, section_id: target.sectionId },
		});
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
	let decided: FilesInfoReconcileAction = 'noop';
	const outcome = await transformStoredMediaItems(
		input,
		(items) => {
			if (items.length === 0) {
				if (!allowCreate || input.freshFilesInfo.length === 0) return { skip: 'noop' };
				decided = 'created';
				return {
					write: buildUploadedMediaItems({
						lang: input.lang,
						existingItems: [],
						filesInfo: input.freshFilesInfo,
						nameKeys: null, // provenance is unknown to a scan — PHP writes files_info alone
					}),
				};
			}
			const { items: updated, changed } = mergeFilesInfoIntoItems(
				items,
				input.lang,
				input.freshFilesInfo,
			);
			if (!changed) return { skip: 'noop' };
			decided = 'refreshed';
			return { write: updated };
		},
		{ lockWait: 'request' },
	);
	if (outcome.action === 'missing') return { action: 'missing', affected: 0 };
	if (outcome.action === 'locked') {
		// A write-back is one record the caller is looking at: the timeout is the
		// caller's failure to report, not a silent noop.
		throw new DedaloError('db.lock_timeout', {
			message: `media write-back: the row of ${input.sectionTipo}/${input.sectionId} stayed locked past the lock timeout — nothing was written`,
			coordinates: { section_tipo: input.sectionTipo, section_id: input.sectionId },
		});
	}
	if (outcome.action !== 'written') return { action: 'noop', affected: 0 };
	return { action: decided, affected: outcome.affected };
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
	const outcome = await transformStoredMediaItems(
		input,
		(stored) => ({ write: buildUploadedMediaItems({ ...input, existingItems: stored }) }),
		{ lockWait: 'request' },
	);
	if (outcome.action === 'locked') {
		throw new DedaloError('db.lock_timeout', {
			message: `media upload: the row of ${input.sectionTipo}/${input.sectionId} stayed locked past the lock timeout — the file is on disk but nothing was recorded`,
			coordinates: { section_tipo: input.sectionTipo, section_id: input.sectionId },
		});
	}
	// `noop` — the upload's items are already exactly what is stored (a re-run
	// of the same persist): recorded, nothing to write.
	const affected = outcome.action === 'written' || outcome.action === 'noop' ? 1 : 0;
	if (affected === 0) {
		throw new DedaloError('resource.not_found', {
			message: `media upload: record ${input.sectionTipo}/${input.sectionId} no longer exists — the file is on disk but nothing was recorded`,
			publicMessage:
				'media upload: the record no longer exists — the file is on disk but nothing was recorded',
			coordinates: { section_tipo: input.sectionTipo, section_id: input.sectionId },
		});
	}
}
