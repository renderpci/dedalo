/**
 * Component SAVE — the TS re-expression of dd_core_api::save (type
 * 'component') + component_common::update_data_value/save (write path,
 * spec §6 lifecycle).
 *
 * PHP references: class.dd_core_api.php save (:1304), component_common
 * update_data_value (:4088), save (:1990), tm_record::create (:264).
 *
 * Flow (mirrors PHP):
 *   1. permission gate: component permissions >= 2 (read/write) — enforced by
 *      the CALLER (dispatch) with the request principal;
 *   2. read the component's current item array from the matrix row;
 *   3. apply each changed_data item — actions handled here: update, insert,
 *      remove, set_data, sort_data, sort_by_column, add_new_element
 *      (id-matched replace with numeric-string id normalization, PHP COMP-02;
 *      translatable lang-slice + get_id_from_key id-sync, S1-01);
 *   4. write the FULL updated array back to the component's column (the PHP
 *      save writes whole-column state, not deltas);
 *   5. append the Time Machine audit row with the NEW data snapshot.
 *
 * The RELATION-specific write hooks (sort_data, sort_by_column,
 * add_new_element, relation_search index maintenance, delete_locator) live in
 * src/core/relations/save.ts — this module keeps the generic pipeline
 * (update/insert/remove/set_data, TM audit) and calls into them.
 *
 * DATAFRAME saves (relations rebuild Phase C): when the component is a
 * component_dataframe slot and the request carries source.caller_dataframe,
 * changes apply to the CALLER's frame subset and the write is the
 * sibling-preserving merge (relations/dataframe.ts), with id_key stamping
 * and legacy-key stripping. Item-id counters absorb explicit ids on every
 * save (PHP set_data :1009-1019).
 *
 * POST-SAVE CASCADE (header re-dated 2026-07-07, S2-45): the observer
 * propagation (PHP propagate_to_observers) and the activity log run at the
 * DISPATCH chokepoint after this save returns (api/dispatch.ts save handler)
 * — they are covered, not uncovered; this module deliberately keeps only the
 * data write + TM audit. The dataframe removal cascade (PHP
 * remove_dataframe_data_by_id on item remove) is covered here (S1-05,
 * relations/save.ts removeDataframeDataById). Coverage-state lists live in
 * rewrite/STATUS.md, never in this header.
 */

import { getComponentModel } from '../../components/registry.ts';
import { isConsultationOnlySection } from '../../concepts/section.ts';
import { dbTimestamp } from '../../db/db_timestamp.ts';
import { MATRIX_JSONB_COLUMNS, type MatrixJsonbColumn } from '../../db/matrix.ts';
import { absorbComponentItemIds, allocateComponentItemId } from '../../db/matrix_write.ts';
import { sql, withTransaction } from '../../db/postgres.ts';
import { recordTimeMachine } from '../../db/time_machine.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
	getTranslatableByTipo,
} from '../../ontology/resolver.ts';
import {
	type SortByColumnChange,
	type SortDataChange,
	applyAddNewElement,
	applySortByColumn,
	applySortData,
	maintainRelationSearchIndex,
	removeDataframeDataById,
} from '../../relations/save.ts';
import { persistModifiedStamp, persistRecordKeys } from '../../section_record/index.ts';

/** One change from the client (PHP changed_data item). */
export interface ChangedDataItem {
	action: string;
	/** Target item id ('update'); may arrive as a numeric string. */
	id?: number | string | null;
	/** The new item value: {id, value, lang} for literals, a locator for relations. */
	value: unknown;
	key?: number | null;
}

export interface SaveRequest {
	componentTipo: string;
	sectionTipo: string;
	sectionId: number;
	lang: string;
	changedData: ChangedDataItem[];
	userId: number;
	/**
	 * Dataframe pairing context (PHP rqo source.caller_dataframe): required
	 * when componentTipo is a component_dataframe slot — the save then applies
	 * changes to the CALLER's frame subset only and merges siblings back
	 * (relations/dataframe.ts mergeCallerEntries).
	 */
	callerDataframe?: { main_component_tipo?: string; id_key?: number | string } | null;
	/**
	 * BULK import/propagation context (PHP component_common::set_bulk_process_id +
	 * tm_record::$save_tm — both are globals there, request state here).
	 *
	 * `bulkProcessId` stamps every TM row this save writes with the dd800 run that
	 * caused it, which is what makes a bulk import revertable as ONE operation.
	 * `saveTm: false` suppresses the TM row entirely (the import UI's "save time
	 * machine history" checkbox, unchecked → no per-row history for a 10k-row run).
	 * Absent → normal interactive behavior: audited, unattributed.
	 */
	bulkProcessId?: number | null;
	saveTm?: boolean;
	/**
	 * Suppress this record's dd197/dd201 modified-audit stamp for THIS save (PHP
	 * section::$save_modified = false).
	 *
	 * The importer sets it when the CSV itself carries modified_by_user (dd197) /
	 * modified_date (dd201): stamping "now, by the importing user" would overwrite
	 * the very values being imported, one column later in the same row. Any caller
	 * that OWNS the modified metadata it is writing may use it; nobody else should
	 * — an unstamped interactive save is an unauditable one.
	 */
	skipModifiedStamp?: boolean;
}

export interface SaveResult {
	ok: boolean;
	message: string;
	/** The component's full item array after the save. */
	data?: unknown[];
}

/** COMP-02: numeric-string ids normalize to int, else strict matching
 * appends duplicates instead of updating. */
function normalizeItemId(id: unknown): unknown {
	return typeof id === 'string' && /^\d+$/.test(id) ? Number.parseInt(id, 10) : id;
}

/**
 * PHP component_common::get_id_from_key (:1432-1486) — resolve the SHARED item
 * id for an array position from the sibling languages. Groups the full stored
 * array by lang (skipping `skipLangs`, i.e. the language being written), takes
 * the entry at position `key` in each group, and returns the first valid
 * positive numeric id found. Null when nothing resolves (a fresh id is minted).
 */
function getIdFromKey(items: unknown[], key: number, skipLangs: readonly string[]): number | null {
	const grouped = new Map<string, { id?: unknown }[]>();
	for (const item of items) {
		if (item === null || typeof item !== 'object') continue;
		const itemLang = (item as { lang?: string }).lang ?? null;
		if (itemLang === null || skipLangs.includes(itemLang)) continue;
		const group = grouped.get(itemLang);
		if (group === undefined) {
			grouped.set(itemLang, [item as { id?: unknown }]);
		} else {
			group.push(item as { id?: unknown });
		}
	}
	for (const entries of grouped.values()) {
		const candidate = entries[key];
		if (candidate === undefined) continue;
		const id = candidate.id ?? null;
		const numeric = typeof id === 'number' ? id : typeof id === 'string' ? Number(id) : Number.NaN;
		if (Number.isFinite(numeric) && Math.trunc(numeric) > 0) {
			return Math.trunc(numeric);
		}
	}
	return null;
}

/**
 * Apply one 'update' change to the item array (PHP update_data_value 'update',
 * class.component_common.php:4152-4223): replace the FIRST item whose id
 * matches (PHP breaks after the first hit — translated items share ids by
 * design, so replacing every match destroys the sibling languages);
 * id-less/no-match appends (PHP fallback).
 *
 * `sliceLang` non-null = the PHP lang-slice semantics for translation-
 * supporting literal components (supports_translation && !is_relation):
 * the change applies to the CURRENT-LANG slice only, an id-less change with a
 * `key` resolves the shared id from the sibling languages (get_id_from_key),
 * and the write merges [other-lang items..., new slice...] — set_data_lang's
 * persisted shape (:1052-1128), with the slice lang re-stamped on a CLONE of
 * every slice item, so the same object reference is never stored at two array
 * positions.
 */
function applyUpdate(
	items: unknown[],
	change: ChangedDataItem,
	sliceLang: string | null,
): unknown[] {
	let targetId: unknown = normalizeItemId(change.id ?? null);

	// PHP :4190-4193 (see also :4176-4178): the replacement value inherits the
	// matched/resolved id when it arrives without one. The client toggle sends
	// the bare datalist value (no id); dropping the id here would leave an
	// id-less item, so the NEXT update sends id:null and appends instead of
	// replacing — the array grows on every save (the component_publication
	// value-doubling bug).
	const inheritId = (id: unknown): void => {
		const value = change.value;
		if (
			value !== null &&
			typeof value === 'object' &&
			((value as { id?: unknown }).id === undefined ||
				(value as { id?: unknown }).id === null ||
				(value as { id?: unknown }).id === '')
		) {
			(value as { id?: unknown }).id = id;
		}
	};

	if (sliceLang === null) {
		// Non-sliced (relations & non-translatable classes): positional replace
		// on the full array, first-match stop.
		if (targetId === null) {
			return [...items, change.value];
		}
		const updated = [...items];
		for (let index = 0; index < updated.length; index++) {
			const itemId = (updated[index] as { id?: number | string } | null)?.id;
			if (normalizeItemId(itemId) === targetId) {
				inheritId(itemId);
				updated[index] = change.value;
				return updated;
			}
		}
		return [...items, change.value];
	}

	// Lang-sliced path. get_data_lang (:1297-1332): the current-lang slice —
	// only objects carrying the slice lang. set_data_lang (:1093-1118) DROPS
	// non-objects and lang-orphan items from the merged result (PHP logs and
	// skips them), so they are not kept aside either.
	const slice: Record<string, unknown>[] = [];
	const otherLangs: unknown[] = [];
	for (const item of items) {
		if (item === null || typeof item !== 'object') continue;
		const itemLang = (item as { lang?: string }).lang;
		if (itemLang === sliceLang) {
			slice.push(item as Record<string, unknown>);
		} else if (typeof itemLang === 'string' && itemLang !== '') {
			otherLangs.push(item);
		}
	}

	// PHP :4169-4180: id-less update with a key position resolves the shared id
	// from the sibling languages, so a first translation reuses the existing id
	// instead of minting a fresh one.
	if (targetId === null && change.key !== undefined && change.key !== null) {
		const resolved = getIdFromKey(items, Number(change.key), [sliceLang]);
		if (resolved !== null) {
			targetId = resolved;
			inheritId(resolved);
		}
	}

	let newSlice: unknown[];
	if (targetId === null) {
		newSlice = [...slice, change.value];
	} else {
		let matched = false;
		newSlice = slice.map((item) => {
			if (!matched && normalizeItemId(item.id) === targetId) {
				matched = true;
				inheritId(item.id);
				return change.value;
			}
			return item;
		});
		if (!matched) {
			newSlice.push(change.value);
		}
	}

	// set_data_lang: every slice item is persisted as a CLONE stamped with the
	// slice lang (PHP clones to avoid side effects and force-corrects a
	// mismatched/missing lang), appended after the untouched other-lang items.
	const stamped = newSlice.map((item) =>
		item !== null && typeof item === 'object'
			? { ...(item as Record<string, unknown>), lang: sliceLang }
			: item,
	);
	return [...otherLangs, ...stamped];
}

/**
 * Save component data changes. AUTHORIZATION is the caller's responsibility —
 * dispatch enforces both the permission level (>= 2 on the component) AND the
 * per-record projects scope (isRecordInScope) with the request principal before
 * calling here. This function performs no authorization of its own.
 *
 * TRANSACTIONAL (S1-02 / DEC-01): the whole change application runs in ONE
 * transaction, so the FOR UPDATE row lock holds to COMMIT and the data write +
 * TM audit row are atomic — a deliberate break with the PHP oracle's
 * last-writer-wins window (DECISIONS.md DEC-01: recommendation (b)). A save
 * that returns ok:false COMMITS whatever cascade steps already ran (matching
 * the PHP no-tx posture for validation failures); a THROWN error rolls back.
 */
export async function saveComponentData(request: SaveRequest): Promise<SaveResult> {
	// Consultation-only sections (Activity dd542, Time Machine dd15, …) are
	// read-only for EVERY save door — the client API save handler already denies
	// with a 403 (PHP dd_core_api:1330 "Illegal save to activity"); this is the
	// belt for the MCP tools, the agent change-plan, and any future caller that
	// reaches the write engine directly. Guarded on a real (finite) record id so
	// the search_* preset path (section_id → NaN here) is left to its own flow.
	if (isConsultationOnlySection(request.sectionTipo) && Number.isFinite(request.sectionId)) {
		return {
			ok: false,
			message: `Illegal save to read-only section '${request.sectionTipo}'`,
			data: [],
		};
	}
	// component_alias (WC-020): a save addressed to an ALIAS writes the
	// TARGET's data — the column key, item-id counters, TM audit,
	// relation_search index and the row serialization all derive from the data
	// tipo, so alias-door and direct-door edits share ONE identity (stored
	// data never contains the alias tipo; item ids stay unique across doors
	// and engines). The wire keeps the alias (the dispatch handler logs and
	// echoes the rqo's tipo).
	const { resolveDataTipo } = await import('../../ontology/alias.ts');
	const dataTipo = await resolveDataTipo(request.componentTipo);
	const effectiveRequest =
		dataTipo === request.componentTipo ? request : { ...request, componentTipo: dataTipo };
	const result = await withTransaction(() => applySaveComponentData(effectiveRequest));

	// Post-commit side effect — deliberately OUTSIDE the transaction (S1-14
	// posture: clearing a shared cache mid-tx invites repopulation with
	// uncommitted or about-to-be-stale state). Security-cache invalidation
	// (SEC): if this write touched a profile's grants or a user's
	// profile/projects assignment, drop the affected per-user caches so the
	// change takes effect on the next request rather than after a restart.
	// No-op for ordinary content writes.
	if (result.ok) {
		const { invalidatePermissionsForWrite } = await import('../../security/permissions.ts');
		// The DATA tipo (alias hop applied) — grant/profile caches key on the
		// real component the write landed on.
		invalidatePermissionsForWrite(
			effectiveRequest.sectionTipo,
			effectiveRequest.componentTipo,
			Number(effectiveRequest.sectionId),
		);
	}
	return result;
}

/** The transactional body of saveComponentData (see the wrapper above). */
async function applySaveComponentData(request: SaveRequest): Promise<SaveResult> {
	const { componentTipo, sectionTipo, sectionId, lang, userId } = request;
	const callerDataframe = request.callerDataframe ?? null;

	const model = await getModelByTipo(componentTipo);
	if (model === null) {
		return { ok: false, message: `unknown component tipo '${componentTipo}'` };
	}

	// SEC — component_password is an ordinary string component to the write engine,
	// so an unhashed value would be stored VERBATIM: the client's plaintext password
	// straight into matrix_users.string.dd133 (and it would then fail every login,
	// since auth.ts accepts only Argon2id). PHP hashed on the way in
	// (component_password::Save → hash_password); this is that gate. It sits here, at
	// the write engine, precisely so EVERY door funnels through it — the client API,
	// the MCP tools, the agent change-plan and import alike.
	const changedData =
		model === 'component_password'
			? await (await import('../../security/password_hash.ts')).hashPasswordChanges(
					request.changedData,
				)
			: request.changedData;
	const mappedColumn = getColumnNameByModel(model);
	if (mappedColumn === null || !MATRIX_JSONB_COLUMNS.includes(mappedColumn as MatrixJsonbColumn)) {
		return { ok: false, message: `no matrix column for model '${model}'` };
	}
	const column = mappedColumn as MatrixJsonbColumn;
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) {
		return { ok: false, message: `no matrix table for section '${sectionTipo}'` };
	}

	const translatable = await getTranslatableByTipo(componentTipo);

	// PHP lang-slice gate — supports_translation && !is_relation (PHP
	// update_data_value :4110-4126/:4169-4180 conditions): only the literal
	// translation-supporting CLASSES (registry classSupportsTranslation, PHP
	// component_string_common subclasses + iri) slice their data by language;
	// relation/locator classes never do. The ontology `translatable` flag alone
	// would mis-slice: an ontology-non-translatable input_text still slices, on
	// the lg-nolan lang PHP normalizes to at instantiation (__construct :677;
	// read-path twin: resolve/component_data.ts effective-lang rule).
	const descriptor = getComponentModel(model);
	const langSliced =
		descriptor?.classSupportsTranslation === true && descriptor.resolveData === undefined;
	const effectiveLang = translatable || model === 'component_iri' ? lang : 'lg-nolan';

	// SERIALIZED read-modify-write (S1-02, DEC-01: deliberately STRONGER than
	// the PHP oracle, whose save flow has no lock/tx and loses one of two
	// concurrent edits): the whole change application below runs inside ONE
	// transaction (the ALS proxy in db/postgres.ts routes every inner helper
	// onto the tx connection), so this row lock HOLDS until COMMIT — concurrent
	// saves on the same record queue instead of clobbering each other's items,
	// and the data write + Time Machine audit row land atomically. No wire
	// change; nothing in the response shape depends on this.
	let items: unknown[] = [];
	const lockRows = (await sql.unsafe(
		`SELECT "${column}"->'${componentTipo}' AS items FROM "${table}"
		 WHERE section_tipo = $1 AND section_id = $2 FOR UPDATE`,
		[sectionTipo, sectionId],
	)) as { items: unknown[] | unknown | null }[];
	if (lockRows.length === 0) {
		// PHP set_dato upserts: saving component data to a section_id whose matrix
		// row does not exist yet CREATES the record (class.section_record::save_key_data
		// → matrix INSERT), rather than erroring. Mirror that so an edit-mode save on a
		// not-yet-materialized record works (e.g. the portal suite's test3/2 fixture,
		// which the test clears then links into). The section + write permission (level
		// >= 2) were already validated by the dispatch save handler, so the create is
		// authorized. The create is CONFLICT-TOLERANT and the row is RE-LOCKED after it
		// (S1-02 Wave-2 correction: the upsert branch would otherwise lock nothing when
		// a concurrent save materializes the row first).
		const { createSectionRecord } = await import('./create_record.ts');
		await createSectionRecord(sectionTipo, userId, new Date(), Number(sectionId), {
			conflictTolerant: true,
		});
		const relockRows = (await sql.unsafe(
			`SELECT "${column}"->'${componentTipo}' AS items FROM "${table}"
			 WHERE section_tipo = $1 AND section_id = $2 FOR UPDATE`,
			[sectionTipo, sectionId],
		)) as { items: unknown[] | unknown | null }[];
		const relocked = relockRows[0]?.items;
		items = Array.isArray(relocked) ? relocked : relocked == null ? [] : [relocked];
	} else {
		const rawItems = lockRows[0]?.items;
		items = Array.isArray(rawItems) ? rawItems : rawItems == null ? [] : [rawItems];
	}

	// DATAFRAME saves (PHP component_dataframe get_data/set_data): the change
	// loop operates on the CALLER's frame subset; the full slot is kept for
	// the sibling-preserving merge at write time.
	const isDataframeSave = model === 'component_dataframe' && callerDataframe !== null;
	const fullSlotItems = items;
	if (isDataframeSave) {
		const { filterCallerEntries } = await import('../../relations/dataframe.ts');
		items = filterCallerEntries(items as Record<string, unknown>[], callerDataframe, componentTipo);
	}

	// Absorb explicit item ids into the meta counter BEFORE any allocation
	// (PHP set_data :1009-1019 runs the raise on every write, so a counter can
	// never lag behind seeded/imported ids and hand out a duplicate).
	await absorbComponentItemIds(
		table,
		sectionTipo,
		sectionId,
		componentTipo,
		isDataframeSave ? fullSlotItems : items,
	);

	// Split changes: updates mutate the read array; inserts are applied as
	// ATOMIC single-statement appends (no read-modify-write), so concurrent
	// inserts can never drop each other's items.
	const atomicInserts: unknown[] = [];
	let hasRemovals = false;
	let hasReorders = false;
	let createdSectionId: number | null = null;
	for (const change of changedData) {
		if (
			change.action !== 'update' &&
			change.action !== 'insert' &&
			change.action !== 'remove' &&
			change.action !== 'set_data' &&
			change.action !== 'sort_data' &&
			change.action !== 'sort_by_column' &&
			change.action !== 'add_new_element'
		) {
			throw new Error(
				`saveComponentData: action '${change.action}' not implemented yet (Phase 5 uncovered scope)`,
			);
		}

		if (change.action === 'sort_data') {
			// PHP update_data_value 'sort_data': move one locator from its
			// absolute position (source_key = paginated_key) to target_key.
			const sorted = applySortData(items, change as unknown as SortDataChange);
			if (sorted === null) {
				return { ok: false, message: 'sort_data failed (key/locator mismatch)' };
			}
			items = sorted;
			hasReorders = true;
			continue;
		}
		if (change.action === 'sort_by_column') {
			const sorted = await applySortByColumn(
				items,
				change as unknown as SortByColumnChange,
				componentTipo,
				sectionTipo,
			);
			if (sorted === null) {
				return { ok: false, message: 'sort_by_column failed (gate/column/direction)' };
			}
			items = sorted;
			hasReorders = true;
			continue;
		}
		if (change.action === 'add_new_element') {
			// PHP component_relation_common::add_new_element: create a target
			// record (inheriting the host's project filter) and link it.
			const outcome = await applyAddNewElement(
				items,
				String(change.value ?? ''),
				componentTipo,
				sectionTipo,
				sectionId,
			);
			if (outcome === null) {
				return { ok: false, message: 'add_new_element failed' };
			}
			items = outcome.items;
			createdSectionId = outcome.sectionId;
			hasReorders = true; // full-array persist
			continue;
		}

		if (change.action === 'set_data') {
			// PHP: bulk-replace the data array, no key checks — but NOT across
			// languages: update_data_value 'set_data' (:4380) routes through
			// set_data_lang, so for the translation-supporting literal classes the
			// replace is LANG-SLICED (see below). A raw full replace here was the
			// import multi-language bug: the CSV executor saves one language at a
			// time, and each save wiped the previous language's items.
			const rawItems = Array.isArray(change.value) ? (change.value as unknown[]) : [];
			// RELATION elements are NORMALIZED here, not stored raw. PHP's bulk-replace
			// is not a raw assignment either: component_common::set_data (:997) runs
			// validate_data_element over EVERY element, which is the same normalizer the
			// insert path uses — `type` filled, `from_component_tipo` FORCED, section_id
			// stringified, paginated_key stripped, duplicates dropped.
			// Storing the client's raw locator instead persisted a BARE
			// {id, section_tipo, section_id} with no from_component_tipo, and every jsonb
			// @> containment that names it then missed the record — e.g. the hierarchy4
			// "active" filter behind a portal's target_sections (a saved-active hierarchy
			// resolved to zero targets: "Invalid target section tipo (empty)").
			// Dedup scope is the NEW array only: PHP resets its locator lookup map on the
			// first element of the call (:1150-53), so an element is compared against the
			// ones already accepted in THIS set_data, never against the stored data.
			if (column === 'relation' && !isDataframeSave) {
				const { validateRelationInsert } = await import('../../relations/save.ts');
				const validatedItems: unknown[] = [];
				for (const element of rawItems) {
					if (element === null || typeof element !== 'object') {
						continue; // PHP wraps a scalar into {value}, which then fails the locator law
					}
					const safeElement = await validateRelationInsert(element as Record<string, unknown>, {
						componentTipo,
						model,
						hostSectionTipo: sectionTipo,
						hostSectionId: sectionId,
						translatable,
						lang: effectiveLang,
						existingItems: validatedItems,
					});
					if (safeElement !== null) validatedItems.push(safeElement);
				}
				items = validatedItems;
			} else if (langSliced) {
				// PHP set_data_lang (:1052-1128): replace ONLY the effective-lang
				// slice. Other-lang stored items are kept untouched; stored items
				// WITHOUT a lang are dropped (PHP logs and skips lang orphans); every
				// new item is persisted as a CLONE stamped with the slice lang
				// (non-objects are skipped — PHP set_data_lang accepts only objects).
				const otherLangs = items.filter((item) => {
					if (item === null || typeof item !== 'object') return false;
					const itemLang = (item as { lang?: string }).lang;
					return typeof itemLang === 'string' && itemLang !== '' && itemLang !== effectiveLang;
				});
				const stamped = rawItems
					.filter(
						(item): item is Record<string, unknown> => item !== null && typeof item === 'object',
					)
					.map((item) => ({ ...item, lang: effectiveLang }));
				items = [...otherLangs, ...stamped];
			} else {
				items = rawItems;
			}
			hasRemovals = true; // force the full-array write path
			continue;
		}

		if (change.action === 'remove') {
			hasRemovals = true;
			let targetId = change.id ?? null;
			if (typeof targetId === 'string' && /^\d+$/.test(targetId)) {
				targetId = Number.parseInt(targetId, 10);
			}
			if (targetId === null) {
				// PHP: id null = clear ALL entries in all languages.
				items = [];
				continue;
			}
			// Remove EVERY item with the id — translated items share ids, so this
			// is the PHP cross-language removal for translatable literals.
			const before = items.length;
			items = items.filter((item) => {
				const itemId = (item as { id?: number | string } | null)?.id;
				const normalized =
					typeof itemId === 'string' && /^\d+$/.test(itemId) ? Number.parseInt(itemId, 10) : itemId;
				return normalized !== targetId;
			});
			if (items.length === before) {
				// PHP fails the save when the id does not exist.
				return { ok: false, message: `remove: no item with id ${targetId}` };
			}
			// DATAFRAME cascade (PHP update_data_value 'remove' :4325-4352,
			// S1-05): the removed item's paired frame entries are stripped from
			// every dataframe slot (remove_dataframe_data_by_id). For
			// translatable-literal mains PHP guards on the removed id no longer
			// existing in any OTHER language (frames are lang-agnostic); the TS
			// remove above strips ALL languages at once, so the unconditional
			// cascade here is exactly that occurrences<=1 case. The id===null
			// clear-all branch does NOT cascade — PHP doesn't either (:4235-4243).
			await removeDataframeDataById(
				table,
				sectionTipo,
				sectionId,
				componentTipo,
				Number(targetId),
				userId,
			);
			continue;
		}
		// Lang stamp. Sliced components force the EFFECTIVE lang onto the changed
		// value (PHP set_data_lang clone-stamps every slice item, :1088-1090,
		// correcting a mismatched/missing lang); other translatable components
		// only fill a missing lang (PHP set_data lang-orphan guard :983-988).
		if (change.value !== null && typeof change.value === 'object') {
			if (langSliced) {
				(change.value as { lang?: string }).lang = effectiveLang;
			} else if (translatable && (change.value as { lang?: string }).lang === undefined) {
				(change.value as { lang?: string }).lang = lang;
			}
		}

		if (change.action === 'insert') {
			let value = change.value;
			if (value === null || typeof value !== 'object') {
				throw new Error('saveComponentData: insert value must be an object item');
			}
			// Relation-family insert validation (PHP validate_data_element,
			// component_relation_common.php:1058 — the service_autocomplete
			// link_record flow): type fill, forced from_component_tipo,
			// autoreference guard, paginated_key strip, string section_id, and
			// duplicate rejection (a dup is DROPPED so pagination.total stays
			// unchanged — the client's server-authoritative duplicate check).
			// Dataframe saves keep their own merge/id_key pipeline.
			if (column === 'relation' && !isDataframeSave) {
				const { validateRelationInsert } = await import('../../relations/save.ts');
				const validated = await validateRelationInsert(value as Record<string, unknown>, {
					componentTipo,
					model,
					hostSectionTipo: sectionTipo,
					hostSectionId: sectionId,
					translatable,
					lang: effectiveLang,
					existingItems: items,
				});
				if (validated === null) continue; // ignored insert (PHP returns false)
				value = validated;
			}
			// PHP :4110-4126: translatable-literal insert with a key position
			// resolves the SHARED item id from the sibling languages at the same
			// position, so a first translation reuses the existing id instead of
			// minting a fresh one (which would orphan it from its siblings).
			if (langSliced && change.key !== undefined && change.key !== null) {
				const resolved = getIdFromKey(items, Number(change.key), [effectiveLang]);
				if (resolved !== null) {
					(value as { id?: unknown }).id = resolved;
				}
			}
			// component_relation_children is a READ-ONLY projection of the target
			// records' component_relation_parent (PHP class.component_relation_children
			// get_data :113). A link whose target record does not exist cannot create
			// the backing parent relation, so PHP's save fails and the client's
			// link_record sees an unchanged pagination.total → returns false. Reject
			// the insert here to honor that contract (the full children→parent write
			// redirect stays uncovered; this only gates the non-existent-target case).
			if (model === 'component_relation_children') {
				const targetSectionTipo = (value as { section_tipo?: unknown }).section_tipo;
				const targetSectionId = (value as { section_id?: unknown }).section_id;
				if (typeof targetSectionTipo === 'string') {
					const targetTable = await getMatrixTableFromTipo(targetSectionTipo);
					if (targetTable !== null) {
						const { readMatrixRecord } = await import('../../db/matrix.ts');
						const targetRecord = await readMatrixRecord(
							targetTable,
							targetSectionTipo,
							Number(targetSectionId),
						);
						if (targetRecord === null) continue; // non-existent target — drop the link
					}
				}
			}
			if ((value as { id?: unknown }).id === undefined || (value as { id?: unknown }).id === null) {
				(value as { id: number }).id = await allocateComponentItemId(
					table,
					sectionTipo,
					sectionId,
					componentTipo,
				);
			}
			atomicInserts.push(value);
			items = [...items, value]; // reflected in the returned data + TM snapshot
			continue;
		}

		// UPDATE of a relation element — normalized exactly like an insert.
		// In PHP there is no such thing as an unnormalized write: every action ends in
		// component_common::set_data, which runs validate_data_element over the array
		// (:997). TS splits the actions into branches, so each branch that carries a
		// VALUE must normalize it itself, or the client's raw locator is persisted.
		// This is the branch a component_radio_button uses (build_changed_data_item
		// emits action:'update'), and it is how a bare, from_component_tipo-less
		// hierarchy4 "active" locator reached the DB — invisible to the jsonb @>
		// containment behind a portal's target_sections.
		// The dup guard compares against the OTHER items only: an update re-writing an
		// item must not be rejected as a duplicate of ITSELF (PHP rebuilds its lookup
		// map per set_data call, so the element under validation is never in it yet).
		let effectiveChange = change;
		if (
			column === 'relation' &&
			!isDataframeSave &&
			change.value !== null &&
			typeof change.value === 'object'
		) {
			const { validateRelationInsert } = await import('../../relations/save.ts');
			const targetId = (change.value as { id?: unknown }).id ?? change.id ?? null;
			const otherItems = (items as unknown[]).filter((item) => {
				const itemId = (item as { id?: unknown } | null)?.id;
				return targetId === null || itemId === undefined || String(itemId) !== String(targetId);
			});
			const validated = await validateRelationInsert(change.value as Record<string, unknown>, {
				componentTipo,
				model,
				hostSectionTipo: sectionTipo,
				hostSectionId: sectionId,
				translatable,
				lang: effectiveLang,
				existingItems: otherItems,
			});
			// PHP drops the element when validate_data_element returns false; we leave
			// the stored item untouched rather than persist a bad-formed locator.
			if (validated === null) continue;
			effectiveChange = { ...change, value: validated };
		}
		items = applyUpdate(items, effectiveChange, langSliced ? effectiveLang : null);
	}

	const hasUpdates =
		changedData.some((change) => change.action === 'update') || hasRemovals || hasReorders;
	// The write chokepoint (section_record/record_write.ts) merges the record's
	// modified-audit stamps (dd197/dd201) into the SAME update as the value —
	// the PHP save_component_data contract — and prunes empty columns.
	const writeTarget = { table, sectionTipo, sectionId };
	// The modified stamp rides in the SAME update as the value (the PHP
	// save_component_data contract) — unless the caller owns that metadata itself
	// (the CSV import writing dd197/dd201 from the file); see skipModifiedStamp.
	const auditStamp: { userId: number } | false =
		request.skipModifiedStamp === true ? false : { userId };

	// PHP set_data invariant (class.component_common.php:988-990): EVERY persisted
	// data item carries an id — any id-less object is stamped with a fresh
	// per-component counter id (set_data_item_counter → allocate_component_ids)
	// before the write. This is the general safety net behind the doubling fix:
	// a genuinely new append (id:null 'update', or the first toggle on an empty
	// record) gets a stable id here, so subsequent updates target it in place.
	// The dataframe path is exempt (it stamps id_key via its own merge); the
	// atomic-insert path already allocated its ids.
	if (!isDataframeSave && (hasUpdates || atomicInserts.length > 0)) {
		for (const item of items) {
			if (
				item !== null &&
				typeof item === 'object' &&
				((item as { id?: unknown }).id === undefined ||
					(item as { id?: unknown }).id === null ||
					(item as { id?: unknown }).id === '')
			) {
				(item as { id: number }).id = await allocateComponentItemId(
					table,
					sectionTipo,
					sectionId,
					componentTipo,
				);
			}
		}
	}

	if (isDataframeSave) {
		// DATAFRAME write (PHP component_dataframe::set_data :187): merge the
		// caller's changed subset back over the untouched sibling frames —
		// additions get the caller's id_key stamped (INT) and legacy pairing
		// keys stripped; an empty merge normalises to null (key delete). The
		// atomic-insert fast path is bypassed: the merge IS the write.
		const { mergeCallerEntries } = await import('../../relations/dataframe.ts');
		const merged = mergeCallerEntries(
			fullSlotItems as Record<string, unknown>[],
			items as Record<string, unknown>[],
			callerDataframe,
			componentTipo,
		);
		await persistRecordKeys(
			writeTarget,
			[{ column, key: componentTipo, value: merged }],
			auditStamp,
		);
		items = merged ?? [];
	} else if (hasUpdates) {
		// Per-KEY write (PHP update_by_key / jsonb_set): only this component's
		// tipo key changes — sibling components untouched.
		await persistRecordKeys(
			writeTarget,
			[{ column, key: componentTipo, value: items }],
			auditStamp,
		);
	} else if (atomicInserts.length > 0) {
		// Pure inserts: atomic concatenation — concurrent inserts both survive.
		// (Deliberate divergence from the read-modify-write chokepoint shape;
		// the modified stamps are refreshed right after, like every PHP save.)
		const { encodeForJsonb } = await import('../../db/json_codec.ts');
		await sql.unsafe(
			`UPDATE "${table}"
			 SET "${column}" = jsonb_set(
				COALESCE("${column}", '{}'::jsonb),
				'{${componentTipo}}',
				COALESCE("${column}"->'${componentTipo}', '[]'::jsonb) || $3::text::jsonb
			 )
			 WHERE section_tipo = $1 AND section_id = $2`,
			[sectionTipo, sectionId, encodeForJsonb(atomicInserts)],
		);
		if (auditStamp !== false) await persistModifiedStamp(writeTarget, auditStamp);
	}

	// Post-write absorb (PHP raises the counter at EVERY set_data): explicit
	// ids in the just-written array are locked out of future allocations.
	await absorbComponentItemIds(table, sectionTipo, sectionId, componentTipo, items);

	// relation_search ancestor index (PHP save_component_dato: for LEGACY
	// component_autocomplete_hi, the save ALSO writes relation_search[tipo] =
	// the recursive PARENT locators of every stored target — the hierarchical
	// search index ('search Spain matches Madrid'). Empty data clears the key.
	{
		const { getNode } = await import('../../ontology/resolver.ts');
		const storedModel = (await getNode(componentTipo))?.model;
		if (storedModel === 'component_autocomplete_hi') {
			await maintainRelationSearchIndex(table, sectionTipo, sectionId, componentTipo, items);
		}
	}

	// Time Machine audit with the NEW data snapshot (PHP save :2097-2135).
	// PHP stores get_time_machine_data_to_save() = get_data_lang(): the
	// EFFECTIVE-lang slice for the translation-supporting literal classes
	// (:1297-1332 no-slices when supports_translation is false), the full array
	// for everything else — stamped with the component's normalized lang.
	const tmSnapshot = langSliced
		? items.filter(
				(item) =>
					item !== null &&
					typeof item === 'object' &&
					(item as { lang?: string }).lang === effectiveLang,
			)
		: items;
	// saveTm:false suppresses the audit row (the bulk-import opt-out — PHP
	// tm_record::$save_tm); bulkProcessId attributes it to the dd800 run.
	if (request.saveTm !== false) {
		await recordTimeMachine(
			{
				sectionTipo,
				sectionId,
				componentTipo,
				lang: langSliced ? effectiveLang : lang,
				userId,
				data: tmSnapshot,
				bulkProcessId: request.bulkProcessId ?? null,
			},
			dbTimestamp(),
		);
	}

	// RAG re-index event (S2-13): PHP save() enqueues the record for re-indexing
	// on every component save (class.section_record.php:988) — the TS per-key
	// save path fired NO event before this, so edited content stayed stale in
	// the vector store. The enqueue joins this transaction (the queue writes
	// through the ambient sql handle), so a rolled-back save never leaves a
	// marker; hook failures are logged and swallowed (best-effort posture), and
	// with RAG disabled the hook is null — zero cost.
	if (isDataframeSave || hasUpdates || atomicInserts.length > 0) {
		const { fireRagRecordEvent } = await import('../../section_record/save_event.ts');
		await fireRagRecordEvent({ kind: 'index', sectionTipo, sectionId: Number(sectionId) });
	}

	const result: SaveResult = { ok: true, message: 'ok', data: items };
	if (createdSectionId !== null) {
		(result as SaveResult & { created_section_id?: number }).created_section_id = createdSectionId;
	}
	return result;
}
