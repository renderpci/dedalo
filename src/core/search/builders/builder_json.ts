/**
 * JSON-family fragment builder — component_json (matrix column 'misc').
 *
 * PHP reference: core/component_json/trait.search_component_json.php.
 * Data shape: {"<tipo>": [{"lang":"lg-nolan","value":<any JSON>}, …]} — the
 * `value` is ARBITRARY JSON (scalar, array, or object), so matching operates on
 * its TEXT projection (`elem->>'value'`: a scalar comes out raw, a container
 * comes out as its compact JSON text). PHP navigates `$.<tipo>[*].value.**` with
 * a `like_regex` — the recursive `.**` visits every nested member; the text
 * projection here matches the same content (nested keys/values are all in the
 * serialized text) while keeping the query value as a BOUND parameter rather
 * than embedding it in the jsonpath literal (the string/date builders' security
 * posture — jsonpath forbids binds, so we never interpolate raw client text).
 *
 * Operator dispatch (PHP precedence): '!*' empty, '*' not-empty, '!=' different
 * (= not-contains, PHP json has no not-exactly-equal), '==' exact, '-'
 * not-contains, '!!' duplicated, wildcard/literal shapes, default contains.
 * Matching is case- AND accent-insensitive via f_unaccent(...) ~* (PHP json is
 * case-insensitive only; accent-insensitivity is a safe superset, consistent
 * with the string builder — it never hides a would-be match).
 *
 * The matrix_time_machine (_tm) twin — component_json over the flat `data`
 * column — is handled by the Time Machine read path (resolve/read_tm.ts), not
 * here; this builder targets the standard tipo-keyed jsonb column.
 */

import type { BuilderContext, BuilderResult } from './types.ts';
import {
	anchoredRegexOperand,
	extractNormalizedQ,
	fragment,
	isLiteralQ,
	regexOperand,
} from './types.ts';

/** `$.<tipo>[*]` — the array of {lang,value} entries for this component. */
function entriesPath(context: BuilderContext): string {
	return `$.${context.tipo}[*]`;
}

/**
 * Some entry's value TEXT matches `matchLogic`.
 *
 * NO `@?` PRE-GUARD (WC-055). This used to lead with
 * `(col @? '$.<tipo>[*]') AND …`, which cannot change the result:
 * `jsonb_path_query` is STRICT, so a NULL column or a path yielding no element
 * produces no rows and the EXISTS is already false. It was a second full
 * jsonpath evaluation of the same path on the same document, per row — measured
 * at 2.7x on the shape that cannot abort early (dd551 Data search for a term
 * that matches nothing, 200k rows of the 32.9M-row mdcat log: 2854 ms → 1059 ms).
 *
 * The guard is NOT redundant in the NEGATIVE branches and stays there: `!=`/`-`
 * is `(col @? path) AND NOT EXISTS (…)` = "has entries but none match", and
 * without it every record lacking the component would match; `*` not-empty IS
 * the guard. Gate: search_exists_envelope_guard.test.ts (both the asymmetry and
 * the row-level equivalence, NULL/empty/missing-component rows included).
 */
function existsEnvelope(context: BuilderContext, matchLogic: string): string {
	const path = entriesPath(context);
	return (
		`EXISTS (SELECT 1 FROM jsonb_path_query(${context.alias}.${context.column}, '${path}') AS elem ` +
		`WHERE ${matchLogic})`
	);
}

export function buildJsonFragment(
	rawQ: unknown,
	qOperator: string | null,
	context: BuilderContext,
): BuilderResult {
	const q = extractNormalizedQ(rawQ) ?? '';
	const operator = qOperator ?? '';
	if (q === '' && operator === '') {
		return false;
	}

	// Operator prefixes may arrive glued to q (e.g. '!=word'); PHP dispatches on
	// the leading characters of q when q_operator is not set.
	const effective = operator !== '' ? operator + q : q;

	// '!*' — empty (column NULL, or no entry carries a non-empty value)
	if (effective === '!*' || effective.startsWith('!*')) {
		return fragment(
			`(${context.alias}.${context.column} IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_path_query(${context.alias}.${context.column}, '${entriesPath(context)}') AS elem WHERE elem->>'value' IS NOT NULL AND elem->>'value' != ''))`,
		);
	}

	// '*' — not-empty (has at least one entry for this tipo)
	if (effective === '*') {
		return fragment(`(${context.alias}.${context.column} @? '${entriesPath(context)}')`);
	}

	// '!!' — DUPLICATED value text on ANOTHER record of the same section.
	// ONE UNCORRELATED SELF-AGGREGATE (PERF-07) — the builder_string twin
	// carries the full reasoning: the duplicate set does not depend on the
	// outer row, so it is grouped ONCE instead of re-cross-joining the whole
	// matrix table per row. Membership is asked by (section_tipo, section_id)
	// so a duplicate pair in another tipo of the same table cannot match a
	// same-numbered record here. component_json is not store-covered (the store
	// holds `string`-column values), so there is no superset arm.
	if (effective.startsWith('!!')) {
		const path = entriesPath(context);
		return fragment(
			`(${context.alias}.section_tipo, ${context.alias}.section_id) IN (
  SELECT dup.section_tipo, dup_id
  FROM (
    SELECT dv.section_tipo AS section_tipo, array_agg(DISTINCT dv.section_id) AS ids
    FROM (SELECT m2.section_tipo AS section_tipo, m2.section_id AS section_id,
                 f_unaccent(m2_elem->>'value') AS val
          FROM ${context.table} AS m2,
               jsonb_path_query(m2.${context.column}, '${path}') AS m2_elem
          WHERE m2_elem->>'value' IS NOT NULL) dv
    GROUP BY dv.section_tipo, dv.val
    HAVING count(DISTINCT dv.section_id) > 1
  ) dup, unnest(dup.ids) AS dup_id
 )`,
		);
	}

	// '!=' / '-' — different / not-contains (PHP json treats both as not-contains:
	// record HAS entries for the tipo but none contains the term).
	if (effective.startsWith('!=') || effective.startsWith('-')) {
		const qClean = (
			effective.startsWith('!=') ? effective.slice(2) : effective.slice(1)
		).replaceAll('*', '');
		const path = entriesPath(context);
		return fragment(
			`(${context.alias}.${context.column} @? '${path}') AND NOT EXISTS (SELECT 1 FROM jsonb_path_query(${context.alias}.${context.column}, '${path}') AS elem WHERE f_unaccent(elem->>'value') ~* ${regexOperand('_Q1_')})`,
			{ _Q1_: qClean },
		);
	}

	// '==' — exactly equal (accent/case-insensitive, whole value text)
	if (effective.startsWith('==')) {
		return fragment(existsEnvelope(context, `f_unaccent(elem->>'value') = f_unaccent(_Q1_)`), {
			_Q1_: effective.slice(2),
		});
	}

	// Literal 'text' — exact equality, quotes stripped.
	if (isLiteralQ(effective)) {
		return fragment(existsEnvelope(context, `f_unaccent(elem->>'value') = f_unaccent(_Q1_)`), {
			_Q1_: effective.slice(1, -1),
		});
	}

	// Wildcard anchoring: leading '*' = ends-with, trailing '*' = begins-with.
	const hasLead = effective.startsWith('*');
	const hasTrail = effective.endsWith('*');
	if (hasLead || hasTrail) {
		const qClean = effective.replaceAll('*', '').replaceAll("'", '');
		const matchLogic =
			hasLead && hasTrail
				? `f_unaccent(elem->>'value') ~* ${regexOperand('_Q1_')}`
				: hasLead
					? `f_unaccent(elem->>'value') ~* ${anchoredRegexOperand('_Q1_', 'ends')}`
					: `f_unaccent(elem->>'value') ~* ${anchoredRegexOperand('_Q1_', 'begins')}`;
		if (qClean === '') return false;
		return fragment(existsEnvelope(context, matchLogic), { _Q1_: qClean });
	}

	// Default: contains (regex, accent/case-insensitive).
	const qClean = effective.replace(/[+=]/g, '');
	if (qClean === '') {
		return false;
	}
	return fragment(
		existsEnvelope(context, `f_unaccent(elem->>'value') ~* ${regexOperand('_Q1_')}`),
		{
			_Q1_: qClean,
		},
	);
}
