/**
 * tool_time_machine.bulk_revert_process (PHP tools/tool_time_machine::
 * bulk_revert_process) — undo a whole batch of component writes that share a
 * bulk_process_id (e.g. a tool_propagate_component_data run). For each component
 * touched by the batch, restore the value it had BEFORE the batch, and stamp the
 * restores with a NEW bulk_process_id so the revert is itself revertible.
 *
 * PERMISSION: module gate is section/level-2 on the request seed; because a batch
 * can span sections/components, EACH matched row is re-gated on its own
 * (section_tipo, tipo) inside the loop (skip-on-fail, never abort — PHP parity).
 *
 * Write path: the VERIFIED apply_value direct path (persistRecordKeys +
 * recordTimeMachine), NOT saveComponentData — only it threads the bulk id.
 * The chokepoint stamps the record's modified metadata like every PHP save.
 */

import { dbTimestamp } from '../../../src/core/db/db_timestamp.ts';
import type { MatrixJsonbColumn } from '../../../src/core/db/matrix.ts';
import { sql } from '../../../src/core/db/postgres.ts';
import { recordTimeMachine } from '../../../src/core/db/time_machine.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
} from '../../../src/core/ontology/resolver.ts';
import { createSectionRecord } from '../../../src/core/section/record/create_record.ts';
import { persistRecordKeys } from '../../../src/core/section_record/index.ts';
import { getPermissions } from '../../../src/core/security/permissions.ts';
import type { ToolActionContext, ToolResponse } from '../../../src/core/tools/module.ts';

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
 * bulk_process_id, return the pre-batch data: the row immediately OLDER than the
 * batch row. When the batch row is the component's oldest/only row (the batch was
 * its first-ever change), the pre-batch state is empty (PHP sub_n_rows===1 → []).
 */
export function preBulkState(
	historyDesc: readonly { bulk_process_id: number | null; data: unknown }[],
	targetBulkId: number,
): { data: unknown; found: boolean } {
	const idx = historyDesc.findIndex((row) => Number(row.bulk_process_id) === targetBulkId);
	if (idx === -1) return { data: [], found: false };
	const older = historyDesc[idx + 1];
	return { data: older ? older.data : [], found: true };
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
		return {
			result: false,
			msg: 'Error. bulk_process_id is required',
			errors: ['invalid_request'],
		};
	}

	// Every component write in the batch (id DESC).
	const batchRows = (await sql.unsafe(
		`SELECT id, section_id, section_tipo, tipo, lang, bulk_process_id, data
		 FROM matrix_time_machine WHERE bulk_process_id = $1 ORDER BY id DESC`,
		[bulkProcessId],
	)) as TmRow[];
	if (batchRows.length === 0) {
		return {
			result: false,
			msg: `Error. No changes found for bulk_process_id ${bulkProcessId}`,
			errors: ['not_found'],
		};
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
			if ((await getPermissions(principal, row.section_tipo, row.tipo)) < 2) {
				errors.push(`permissions_denied: ${row.section_tipo}/${row.tipo}#${row.section_id}`);
				continue;
			}

			// Full per-component history (id DESC) → the pre-batch snapshot.
			const history = (await sql.unsafe(
				`SELECT bulk_process_id, data FROM matrix_time_machine
				 WHERE tipo = $1 AND section_tipo = $2 AND section_id = $3 ORDER BY id DESC`,
				[row.tipo, row.section_tipo, row.section_id],
			)) as { bulk_process_id: number | null; data: unknown }[];
			const { data: revertData } = preBulkState(history, bulkProcessId);

			const column = getColumnNameByModel(model);
			const table = await getMatrixTableFromTipo(row.section_tipo);
			if (column === null || table === null) {
				errors.push(`no column/table for ${model}/${row.section_tipo}`);
				continue;
			}
			await persistRecordKeys(
				{ table, sectionTipo: row.section_tipo, sectionId: row.section_id },
				[{ column: column as MatrixJsonbColumn, key: row.tipo, value: revertData }],
				{ userId },
			);
			await recordTimeMachine(
				{
					sectionTipo: row.section_tipo,
					sectionId: row.section_id,
					componentTipo: row.tipo,
					lang: row.lang,
					userId,
					data: revertData,
					bulkProcessId: newBulkId,
				},
				dbTimestamp(),
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
					section_id: String(row.section_id),
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

	return {
		result: true,
		msg: `OK. Bulk revert done${errors.length > 0 ? ' with warnings' : ''}. Reverted ${counter} component(s).`,
		errors,
		counter,
		bulk_process_id: newBulkId,
	};
}
