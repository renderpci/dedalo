/**
 * tool_hierarchy handler — PHP tools/tool_hierarchy/class.tool_hierarchy.php.
 *
 * Single action generate_virtual_section: provision a hierarchy's virtual
 * sections (<tld>1 descriptors, <tld>2 models) + dd_ontology nodes, then seed the
 * two thesaurus portal roots (hierarchy45 General Term, hierarchy59 General Term
 * Model) so the tree shows the hierarchy immediately. force_to_create tears down
 * any pre-existing virtual sections first (ontology::delete_main). Cache is
 * cleared at the end so the menu reflects the new hierarchy.
 *
 * WRITE gate (permission:'section', level >= 2) is enforced by tool_request.ts
 * before this handler runs (PHP security::assert_section_permission).
 */

import { clearOntologyDerivedCaches } from '../../../src/core/ontology/cache_invalidation.ts';
import {
	createThesaurusGeneralTerm,
	generateVirtualSection,
} from '../../../src/core/ontology/hierarchy_provision.ts';
import { deleteOntologyMain } from '../../../src/core/ontology/ontology_delete.ts';
import { deleteSectionRecord } from '../../../src/core/section/record/delete_record.ts';
import type { ToolActionContext, ToolResponse } from '../../../src/core/tools/module.ts';

export async function toolHierarchyGenerateVirtualSection(
	context: ToolActionContext,
): Promise<ToolResponse> {
	const errors: string[] = [];
	const sectionTipo =
		typeof context.options.section_tipo === 'string' ? context.options.section_tipo : '';
	const rawSectionId = context.options.section_id;
	const sectionId =
		rawSectionId === undefined || rawSectionId === null || rawSectionId === ''
			? 0
			: Number(rawSectionId);
	const forceToCreate = context.options.force_to_create === true;

	if (sectionId <= 0 || sectionTipo === '') {
		return {
			result: false,
			msg: 'Error. Request failed [generate_virtual_section]',
			errors: ['Missing section_id or section_tipo.'],
		};
	}

	// Teardown existing virtual sections (non-fatal — errors collected, not blocking).
	if (forceToCreate) {
		const deleteResponse = await deleteOntologyMain(sectionTipo, sectionId, (st, sid) =>
			deleteSectionRecord(st, sid, context.userId),
		);
		if (deleteResponse.errors.length > 0) {
			errors.push(...deleteResponse.errors);
		}
	}

	// Provision the virtual sections + dd_ontology nodes.
	const hierarchyResponse = await generateVirtualSection({
		section_id: sectionId,
		section_tipo: sectionTipo,
		userId: context.userId,
	});
	if (hierarchyResponse.errors.length > 0) {
		errors.push(...hierarchyResponse.errors);
	}

	// Seed the thesaurus portal roots (hierarchy45 then hierarchy59).
	const createdGeneralTerm = await createThesaurusGeneralTerm(
		sectionTipo,
		sectionId,
		'hierarchy45',
	);
	const createdGeneralTermModel = await createThesaurusGeneralTerm(
		sectionTipo,
		sectionId,
		'hierarchy59',
	);

	// Menu/cache refresh.
	await clearOntologyDerivedCaches();

	return {
		result: hierarchyResponse.result,
		msg: hierarchyResponse.msg,
		errors,
		created_general_term: createdGeneralTerm,
		created_general_term_model: createdGeneralTermModel,
	};
}
