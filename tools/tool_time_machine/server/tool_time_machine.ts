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
 * property instead (frames never carry it). The restore then writes a fresh
 * TM audit row, so the restore itself is revertible (PHP: "the new save
 * immediately creates a fresh TM entry"; component restores do NOT delete
 * the consumed TM row).
 *
 * SECTION branch (recover a whole deleted/edited record): the TM snapshot's
 * data is a full matrix-columns object; it overwrites the live record via the
 * write chokepoint (PHP element->set_data + save()). LEDGERED vs PHP (no
 * fixture / no TS twin): deleted-media relink, the session-SQO reset (TS has no
 * PHP session), and the TM-row consumption (PHP deletes the restored snapshot;
 * TS keeps it — harmless, the fresh audit row supersedes it in the list).
 *
 * UNCOVERED SCOPE (denied loudly, never guessed): dataframe SLOT restore
 * (set_time_machine_data on the paired dd490 component — no has_dataframe
 * fixture exists on this instance to gate it against).
 */

import { dbTimestamp } from '../../../src/core/db/db_timestamp.ts';
import type { MatrixJsonbColumn } from '../../../src/core/db/matrix.ts';
import { MATRIX_JSONB_COLUMNS } from '../../../src/core/db/matrix.ts';
import {
	type TimeMachineRow,
	readTimeMachineRow,
	recordTimeMachine,
} from '../../../src/core/db/time_machine.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
} from '../../../src/core/ontology/resolver.ts';
import { persistRecordColumns, persistRecordKeys } from '../../../src/core/section_record/index.ts';
import { stripDataframeFramesFromTmMain } from '../../../src/core/tm_record/tm_record.ts';
import type { ToolActionContext, ToolResponse } from '../../../src/core/tools/module.ts';

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
): Promise<ToolResponse> {
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) {
		return {
			result: false,
			msg: `Error. No matrix table for '${sectionTipo}'`,
			errors: ['invalid model'],
		};
	}
	const snapshot = tmRow.data;
	if (snapshot === null || typeof snapshot !== 'object') {
		return { result: false, msg: 'Error. TM section snapshot is empty', errors: ['not_found'] };
	}
	const columns: Partial<Record<MatrixJsonbColumn, unknown>> = {};
	for (const [column, value] of Object.entries(snapshot as Record<string, unknown>)) {
		if (MATRIX_JSONB_COLUMNS.includes(column as MatrixJsonbColumn)) {
			columns[column as MatrixJsonbColumn] = value;
		}
	}
	await persistRecordColumns({ table, sectionTipo, sectionId }, columns, { userId });

	// LEDGERED (no TS twin / no fixture): deleted-media relink, session-SQO
	// reset, and consuming (deleting) the restored TM row.
	return { result: true, msg: 'OK. Request done successfully', errors: [] };
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
		return {
			result: false,
			msg: 'Error. Missing required parameters: section_tipo, tipo, matrix_id',
			errors: ['invalid_request'],
		};
	}

	const model = await getModelByTipo(tipo);
	if (model === null) {
		return { result: false, msg: `Error. Unknown tipo: ${tipo}`, errors: ['invalid model'] };
	}
	if (model !== 'section' && !model.startsWith('component_')) {
		return {
			result: false,
			msg: `Error. apply_value for model '${model}' is not restorable`,
			errors: ['invalid model'],
		};
	}
	if (options.caller_dataframe !== null && options.caller_dataframe !== undefined) {
		// Dataframe SLOT restore is uncovered scope (no fixture to gate it).
		return {
			result: false,
			msg: 'Error. apply_value with caller_dataframe is uncovered scope on this server (ledgered)',
			errors: ['uncovered_scope'],
		};
	}

	// TM row lookup — matrix_id is the PK of matrix_time_machine (shared reader).
	const tmRow = await readTimeMachineRow(Number(matrixId));
	if (tmRow === null) {
		return { result: false, msg: `Error. TM row not found: ${matrixId}`, errors: ['not_found'] };
	}
	// The snapshot must belong to the requested target — a mismatched matrix_id
	// would restore another record's history into this one.
	if (tmRow.section_tipo !== sectionTipo || tmRow.section_id !== sectionId || tmRow.tipo !== tipo) {
		return {
			result: false,
			msg: 'Error. TM row does not match the requested target',
			errors: ['invalid_request'],
		};
	}

	// SECTION restore: overwrite the whole record from the snapshot columns.
	if (model === 'section') {
		const outcome = await restoreSection(tmRow, sectionTipo, sectionId, userId);
		if (outcome.result === true) {
			await logRecoverActivity(
				context,
				'RECOVER SECTION',
				{
					msg: 'Recovered section record from time machine',
					section_id: String(sectionId),
					section_tipo: sectionTipo,
					top_id: String(sectionId),
					top_tipo: sectionTipo,
					table: (await getMatrixTableFromTipo(sectionTipo)) ?? 'matrix',
					tm_id: matrixId,
				},
				sectionTipo,
			);
		}
		return outcome;
	}

	// COMPONENT restore.
	// Main data: strip dataframe frames (iri: keep only entries carrying `iri`).
	// SAME strip the tool_time_machine preview read applies (read.ts), so the
	// value the user previewed is exactly what this restore writes.
	const data = stripDataframeFramesFromTmMain(model, tmRow.data);

	// Overwrite the live component value.
	const column = getColumnNameByModel(model);
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (column === null || table === null) {
		return {
			result: false,
			msg: `Error. No matrix column/table for '${model}' / '${sectionTipo}'`,
			errors: ['invalid model'],
		};
	}
	// Chokepoint write: restored value + the record's modified stamps in one
	// update (PHP: apply_value restores via element->save(), which stamps).
	await persistRecordKeys(
		{ table, sectionTipo, sectionId },
		[{ column: column as MatrixJsonbColumn, key: tipo, value: data }],
		{ userId },
	);

	// Fresh TM audit for the restore itself (PHP: the component save creates a
	// new TM entry; the consumed row is kept). Stamp via the ONE shared
	// DEDALO_TIMEZONE-aware helper (S1-03) — never an inline UTC formatter.
	await recordTimeMachine(
		{ sectionTipo, sectionId, componentTipo: tipo, lang, userId, data },
		dbTimestamp(),
	);

	await logRecoverActivity(
		context,
		'RECOVER COMPONENT',
		{
			msg: 'Recovered component data from time machine',
			model,
			section_id: String(sectionId),
			section_tipo: sectionTipo,
			table,
			tm_id: matrixId,
		},
		sectionTipo,
	);

	return { result: true, msg: 'OK. Request done successfully', errors: [] };
}
