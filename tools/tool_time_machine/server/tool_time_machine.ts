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
 * locators into literal columns). component_iri separates by the `iri`
 * property instead (frames never carry it). The stripped-out frames are NOT
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
 * UNCOVERED SCOPE (denied loudly, never guessed) — both refusals exist because
 * the alternative is DELETING data the archive cannot get back:
 *   1. restoring a TM row whose own tipo IS a `component_dataframe` slot — with
 *      or without `caller_dataframe`. For such a row the snapshot's dd490
 *      entries ARE the component's value, so the shared
 *      `stripDataframeFramesFromTmMain` (which the TM PREVIEW read applies too)
 *      reduces it to an empty array and the restore would silently WIPE the
 *      slot. Un-stripping only the restore would make the tool write something
 *      the user never previewed; the fix belongs in the ONE shared strip plus
 *      `section/read.ts`, so until then the door refuses instead of deleting.
 *   2. restoring a snapshot that carries NO frames onto a main whose slots DO
 *      hold frames (`refuseFramelessWipe`). The CAPTURE half is unported —
 *      `save_component.ts` never appends the slots' frames — so every TS-written
 *      TM row is frameless and indistinguishable from a PHP-era row whose slots
 *      were genuinely empty. Replaying the wipe would delete frames that exist
 *      in no other row. Lifted the day capture lands.
 *
 * A frame naming a tipo that is NOT a live dataframe slot is NOT refused: PHP's
 * per-slot filter matches it nowhere either, so it restores nothing and is
 * stripped out of the main data (see dataframe_restore.ts's header).
 */

import { dbTimestamp } from '../../../src/core/db/db_timestamp.ts';
import type { MatrixJsonbColumn } from '../../../src/core/db/matrix.ts';
import { MATRIX_JSONB_COLUMNS } from '../../../src/core/db/matrix.ts';
import { absorbComponentItemIds } from '../../../src/core/db/matrix_write.ts';
import { withTransaction } from '../../../src/core/db/postgres.ts';
import {
	readTimeMachineRow,
	recordTimeMachine,
	type TimeMachineRow,
} from '../../../src/core/db/time_machine.ts';
import { DedaloError, ok } from '../../../src/core/errors/index.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
} from '../../../src/core/ontology/resolver.ts';
import { persistRecordColumns, persistRecordKeys } from '../../../src/core/section_record/index.ts';
import { principalCanAccessRecord } from '../../../src/core/security/record_scope.ts';
import { stripDataframeFramesFromTmMain } from '../../../src/core/tm_record/tm_record.ts';
import {
	type ToolActionContext,
	type ToolResponse,
	toolRequestId,
} from '../../../src/core/tools/module.ts';
import { normalizeRestoredSectionIds } from '../../../src/core/update/transform/section_id_restore.ts';
import {
	applyDataframeRestore,
	composeTimeMachineSnapshot,
	DataframeRestoreError,
	type DataframeSlotRestore,
	planDataframeRestore,
	refuseFramelessWipe,
	resolveDataframeSlotTipos,
} from './dataframe_restore.ts';
import { propagateRestoreToObservers, readComponentItems } from './restore_common.ts';

/**
 * SECTION restore (PHP apply_value model==='section'): the snapshot is a full
 * matrix-columns object; overwrite the live record's columns through the write
 * chokepoint (PHP element->set_data + save(), which stamps the modified audit).
 * Structural 'id' is not a column; every jsonb column present in the snapshot
 * is written (including 'data' section metadata — PHP set_data replaces all).
 */
async function restoreSection(
	tmRow: TimeMachineRow,
	sectionTipo: string,
	sectionId: number,
	userId: number,
): Promise<void> {
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) {
		throw new DedaloError('request.invalid_model', {
			coordinates: { section_tipo: sectionTipo },
			message: `No matrix table for '${sectionTipo}'`,
		});
	}
	const snapshot = tmRow.data;
	if (snapshot === null || typeof snapshot !== 'object') {
		throw new DedaloError('tool.target_not_found', {
			coordinates: { section_tipo: sectionTipo, section_id: sectionId, tm_id: tmRow.id },
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
	await persistRecordColumns({ table, sectionTipo, sectionId }, columns, { userId });
	// LEDGERED (no TS twin / no fixture): deleted-media relink, session-SQO
	// reset, and consuming (deleting) the restored TM row.
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
	if (tmRow.section_tipo !== sectionTipo || tmRow.section_id !== sectionId || tmRow.tipo !== tipo) {
		throw new DedaloError('request.invalid_options', {
			publicMessage: 'matrix_id does not belong to the requested target',
			coordinates: { tm_id: String(matrixId), section_tipo: sectionTipo, tipo },
		});
	}

	// SECTION restore: overwrite the whole record from the snapshot columns.
	if (model === 'section') {
		// Throws on refusal (the dispatch catch converts), so the activity row is
		// appended only for a restore that actually landed.
		await restoreSection(tmRow, sectionTipo, sectionId, userId);
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
	const snapshot = { value: tmRow.data };
	await normalizeRestoredSectionIds(snapshot);
	const canonicalSnapshot = snapshot.value;

	// Main data: strip dataframe frames (iri: keep only entries carrying `iri`).
	// SAME strip the tool_time_machine preview read applies (read.ts), so the
	// value the user previewed is exactly what this restore writes.
	const data = stripDataframeFramesFromTmMain(model, canonicalSnapshot);

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

	// The FRAME half (PHP apply_value :277-333). Planned before anything is
	// written so an unplaceable frame refuses the whole restore instead of
	// leaving the record half-restored.
	let framePlan: DataframeSlotRestore[];
	try {
		framePlan = await planDataframeRestore(
			tipo,
			canonicalSnapshot,
			await resolveDataframeSlotTipos(tipo),
		);
	} catch (error) {
		if (error instanceof DataframeRestoreError) {
			// The refusal sentence names slot tipos — LOG-only (the code's
			// disclosure is 'operator'), never echoed on the wire.
			throw new DedaloError('engine.uncovered_scope', {
				cause: error,
				coordinates: { tipo, section_tipo: sectionTipo },
				message: error.message,
			});
		}
		throw error;
	}

	// The frameless-wipe guard (dataframe_restore.ts): the CAPTURE half is
	// unported, so a TS-written snapshot carries no frames and applying this
	// plan would DELETE the live ones with no row anywhere to recover them.
	// Refuse before a single write, never "restore most of it".
	const framelessRefusal = await refuseFramelessWipe(writeTarget, tipo, framePlan);
	if (framelessRefusal !== null) {
		throw new DedaloError('engine.uncovered_scope', {
			coordinates: { tipo, section_tipo: sectionTipo, section_id: sectionId },
			message: framelessRefusal,
		});
	}

	// Pre-restore main value — the observer cascade needs the locators this
	// restore DROPS (targets whose mirror still references the record).
	const preRestoreItems = await readComponentItems(table, sectionTipo, sectionId, column, tipo);

	await withTransaction(async () => {
		// Frames FIRST (PHP restores the slots before saving the main).
		await applyDataframeRestore(writeTarget, framePlan);

		// Chokepoint write: restored value + the record's modified stamps in one
		// update (PHP: apply_value restores via element->save(), which stamps).
		await persistRecordKeys(
			writeTarget,
			[{ column: column as MatrixJsonbColumn, key: tipo, value: data }],
			{ userId },
		);
		// Restored items carry explicit ids; raise the counter so a later insert
		// cannot mint a duplicate (PHP raises on every set_data). For a
		// dataframe-paired main this is load-bearing: a duplicated main item id
		// would make two items answer to the same frame `id_key`.
		await absorbComponentItemIds(
			table,
			sectionTipo,
			sectionId,
			tipo,
			Array.isArray(data) ? data : [],
		);

		// Fresh TM audit for the restore itself (PHP: the component save creates a
		// new TM entry; the consumed row is kept). Its data is main + every
		// restored frame (PHP get_time_machine_data_to_save), so reverting the
		// restore brings the frames back with it. Stamp via the ONE shared
		// DEDALO_TIMEZONE-aware helper (S1-03) — never an inline UTC formatter.
		await recordTimeMachine(
			{
				sectionTipo,
				sectionId,
				componentTipo: tipo,
				lang,
				userId,
				data: composeTimeMachineSnapshot(data, framePlan),
			},
			dbTimestamp(),
		);
	});

	// Observer cascade, POST-COMMIT (PHP: apply_value restores through
	// element->save(), whose last act is propagate_to_observers — this port
	// wrote through the chokepoint directly and skipped it, so a TM restore of
	// an observed component left every mirror stale and logged no observer TM
	// row). Post-commit because a cascade hop refuses to run inside an ambient
	// transaction (B6, observers.ts).
	await propagateRestoreToObservers(tipo, sectionTipo, sectionId, preRestoreItems, data, userId);

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
