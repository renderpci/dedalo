/**
 * DATAFRAME id_key ENGINE (RELATIONS_SPEC.md §6.2) — the pairing machinery
 * connecting frame records to INDIVIDUAL data items of a main component.
 *
 * A dataframe works like any relation (it points to target section(s) and
 * stores locators in the relations bag), but each frame locator is connected
 * to ONE data item of its main component via `id_key → id`: the locator's
 * `id_key` equals the stable, server-minted `id` of the main item. The main
 * component can be ANY component — relation or literal (text, date, iri, …).
 * Frames extend the main data (uncertainty, context, qualifiers) without
 * polluting it.
 *
 * PHP references: class.component_dataframe.php (get_data :103 filtered by
 * caller, set_data :187 sibling-preserving merge + id_key stamping :205-213,
 * $test_equal_properties :82), trait.dataframe_common.php (predicate :82,
 * inline *_by_id_key API :833-960 — the value-item variant used by the
 * relation sibling-order component_number).
 *
 * The pure match predicate lives in concepts/subdatum.ts; this module holds
 * the slot read/merge algebra and the inline-value API as pure functions
 * over item arrays (the save pipeline and Phase D children order consume
 * them), plus ONE persistence helper: fixDataframeOrphanEntries, the
 * lock-and-per-key write half of the integrity fix-mode (S2-06).
 */

import { dataframeEntryMatches, isDataframeEntry } from '../concepts/subdatum.ts';
import { type MatrixKeyWrite, updateMatrixKeysData } from '../db/matrix_write.ts';
import { sql, withTransaction } from '../db/postgres.ts';

/** The caller context one frame operation is scoped to (PHP dataframe_caller). */
export interface DataframeCaller {
	/** The main component whose item the frames extend. */
	main_component_tipo?: string;
	/** The stable id of the main data item (>= 1, server-minted). */
	id_key?: number | string;
	[extra: string]: unknown;
}

/**
 * The caller's frame subset of a slot's full data (PHP
 * component_dataframe::get_data :103): only the entries matching the caller
 * pairing predicate for this slot tipo.
 */
export function filterCallerEntries(
	slotData: Record<string, unknown>[],
	caller: DataframeCaller,
	frameTipo: string,
): Record<string, unknown>[] {
	const mainComponentTipo = caller.main_component_tipo;
	const idKey = caller.id_key;
	if (typeof mainComponentTipo !== 'string' || idKey === undefined || idKey === null) return [];
	return slotData.filter((entry) =>
		dataframeEntryMatches(entry, mainComponentTipo, idKey, frameTipo),
	);
}

/**
 * Caller-aware slot write merge (PHP component_dataframe::set_data :187):
 * a single slot tipo stores frames for ALL items of the main component on
 * the same record — a naive overwrite would erase sibling items' frames.
 *
 * Algorithm (ported exactly):
 * 1. siblings = every stored entry NOT matching this caller context —
 *    unconditionally preserved;
 * 2. additions = incoming entries not already present as siblings
 *    (JSON-signature dedup, so passing the full slot array is harmless);
 * 3. every addition that IS a frame gets the caller's id_key stamped as INT
 *    and the legacy section_id_key/section_tipo_key keys REMOVED
 *    (:205-213 — legacy keys are read-only BC, never written anew);
 * 4. merged = siblings + additions; empty merges normalise to null.
 */
export function mergeCallerEntries(
	fullSlotData: Record<string, unknown>[],
	incoming: Record<string, unknown>[],
	caller: DataframeCaller,
	frameTipo: string,
): Record<string, unknown>[] | null {
	const mainComponentTipo = caller.main_component_tipo;
	const idKey = caller.id_key;
	const siblings =
		typeof mainComponentTipo === 'string' && idKey !== undefined && idKey !== null
			? fullSlotData.filter(
					(entry) => !dataframeEntryMatches(entry, mainComponentTipo, idKey, frameTipo),
				)
			: [...fullSlotData];

	const siblingSignatures = new Set(siblings.map((entry) => JSON.stringify(entry)));
	const additions = incoming
		.filter((entry) => !siblingSignatures.has(JSON.stringify(entry)))
		.map((entry) => {
			if (!isDataframeEntry(entry) || idKey === undefined || idKey === null) return entry;
			const stamped: Record<string, unknown> = { ...entry, id_key: Math.trunc(Number(idKey)) };
			// biome-ignore lint/performance/noDelete: PHP unset — legacy pairing keys must be ABSENT in persisted frames
			delete stamped.section_id_key;
			// biome-ignore lint/performance/noDelete: PHP unset — see above
			delete stamped.section_tipo_key;
			return stamped;
		});

	const merged = [...siblings, ...additions];
	return merged.length === 0 ? null : merged;
}

/**
 * ORPHAN-FIX WRITE (S2-06) — the safe persistence half of the dataframe
 * integrity fix-mode (the dataframe_control maintenance widget's run_fix).
 *
 * The widget's scan identifies orphan frame entries (pairing locators whose
 * main item id no longer exists) from a TABLE SCAN snapshot that can be
 * seconds-to-minutes stale on large tables. Persisting the fix as a
 * full-column `relation` overwrite from that snapshot silently reverts ANY
 * component save (TS or the coexisting PHP server) that landed on the record
 * since the scan. This helper instead:
 *
 *  1. re-reads the row's live `relation` column FOR UPDATE inside a
 *     transaction (the lock holds to COMMIT — S1-02 machinery);
 *  2. drops ONLY the entries byte-identical (JSON signature) to the scanned
 *     orphans — an entry edited since the scan no longer matches and is left
 *     alone (the next scan re-evaluates it);
 *  3. writes per-KEY via updateMatrixKeysData/json_codec (spec §2.2: sibling
 *     component keys in the column are never touched), emptied keys removed.
 *
 * Returns the number of entries actually removed (0 when the row changed or
 * vanished since the scan).
 */
export async function fixDataframeOrphanEntries(
	table: string,
	sectionTipo: string,
	sectionId: number,
	orphans: readonly Record<string, unknown>[],
): Promise<number> {
	if (orphans.length === 0) return 0;
	const orphanSignatures = new Set(orphans.map((entry) => JSON.stringify(entry)));
	return withTransaction(async () => {
		const rows = (await sql.unsafe(
			`SELECT relation FROM "${table}" WHERE section_tipo = $1 AND section_id = $2 FOR UPDATE`,
			[sectionTipo, sectionId],
		)) as { relation: Record<string, unknown> | null }[];
		const relation = rows[0]?.relation;
		if (relation === null || relation === undefined || typeof relation !== 'object') return 0;

		let removed = 0;
		const writes: MatrixKeyWrite[] = [];
		for (const [componentTipo, entries] of Object.entries(relation)) {
			if (!Array.isArray(entries)) continue;
			const kept = entries.filter((entry) => {
				const isOrphan =
					entry !== null &&
					typeof entry === 'object' &&
					orphanSignatures.has(JSON.stringify(entry));
				if (isOrphan) removed++;
				return !isOrphan;
			});
			if (kept.length === entries.length) continue; // key untouched
			writes.push({
				column: 'relation',
				key: componentTipo,
				value: kept.length > 0 ? kept : null, // null ⇒ delete_key (PHP end state)
			});
		}
		if (writes.length > 0) {
			await updateMatrixKeysData(table, sectionTipo, sectionId, writes);
		}
		return removed;
	});
}

// ---------------------------------------------------------------------------
// INLINE id_key VALUE API (PHP trait.dataframe_common.php :833-960) — the
// dataframe contract applied to INLINE VALUE ITEMS of a non-locator
// component (e.g. the relation sibling-order component_number): every value
// item pairs with ONE item of its main component by id_key. On the value
// side the pairing key is the item's own `id` (set EQUAL to id_key, never
// auto-allocated — PHP add_value_by_id_key :872); frame LOCATORS carry the
// separate `id_key` field. These are pure array functions; callers persist
// the returned arrays themselves. MUST NOT be used on component_dataframe
// slots (they store locators, not inline items — PHP :802 guard).
// ---------------------------------------------------------------------------

/** Inline items paired with the given main item id (PHP get_data_by_id_key :833). */
export function getInlineDataByIdKey(
	items: readonly { id?: number | string }[],
	idKey: number,
): { id?: number | string }[] {
	return items.filter((item) => item.id !== undefined && Number(item.id) === idKey);
}

/**
 * Append a new inline value item paired by id_key (PHP add_value_by_id_key
 * :864): the item's `id` is set to id_key DIRECTLY — the pairing contract
 * requires the value item's id to equal the parent-link locator's item id.
 */
export function addInlineValueByIdKey(
	items: readonly unknown[],
	value: unknown,
	idKey: number,
): unknown[] {
	return [...items, { value, id: idKey }];
}

/** Remove every inline item paired with id_key (PHP remove_by_id_key :887). */
export function removeInlineByIdKey<T extends { id?: number | string }>(
	items: readonly T[],
	idKey: number,
): T[] {
	// Generic in the item shape so callers get back exactly what they passed
	// (the paired `value`, dataframe fields, etc. survive) — this is a pure
	// filter, so it never rewrites items.
	return items.filter((item) => !(item.id !== undefined && Number(item.id) === idKey));
}

/** The first paired inline item's value (PHP get_value_by_id_key). */
export function getInlineValueByIdKey(
	items: readonly { id?: number | string; value?: unknown }[],
	idKey: number,
): unknown {
	const matched = getInlineDataByIdKey(items, idKey) as { value?: unknown }[];
	return matched[0]?.value ?? null;
}

/**
 * Replace the paired inline item's value (PHP update_value_by_id_key):
 * updates the first match in place; no match appends a fresh paired item.
 */
export function updateInlineValueByIdKey(
	items: readonly { id?: number | string; value?: unknown }[],
	value: unknown,
	idKey: number,
): unknown[] {
	let updated = false;
	const result = items.map((item) => {
		if (!updated && item.id !== undefined && Number(item.id) === idKey) {
			updated = true;
			return { ...item, value };
		}
		return item;
	});
	return updated ? result : addInlineValueByIdKey(items, value, idKey);
}
