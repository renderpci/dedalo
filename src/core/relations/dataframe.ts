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

import { dataframePairingOf } from '../concepts/rqo.ts';
import {
	dataframeEntriesEqual,
	dataframeEntryMatches,
	normalizeDataframeEntry,
} from '../concepts/subdatum.ts';
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
 * Algorithm:
 * 1. siblings = every stored entry NOT matching this caller context —
 *    unconditionally preserved;
 * 2. every incoming entry is NORMALIZED to the persisted-frame contract
 *    (normalizeDataframeEntry: forced dd490 + server-authoritative
 *    from/main/id_key, string section_id, transients and legacy keys
 *    stripped);
 * 3. additions = normalized entries that are not already present — compared
 *    by test_equal_properties IDENTITY against both the siblings and the
 *    additions accepted so far, so passing the full slot array is harmless
 *    and a double-submit collapses;
 * 4. merged = siblings + additions; empty merges normalise to null.
 *
 * Steps 2 and 3 are DEFENCE IN DEPTH: with the save path now routing through
 * validateRelationInsert, entries arrive here already normalized and deduped.
 * They are repeated because this function is the last gate before the column
 * is written, and the previous version — which stamped only entries that
 * ALREADY looked like frames, and deduped on a full JSON signature — is what
 * let unreadable, duplicated frames reach a live record. A normalizer that
 * only fixes already-correct input is not a normalizer.
 */
export function mergeCallerEntries(
	fullSlotData: Record<string, unknown>[],
	incoming: Record<string, unknown>[],
	caller: DataframeCaller,
	frameTipo: string,
): Record<string, unknown>[] | null {
	// ONE validity rule, shared with the read and save doors (rqo.ts). Three
	// slightly different local rules is what let a frame slip through the gaps
	// between them and land unreadable.
	const pairing = dataframePairingOf(caller);
	if (pairing === null) {
		// No usable pairing: there is nothing to scope the merge TO, so the only
		// safe answer is to leave the slot exactly as it is. Writing the incoming
		// entries would either clobber every item's frames (no caller subset to
		// replace) or store entries with no pairing key — both worse than a
		// no-op. The save door refuses this case outright; this is the backstop
		// for any other caller.
		return fullSlotData.length === 0 ? null : [...fullSlotData];
	}
	const { main_component_tipo: mainComponentTipo, id_key: idKey } = pairing;
	const siblings = fullSlotData.filter(
		(entry) => !dataframeEntryMatches(entry, mainComponentTipo, idKey, frameTipo),
	);

	const additions: Record<string, unknown>[] = [];
	for (const entry of incoming) {
		const candidate = normalizeDataframeEntry(entry, { frameTipo, mainComponentTipo, idKey });
		// Compared against the siblings AND the additions accepted so far. The
		// sibling half cannot fire today (anything equal to a normalized
		// candidate was filtered out above) and is kept as a cheap guard against
		// a future filter change silently re-admitting duplicates.
		const duplicate =
			siblings.some((sibling) => dataframeEntriesEqual(sibling, candidate)) ||
			additions.some((accepted) => dataframeEntriesEqual(accepted, candidate));
		if (!duplicate) additions.push(candidate);
	}

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
