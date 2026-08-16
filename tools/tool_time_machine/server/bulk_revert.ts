/**
 * tool_time_machine.bulk_revert_process (PHP tools/tool_time_machine::
 * bulk_revert_process) — undo a whole batch of component writes that share a
 * bulk_process_id (e.g. a tool_propagate_component_data run). For each component
 * touched by the batch, restore the value it had BEFORE the batch, and stamp the
 * restores with a NEW bulk_process_id so the revert is itself revertible.
 *
 * PERMISSION: module gate is section/level-2 on the request seed; because a batch
 * can span sections/components, EACH matched row is re-gated on its own
 * (section_tipo, tipo) SCHEMA pair AND on per-record scope (SEC-024 §9.4 — the
 * TM search applies no projects filter) inside the loop (skip-on-fail, never
 * abort — PHP parity).
 *
 * Write path: the VERIFIED apply_value direct path (persistRecordKeys +
 * recordTimeMachine), NOT saveComponentData — only it threads the bulk id.
 * The chokepoint stamps the record's modified metadata like every PHP save.
 *
 * DATAFRAME-PAIRED components take the SAME frame path as apply_value
 * (dataframe_restore.ts): the pre-batch snapshot's dd490 entries are replayed
 * into their slots and stripped out of the main column. PHP's bulk_revert did
 * neither — it fed the raw snapshot to set_data — which writes frame locators
 * into the main component's own key and leaves the slots at today's values.
 * That is the same corruption apply_value's strip exists to prevent, so the
 * two doors share one primitive rather than one of them keeping the defect
 * (deliberate divergence,
 * WC-2026-08-09-time-machine-restore-replays-paired-dataframe-frames).
 * A row whose pre-batch snapshot carries NO frames over LIVE frames is skipped
 * with a surfaced error instead of reverted (`refuseFramelessWipe` — the
 * unported capture half would make that revert an unrecoverable deletion).
 *
 * The observer cascade fires per reverted component, POST-COMMIT — PHP
 * reverted through `element->save()`, whose last act is
 * `propagate_to_observers()`.
 */

import { dbTimestamp } from '../../../src/core/db/db_timestamp.ts';
import type { MatrixJsonbColumn } from '../../../src/core/db/matrix.ts';
import { absorbComponentItemIds } from '../../../src/core/db/matrix_write.ts';
import { sql, withTransaction } from '../../../src/core/db/postgres.ts';
import { recordTimeMachine } from '../../../src/core/db/time_machine.ts';
import { DedaloError, ok } from '../../../src/core/errors/index.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
} from '../../../src/core/ontology/resolver.ts';
import { createSectionRecord } from '../../../src/core/section/record/create_record.ts';
import { persistRecordKeys } from '../../../src/core/section_record/index.ts';
import { getPermissions } from '../../../src/core/security/permissions.ts';
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
	type DataframeSlotRestore,
	planDataframeRestore,
	refuseFramelessWipe,
	resolveDataframeSlotTipos,
} from './dataframe_restore.ts';
import { propagateRestoreToObservers, readComponentItems } from './restore_common.ts';

const BULK_PROCESS_SECTION_TIPO = 'dd800';
const BULK_PROCESS_LABEL_TIPO = 'dd796';

interface TmRow {
	id: number;
	section_id: number;
	section_tipo: string;
	tipo: string;
	lang: string;
	bulk_process_id: number | null;
	data: unknown;
}

/**
 * Given a component's TM history ordered id DESC (newest first) and the batch's
 * bulk_process_id, return the pre-batch data: the row immediately OLDER than
 * EVERY row belonging to the batch.
 *
 * (!) Skipping ALL of the batch's rows — not just the first one — is the PHP
 * shape: its inner loop `continue`s on each row whose bulk_process_id matches,
 * so a batch that touched the same component twice (a CSV import carrying the
 * record twice, a multi-lang run) still reverts to the value from BEFORE the
 * batch. Taking `idx + 1` blindly restored a value the batch itself wrote.
 *
 * `found:false` means "no pre-batch state could be determined" and the caller
 * MUST NOT write: PHP's loop simply runs off the end and saves nothing. The one
 * case where an empty value IS written is the component's first-ever change
 * (PHP sub_n_rows===1 → []).
 */
export function preBulkState(
	historyDesc: readonly { bulk_process_id: number | null; data: unknown }[],
	targetBulkId: number,
): { data: unknown; found: boolean } {
	const idx = historyDesc.findIndex((row) => Number(row.bulk_process_id) === targetBulkId);
	if (idx === -1) return { data: [], found: false };
	// PHP sub_n_rows===1: the batch change is the only history row → blank it.
	if (historyDesc.length === 1) return { data: [], found: true };
	let older = idx + 1;
	while (
		older < historyDesc.length &&
		Number(historyDesc[older]?.bulk_process_id) === targetBulkId
	) {
		older += 1;
	}
	const row = historyDesc[older];
	// Every row belongs to the batch (and there is more than one): PHP writes
	// nothing rather than blanking the component.
	return row === undefined ? { data: [], found: false } : { data: row.data, found: true };
}

/** Best-effort dd800 bulk-process record + label so this revert is itself revertible. */
async function createRevertBulkProcess(label: string, userId: number): Promise<number | null> {
	try {
		const bulkId = await createSectionRecord(BULK_PROCESS_SECTION_TIPO, userId);
		try {
			const labelModel = await getModelByTipo(BULK_PROCESS_LABEL_TIPO);
			const labelColumn = labelModel !== null ? getColumnNameByModel(labelModel) : null;
			const labelTable = await getMatrixTableFromTipo(BULK_PROCESS_SECTION_TIPO);
			if (labelColumn !== null && labelTable !== null) {
				await persistRecordKeys(
					{ table: labelTable, sectionTipo: BULK_PROCESS_SECTION_TIPO, sectionId: bulkId },
					[
						{
							column: labelColumn as MatrixJsonbColumn,
							key: BULK_PROCESS_LABEL_TIPO,
							value: [{ lang: 'lg-nolan', value: label }],
						},
					],
					{ userId },
				);
			}
		} catch {
			// label is cosmetic.
		}
		return bulkId;
	} catch {
		return null;
	}
}

export async function toolTimeMachineBulkRevert(ctx: ToolActionContext): Promise<ToolResponse> {
	const { options, userId, principal } = ctx;
	const bulkProcessId = Number(options.bulk_process_id);
	if (!Number.isInteger(bulkProcessId) || bulkProcessId <= 0) {
		throw new DedaloError('request.invalid_options', {
			publicMessage: 'bulk_process_id must be a positive integer',
		});
	}

	// Every component write in the batch (id DESC).
	const batchRows = (await sql.unsafe(
		`SELECT id, section_id, section_tipo, tipo, lang, bulk_process_id, data
		 FROM matrix_time_machine WHERE bulk_process_id = $1 ORDER BY id DESC`,
		[bulkProcessId],
	)) as TmRow[];
	if (batchRows.length === 0) {
		throw new DedaloError('tool.target_not_found', {
			coordinates: { bulk_process_id: bulkProcessId },
			message: `No changes found for bulk_process_id ${bulkProcessId}`,
		});
	}

	const label = String(options.bulk_revert_process_label ?? `Revert bulk process ${bulkProcessId}`);
	const newBulkId = await createRevertBulkProcess(label, userId);

	// Hoisted out of the loop: one dynamic import, not one per reverted row.
	const { logActivity, hostFromClientIp } = await import(
		'../../../src/core/api/handlers/activity_log.ts'
	);
	const activityHost = hostFromClientIp(ctx.clientIp);

	const errors: string[] = [];
	let counter = 0;
	for (const row of batchRows) {
		try {
			const model = await getModelByTipo(row.tipo);
			if (model === null || !model.startsWith('component_')) {
				// Only component rows are reverted here (section restores = apply_value).
				continue;
			}
			// Per-row (section_tipo, tipo) WRITE gate — skip on fail, never abort (PHP).
			// SEC-024 §9.4 is the SECOND half: the batch row set comes from a TM
			// search that applies NO projects filter, so a bulk id may name records
			// outside the caller's scope. PHP asserts both here; only the schema
			// half was ported.
			if (
				(await getPermissions(principal, row.section_tipo, row.tipo)) < 2 ||
				!(await principalCanAccessRecord(row.section_tipo, row.section_id, principal))
			) {
				errors.push(`permissions_denied: ${row.section_tipo}/${row.tipo}#${row.section_id}`);
				continue;
			}

			// Full per-component history (id DESC) → the pre-batch snapshot.
			const history = (await sql.unsafe(
				`SELECT bulk_process_id, data FROM matrix_time_machine
				 WHERE tipo = $1 AND section_tipo = $2 AND section_id = $3 ORDER BY id DESC`,
				[row.tipo, row.section_tipo, row.section_id],
			)) as { bulk_process_id: number | null; data: unknown }[];
			const { data: revertData, found } = preBulkState(history, bulkProcessId);
			if (!found) {
				// No determinable pre-batch state — PHP saves nothing rather than
				// blanking the component. Surfaced, never silent.
				errors.push(`no pre-batch state: ${row.section_tipo}/${row.tipo}#${row.section_id}`);
				continue;
			}

			const column = getColumnNameByModel(model);
			const table = await getMatrixTableFromTipo(row.section_tipo);
			if (column === null || table === null) {
				errors.push(`no column/table for ${model}/${row.section_tipo}`);
				continue;
			}
			const writeTarget = { table, sectionTipo: row.section_tipo, sectionId: row.section_id };

			// int-canonical convergence on the reverted value (WC-2026-08-10-
			// section-id-int-canonical D6.2): pre-migration TM states carry
			// string-form addresses; converting on the way back in keeps the
			// revert from undoing the sweep. Same kernel, same rule. Done BEFORE
			// the frame strip/plan so both read the canonical addresses.
			const revertContainer = { value: revertData };
			await normalizeRestoredSectionIds(revertContainer);
			const canonicalRevertData = revertContainer.value;

			// A `component_dataframe` row IS a slot: its snapshot's dd490 entries
			// are its own value, so it takes neither the frame strip nor a slot
			// plan (there is no TM preview to disagree with here, unlike
			// apply_value — see that door's header).
			const isSlotRow = model === 'component_dataframe';
			const mainData = isSlotRow
				? canonicalRevertData
				: stripDataframeFramesFromTmMain(model, canonicalRevertData);
			const framePlan: DataframeSlotRestore[] = isSlotRow
				? []
				: await planDataframeRestore(
						row.tipo,
						canonicalRevertData,
						await resolveDataframeSlotTipos(row.tipo),
					);

			// Same frameless-wipe guard as apply_value: a snapshot with no frames
			// over live frames would DELETE them unrecoverably (the CAPTURE half is
			// unported — dataframe_restore.ts). Surfaced per row, never silent, and
			// this component is left untouched rather than half-reverted.
			const framelessRefusal = await refuseFramelessWipe(writeTarget, row.tipo, framePlan);
			if (framelessRefusal !== null) {
				errors.push(`${row.section_tipo}/${row.tipo}#${row.section_id}: ${framelessRefusal}`);
				continue;
			}

			// The locators this revert DROPS — the observer cascade needs them.
			const preRevertItems = await readComponentItems(
				table,
				row.section_tipo,
				row.section_id,
				column,
				row.tipo,
			);

			await withTransaction(async () => {
				// Frames FIRST (PHP apply_value's order; see dataframe_restore.ts).
				await applyDataframeRestore(writeTarget, framePlan);
				await persistRecordKeys(
					writeTarget,
					[{ column: column as MatrixJsonbColumn, key: row.tipo, value: mainData }],
					{ userId },
				);
				// Reverted items carry explicit ids; raise the counter so a later
				// insert cannot mint a duplicate (PHP raises on every set_data).
				await absorbComponentItemIds(
					table,
					row.section_tipo,
					row.section_id,
					row.tipo,
					Array.isArray(mainData) ? mainData : [],
				);
				await recordTimeMachine(
					{
						sectionTipo: row.section_tipo,
						sectionId: row.section_id,
						componentTipo: row.tipo,
						lang: row.lang,
						userId,
						data: composeTimeMachineSnapshot(mainData, framePlan),
						bulkProcessId: newBulkId,
					},
					dbTimestamp(),
				);
			});

			// POST-COMMIT (a cascade hop refuses to run inside a transaction).
			await propagateRestoreToObservers(
				row.tipo,
				row.section_tipo,
				row.section_id,
				preRevertItems,
				mainData,
				userId,
			);
			// One activity row PER REVERTED COMPONENT — PHP logs inside its loop
			// too (tool_time_machine :419). A wide bulk therefore appends many
			// rows; that is the audit trail behaving correctly, since each row is
			// a distinct component whose value changed.
			await logActivity({
				what: 'RECOVER COMPONENT',
				tipo: row.section_tipo, // WHERE = the SECTION tipo (PHP), not row.tipo
				userId,
				host: activityHost,
				data: {
					msg: 'Recovered component data from time machine',
					model,
					section_id: row.section_id,
					section_tipo: row.section_tipo,
					table,
					tm_id: newBulkId,
				},
			});
			counter += 1;
		} catch (error) {
			errors.push(`${row.section_tipo}/${row.tipo}#${row.section_id}: ${(error as Error).message}`);
		}
	}

	// `skipped` is the per-row refusal/failure list — a NON-FATAL part of the
	// payload (the batch never aborts on one row), so it rides inside `data`
	// instead of the legacy body's `errors[]`, which meant "the call failed".
	return ok(
		{ counter, bulk_process_id: newBulkId, skipped: errors },
		{ requestId: toolRequestId(ctx) },
	);
}
