/**
 * tool_ontology handler — PHP tools/tool_ontology/class.tool_ontology.php.
 *
 * The single developer-only action set_records_in_dd_ontology: parse ontology
 * section records and (up)sert their dd_ontology rows. Edit mode (section_id
 * present) processes one record; LIST mode processes the caller's live list SQO
 * — which is REQUIRED, because the scope of a batch write comes from the request
 * or the request is refused (WC-043). PHP took that scope from the session SQO
 * and wrote nothing when it was missing; the TS port had no session twin and
 * silently substituted "every record of the section" instead.
 *
 * Developer gating is enforced by tool_request.ts (permission:'developer'); the
 * internal isDeveloper assert here is defense-in-depth (PHP assert_developer()).
 */

import { setRecordsInDdOntology } from '../../../src/core/ontology/ontology_write.ts';
import type { ToolActionContext, ToolResponse } from '../../../src/core/tools/module.ts';

export async function toolOntologySetRecords(context: ToolActionContext): Promise<ToolResponse> {
	if (!context.principal.isDeveloper) {
		return {
			result: false,
			msg: 'Error. tool_ontology requires developer privileges',
			errors: ['unauthorized'],
		};
	}
	const sectionTipo =
		typeof context.options.section_tipo === 'string' ? context.options.section_tipo : '';
	if (sectionTipo === '') {
		return {
			result: false,
			msg: 'Error. Missing required parameter: section_tipo',
			errors: ['section_tipo is required'],
		};
	}
	const rawSectionId = context.options.section_id;
	const sectionId =
		rawSectionId === undefined || rawSectionId === null || rawSectionId === ''
			? null
			: Number(rawSectionId);

	// EDIT mode: one record, scope is the id itself.
	if (sectionId !== null) {
		const edited = await setRecordsInDdOntology({
			sectionTipo,
			sectionId,
			userId: context.userId,
		});
		return { result: edited.ok, msg: edited.msg, errors: edited.errors };
	}

	// LIST mode: the scope is the caller's LIVE list sqo, and it is REQUIRED.
	// PHP rebuilt it from the session and failed closed when absent; TS has no
	// session-SQO twin, so the client sends it. There is deliberately NO
	// whole-section fallback — an absent sqo once meant "rewrite every record of
	// the section" (up to 4,654 on one button, 12,172 across the install), which
	// is exactly the runaway WC-043 closed for tool_update_cache. An unfiltered
	// list still matches the whole section, but EXPLICITLY.
	const sqoRaw = context.options.sqo;
	if (sqoRaw === null || typeof sqoRaw !== 'object' || Array.isArray(sqoRaw)) {
		return {
			result: false,
			msg: 'Error. sqo is required (the scope to act on — no whole-section default; WC-043)',
			errors: ['invalid_request'],
		};
	}
	const { sanitizeClientSqo } = await import('../../../src/core/concepts/sqo.ts');
	const { buildSearchSql } = await import('../../../src/core/search/sql_assembler.ts');
	const { sql } = await import('../../../src/core/db/postgres.ts');

	const sqo = sanitizeClientSqo(structuredClone(sqoRaw) as Record<string, unknown>);
	// Pagination is stripped: the action processes the whole MATCHED set, not the
	// visible page (PHP set_order([]) / set_limit(0) / set_offset(0)).
	(sqo as { limit?: unknown; offset?: unknown }).limit = null;
	(sqo as { limit?: unknown; offset?: unknown }).offset = 0;
	const built = await buildSearchSql(sqo, { principal: context.principal });
	const rows = (await sql.unsafe(built.sql, built.params as (string | number | null)[])) as {
		section_id: number;
	}[];
	const sectionIds = rows.map((row) => Number(row.section_id));

	const response = await setRecordsInDdOntology({
		sectionTipo,
		sectionIds,
		userId: context.userId,
	});
	return {
		result: response.ok,
		msg: response.msg,
		errors: response.errors,
	};
}
