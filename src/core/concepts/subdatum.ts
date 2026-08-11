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
import { canonicalizeStoredSectionId } from './section_id.ts';

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
 * The full locator property set that defines dataframe-entry IDENTITY
 * (PHP component_dataframe::$test_equal_properties,
 * class.component_dataframe.php:82) — the dedup key of the write path
 * (dataframeEntriesEqual below); the READ pairing predicate
 * (dataframeEntryMatches) intentionally checks a subset.
 *
 * `id` is DELIBERATELY absent: it is the entry's own per-record counter id,
 * minted fresh on every insert, so including it would make every duplicate
 * unique and defeat the check. That is exactly how three byte-identical
 * frames reached one live record (oh1/368) — the merge deduped on a full
 * JSON signature, which `id` always differentiated.
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

/**
 * The pairing context a frame write is scoped to — the wire
 * `source.caller_dataframe`, narrowed to the two fields that define the
 * pairing. Declared here (with the predicate and the normalizer) so every
 * door speaks the same shape.
 */
export interface DataframePairing {
	/** The dataframe SLOT tipo the entry is stored under. */
	readonly frameTipo: string;
	/** The main component whose item the frame extends. */
	readonly mainComponentTipo: string;
	/** The stable id of the main data item (locator `id` / literal item `id`). */
	readonly idKey: number | string;
}

/**
 * THE persisted-frame normalizer — the single definition of what a stored
 * dataframe pairing locator looks like. Every write door funnels through it,
 * so a frame cannot reach the DB in a shape the read predicate rejects.
 *
 * The four things it guarantees, each one a defect found live on oh1/368:
 *   1. `type` is FORCED to dd490. Never trusted from the client, which sends
 *      it absent (the service_autocomplete pick) or wrong ('dd151', stamped
 *      by the portal tree-view branch). A frame without dd490 is invisible to
 *      isDataframeEntry — stored, unreadable, and undeletable through the UI.
 *   2. `from_component_tipo` / `main_component_tipo` / `id_key` come from the
 *      SERVER's caller context, not the payload: the client sources its
 *      `id_key` from the last read echo, so trusting it lets one broken read
 *      corrupt every subsequent write.
 *   3. `section_id` is CANONICALIZED to an int
 *      (WC-2026-08-10-section-id-int-canonical, repealing the stringify law
 *      this list used to state — "all 9698 PHP-written frames store it as a
 *      string"). The containment argument that justified the string form is
 *      gone: relation probes are now dual-form/typed (core/search/containment.ts),
 *      so an int-shaped frame is matched by an int-shaped probe. Non-address
 *      values (external remote ids) pass through verbatim.
 *   4. transients and legacy pairing keys are STRIPPED: `paginated_key` is a
 *      read-time index the client echoes back, and section_id_key /
 *      section_tipo_key are the pre-v7 pairing (read-only BC, never written).
 */
export function normalizeDataframeEntry(
	entry: Record<string, unknown>,
	pairing: DataframePairing,
): Record<string, unknown> {
	const normalized: Record<string, unknown> = {
		...entry,
		type: DATAFRAME_RELATION_TYPE,
		from_component_tipo: pairing.frameTipo,
		main_component_tipo: pairing.mainComponentTipo,
		id_key: Math.trunc(Number(pairing.idKey)),
	};
	if (normalized.section_id !== undefined && normalized.section_id !== null) {
		normalized.section_id = canonicalizeStoredSectionId(normalized.section_id);
	}
	// biome-ignore lint/performance/noDelete: transient read-time index — must be ABSENT in stored data
	delete normalized.paginated_key;
	// biome-ignore lint/performance/noDelete: pre-v7 pairing keys are read-only BC, never written anew
	delete normalized.section_id_key;
	// biome-ignore lint/performance/noDelete: see above
	delete normalized.section_tipo_key;
	return normalized;
}

/**
 * Frame IDENTITY equality over DATAFRAME_TEST_EQUAL_PROPERTIES — the write
 * path's duplicate gate (PHP validate_data_element keyed by
 * component_dataframe::get_locator_properties_to_check).
 *
 * String()-compared per the locator law's loose section_id rule, so a stored
 * "4" and an incoming 4 are the same frame. The generic relation dedup key
 * ([section_id, section_tipo, type, tag_id]) must NOT be used here: it omits
 * id_key, so it would reject a legitimate second frame pointing at the same
 * target record from a DIFFERENT main item.
 */
export function dataframeEntriesEqual(a: unknown, b: unknown): boolean {
	if (a === null || typeof a !== 'object' || b === null || typeof b !== 'object') return false;
	const left = a as Record<string, unknown>;
	const right = b as Record<string, unknown>;
	return DATAFRAME_TEST_EQUAL_PROPERTIES.every((property) => {
		const leftValue = left[property];
		const rightValue = right[property];
		if (leftValue === undefined || leftValue === null) {
			return rightValue === undefined || rightValue === null;
		}
		return String(leftValue) === String(rightValue);
	});
}
