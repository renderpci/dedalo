/**
 * BULK REVERT — the RECORDS a run created or deleted (2026-09-27,
 * WC-…-bulk-revert-undo-log §2.5 steps 8-9; decisions D2 and D3).
 *
 * CASCADE-DELETED RECORDS (role 4, D3). A run that removed main items fired the
 * dataframe delete policy, which hard-deleted frame target records. Their
 * whole-record snapshot rides the run's bulk id, so the revert UNDELETES them
 * through the time machine's own undelete door (`restoreSection` — the row
 * and, from `deleted/`, the files), and reports each one `inexact`: the
 * delete's media move and diffusion unpublish are side effects the undelete
 * does not replay as they were (a later upload, a republish). A SOFT cascade
 * (delete_target) kept the row and wiped its data: the wiped keys are written
 * back into it (restoreWipedRecord) while the row is still as the wipe left
 * it, and — after COMMIT, as the missing-row undelete does — the files the
 * wipe moved into `deleted/` for its media keys are moved back; a key written since is left alone and the record reported
 * `cascade_delete_not_reverted` (`kept` — the record is there, so the unit
 * re-linking it still runs); a record already back as its snapshot says is a
 * no-op (`present` — a repeat revert). An address held by ANOTHER record
 * (born there since: the generation epoch) is NOT overwritten: `cascade_delete_not_reverted`, and its
 * re-linking unit is refused.
 * COUPLED TO THE UNIT THAT RE-LINKS IT. A target is undeleted INSIDE the
 * transaction of the unit whose restore image references it (the slot whose
 * frame addressed it, the portal whose locator the delete stripped), right
 * before that unit's keys — so a unit refused for any reason rolls its
 * undelete back and the target stays deleted (never an orphan no frame
 * references), and a target that cannot come back refuses the unit (never a
 * frame restored onto a missing or foreign record). A unit whose OWN record is
 * the deleted one (a revert's D2 delete, reverted in turn) takes that marker
 * too. The record-scope search runs over existing rows, so it cannot answer
 * for a row that is not there: a REFERENCING unit's gate stands for the
 * target's scope; otherwise (the unit's own record, a marker no unit takes)
 * the scope is judged on the RESTORED row, inside the undelete's transaction,
 * and a record out of scope is rolled back. Markers of one record are undone
 * newest first (LIFO).
 * Each undelete of a missing row is ONE transaction: the insert-only row
 * restore (an address taken since is never overwritten) and a BIRTH marker
 * under the revert's bulk id carrying the restored record as its image, so
 * reverting the revert deletes it again — never one without the other.
 *
 * RECORDS BORN IN THE RUN (role 3, D2). Deleted through the delete door — its
 * own snapshot keeps the record recoverable from dd15 — only when EVERY one of:
 *   - every unit of that record reverted cleanly (a skipped key may still hold
 *     the run's data, and deleting would take it away unreviewed);
 *   - no key — the run's own included, whose clean revert put them back at
 *     their pre-run value — holds a value other than its BIRTH value (the
 *     marker's image: the defaults the INSERT carried, or the snapshot an
 *     undelete restored) — else someone else wrote to the record after it was
 *     born (a later translation of a run key included), and it is no longer
 *     the run's alone;
 *   - nothing references it (an inverse locator is someone's link; the delete
 *     would strip it from their record);
 *   - the caller may delete in its section and scope.
 * Otherwise the empty shell stays and is reported `created_record_kept`.
 * Born records can reference each other (a run that imports a record and a
 * portal pointing at it), so the pass repeats until no more can go. Each
 * delete goes through the delete door UNDER THE REVERT'S BULK ID, so the door
 * writes the role-4 twin itself — in its own transaction, from the snapshot it
 * read under its lock, with its own stamp — and every nested cascade it runs
 * carries the revert's id too: reverting the revert undeletes all of it.
 *
 * KNOWN WINDOW: the checks read committed state and the delete door opens its
 * own transaction (its media and diffusion halves must run after COMMIT, so it
 * cannot join one of ours). A reference created in between is stripped by the
 * delete like any delete strips one — under the revert's bulk id, so the
 * revert of the revert puts it back.
 */

import { canonicalJson } from '../../../src/core/concepts/canonical_json.ts';
import { regionOf, restoreRegion } from '../../../src/core/concepts/lang_region.ts';
import { compareLocators } from '../../../src/core/concepts/locator.ts';
import { dbTimestamp } from '../../../src/core/db/db_timestamp.ts';
import {
	MATRIX_JSONB_COLUMNS,
	type MatrixJsonbColumn,
	readMatrixRecord,
} from '../../../src/core/db/matrix.ts';
import {
	absorbComponentItemIds,
	readMatrixKeyForUpdate,
} from '../../../src/core/db/matrix_write.ts';
import { isInTransaction, withTransaction } from '../../../src/core/db/postgres.ts';
import { recordEpoch } from '../../../src/core/db/record_generation.ts';
import { decodeTmImage, recordBulkBirth, TM_ROLE } from '../../../src/core/db/time_machine.ts';
import { getMatrixTableFromTipo, getModelByTipo } from '../../../src/core/ontology/resolver.ts';
import {
	historyMainsOf,
	isOwnFrame,
	mainIdentity,
	readKeyImage,
	readMainSlots,
	readMainState,
	recordMainHistory,
	type SlotImages,
	splitComposed,
} from '../../../src/core/relations/dataframe_slots.ts';
import { reindexRelationSearchLikeSave } from '../../../src/core/relations/save.ts';
import { countInverseReferences } from '../../../src/core/search/search_related.ts';
import {
	CREATED_BY_USER,
	CREATED_DATE,
	MODIFIED_BY_USER,
	MODIFIED_DATE,
} from '../../../src/core/section/record/create_record.ts';
import {
	deleteSectionRecord,
	wipedComponentValue,
} from '../../../src/core/section/record/delete_record.ts';
import { isLangSlicedModel } from '../../../src/core/section/record/save_component.ts';
import { persistRecordKeys } from '../../../src/core/section_record/index.ts';
import { getSectionPermissions, type Principal } from '../../../src/core/security/permissions.ts';
import { principalCanAccessRecord } from '../../../src/core/security/record_scope.ts';
import { revokeDeletedAccountAccess } from '../../../src/core/security/revocation.ts';
import type { RecordMarker, RevertKey, RevertUnit, RunRow } from './bulk_revert_plan.ts';
import { recordAddress, runOwnsRecordStamps } from './bulk_revert_plan.ts';
import { propagateRestoreToObservers } from './restore_common.ts';
import { restoreAbsentSectionRow, restoreSectionMedia } from './tool_time_machine.ts';

/** Record-level metadata keys every record carries from birth — never "someone else's value". */
const RECORD_METADATA_KEYS: ReadonlySet<string> = new Set([
	CREATED_BY_USER,
	CREATED_DATE,
	MODIFIED_BY_USER,
	MODIFIED_DATE,
]);

/** Columns that hold record metadata or counters, not component values. */
const METADATA_COLUMNS: ReadonlySet<string> = new Set(['data', 'meta', 'relation_search']);

/** What happened to one record marker — the orchestrator maps it onto the report. */
export type RecordOutcome =
	| {
			kind: 'done';
			/**
			 * The post-COMMIT half of a landed undelete (the files moved into
			 * `deleted/`; for a SOFT cascade, the observer cascade of the keys
			 * put back), when the row half ran inside a unit's transaction;
			 * absent when there is nothing left to do.
			 */
			afterCommit?: () => Promise<void>;
	  }
	/**
	 * The SAME record (birth identity) already holds the snapshot's values:
	 * nothing written — a repeat revert, or a record an earlier revert already
	 * brought back. Neither inexact nor a RECOVER.
	 */
	| { kind: 'present' }
	/**
	 * The SAME record holds the address, but a key was written after the wipe
	 * (or after an earlier undelete brought it back): nothing written, reported
	 * `cascade_delete_not_reverted` at the record. The record is neither
	 * missing nor foreign, so a unit re-linking it is NOT refused.
	 */
	| { kind: 'kept' }
	| { kind: 'out_of_scope' }
	| { kind: 'refused'; reason: 'created_record_kept' | 'cascade_delete_not_reverted' };

/** A born record's D2 outcome: a RecordOutcome, or the delete door THREW for it. */
export type BornOutcome =
	| RecordOutcome
	/** `located`: the record's scope gate had passed before the throw (SEC-16). */
	| { kind: 'failed'; detail: string; located: boolean };

export interface RecordContext {
	principal: Principal;
	userId: number;
	newBulkId: number;
	/**
	 * `keyAddress` of every component key the run wrote (RunPlan.keyAddresses):
	 * a record whose MODIFIED stamps the run owns is never stamped by a write
	 * here (runOwnsRecordStamps). Absent = the run owns none.
	 */
	keyAddresses?: ReadonlySet<string>;
}

/** Section-level write (the delete door's level) AND the record in scope. */
async function mayRewriteRecord(marker: RecordMarker, principal: Principal): Promise<boolean> {
	return (
		(await getSectionPermissions(principal, marker.sectionTipo)) >= 2 &&
		(await principalCanAccessRecord(marker.sectionTipo, marker.sectionId, principal))
	);
}

/**
 * The gate of an undelete, BEFORE it writes. Section-level write always. The
 * RECORD scope is the record's own when its row exists (a soft wipe kept it).
 * For a MISSING row the scope search has nothing to find, so the record scope
 * is decided AFTER the row is restored, on the restored row, inside the
 * undelete's transaction (restoreDeletedRecord) — the projects filter the
 * snapshot carries, judged by the one search predicate, never a copy of it.
 */
async function mayUndelete(
	marker: RecordMarker,
	principal: Principal,
	rowExists: boolean,
): Promise<boolean> {
	if ((await getSectionPermissions(principal, marker.sectionTipo)) < 2) return false;
	if (rowExists) return principalCanAccessRecord(marker.sectionTipo, marker.sectionId, principal);
	return true;
}

/**
 * Undelete one record the run's cascade deleted (D3). `authorizedByUnit`: the
 * call runs INSIDE the transaction of a unit that passed its scope gate and
 * re-links this record by REFERENCE (see the header) — that gate stands for the
 * missing record's scope. Otherwise (a standalone marker, or the unit's OWN
 * record) the restored row's scope is checked before the transaction commits.
 * Inside a unit's transaction the row half joins it and the file half is
 * handed back as `afterCommit`; standalone, the whole undelete runs now.
 */
export async function undeleteCascadeRecord(
	marker: RecordMarker,
	context: RecordContext,
	authorizedByUnit = false,
): Promise<RecordOutcome> {
	const table = await getMatrixTableFromTipo(marker.sectionTipo);
	const snapshot = decodeTmImage(marker.row.data, marker.row.data_absent);
	const live =
		table === null ? null : await readMatrixRecord(table, marker.sectionTipo, marker.sectionId);
	if (!(await mayUndelete(marker, context.principal, live !== null))) {
		return { kind: 'out_of_scope' };
	}
	if (table === null || snapshot === null || typeof snapshot !== 'object') {
		return { kind: 'refused', reason: 'cascade_delete_not_reverted' };
	}
	if (live !== null) {
		// The row is there: a SOFT cascade (delete_target) wiped it, or the address
		// was taken again. restoreWipedRecord tells the two apart.
		return restoreWipedRecord(marker, table, snapshot as Record<string, unknown>, context);
	}
	return restoreDeletedRecord(marker, snapshot, context, authorizedByUnit);
}

/** Thrown inside an undelete's transaction to roll back a row the caller may not see. */
class UndeleteOutOfScope extends Error {}

/**
 * The MISSING-row undelete, ONE transaction: the row (insert-only — an address
 * taken since the unlocked read is never overwritten, it refuses
 * `cascade_delete_not_reverted`), the record-scope check on the restored row
 * (unless a unit's gate stands for it), and the BIRTH marker under the
 * revert's bulk id — so the row and its marker land together or not at all (a
 * row back without its marker could never be deleted again by reverting the
 * revert). Inside a unit's transaction all of it joins that one, and a scope
 * refusal refuses the unit, which rolls the row back with it.
 */
async function restoreDeletedRecord(
	marker: RecordMarker,
	snapshot: unknown,
	context: RecordContext,
	authorizedByUnit: boolean,
): Promise<RecordOutcome> {
	let columns: Awaited<ReturnType<typeof restoreAbsentSectionRow>>;
	try {
		columns = await withTransaction(async () => {
			// VERBATIM (no dd197/dd201 stamp): the snapshot carries its own stamps,
			// and the run's stamp units compare against them — a "now" stamp here
			// refused every one `changed_since_run` (a revert of a revert inexact).
			const restored = await restoreAbsentSectionRow(
				snapshot,
				marker.row.id,
				marker.sectionTipo,
				marker.sectionId,
				null,
			);
			if (restored === null) return null;
			if (
				!authorizedByUnit &&
				!(await principalCanAccessRecord(marker.sectionTipo, marker.sectionId, context.principal))
			) {
				throw new UndeleteOutOfScope();
			}
			await recordBulkBirth({
				sectionTipo: marker.sectionTipo,
				sectionId: marker.sectionId,
				userId: context.userId,
				bulkId: context.newBulkId,
				image: restored as Record<string, unknown>,
			});
			return restored;
		});
	} catch (error) {
		if (error instanceof UndeleteOutOfScope) return { kind: 'out_of_scope' };
		throw error;
	}
	if (columns === null) return { kind: 'refused', reason: 'cascade_delete_not_reverted' };
	const restoredColumns = columns;
	const media = () => restoreSectionMedia(marker.sectionTipo, marker.sectionId, restoredColumns);
	if (isInTransaction()) return { kind: 'done', afterCommit: media };
	await media();
	return { kind: 'done' };
}

/** Whether a marker is the record of the unit itself (not one it references). */
export function isOwnRecord(unit: RevertUnit, marker: RecordMarker): boolean {
	return marker.sectionTipo === unit.sectionTipo && marker.sectionId === unit.sectionId;
}

/** Whether a value holds a locator (or frame) addressing the record. */
function referencesRecord(value: unknown, sectionTipo: string, sectionId: number): boolean {
	if (!Array.isArray(value)) return false;
	return value.some(
		(item) =>
			item !== null &&
			typeof item === 'object' &&
			compareLocators(
				item as Parameters<typeof compareLocators>[0],
				{ section_tipo: sectionTipo, section_id: sectionId },
				['section_tipo', 'section_id'],
			),
	);
}

/**
 * The cascade markers each unit RE-LINKS: those whose record a restore image of
 * the unit references — a BEFORE image of an exact key (what the revert writes
 * back), every row of a legacy key — AND the unit's OWN record's: a record a
 * revert deleted (D2) carries that revert's pairs on its own keys, and those
 * keys cannot be restored onto a row that is not there, nor gated on the scope
 * of a record the search cannot find; the unit undeletes it first and judges
 * its scope on the restored row.
 *
 * NESTED CASCADES (`children`). Deleting a target T under the run's bulk id runs
 * T's OWN frame policies with the same id, which delete T's frame targets T2
 * and write a role-4 marker for T2. No unit image references T2 — only T's
 * snapshot does — so T2 is a CHILD of T: undeleted only WITH T, right after it,
 * in T's transaction, and T refuses when T2 cannot come back (never T's
 * restored frames pointing at a missing T2), while T2 never comes back without
 * T (never an orphan nothing references). Recursive: T2's own children follow
 * it. A marker a unit image references directly stays that unit's (the unit is
 * what links it). Markers neither a unit nor another marker's snapshot takes
 * are returned apart (`standalone`), each the root of its own group — as is
 * the newest of a set that only reference each other.
 *
 * All lists newest first (LIFO).
 */
export function assignCascadeMarkers(
	units: readonly RevertUnit[],
	markers: readonly RecordMarker[],
): {
	byUnit: Map<RevertUnit, RecordMarker[]>;
	standalone: RecordMarker[];
	children: Map<RecordMarker, RecordMarker[]>;
} {
	const newestFirst = [...markers].sort((a, b) => b.row.id - a.row.id);
	const byUnit = new Map<RevertUnit, RecordMarker[]>();
	const owned = new Set<RecordMarker>();
	for (const unit of units) {
		const images = unit.keys.flatMap((key) =>
			key.rows
				.filter((row) => !key.exact || row.tm_role === TM_ROLE.before)
				.map((row) => referenceImage(unit, key, row)),
		);
		const mine = newestFirst.filter(
			(marker) =>
				isOwnRecord(unit, marker) ||
				images.some((image) => referencesRecord(image, marker.sectionTipo, marker.sectionId)),
		);
		if (mine.length === 0) continue;
		byUnit.set(unit, mine);
		for (const marker of mine) owned.add(marker);
	}
	const { children, roots } = nestCascadeMarkers(newestFirst, owned);
	return { byUnit, standalone: roots, children };
}

/**
 * What a restore image of the unit REFERENCES. A COMPOSED row carries the FULL
 * content of every slot of its main — other mains' frames in a shared slot
 * included — but the composed revert neither restores nor checks those
 * (decision D-A, `isOwnFrame`): they are the other main's unit's. So a composed
 * row references through its main part and its OWN frames only; a record
 * addressed by another main's frame is that main's unit's to re-link. Any other
 * unit's row references through its whole image.
 */
function referenceImage(unit: RevertUnit, key: RevertKey, row: RunRow): unknown {
	const mainTipo = unit.composed?.mainTipo;
	if (mainTipo === undefined || mainTipo !== key.tipo) return row.data;
	const { main, frames } = splitComposed(row.data);
	const items = Array.isArray(main) ? main : []; // only a list can hold a locator
	return [...items, ...frames.filter((frame) => isOwnFrame(frame, mainTipo))];
}

/**
 * Hang every marker no unit owns under the marker whose SNAPSHOT references
 * its record (see assignCascadeMarkers), starting from the unit-owned ones.
 * What no chain reaches becomes a root: first a marker no other free marker's
 * snapshot references, else (a reference cycle) the newest free one.
 */
function nestCascadeMarkers(
	newestFirst: readonly RecordMarker[],
	owned: ReadonlySet<RecordMarker>,
): { children: Map<RecordMarker, RecordMarker[]>; roots: RecordMarker[] } {
	const snapshots = new Map(newestFirst.map((marker) => [marker, snapshotValues(marker)]));
	const references = (parent: RecordMarker, child: RecordMarker): boolean =>
		!sameRecord(parent, child) &&
		(snapshots.get(parent) ?? []).some((value) =>
			referencesRecord(value, child.sectionTipo, child.sectionId),
		);
	const children = new Map<RecordMarker, RecordMarker[]>();
	const placed = new Set<RecordMarker>(owned);
	const adopt = (parent: RecordMarker): void => {
		const kids = newestFirst.filter((marker) => !placed.has(marker) && references(parent, marker));
		if (kids.length === 0) return;
		for (const kid of kids) placed.add(kid);
		children.set(parent, kids);
		for (const kid of kids) adopt(kid);
	};
	for (const marker of newestFirst) if (owned.has(marker)) adopt(marker);
	const roots: RecordMarker[] = [];
	for (;;) {
		const free = newestFirst.filter((marker) => !placed.has(marker));
		if (free.length === 0) break;
		const root =
			free.find((marker) => !free.some((other) => other !== marker && references(other, marker))) ??
			(free[0] as RecordMarker);
		placed.add(root);
		roots.push(root);
		adopt(root);
	}
	roots.sort((a, b) => b.row.id - a.row.id);
	return { children, roots };
}

/** Every component value of a marker's whole-record snapshot (metadata columns aside). */
function snapshotValues(marker: RecordMarker): unknown[] {
	const snapshot = decodeTmImage(marker.row.data, marker.row.data_absent);
	if (snapshot === null || typeof snapshot !== 'object') return [];
	const values: unknown[] = [];
	for (const column of MATRIX_JSONB_COLUMNS) {
		if (METADATA_COLUMNS.has(column)) continue;
		const bag = (snapshot as Record<string, unknown>)[column];
		if (bag !== null && typeof bag === 'object') values.push(...Object.values(bag));
	}
	return values;
}

/** Whether two markers are of the same record address. */
function sameRecord(a: RecordMarker, b: RecordMarker): boolean {
	return a.sectionTipo === b.sectionTipo && a.sectionId === b.sectionId;
}

/**
 * A marker's CASCADE GROUP: itself, then its nested children, each before its
 * own (parent first — the order an undelete must follow, and the order a
 * group lands or rolls back in, together).
 */
export function cascadeGroup(
	marker: RecordMarker,
	children: ReadonlyMap<RecordMarker, readonly RecordMarker[]>,
): RecordMarker[] {
	const group: RecordMarker[] = [marker];
	for (const child of children.get(marker) ?? []) group.push(...cascadeGroup(child, children));
	return group;
}

/** One key a soft-cascade restore writes back. */
interface WipedKey {
	column: MatrixJsonbColumn;
	tipo: string;
	model: string;
	/** The live (wiped) value; `undefined` = absent. */
	live: unknown;
	/** The pre-wipe value; `undefined` = absent. */
	value: unknown;
}

/**
 * Whether the record living at the marker's address now was BORN AFTER the
 * delete snapshot — the address taken again. Judged by the generation epoch
 * (record_generation.ts, the P0-14 discriminator): only a create at an explicit
 * id can reuse an address, and that door opens an epoch above every row the
 * dead record left; the revert's own undelete (insertMatrixRecordIfAbsent)
 * opens none. NOT `data.created_date` + `created_by_user_id`: both are
 * rewritable (the CSV importer's dd199/dd200 columns, a revert's metadata twin)
 * and one-second coarse, so they both forged "same" and faked "foreign"
 * (2026-09-27 review finding).
 */
async function isRebornSince(marker: RecordMarker): Promise<boolean> {
	return (await recordEpoch(marker.sectionTipo, marker.sectionId)) > marker.row.id;
}

/** The value of one key of a column bag (`undefined` = absent). */
function keyOf(columns: Record<string, unknown>, column: string, tipo: string): unknown {
	const bag = columns[column];
	return bag !== null && typeof bag === 'object'
		? (bag as Record<string, unknown>)[tipo]
		: undefined;
}

/** Whether a live key is still in the state the wipe left it (wipedComponentValue). */
function isWipedState(live: unknown, model: string, tipo: string): boolean {
	if (isEmptyValue(live)) return true;
	const wiped = wipedComponentValue(model, tipo);
	return wiped !== null && canonicalJson(live) === canonicalJson(wiped);
}

/**
 * What stands between a live row of the SAME record (the caller checked the
 * generation) and its snapshot: the wiped keys to put back, and whether a
 * key holds a value neither the snapshot nor the wipe left (`written`: a write
 * after the wipe, or after an earlier undelete brought the record back).
 */
async function wipedKeysOf(
	snapshot: Record<string, unknown>,
	live: Record<string, unknown>,
): Promise<{ keys: WipedKey[]; written: boolean }> {
	const keys: WipedKey[] = [];
	for (const column of MATRIX_JSONB_COLUMNS) {
		if (METADATA_COLUMNS.has(column)) continue;
		const tipos = new Set([
			...Object.keys((snapshot[column] as object | null) ?? {}),
			...Object.keys((live[column] as object | null) ?? {}),
		]);
		for (const tipo of tipos) {
			if (RECORD_METADATA_KEYS.has(tipo)) continue;
			const value = keyOf(snapshot, column, tipo);
			const liveValue = keyOf(live, column, tipo);
			if (canonicalJson(value) === canonicalJson(liveValue)) continue;
			const model = (await getModelByTipo(tipo)) ?? '';
			if (!isWipedState(liveValue, model, tipo)) return { keys, written: true };
			if (isEmptyValue(value)) continue; // nothing to bring back
			keys.push({ column, tipo, model, live: liveValue, value });
		}
	}
	return { keys, written: false };
}

/**
 * A wiped key's restored value as SEQUENTIAL per-language saves would leave it
 * (the shape the undo log's revert undoes, LIFO over the language regions):
 * each language's region is placed over the state the PREVIOUS language left,
 * never all over the one pre-write state — a lang-less orphan belongs to EVERY
 * language's region, so independent placements would all claim the same
 * orphans. An unsliced key, or a non-array value, is one whole-key step. The
 * undo PAIRS are not cut here: recordWipedHistory writes them, tagged by
 * mainIdentity (lg-nolan for every unsliced main whatever its ontology flag, a
 * translatable sliced main's data lang); deleteSectionData's own wipe row
 * takes its lane in recordWipeHistory.
 */
function wipedKeyState(key: WipedKey, sliced: boolean): unknown {
	if (!sliced || !Array.isArray(key.value)) return key.value;
	let state = key.live;
	// A key whose items name no language is one step over the lang-less region
	// (in every language's region, so the lane named here never changes it).
	for (const lang of itemLangs([key.live, key.value], 'lg-nolan')) {
		state = restoreRegion(state, lang, regionOf(key.value, lang, true), true);
	}
	return state;
}

/**
 * Write one wiped key back (its undo pairs are recordWipedHistory's). What is
 * written is the END state of the sequential steps (wipedKeyState) — the
 * pre-wipe items, with each language region placed as its own save would place
 * it — so the key and its pairs agree byte for byte.
 */
async function writeWipedKey(
	marker: RecordMarker,
	table: string,
	key: WipedKey,
	context: RecordContext,
): Promise<unknown> {
	const target = { table, sectionTipo: marker.sectionTipo, sectionId: marker.sectionId };
	const written = wipedKeyState(key, key.model !== '' && isLangSlicedModel(key.model));
	const ownsStamps = runOwnsRecordStamps(
		context.keyAddresses ?? new Set(),
		marker.sectionTipo,
		marker.sectionId,
	);
	await persistRecordKeys(
		target,
		[{ column: key.column, key: key.tipo, value: written }],
		ownsStamps ? false : { userId: context.userId },
	);
	const items = Array.isArray(written) ? written : [];
	// The save's relation_search law (the wipe removed the key's ancestors).
	await reindexRelationSearchLikeSave(table, marker.sectionTipo, marker.sectionId, key.tipo, items);
	await absorbComponentItemIds(table, marker.sectionTipo, marker.sectionId, key.tipo, items);
	return written;
}

const DATAFRAME_MODEL = 'component_dataframe';

/** One main whose history a soft-cascade restore records, with its state before the writes. */
interface WipedMain {
	tipo: string;
	/** The main's own wiped key, when the restore writes it. */
	key: WipedKey | null;
	/** The main's value and slots BEFORE any write (its pairs' BEFORE side). */
	before: { value: unknown; slots: SlotImages };
}

/**
 * The MAINS whose history the restore records (two lanes — a slot never gets a
 * pair of its own): every wiped non-slot key, and the main(s) each wiped SLOT
 * key belongs to (dataframe_slots.ts attributeSlotMains). Their state is read
 * BEFORE any write (each pair's BEFORE side).
 */
async function wipedMainsOf(
	marker: RecordMarker,
	table: string,
	keys: readonly WipedKey[],
): Promise<WipedMain[]> {
	const target = { table, sectionTipo: marker.sectionTipo, sectionId: marker.sectionId };
	const extras = new Map<string, string[]>();
	for (const key of keys) {
		if (key.model !== DATAFRAME_MODEL) {
			extras.set(key.tipo, extras.get(key.tipo) ?? []);
			continue;
		}
		const mains = await historyMainsOf(key.tipo, {
			before: key.live,
			after: key.value,
			callerMain: null,
			requestLang: 'lg-nolan',
			// Inverse of the wipe door (orphan 'skip'): frames no main owns come
			// back with the slot (writeWipedKey) and, like the wipe, record no history.
			orphan: 'skip',
		});
		for (const main of mains) extras.set(main.tipo, [...(extras.get(main.tipo) ?? []), key.tipo]);
	}
	const mains: WipedMain[] = [];
	for (const [tipo, slotExtras] of extras) {
		const own = keys.find((key) => key.tipo === tipo);
		const slots = await readMainSlots(target, tipo, slotExtras);
		const value = own !== undefined ? own.live : await mainValueNow(target, tipo);
		mains.push({ tipo, key: own ?? null, before: { value, slots } });
	}
	return mains;
}

/** A main's stored value now (its model's column), `undefined` when absent or unmapped. */
async function mainValueNow(
	target: { table: string; sectionTipo: string; sectionId: number },
	tipo: string,
): Promise<unknown> {
	const identity = await mainIdentity(tipo, 'lg-nolan');
	return readKeyImage(target, identity.column, identity.tipo);
}

/**
 * A wiped main's lane identity (mainIdentity). A key whose model the ontology
 * no longer resolves (`model` '') is recorded as one unsliced, non-translatable
 * value in the lg-nolan lane, where the wipe it undoes stood.
 */
async function wipedMainIdentity(main: WipedMain): Promise<{
	tipo: string;
	column: MatrixJsonbColumn;
	sliced: boolean;
	translatable: boolean;
	lang: string;
}> {
	if (main.key !== null && main.key.model === '') {
		const { tipo, column } = main.key;
		return { tipo, column, sliced: false, translatable: false, lang: 'lg-nolan' };
	}
	return mainIdentity(main.tipo, 'lg-nolan');
}

/**
 * The restore's undo pairs under the revert's bulk id, per MAIN, two lanes
 * (dataframe_slots.ts recordMainPairs): the lg-nolan pair (the lg-nolan value
 * + every slot's frames) FIRST, then one pair per language lane it put back,
 * each cut from the state the previous step left. The AFTER side is re-read
 * from the row.
 */
async function recordWipedHistory(
	marker: RecordMarker,
	table: string,
	mains: readonly WipedMain[],
	context: RecordContext,
): Promise<void> {
	const target = { table, sectionTipo: marker.sectionTipo, sectionId: marker.sectionId };
	const stamp = { userId: context.userId, timestamp: dbTimestamp(), bulkId: context.newBulkId };
	for (const main of mains) {
		const identity = await wipedMainIdentity(main);
		const after = await readMainState(target, identity, main.before.slots.slots);
		await recordMainHistory(target, identity, { before: main.before, after }, stamp);
	}
}

/**
 * The OBSERVER cascade of the wiped keys put back — the post-write obligation
 * a component save fires and the wipe itself fired (deleteSectionData), so a
 * mirror fed by a restored key recomputes instead of keeping the wipe's value.
 * POST-COMMIT (a cascade hop refuses to run inside a transaction): handed back
 * as the outcome's `afterCommit`, run by the orchestrator once the unit lands.
 */
function wipedKeysCascade(
	marker: RecordMarker,
	restored: readonly { key: WipedKey; written: unknown }[],
	userId: number,
): () => Promise<void> {
	return async () => {
		for (const { key, written } of restored) {
			await propagateRestoreToObservers(
				key.tipo,
				marker.sectionTipo,
				marker.sectionId,
				Array.isArray(key.live) ? key.live : [],
				written,
				userId,
			);
		}
	};
}

/**
 * The post-COMMIT half of a soft-cascade restore, in the delete door's own
 * order: the observer cascade, then the FILES. The wipe (deleteSectionData)
 * moved every emptied media component's files into `deleted/` after its
 * commit; putting the media keys back without them left the record pointing at
 * live paths that hold nothing. The same file door the missing-row undelete
 * uses (restoreSectionMedia → restoreDeletedSectionMediaFiles), fed only the
 * media keys this restore wrote back.
 */
function wipedRecordAfterCommit(
	marker: RecordMarker,
	restored: readonly { key: WipedKey; written: unknown }[],
	userId: number,
): () => Promise<void> {
	const cascade = wipedKeysCascade(marker, restored, userId);
	const media: Record<string, unknown> = {};
	for (const { key, written } of restored) {
		if (key.column === 'media') media[key.tipo] = written;
	}
	return async () => {
		await cascade();
		if (Object.keys(media).length === 0) return;
		await restoreSectionMedia(marker.sectionTipo, marker.sectionId, { media });
	};
}

/** The languages the items of some values name (`fallback` when none). */
function itemLangs(values: readonly unknown[], fallback: string): string[] {
	const langs = new Set<string>();
	for (const value of values) {
		for (const item of Array.isArray(value) ? value : []) {
			const lang = (item as { lang?: unknown } | null)?.lang;
			if (typeof lang === 'string' && lang !== '') langs.add(lang);
		}
	}
	return langs.size === 0 ? [fallback] : [...langs];
}

/**
 * The row is THERE: a SOFT cascade (delete_target → deleteSectionData) kept it
 * and wiped its components, or an earlier revert already undeleted it, or the
 * address was taken again. The role-4 twin is the pre-delete record. Behind
 * the row lock, all-or-nothing:
 *   - another record born at the address since (its generation epoch is above
 *     the snapshot — the address taken again): `refused`
 *     `cascade_delete_not_reverted` — the ONE case that refuses a unit
 *     re-linking it (its link would land on a foreign record);
 *   - the same record, a key written since the wipe or undelete: `kept`,
 *     nothing written (the write is someone's);
 *   - the same record with nothing to put back: `present` (a repeat revert
 *     stays `unchanged`);
 *   - else every wiped key is put back: `done`, reported `inexact`
 *     (cascade_undelete) by the caller; its media keys' files come back from
 *     `deleted/` after commit (wipedRecordAfterCommit) — a diffusion unpublish
 *     is not replayed.
 */
async function restoreWipedRecord(
	marker: RecordMarker,
	table: string,
	snapshot: Record<string, unknown>,
	context: RecordContext,
): Promise<RecordOutcome> {
	const outcome: RecordOutcome = await withTransaction(async (): Promise<RecordOutcome> => {
		const locked = await readMatrixKeyForUpdate(
			table,
			marker.sectionTipo,
			marker.sectionId,
			'data',
			CREATED_DATE,
		);
		const record =
			locked === null ? null : await readMatrixRecord(table, marker.sectionTipo, marker.sectionId);
		if (record === null || (await isRebornSince(marker))) {
			return { kind: 'refused', reason: 'cascade_delete_not_reverted' } as const;
		}
		const { keys, written } = await wipedKeysOf(snapshot, record.columns);
		if (written) return { kind: 'kept' } as const;
		if (keys.length === 0) return { kind: 'present' } as const;
		const mains = await wipedMainsOf(marker, table, keys);
		const restored: { key: WipedKey; written: unknown }[] = [];
		for (const key of keys) {
			restored.push({ key, written: await writeWipedKey(marker, table, key, context) });
		}
		await recordWipedHistory(marker, table, mains, context);
		return { kind: 'done', afterCommit: wipedRecordAfterCommit(marker, restored, context.userId) };
	});
	if (outcome.kind === 'done' && outcome.afterCommit !== undefined && !isInTransaction()) {
		await outcome.afterCommit();
		return { kind: 'done' };
	}
	return outcome;
}

/** A stored value that holds nothing. */
function isEmptyValue(value: unknown): boolean {
	if (value === null || value === undefined || value === '') return true;
	if (Array.isArray(value)) return value.length === 0;
	return typeof value === 'object' && Object.keys(value as object).length === 0;
}

/** The birth image of a birth marker (its jsonb columns), or `{}` when it carries none. */
function birthImageOf(marker: RecordMarker): Record<string, unknown> {
	const image = decodeTmImage(marker.row.data, marker.row.data_absent);
	return image !== null && typeof image === 'object' ? (image as Record<string, unknown>) : {};
}

/**
 * Whether a record holds any value other than the one it was BORN with (the
 * marker's image — see recordBulkBirth), in ANY key — the run's own included.
 * After a clean revert every run key is back at its pre-run value, which for a
 * record born in the run IS its birth value; so a run key that still differs
 * was written by someone else. Exempting run keys by address (language-blind)
 * missed exactly that: a curator's later translation of a run-written sliced
 * key sits outside the run's language region, survives the revert untouched —
 * and the delete then took it away unreviewed.
 */
function holdsForeignValue(marker: RecordMarker, columns: Record<string, unknown>): boolean {
	const birth = birthImageOf(marker);
	for (const column of MATRIX_JSONB_COLUMNS) {
		if (METADATA_COLUMNS.has(column)) continue;
		const bag = columns[column];
		if (bag === null || bag === undefined || typeof bag !== 'object') continue;
		for (const [tipo, value] of Object.entries(bag as Record<string, unknown>)) {
			if (RECORD_METADATA_KEYS.has(tipo) || isEmptyValue(value)) continue;
			if (canonicalJson(value) !== canonicalJson(keyOf(birth, column, tipo))) return true;
		}
	}
	return false;
}

/** Whether any record references this one. */
async function isReferenced(marker: RecordMarker): Promise<boolean> {
	const { total } = await countInverseReferences([
		{ section_tipo: marker.sectionTipo, section_id: marker.sectionId },
	]);
	return total > 0;
}

/**
 * Delete one born record if it is safe (see the header). `null` means "not
 * yet": it is referenced, and a later pass may find it free.
 *
 * Both checks run INSIDE the delete's transaction, behind its row lock (the
 * door's `precondition`): checked outside it, a save or a new link committing
 * between the check and the lock was deleted with the record and reported as
 * a clean D2 delete.
 */
async function deleteIfSafe(
	marker: RecordMarker,
	context: RecordContext,
): Promise<RecordOutcome | null> {
	// Under the REVERT's bulk id: the door writes the role-4 twin in its own
	// transaction, from its locked snapshot, and its nested cascades carry the id.
	const outcome = await deleteSectionRecord(
		marker.sectionTipo,
		marker.sectionId,
		context.userId,
		undefined,
		{
			bulkProcessId: context.newBulkId,
			precondition: async (snapshot) => {
				if (holdsForeignValue(marker, snapshot)) return 'foreign';
				return (await isReferenced(marker)) ? 'referenced' : null;
			},
		},
	);
	if (outcome.refused === 'referenced') return null;
	if (outcome.refused !== undefined) return { kind: 'refused', reason: 'created_record_kept' };
	// THE REVOCATION SEAM (SEC-08): a run may have created a USER record (a CSV
	// import into dd128); deleting it must end that account's sessions and
	// media markers. A no-op for every other section.
	for (const deletedId of outcome.deleted) {
		revokeDeletedAccountAccess(marker.sectionTipo, deletedId, 'bulk revert of a created record');
	}
	return { kind: 'done' };
}

/**
 * One D2 step for one marker, with a throw (a DB error, the delete door's
 * perm.denied…) turned into THIS marker's `failed` outcome: one record's failure never
 * aborts the other born records' deletes, nor drops the outcomes already
 * reached (the report must name every marker).
 */
async function failedOnThrow(
	marker: RecordMarker,
	located: boolean,
	step: () => Promise<BornOutcome | null>,
): Promise<BornOutcome | null> {
	try {
		return await step();
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		console.error(
			`[bulk_revert] delete of born record ${marker.sectionTipo}/${marker.sectionId}: ${detail}`,
		);
		return { kind: 'failed', detail, located };
	}
}

/**
 * Whether a marker's record has a row now. A section with no matrix table is
 * NOT proven gone (true): its marker takes the ordinary path, whose door fails
 * it loudly, never a silent "already at pre-run state".
 */
async function rowExists(marker: RecordMarker): Promise<boolean> {
	const table = await getMatrixTableFromTipo(marker.sectionTipo);
	if (table === null) return true;
	return (await readMatrixRecord(table, marker.sectionTipo, marker.sectionId)) !== null;
}

/**
 * The records born in the run whose row is GONE — at their PRE-RUN state,
 * non-existence, whatever removed them: a previous revert's D2 delete (a repeat
 * revert), the run's OWN cascade (a record it created and then cascade-deleted),
 * a curator's delete. One rule for all three: nothing is undeleted, their keys
 * are unchanged, their D2 step is a no-op (`present`), and no record-scope
 * search runs for them (it searches existing rows, so it could never see one;
 * a non-admin would read every such unit `out_of_scope`). Their role-4
 * cascade markers are dropped from the plan: undeleting a record only to
 * delete it again under D2 moved its files, unpublished it, and wrote RECOVER
 * and TM rows on every repeat revert.
 */
export async function goneBornAddresses(births: readonly RecordMarker[]): Promise<Set<string>> {
	const gone = new Set<string>();
	for (const marker of births) {
		if (!(await rowExists(marker))) gone.add(recordAddress(marker.sectionTipo, marker.sectionId));
	}
	return gone;
}

/** D2's gate for one born record: an outcome decided before any delete, or null (pending). */
async function bornGate(
	marker: RecordMarker,
	context: RecordContext,
	blocked: ReadonlySet<string>,
): Promise<BornOutcome | null> {
	// Gone = already at its pre-run state (goneBornAddresses): nothing to delete,
	// and no scope to judge on a row that is not there.
	if (!(await rowExists(marker))) return { kind: 'present' };
	if (!(await mayRewriteRecord(marker, context.principal))) return { kind: 'out_of_scope' };
	if (blocked.has(recordAddress(marker.sectionTipo, marker.sectionId))) {
		return { kind: 'refused', reason: 'created_record_kept' };
	}
	return null;
}

/**
 * Delete the records born in the run where it is safe (D2). `blocked` holds
 * the record addresses with a unit that did not revert cleanly. Returns one
 * outcome per birth marker, in marker order.
 */
export async function deleteBornRecords(
	births: readonly RecordMarker[],
	context: RecordContext,
	blocked: ReadonlySet<string>,
): Promise<Map<RecordMarker, BornOutcome>> {
	const outcomes = new Map<RecordMarker, BornOutcome>();
	let pending: RecordMarker[] = [];
	for (const marker of births) {
		const gated = await failedOnThrow(marker, false, () => bornGate(marker, context, blocked));
		if (gated === null) pending.push(marker);
		else outcomes.set(marker, gated);
	}
	// Repeat while a pass frees something: a born record referenced only by
	// another born record becomes free once that one is gone.
	let progressed = true;
	while (pending.length > 0 && progressed) {
		const next: RecordMarker[] = [];
		for (const marker of pending) {
			const outcome = await failedOnThrow(marker, true, () => deleteIfSafe(marker, context));
			if (outcome === null) next.push(marker);
			else outcomes.set(marker, outcome);
		}
		progressed = next.length < pending.length;
		pending = next;
	}
	for (const marker of pending)
		outcomes.set(marker, { kind: 'refused', reason: 'created_record_kept' });
	return outcomes;
}
