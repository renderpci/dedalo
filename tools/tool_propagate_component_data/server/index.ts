/**
 * tool_propagate_component_data server module (PHP tool_propagate_component_data).
 *
 * propagate_component_data (backgroundRunnable): apply one component value across
 * every record matched by the client SQO — replace / delete / add. The target set
 * is a SEARCH (not a locator list); the source value is the client-supplied
 * `propagate_data_value`. Every write shares a bulk_process_id so tool_time_machine
 * can revert the whole batch (see bulk_revert_process).
 *
 * PERMISSION: PHP asserts write level 2 on the (section_tipo, component_tipo) PAIR
 * — there is no single record — so this uses `permission: null` + an imperative
 * getPermissions gate (the declarative record/tipo gates target one record/tipo).
 *
 * BACKGROUND: the handler publishes a throttled progress frame per record (the
 * `msg | section_label | counter of total | id:` line the client's SSE reader
 * renders) and honors `ctx.signal` at the loop boundary, so the panel's Stop
 * button really stops the batch — a partial run keeps its bulk_process_id and
 * stays revertible.
 *
 * The value decision (replace/delete/add + locator matching) is the tested pure
 * core `propagate.ts`; the write path mirrors the verified tool_time_machine
 * apply_value (persistRecordKeys + recordTimeMachine, NOT saveComponentData —
 * only the direct path threads a bulk_process_id into the TM row; the chokepoint
 * stamps the record's modified metadata like PHP's component->save()).
 */

import { config } from '../../../src/config/config.ts';
import { sanitizeClientSqo } from '../../../src/core/concepts/sqo.ts';
import { dbTimestamp } from '../../../src/core/db/db_timestamp.ts';
import { readMatrixRecord } from '../../../src/core/db/matrix.ts';
import type { MatrixJsonbColumn } from '../../../src/core/db/matrix.ts';
import { sql } from '../../../src/core/db/postgres.ts';
import { recordTimeMachine } from '../../../src/core/db/time_machine.ts';
import { termByTipo } from '../../../src/core/ontology/labels.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
	getTranslatableByTipo,
} from '../../../src/core/ontology/resolver.ts';
import { filterItemsByLang, readComponentItems } from '../../../src/core/resolve/component_data.ts';
import { buildSearchSql } from '../../../src/core/search/sql_assembler.ts';
import { createSectionRecord } from '../../../src/core/section/record/create_record.ts';
import { persistRecordKeys } from '../../../src/core/section_record/index.ts';
import { getPermissions } from '../../../src/core/security/permissions.ts';
import { principalCanAccessRecord } from '../../../src/core/security/record_scope.ts';
import type {
	ToolActionContext,
	ToolResponse,
	ToolServerModule,
} from '../../../src/core/tools/module.ts';
import { COMPONENTS_WITH_RELATIONS, type PropagateAction, applyPropagation } from './propagate.ts';

const BULK_PROCESS_SECTION_TIPO = 'dd800';
const BULK_PROCESS_LABEL_TIPO = 'dd796';
const VALID_ACTIONS: ReadonlySet<string> = new Set(['replace', 'delete', 'add']);

/** PHP component_common::$components_monovalue — cannot 'add' (single value only). */
const COMPONENTS_MONOVALUE: ReadonlySet<string> = new Set([
	'component_3d',
	'component_av',
	'component_geolocation',
	'component_image',
	'component_json',
	'component_password',
	'component_pdf',
	'component_publication',
	'component_model',
	'component_section_id',
	'component_security_access',
	'component_select',
	'component_select_lang',
	'component_svg',
	'component_text_area',
]);

function fail(message: string, errors: string[] = [message]): ToolResponse {
	return { result: false, msg: `Error. ${message}`, errors };
}

/** Best-effort bulk-process record + label (audit anchor; never fatal). */
async function createBulkProcess(label: string, userId: number): Promise<number | null> {
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
			// label is cosmetic; the bulk id is what matters for revert.
		}
		return bulkId;
	} catch {
		return null;
	}
}

async function propagateComponentData(ctx: ToolActionContext): Promise<ToolResponse> {
	const { options, userId, principal } = ctx;
	const sectionTipo = String(options.section_tipo ?? '');
	const componentTipo = String(options.component_tipo ?? '');
	const action = String(options.action ?? '') as PropagateAction;
	const lang = String(options.lang ?? 'lg-nolan');
	const total = Number(options.total ?? -1);
	const sqoRaw = options.sqo;
	const propagateValue = options.propagate_data_value ?? null;

	if (sectionTipo === '' || componentTipo === '' || !VALID_ACTIONS.has(action) || sqoRaw == null) {
		return fail(
			'Missing/invalid parameters: section_tipo, component_tipo, action(replace|delete|add), sqo',
			['invalid_request'],
		);
	}

	// Tipo-pair WRITE gate (PHP assert_tipo_permission(section_tipo, component_tipo, 2)).
	if ((await getPermissions(principal, sectionTipo, componentTipo)) < 2) {
		return fail('insufficient permissions on the target component', ['unauthorized']);
	}

	const model = await getModelByTipo(componentTipo);
	if (model === null) return fail(`unknown component tipo: ${componentTipo}`, ['invalid model']);
	const withRelations = COMPONENTS_WITH_RELATIONS.has(model);
	if (action === 'add' && COMPONENTS_MONOVALUE.has(model)) {
		return fail(`'add' is not allowed on mono-value model '${model}'`, ['invalid_request']);
	}
	const translatable = await getTranslatableByTipo(componentTipo);
	const column = getColumnNameByModel(model);
	if (column === null) return fail(`no matrix column for model '${model}'`, ['invalid model']);

	// Target set: the SQO search with NO limit (PHP forces limit/offset 0 = all).
	const sqo = sanitizeClientSqo(structuredClone(sqoRaw) as Record<string, unknown>);
	(sqo as { limit?: unknown; offset?: unknown }).limit = null;
	(sqo as { limit?: unknown; offset?: unknown }).offset = 0;
	const built = await buildSearchSql(sqo, { principal });
	const rows = (await sql.unsafe(built.sql, built.params as (string | number | null)[])) as {
		section_tipo: string;
		section_id: number;
	}[];

	// Count-drift ceiling: a live result larger than the client total means the
	// SQO widened — abort rather than touch unexpected records (PHP :row_count>total).
	if (total >= 0 && rows.length > total) {
		return fail(`count drift: ${rows.length} live > ${total} expected; aborting`, ['count_drift']);
	}

	const sectionLabel = await termByTipo(sectionTipo, config.menu.applicationLang);
	const bulkLabel = String(options.bulk_process_label ?? `Propagate ${action} to ${componentTipo}`);
	const bulkProcessId = await createBulkProcess(bulkLabel, userId);

	// Live progress + cooperative cancellation. The copied client renders
	// data.msg | data.section_label | data.counter of data.total | id:
	// data.current.section_id (render_tool_propagate_component_data.js
	// compound_msg) and its Stop button posts dd_utils_api::stop_process, which
	// aborts the executor's per-job AbortSignal. Neither was wired: a batch over
	// tens of thousands of records showed no progress and could not be stopped.
	// Throttled — every publish rewrites the pfile mirror (PHP print_cli parity).
	const publish = ctx.publishProgress ?? ((): void => {});
	const PROGRESS_MS = 250;
	let lastPublish = 0;
	let stopped = false;
	publish({
		msg: `Processing ${action}: ${componentTipo}`,
		is_running: true,
		counter: 0,
		total: rows.length,
		section_label: sectionLabel,
	});

	const errors: string[] = [];
	let counter = 0;
	for (const row of rows) {
		// Finish the current record, never abort mid-write (tool_update_cache
		// precedent). The partial run keeps its bulk_process_id, so whatever it
		// did write stays revertible through tool_time_machine.
		if (ctx.signal?.aborted === true) {
			stopped = true;
			break;
		}
		try {
			// TOOLS-01 (2026-07-28 audit): authorize EVERY write target on the
			// ROW's ACTUAL (section, component) — NOT the client-declared gate pair
			// checked once above. The SQO rows can address a different section than
			// section_tipo, incl. a non-projects-gated one (dd128 users) that
			// buildSearchSql does not narrow; without this a tool-granted editor
			// could write dd515 (developer) / dd133 (password) onto records they
			// cannot reach → self-escalation to admin. principalCanAccessRecord also
			// refuses section_id < 1 (the root user) before the admin bypass. Both
			// helpers pass a global admin through, so this only gates non-admins.
			if (!(await principalCanAccessRecord(row.section_tipo, row.section_id, principal))) {
				errors.push(`section_id ${row.section_id}: out of the user scope`);
				continue;
			}
			if ((await getPermissions(principal, row.section_tipo, componentTipo)) < 2) {
				errors.push(
					`section_id ${row.section_id}: no write permission on ${row.section_tipo}/${componentTipo}`,
				);
				continue;
			}
			const table = (await getMatrixTableFromTipo(row.section_tipo)) ?? 'matrix';
			const record = await readMatrixRecord(table, row.section_tipo, row.section_id);
			const allItems =
				record !== null ? (readComponentItems(record, componentTipo, model) ?? []) : [];
			const langSlice = translatable ? filterItemsByLang(allItems, lang) : allItems;
			const { final, changed } = applyPropagation(langSlice, action, propagateValue, withRelations);
			counter += 1;
			const now = Date.now();
			if (counter === rows.length || now - lastPublish >= PROGRESS_MS) {
				lastPublish = now;
				publish({
					msg: `Processing ${action}: ${componentTipo}`,
					is_running: true,
					counter,
					total: rows.length,
					section_label: sectionLabel,
					current: { section_tipo: row.section_tipo, section_id: row.section_id },
				});
			}
			if (!changed) continue;

			// Merge the mutated lang slice back into the full multi-lang array.
			const newAll = translatable
				? [
						...allItems.filter(
							(item) =>
								!(
									item !== null &&
									typeof item === 'object' &&
									(item as { lang?: string }).lang === lang
								),
						),
						...final,
					]
				: final;
			// Chokepoint write: propagated value + modified stamps in one update
			// (PHP propagates via set_data_lang + save(), which stamps).
			await persistRecordKeys(
				{ table, sectionTipo: row.section_tipo, sectionId: row.section_id },
				[{ column: column as MatrixJsonbColumn, key: componentTipo, value: newAll }],
				{ userId },
			);
			await recordTimeMachine(
				{
					sectionTipo: row.section_tipo,
					sectionId: row.section_id,
					componentTipo,
					lang,
					userId,
					data: newAll,
					bulkProcessId,
				},
				dbTimestamp(),
			);
		} catch (error) {
			errors.push(`section_id ${row.section_id}: ${(error as Error).message}`);
		}
	}

	return {
		result: true,
		msg: `${stopped ? 'STOPPED.' : 'OK.'} ${action} data of '${componentTipo}' in section '${sectionLabel}' ${errors.length === 0 ? 'successfully' : 'done with warnings'}. ${counter} of ${rows.length} record(s) processed.`,
		errors,
		action,
		section_label: sectionLabel,
		total,
		counter,
		records: rows.length,
		stopped,
		bulk_process_id: bulkProcessId,
	};
}

export const tool: ToolServerModule = {
	name: 'tool_propagate_component_data',
	apiActions: {
		propagate_component_data: { permission: null, handler: propagateComponentData },
	},
	backgroundRunnable: ['propagate_component_data'],
};
