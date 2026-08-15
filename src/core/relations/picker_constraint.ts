/**
 * PICKER CONSTRAINT — the ONE resolver behind the thesaurus picker's
 * affordances AND behind the relation write chokepoint that persists a pick.
 *
 * WHY IT IS ONE MODULE. The picker asks two questions and the save asks the
 * same two: "which sections may this caller link into" and "how many more may
 * it hold". Answered twice, the two answers drift and the UI offers what the
 * write refuses (or, worse, the reverse). So the read path (the area picker
 * read, which decides what the tree renders) and the write path
 * (`relations/save.ts validateRelationInsert`) both call the functions here —
 * the affordance and the persistence answer are literally the same value.
 * Nothing the request carries feeds them: the caller ddo names itself and the
 * server derives the rest (picker plan §1.2 — a client-declared cap or target
 * set is a second authority that can be forged or go stale).
 *
 * WHAT IT DOES NOT DO (picker plan §1.8, the table). The caller's
 * request_config contributes EXACTLY ONE fact: which section(s) the picker
 * opens. It does NOT bound the tree (a thesaurus is browsed, not paged — no
 * `sqo_config.limit` is read here), it does NOT render the tree (the caller's
 * `ddo_map` governs how a LINKED value is displayed back in the caller, and is
 * never pushed into the picker), and it does NOT decide selectability. The
 * only count that exists is the caller's own `properties.data_limit`.
 *
 * PER-TERM SELECTABILITY IS THE TERM'S OWN ANSWER (picker plan §1.9) — see
 * {@link isTermSelectable}: relation mode means the thesaurus itself declares,
 * term by term, what may be linked. That rule is `ts_object.isIndexable` and is
 * NOT reimplemented here.
 */

import { asSectionId, canonicalizeStoredSectionId } from '../concepts/section_id.ts';
import { readMatrixRecord } from '../db/matrix.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
	getNode,
} from '../ontology/resolver.ts';
import { getSectionRealTipo } from '../resolve/security_access_datalist.ts';
import { isIndexable } from '../ts_object/ts_object.ts';
import { getElementTargetSectionTipos } from './request_config/build.ts';

/**
 * The resolved constraint for ONE picker caller.
 *
 * Field names are the wire names the picker read emits and the client's
 * `attach_picker` consumes — snake_case like every other context field, not
 * the camelCase of internal TS.
 */
export interface PickerConstraint {
	/**
	 * The caller's resolved `properties.data_limit`: how many locators this
	 * component may hold in total. `null` = ABSENT = uncapped. A literal `0`
	 * is a real answer ("none may be linked") and is returned as `0`.
	 */
	selection_limit: number | null;
	/**
	 * `selection_limit - (locators the caller already holds)`, or `null` when
	 * uncapped. This — never `selection_limit` — is what a picker session may
	 * add. May be NEGATIVE (a component that already exceeds a limit tightened
	 * after the fact); deliberately not clamped, because "over capacity by 2"
	 * is information an operator needs and `<= 0` is the one test consumers
	 * make anyway.
	 */
	remaining: number | null;
	/**
	 * The sections this caller may link into, REAL-resolved (see
	 * {@link isTargetAllowed} for the comparison law). Empty = the caller
	 * declares no target at all; that is not "nothing is allowed", it is "no
	 * target constraint exists" — the write path's declared exemption.
	 */
	targets: string[];
}

/**
 * The mode the target set is resolved in — ONE constant, because the read path
 * and the write path must ask the identical question.
 *
 * 'search' is `getElementTargetSectionTipos`' own documented default (PHP
 * get_section_elements_context instantiates every element in search mode). For
 * a COMPONENT owner it is also indistinguishable from 'edit': the section_list
 * source substitution only fires in list/tm/list_thesaurus
 * (`request_config/build.ts buildStrategyRequestConfig`), and nothing else in
 * the explicit/implicit builders reads the mode while resolving
 * `sqo.section_tipo`. The write path has no mode to offer, so pinning it here
 * is what keeps the two call sites from diverging.
 */
const TARGET_RESOLUTION_MODE = 'search';

/**
 * Resolve the picker constraint for a caller ddo.
 *
 * `callerSectionId` is the record the caller component sits on — the picker's
 * capacity is a property of THAT record's stored value, not of the component
 * in the abstract. Accepts the URL-shaped string the picker request carries and
 * canonicalizes it (`concepts/section_id.ts`); anything that is not a record
 * address throws rather than silently counting zero locators and handing back a
 * too-generous `remaining`.
 */
export async function resolvePickerConstraint(
	callerTipo: string,
	callerSectionTipo: string,
	callerSectionId: number | string,
): Promise<PickerConstraint> {
	const sectionId = asSectionId(canonicalizeStoredSectionId(callerSectionId));

	const selectionLimit = await resolveSelectionLimit(callerTipo);
	const held = await countHeldLocators(callerTipo, callerSectionTipo, sectionId);
	const targets = await resolveTargets(callerTipo, callerSectionTipo);

	return {
		selection_limit: selectionLimit,
		remaining: selectionLimit === null ? null : selectionLimit - held,
		targets,
	};
}

/**
 * The caller's `properties.data_limit`, or null when absent.
 *
 * SOURCE. The ontology node's own top-level properties — which IS what the
 * client reads: in edit mode `context.properties` is a sanitized deep clone of
 * exactly this object (`resolve/structure_context.ts resolveEmittedPropertiesAndCss`),
 * and `component_portal.js data_limit_reached` reads
 * `self.context.properties.data_limit` off it. Same bytes, one meaning.
 *
 * TWO DELIBERATE DIVERGENCES FROM THE CLIENT GUARD, both stated in the picker
 * plan §1.8:
 *   - the client's `if (data_limit && …)` treats a literal `0` as "no limit"
 *     (JS truthiness). Here `0` means "none may be linked" and is honoured;
 *     ABSENT is the uncapped case, and the two are different facts.
 *   - the client counts only the entries on the loaded page ("a soft
 *     client-side cap", its own comment). This counts the stored array.
 *
 * A PRESENT-BUT-UNUSABLE value THROWS (CONVENTIONS §1 fail-loud: a contract
 * violation naming the module and the input). Degrading to "uncapped" would
 * turn an ontology typo into a silently unlimited component on the write path;
 * degrading to `0` would lock a live component out of editing. Neither is an
 * answer, so there is no third behaviour to pick between — the operator fixes
 * the node.
 */
async function resolveSelectionLimit(callerTipo: string): Promise<number | null> {
	const properties = (await getNode(callerTipo))?.properties as
		| { data_limit?: unknown }
		| null
		| undefined;
	const declared = properties?.data_limit;
	if (declared === undefined || declared === null) return null;
	if (typeof declared !== 'number' || !Number.isInteger(declared) || declared < 0) {
		throw new DedaloError('area.picker_caller_invalid', {
			message:
				`[relations/picker_constraint] node '${callerTipo}' declares an unusable ` +
				`properties.data_limit (${JSON.stringify(declared)}). It must be a JSON number: a ` +
				'non-negative integer, or absent for no limit.',
			publicMessage: 'The picker caller declares an unusable data_limit',
			coordinates: { tipo: callerTipo },
		});
	}
	return declared;
}

/**
 * How many locators the caller already holds on this record.
 *
 * REUSES the engine's one way of reading a component's relation entries —
 * `getMatrixTableFromTipo` → `readMatrixRecord` → `columns[<column>][<tipo>]`,
 * the same three steps `ts_object.isIndexable`, `relations/save.ts` (its
 * `existingItems`) and `section/record/delete_record.ts` take. No new query,
 * and in particular the SAME array the write path dedups against, so
 * `remaining` and the insert refusal count identically.
 *
 * The column comes from the model (`getColumnNameByModel`) rather than a
 * hardcoded 'relation' — and a caller whose model does not store in the
 * relation column is an UNCOVERED path, not a zero: it throws naming the node
 * and its model. Only relation-family components reach the picker (the read
 * path grants picker mode on model + view), so this can only fire on a wiring
 * mistake, and a wiring mistake must not answer "capacity: unlimited".
 *
 * A record that does not exist yet (a new, unsaved caller record) holds
 * nothing — 0, which is an answer, not a missing one.
 */
async function countHeldLocators(
	callerTipo: string,
	callerSectionTipo: string,
	sectionId: number,
): Promise<number> {
	const model = await getModelByTipo(callerTipo);
	const column = model === null ? null : getColumnNameByModel(model);
	if (column !== 'relation') {
		throw new DedaloError('area.picker_caller_invalid', {
			message:
				`[relations/picker_constraint] node '${callerTipo}' (model '${String(model)}') does not ` +
				`store in the relation column (resolved column: ${String(column)}), so it holds no ` +
				'locators to count. Only relation-family components carry a picker constraint.',
			publicMessage: 'Only relation-family components carry a picker constraint',
			coordinates: { tipo: callerTipo, model: String(model) },
		});
	}
	const table = await getMatrixTableFromTipo(callerSectionTipo);
	if (table === null) {
		throw new DedaloError('area.picker_caller_invalid', {
			message:
				`[relations/picker_constraint] section '${callerSectionTipo}' resolves to no matrix ` +
				`table, so the locators held by '${callerTipo}' cannot be counted.`,
			publicMessage: "The picker caller's section holds no records",
			coordinates: { tipo: callerTipo, section_tipo: callerSectionTipo },
		});
	}
	const record = await readMatrixRecord(table, callerSectionTipo, sectionId);
	const items = (record?.columns.relation as Record<string, unknown[]> | null)?.[callerTipo];
	return Array.isArray(items) ? items.length : 0;
}

/**
 * The caller's target sections, REAL-resolved and deduped.
 *
 * ONE ACCESSOR, NOT A RE-DERIVATION. `getElementTargetSectionTipos`
 * (`request_config/build.ts`) is the resolved accessor — it builds the caller's
 * request_config through the ordinary seam (explicit/implicit + the
 * model-default targetSource) and projects the sqo targets with
 * `extractSqoSectionTipos`. It is the SAME projection `structure_context.ts`
 * uses to emit `context.target_sections`, so the picker's target set and the
 * target list the client already receives cannot disagree.
 *
 * ON "the MAIN sqo" (picker plan §1.3/§1.8 phrasing): every config item the
 * builders produce is typed 'main' unless the ontology says otherwise
 * (`explicit.ts` defaults `type` to 'main'; `implicit.ts` hardcodes it), and a
 * handful of live nodes declare their ONLY config as `type: "internal"`.
 * Filtering to 'main' would resolve those to zero targets and hand the write
 * path the no-target exemption — i.e. it would REMOVE a constraint. The
 * accessor's every-config projection is therefore what is used, and it is also
 * the one that matches `context.target_sections`.
 *
 * VIRTUAL RESOLUTION. Each tipo goes through `getSectionRealTipo`, so a
 * declared virtual target (rsc170 → rsc2) and a real one name the same thing.
 * The returned set is the REAL side of the comparison; the other side must be
 * resolved too — see {@link isTargetAllowed}.
 *
 * Deduping is safe HERE and only here: this is a membership set, not the
 * `target_sections` wire list (which mirrors PHP's cross-config concatenation
 * verbatim and must keep its repeats).
 */
async function resolveTargets(callerTipo: string, callerSectionTipo: string): Promise<string[]> {
	const declared = await getElementTargetSectionTipos(
		callerTipo,
		callerSectionTipo,
		TARGET_RESOLUTION_MODE,
	);
	// Keep the DECLARED tipos, deduped — do NOT collapse them to their real
	// sections here. EVERY thesaurus is a virtual section over the same real
	// node (`es1`, `ad1`, `fr1` … all real-resolve to `hierarchy20`), so
	// real-resolving the declared side makes a caller that names ONE thesaurus
	// indistinguishable from one that names all ~150 — i.e. the target
	// constraint becomes vacuous, which is the opposite of its purpose.
	// The virtual/real reconciliation belongs in the COMPARISON, asymmetrically
	// (see {@link isTargetAllowed}), never in the stored set.
	return [...new Set(declared)];
}

/**
 * Is `sectionTipo` one of the caller's targets? THE comparison law for
 * {@link PickerConstraint.targets}, exported so the read path and the write
 * path cannot each write their own — resolving only one side is the bug this
 * function exists to prevent (a virtual section compared against a real target
 * silently refuses a legitimate link, and vice-versa).
 *
 * An EMPTY target set answers `true`: the caller declares no target, so no
 * target constraint applies (the declared exemption, picker plan §2.1). That is
 * a stated rule, not a fallthrough — a caller WITH targets and a section
 * outside them is refused.
 *
 * THE MATCH IS ASYMMETRIC, and deliberately so. A declared target matches an
 * incoming section when they are the same node, or when EITHER ONE is the
 * other's real section. It must never compare real-against-real: every
 * thesaurus is a virtual section over `hierarchy20`, so real-vs-real answers
 * `true` for any thesaurus against any other and the constraint stops
 * constraining. Asymmetric keeps both directions of the legitimate case
 * (`rsc170` declared / `rsc2` linked, and the reverse) while still refusing
 * `es1` declared / `ad1` linked.
 */
export async function isTargetAllowed(
	targets: readonly string[],
	sectionTipo: string,
): Promise<boolean> {
	if (targets.length === 0) return true;
	if (targets.includes(sectionTipo)) return true;
	const incomingReal = await getSectionRealTipo(sectionTipo);
	for (const target of targets) {
		// either side may be the virtual one; never resolve both.
		if (target === incomingReal) return true;
		if ((await getSectionRealTipo(target)) === sectionTipo) return true;
	}
	return false;
}

/**
 * May this TERM be linked? The relation-mode selectability rule, and the whole
 * of it (picker plan §1.9).
 *
 * A THIN DELEGATION to `ts_object.isIndexable` — the rule is already
 * implemented, already the one tool_indexation relies on, and reimplementing it
 * would fork the picker's affordance from the indexation tool's. What this
 * wrapper adds is the NAME: in relation mode "indexable" means "the thesaurus
 * declares this term linkable", answered per node, by the term's own record —
 * `hierarchy*`/`ontology*` tipos are structural and never selectable; otherwise
 * the section's `section_map.thesaurus.is_indexable` names a component tipo and
 * the flag is read from that component on the term's own record.
 *
 * Consequences the callers must honour, stated here because this is the one
 * place the rule is named: a non-selectable term stays VISIBLE and NAVIGABLE
 * (structural levels are how one reaches a leaf) but carries no link
 * affordance; and because a rendered affordance is not an authorization, the
 * write path calls this again before persisting.
 */
export async function isTermSelectable(sectionTipo: string, sectionId: number): Promise<boolean> {
	return isIndexable(sectionTipo, sectionId);
}
