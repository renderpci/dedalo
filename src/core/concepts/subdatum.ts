/**
 * SUBDATUM — the recursive glue (spec §3.8).
 *
 * Subdatum is the recursive expansion of child-component data through the
 * request_config/ddo_map hierarchy: it bridges a parent component's stored
 * LOCATORS (locator.ts) to their resolved child CONTEXT+DATA. Portals and all
 * relation components are built on it.
 *
 * PHP reference: common::get_subdatum (class.common.php:2254). The algorithm
 * the rewrite must reproduce (semantics, not shape):
 *
 *   1. Read the caller's resolved request_config; merge all ddo_map entries
 *      from show/search/choose/hide; dedupe by (tipo, parent, section_tipo).
 *   2. Group ddos by section_tipo for O(1) lookup per locator.
 *   3. For each locator: take only DIRECT children of the caller
 *      (ddo.parent === caller tipo — the :2454 filter), instantiate each child
 *      component against locator.section_tipo/section_id, and hand it the
 *      NARROWED ddo_map (its own descendants only, ddo.ts getDescendants) so
 *      resolution recurses declaratively.
 *   4. Deduplicate context entries across locators (seen-context tracking);
 *      collect data entries per locator.
 *
 * DATAFRAME special case (the id_key contract — must be preserved EXACTLY):
 * a dataframe component pairs frame records to INDIVIDUAL DATA ITEMS of its
 * main component, keyed by the item's stable `id` (locator field `id_key`),
 * never by array index and never by the locator's section_id. The dataframe
 * child resolves against the CALLER's section_id, with a caller-dataframe DTO
 * of {id_key, section_tipo, main_component_tipo}. PHP: class.common.php
 * :2429-2529 and trait.dataframe_common.php:395 (build_dataframe_subdatum).
 *
 * CONCURRENCY (spec §4): locators are independent of each other and may be
 * resolved with Promise.all. Dedup of context entries happens AFTER the
 * parallel gather (order-stable by locator index) so results stay
 * deterministic and PHP-comparable.
 *
 * WHERE THE ENGINE LIVES: this module is the PURE contract home — shapes,
 * the id_key match predicate, and the pairing constants. The I/O-bearing
 * subdatum walk (matrix reads, per-locator expansion, item stamping) lives in
 * src/core/relations/ (relation_core.ts + models/*), dispatched per model by
 * relations/registry.ts.
 */

import { z } from 'zod';
import { contextEntrySchema, dataEntrySchema } from './context_data.ts';

/** The output of a subdatum expansion (PHP get_subdatum return). */
export const subdatumSchema = z.object({
	/** Deduplicated child component structures. */
	context: z.array(contextEntrySchema),
	/** Resolved child data rows, in locator order. */
	data: z.array(dataEntrySchema),
});
export type Subdatum = z.infer<typeof subdatumSchema>;

/**
 * Caller-dataframe DTO passed down when a dataframe child is resolved
 * (PHP class.common.php:2523-2529).
 */
export interface CallerDataframe {
	/** Stable id of the main component's data item this frame pairs with. */
	readonly idKey: number;
	/** Section of the CALLER (dataframes live on the caller's record). */
	readonly sectionTipo: string;
	/** The main component that owns the pairing. */
	readonly mainComponentTipo: string;
}

/**
 * The full locator property set that defines dataframe-entry identity
 * (PHP component_dataframe::$test_equal_properties,
 * class.component_dataframe.php:82). Used by the save/dedup path (Phase C);
 * the READ pairing predicate below intentionally checks a subset.
 */
export const DATAFRAME_TEST_EQUAL_PROPERTIES: readonly string[] = [
	'type',
	'section_id',
	'section_tipo',
	'from_component_tipo',
	'id_key',
	'main_component_tipo',
];

/**
 * PHP DEDALO_RELATION_TYPE_DATAFRAME — the positive type marker every frame
 * pairing locator carries after dataframe_v7_migration (legacy dual-read via
 * section_id_key/section_tipo_key was removed; readers recognise dd490 only).
 */
export const DATAFRAME_RELATION_TYPE = 'dd490';

/**
 * Positive detection of dataframe pairing locators (PHP
 * dataframe_common::is_dataframe_entry, trait.dataframe_common.php:56):
 * `type === dd490` is the single source of truth — non-frame objects in the
 * mixed relations bag (portal locators, IRI locators, …) fail this gate.
 */
export function isDataframeEntry<T>(entry: T): entry is T & { type: string } {
	return (
		entry !== null &&
		typeof entry === 'object' &&
		(entry as { type?: unknown }).type === DATAFRAME_RELATION_TYPE
	);
}

/**
 * The id_key pairing predicate (PHP dataframe_common::dataframe_entry_matches,
 * trait.dataframe_common.php:82): a stored frame locator pairs with a
 * main-component data item when
 *   1. it IS a frame (type dd490 — isDataframeEntry);
 *   2. `from_component_tipo` matches the slot, when the caller supplies one;
 *   3. `main_component_tipo` identifies the same main component;
 *   4. `id_key` equals the item's stable `id` (INT comparison — ids arrive
 *      as int or numeric string).
 * NEVER pair by array index and never by the locator's section_id.
 */
export function dataframeEntryMatches(
	entry: {
		type?: string;
		id_key?: number | string;
		main_component_tipo?: string;
		from_component_tipo?: string;
	} | null,
	mainComponentTipo: string,
	pairId: number | string,
	fromComponentTipo?: string,
): boolean {
	if (!isDataframeEntry(entry)) return false;
	if (fromComponentTipo !== undefined && entry.from_component_tipo !== fromComponentTipo) {
		return false;
	}
	if (entry.main_component_tipo !== mainComponentTipo) return false;
	const entryKey = entry.id_key;
	if (entryKey === undefined || entryKey === null) return false;
	return Number(entryKey) === Number(pairId);
}
