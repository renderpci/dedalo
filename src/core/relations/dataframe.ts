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
import { canonicalizeStoredSectionId } from '../concepts/section_id.ts';
import {
	dataframeEntriesEqual,
	dataframeEntryMatches,
	normalizeDataframeEntry,
} from '../concepts/subdatum.ts';
import { type MatrixKeyWrite, updateMatrixKeysData } from '../db/matrix_write.ts';
import { isInTransaction, registerCommitAction, sql, withTransaction } from '../db/postgres.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import { getNode } from '../ontology/resolver.ts';

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

/**
 * DELETE POLICY of a dataframe SLOT (2026-09-06,
 * WC-2026-09-06-dataframe-delete-policy-on-slot). What happens to a frame's
 * TARGET record when its pairing locator leaves the slot — on EITHER door:
 * the main-item cascade (removeDataframeDataById) and the direct frame
 * removal (the dataframe modal's Delete button → `action:'remove'` on the
 * slot itself).
 *
 * The policy is a fact about the SLOT and its target section (a frame-private
 * `rsc1242` rating is meaningless unlinked; a shared target is not), so it is
 * read from the slot node's properties, never from the main's — a main with
 * two frames may want two answers. Until this entry the engine read
 * `dataframe.delete_policy` from the MAIN node, which no shipped node ever
 * carried, while the docs, the resolver tripline and the 59 legacy nodes all
 * put it on the slot.
 *
 * - `unlink`               — locators leave; the target survives (default).
 * - `delete_target`        — soft: deleteSectionData, row kept, components
 *                            emptied, recoverable from Time Machine.
 * - `delete_target_record` — hard: deleteSectionRecord, Time Machine snapshot
 *                            then the row is removed (the v6 intent).
 *
 * `properties.hard_delete: true` — the v6 spelling, carried by 59 slot nodes
 * of the numisdata ontology and inert since v6 (its only reader was a
 * commented-out client branch) — IS the hard policy. The ontology is not
 * rewritten to a new key: the nodes finally mean what their authors wrote.
 * It wins over a conflicting `delete_policy`. Anything else is `unlink`
 * (fail-safe: an unknown spelling never destroys data).
 */
export type DataframeDeletePolicy = 'unlink' | 'delete_target' | 'delete_target_record';

export function dataframeDeletePolicyOf(slotProperties: unknown): DataframeDeletePolicy {
	if (slotProperties === null || typeof slotProperties !== 'object') return 'unlink';
	const properties = slotProperties as {
		hard_delete?: unknown;
		dataframe?: { delete_policy?: unknown } | null;
	};
	if (properties.hard_delete === true) return 'delete_target_record';
	const policy = properties.dataframe?.delete_policy;
	if (policy === 'delete_target' || policy === 'delete_target_record') return policy;
	return 'unlink';
}

/** A frame target lifted from a stored slot entry, its id in canonical (int) form. */
export interface DataframeTarget {
	section_tipo: string;
	section_id: number;
}

/**
 * The targets of the given slot entries. An entry without an address, or whose
 * stored id is not a record address (an unswept legacy string that does not
 * convert, an external id), OWNS no record: it is left alone under every
 * policy and SAID so — a destructive policy that silently passed over an
 * entry would be the narrowing the project forbids.
 */
export function dataframeTargetsOf(entries: readonly unknown[]): DataframeTarget[] {
	const targets: DataframeTarget[] = [];
	for (const entry of entries) {
		if (entry === null || typeof entry !== 'object') continue;
		const { section_tipo, section_id } = entry as { section_tipo?: unknown; section_id?: unknown };
		const id = canonicalizeStoredSectionId(section_id);
		if (typeof section_tipo !== 'string' || typeof id !== 'number') {
			console.error(
				`dataframeTargetsOf: frame entry ${JSON.stringify(entry)} names no record address — left alone under every delete policy`,
			);
			continue;
		}
		targets.push({ section_tipo, section_id: id });
	}
	return targets;
}

/**
 * Apply a slot's delete policy to the targets its removed entries addressed.
 *
 * WHEN IT RUNS — after the unlink is COMMITTED, never before. Both doors call
 * this from inside an ambient transaction (the component save, the portal
 * unlink, the whole-record delete), and a target delete is not a statement
 * that can share that transaction: `deleteSectionRecord` snapshots, rewrites
 * every other holder, removes the row, then moves media files and settles the
 * diffusion unpublish — the last two are irreversible and run "post-commit"
 * only when the delete owns its transaction. Run inline inside the save's
 * transaction they would happen BEFORE the save committed, and a later
 * failure of the same save would roll the row and the locator back while the
 * files sat under `deleted/` and the public tier had forgotten the record.
 * So inside an ambient transaction the deletes are queued on the COMMIT-ONLY
 * lane (registerCommitAction): they run after COMMIT, with no ambient
 * transaction, each delete opening its own — and on ROLLBACK the queue is
 * discarded, so a target is never deleted while a locator still points at it.
 * With no ambient transaction (a script, a test) they run right here.
 *
 * FAILURE POSTURE. The write grant on every target section is asked BEFORE
 * queueing (assertFrameTargetWriteGrant) and refuses the whole request. A
 * target whose delete still fails after commit (infrastructure, a refusal
 * deep inside the delete engine) is logged and the loop continues (PHP
 * remove_dataframe_data_by_id): the unlink has already been committed, so
 * what remains is an orphan target — survivable, reclaimable by maintenance —
 * never a dangling locator and never a poisoned transaction. The wire cannot
 * carry that failure: the response envelope was built by then, so the client
 * grammar is "unlinked; the target's deletion follows the commit".
 */
export async function applyDataframeDeletePolicy(
	policy: DataframeDeletePolicy,
	targets: readonly DataframeTarget[],
	userId: number,
): Promise<void> {
	if (policy === 'unlink' || targets.length === 0) return;
	await assertFrameTargetWriteGrant(policy, targets, userId);
	const run = (): Promise<void> => deleteDataframeTargets(policy, targets, userId);
	if (isInTransaction() && registerCommitAction(run)) return;
	await run();
}

/**
 * THE WRITE GRANT ON THE TARGET SECTION (2026-09-21). Every door that reaches
 * this applier was authorized on the HOST — the slot component's level, or
 * the host section's — and no request names the frame target's section, so
 * without this check a curator holding level 1 (read-only) on the frame
 * section would delete its records through the modal's Delete button. Same
 * shape as the duplicate door's re-mint (duplicate_record.ts): the level on
 * the target section is asked, and refused rather than downgraded or skipped
 * — a refused unlink is recoverable, a record deleted in a section the
 * curator cannot write is not. Asked BEFORE anything is queued and inside the
 * caller's transaction, so the refusal rolls the unlink back with it and the
 * wire answers `perm.denied`; the superuser resolves to level 3.
 */
async function assertFrameTargetWriteGrant(
	policy: DataframeDeletePolicy,
	targets: readonly DataframeTarget[],
	userId: number,
): Promise<void> {
	// CONVENTIONS §2 rationale 1 (cycle): security/permissions.ts reaches the
	// resolver and the matrix, which the relation family sits above.
	const { getSectionPermissions, resolvePrincipal } = await import('../security/permissions.ts');
	const principal = await resolvePrincipal(userId);
	for (const sectionTipo of new Set(targets.map((target) => target.section_tipo))) {
		if ((await getSectionPermissions(principal, sectionTipo)) < 2) {
			throw new DedaloError('perm.denied', {
				message:
					`dataframe delete policy '${policy}': user ${userId} holds no write grant ` +
					`(level 2) on the frame target section '${sectionTipo}' — the frame is not unlinked`,
				coordinates: {
					target_section_tipo: sectionTipo,
					required: 2,
					operation: policy,
				},
			});
		}
	}
}

/** The deletes themselves — one owned transaction per target, log-and-continue. */
async function deleteDataframeTargets(
	policy: DataframeDeletePolicy,
	targets: readonly DataframeTarget[],
	userId: number,
): Promise<void> {
	// CONVENTIONS §2 rationale 1 (cycle): delete_record.ts reaches
	// relations/save.ts (removeDataframeDataById), which imports this module.
	const { deleteSectionData, deleteSectionRecord } = await import(
		'../section/record/delete_record.ts'
	);
	for (const target of targets) {
		try {
			// Both primitives are called BY NAME: the dd128 write census derives
			// its door list from the call spelling, and a door hidden behind a
			// variable is a door the census cannot judge.
			if (policy === 'delete_target_record') {
				await deleteSectionRecord(target.section_tipo, target.section_id, userId);
			} else {
				await deleteSectionData(target.section_tipo, target.section_id, userId);
			}
		} catch (error) {
			console.error(
				`applyDataframeDeletePolicy: ${policy} failed for ${target.section_tipo}/${String(target.section_id)} — the target survives as an orphan:`,
				error,
			);
		}
	}
}

/**
 * THE WHOLE-RECORD DOOR: when a record is deleted outright, every dataframe
 * slot it carried loses its frames with the row — and each slot's policy
 * still applies to the targets those frames addressed (a `hard_delete`
 * rating slot must not orphan its ratings because the curator deleted the
 * coin instead of the valuation). Called by deleteSectionRecord with the
 * snapshot's `relation` bag, inside its transaction; the deletes queue on the
 * commit lane like every other door.
 */
export async function applyOwnFramePolicies(relationBag: unknown, userId: number): Promise<void> {
	if (relationBag === null || typeof relationBag !== 'object') return;
	for (const [slotTipo, entries] of Object.entries(relationBag as Record<string, unknown>)) {
		if (!Array.isArray(entries) || entries.length === 0) continue;
		const node = await getNode(slotTipo);
		if (node?.model !== 'component_dataframe') continue;
		const policy = dataframeDeletePolicyOf(node.properties);
		if (policy === 'unlink') continue;
		await applyDataframeDeletePolicy(policy, dataframeTargetsOf(entries), userId);
	}
}
