/**
 * tool_hierarchy handler — the hierarchy CONSISTENCY tool.
 *
 * Two actions, one writer:
 *
 *  - `inspect_hierarchy` (READ) — the invariant checklist for this hierarchy
 *    (ontology/src/core/ontology/hierarchy_state.ts `inspectHierarchy`). The client
 *    renders it as a status panel, so an operator can SEE why a hierarchy is unusable
 *    instead of pressing a button and hoping.
 *
 *  - `generate_virtual_section` (WRITE) — converge to that invariant
 *    (`ensureHierarchy`), or, with force_to_create, tear the ontology down first and
 *    rebuild (`rebuildHierarchy`). The name is kept because the client action + the
 *    tool registry are wire contract; the SEMANTICS are now "make this hierarchy
 *    consistent", which is what pressing it always meant.
 *
 * This handler no longer sequences provisioning + root-term seeding itself. It used to,
 * and that is exactly how it broke: `createThesaurusGeneralTerm` skipped the root term
 * whenever the hierarchy45 locator was merely PRESENT, and the seed presets a DANGLING
 * one on 158 of 269 records — so a hierarchy whose thesaurus had not been imported got
 * an ontology, an active flag, and a pointer to a term that never existed (live: Albania).
 * The invariant, and every write that establishes it, now lives in ONE module.
 *
 * WRITE gate (permission:'section', level >= 2) is enforced by tool_request.ts before
 * this handler runs (PHP security::assert_section_permission).
 */

import { clearOntologyDerivedCaches } from '../../../src/core/ontology/cache_invalidation.ts';
import {
	ensureHierarchy,
	inspectHierarchy,
	rebuildHierarchy,
} from '../../../src/core/ontology/hierarchy_state.ts';
import { deleteSectionRecord } from '../../../src/core/section/record/delete_record.ts';
import type { ToolActionContext, ToolResponse } from '../../../src/core/tools/module.ts';

/** The caller's hierarchy1 record, or null when the options are unusable. */
function targetOf(context: ToolActionContext): { sectionTipo: string; sectionId: number } | null {
	const sectionTipo =
		typeof context.options.section_tipo === 'string' ? context.options.section_tipo : '';
	const raw = context.options.section_id;
	const sectionId = raw === undefined || raw === null || raw === '' ? 0 : Number(raw);
	if (sectionTipo === '' || !Number.isFinite(sectionId) || sectionId <= 0) return null;
	return { sectionTipo, sectionId };
}

/** READ: the invariant checklist the client renders as the status panel. */
export async function toolHierarchyInspect(context: ToolActionContext): Promise<ToolResponse> {
	const target = targetOf(context);
	if (target === null) {
		return {
			result: false,
			msg: 'Error. Request failed [inspect_hierarchy]',
			errors: ['Missing section_id or section_tipo.'],
		};
	}
	const state = await inspectHierarchy(target.sectionId);
	return {
		result: true,
		msg: state.usable ? 'Hierarchy is ready' : 'Hierarchy is incomplete',
		errors: [],
		state,
	};
}

/** WRITE: converge to the invariant (force_to_create → tear the ontology down first). */
export async function toolHierarchyGenerateVirtualSection(
	context: ToolActionContext,
): Promise<ToolResponse> {
	const target = targetOf(context);
	if (target === null) {
		return {
			result: false,
			msg: 'Error. Request failed [generate_virtual_section]',
			errors: ['Missing section_id or section_tipo.'],
		};
	}
	const forceToCreate = context.options.force_to_create === true;

	const outcome = forceToCreate
		? await rebuildHierarchy(target.sectionId, context.userId, (st, sid) =>
				deleteSectionRecord(st, sid, context.userId),
			)
		: await ensureHierarchy(target.sectionId, context.userId);

	// The menu/tree read ontology-derived caches; a provisioned tld must show up now.
	await clearOntologyDerivedCaches();

	return {
		result: outcome.result,
		msg: outcome.msg,
		errors: outcome.errors,
		state: outcome.state,
		applied: outcome.applied,
	};
}
