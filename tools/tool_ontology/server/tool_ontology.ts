/**
 * tool_ontology handler — PHP tools/tool_ontology/class.tool_ontology.php.
 *
 * The single developer-only action set_records_in_dd_ontology: parse ontology
 * section records and (up)sert their dd_ontology rows. Edit mode (section_id
 * present) processes one record; list mode processes the whole section (the TS
 * full-section scan — PHP filters by the session SQO, which TS has no twin of;
 * ledgered in ontology_write.ts).
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

	const response = await setRecordsInDdOntology({ sectionTipo, sectionId, userId: context.userId });
	return {
		result: response.result,
		msg: response.msg,
		errors: response.errors,
	};
}
