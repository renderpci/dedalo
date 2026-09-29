/**
 * tool_time_machine.apply_value — restore one historical snapshot (a
 * matrix_time_machine row, identified by its own PK `matrix_id`) back into
 * the live record (PHP tools/tool_time_machine::apply_value).
 *
 * COMPONENT branch (the client's "Apply and save" button): the TM row's data
 * overwrites the component's live value, after stripping dataframe frame
 * entries from the main data — a TM snapshot of a dataframe-paired component
 * carries BOTH the main items and dd490 frame objects, and restoring a frame
 * into the main column corrupts it (this strip applies to literal mains too,
 * not only relation models — the historical relation-only filter leaked
 * locators into literal columns). Every model, component_iri included, splits
 * by the one frame predicate (splitComposed) — an iri-key filter dropped v6
 * title-only iri items along with the frames. The stripped-out frames are NOT
 * discarded: they are replayed into their `component_dataframe` slots FIRST
 * (dataframe_restore.ts — PHP's set_time_machine_data sequence), because a
 * main restored without its frames leaves orphan pairings behind. The restore
 * then writes a fresh TM audit row carrying main + frames, so the restore
 * itself is revertible (PHP: "the new save immediately creates a fresh TM
 * entry"; component restores do NOT delete the consumed TM row), and finally
 * fires the observer cascade like every PHP `element->save()` did.
 *
 * SECTION branch (recover a whole deleted/edited record): the TM snapshot's
 * data is a full matrix-columns object; it overwrites the live record via the
 * write chokepoint (PHP element->set_data + save()). LEDGERED vs PHP (no
 * fixture / no TS twin): deleted-media relink, the session-SQO reset (TS has no
 * PHP session), and the TM-row consumption (PHP deletes the restored snapshot;
 * TS keeps it — harmless, the fresh audit row supersedes it in the list).
 *
 * UNCOVERED SCOPE (denied loudly, never guessed): restoring a TM row whose own
 * tipo IS a `component_dataframe` slot — with or without `caller_dataframe`. No
 * supported history has one (PHP never wrote a slot row; a slot's frames ride in
 * its main's composed row), and for such a row the snapshot's dd490 entries ARE
 * the value, so the shared `splitComposed().main` would reduce it to nothing and
 * the restore would silently WIPE the slot. The door refuses instead.
 *
 * TWO LANES (WC-2026-09-27-bulk-revert-undo-log addendum): a row of a main is
 * ONE lane. The restore puts the row's OWN lane back (a language row's value
 * merged over the live other languages; an lg-nolan row's lg-nolan items) and
 * the frames AS OF the row (tm_record/lane_state.ts — the row itself when it is
 * a frame state, else the newest frame-state row below it (lg-nolan, or a v6 row
 * carrying frames); none = no frames then:
 * the main's own frames are EMPTIED; other mains' frames of a shared slot stay
 * — decision D-A). A frame of an item that existed at the row and exists no
 * more is never written back. No refusal.
 *
 * A FRAMES-ONLY row (relations/dataframe_slots.ts isFramesOnlyImage — a v6
 * slot save of a translatable main, tagged lg-nolan) restores the frames only:
 * the main stays live, and the restore's history is its one lg-nolan row.
 *
 * A frame naming a tipo that is NOT a live dataframe slot is NOT refused: PHP's
 * per-slot filter matches it nowhere either, so it restores nothing and is
 * stripped out of the main data (see dataframe_restore.ts's header).
 */

import { dbTimestamp } from '../../../src/core/db/db_timestamp.ts';
import type { MatrixJsonbColumn } from '../../../src/core/db/matrix.ts';
import { MATRIX_JSONB_COLUMNS } from '../../../src/core/db/matrix.ts';
import {
	absorbComponentItemIds,
	insertMatrixRecordIfAbsent,
	readMatrixKeyForUpdate,
} from '../../../src/core/db/matrix_write.ts';
import { withTransaction } from '../../../src/core/db/postgres.ts';
import { recordEpoch } from '../../../src/core/db/record_generation.ts';
import {
	readOtherLangItemIds,
	readTimeMachineRow,
	type TmCoords,
} from '../../../src/core/db/time_machine.ts';
import { DedaloError, ok } from '../../../src/core/errors/index.ts';
import { restoreDeletedSectionMediaFiles } from '../../../src/core/media/file_ops.ts';
import {
	effectiveSaveLang,
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
} from '../../../src/core/ontology/resolver.ts';
import {
	heldItemIds,
	mainIdentity,
	readMainState,
	recordMainHistory,
	rowSlotTipos,
} from '../../../src/core/relations/dataframe_slots.ts';
import { NOLAN } from '../../../src/core/relations/main_lanes.ts';
import {
	reindexRelationColumnLikeSave,
	reindexRelationSearchLikeSave,
} from '../../../src/core/relations/save.ts';
import { persistRecordColumns, persistRecordKeys } from '../../../src/core/section_record/index.ts';
import { principalCanAccessRecord } from '../../../src/core/security/record_scope.ts';
import { readRowLaneState, restoredLaneValue } from '../../../src/core/tm_record/lane_state.ts';
import {
	type ToolActionContext,
	type ToolResponse,
	toolRequestId,
} from '../../../src/core/tools/module.ts';
import { normalizeRestoredSectionIds } from '../../../src/core/update/transform/section_id_restore.ts';
import {
	applyDataframeRestore,
	DataframeRestoreError,
	type DataframeSlotRestore,
	type FrameSlice,
	planDataframeRestore,
} from './dataframe_restore.ts';
import { propagateRestoreToObservers } from './restore_common.ts';

/**
 * SECTION restore (PHP apply_value model==='section'): the snapshot is a full
 * matrix-columns object; overwrite the live record's columns through the write
 * chokepoint (PHP element->set_data + save(), which stamps the modified audit).
 * Structural 'id' is not a column; every jsonb column present in the snapshot
 * is written (including 'data' section metadata — PHP set_data replaces all).
 *
 * THE UNDELETE DOOR: also the bulk revert's (bulk_revert_records.ts) for a
 * record a run's dataframe cascade deleted — one restore of a whole record,
 * files included, not two. `tmId` is the snapshot row's id, for the refusal.
 */
export async function restoreSection(
	snapshot: unknown,
	tmId: number,
	sectionTipo: string,
	sectionId: number,
	userId: number,
): Promise<void> {
	const columns = await restoreSectionRow(snapshot, tmId, sectionTipo, sectionId, userId);
	await restoreSectionMedia(sectionTipo, sectionId, columns);
	// LEDGERED (no TS twin / no fixture): session-SQO reset, and consuming
	// (deleting) the restored TM row.
}

/**
 * The ROW half of {@link restoreSection}: write the snapshot's jsonb columns
 * back (section ids converged, see below) and answer the columns AS WRITTEN.
 * Joins an ambient transaction — the bulk revert undeletes a cascade target
 * inside the transaction of the unit that re-links it, so a refused unit rolls
 * the undelete back with it. The FILE half ({@link restoreSectionMedia}) must
 * then run after that transaction commits.
 */
export async function restoreSectionRow(
	snapshot: unknown,
	tmId: number,
	sectionTipo: string,
	sectionId: number,
	userId: number,
): Promise<Partial<Record<MatrixJsonbColumn, unknown>>> {
	const { table, columns } = await snapshotColumns(snapshot, tmId, sectionTipo, sectionId);
	await persistRecordColumns({ table, sectionTipo, sectionId }, columns, { userId });
	await reindexRelationColumnLikeSave(table, sectionTipo, sectionId, columns.relation);
	return columns;
}

/**
 * The INSERT-ONLY twin of {@link restoreSectionRow}: put the snapshot back
 * ONLY where the address is empty, and answer `null` — nothing written — when
 * something stands there (a record created at that explicit id since the
 * delete). The upsert of restoreSectionRow would overwrite it. The existence
 * test IS the insert (ON CONFLICT DO NOTHING under the explicit-id advisory
 * lock), so there is no window between a check and the write. The bulk
 * revert's cascade undelete.
 *
 * `userId: null` writes the snapshot VERBATIM — no dd197/dd201 stamp. The bulk
 * revert's undeletes pass it: the snapshot carries its own stamps, and a run
 * may own them (a CSV import carrying dd197/dd201 columns has undo pairs on
 * those keys). Stamping "now" there made every stamp unit of the undeleted
 * record refuse `changed_since_run`, so reverting a revert was not exact.
 */
export async function restoreAbsentSectionRow(
	snapshot: unknown,
	tmId: number,
	sectionTipo: string,
	sectionId: number,
	userId: number | null,
): Promise<Partial<Record<MatrixJsonbColumn, unknown>> | null> {
	const { table, columns } = await snapshotColumns(snapshot, tmId, sectionTipo, sectionId);
	if (!(await insertMatrixRecordIfAbsent(table, sectionTipo, sectionId, columns))) return null;
	// The row is ours: the ordinary whole-record write (stamped unless verbatim)
	// fires the record-write obligations (save event, security reaction, RAG index).
	await persistRecordColumns(
		{ table, sectionTipo, sectionId },
		columns,
		userId === null ? false : { userId },
	);
	// The snapshot's relation_search is the delete-time chain; a save would
	// derive it from today's thesaurus (a term moved since answers for its
	// NEW broader terms), so the undelete re-derives it the same way.
	await reindexRelationColumnLikeSave(table, sectionTipo, sectionId, columns.relation);
	return columns;
}

/** A TM section snapshot's jsonb columns (section ids converged), and its table. */
async function snapshotColumns(
	snapshot: unknown,
	tmId: number,
	sectionTipo: string,
	sectionId: number,
): Promise<{ table: string; columns: Partial<Record<MatrixJsonbColumn, unknown>> }> {
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) {
		throw new DedaloError('request.invalid_model', {
			coordinates: { section_tipo: sectionTipo },
			message: `No matrix table for '${sectionTipo}'`,
		});
	}
	if (snapshot === null || typeof snapshot !== 'object') {
		throw new DedaloError('tool.target_not_found', {
			coordinates: { section_tipo: sectionTipo, section_id: sectionId, tm_id: tmId },
			message: 'The TM section snapshot is empty',
		});
	}
	const columns: Partial<Record<MatrixJsonbColumn, unknown>> = {};
	for (const [column, value] of Object.entries(snapshot as Record<string, unknown>)) {
		if (MATRIX_JSONB_COLUMNS.includes(column as MatrixJsonbColumn)) {
			columns[column as MatrixJsonbColumn] = value;
		}
	}
	// section_id int-canonical convergence (WC-2026-08-10-section-id-int-canonical, D6.2): TM snapshots — and any pre-migration backup restored
	// into a post-migration install — carry string-form locator addresses; a
	// verbatim write would re-inject them forever. The kernel converts what the
	// sweep would convert (external remote ids and junk pass verbatim), so
	// restores CONVERGE on the canonical form instead of undoing the sweep.
	await normalizeRestoredSectionIds(columns);
	return { table, columns };
}

/**
 * The FILE half of {@link restoreSection} (P1-11 / LIFE-08). The delete moved
 * every managed file of every media component into its quality dir's
 * `deleted/` sub-folder — a move, never a hard delete, precisely so this step
 * can undo it. Without it the restored record's media column points at live
 * paths holding NO FILES and the restore still answers ok:true: the row is
 * back, the objects are not, and only opening the record shows it.
 *
 * POST-PERSIST (after COMMIT when the row half ran in a transaction) and
 * unwrapped, matching the delete's own post-commit half: the row must be back
 * before the files are, and a media failure must not undo a restore that
 * landed. `restoreDeletedSectionMediaFiles` never overwrites a live file — an
 * operator may have re-uploaded since, and silently replacing the newer file
 * with the pre-delete one is the one outcome nothing can undo.
 */
export async function restoreSectionMedia(
	sectionTipo: string,
	sectionId: number,
	columns: Partial<Record<MatrixJsonbColumn, unknown>>,
): Promise<void> {
	try {
		const mediaColumn = columns.media as Record<string, unknown[]> | null | undefined;
		const outcome = await restoreDeletedSectionMediaFiles(sectionTipo, sectionId, mediaColumn);
		if (outcome.errors.length > 0) {
			console.error(
				`[tool_time_machine] media restore for ${sectionTipo}/${sectionId} reported: ${outcome.errors.join('; ')}`,
			);
		}
	} catch (error) {
		// Never fail a landed restore on the file half — say it loudly instead.
		console.error(
			`[tool_time_machine] media restore for ${sectionTipo}/${sectionId} FAILED: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * The frame plan of a restored row. The row is the FULL state of the main and
 * all its dataframes: every slot it is silent about was empty then, and is
 * emptied — the live record's slots of the main included (rowSlotTipos). Read
 * behind the caller's row lock. An unplaceable frame refuses the restore; the
 * refusal sentence names slot tipos — LOG-only (the code's disclosure is
 * 'operator'), never echoed on the wire.
 */
async function planRowFrames(
	tipo: string,
	snapshot: unknown,
	target: { table: string; sectionTipo: string; sectionId: number },
): Promise<DataframeSlotRestore[]> {
	try {
		return await planDataframeRestore(tipo, snapshot, await rowSlotTipos(tipo, [snapshot], target));
	} catch (error) {
		if (!(error instanceof DataframeRestoreError)) throw error;
		throw new DedaloError('engine.uncovered_scope', {
			cause: error,
			coordinates: { tipo, section_tipo: target.sectionTipo },
			message: error.message,
		});
	}
}

/**
 * Append the RECOVER SECTION / RECOVER COMPONENT activity row (dd42 codes
 * 13/14, PHP tool_time_machine :99 / :213 / :419).
 *
 * (!) The WHERE tipo is the SECTION tipo for BOTH — including a component
 * restore, whose own tipo goes unused. That is PHP's behaviour at all three
 * call sites, not an oversight here.
 */
async function logRecoverActivity(
	context: ToolActionContext,
	what: 'RECOVER SECTION' | 'RECOVER COMPONENT',
	payload: Record<string, unknown>,
	sectionTipo: string,
): Promise<void> {
	const { logActivity, hostFromClientIp } = await import(
		'../../../src/core/api/handlers/activity_log.ts'
	);
	await logActivity({
		what,
		tipo: sectionTipo,
		userId: context.userId,
		host: hostFromClientIp(context.clientIp),
		data: payload,
	});
}

/** A snapshot with its section ids int-canonical (WC-2026-08-10 D6.2). */
async function canonicalImage(data: unknown): Promise<unknown> {
	const container = { value: data };
	await normalizeRestoredSectionIds(container);
	return container.value;
}

/**
 * The frame scope of a row restore (dataframe_restore.ts FrameSlice): no live
 * frame is kept (the frame state as of the row replaces this main's frames),
 * and a recorded frame is STALE — never written back — when its item existed
 * in any language at the row OR at the frame-state row the frames came from
 * (time_machine.ts readOtherLangItemIds, every lane, the frame-first proof at
 * each row) and the restored value no longer holds it. The second row matters
 * for a frameless PHP language row that dropped the only framed item: its
 * frames come from an older row that still held the item — judged at the
 * restored row alone, the item is "proven absent" and its frame would come
 * back as an orphan. A frame saved before its item comes back.
 */
async function rowFrameSlice(
	coords: TmCoords,
	rows: { rowId: number; frameRowId: number | null },
	restoredValue: unknown,
	sliced: boolean,
): Promise<FrameSlice> {
	const known = await readOtherLangItemIds(coords, [], rows.rowId, !sliced);
	if (rows.frameRowId !== null && rows.frameRowId !== rows.rowId) {
		for (const id of await readOtherLangItemIds(coords, [], rows.frameRowId, !sliced))
			known.add(id);
	}
	return { survivorIds: new Set(), otherLangIds: known, heldIds: heldItemIds(restoredValue) };
}

export async function toolTimeMachineApplyValue(context: ToolActionContext): Promise<ToolResponse> {
	const { options, userId } = context;
	const sectionTipo = String(options.section_tipo ?? '');
	const sectionId = Number(options.section_id ?? 0);
	const tipo = String(options.tipo ?? '');
	const lang = String(options.lang ?? 'lg-nolan');
	const matrixId = options.matrix_id;

	if (sectionTipo === '' || tipo === '' || matrixId === null || matrixId === undefined) {
		throw new DedaloError('request.invalid_options', {
			publicMessage: 'section_tipo, tipo and matrix_id are required',
		});
	}

	const model = await getModelByTipo(tipo);
	if (model === null) {
		throw new DedaloError('request.invalid_tipo', { coordinates: { tipo } });
	}
	if (model !== 'section' && !model.startsWith('component_')) {
		throw new DedaloError('request.invalid_model', {
			coordinates: { tipo, model },
			message: `apply_value for model '${model}' is not restorable`,
		});
	}
	// SEC-024 §9.4 — PER-RECORD scope. The declarative module gate ('tipo',
	// level 2) authorizes the (section_tipo, tipo) SCHEMA pair; it says nothing
	// about the caller-supplied section_id, and the TM row lookup applies no
	// projects filter of its own. Without this a level-2 user restores a
	// historical snapshot into a record outside their filter_by_projects scope
	// (PHP asserts security::assert_record_in_user_scope here — it was the ONLY
	// gate of the two that this port dropped). PHP skips it for an empty
	// section_id; so do we — the TM target match below refuses those anyway.
	if (
		sectionId > 0 &&
		!(await principalCanAccessRecord(sectionTipo, sectionId, context.principal))
	) {
		throw new DedaloError('perm.out_of_scope', {
			coordinates: { section_tipo: sectionTipo, section_id: sectionId },
		});
	}
	if (options.caller_dataframe !== null && options.caller_dataframe !== undefined) {
		// Dataframe SLOT restore is uncovered scope (no fixture to gate it).
		throw new DedaloError('engine.uncovered_scope', {
			coordinates: { tipo, section_tipo: sectionTipo },
			message: 'apply_value with caller_dataframe is uncovered scope on this server (ledgered)',
		});
	}

	// TM row lookup — matrix_id is the PK of matrix_time_machine (shared reader).
	const tmRow = await readTimeMachineRow(Number(matrixId));
	if (tmRow === null) {
		throw new DedaloError('tool.target_not_found', {
			coordinates: { tm_id: String(matrixId) },
			message: `TM row not found: ${String(matrixId)}`,
		});
	}
	// The snapshot must belong to the requested target — a mismatched matrix_id
	// would restore another record's history into this one.
	//
	// (!) The address is NOT enough (P0-14). Where a section_id was re-minted, a
	// DEAD record's snapshots carry the living record's exact coordinates, so
	// this check passed and the restore wrote the dead record's values in with
	// ok:true. The record's generation epoch is the second half of its identity:
	// rows below it belong to whoever held the address before.
	const epoch = await recordEpoch(sectionTipo, sectionId);
	if (
		tmRow.section_tipo !== sectionTipo ||
		tmRow.section_id !== sectionId ||
		tmRow.tipo !== tipo ||
		tmRow.id < epoch
	) {
		throw new DedaloError('request.invalid_options', {
			publicMessage: 'matrix_id does not belong to the requested target',
			coordinates: { tm_id: String(matrixId), section_tipo: sectionTipo, tipo },
		});
	}

	// SECTION restore: overwrite the whole record from the snapshot columns.
	if (model === 'section') {
		// Throws on refusal (the dispatch catch converts), so the activity row is
		// appended only for a restore that actually landed.
		await restoreSection(tmRow.data, tmRow.id, sectionTipo, sectionId, userId);
		await logRecoverActivity(
			context,
			'RECOVER SECTION',
			{
				msg: 'Recovered section record from time machine',
				section_id: sectionId,
				section_tipo: sectionTipo,
				top_id: sectionId,
				top_tipo: sectionTipo,
				table: (await getMatrixTableFromTipo(sectionTipo)) ?? 'matrix',
				tm_id: matrixId,
			},
			sectionTipo,
		);
		return ok(true, { requestId: toolRequestId(context) });
	}

	// COMPONENT restore.
	if (model === 'component_dataframe') {
		// See the header: the shared preview/restore strip empties a slot's own
		// snapshot, so restoring it would silently delete the slot.
		throw new DedaloError('engine.uncovered_scope', {
			coordinates: { tipo, model },
			message:
				`apply_value on a component_dataframe slot ('${tipo}') is uncovered scope on this ` +
				'server: the shared time-machine strip would write an empty slot (ledgered)',
		});
	}

	// int-canonical convergence on the WHOLE snapshot (D6.2 — see restoreSection),
	// BEFORE the strip and the frame plan below: the frames replayed into the
	// slots are stored addresses too, so normalizing only the main would write
	// the main int-form and its frames string-form — half a convergence, and the
	// legacy form re-injected on exactly the rows the sweep just fixed.
	const canonicalRow = { ...tmRow, data: await canonicalImage(tmRow.data) };

	// Overwrite the live component value.
	const column = getColumnNameByModel(model);
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (column === null || table === null) {
		throw new DedaloError('request.invalid_model', {
			coordinates: { model, section_tipo: sectionTipo },
			message: `No matrix column/table for '${model}' / '${sectionTipo}'`,
		});
	}
	const writeTarget = { table, sectionTipo, sectionId };
	// THE LANE LAW of this main (relations/main_lanes.ts): the write engine's
	// own `isLangSlicedModel` (save_component.ts, PHP supports_translation &&
	// !is_relation) — never the ontology `translatable` flag alone, which
	// mis-slices an ontology-non-translatable input_text (it slices on the
	// `lg-nolan` the engine normalizes it to) — and, for a SLICED model only, the
	// translatable flag, which decides whether the lg-nolan lane holds a value.
	// An unsliced main (every relation) has one lane, lg-nolan (main_lanes.ts
	// laneLaw, decision 2026-09-29).
	const identity = await mainIdentity(tipo, lang);
	// The request's effective lang — the save path's rule (resolver.ts
	// effectiveSaveLang). Only the FALLBACK for a pre-migration row with no
	// `lang`: the lane a restore speaks for is the ROW's own (DATA-03 — a caller
	// may hand a Spanish row with `lang: lg-eng`; tagging the restore with the
	// request lang filed it in a timeline the restore did not touch).
	const fallbackLang = await effectiveSaveLang(tipo, model, lang);

	// What the restore WRITES, computed under the row lock below.
	let restoredValue: unknown = null;
	// The observer cascade needs the locators this restore DROPS (targets whose
	// mirror still references the record). Read under the lock, with everything
	// else this plan depends on.
	let preRestoreItems: unknown[] = [];

	await withTransaction(async () => {
		// THE ROW LOCK, FIRST AND UNCONDITIONALLY (P1-9 / DATA-30): everything the
		// plan depends on is read INSIDE the transaction and BEHIND the lock.
		const lockedItems = await readMatrixKeyForUpdate(
			table,
			sectionTipo,
			sectionId,
			column as MatrixJsonbColumn,
			tipo,
		);
		preRestoreItems = Array.isArray(lockedItems) ? lockedItems : [];
		const before = await readMainState(writeTarget, identity);
		// THE STATE AT THE ROW (two lanes — tm_record/lane_state.ts, the reader
		// the preview shares): the row's own lane value, and the frame state AS OF
		// the row (the row itself when it is one — an lg-nolan row, a PHP row
		// carrying frames — else the newest frame-state row below it: lg-nolan,
		// or a v6 row carrying frames).
		const state = await readRowLaneState({
			coords: { sectionTipo, sectionId, componentTipo: tipo },
			row: canonicalRow,
			law: identity,
			fallbackLang,
		});
		// The FRAME half (PHP apply_value :277-333), planned behind the lock and
		// before anything is written, so an unplaceable frame refuses the whole
		// restore instead of leaving the record half-restored.
		const frameImage = await canonicalImage(state.frameImage);
		const framePlan = await planRowFrames(tipo, frameImage, writeTarget);
		restoredValue = restoredLaneValue(before.value, state, identity);
		// Frames FIRST (PHP restores the slots before saving the main) — THIS
		// main's frames only (a shared slot's other mains stay live, as the
		// preview shows them): the frame state as of the row, minus the frame of
		// an item that existed then and no longer exists in any language
		// (dataframe_slots.ts isStaleItemFrame) — never an orphan.
		await applyDataframeRestore(
			writeTarget,
			tipo,
			framePlan,
			await rowFrameSlice(
				{ sectionTipo, sectionId, componentTipo: tipo },
				{ rowId: tmRow.id, frameRowId: state.frameRowId },
				restoredValue,
				identity.sliced,
			),
		);
		// Chokepoint write: restored value + the record's modified stamps in one
		// update (PHP: apply_value restores via element->save(), which stamps).
		await persistRecordKeys(
			writeTarget,
			[{ column: column as MatrixJsonbColumn, key: tipo, value: restoredValue }],
			{ userId },
		);
		// The save's relation_search law: the ancestor index moves with the
		// restored locators (a component save re-derives it; so must a restore).
		await reindexRelationSearchLikeSave(table, sectionTipo, sectionId, tipo, restoredValue);
		// Restored items carry explicit ids; raise the counter so a later insert
		// cannot mint a duplicate (PHP raises on every set_data). For a
		// dataframe-paired main this is load-bearing: a duplicated main item id
		// would make two items answer to the same frame `id_key`.
		await absorbComponentItemIds(
			table,
			sectionTipo,
			sectionId,
			tipo,
			Array.isArray(restoredValue) ? restoredValue : [],
		);
		// Fresh TM audit for the restore itself (PHP: the component save creates a
		// new TM entry; the consumed row is kept), through the capture's own writer
		// (relations/dataframe_slots.ts recordMainHistory — two lanes): the
		// restored lane's row (its value only — one row is one language), and the
		// lg-nolan row (lg-nolan value + every slot's frames after the restore)
		// when the restore changed it — so reverting the restore brings the frames
		// back with it. A frames-only restore's door lane is the frame lane.
		const after = await readMainState(
			writeTarget,
			identity,
			framePlan.map((restore) => restore.slotTipo),
		);
		await recordMainHistory(
			writeTarget,
			{ ...identity, lang: state.own.recorded ? state.rowLane : NOLAN },
			{ before, after },
			{ userId, timestamp: dbTimestamp(), bulkId: null },
		);
	});
	// Observer cascade, POST-COMMIT (PHP: apply_value restores through
	// element->save(), whose last act is propagate_to_observers — this port
	// wrote through the chokepoint directly and skipped it, so a TM restore of
	// an observed component left every mirror stale and logged no observer TM
	// row). Post-commit because a cascade hop refuses to run inside an ambient
	// transaction (B6, observers.ts).
	// The cascade diffs against what was WRITTEN, not against the snapshot: fed
	// the slice, it would report every surviving sibling language as a removed
	// target and unwire mirrors the restore never touched.
	await propagateRestoreToObservers(
		tipo,
		sectionTipo,
		sectionId,
		preRestoreItems,
		restoredValue,
		userId,
	);

	await logRecoverActivity(
		context,
		'RECOVER COMPONENT',
		{
			msg: 'Recovered component data from time machine',
			model,
			section_id: sectionId,
			section_tipo: sectionTipo,
			table,
			tm_id: matrixId,
		},
		sectionTipo,
	);

	return ok(true, { requestId: toolRequestId(context) });
}
