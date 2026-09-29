/**
 * THE TM PREVIEW'S FRAME CHILDREN AS OF THE ROW
 * (WC-2026-09-29-tm-preview-frame-children-as-of).
 *
 * The tool_time_machine preview of a dataframe main shows the frames the row
 * recorded (section/read.ts applyTmGraft) — and, through this module, the
 * frame CHILDREN (a rating on the frame target, its note…) as they stood then,
 * not as they are live. A frame target is ANOTHER record with its own history,
 * so "as of row R" needs a cross-record law:
 *
 *   THE BOUND. The main held row R's state until its next row N; another
 *   record "as of R" is its state at the END of that interval — bound B = N-1,
 *   or +inf (MAX_SAFE_INTEGER) when nothing follows R. Which rows count as N
 *   (the main key's AND the record's own section-level row) is the WC entry's
 *   bound law — canon there, computed by time_machine.ts nextVisibleRowAfter;
 *   not restated here. A target's own ARCHIVE RESTORE at or below B (a
 *   whole-record snapshot, no key rows) floors its keys: the snapshot's value,
 *   overridden only by key rows above it (restoreFloorAt).
 *
 *   ORDER. Row ids — one sequence across every record — never timestamps.
 *   Within a record ids follow the real order (its FOR UPDATE lock); across
 *   records they follow insert order, exact for sequential requests and within
 *   one transaction. Only writes CONCURRENT with the main row's own
 *   transaction can invert (the epoch law's bound). Accepted, documented.
 *
 * TWO SURFACES, ONE LAW. The preview of a row (section/read.ts) and the
 * history LIST's row cells (resolve/read_tm.ts graftRowFrameState) read the
 * row's frame state (rowFrameState) and its bound (tmAsOfRow) here. Each
 * surface ROOTS the bound at the record it emits from (rootedAt): the preview
 * at a clone of its own record, the list at the dd15 virtual row record; each
 * listed row emits under its own EmissionContext, so the bound stays constant
 * per emission (see CACHING).
 *
 * CONFINEMENT. Only the preview SUBJECT's frames read as of the bound
 * (frameTargetsAsOf: the emission ROOT by identity, and the main tipo): every
 * nested dataframe inside the preview stays entirely LIVE, bag and children
 * together — the subject's OWN record met again nested (a portal target
 * pointing back at it) included, exactly as in the list — an as-of child over
 * a live bag would be a picture that never existed. Door 3 (a direct slot
 * read) confines PER FRAME (isSubjectMain):
 * another main's live frame in a shared slot keeps its live children.
 *
 * CACHING. The as-of records live in the per-read EmissionContext.scratch
 * under FRAME_AS_OF — never in record_loader's cache or record_memo, which
 * keep holding LIVE rows only (seeding them would leak history into live cells
 * and component_info widgets of the same read). An as-of record is always a
 * cloneRecord of the live one or a makeVirtualRecord. The same address can be
 * live (an ordinary portal target) and as-of (a frame target) in one read
 * without contamination: the caches are disjoint. The bound is constant per
 * emission and every lane is grafted, so neither enters the key.
 *
 * WHAT STAYS LIVE: the main portal's own target content and chip labels,
 * datalists and option labels (the rating term), a frame child's own targets'
 * labels (its LOCATORS are as of the bound), derived children
 * (component_info) and models with no matrix jsonb column, and nested
 * dataframes of non-subject records. The preview is not a restore: apply_value
 * never touches frame targets or sibling bags.
 */

import type { MatrixJsonbColumn, MatrixRecord } from '../db/matrix.ts';
import { MATRIX_JSONB_COLUMNS } from '../db/matrix.ts';
import { EPOCH_ALL_HISTORY, recordEpoch } from '../db/record_generation.ts';
import {
	nextVisibleRecordRowAfter,
	nextVisibleRowAfter,
	readFrameStateRowAt,
	readWholeRecordRowAt,
	type TimeMachineRow,
} from '../db/time_machine.ts';
import { resolveDataTipo } from '../ontology/alias.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
	getTranslatableByTipo,
} from '../ontology/resolver.ts';
import { rowSlotTipos, type SlotTarget } from '../relations/dataframe_slots.ts';
import { laneLaw } from '../relations/main_lanes.ts';
import type { EmissionContext, TmAsOf } from '../resolve/component_data.ts';
import { loadRecordCached } from '../section/record_loader.ts';
import {
	cloneRecord,
	injectComponentData,
	makeVirtualRecord,
} from '../section_record/virtual_record.ts';
import { componentValueAsOf, type RowLaneState, readRowLaneState } from './lane_state.ts';
import { snapshotSlotFrames } from './tm_record.ts';

/** The per-read as-of record cache (EmissionContext.scratch key — the S2-29 protocol). */
const FRAME_AS_OF = Symbol('frame_as_of.cache');

/** Bound on cached as-of entries per read (record_loader's RECORD_CACHE_LIMIT posture). */
const AS_OF_CACHE_LIMIT = 8000;

/** One frame target as of the bound. */
interface TargetEntry {
	kind: 'target';
	/** The LIVE record (never mutated), or null when the row is gone. */
	live: MatrixRecord | null;
	/** The as-of clone; null until a child spoke (live null) — or the live-less target stays unrendered. */
	record: MatrixRecord | null;
	/** Child tipos already judged on `record` (a shared target completes lazily). */
	grafted: Set<string>;
	/** The LIVING generation did not yet exist at the bound (deadAtBound). */
	dead: boolean;
	/** The newest archive-restore snapshot at or below the bound (restoreFloorAt), or null. */
	restore: TimeMachineRow | null;
}

/** One sibling frame bag as of the bound. */
interface BagEntry {
	kind: 'bag';
	record: MatrixRecord | null;
}

type AsOfCache = Map<string, TargetEntry | BagEntry>;

function cacheOf(emission: EmissionContext): AsOfCache {
	let cache = emission.scratch.get(FRAME_AS_OF) as AsOfCache | undefined;
	if (cache === undefined) {
		cache = new Map();
		emission.scratch.set(FRAME_AS_OF, cache);
	}
	if (cache.size > AS_OF_CACHE_LIMIT) cache.clear();
	return cache;
}

/**
 * The emission's preview bound WHEN this frame emission is the preview
 * SUBJECT's own (the main `mainTipo` of the emission ROOT `mainRecord`), else
 * null — a nested dataframe of any record stays live, the subject's own
 * record met again nested included (see CONFINEMENT).
 */
export async function frameTargetsAsOf(
	emission: EmissionContext,
	mainTipo: string,
	mainRecord: MatrixRecord,
): Promise<TmAsOf | null> {
	const asOf = emission.tmAsOf;
	if (asOf === null || subjectRowOf(asOf, mainRecord) === null) return null;
	return (await isSubjectMain(asOf, mainTipo)) ? asOf : null;
}

/**
 * Whether `mainTipo` (a frame's main_component_tipo, possibly an alias) names
 * the bound's main — the MAIN half of CONFINEMENT. A frame of another main
 * sharing the slot stays live (children included), on every door.
 */
export async function isSubjectMain(asOf: TmAsOf, mainTipo: unknown): Promise<boolean> {
	if (typeof mainTipo !== 'string') return false;
	return mainTipo === asOf.mainTipo || (await resolveDataTipo(mainTipo)) === asOf.mainTipo;
}

/**
 * The SUBJECT the record `mainRecord` stands for under a bound, or null when
 * it stands for none. ONLY the bound's emission ROOT (TmAsOf.root — the
 * preview's own record, the history list's virtual dd15 row record) stands for
 * it, by IDENTITY, never by address: the subject's record met again nested (a
 * portal target pointing back at it) is another object and stays live, on
 * both surfaces alike. A frame bag and a sibling anchor are addressed by the
 * subject (its section, its id), never by the root's own address.
 */
export function subjectRowOf(
	asOf: TmAsOf,
	mainRecord: MatrixRecord,
): { section_tipo: string; section_id: number } | null {
	if (asOf.root === undefined || mainRecord !== asOf.root) return null;
	return { section_tipo: asOf.sectionTipo, section_id: asOf.sectionId };
}

/**
 * THE BOUND OF ONE HISTORY ROW (the WC entry's bound law): the main held the
 * row's state until its key's NEXT visible row or the record's own
 * section-level row, whichever comes first (time_machine.ts
 * nextVisibleRowAfter), so another record "as of the row" is its state just
 * below that one — or the newest state when neither exists. ONE computation
 * for the tool's two surfaces: the preview (section/read.ts resolveTmPreview)
 * and the history list (resolve/read_tm.ts). Each surface ROOTS it at the
 * record it emits from (rootedAt) before an emission carries it.
 */
export async function tmAsOfRow(tmRow: {
	id: number;
	section_tipo: string;
	section_id: number;
	tipo: string;
}): Promise<TmAsOf> {
	const next = await nextVisibleRowAfter(
		{ sectionTipo: tmRow.section_tipo, sectionId: tmRow.section_id, componentTipo: tmRow.tipo },
		tmRow.id,
	);
	return {
		rowId: tmRow.id,
		boundId: next === null ? Number.MAX_SAFE_INTEGER : next - 1,
		sectionTipo: tmRow.section_tipo,
		sectionId: tmRow.section_id,
		mainTipo: tmRow.tipo,
	};
}

/**
 * THE BOUND OF A WHOLE-RECORD SNAPSHOT ROW for one main `mainTipo` of its
 * record — the record-snapshot / deleted-records list (resolve/read_tm.ts
 * snapshotCellEmission). The row is classified by the anchor lifecycle law
 * (wholeRowIsDelete — one classifier, never a second):
 * - an archive RESTORE begins the content the snapshot holds: the main held
 *   it until its key's next row or the record's next section-level row —
 *   tmAsOfRow, the one bound;
 * - a DELETE ends the record AT the row: the snapshot is its state just
 *   before, and the delete's own commit-lane wipes (delete_target) lie ABOVE
 *   the row (gate (b')) — so the bound is the row itself, never the wiped
 *   state that followed.
 * `live`: whether the record lives now (a delete with nothing after it).
 */
export async function tmAsOfWholeRow(
	tmRow: { id: number; section_tipo: string; section_id: number },
	mainTipo: string,
	live: boolean,
): Promise<TmAsOf> {
	const asOf = await tmAsOfRow({ ...tmRow, tipo: mainTipo });
	const address = { sectionTipo: tmRow.section_tipo, sectionId: tmRow.section_id };
	return (await wholeRowIsDelete(address, tmRow.id, live)) ? { ...asOf, boundId: tmRow.id } : asOf;
}

/**
 * The bound ROOTED at the emission's top-level record (TmAsOf.root — the one
 * object that stands for the subject, subjectRowOf). The root must be an
 * object no nested load can return: the preview roots at a CLONE (a live
 * record may be the very object record_loader answers for the subject's
 * address met nested); the list's virtual dd15 record is its own object.
 */
export function rootedAt(asOf: TmAsOf, root: MatrixRecord): TmAsOf {
	return { ...asOf, root };
}

/**
 * THE FRAMES OF A MAIN AT ONE OF ITS HISTORY ROWS, per slot — the state at
 * the row (lane_state.ts readRowLaneState: the newest frame state at or below
 * it, so a LANGUAGE row, which carries no frame, has the frames it stood
 * with) read through the one slot-frame law (recordedSlotFrames). ONE source
 * for the tool's two surfaces: the preview's graft (section/read.ts
 * tmPreviewGraft, which also takes the lane state for the value) and the
 * history list's cells (resolve/read_tm.ts). `mainModel`: the MAIN's model;
 * `fallbackLang`: the lane an untagged pre-migration row is read under.
 */
export async function rowFrameState(
	tmRow: { id: number; tipo: string; lang: string | null; data: unknown },
	mainModel: string | null,
	live: Omit<SlotTarget, 'table'>,
	fallbackLang: string,
): Promise<{
	state: RowLaneState;
	law: ReturnType<typeof laneLaw>;
	slots: Map<string, Record<string, unknown>[]> | null;
}> {
	const { isLangSlicedModel } = await import('../components/registry.ts');
	const law = laneLaw(isLangSlicedModel(mainModel ?? ''), await getTranslatableByTipo(tmRow.tipo));
	const coords = { ...live, componentTipo: tmRow.tipo };
	const state = await readRowLaneState({ coords, row: tmRow, law, fallbackLang });
	return { state, law, slots: await recordedSlotFrames(tmRow.tipo, state.frameImage, live) };
}

/**
 * A frame target record AS OF the bound, with `childTipos` grafted (each key:
 * componentValueAsOf over every lane; a key history never recorded keeps its
 * live value). Null when the target has no live row and no child spoke — the
 * caller then skips it exactly as it skips a missing live target.
 */
export async function loadFrameTargetAsOf(
	emission: EmissionContext,
	table: string,
	sectionTipo: string,
	sectionId: number,
	asOf: TmAsOf,
	childTipos: readonly string[],
): Promise<MatrixRecord | null> {
	const cache = cacheOf(emission);
	const key = `t|${sectionTipo}/${sectionId}`;
	let entry = cache.get(key);
	if (entry === undefined || entry.kind !== 'target') {
		entry = await newTargetEntry(emission, table, sectionTipo, sectionId, asOf.boundId);
		cache.set(key, entry);
	}
	for (const childTipo of childTipos) {
		if (entry.grafted.has(childTipo)) continue;
		entry.grafted.add(childTipo);
		await graftChildAsOf(entry, sectionTipo, sectionId, childTipo, asOf.boundId);
	}
	return entry.record;
}

/**
 * Whether the record LIVING at the address now did not exist yet at the bound
 * `boundId` — the address was empty (its old generation deleted) or held
 * another generation. Never for an address with no epoch (its whole history is
 * its own), nor at the unbounded bound (the newest row: the living record IS
 * the state). Otherwise the living generation existed at B only when it had
 * written a visible row at or below B. The epoch alone is not its birth:
 * openEpochIfReborn places it just past the DEAD generation's last row, and
 * the rebirth may come much later — B inside [epoch, rebirth) saw no living
 * record. A generation reborn with no history row until after B (an explicit-id
 * import with the time machine off) is judged dead there too: nothing proves
 * it existed, and its unrecorded keys would otherwise preview its live values.
 */
async function deadAtBound(
	sectionTipo: string,
	sectionId: number,
	boundId: number,
): Promise<boolean> {
	if (boundId >= Number.MAX_SAFE_INTEGER) return false;
	if ((await recordEpoch(sectionTipo, sectionId)) === EPOCH_ALL_HISTORY) return false;
	const first = await nextVisibleRecordRowAfter(sectionTipo, sectionId, 0);
	return first === null || first.id > boundId;
}

/** A target's cache entry: its live row, the as-of record to graft on, its generation verdict. */
async function newTargetEntry(
	emission: EmissionContext,
	table: string,
	sectionTipo: string,
	sectionId: number,
	boundId: number,
): Promise<TargetEntry> {
	const live = await loadRecordCached(emission, table, sectionTipo, sectionId);
	const dead = await deadAtBound(sectionTipo, sectionId, boundId);
	const restore = await restoreFloorAt({ sectionTipo, sectionId }, boundId, live !== null);
	// Dead: a virtual record — never a clone of the living stranger (its other
	// keys would ride along); every grafted child is EMPTY on it.
	const record = dead
		? makeVirtualRecord(sectionTipo, sectionId)
		: live === null
			? null
			: cloneRecord(live);
	return { kind: 'target', live, record, grafted: new Set(), dead, restore };
}

/**
 * THE TARGET'S OWN LIFECYCLE (the sibling bag's supersedingWholeRow law, on
 * the children path): its newest visible whole-record row at or below the
 * bound when that row is an ARCHIVE RESTORE (archive/restore.ts overwrite: one
 * whole-record snapshot, no key rows) — every key row at or below it is
 * superseded by the snapshot's value. Null otherwise, and for a DELETE snapshot
 * (wholeRowIsDelete): a delete-not-reborn target keeps its key rows' values,
 * ledgered in the WC's caveats.
 */
async function restoreFloorAt(
	address: { sectionTipo: string; sectionId: number },
	boundId: number,
	liveExists: boolean,
): Promise<TimeMachineRow | null> {
	const whole = await readWholeRecordRowAt(address.sectionTipo, address.sectionId, boundId);
	if (whole === null) return null;
	return (await wholeRowIsDelete(address, whole.id, liveExists)) ? null : whole;
}

/** One child key of a target, as of the bound, put on the entry's clone. */
async function graftChildAsOf(
	entry: TargetEntry,
	sectionTipo: string,
	sectionId: number,
	childTipo: string,
	boundId: number,
): Promise<void> {
	// TM is recorded under the DATA tipo (component_alias, WC-020).
	const dataTipo = await resolveDataTipo(childTipo);
	const model = await getModelByTipo(dataTipo);
	if (model === null) return;
	// A model with no matrix jsonb column (component_section_id, derived and
	// external values) has no history to read — and injectComponentData would
	// throw on it. It stays live.
	const column = getColumnNameByModel(model);
	if (column === null || !MATRIX_JSONB_COLUMNS.includes(column as MatrixJsonbColumn)) return;
	const { isLangSlicedModel } = await import('../components/registry.ts');
	const law = laneLaw(isLangSlicedModel(model), await getTranslatableByTipo(dataTipo));
	const asOf = await childValueAt(
		entry,
		{ sectionTipo, sectionId, componentTipo: dataTipo },
		column,
		law,
		boundId,
	);
	if (asOf === null) return; // silent history: the live value stays
	// A target whose live row is gone renders only when some child spoke.
	entry.record ??= makeVirtualRecord(sectionTipo, sectionId);
	injectComponentData(entry.record, dataTipo, model, asOf.value ?? null);
}

/** One child key's value at the bound — null when history is silent (the live value stays). */
async function childValueAt(
	entry: TargetEntry,
	coords: { sectionTipo: string; sectionId: number; componentTipo: string },
	column: string,
	law: ReturnType<typeof laneLaw>,
	boundId: number,
): Promise<{ value: unknown } | null> {
	// The living generation did not exist at the bound: every child is EMPTY —
	// never the living stranger's value (and never the dead rows, which
	// withTmHistory hides). The entry's record is virtual (never null).
	if (entry.dead) return { value: law.sliced ? [] : null };
	// Over an archive restore the key's base is the SNAPSHOT's value, and only
	// key rows above it speak; the snapshot is recorded history, so the key is
	// spoken either way.
	const restore = entry.restore;
	const base = keyBaseOf(entry, column, coords.componentTipo);
	const asOf = await componentValueAsOf(coords, base, boundId, law, restore?.id ?? 0);
	return asOf.spoken || restore !== null ? { value: asOf.value } : null;
}

/** A child key's base: the restore snapshot's value when one floors it, else the live value. */
function keyBaseOf(entry: TargetEntry, column: string, tipo: string): unknown {
	return entry.restore === null
		? storedKeyOf(entry.live?.columns, column, tipo)
		: storedKeyOf(entry.restore.data as MatrixRecord['columns'], column, tipo);
}

/**
 * One key's raw stored value in a set of jsonb columns — a live record's, or a
 * whole-record snapshot's `data` (same shape) — `undefined` = absent (EMPTY).
 */
function storedKeyOf(
	columns: MatrixRecord['columns'] | null | undefined,
	column: string,
	tipo: string,
): unknown {
	const bag = columns?.[column as MatrixJsonbColumn];
	return (bag as Record<string, unknown> | null | undefined)?.[tipo];
}

/**
 * A SIBLING-anchored frame bag AS OF the bound (numisdata75 on numisdata3/N
 * keeps its frames on numisdata4/N). A sibling slot save is filed at the
 * SLOT-HOLDING record under the caller main — coords (anchor, main data
 * tipo) — so the frame state at B is readFrameStateRowAt there. No frame
 * state ever recorded there (silent history) keeps the live bag. Otherwise the
 * slot holds the OTHER mains' live frames followed by this main's frames as of
 * B (recordedSlotFrames: the same law applyTmGraft grafts the main's own slots
 * with). `emission` null: no per-read cache (a caller with no emission yet).
 */
export async function frameBagAsOf(
	emission: EmissionContext | null,
	anchor: { sectionTipo: string; sectionId: number },
	liveBag: MatrixRecord | null,
	mainTipo: string,
	slotTipo: string,
	asOf: TmAsOf,
): Promise<MatrixRecord | null> {
	const cache = emission === null ? null : cacheOf(emission);
	const key = `b|${anchor.sectionTipo}/${anchor.sectionId}|${mainTipo}|${slotTipo}`;
	const hit = cache?.get(key);
	if (hit !== undefined && hit.kind === 'bag') return hit.record;
	const record = await buildFrameBagAsOf(anchor, liveBag, mainTipo, slotTipo, asOf);
	cache?.set(key, { kind: 'bag', record });
	return record;
}

async function buildFrameBagAsOf(
	anchor: { sectionTipo: string; sectionId: number },
	liveBag: MatrixRecord | null,
	mainTipo: string,
	slotTipo: string,
	asOf: TmAsOf,
): Promise<MatrixRecord | null> {
	const mainDataTipo = await resolveDataTipo(mainTipo);
	const slotDataTipo = await resolveDataTipo(slotTipo);
	const coords = { ...anchor, componentTipo: mainDataTipo };
	const found = await readFrameStateRowAt(coords, asOf.boundId);
	const slot = { anchor, liveBag, slotDataTipo, mainDataTipo };
	const settled = await bagByAnchorLifecycle(slot, found, asOf.boundId);
	if (settled !== null) return settled;
	if (found === null && (await readFrameStateRowAt(coords, Number.MAX_SAFE_INTEGER)) === null) {
		return liveBag;
	}
	const bySlot = await recordedSlotFrames(mainDataTipo, found?.data ?? [], anchor);
	const frames = bySlot?.get(slotDataTipo) ?? [];
	return withMainFrames(anchor, liveBag, slotDataTipo, mainDataTipo, frames);
}

/**
 * The bag the ANCHOR's own lifecycle settles at the bound, or null when it
 * settles nothing (the frame state speaks):
 * - its LIVING generation did not exist at B (reborn after it — deadAtBound,
 *   the frame targets' one generation law): no frames at all, other mains'
 *   included — never the living stranger's bag. withTmHistory hides the dead
 *   generation's rows, so supersedingWholeRow alone cannot see it;
 * - else a whole-record row newer than the frame state (supersedingWholeRow).
 */
async function bagByAnchorLifecycle(
	slot: {
		anchor: { sectionTipo: string; sectionId: number };
		liveBag: MatrixRecord | null;
		slotDataTipo: string;
		mainDataTipo: string;
	},
	found: TimeMachineRow | null,
	boundId: number,
): Promise<MatrixRecord | null> {
	const { anchor, liveBag, slotDataTipo, mainDataTipo } = slot;
	if (await deadAtBound(anchor.sectionTipo, anchor.sectionId, boundId)) {
		return withMainFrames(anchor, null, slotDataTipo, mainDataTipo, []);
	}
	const whole = await supersedingWholeRow(anchor, found, boundId);
	return whole === null
		? null
		: bagAfterWholeRow(anchor, whole, liveBag, slotDataTipo, mainDataTipo);
}

/**
 * THE ANCHOR'S OWN LIFECYCLE: its newest visible whole-record row at or below
 * the bound when it is NEWER than the frame state `found` (null otherwise) —
 * it supersedes that state: the anchor was deleted (nothing at B) or
 * archive-restored (its frames are the snapshot's) after its last slot save.
 */
async function supersedingWholeRow(
	anchor: { sectionTipo: string; sectionId: number },
	found: TimeMachineRow | null,
	boundId: number,
): Promise<TimeMachineRow | null> {
	const whole = await readWholeRecordRowAt(anchor.sectionTipo, anchor.sectionId, boundId);
	if (whole === null || (found !== null && found.id > whole.id)) return null;
	return whole;
}

/** The bag after a superseding whole-record row: nothing (a delete) or the snapshot's frames. */
async function bagAfterWholeRow(
	anchor: { sectionTipo: string; sectionId: number },
	whole: TimeMachineRow,
	liveBag: MatrixRecord | null,
	slotDataTipo: string,
	mainDataTipo: string,
): Promise<MatrixRecord> {
	if (await wholeRowIsDelete(anchor, whole.id, liveBag !== null)) {
		// The anchor did not exist at B: no frames at all, other mains' included.
		return withMainFrames(anchor, null, slotDataTipo, mainDataTipo, []);
	}
	const frames = snapshotFramesOf(whole, slotDataTipo, mainDataTipo);
	return withMainFrames(anchor, liveBag, slotDataTipo, mainDataTipo, frames);
}

/**
 * Whether the anchor's whole-record row `wholeId` (a delete snapshot and an
 * archive restore's snapshot share one shape) is a DELETE: judged by what the
 * address wrote NEXT. A key save proves the record existed after it (a
 * restore). Another whole-record row is read as the RESTORE of a deleted
 * record — a deleted record's next event can only be a rebirth, and an
 * explicit-id rebirth's epoch hides the delete row altogether. Nothing after
 * it: a delete while the anchor is gone now, a restore while it lives.
 *
 * Ledgered residue (WC-2026-09-29-tm-preview-frame-children-as-of): two
 * archive restores in a row, or a restore deleted with no save between, read
 * the first one as a delete (the interval between previews no frames); a
 * bulk-revert UNDELETE writes only a hidden birth marker, so B between the
 * delete and the undelete previews the restored snapshot's frames. The tool's
 * recover (restoreSection) is not residue: it writes its own whole-record row,
 * so the delete it undoes still reads as a delete.
 */
async function wholeRowIsDelete(
	anchor: { sectionTipo: string; sectionId: number },
	wholeId: number,
	liveExists: boolean,
): Promise<boolean> {
	const next = await nextVisibleRecordRowAfter(anchor.sectionTipo, anchor.sectionId, wholeId);
	if (next === null) return !liveExists;
	return next.tipo === anchor.sectionTipo;
}

/** A whole-record snapshot's frames of `mainTipo` in `slot`. */
function snapshotFramesOf(row: TimeMachineRow, slot: string, mainTipo: string): unknown[] {
	const column = getColumnNameByModel('component_dataframe');
	const snapshot = row.data as Record<string, unknown> | null;
	const bag = column === null ? null : snapshot?.[column];
	const frames = (bag as Record<string, unknown> | null | undefined)?.[slot];
	if (!Array.isArray(frames)) return [];
	return frames.filter(
		(entry) =>
			(entry as { main_component_tipo?: unknown } | null)?.main_component_tipo === mainTipo,
	);
}

/**
 * The bag at B: the slot holds the OTHER mains' live frames followed by this
 * main's `frames` — `liveBag` null (the anchor gone now, or absent at B) is a
 * virtual record, so the slot previews exactly `frames`.
 */
function withMainFrames(
	anchor: { sectionTipo: string; sectionId: number },
	liveBag: MatrixRecord | null,
	slotDataTipo: string,
	mainDataTipo: string,
	frames: unknown[],
): MatrixRecord {
	const record =
		liveBag === null
			? makeVirtualRecord(anchor.sectionTipo, anchor.sectionId)
			: cloneRecord(liveBag);
	const others = liveFramesOfOtherMains(record, slotDataTipo, mainDataTipo);
	injectComponentData(record, slotDataTipo, 'component_dataframe', [...others, ...frames]);
	return record;
}

/**
 * The frame state's frames of its main, per slot — every slot of the main the
 * state speaks for (rowSlotTipos: a frame state is the full set of frames, so
 * a slot it carries no frame for — a live undeclared slot of the main included
 * — maps to `[]` and previews empty, exactly as apply_value empties it) — null
 * when no slot is in play at all. THE ONE slot-frame law of the preview: the
 * main's own slots (section/read.ts applyTmGraft) and a sibling bag
 * (frameBagAsOf) both read it here.
 */
export async function recordedSlotFrames(
	mainTipo: string,
	frameImage: unknown,
	live: Omit<SlotTarget, 'table'>,
): Promise<Map<string, Record<string, unknown>[]> | null> {
	const bySlot = await snapshotSlotFrames(
		mainTipo,
		frameImage,
		await rowSlotTipos(mainTipo, [frameImage], {
			...live,
			table: (await getMatrixTableFromTipo(live.sectionTipo)) ?? 'matrix',
		}),
	);
	return bySlot.size > 0 ? bySlot : null;
}

/** A slot's live frames that belong to a main other than `mainTipo` (a shared slot stores every main's frames). */
export function liveFramesOfOtherMains(
	record: MatrixRecord,
	slot: string,
	mainTipo: string,
): unknown[] {
	const column = getColumnNameByModel('component_dataframe');
	const bag = column === null ? null : record.columns[column as MatrixJsonbColumn];
	const live = (bag as Record<string, unknown> | null | undefined)?.[slot];
	if (!Array.isArray(live)) return [];
	return live.filter((entry) => {
		const owner = (entry as { main_component_tipo?: unknown } | null)?.main_component_tipo;
		return typeof owner === 'string' && owner !== mainTipo;
	});
}
