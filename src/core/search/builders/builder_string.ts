/**
 * String-family fragment builder — component_input_text / component_text_area /
 * component_email (matrix column 'string').
 *
 * PHP reference: core/component_string_common/trait.search_component_string_common.php.
 * Data shape: {"<tipo>": [{"lang":"lg-spa","value":"Título"}, …]}.
 *
 * Operator dispatch (PHP precedence): '!*' empty, '*' not-empty, '!=' different,
 * '==' exact, '-' not-contain, wildcard/literal shapes, default contains.
 * All text matching is case- and accent-insensitive via f_unaccent(...) ~*.
 *
 * NOT YET COVERED (logged, plan §9 no-silent-narrowing): the
 * matrix_time_machine (_tm) builder twin. It throws.
 */

import type { BuilderContext, BuilderResult, Fragment } from './types.ts';
import { compound, extractNormalizedQ, fragment, isLiteralQ, splitSearchTerms } from './types.ts';

/** The lang-scoped jsonpath used by @? existence envelopes. */
function buildJsonPath(context: BuilderContext): string {
	return context.lang === 'all'
		? `$.${context.tipo}[*]`
		: `$.${context.tipo}[*] ? (@.lang == "${context.lang}")`;
}

/** The standard envelope: record has matching entries AND EXISTS(match). */
function existsEnvelope(context: BuilderContext, matchLogic: string): string {
	const jsonPath = buildJsonPath(context);
	return (
		`(${context.alias}.${context.column} @? '${jsonPath}') AND EXISTS (` +
		`SELECT 1 FROM jsonb_path_query(${context.alias}.${context.column}, '${jsonPath}') AS elem ` +
		`WHERE ${matchLogic})`
	);
}

/**
 * Regex metacharacters that make a q NOT literally LIKE-matchable: the exact
 * predicate treats q as a POSIX regex, so a q carrying any of these could
 * match values the literal-substring pre-filter would reject (false
 * negative). Plain words — the overwhelmingly normal case — pass.
 */
const REGEX_META = /[.*+?[\]{}()|\\^$]/;

/**
 * SEARCH-STORE PRE-FILTER for POSITIVE match shapes (contains / begins /
 * ends / equal / literal): the matrix_search_values per-value store queried
 * as `section_id = ANY (ARRAY(SELECT … WHERE sv.tv LIKE '<tipo>:%<q>%'))` —
 * the component tipo rides in the LIKE prefix, so the trigram index narrows
 * to THIS component's matching values and the recheck runs on one short
 * value (rsc205 'sarde': 1.4s classic scan → ~50ms; whole-record expression
 * indexes were measured counterproductive, 2026-07-19 — TOASTed
 * re-flattening per recheck row).
 *
 * SHAPE MATTERS: the subquery is deliberately UNCORRELATED so it plans as a
 * one-shot InitPlan and the main table is ENTERED by section_id — the
 * correlated-EXISTS variant let the planner semi-join from the matrix side
 * (jsonb-selectivity misestimates) and re-run the slow exact predicate on
 * every row (measured 1.4s vs 48ms). No section_tipo condition inside: a
 * shared component tipo may span sections and the multi-section UNION
 * replicates this WHERE verbatim into every branch — cross-section ids only
 * WIDEN the superset (the outer section_tipo pin + the exact predicate still
 * decide), never narrow it.
 *
 * The clause is a strict SUPERSET of every positive per-value match (store
 * rows are lower(f_unaccent(value)) of the same values, all langs), so the
 * exact EXISTS predicate that follows still decides membership.
 *
 * Emitted ONLY when:
 * - the table is store-covered (context.searchStoreCovered — the sync
 *   trigger exists; see search_store.ts: against an unmaintained table the
 *   empty store would wrongly EXCLUDE rows, so the gate is correctness);
 * - q is regex-plain (no REGEX_META): the exact predicate is regex-semantic,
 *   the pre-filter is literal-substring — they only agree on plain text.
 *   LIKE's own wildcards (% _) are then escaped into literals.
 * Never emitted for negations ('!*', '!=', '-', '!!') or bare '*'.
 */
function withStorePrefilter(
	context: BuilderContext,
	sentence: string,
	tokenValues: Record<string, unknown>,
	q: string,
): Fragment {
	if (context.searchStoreCovered !== true || q === '' || REGEX_META.test(q)) {
		return fragment(sentence, tokenValues);
	}
	// % and _ are literal characters in the regex-exact predicate — escape
	// them so LIKE treats them literally too (backslash is excluded by the
	// regex-plain guard, so it cannot collide with the escape character).
	const likeQ = q.replaceAll('%', '\\%').replaceAll('_', '\\_');
	return fragment(
		`${context.alias}.section_id = ANY (ARRAY(SELECT sv.section_id FROM matrix_search_values sv ` +
			`WHERE sv.tv LIKE '${context.tipo}:%' || lower(f_unaccent(_Q0_)) || '%')) AND ${sentence}`,
		{ _Q0_: likeQ, ...tokenValues },
	);
}

export function buildStringFragment(
	rawQ: unknown,
	qOperator: string | null,
	qSplit: boolean,
	context: BuilderContext,
): BuilderResult {
	const q = extractNormalizedQ(rawQ) ?? '';
	const operator = qOperator ?? '';
	if (q === '' && operator === '') {
		return false;
	}

	// q_split: fan each word out as an independent leaf, AND-joined.
	if (qSplit && q !== '') {
		const tokens = splitSearchTerms(q);
		if (tokens.length > 1) {
			return compound(
				'$and',
				tokens.map((token) => buildStringFragment(token, qOperator, false, context)),
			);
		}
	}

	// Operator prefixes may arrive glued to q (e.g. '!=word') — PHP dispatches
	// on the leading characters of q when q_operator is not set.
	const effective = operator !== '' ? operator + q : q;

	// '!*' — empty (no value for this lang, or column NULL)
	if (effective === '!*' || effective.startsWith('!*')) {
		const path =
			context.lang === 'all'
				? `$.${context.tipo}[*].value ? (@ != "" && @ != null)`
				: `$.${context.tipo}[*] ? (@.lang == "${context.lang}" && @.value != "" && @.value != null)`;
		return fragment(
			`(${context.alias}.${context.column} IS NULL OR NOT (${context.alias}.${context.column} @? (_Q1_)::jsonpath))`,
			{ _Q1_: path },
		);
	}

	// '*' — not-empty
	if (effective === '*') {
		const path =
			context.lang === 'all'
				? `$.${context.tipo}[*].value ? (@ != "" && @ != null)`
				: `$.${context.tipo}[*] ? (@.lang == "${context.lang}" && @.value != "" && @.value != null)`;
		return fragment(`${context.alias}.${context.column} @? (_Q1_)::jsonpath`, { _Q1_: path });
	}

	// '!!' — DUPLICATED values: rows whose value (this lang) also appears on
	// ANOTHER record of the same section, unaccent-compared (PHP
	// resolve_duplicated_sql — correlated EXISTS self-join over the same
	// matrix table; non-translatable components force nolan).
	if (effective.startsWith('!!')) {
		const dupLang =
			context.lang === 'all' ? 'all' : context.translatable ? context.lang : 'lg-nolan';
		const jsonPath =
			dupLang === 'all'
				? `$.${context.tipo}[*]`
				: `$.${context.tipo}[*] ? (@.lang == "${dupLang}")`;
		return fragment(
			`(${context.alias}.${context.column} @? '${jsonPath}') AND EXISTS (
  SELECT 1
  FROM ${context.table} AS m2,
       jsonb_path_query(m2.${context.column}, '${jsonPath}') AS m2_elem,
       jsonb_path_query(${context.alias}.${context.column}, '${jsonPath}') AS m1_elem
  WHERE m2.${context.column} @? '${jsonPath}'
    AND m2.section_id != ${context.alias}.section_id
    AND m2.section_tipo = ${context.alias}.section_tipo
    AND f_unaccent(m2_elem->>'value') = f_unaccent(m1_elem->>'value')
 )`,
			{},
		);
	}

	// '!=' — has data for the lang AND no entry matches
	if (effective.startsWith('!=')) {
		const qClean = effective.slice(2).replaceAll('*', '');
		const hasLead = effective.slice(2).startsWith('*');
		const hasTrail = effective.slice(2).endsWith('*');
		const matchLogic =
			hasLead && hasTrail
				? `f_unaccent(elem->>'value') ~* f_unaccent(_Q1_)`
				: hasLead
					? `f_unaccent(elem->>'value') ~* (f_unaccent(_Q1_) || '$')`
					: hasTrail
						? `f_unaccent(elem->>'value') ~* ('^' || f_unaccent(_Q1_))`
						: `f_unaccent(elem->>'value') = f_unaccent(_Q1_)`;
		const jsonPath = buildJsonPath(context);
		return fragment(
			`(${context.alias}.${context.column} @? '${jsonPath}') AND NOT EXISTS (` +
				`SELECT 1 FROM jsonb_path_query(${context.alias}.${context.column}, '${jsonPath}') AS elem ` +
				`WHERE ${matchLogic})`,
			{ _Q1_: qClean },
		);
	}

	// '==' — exactly equal (accent/case-insensitive)
	if (effective.startsWith('==')) {
		const qClean = effective.slice(2);
		return withStorePrefilter(
			context,
			existsEnvelope(context, `f_unaccent(elem->>'value') = f_unaccent(_Q1_)`),
			{ _Q1_: qClean },
			qClean,
		);
	}

	// '=' — exactly equal, the single-char twin of '==' (TS-BEYOND-PHP,
	// owner-directed 2026-07-09: PHP has no single '=' operator — it silently
	// STRIPS the '=' and runs contains, so short names like 'Ea'/'Ye'/'Ibi'
	// drowned in 1000+ contains-matches and could never be picked. The
	// splitSearchTerms tokenizer already glued '=' to its word; q_split
	// multi-word input fans out per-word, each exact). Quoted literals ('Ea')
	// keep working as before on both engines.
	if (effective.startsWith('=')) {
		const qClean = effective.slice(1).replaceAll("'", '');
		if (qClean === '') return false;
		return withStorePrefilter(
			context,
			existsEnvelope(context, `f_unaccent(elem->>'value') = f_unaccent(_Q1_)`),
			{ _Q1_: qClean },
			qClean,
		);
	}

	// '-' — not contain (lang as bound param _Q2_, no lang in path)
	if (effective.startsWith('-')) {
		const qClean = effective.slice(1);
		const langFilter = context.lang !== 'all' ? ` AND elem->>'lang' = _Q2_` : '';
		const tokenValues: Record<string, unknown> =
			context.lang !== 'all' ? { _Q1_: qClean, _Q2_: context.lang } : { _Q1_: qClean };
		return fragment(
			`NOT EXISTS (SELECT 1 FROM jsonb_path_query(${context.alias}.${context.column}, '$.${context.tipo}[*]') AS elem ` +
				`WHERE elem->>'value' IS NOT NULL AND f_unaccent(elem->>'value') ~* f_unaccent(_Q1_)${langFilter})`,
			tokenValues,
		);
	}

	// Literal 'text' — exact equality, quotes stripped, no wildcard handling.
	if (isLiteralQ(effective)) {
		const qClean = effective.slice(1, -1);
		return withStorePrefilter(
			context,
			existsEnvelope(context, `f_unaccent(elem->>'value') = f_unaccent(_Q1_)`),
			{ _Q1_: qClean },
			qClean,
		);
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
		// Anchored variants still pre-filter on the plain (unanchored) q —
		// a value matching '^q'/'q$' contains q, so the superset holds.
		return withStorePrefilter(
			context,
			existsEnvelope(context, matchLogic),
			{ _Q1_: qClean },
			qClean,
		);
	}

	// Default: contains (regex, accent/case-insensitive). Strip '+ * ='.
	const qClean = effective.replace(/[+*=]/g, '');
	if (qClean === '') {
		return false;
	}
	return withStorePrefilter(
		context,
		existsEnvelope(context, `f_unaccent(elem->>'value') ~* f_unaccent(_Q1_)`),
		{ _Q1_: qClean },
		qClean,
	);
}
