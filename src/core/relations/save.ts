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
import { dataframeEntryMatches } from '../concepts/subdatum.ts';
import { dbTimestamp } from '../db/db_timestamp.ts';
import { encodeForJsonb } from '../db/json_codec.ts';
import { sql } from '../db/postgres.ts';
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
 * PHP component_relation_common::sort_data_by_column: gated by the
 * component's `sort_by_column` property (true | allowlist array); the column
 * must be a show ddo_map entry of the component's own edit config; the
 * stored locators reorder by a target-section search ordered on that column
 * (unranked locators keep relative order at the END).
 */
export async function applySortByColumn(
	items: unknown[],
	change: SortByColumnChange,
	componentTipo: string,
	sectionTipo: string,
): Promise<unknown[] | null> {
	const { getNode } = await import('../ontology/resolver.ts');
	const node = await getNode(componentTipo);
	const sortByColumn = (node?.properties as { sort_by_column?: unknown } | null)?.sort_by_column;
	if (sortByColumn !== true && !Array.isArray(sortByColumn)) return null;

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
	if (Array.isArray(sortByColumn) && !sortByColumn.includes(columnTipo)) return null;

	const rawTargets = Array.isArray(ddo.section_tipo) ? ddo.section_tipo : [ddo.section_tipo];
	const targets = rawTargets
		.map((target) => (target === 'self' ? sectionTipo : target))
		.filter((target): target is string => typeof target === 'string' && target !== '');
	if (targets.length === 0) return null;
	const firstTarget = targets[0] as string;

	const locatorItems = items as { section_id?: unknown; section_tipo?: unknown }[];
	if (locatorItems.length < 2) return [...items];
	const ids = [...new Set(locatorItems.map((item) => Number(item?.section_id ?? 0)))];

	// rank query: the portal targets ordered by the column value
	const { buildSearchSql } = await import('../search/sql_assembler.ts');
	const { sql: rankSql, params } = await buildSearchSql({
		section_tipo: targets,
		limit: 0,
		offset: 0,
		filter: {
			$or: [
				{
					q: ids.join(','),
					q_operator: null,
					path: [
						{
							section_tipo: firstTarget,
							component_tipo: 'section_id',
							model: 'component_section_id',
							name: 'Id',
						},
					],
				},
			],
		},
		order: [{ direction, path: [{ section_tipo: firstTarget, component_tipo: columnTipo }] }],
	} as never);
	const rows = (await sql.unsafe(rankSql, params as (string | number | null)[])) as {
		section_tipo: string;
		section_id: number;
	}[];
	const rank = new Map<string, number>();
	rows.forEach((row, index) => rank.set(`${row.section_tipo}_${row.section_id}`, index));

	const rankOf = (item: { section_id?: unknown; section_tipo?: unknown }): number =>
		rank.get(`${item?.section_tipo ?? ''}_${Number(item?.section_id ?? 0)}`) ??
		Number.MAX_SAFE_INTEGER;
	const sorted = [...locatorItems];
	// stable sort by rank (PHP usort with rank map; ties keep relative order)
	sorted
		.map((item, index) => ({ item, index }))
		.sort((a, b) => rankOf(a.item) - rankOf(b.item) || a.index - b.index)
		.forEach((entry, position) => {
			const clean = entry.item as Record<string, unknown>;
			// biome-ignore lint/performance/noDelete: PHP unset — paginated_key must be ABSENT in persisted data
			delete clean.paginated_key;
			sorted[position] = clean;
		});
	return sorted;
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
): Promise<{ items: unknown[]; sectionId: number } | null> {
	if (targetSectionTipo === '') return null;
	const { getComponentFilterTipo, getMatrixTableFromTipo } = await import(
		'../ontology/resolver.ts'
	);
	const { readMatrixRecord } = await import('../db/matrix.ts');
	const { createSectionRecord } = await import('../section/record/create_record.ts');

	// host project filter (or the default project locator)
	let filterData: Record<string, unknown>[] = [];
	const hostFilterTipo = await getComponentFilterTipo(sectionTipo);
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
	const record = await readMatrixRecord(table, sectionTipo, Number(sectionId));
	const items =
		((record?.columns[column as keyof typeof record.columns] as Record<string, unknown[]> | null)?.[
			tipo
		] as Record<string, unknown>[]) ?? [];
	if (items.length === 0) {
		response.msg.push(`No locators are removed (${model} - ${tipo}). The component data is empty`);
		response.result = 0;
		return response;
	}

	// type guard (PHP remove_locator_from_data): default a missing type to the
	// component's OWN relation type (config_relation.relation_type of the tipo,
	// then the class default — rsc860 is dd96, not dd151); abort on mismatch.
	// PHP isset() treats null like absent, so null auto-sets too.
	const compare = { ...locator };
	const relationType = await getRelationTypeByTipo(tipo);
	if (compare.type === undefined || compare.type === null) {
		compare.type = relationType;
	} else if (compare.type !== relationType) {
		response.msg.push(`No locators are removed (${model} - ${tipo})`);
		response.result = 0;
		return response;
	}
	// Empty/omitted ar_properties passes through as [] — PHP's API layer never
	// substitutes the method's 4-field default here, so compare_locators runs
	// its full property-UNION strict compare (substituting the default
	// over-deletes: a second locator to the same target with a different
	// tag_id would be destroyed).
	const properties = Array.isArray(options.ar_properties) ? options.ar_properties : [];

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
	const removed = removedLocators.length;
	if (removed > 0) {
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
		// Cache invalidation (Opus review 2026-07-10, C2): this door bypassed the
		// save chokepoint's event fan-out, so removing a SECURITY locator (dd244
		// admin flag, dd1725 profile, dd170 projects) left every security cache
		// stale until the TTL — a demoted admin kept admin for up to 300s. The
		// event channel + the targeted clear close all three caches at once.
		{
			const { fireSaveEvent } = await import('../section_record/save_event.ts');
			const { invalidatePermissionsForWrite } = await import('../security/permissions.ts');
			await fireSaveEvent(sectionTipo);
			invalidatePermissionsForWrite(sectionTipo, tipo, Number(sectionId));
		}
		response.msg.push(`Deleted ${removed} locators (${model} - ${tipo})`);
		response.result = removed;
	} else {
		response.msg.push(`No locators are removed (${model} - ${tipo})`);
		response.result = 0;
	}
	return response;
}
