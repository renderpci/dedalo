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

	const errors: string[] = [];
	let counter = 0;
	for (const row of rows) {
		try {
			const table = (await getMatrixTableFromTipo(row.section_tipo)) ?? 'matrix';
			const record = await readMatrixRecord(table, row.section_tipo, row.section_id);
			const allItems =
				record !== null ? (readComponentItems(record, componentTipo, model) ?? []) : [];
			const langSlice = translatable ? filterItemsByLang(allItems, lang) : allItems;
			const { final, changed } = applyPropagation(langSlice, action, propagateValue, withRelations);
			counter += 1;
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
		msg: `OK. ${action} data of '${componentTipo}' in section '${sectionLabel}' ${errors.length === 0 ? 'successfully' : 'done with warnings'}.`,
		errors,
		action,
		section_label: sectionLabel,
		total,
		counter,
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
