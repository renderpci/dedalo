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
 * derivative REGENERATION (we copy existing derivatives, not rebuild them);
 * component_dataframe main pairing.
 */

import { config } from '../../../config/config.ts';
import { isMediaModel, mediaTypeOf } from '../../concepts/media.ts';
import { isConsultationOnlySection } from '../../concepts/section.ts';
import { MATRIX_JSONB_COLUMNS, type MatrixJsonbColumn, readMatrixRecord } from '../../db/matrix.ts';
import { insertMatrixRecordWithCounter, updateMatrixKeyData } from '../../db/matrix_write.ts';
import { recordTimeMachine } from '../../db/time_machine.ts';
import { duplicateMediaFiles } from '../../media/file_ops.ts';
import { refreshStoredFilesInfo } from '../../media/files_info.ts';
import { resolveMediaPathOptions } from '../../media/ontology_path.ts';
import type { MediaIdentity } from '../../media/path.ts';
import {
	getMatrixTableFromTipo,
	getModelByTipo,
	getTranslatableByTipo,
} from '../../ontology/resolver.ts';
import { fireSaveEvent } from '../../section_record/save_event.ts';
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
 */
export async function duplicateSectionRecord(
	sectionTipo: string,
	sourceSectionId: number,
	userId: number,
	now: Date = new Date(),
): Promise<number> {
	// Consultation-only sections are read-only for every caller (engine backstop;
	// the API handler denies earlier with a clean 403). See concepts/section.ts.
	if (isConsultationOnlySection(sectionTipo)) {
		throw new Error(
			`duplicateSectionRecord: section '${sectionTipo}' is consultation-only (read-only)`,
		);
	}
	// PHP refuses duplicating non-positive records even for root (API duplicate →
	// assert_record_in_user_scope → user_can_access_record false for section_id<1);
	// engine backstop mirroring the delete_record.ts guards.
	if (sourceSectionId < 1) {
		throw new Error(
			`duplicateSectionRecord: refusing to duplicate non-positive section_id ${sourceSectionId}`,
		);
	}
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) {
		throw new Error(`duplicateSectionRecord: no matrix table for section '${sectionTipo}'`);
	}
	const source = await readMatrixRecord(table, sectionTipo, sourceSectionId);
	if (source === null) {
		throw new Error(
			`duplicateSectionRecord: source record ${sectionTipo}/${sourceSectionId} not found`,
		);
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
		const sliceLang = translatable ? config.menu.dataLang : 'lg-nolan';
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
				component.items,
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
