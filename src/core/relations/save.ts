/**
 * RELATION SAVE HOOKS (RELATIONS_SPEC.md §2/§8.7) — the write-side
 * particularities of the relation family, consumed by the generic component
 * save pipeline (section/record/save_component.ts):
 *
 * - sort_data: absolute-position locator move, validated against the stored
 *   item (PHP component_common::update_data_value 'sort_data');
 * - sort_by_column: property-gated reorder of the stored locators by a
 *   target-section column search (PHP
 *   component_relation_common::sort_data_by_column, :3310);
 * - add_new_element: create a target record inheriting the HOST's projects
 *   filter, then append the link locator (PHP
 *   component_relation_common::add_new_element, :3770 — the §8.7
 *   filter-inheritance security carry-over);
 * - relation_search ancestor index maintenance for the legacy
 *   component_autocomplete_hi model (hierarchical 'search Spain matches
 *   Madrid' index);
 * - delete_locator: the dd_component_portal_api partial-locator removal.
 *
 * Phase A: verbatim strangler extraction — semantics unchanged. Phase C adds
 * dataframe saves (id_key stamping + test_equal_properties dedup); Phase D
 * adds the children write-redirect-to-parent.
 *
 * The sort matcher runs the LOCATOR LAW (S2-03/S2-04 per DEC-21):
 * locator::compare_locators over PHP's exact 4-property list
 * (class.component_common.php:4424-4428) — section_id loose-numeric, every
 * other property strict AND present-on-both — so TS rejects exactly the
 * stale-drag/type-drift reorders the PHP oracle rejects. The moved item
 * additionally PRESERVES stored properties the client's value omits (beyond
 * PHP, which persists the bare client value after the same validation): the
 * 4-property gate means those extras can only be non-identity fields, and
 * keeping them protects id_key dataframe pairing + inverse-ref cleanup.
 * delete_locator was ALIGNED to compareLocators earlier (S1-06): the loose
 * matcher over-deleted (stored '7' vs sent 7) against the oracle.
 */

import { getComponentModel } from '../components/registry.ts';
import { compareLocators, isLocatorInArray } from '../concepts/locator.ts';
import {
	type DataframePairing,
	dataframeEntriesEqual,
	dataframeEntryMatches,
	isDataframeEntry,
	normalizeDataframeEntry,
} from '../concepts/subdatum.ts';
import { dbTimestamp } from '../db/db_timestamp.ts';
import { encodeForJsonb } from '../db/json_codec.ts';
import { sql, withTransaction } from '../db/postgres.ts';
import { recordTimeMachine } from '../db/time_machine.ts';

export interface SortDataChange {
	value: Record<string, unknown> | null;
	source_key: number;
	target_key: number;
}

/**
 * PHP update_data_value 'sort_data': validate the client's locator against
 * the stored item at source_key (locator law — see the module header), then
 * rebuild the array — the moved locator lands BEFORE the target when moving
 * up, AFTER it when moving down. Returns null on any validation failure (PHP
 * returns false).
 */
export function applySortData(items: unknown[], change: SortDataChange): unknown[] | null {
	const value = change.value === null ? null : { ...change.value };
	// biome-ignore lint/performance/noDelete: PHP unset — paginated_key must be ABSENT in persisted data
	if (value !== null) delete value.paginated_key;
	const sourceKey = Number(change.source_key);
	const targetKey = Number(change.target_key);
	const source = items[sourceKey] as Record<string, unknown> | undefined;
	if (source === undefined || source === null || value === null) return null;
	// PHP :4424: locator::compare_locators($db_value, $client_value,
	// ['section_id','section_tipo','from_component_tipo','tag_id']).
	if (
		!compareLocators(source as never, value as never, [
			'section_id',
			'section_tipo',
			'from_component_tipo',
			'tag_id',
		])
	) {
		return null;
	}
	// The persisted moved item: stored item first, client value over it — a
	// client payload that omits stored properties (id, type, …) can never
	// strip them (S2-03; identity drift is already excluded by the gate above).
	const moved: Record<string, unknown> = { ...source, ...value };
	// biome-ignore lint/performance/noDelete: PHP unset — paginated_key must be ABSENT in persisted data
	delete moved.paginated_key;
	if (sourceKey === targetKey) return [...items];
	const rebuilt: unknown[] = [];
	items.forEach((current, key) => {
		if (key === sourceKey) return;
		if (key === targetKey && targetKey < sourceKey) {
			rebuilt.push(moved, current);
			return;
		}
		if (key === targetKey && targetKey > sourceKey) {
			rebuilt.push(current, moved);
			return;
		}
		rebuilt.push(current);
	});
	return rebuilt;
}

export interface SortByColumnChange {
	component_tipo: string;
	direction: string;
}

/**
 * Persistent user reorder of the stored locators by a column (v7 per-ddo model,
 * WC-048): gated by the COLUMN ddo's own `sort_by_column: true` — the top-level
 * `properties.sort_by_column` (true | allowlist array) is GONE, the capability
 * is declared on the `show.ddo_map` entry itself. The column must be a show
 * ddo_map entry of the component's own edit config; the stored locators reorder
 * by a target-section search ordered on that column (unranked locators keep
 * relative order at the END). PHP ancestor: component_relation_common::
 * sort_data_by_column (reference only — TS diverges to the ddo-level gate).
 */
export async function applySortByColumn(
	items: unknown[],
	change: SortByColumnChange,
	componentTipo: string,
	sectionTipo: string,
): Promise<unknown[] | null> {
	const { getNode } = await import('../ontology/resolver.ts');
	const node = await getNode(componentTipo);

	const direction = String(change.direction ?? '').toUpperCase();
	if (direction !== 'ASC' && direction !== 'DESC') return null;

	const columnTipo = String(change.component_tipo ?? '');
	const { buildRequestConfigForElement } = await import('./request_config/build.ts');
	const config = await buildRequestConfigForElement(node?.properties ?? null, {
		ownerTipo: componentTipo,
		ownerSectionTipo: sectionTipo,
		mode: 'edit',
		ownerIsSection: false,
	});
	const ddo = (config[0]?.show?.ddo_map ?? []).find((entry) => entry.tipo === columnTipo);
	if (ddo === undefined) return null;
	// Per-ddo opt-in: the column must declare `sort_by_column: true`.
	if ((ddo as { sort_by_column?: unknown }).sort_by_column !== true) return null;

	// The ranking scope is the TARGET section(s) — where the linked records
	// live — read from the locators, NOT the caller `sectionTipo`. A portal
	// column's `section_tipo: 'self'` means its target; resolving 'self' to the
	// caller searched the wrong table and ranked nothing.
	const { rankLocatorsByColumns, locatorTargetSections, buildOrderEntries } = await import(
		'./order_locators.ts'
	);
	const targets = locatorTargetSections(items);
	const firstTarget = targets[0];
	if (firstTarget === undefined) return null;

	// Resolve the per-MODEL order path (relation columns join to the linked
	// leaf, not a non-existent `.value` on the locator).
	const order = await buildOrderEntries([{ componentTipo: columnTipo, direction }], firstTarget);
	if (order.length === 0) return null;
	return rankLocatorsByColumns(items, targets, order);
}

/**
 * PHP add_new_element: create a record in the target section — inheriting
 * the HOST record's project filter (or the default project) into the
 * target's component_filter — then append the link locator to the portal.
 */
export async function applyAddNewElement(
	items: unknown[],
	targetSectionTipo: string,
	componentTipo: string,
	sectionTipo: string,
	sectionId: number,
	options?: {
		/**
		 * Skip the HOST record read that seeds the new target's project filter.
		 * Set by the TEMPORAL door (section/record/temporal.ts): a temporal
		 * instance addresses no record, so there is no host to inherit from and
		 * `sectionId` is a sentinel — reading it would read a stranger's record.
		 * The filter then falls through to the default project locator below,
		 * which is the same fallback a host with an empty filter already takes.
		 */
		skipHostFilterRead?: boolean;
	},
): Promise<{ items: unknown[]; sectionId: number } | null> {
	if (targetSectionTipo === '') return null;
	const { getComponentFilterTipo, getMatrixTableFromTipo } = await import(
		'../ontology/resolver.ts'
	);
	const { readMatrixRecord } = await import('../db/matrix.ts');
	const { createSectionRecord } = await import('../section/record/create_record.ts');

	// host project filter (or the default project locator)
	let filterData: Record<string, unknown>[] = [];
	const hostFilterTipo =
		options?.skipHostFilterRead === true ? null : await getComponentFilterTipo(sectionTipo);
	if (hostFilterTipo !== null) {
		const hostTable = await getMatrixTableFromTipo(sectionTipo);
		const hostRecord =
			hostTable === null ? null : await readMatrixRecord(hostTable, sectionTipo, sectionId);
		filterData =
			((hostRecord?.columns.relation as Record<string, unknown[]> | null)?.[
				hostFilterTipo
			] as Record<string, unknown>[]) ?? [];
	}
	if (filterData.length === 0) {
		// DEDALO_DEFAULT_PROJECT locator (dd153/1, relation type filter dd675)
		filterData = [{ section_tipo: 'dd153', section_id: '1', type: 'dd675' }];
	}

	const newSectionId = await createSectionRecord(targetSectionTipo, -1);
	if (!newSectionId) return null;

	// inherit the filter into the TARGET's component_filter (re-stamped)
	const targetFilterTipo = await getComponentFilterTipo(targetSectionTipo);
	if (targetFilterTipo !== null && filterData.length > 0) {
		const stamped = filterData.map((locator, index) => ({
			...locator,
			from_component_tipo: targetFilterTipo,
			id: index + 1,
		}));
		const targetTable = (await getMatrixTableFromTipo(targetSectionTipo)) ?? 'matrix';
		// json_codec chokepoint (S2-07): matrix jsonb writes never bind bare
		// JSON.stringify output — encodeForJsonb fails loud on undefined/NaN.
		await sql.unsafe(
			`UPDATE "${targetTable}"
			 SET relation = COALESCE(relation, '{}'::jsonb) || jsonb_build_object($1::text, $2::text::jsonb)
			 WHERE section_tipo = $3 AND section_id = $4`,
			[targetFilterTipo, encodeForJsonb(stamped), targetSectionTipo, newSectionId],
		);
	}

	// append the link locator (dedup like PHP add_locator_to_data). PHP's
	// save assigns the next ITEM id (1 on an empty portal).
	const maxId = (items as { id?: unknown }[]).reduce(
		(max, item) => Math.max(max, Number(item?.id ?? 0) || 0),
		0,
	);
	const locator = {
		id: maxId + 1,
		type: 'dd151',
		section_id: String(newSectionId),
		section_tipo: targetSectionTipo,
		from_component_tipo: componentTipo,
	};
	// Locator law (S2-04/DEC-21): key-based membership over the target pair —
	// stringified matching like the previous inline check, via the canonical
	// in_array_locator twin instead of a hand-rolled comparison.
	const exists = isLocatorInArray(locator as never, items as never[], [
		'section_tipo',
		'section_id',
	]);
	return {
		items: exists ? [...items] : [...items, locator],
		sectionId: newSectionId,
	};
}

/**
 * Write relation_search[componentTipo] = the recursive PARENT locators of
 * every stored target (dedup, closest-first, tagged with the items' relation
 * type) — the autocomplete_hi ancestor index. Exported for the observer
 * DEFAULT branch (same-record refresh after tag-text saves).
 */
export async function maintainRelationSearchIndex(
	table: string,
	sectionTipo: string,
	sectionId: number,
	componentTipo: string,
	items: unknown[],
): Promise<void> {
	const { getParentChainLocators } = await import('../resolve/dd_info.ts');
	const { updateMatrixKeyData } = await import('../db/matrix_write.ts');
	const relationType = ((items[0] as { type?: string } | null)?.type ?? 'dd151') || 'dd151';
	const seenAncestors = new Set<string>();
	const searchValue: Record<string, unknown>[] = [];
	for (const item of items) {
		const locator = item as { section_tipo?: string; section_id?: unknown } | null;
		if (typeof locator?.section_tipo !== 'string' || locator.section_id === undefined) continue;
		for (const parent of await getParentChainLocators(
			locator.section_tipo,
			String(locator.section_id),
		)) {
			const key = `${parent.section_tipo}|${parent.section_id}`;
			if (seenAncestors.has(key)) continue;
			seenAncestors.add(key);
			searchValue.push({
				type: relationType,
				section_id: parent.section_id,
				section_tipo: parent.section_tipo,
				from_component_tipo: componentTipo,
			});
		}
	}
	await updateMatrixKeyData(
		table,
		sectionTipo,
		sectionId,
		'relation_search',
		componentTipo,
		searchValue.length > 0 ? searchValue : null, // null → delete_key
	);
}

/**
 * PHP component_relation_common::validate_data_element (:1058-1198) — the
 * relation-family INSERT validation/normalization. The service_autocomplete
 * link_record flow depends on every step (found live 2026-07-09: the generic
 * insert used to persist the picker's raw client locator — paginated_key
 * kept, `type` missing, numeric section_id — polluting the shared data):
 *
 *  - section_id + section_tipo required, else the insert is IGNORED;
 *  - autoreference guard (self-link → ignored, PHP :1082);
 *  - `type` filled from the component's relation type (:1098);
 *  - component_relation_related additionally stamps `type_rel` (:1103);
 *  - `from_component_tipo` FORCED to the component's own tipo (:1107-19);
 *  - translatable relation locators carry the request lang (:1121-35);
 *  - transient `paginated_key` never persists (:1138-41);
 *  - locator normalization stores section_id as a STRING (PHP new locator —
 *    byte-verified against the oracle: client 301 → stored "301");
 *  - duplicate rejection over get_locator_properties_to_check
 *    ([section_id, section_tipo, type, tag_id] + lang when translatable,
 *    :1146-98) — a dup returns null so the item is not added and the client's
 *    server-authoritative duplicate check (pagination.total unchanged) fires.
 *
 * Properties the client sent beyond the locator law are PRESERVED (S2-03
 * posture — dataframe id_key pairing must survive). Returns the normalized
 * locator, or null when the insert must be dropped (PHP returns false).
 *
 * DATAFRAME saves run through here TOO, with `pairing` set. They used to be
 * excluded (`!isDataframeSave` at all three save_component call sites), which
 * made component_dataframe the ONE relation column that persisted the client's
 * raw locator: no `type`, echoed `paginated_key`, numeric section_id, no dedup
 * — i.e. write-only frames the read predicate could never see again. PHP has
 * no such exclusion (component_dataframe::set_data delegates to
 * parent::set_data → validate_data_element like every other relation); it only
 * OVERRIDES the dedup key, which `pairing` reproduces here.
 */
export async function validateRelationInsert(
	rawValue: Record<string, unknown>,
	context: {
		componentTipo: string;
		model: string;
		hostSectionTipo: string;
		hostSectionId: number | string;
		translatable: boolean;
		lang: string;
		existingItems: unknown[];
		/**
		 * Frame pairing context — present ONLY for a component_dataframe save.
		 * Switches on the two dataframe particularities: the persisted-frame
		 * normalizer (forced dd490 + server-authoritative pairing fields) and
		 * the test_equal_properties dedup key.
		 */
		pairing?: DataframePairing | null;
	},
): Promise<Record<string, unknown> | null> {
	const value: Record<string, unknown> = { ...rawValue };
	if (
		value.section_id === undefined ||
		value.section_id === null ||
		value.section_tipo === undefined ||
		value.section_tipo === null
	) {
		return null; // bad-formed locator — ignored
	}
	if (
		compareLocators(
			value as never,
			{ section_tipo: context.hostSectionTipo, section_id: context.hostSectionId } as never,
			['section_tipo', 'section_id'],
		)
	) {
		return null; // autoreference — avoid the infinite loop (locator law: loose section_id)
	}
	if (value.type === undefined || value.type === null || value.type === '') {
		value.type = await getRelationTypeByTipo(context.componentTipo);
	}
	if (context.model === 'component_relation_related' && value.type_rel === undefined) {
		const { getNode } = await import('../ontology/resolver.ts');
		const { getRelationTypeRel } = await import('./related.ts');
		value.type_rel = getRelationTypeRel((await getNode(context.componentTipo))?.properties ?? null);
	}
	value.from_component_tipo = context.componentTipo;
	if (context.translatable) {
		value.lang = context.lang;
	}
	// biome-ignore lint/performance/noDelete: PHP unset — paginated_key must be ABSENT in persisted data
	delete value.paginated_key;
	value.section_id = String(value.section_id);

	// DATAFRAME normalization + dedup. The pairing fields are stamped from the
	// SERVER's caller context (overriding whatever the client sent for `type`,
	// `id_key` and `main_component_tipo`), and identity is compared over
	// test_equal_properties — which includes id_key, so the same target record
	// may legitimately be framed from two different main items, while the SAME
	// frame twice is dropped.
	if (context.pairing !== undefined && context.pairing !== null) {
		const normalized = normalizeDataframeEntry(value, context.pairing);
		for (const item of context.existingItems) {
			if (dataframeEntriesEqual(item, normalized)) return null; // already framed — ignored
		}
		return normalized;
	}

	/**
	 * A frame arriving with NO caller pairing — import, and every maintenance
	 * door — is STILL a frame, and frame identity is still id_key-scoped.
	 *
	 * WC-2026-08-09-dataframe-import-id-key-identity. Without this arm the entry
	 * fell to the generic relation dedup below, whose key is
	 * [section_id, section_tipo, type, tag_id] — `id_key` is absent from it, so
	 * two frames pointing at the SAME target record from DIFFERENT main items
	 * hashed identically and the second was silently dropped as "already
	 * linked". That is the precise mistake `dataframeEntriesEqual`'s own header
	 * warns against; it was simply unreachable when `pairing` was null, which is
	 * exactly the case on every CSV import (`dataframePairingOf` needs a caller
	 * ddo, and an import has none).
	 *
	 * Nothing is normalized here: with no caller context there is nothing
	 * authoritative to stamp, so the entry's OWN `id_key`/`main_component_tipo`
	 * — carried in the file, written by the export — are the identity. That is
	 * what makes a raw export round trip.
	 */
	if (isDataframeEntry(value)) {
		for (const item of context.existingItems) {
			if (dataframeEntriesEqual(item, value)) return null; // the same frame twice — ignored
		}
		return value;
	}

	// Duplicate rejection (hash-key equality like PHP build_locator_lookup_key;
	// String() casts give the loose section_id the locator law requires).
	const props = context.translatable
		? ['section_id', 'section_tipo', 'type', 'tag_id', 'lang']
		: ['section_id', 'section_tipo', 'type', 'tag_id'];
	const lookupKey = (item: unknown): string =>
		props
			.map((prop) => {
				const raw = (item as Record<string, unknown> | null)?.[prop];
				return raw === undefined || raw === null ? '' : String(raw);
			})
			.join('|');
	const valueKey = lookupKey(value);
	for (const item of context.existingItems) {
		if (lookupKey(item) === valueKey) return null; // already linked — ignored
	}
	return value;
}

/**
 * The component's effective relation type (PHP component_relation_common
 * __construct :217-229): properties->config_relation->relation_type of the
 * component's OWN tipo, falling back to the concrete class default
 * (descriptor.defaultRelationType — PHP $default_relation_type). The
 * properties lookup MUST key on the tipo, not the normalized model: rsc860
 * normalizes component_autocomplete_hi → component_portal but its own
 * properties keep relation_type dd96 (the tool_indexation link type).
 */
export async function getRelationTypeByTipo(tipo: string): Promise<string> {
	const { getNode, getModelByTipo } = await import('../ontology/resolver.ts');
	const configured = (
		(await getNode(tipo))?.properties as {
			config_relation?: { relation_type?: unknown };
		} | null
	)?.config_relation?.relation_type;
	if (typeof configured === 'string' && configured !== '') return configured;
	const model = (await getModelByTipo(tipo)) ?? '';
	return getComponentModel(model)?.defaultRelationType ?? 'dd151';
}

/**
 * PHP trait.dataframe_common::remove_dataframe_data_by_id (:280-369) — the
 * server-authoritative cascade fired when ONE data item of a main component
 * is removed: every dataframe slot declared in the main's request_config
 * ddo_map loses the frame locators paired with that item (id_key contract),
 * sibling items' frames untouched.
 *
 * PHP-fidelity details (S1-05):
 * - The slot strip emits NO Time Machine row: PHP suppresses the slot's own
 *   TM entry (tm_record::$save_tm=false, REL-01) because the MAIN component's
 *   TM row captures the full state; a separate slot row would break TM
 *   restore ordering. The modified stamps are the caller's responsibility
 *   too (the main save/delete path refreshes them).
 * - get_dataframe_delete_policy(): default 'unlink' clears slot entries
 *   only; 'delete_target' additionally soft-deletes the unlinked frame
 *   TARGET records (collected BEFORE clearing, delete_data mode —
 *   recoverable from time machine; per-target failures log and continue).
 */
export async function removeDataframeDataById(
	table: string,
	sectionTipo: string,
	sectionId: number,
	mainComponentTipo: string,
	itemId: number,
	userId: number,
): Promise<void> {
	const { getNode, getModelByTipo } = await import('../ontology/resolver.ts');
	const node = await getNode(mainComponentTipo);
	if (node === undefined || node === null) return;

	// dataframe slots declared in the main's request_config (PHP
	// get_dataframe_ddo: ddo_map entries whose model is component_dataframe).
	const { buildRequestConfigForElement } = await import('./request_config/build.ts');
	const config = await buildRequestConfigForElement(node.properties ?? null, {
		ownerTipo: mainComponentTipo,
		ownerSectionTipo: sectionTipo,
		mode: 'edit',
		ownerIsSection: false,
	});
	const slotTipos: string[] = [];
	for (const item of config) {
		for (const ddo of item.show?.ddo_map ?? []) {
			if (typeof ddo.tipo !== 'string' || slotTipos.includes(ddo.tipo)) continue;
			if ((await getModelByTipo(ddo.tipo)) === 'component_dataframe') slotTipos.push(ddo.tipo);
		}
	}
	if (slotTipos.length === 0) return;

	// delete policy from the MAIN component's ontology properties
	// (properties->dataframe->delete_policy; anything else is 'unlink').
	const policy = (node.properties as { dataframe?: { delete_policy?: unknown } } | null)?.dataframe
		?.delete_policy;
	const deleteTarget = policy === 'delete_target';
	const unlinkedTargets: { section_tipo: string; section_id: number | string }[] = [];

	const { updateMatrixKeyData } = await import('../db/matrix_write.ts');
	for (const slotTipo of slotTipos) {
		const rows = (await sql.unsafe(
			`SELECT relation->$1 AS items FROM "${table}" WHERE section_tipo = $2 AND section_id = $3`,
			[slotTipo, sectionTipo, sectionId],
		)) as { items: unknown }[];
		const slotItems = Array.isArray(rows[0]?.items)
			? (rows[0].items as Record<string, unknown>[])
			: [];
		if (slotItems.length === 0) continue;

		const kept: Record<string, unknown>[] = [];
		const removed: Record<string, unknown>[] = [];
		for (const entry of slotItems) {
			(dataframeEntryMatches(entry, mainComponentTipo, itemId, slotTipo) ? removed : kept).push(
				entry,
			);
		}
		if (removed.length === 0) continue; // nothing paired with this item

		if (deleteTarget) {
			for (const entry of removed) {
				const target = entry as { section_tipo?: unknown; section_id?: unknown };
				if (typeof target.section_tipo === 'string' && target.section_id !== undefined) {
					unlinkedTargets.push({
						section_tipo: target.section_tipo,
						section_id: target.section_id as number | string,
					});
				}
			}
		}
		// Slot write with NO TM row (see the contract note above): null value
		// removes the key, like PHP set_data(null)+save on an emptied slot.
		await updateMatrixKeyData(
			table,
			sectionTipo,
			sectionId,
			'relation',
			slotTipo,
			kept.length > 0 ? kept : null,
		);
	}

	// delete_target policy: soft-delete the unlinked frame target records
	// (PHP sections::delete delete_mode 'delete_data' — recoverable).
	if (deleteTarget && unlinkedTargets.length > 0) {
		const { deleteSectionData } = await import('../section/record/delete_record.ts');
		for (const target of unlinkedTargets) {
			try {
				await deleteSectionData(target.section_tipo, Number(target.section_id), userId);
			} catch (error) {
				// PHP logs per-target soft-delete failures and continues.
				console.error(
					`removeDataframeDataById: delete_target soft-delete failed for ${target.section_tipo}/${String(target.section_id)}:`,
					error,
				);
			}
		}
	}
}

/**
 * dd_component_portal_api.delete_locator (PHP): remove every stored locator
 * matching the given partial locator on ar_properties via
 * locator::compare_locators (empty ar_properties → full property-UNION strict
 * compare, property_exists semantics, section_id-only loose match,
 * paginated_key always excluded). A missing locator.type auto-sets to the
 * component's relation type; a MISMATCHED type aborts (PHP
 * remove_locator_from_data guard). Each removed locator cascades its paired
 * dataframe slot entries (remove_dataframe_data_by_id, S1-05). Returns the
 * PHP response shape {result: <removed count>, msg: [], errors: []}.
 */
export async function deletePortalLocator(
	principal: { isGlobalAdmin: boolean; userId: number },
	source: { tipo?: string; section_tipo?: string; section_id?: string | number },
	options: { locator?: Record<string, unknown>; ar_properties?: string[] },
): Promise<{ result: unknown; msg: string[]; errors: string[] }> {
	const response = { result: false as unknown, msg: [] as string[], errors: [] as string[] };
	const tipo = source.tipo ?? '';
	const sectionTipo = source.section_tipo ?? '';
	const sectionId = source.section_id;
	const locator = options.locator;
	if (tipo === '' || sectionTipo === '' || sectionId === undefined || sectionId === null) {
		response.errors.push(
			'Missing required source/options (section_tipo, tipo, section_id, locator)',
		);
		return response;
	}
	if (locator === undefined || locator === null || typeof locator !== 'object') {
		response.errors.push(
			'Missing required source/options (section_tipo, tipo, section_id, locator)',
		);
		return response;
	}
	// SEC: write permission (PHP assert_section_permission level 2). The
	// permissions matrix grants admins; non-admins denied for now (v0 parity
	// with the dispatch save gate).
	if (!principal.isGlobalAdmin) {
		response.errors.push('insufficient permissions');
		return response;
	}

	const { getMatrixTableFromTipo, getModelByTipo, getColumnNameByModel } = await import(
		'../ontology/resolver.ts'
	);
	const { readMatrixRecord } = await import('../db/matrix.ts');
	const { updateMatrixKeyData } = await import('../db/matrix_write.ts');
	const model = (await getModelByTipo(tipo)) ?? '';
	const column = getColumnNameByModel(model) ?? 'relation';
	const table = (await getMatrixTableFromTipo(sectionTipo)) ?? 'matrix';

	// Empty/omitted ar_properties passes through as [] — PHP's API layer never
	// substitutes the method's 4-field default here, so compare_locators runs
	// its full property-UNION strict compare (substituting the default
	// over-deletes: a second locator to the same target with a different
	// tag_id would be destroyed).
	const properties = Array.isArray(options.ar_properties) ? options.ar_properties : [];

	// W11 (2026-08-02, observer-cascade prerequisite): the read → JS filter →
	// whole-key replace below was an UNLOCKED read-modify-write on the pooled
	// connection — two concurrent removals on the same record each read the
	// full bag, each wrote its own filtered copy, and the second COMMIT undid
	// the first removal (lost update); any cascade wired through this door
	// would then propagate from a bag state that never existed. The whole RMW
	// (+ the dataframe cascade + the TM audit row) now runs in ONE transaction
	// with the row locked FOR UPDATE before the read, so concurrent removals
	// serialize and the write+audit commit atomically. The post-commit fan-out
	// (save event, permission caches, observers) stays OUTSIDE the transaction
	// — observers must see committed state and may never run in an ambient tx
	// (B6, see observers.ts runObserverCascadeHop).
	const outcome = await withTransaction(async () => {
		// Row lock first — the identifier is the allowlist-validated matrix
		// table; both values are bound. ZERO-ROW GUARD (review 2026-08-02): a
		// FOR UPDATE that matches no row LOCKS NOTHING, and under READ COMMITTED
		// the readMatrixRecord below takes a FRESH snapshot — a record committed
		// between the two statements would then be read-modify-written with NO
		// lock, re-opening the W11 lost-update window. Never proceed past the
		// lock unless it actually returned (and therefore locked) the row; a
		// record that does not exist under the lock has no locators to remove —
		// byte-identical empty-data response.
		const lockedRows = (await sql.unsafe(
			`SELECT id FROM "${table}" WHERE section_tipo = $1 AND section_id = $2 FOR UPDATE`,
			[sectionTipo, Number(sectionId)],
		)) as { id: number }[];
		if (lockedRows.length === 0) {
			return {
				emptyData: true,
				typeMismatch: false,
				removed: 0,
				removedLocators: [] as Record<string, unknown>[],
			};
		}
		const record = await readMatrixRecord(table, sectionTipo, Number(sectionId));
		const items =
			((
				record?.columns[column as keyof typeof record.columns] as Record<string, unknown[]> | null
			)?.[tipo] as Record<string, unknown>[]) ?? [];
		if (items.length === 0) {
			return {
				emptyData: true,
				typeMismatch: false,
				removed: 0,
				removedLocators: [] as Record<string, unknown>[],
			};
		}

		// type guard (PHP remove_locator_from_data): default a missing type to the
		// component's OWN relation type (config_relation.relation_type of the tipo,
		// then the class default — rsc860 is dd96, not dd151); abort on mismatch.
		// PHP isset() treats null like absent, so null auto-sets too. Runs AFTER
		// the empty-data check (PHP order — the empty-data message wins).
		const compare = { ...locator };
		const relationType = await getRelationTypeByTipo(tipo);
		if (compare.type === undefined || compare.type === null) {
			compare.type = relationType;
		} else if (compare.type !== relationType) {
			return {
				emptyData: false,
				typeMismatch: true,
				removed: 0,
				removedLocators: [] as Record<string, unknown>[],
			};
		}

		const kept: Record<string, unknown>[] = [];
		const removedLocators: Record<string, unknown>[] = [];
		for (const item of items) {
			// PHP locator::compare_locators semantics: property present on exactly
			// one side → not equal; absent on both → skip; section_id loose, every
			// other property strict (stored tag_id '7' vs sent 7 does NOT match);
			// paginated_key always excluded (accidental saved-paginated_key guard).
			const equal = compareLocators(item as never, compare as never, properties, ['paginated_key']);
			if (equal) {
				removedLocators.push(item);
			} else {
				// PHP re-persists survivors through the locator class, which CASTS
				// tag_id to string — mirror the normalization.
				kept.push(
					item?.tag_id !== undefined && item.tag_id !== null
						? { ...item, tag_id: String(item.tag_id) }
						: item,
				);
			}
		}
		if (removedLocators.length > 0) {
			// Dataframe cascade (PHP remove_locator_from_data :1362): each removed
			// locator strips the frame entries paired with its item id (unified
			// id_key pairing). Pre-migration locators without an id have no id_key
			// to pair on — PHP skips them too.
			for (const removedLocator of removedLocators) {
				const itemId = removedLocator.id;
				if (itemId === undefined || itemId === null) continue;
				await removeDataframeDataById(
					table,
					sectionTipo,
					Number(sectionId),
					tipo,
					Math.trunc(Number(itemId)),
					principal.userId,
				);
			}
			await updateMatrixKeyData(table, sectionTipo, Number(sectionId), column, tipo, kept);
			await recordTimeMachine(
				{
					sectionTipo,
					sectionId: Number(sectionId),
					componentTipo: tipo,
					lang: 'lg-nolan',
					userId: principal.userId,
					data: kept,
				},
				dbTimestamp(),
			);
		}
		return {
			emptyData: false,
			typeMismatch: false,
			removed: removedLocators.length,
			removedLocators,
		};
	});

	if (outcome.emptyData) {
		response.msg.push(`No locators are removed (${model} - ${tipo}). The component data is empty`);
		response.result = 0;
		return response;
	}
	if (outcome.typeMismatch) {
		response.msg.push(`No locators are removed (${model} - ${tipo})`);
		response.result = 0;
		return response;
	}
	const removed = outcome.removed;
	if (removed > 0) {
		// Cache invalidation (Opus review 2026-07-10, C2): this door bypassed the
		// save chokepoint's event fan-out, so removing a SECURITY locator (dd244
		// admin flag, dd1725 profile, dd170 projects) left every security cache
		// stale until the TTL — a demoted admin kept admin for up to 300s. The
		// event channel + the targeted clear close all three caches at once.
		// Post-COMMIT (W11): fired after the transaction above settles, so a
		// concurrent request repopulating the cache reads the committed bag.
		{
			const { fireSaveEvent } = await import('../section_record/save_event.ts');
			const { invalidatePermissionsForWrite } = await import('../security/permissions.ts');
			await fireSaveEvent(sectionTipo);
			invalidatePermissionsForWrite(sectionTipo, tipo, Number(sectionId));
		}
		// Observer cascade (2026-07-24): this door bypasses saveComponentData,
		// so it fires propagation itself. This is a PURE REMOVAL door — the
		// removed locators name the records whose mirrors must recompute, and
		// nothing was saved. Until 2026-08-06 they rode the `saved` slot, which
		// happened to work only because the two sets were then handled
		// identically; ObservedChange makes the semantics explicit. The
		// recompute reads truth from matrix_relation_index, so the removal is
		// already reflected. Dynamic import: runtime-only relations→section
		// edge, no static SCC. Post-COMMIT (W11/B6): the recompute must read the
		// committed removal.
		{
			const { propagateToObservers } = await import('../section/record/observers.ts');
			await propagateToObservers(
				tipo,
				sectionTipo,
				Number(sectionId),
				{ saved: [], removed: outcome.removedLocators },
				principal.userId,
			);
		}
		response.msg.push(`Deleted ${removed} locators (${model} - ${tipo})`);
		response.result = removed;
	} else {
		response.msg.push(`No locators are removed (${model} - ${tipo})`);
		response.result = 0;
	}
	return response;
}
