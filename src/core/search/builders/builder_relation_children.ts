/**
 * component_relation_children SEARCH builder — the inverse-parent pipeline
 * (PHP trait.search_component_relation_children.php). Children hold no
 * forward data: every operator is a correlated (NOT) EXISTS over the CHILD
 * rows' `relation` column keyed by the paired component_relation_parent tipo
 * (_Q1_), with the specific-child variants adding the _Q2_ locator match.
 * SQL shapes are PHP-verbatim (whitespace-normalized):
 *   !* :315-326 · * :352-363 · != :410-434 · !== :473-486 · default :522-535.
 *
 * PHP resolves the paired parent via get_ar_related_parent_tipo with a
 * hardcoded 'hierarchy20' section fallback (:209-13, acknowledged limitation);
 * TS passes the REAL leaf sectionTipo — only the fallback branch differs and
 * it is unexercised on this install (all 19 live children are ontology-paired).
 *
 * NO _tm twin exists in PHP, and matrix_time_machine has no `relation`
 * column — PHP would emit invalid SQL; TS throws loudly instead
 * (error-for-error equivalence). A multi-locator q array produces invalid
 * jsonb in PHP (runtime SQL error) — TS throws a clean error.
 */

import { getRelatedParentTipo } from '../../relations/children.ts';
import { type BuilderContext, type BuilderResult, fragment } from './types.ts';

/** The lateral-unnest core shared by every operator (PHP :315-326). */
function childScan(table: string, alias: string): string {
	return `SELECT 1 FROM "${table}" AS sub CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(sub.relation->_Q1_) = 'array' THEN sub.relation->_Q1_ ELSE jsonb_build_array(sub.relation->_Q1_) END) AS elem WHERE sub.relation ? _Q1_ AND elem->>'section_id' = ${alias}.section_id::text`;
}

/** The specific-child predicates appended by the _Q2_ variants (PHP :432-433).
 * `::text::jsonb` (not PHP's bare `::jsonb`): the Bun.sql driver binds a
 * string param cast directly to jsonb as a jsonb STRING SCALAR, so
 * `$n::jsonb->>'key'` is silently NULL — the documented write-path trap,
 * same wire semantics as PHP's text-bound `::jsonb`. */
const SPECIFIC_CHILD =
	" AND sub.section_id::text = (_Q2_::text::jsonb->>'section_id')" +
	" AND sub.section_tipo = (_Q2_::text::jsonb->>'section_tipo')";

/**
 * PHP extract_normalized_relation_q (:111-142): strip the client-side `id`
 * from a locator object, JSON-encode non-strings, unwrap a single-element
 * array's brackets; anything without '{' that is not 'only_operator' becomes
 * '[]' (the clause still RUNS and matches nothing — dropping it would return
 * every row instead of none).
 */
function normalizeRelationQ(rawQ: unknown): string {
	let source = rawQ;
	if (Array.isArray(source) && source.length === 1) source = source[0];
	if (Array.isArray(source) && source.length > 1) {
		// PHP's bracket-strip yields '{…},{…}' → invalid _Q2_::jsonb → runtime
		// SQL error. Fail cleanly instead of emitting broken SQL.
		throw new Error(
			'relation_children search: multi-locator q is not supported (PHP emits invalid jsonb)',
		);
	}
	if (source !== null && typeof source === 'object') {
		const { id: _clientDomId, ...locator } = source as Record<string, unknown>;
		return JSON.stringify(locator);
	}
	const text = typeof source === 'string' ? source : JSON.stringify(source);
	if (!text?.includes('{') && text !== 'only_operator') {
		console.warn(`[search/relation_children] ignored invalid unsafe q: ${text}`);
		return '[]';
	}
	return text;
}

/** Dispatch (PHP dispatch_relation_operator_sql :252-270). */
export async function buildRelationChildrenFragment(
	rawQ: unknown,
	qOperator: string | null,
	context: BuilderContext,
): Promise<BuilderResult> {
	if (context.table === 'matrix_time_machine') {
		throw new Error(
			'relation_children search: no time-machine twin exists (matrix_time_machine has no relation column; PHP errors identically)',
		);
	}
	const targetParentTipo = await getRelatedParentTipo(context.tipo, context.sectionTipo);
	if (targetParentTipo === null) return false; // PHP :214-222 — clause dropped

	const scan = childScan(context.table, context.alias);
	const tokens: Record<string, unknown> = { _Q1_: targetParentTipo };
	if (qOperator === '!*') return fragment(`NOT EXISTS (${scan})`, tokens);
	if (qOperator === '*') return fragment(`EXISTS (${scan})`, tokens);

	tokens._Q2_ = normalizeRelationQ(rawQ);
	if (qOperator === '!=') {
		return fragment(`EXISTS (${scan}) AND NOT EXISTS (${scan}${SPECIFIC_CHILD})`, tokens);
	}
	if (qOperator === '!==') {
		return fragment(`NOT EXISTS (${scan}${SPECIFIC_CHILD})`, tokens);
	}
	// default / '==' — "parent references child X" (PHP :522-535).
	return fragment(`EXISTS (${scan}${SPECIFIC_CHILD})`, tokens);
}
