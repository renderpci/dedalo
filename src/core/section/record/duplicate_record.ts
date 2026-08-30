/**
 * Section record duplication (PHP dd_core_api::duplicate →
 * section_record::duplicate).
 *
 * A duplicate is a NEW record (fresh counter-allocated section_id, fresh audit
 * metadata) carrying a copy of the source's component data. Empirically
 * verified against live PHP (test2 fixtures):
 * - `data` column: fresh metadata, NOT copied (build_metadata);
 * - copied columns: every jsonb column except data/meta/relation_search, with
 *   the audit component tipos (dd197/dd199/dd200/dd201) dropped — they get
 *   fresh stamps instead — and covered-observer mirror slots dropped too
 *   (derived "who references me" state; empty by construction on a fresh
 *   record — see isCoveredObserverTipo, Phase-0 disarm 2026-08-02);
 * - audit stamps: created dd200/dd199 AND modified dd197/dd201 all point at the
 *   duplicating user "now" (the per-component re-save loop stamps modification
 *   data on top of the creation stamps);
 * - `meta`: [{count: maxItemId}] per COPIED component tipo (the re-save loop's
 *   counter shape — array-wrapped, PHP canonical);
 * - Time Machine: one audit row per copied component tipo with the DATA-LANG
 *   slice of the copied value (nolan slice for non-translatable components);
 * - save event: fired ONCE, LAST (this writer bypasses the record_write.ts
 *   chokepoint, so it invalidates for itself — a duplicated dd1324 row clones a
 *   tool's name + active flag into the registry). Gated by
 *   test/unit/tools_cache_invalidation.test.ts.
 *
 * Media-file duplication (physical file copies + files_info refresh) is now
 * wired (engineering/MEDIA_SPEC.md Phase B): for every copied media component the
 * quality/extension files are copied to the new section_id and the copied
 * item's files_info is re-scanned against the new paths and PERSISTED onto
 * the stored row (per-key write, no TM — S1-04). LEDGERED: media
 * derivative REGENERATION (we copy existing derivatives, not rebuild them).
 *
 * Dataframe frame targets are RE-MINTED, never shared
 * (WC-2026-08-27-duplicate-reminted-dataframe-targets, closing DATA-05): a
 * dd490 pairing locator OWNS the record it addresses — the frame's fields
 * live there — so copying it verbatim (what PHP does, and what this file did)
 * left ONE frame target pointed at by two main items on two records, and a
 * curator correcting the copy's frame silently rewrote the original's. See
 * remintDataframeTargets: every frame target is deep-copied through this same
 * writer and the copied locator re-pointed, or the duplicate is REFUSED. There
 * is no third option: a duplicate that shares some frames is corruption that
 * nothing detects. NARROWED to frames that name a Dedalo record address: an
 * external remote id or an absent one owns nothing, so it is copied verbatim
 * exactly as before (frameTargetAddress).
 *
 * Re-minting MINTS RECORDS IN A SECTION THE CALLER NEVER NAMED, so this writer
 * re-asks the write grant (level 2) on every frame target's section for the
 * duplicating user — the doors above gate the HOST section alone, and nothing
 * in a duplicate request mentions the target section at all. See
 * assertFrameTargetDuplicable.
 *
 * NOT ATOMIC, AND SAID OUT LOUD (2026-08-28, CLI-01 / P0-10). This writer opens
 * NO transaction. The clone COMMITS at step 4 (insertMatrixRecordWithCounter is
 * a single autocommit statement), and steps 3b, 4b, 5, 6 and 7 — frame-target
 * re-minting, media file copies, the two Time Machine rows per component, the
 * observer cascade and fireSaveEvent — run outside any transaction, before and
 * after that commit. Consequences a caller must know:
 *
 *   - A THROW HERE DOES NOT MEAN NOTHING HAPPENED. A failure at step 5 leaves a
 *     committed duplicate with no history; a failure at step 6 leaves one whose
 *     targets' observer mirrors do not know about it. This is precisely why the
 *     idempotency gate (api/dispatch.ts, Gate 4) refuses to re-execute after a
 *     thrown handler and answers `idempotency.outcome_unknown` instead: freeing
 *     the key would let the transport's automatic resend mint a SECOND clone of
 *     a heritage record.
 *
 * WHY IT IS NOT SIMPLY WRAPPED IN withTransaction, verified rather than assumed
 * — a naive wrap would introduce a WORSE defect than the one it closes:
 *
 *   1. THE COUNTER ROLLS BACK, THE FILES DO NOT. The id comes from a ROW in
 *      `matrix_counter` (matrix_write.ts: `ON CONFLICT (tipo) DO UPDATE SET
 *      value = value + 1`), not from a sequence — so a ROLLBACK returns the
 *      counter to its previous value and the NEXT duplicate is handed the SAME
 *      section_id. Media file names embed that id
 *      (media/path.ts: `{component_tipo}_{section_tipo}_{section_id}`), and a
 *      filesystem copy is not transactional, so the rolled-back attempt's files
 *      would be ADOPTED by the next record to receive that id: a photograph
 *      silently attached to the wrong object, which nothing detects.
 *   2. THE OBSERVER CASCADE CHANGES MEANING INSIDE A TRANSACTION. Cascade hops
 *      would defer to the COMMIT-ONLY lane (record/observers.ts emitCascadeHop —
 *      runObserverCascadeHop refuses an ambient tx outright, B6), which is the
 *      designed behaviour and fine. But propagateToObservers RETHROWS inside an
 *      ambient transaction where it swallows loudly outside one, so an observer
 *      failure that today leaves a good duplicate would abort the whole
 *      duplicate instead.
 *
 * The structurally correct form is therefore not "add withTransaction" but a
 * SPLIT: a transaction covering step 3b's re-mints + the insert + the Time
 * Machine rows + the in-tx observer writes, with the media copies and
 * fireSaveEvent moved strictly AFTER the commit (so a rollback can never leave a
 * file addressed by a reusable id). That is a restructure of the engine's most
 * delicate write path and belongs with its own gate, in its own change — it must
 * not ride along inside an idempotency fix, and it does not remove the need for
 * the ambiguous-outcome rule, which stands as long as ANY committed work can be
 * followed by a throw.
 */

import { config } from '../../../config/config.ts';
import { isMediaModel, mediaTypeOf } from '../../concepts/media.ts';
import { isConsultationOnlySection } from '../../concepts/section.ts';
import { isConvertibleSectionIdString, isSectionId } from '../../concepts/section_id.ts';
import { isDataframeEntry } from '../../concepts/subdatum.ts';
import { MATRIX_JSONB_COLUMNS, type MatrixJsonbColumn, readMatrixRecord } from '../../db/matrix.ts';
import { insertMatrixRecordWithCounter, updateMatrixKeyData } from '../../db/matrix_write.ts';
import { recordTimeMachine } from '../../db/time_machine.ts';
import { DedaloError } from '../../errors/dedalo_error.ts';
import { duplicateMediaFiles } from '../../media/file_ops.ts';
import { refreshStoredFilesInfo } from '../../media/files_info.ts';
import { resolveMediaPathOptions } from '../../media/ontology_path.ts';
import type { MediaIdentity } from '../../media/path.ts';
import {
	getMatrixTableFromTipo,
	getModelByTipo,
	getTranslatableByTipo,
} from '../../ontology/resolver.ts';
import { currentDataLang } from '../../resolve/request_lang.ts';
import { fireSaveEvent } from '../../section_record/save_event.ts';
import type { Principal } from '../../security/permissions.ts';
import {
	auditDateItem,
	auditUserLocator,
	buildRecordMetadata,
	CREATED_BY_USER,
	CREATED_DATE,
	dbTimestamp,
	MODIFIED_BY_USER,
	MODIFIED_DATE,
} from './create_record.ts';

/** Audit tipos never copied from the source (they get fresh stamps). */
const AUDIT_TIPOS: ReadonlySet<string> = new Set([
	CREATED_BY_USER,
	CREATED_DATE,
	MODIFIED_BY_USER,
	MODIFIED_DATE,
]);

/** Columns whose content is NOT copied wholesale (rebuilt or system-managed). */
const SKIP_COPY_COLUMNS: ReadonlySet<string> = new Set(['data', 'meta', 'relation_search']);

/** One copied component slice: its column, tipo, and item array. */
interface CopiedComponent {
	column: MatrixJsonbColumn;
	tipo: string;
	items: { id?: number; lang?: string }[];
}

/**
 * Duplicate one section record. Returns the new section_id. `now` is
 * injectable for deterministic tests.
 *
 * `remintChain` is INTERNAL: the ancestry of records this duplication is
 * already copying, so the frame-target re-mint (which re-enters this same
 * function) refuses a cycle instead of recursing forever. NO caller outside
 * this file passes it (census 2026-08-27: dd_core_api, the MCP field writer
 * and every gate hand over three arguments). Deleting the guard is not a
 * refactor but an unbounded recursion — gated by the CYCLE test in
 * test/unit/duplicate_record_dataframe_native.test.ts, which does not
 * terminate without it.
 */
export async function duplicateSectionRecord(
	sectionTipo: string,
	sourceSectionId: number,
	userId: number,
	now: Date = new Date(),
	remintChain: ReadonlySet<string> = new Set(),
): Promise<number> {
	// Consultation-only sections are read-only for every caller (engine backstop;
	// the API handler denies earlier with a clean 403). See concepts/section.ts.
	if (isConsultationOnlySection(sectionTipo)) {
		throw new DedaloError('perm.denied', {
			message: `duplicateSectionRecord: section '${sectionTipo}' is consultation-only (read-only)`,
			coordinates: {
				section_tipo: sectionTipo,
				section_id: sourceSectionId,
				operation: 'duplicate',
			},
		});
	}
	// PHP refuses duplicating non-positive records even for root (API duplicate →
	// assert_record_in_user_scope → user_can_access_record false for section_id<1);
	// engine backstop mirroring the delete_record.ts guards.
	if (sourceSectionId < 1) {
		throw new DedaloError('section_id.not_an_address', {
			message: `duplicateSectionRecord: refusing to duplicate non-positive section_id ${sourceSectionId}`,
			coordinates: {
				section_tipo: sectionTipo,
				section_id: sourceSectionId,
				operation: 'duplicate',
			},
		});
	}
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) {
		throw new DedaloError('section.no_matrix_table', {
			message: `duplicateSectionRecord: no matrix table for section '${sectionTipo}'`,
			coordinates: { section_tipo: sectionTipo },
		});
	}
	const source = await readMatrixRecord(table, sectionTipo, sourceSectionId);
	if (source === null) {
		throw new DedaloError('resource.not_found', {
			message: `duplicateSectionRecord: source record ${sectionTipo}/${sourceSectionId} not found`,
			coordinates: { section_tipo: sectionTipo, section_id: sourceSectionId },
		});
	}

	// 1. Copy component columns (audit tipos dropped — fresh stamps below;
	//    covered-observer mirror slots dropped too — see below).
	const values: Partial<Record<MatrixJsonbColumn, unknown>> = {};
	const copied: CopiedComponent[] = [];
	for (const column of MATRIX_JSONB_COLUMNS) {
		if (SKIP_COPY_COLUMNS.has(column)) continue;
		const columnData = source.columns[column] as Record<string, unknown> | null | undefined;
		if (columnData == null || typeof columnData !== 'object') continue;
		const copy: Record<string, unknown> = {};
		for (const [tipo, items] of Object.entries(columnData)) {
			if (AUDIT_TIPOS.has(tipo)) continue;
			// Observer mirror slots are NEVER copied (Phase-0 disarm 2026-08-02):
			// the source's bag mirrors the SOURCE's referencers, and nothing can
			// reference a record that does not exist yet — the copy's correct bag
			// is EMPTY BY CONSTRUCTION (absent slot), no recompute law needed.
			// The old copy-then-shrink shape relied on recomputeExternalRelation,
			// which now REFUSES unported-sub-law nodes (numisdata679/965): a
			// copied bag there would persist ~1,000 phantom, index-fed locators
			// per duplicate with no repair path until D3. Stripping also keeps
			// the matrix_relation_index sync trigger from indexing the phantoms.
			if (column === 'relation' && (await isCoveredObserverTipo(tipo))) continue;
			copy[tipo] = items;
			if (Array.isArray(items)) {
				copied.push({ column, tipo, items: items as CopiedComponent['items'] });
			}
		}
		if (Object.keys(copy).length > 0) values[column] = copy;
	}

	// 2. Fresh audit metadata: created AND modified stamps (the PHP re-save loop
	//    layers 'update_record' modification data over the creation stamps).
	values.data = await buildRecordMetadata(sectionTipo, userId, now);
	values.relation = {
		...((values.relation as Record<string, unknown>) ?? {}),
		[MODIFIED_BY_USER]: [auditUserLocator(userId, MODIFIED_BY_USER)],
		[CREATED_BY_USER]: [auditUserLocator(userId, CREATED_BY_USER)],
	};
	values.date = {
		...((values.date as Record<string, unknown>) ?? {}),
		[CREATED_DATE]: [auditDateItem(now)],
		[MODIFIED_DATE]: [auditDateItem(now)],
	};

	// 3. meta: the re-save loop's per-component counter for every copied tipo
	//    ([{count: maxItemId}], PHP canonical array shape).
	const meta: Record<string, unknown> = {
		...((source.columns.meta as Record<string, unknown>) ?? {}),
	};
	for (const component of copied) {
		const maxId = component.items.reduce(
			(max, item) => (typeof item.id === 'number' && item.id > max ? item.id : max),
			0,
		);
		if (maxId > 0) meta[component.tipo] = [{ count: maxId }];
	}
	if (Object.keys(meta).length > 0) values.meta = meta;
	// relation_search: copied as-is when present (rebuilt lazily by later saves).
	if (source.columns.relation_search != null)
		values.relation_search = source.columns.relation_search;

	// 3b. Dataframe frame targets: RE-MINT or REFUSE, before the duplicate
	//     exists. Runs AFTER relation_search is attached so the census covers
	//     every copied column, and BEFORE the insert so no row can ever be
	//     stored sharing a frame target — not even for the width of a
	//     transaction we do not hold (see remintDataframeTargets).
	await remintDataframeTargets(values, sectionTipo, sourceSectionId, userId, now, remintChain);

	// 4. Insert the new record (counter-allocated id).
	const newSectionId = await insertMatrixRecordWithCounter(table, sectionTipo, values);

	// 4b. Media files: copy every quality/ext file to the new id and refresh the
	//     copied item's files_info to the new paths (PHP duplicate_component_media_files).
	//     Only when a media root is configured; missing source files are no-ops
	//     (PHP logs and continues) so a data-only duplicate never fails here.
	if (config.media.rootPath !== null) {
		await duplicateRecordMediaFiles(
			values,
			copied,
			table,
			sectionTipo,
			sourceSectionId,
			newSectionId,
		);
	}

	// 5. Time Machine: TWO rows per copied component (empirically verified) —
	//    (a) the backfill-repair row (PHP tm_record::create previous_data path:
	//        history is empty on a fresh record, so the FULL copied value is
	//        stored first, stamped one minute EARLIER to order before the save);
	//    (b) the save row with the data-lang slice (nolan for non-translatable
	//        components — the re-save loop's instance lang).
	const saveTimestamp = dbTimestamp(now);
	const backfillTimestamp = dbTimestamp(new Date(now.getTime() - 60_000));
	for (const component of copied) {
		const translatable = await getTranslatableByTipo(component.tipo);
		// currentDataLang(), NOT config.menu.dataLang (P0-7/DATA-01): the slice this
		// picks is the one the duplicate's TM rows are stamped with, so the install
		// default silently audited the copy under a language the operator was not
		// working in.
		const sliceLang = translatable ? currentDataLang() : 'lg-nolan';
		const hasLangKeys = component.items.some((item) => item.lang !== undefined);
		const slice = hasLangKeys
			? component.items.filter((item) => item.lang === sliceLang)
			: component.items;
		const baseEntry = {
			sectionTipo,
			sectionId: newSectionId,
			componentTipo: component.tipo,
			lang: sliceLang,
			userId,
		};
		await recordTimeMachine({ ...baseEntry, data: component.items }, backfillTimestamp);
		await recordTimeMachine({ ...baseEntry, data: slice }, saveTimestamp);
	}

	// 6. Observer cascade (2026-07-24): the duplicate is a NEW referencer of
	//    every target its copied relation locators point at — the targets'
	//    observer mirrors (hierarchy93 family) must recompute or they miss the
	//    duplicate until a reconcile. Cheap gate inside propagateToObservers
	//    (Act 2: no subscription in the registry for the component's tipo, or
	//    every subscription client-only — no server block — → no-op; the
	//    ontology alone decides which edges fire).
	//    The copy's OWN observer-mirror slots were never copied (step 1 strips
	//    them — empty by construction for a fresh record), so there is nothing
	//    to recompute or shrink at the new record itself.
	{
		const { propagateToObservers } = await import('./observers.ts');
		for (const component of copied) {
			if (component.column !== 'relation') continue;
			await propagateToObservers(
				component.tipo,
				sectionTipo,
				newSectionId,
				// A duplicate only ADDS references — a fresh record removed nothing.
				{ saved: component.items, removed: [] },
				userId,
			);
		}
	}

	// 7. Cache invalidation: this writer inserts through matrix_write DIRECTLY,
	//    so it never passes the record_write.ts chokepoint that fires for every
	//    other write — it must fire for itself (PHP duplicate() closes with
	//    $new_section_record->save(), which calls save_event). ONE fire, LAST:
	//    the caches must be dropped after the copy, the media refresh and the
	//    observer cascade have all landed, or a concurrent read repopulates them
	//    with a half-built duplicate. Load-bearing for dd1324/dd996/dd234, where
	//    the duplicate clones a tool's name AND active flag into the registry:
	//    without this the tool is wrong in every user's menu until restart
	//    (no TTL since the cutover). Not tx-wrapped here, and fireSaveEvent
	//    self-defers its listener fan-out if a caller wraps us in one.
	await fireSaveEvent(sectionTipo);

	return newSectionId;
}

/**
 * Covered-observer detection (the set_dato_external mirror family): such a
 * component's stored bag is DERIVED state ("who references me"), never source
 * data — step 1 must not copy it (gated by observer_reconcile_native's
 * duplicate-strip test).
 *
 * DELIBERATELY reads the node's raw `observe` SHAPE, not the Act-2 registry:
 * the strip decision is "is this bag derived state by declaration?", which
 * needs only the declaration itself. Consistent with the dispatch rule (the
 * ontology decides — a declared server edge fires, reverse-only included):
 * every covered observer's edges now dispatch, so a stripped bag is
 * recomputed by the cascade/reconciler the moment its observed component
 * saves again.
 */
async function isCoveredObserverTipo(tipo: string): Promise<boolean> {
	const { getNode } = await import('../../ontology/resolver.ts');
	const observe = (
		(await getNode(tipo))?.properties as {
			observe?: {
				server?: {
					config?: { use_observable_dato?: boolean };
					perform?: { function?: string };
				};
			}[];
		} | null
	)?.observe;
	return (observe ?? []).some(
		(entry) =>
			entry?.server?.config?.use_observable_dato === true &&
			entry.server.perform?.function === 'set_dato_external',
	);
}

/**
 * ONE dd490 pairing locator inside the copied bag, addressed by the array it
 * lives in plus its index — the pair the re-mint needs to REPLACE the entry in
 * place. That array is the SAME object the stored column and the
 * CopiedComponent slice hold, so one in-place replacement keeps the row and
 * its Time Machine rows saying the same thing.
 */
interface FrameEntryRef {
	items: Record<string, unknown>[];
	index: number;
}

/** A frame target record, validated as an address a copy can be minted from. */
interface FrameTarget {
	/** `<section_tipo>/<section_id>` — the dedup key AND the cycle key. */
	key: string;
	sectionTipo: string;
	sectionId: number;
	/** The dataframe slot the pairing is stored under (named in every refusal). */
	frameTipo: string;
}

/** The chain/cycle key of one record. */
function recordKey(sectionTipo: string, sectionId: number): string {
	return `${sectionTipo}/${sectionId}`;
}

/**
 * THE REFUSAL (DATA-05). The two alternative shapes — sharing the target, or
 * dropping the frame from the copy — are silent corruption and silent loss, and
 * this system ranks either far above the inconvenience of a refused duplicate.
 * The dataframe slot is NAMED so the curator knows WHERE to repair. Not WITH
 * WHAT: `dataframe_control` scans these same dd490 locators but asks a
 * different question — "does this frame's MAIN ITEM still exist in the row?" —
 * so a frame whose TARGET record was deleted is invisible to it and its `fix`
 * would not strip one. Sending the curator there for an orphan target is
 * advice that does nothing, which is why the sentences below name the repair
 * instead of a tool.
 *
 * `record.dataframe_unduplicable` is a CONFLICT (409), public disclosure: the
 * curator asked for something the current state of their own record cannot
 * give, and every branch below is repairable BY THEM — re-point the pairing,
 * delete the stale frame, break the cycle. The first cut of this fix reused
 * `engine.uncovered_scope` (503, operator disclosure), which told the client
 * "the server is unavailable, retry" about a refusal no retry can change and
 * hid the slot name the repair needs behind the disclosure ladder.
 */
function refuseFrameCopy(
	reason: string,
	frameTipo: string,
	sectionTipo: string,
	sectionId: number,
): DedaloError {
	const sentence =
		`refusing to duplicate ${sectionTipo}/${sectionId} — its component_dataframe slot ` +
		`'${frameTipo}' ${reason}. A frame target record is OWNED by the item that frames it; ` +
		"the copy may never share the original's.";
	return new DedaloError('record.dataframe_unduplicable', {
		message: `duplicateSectionRecord: ${sentence}`,
		// PUBLIC on purpose: the actor holds write on the host record, so the
		// slot and the address it frames are already theirs to read.
		publicMessage: sentence,
		details: { component_tipo: frameTipo, reason },
		coordinates: {
			section_tipo: sectionTipo,
			section_id: sectionId,
			component_tipo: frameTipo,
			operation: 'duplicate',
		},
	});
}

/**
 * Census over EVERY copied column, never the `relation` column alone. Frames
 * live there today, but `relation_search` is copied verbatim too and a pairing
 * locator owns a record wherever it is stored — a column-scoped census would
 * report green over precisely what it cannot see.
 */
function collectDataframeEntries(
	values: Partial<Record<MatrixJsonbColumn, unknown>>,
): FrameEntryRef[] {
	const found: FrameEntryRef[] = [];
	for (const columnData of Object.values(values)) {
		if (columnData === null || typeof columnData !== 'object') continue;
		for (const items of Object.values(columnData as Record<string, unknown>)) {
			if (!Array.isArray(items)) continue;
			const bag = items as Record<string, unknown>[];
			bag.forEach((entry, index) => {
				if (isDataframeEntry(entry)) found.push({ items: bag, index });
			});
		}
	}
	return found;
}

/**
 * True when a stored `section_id` NAMES A DEDALO RECORD ADDRESS — a safe
 * integer, or the legacy string form of one ('509'), which
 * WC-2026-08-10-section-id-int-canonical converts.
 *
 * Everything else is a DIFFERENT CONCEPT wearing the field name
 * (concepts/section_id.ts): an external remote id ('001338683', 'Q42'), a
 * synthetic wire token, or no address at all (null / undefined / ''). The
 * dataframe write path already treats those as a real shape —
 * `normalizeDataframeEntry` passes a non-address section_id through verbatim,
 * and `area_maintenance/widgets/dataframe_control.ts` renders `section_id ??
 * unknown` — so a target-less frame is a shape this engine STORES, not
 * corruption to refuse over.
 */
function namesRecordAddress(value: unknown): boolean {
	return isSectionId(value) || (typeof value === 'string' && isConvertibleSectionIdString(value));
}

/**
 * The frame's target address WHEN THE FRAME NAMES ONE — `null` when it does
 * not, which is a COPY-VERBATIM answer and never a refusal.
 *
 * THE NARROWING (adversarial round 3, 2026-08-27). Refusing every frame whose
 * `section_id` is not a positive safe integer made a record carrying a
 * target-less or external-remote-id frame PERMANENTLY UNDUPLICABLE — and for
 * no integrity gain: such a frame OWNS no record, so the verbatim copy shares
 * nothing. That is the pre-existing behaviour and it is harmless; only an
 * ownership edge has to be re-minted. (Census of this machine's suite
 * database: 162 dd490 entries, 0 of them target-less — the shape is plausible
 * for installs carrying PHP-era or external-target frames, not present here.)
 *
 * What REMAINS a refusal: an address-shaped id the copy cannot be minted from
 * — a non-positive one (`-1` is the root record, `-666` the activity
 * sentinel), or one whose `section_tipo` is missing or empty, which names a
 * record without saying where. Those DO own something, and sharing it is the
 * corruption this whole file exists to prevent.
 */
function frameTargetAddress(
	frame: FrameEntryRef,
	sectionTipo: string,
	sectionId: number,
): FrameTarget | null {
	const entry = frame.items[frame.index] as Record<string, unknown>;
	const frameTipo =
		typeof entry.from_component_tipo === 'string' ? entry.from_component_tipo : 'unknown';
	// Not a record address → nothing is owned, nothing is shared: copy verbatim.
	if (!namesRecordAddress(entry.section_id)) return null;
	const targetTipo = entry.section_tipo;
	const targetId = Number(entry.section_id);
	if (typeof targetTipo !== 'string' || targetTipo === '' || targetId < 1) {
		throw refuseFrameCopy(
			'points at an address no record copy can be minted from',
			frameTipo,
			sectionTipo,
			sectionId,
		);
	}
	return {
		key: recordKey(targetTipo, targetId),
		sectionTipo: targetTipo,
		sectionId: targetId,
		frameTipo,
	};
}

/**
 * Everything that has to hold before a frame target can be deep-copied. Each
 * failure is a REFUSAL, never a fallback to sharing: an orphan pairing (the
 * target was deleted under it) blocks the duplicate loudly instead of copying a
 * dangling pointer, and a cycle — a frame whose target frames its way back into
 * a record already being copied — stops the recursion here rather than in a
 * stack overflow halfway through writing rows.
 *
 * AND the actor's WRITE GRANT on the target section, which is an authorization
 * gate this function is the ONLY holder of: see the block comment on it below.
 */
async function assertFrameTargetDuplicable(
	target: FrameTarget,
	sectionTipo: string,
	sectionId: number,
	chain: ReadonlySet<string>,
	actor: Principal,
): Promise<void> {
	// THE CYCLE GUARD. Gated by the CYCLE test in
	// duplicate_record_dataframe_native.test.ts (a mutual dd490 pair): without
	// this line the duplicate never returns.
	if (chain.has(target.key)) {
		throw refuseFrameCopy(
			`frames ${target.key}, a record this duplication is already copying (cycle)`,
			target.frameTipo,
			sectionTipo,
			sectionId,
		);
	}
	// BEFORE the grant, because it is the more actionable sentence and it is not
	// an authorization answer at all: consultation-only is a static property of
	// the ontology, identical for every principal, and getSectionPermissions
	// caps such a section at read (1) for everyone — asking the grant first would
	// answer "you lack permission" to a curator who lacks nothing.
	if (isConsultationOnlySection(target.sectionTipo)) {
		throw refuseFrameCopy(
			`frames ${target.key}, whose section is consultation-only (read-only)`,
			target.frameTipo,
			sectionTipo,
			sectionId,
		);
	}
	// THE WRITE GRANT ON THE TARGET SECTION. The duplicate doors ask
	// `getSectionPermissions(principal, sectionTipo) >= 2` on the HOST section
	// and nothing else (api/handlers/dd_core_api.ts, ai/mcp/tools/fields_write.ts)
	// — no request naming a duplicate ever mentions the frame target's section,
	// so the re-mint would otherwise MINT ROWS THERE for a curator holding level
	// 1 (read-only) on it, or 0. Same shape the relation write path uses before
	// linking into another section (relations/save.ts): ask the level on the
	// target, refuse rather than downgrade or skip. Least privilege: a refused
	// duplicate is recoverable, rows minted in a section the curator cannot
	// write are not — and they would carry that curator's audit stamps.
	//
	// Asked BEFORE the record is read, so a principal with no write grant does
	// not learn from the refusal whether the target still exists. THE ORDER OF
	// THESE TWO BLOCKS IS THE INVARIANT, and it is gated: the DISCLOSURE ORDER
	// test in duplicate_record_dataframe_native.test.ts duplicates a host whose
	// frame target was DELETED as a principal without the grant, and requires
	// perm.denied — swapping them turns this 403 into an existence oracle.
	const { getSectionPermissions } = await import('../../security/permissions.ts');
	if ((await getSectionPermissions(actor, target.sectionTipo)) < 2) {
		throw new DedaloError('perm.denied', {
			message:
				`duplicateSectionRecord: refusing to duplicate ${sectionTipo}/${sectionId} — its ` +
				`component_dataframe slot '${target.frameTipo}' frames ${target.key}, and user ` +
				`${actor.userId} holds no write grant (level 2) on section '${target.sectionTipo}'`,
			coordinates: {
				section_tipo: sectionTipo,
				section_id: sectionId,
				component_tipo: target.frameTipo,
				target_section_tipo: target.sectionTipo,
				required: 2,
				operation: 'duplicate',
			},
		});
	}
	const table = await getMatrixTableFromTipo(target.sectionTipo);
	if (table === null) {
		throw refuseFrameCopy(
			`frames ${target.key}, whose section resolves to no matrix table`,
			target.frameTipo,
			sectionTipo,
			sectionId,
		);
	}
	if ((await readMatrixRecord(table, target.sectionTipo, target.sectionId)) === null) {
		throw refuseFrameCopy(
			`frames ${target.key}, which does not exist — a stale pairing left behind when that ` +
				'record was deleted (remove the frame from this record, then duplicate again)',
			target.frameTipo,
			sectionTipo,
			sectionId,
		);
	}
}

/**
 * RE-MINT every dataframe frame target of the copy, or refuse the duplicate
 * (DATA-05 / WC-2026-08-27-duplicate-reminted-dataframe-targets).
 *
 * A dd490 pairing locator is an OWNERSHIP edge, not a reference: the frame's
 * fields live in the record it addresses, and the contract is one target per
 * data item. Portal/thesaurus locators in the same bag are references and stay
 * shared — copying them is correct; copying a pairing is not.
 *
 * Each distinct target is deep-copied through this very writer (recursively, so
 * a frame target carrying frames of its own is re-minted the same way, and its
 * own reference locators stay shared), then the copied locator is re-pointed.
 * `id`, `id_key` and `main_component_tipo` are untouched: the duplicate copies
 * the main component's items verbatim, ids included, so the pairing that made
 * the frame findable is exactly as valid on the copy.
 *
 * NOT transactional, deliberately: this writer is not tx-wrapped (the observer
 * cascade refuses to run inside a transaction), so a failure between two mints
 * can leave a stray unreferenced target copy. That is a leak, and a leak is
 * recoverable; a shared frame target is not.
 */
async function remintDataframeTargets(
	values: Partial<Record<MatrixJsonbColumn, unknown>>,
	sectionTipo: string,
	sourceSectionId: number,
	userId: number,
	now: Date,
	remintChain: ReadonlySet<string>,
): Promise<void> {
	const frames = collectDataframeEntries(values);
	if (frames.length === 0) return;
	// `null` = a frame that names no record address (external remote id, absent):
	// it owns nothing, so it is copied verbatim. A frame that DOES name one and
	// cannot be minted from throws out of here, before anything is copied.
	const addresses = frames.map((frame) => frameTargetAddress(frame, sectionTipo, sourceSectionId));
	// Keyed by TARGET: two main items framing the same record share one frame
	// record in the source and must share exactly one copy in the duplicate —
	// minting per locator would silently split that topology in two.
	const distinct = new Map<string, FrameTarget>();
	for (const target of addresses) if (target !== null) distinct.set(target.key, target);
	if (distinct.size === 0) return;
	const chain = new Set([...remintChain, recordKey(sectionTipo, sourceSectionId)]);
	// THE ACTOR, resolved once for the whole re-mint (cached per user_id). The
	// `userId` parameter IS the identity this duplication is performed as — every
	// audit stamp above is written with it — so it is the identity whose grants
	// decide where rows may be minted.
	const { resolvePrincipal } = await import('../../security/permissions.ts');
	const actor = await resolvePrincipal(userId);
	// Pre-flight EVERY target of THIS record before minting any: a refusal must
	// not leave half of this record's frames copied and the other half about to
	// be shared. It is one level deep — a nested target carrying frames of its
	// own is pre-flighted when the recursion reaches it, so a refusal raised
	// there fires after this level's earlier targets were minted (a stray
	// unreferenced copy: the leak the entry's residual section states).
	for (const target of distinct.values()) {
		await assertFrameTargetDuplicable(target, sectionTipo, sourceSectionId, chain, actor);
	}
	const minted = new Map<string, number>();
	for (const [key, target] of distinct) {
		minted.set(
			key,
			await duplicateSectionRecord(target.sectionTipo, target.sectionId, userId, now, chain),
		);
	}
	for (const [index, frame] of frames.entries()) {
		const target = addresses[index] ?? null;
		if (target === null) continue; // copied verbatim: it addresses no record
		const entry = frame.items[frame.index] as Record<string, unknown>;
		frame.items[frame.index] = { ...entry, section_id: minted.get(target.key) as number };
	}
}

/**
 * Copy the physical media files of every copied media component from the source
 * record to the new one, then refresh each copied item's files_info to reflect
 * the new paths AND persist the refreshed value onto the stored row (PHP
 * section_record::duplicate saves the rebuilt files_info on the target).
 * Best-effort per component (a failure logs and continues, PHP parity) — a
 * data-only duplicate must never break on a missing media file.
 */
async function duplicateRecordMediaFiles(
	values: Partial<Record<MatrixJsonbColumn, unknown>>,
	copied: CopiedComponent[],
	table: string,
	sectionTipo: string,
	sourceSectionId: number,
	newSectionId: number,
): Promise<void> {
	for (const component of copied) {
		if (component.column !== 'media') continue;
		const model = await getModelByTipo(component.tipo);
		if (model === null || !isMediaModel(model)) continue;
		const spec = mediaTypeOf(model);
		if (spec === null) continue;
		try {
			const pathOpts = await resolveMediaPathOptions(component.tipo, sectionTipo);
			// Media items carry a lang key only when the component is translatable;
			// build one source/target identity per distinct item lang (null otherwise).
			const langs = new Set<string | null>();
			for (const item of component.items) langs.add(item.lang ?? null);
			for (const lang of langs) {
				const source: MediaIdentity = {
					componentTipo: component.tipo,
					sectionTipo,
					sectionId: sourceSectionId,
					lang,
				};
				const target: MediaIdentity = { ...source, sectionId: newSectionId };
				duplicateMediaFiles(spec, source, target, { source: pathOpts, target: pathOpts });
			}
			// Refresh files_info on the copied items in the media column value.
			const mediaColumn = values.media as Record<string, unknown[]> | undefined;
			const items = mediaColumn?.[component.tipo];
			if (Array.isArray(items)) {
				for (let i = 0; i < items.length; i++) {
					const item = items[i] as Record<string, unknown>;
					const identity: MediaIdentity = {
						componentTipo: component.tipo,
						sectionTipo,
						sectionId: newSectionId,
						lang: (item.lang as string) ?? null,
					};
					items[i] = refreshStoredFilesInfo(item, spec, identity, pathOpts);
				}
				// Persist the refreshed files_info onto the stored row: per-key jsonb
				// write, deliberately NO Time Machine entry — files_info is a
				// filesystem-derived cache (see files_info_persist.ts). Without this
				// the duplicate's stored media column keeps the SOURCE record's paths.
				if (items.length > 0) {
					await updateMatrixKeyData(
						table,
						sectionTipo,
						newSectionId,
						component.column,
						component.tipo,
						items,
					);
				}
			}
		} catch {
			// PHP logs and continues; a media-copy failure never aborts the duplicate.
		}
	}
}
