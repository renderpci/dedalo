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

import { DedaloError, ok } from '../../../src/core/errors/index.ts';
import { clearOntologyDerivedCaches } from '../../../src/core/ontology/cache_invalidation.ts';
import {
	ensureHierarchy,
	inspectHierarchy,
	rebuildHierarchy,
} from '../../../src/core/ontology/hierarchy_state.ts';
import { deleteSectionRecord } from '../../../src/core/section/record/delete_record.ts';
import {
	type ToolActionContext,
	type ToolResponse,
	toolRequestId,
} from '../../../src/core/tools/module.ts';

/** Neither action can address a hierarchy without its record — a caller fault. */
function missingTarget(action: string): DedaloError {
	return new DedaloError('request.invalid_options', {
		coordinates: { action },
		message: `Missing section_id or section_tipo [${action}]`,
		publicMessage: 'section_tipo and a positive section_id are required',
	});
}

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
	if (target === null) throw missingTarget('inspect_hierarchy');
	// `usable` inside the state IS the verdict the panel renders — the legacy
	// body's 'Hierarchy is ready/incomplete' msg only restated it.
	const state = await inspectHierarchy(target.sectionId);
	return ok({ state }, { requestId: toolRequestId(context) });
}

/** WRITE: converge to the invariant (force_to_create → tear the ontology down first). */
export async function toolHierarchyGenerateVirtualSection(
	context: ToolActionContext,
): Promise<ToolResponse> {
	const target = targetOf(context);
	if (target === null) throw missingTarget('generate_virtual_section');
	const forceToCreate = context.options.force_to_create === true;

	const outcome = forceToCreate
		? await rebuildHierarchy(target.sectionId, context.userId, (st, sid) =>
				deleteSectionRecord(st, sid, context.userId),
			)
		: await ensureHierarchy(target.sectionId, context.userId);

	// The menu/tree read ontology-derived caches; a provisioned tld must show up now.
	await clearOntologyDerivedCaches();

	if (!outcome.ok) {
		// A NAMED failure extension key (ERRORS_SPEC §3.0, the `start`/`environment`
		// precedent): the refused client re-renders its checklist from `state`, and
		// without it the panel can only print a sentence. `errors` is the per-check
		// detail behind that same panel.
		throw new DedaloError('tool.action_failed', {
			coordinates: { section_tipo: target.sectionTipo, section_id: target.sectionId },
			message: outcome.msg,
			extend: { state: outcome.state, errors: outcome.errors },
		});
	}
	return ok(
		{ state: outcome.state, applied: outcome.applied, summary: outcome.msg },
		{ requestId: toolRequestId(context) },
	);
}
