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
import { extractNormalizedQ, fragment, isLiteralQ } from './types.ts';

/** `$.<tipo>[*]` — the array of {lang,value} entries for this component. */
function entriesPath(context: BuilderContext): string {
	return `$.${context.tipo}[*]`;
}

/** record has entries for tipo AND some entry's value TEXT matches `matchLogic`. */
function existsEnvelope(context: BuilderContext, matchLogic: string): string {
	const path = entriesPath(context);
	return (
		`(${context.alias}.${context.column} @? '${path}') AND EXISTS (` +
		`SELECT 1 FROM jsonb_path_query(${context.alias}.${context.column}, '${path}') AS elem ` +
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
	if (effective.startsWith('!!')) {
		const path = entriesPath(context);
		return fragment(
			`(${context.alias}.${context.column} @? '${path}') AND EXISTS (
  SELECT 1
  FROM ${context.table} AS m2,
       jsonb_path_query(m2.${context.column}, '${path}') AS m2_elem,
       jsonb_path_query(${context.alias}.${context.column}, '${path}') AS m1_elem
  WHERE m2.${context.column} @? '${path}'
    AND m2.section_id != ${context.alias}.section_id
    AND m2.section_tipo = ${context.alias}.section_tipo
    AND f_unaccent(m2_elem->>'value') = f_unaccent(m1_elem->>'value')
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
			`(${context.alias}.${context.column} @? '${path}') AND NOT EXISTS (SELECT 1 FROM jsonb_path_query(${context.alias}.${context.column}, '${path}') AS elem WHERE f_unaccent(elem->>'value') ~* f_unaccent(_Q1_))`,
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
				? `f_unaccent(elem->>'value') ~* f_unaccent(_Q1_)`
				: hasLead
					? `f_unaccent(elem->>'value') ~* (f_unaccent(_Q1_) || '$')`
					: `f_unaccent(elem->>'value') ~* ('^' || f_unaccent(_Q1_))`;
		if (qClean === '') return false;
		return fragment(existsEnvelope(context, matchLogic), { _Q1_: qClean });
	}

	// Default: contains (regex, accent/case-insensitive).
	const qClean = effective.replace(/[+=]/g, '');
	if (qClean === '') {
		return false;
	}
	return fragment(existsEnvelope(context, `f_unaccent(elem->>'value') ~* f_unaccent(_Q1_)`), {
		_Q1_: qClean,
	});
}
