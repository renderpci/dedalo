/**
 * Relation-family fragment builder — select/check_box/radio_button/portal/
 * publication/filter/relation_parent/related/model/dataframe (column 'relation').
 *
 * PHP reference: core/component_relation_common/trait.search_component_relation_common.php.
 * Data shape: {"<tipo>": [locator, …]} — locators are the q payload.
 *
 * Operators: '!*' empty (no key), '*' not-empty (key exists), '!=' has-key-and-
 * not-contains, '!==' strict not-contains, default/'==' containment (@>).
 *
 * _tm TWIN (trait.search_component_relation_common_tm): on the
 * matrix_time_machine table the relation data is the flat scalar `user_id`
 * INTEGER column (the dd578 user portal of the TM envelope) — every operator
 * emits column-direct SQL there; buildRelationFragment dispatches by
 * context.table exactly like the PHP dispatch_relation_operator_sql.
 *
 * ANCESTOR WRAP (buildRelationSearchAncestorFragment): the CORRECT
 * relation_search $or wrap for the legacy component_autocomplete_hi model.
 * DELIBERATELY NOT wired into the live conform dispatch: PHP's
 * add_relation_search is LIVE-DEFECTIVE (the clone ignores component_path —
 * ancestor searches return 0 there), and the coexistence posture keeps the
 * TS wire result-equivalent (autocomplete_hi_search_differential pins both
 * sides). The correct machinery ships unit-gated against the maintained
 * relation_search column; wire it when PHP fixes the wrap.
 */

import type { BuilderContext, BuilderResult } from './types.ts';
import { compound, fragment } from './types.ts';

/**
 * Normalize the q payload to the JSON text injected inside {"tipo":[ … ]}
 * (PHP extract_normalized_relation_q): accepts a locator object or an array
 * of locators; strips the transient 'id' field; returns the array content
 * WITHOUT the outer brackets. Null q → null (operator-only searches).
 */
function normalizeRelationQ(rawQ: unknown): string | null {
	if (rawQ === undefined || rawQ === null || rawQ === '') {
		return null;
	}
	const locators = Array.isArray(rawQ) ? rawQ : [rawQ];
	const cleaned = locators.map((locator) => {
		if (locator === null || typeof locator !== 'object') {
			// Safety gate (PHP coerces non-object content to '[]'): refuse quietly.
			return null;
		}
		const { id: _transientId, ...rest } = locator as Record<string, unknown>;
		return rest;
	});
	if (cleaned.some((entry) => entry === null)) {
		return null;
	}
	const jsonArray = JSON.stringify(cleaned);
	return jsonArray.slice(1, -1); // strip outer [ ]
}

/**
 * The _tm operator handlers (PHP dispatch_relation_operator_sql_tm): the TM
 * table stores the relation datum as the scalar `user_id` column; q carries a
 * locator whose section_id IS the user id. '!=' and '!==' are identical on a
 * scalar (the JSONB containment-vs-EXISTS distinction has no meaning here).
 */
function buildRelationFragmentTm(
	rawQ: unknown,
	qOperator: string | null,
	context: BuilderContext,
): BuilderResult {
	const operator = qOperator ?? '';
	const columnRef = `${context.alias}.user_id`;
	if (operator === '!*') return fragment(`${columnRef} IS NULL`);
	if (operator === '*') return fragment(`${columnRef} IS NOT NULL`);

	// q → the user id (a locator {section_id: N} or its JSON string). Bound
	// as TEXT: the live user_id column is VARCHAR (PHP binds string params).
	const locator = typeof rawQ === 'string' ? JSON.parse(rawQ) : rawQ;
	const first = Array.isArray(locator) ? locator[0] : locator;
	const userId = Number((first as { section_id?: unknown } | null)?.section_id);
	if (!Number.isFinite(userId)) return false;

	if (operator === '!=' || operator === '!==') {
		return fragment(`${columnRef} != _Q1_`, { _Q1_: String(userId) });
	}
	return fragment(`${columnRef} = _Q1_`, { _Q1_: String(userId) });
}

/**
 * The CORRECT autocomplete_hi ancestor wrap (PHP add_relation_search as
 * DESIGNED, not as live-shipped): (relation contains q) OR (relation_search
 * contains q) — a term matches records linking it directly AND records
 * linking any of its DESCENDANTS ('search Spain matches Madrid', the index
 * the save path maintains). See the module doc for why this is NOT in the
 * live dispatch.
 */
export function buildRelationSearchAncestorFragment(
	rawQ: unknown,
	qOperator: string | null,
	context: BuilderContext,
): BuilderResult {
	const direct = buildRelationFragment(rawQ, qOperator, context);
	const ancestor = buildRelationFragment(rawQ, qOperator, {
		...context,
		column: 'relation_search',
	});
	if (direct === false || ancestor === false) return direct;
	return compound('$or', [direct, ancestor]);
}

export function buildRelationFragment(
	rawQ: unknown,
	qOperator: string | null,
	context: BuilderContext,
): BuilderResult {
	// TM-table twin: flat scalar column instead of JSONB containment (PHP
	// dispatch_relation_operator_sql detects the table and delegates).
	if (context.table === 'matrix_time_machine') {
		return buildRelationFragmentTm(rawQ, qOperator, context);
	}
	const operator = qOperator ?? '';
	const qJson = normalizeRelationQ(rawQ);

	// '!*' — empty: the component key is absent from the relation column.
	if (operator === '!*') {
		return fragment(`NOT (${context.alias}.${context.column} ? _Q1_)`, { _Q1_: context.tipo });
	}

	// '*' — not-empty: key exists.
	if (operator === '*') {
		return fragment(`(${context.alias}.${context.column} ? _Q1_)`, { _Q1_: context.tipo });
	}

	// '!=' — has relations for this component AND does not contain q.
	if (operator === '!=' && qJson !== null) {
		return fragment(
			`(${context.alias}.${context.column} ? _Q2_) AND NOT (${context.alias}.${context.column} @> _Q1_::text::jsonb)`,
			{ _Q1_: `{"${context.tipo}":[${qJson}]}`, _Q2_: context.tipo },
		);
	}

	// '!==' — strict different: not-contains (includes records with no key).
	if (operator === '!==' && qJson !== null) {
		return fragment(`NOT (${context.alias}.${context.column} @> _Q1_::text::jsonb)`, {
			_Q1_: `{"${context.tipo}":[${qJson}]}`,
		});
	}

	// Default / '==' — containment.
	if (qJson === null) {
		return false;
	}
	return fragment(`${context.alias}.${context.column} @> _Q1_::text::jsonb`, {
		_Q1_: `{"${context.tipo}":[${qJson}]}`,
	});
}
