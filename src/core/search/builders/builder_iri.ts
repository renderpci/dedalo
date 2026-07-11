/**
 * IRI-family fragment builder — component_iri (matrix column 'iri').
 *
 * PHP reference: core/component_iri/trait.search_component_iri.php.
 * Data shape: {"<tipo>": [{"id":1,"iri":"https://…","lang":"nolan"}]}.
 * Structurally identical to the string family but matches on the `iri` field
 * instead of `value`; the default "contains" additionally escapes dots for
 * literal URL matching.
 *
 * NOT YET COVERED (throws): '!!' duplicated self-join.
 */

import type { BuilderContext, BuilderResult } from './types.ts';
import { extractNormalizedQ, fragment, isLiteralQ } from './types.ts';

function buildJsonPath(context: BuilderContext): string {
	return context.lang === 'all'
		? `$.${context.tipo}[*]`
		: `$.${context.tipo}[*] ? (@.lang == "${context.lang}")`;
}

function existsEnvelope(context: BuilderContext, matchLogic: string): string {
	const jsonPath = buildJsonPath(context);
	return (
		`(${context.alias}.${context.column} @? '${jsonPath}') AND EXISTS (` +
		`SELECT 1 FROM jsonb_path_query(${context.alias}.${context.column}, '${jsonPath}') AS elem ` +
		`WHERE ${matchLogic})`
	);
}

export function buildIriFragment(
	rawQ: unknown,
	qOperator: string | null,
	context: BuilderContext,
): BuilderResult {
	const q = extractNormalizedQ(rawQ) ?? '';
	const operator = qOperator ?? '';
	const effective = operator !== '' ? operator + q : q;
	if (effective === '') return false;

	// '!*' empty
	if (effective.startsWith('!*')) {
		const path =
			context.lang === 'all'
				? `$.${context.tipo}[*].iri ? (@ != "" && @ != null)`
				: `$.${context.tipo}[*] ? (@.lang == "${context.lang}" && @.iri != "" && @.iri != null)`;
		return fragment(
			`(${context.alias}.${context.column} IS NULL OR NOT (${context.alias}.${context.column} @? (_Q1_)::jsonpath))`,
			{ _Q1_: path },
		);
	}
	// '*' not-empty
	if (effective === '*') {
		const path =
			context.lang === 'all'
				? `$.${context.tipo}[*].iri ? (@ != "" && @ != null)`
				: `$.${context.tipo}[*] ? (@.lang == "${context.lang}" && @.iri != "" && @.iri != null)`;
		return fragment(`${context.alias}.${context.column} @? (_Q1_)::jsonpath`, { _Q1_: path });
	}
	// '!!' duplicated — deferred.
	if (effective.startsWith('!!')) {
		throw new Error(
			"search builder_iri: '!!' duplicated operator not implemented yet (uncovered scope)",
		);
	}
	// '!=' different
	if (effective.startsWith('!=')) {
		const qClean = effective.slice(2).replaceAll('*', '');
		const jsonPath = buildJsonPath(context);
		return fragment(
			`(${context.alias}.${context.column} @? '${jsonPath}') AND NOT EXISTS (SELECT 1 FROM jsonb_path_query(${context.alias}.${context.column}, '${jsonPath}') AS elem WHERE f_unaccent(elem->>'iri') = f_unaccent(_Q1_))`,
			{ _Q1_: qClean },
		);
	}
	// '==' exact
	if (effective.startsWith('==')) {
		return fragment(existsEnvelope(context, `f_unaccent(elem->>'iri') = f_unaccent(_Q1_)`), {
			_Q1_: effective.slice(2),
		});
	}
	// '-' not contain (lang as _Q2_)
	if (effective.startsWith('-')) {
		const qClean = effective.slice(1);
		const langFilter = context.lang !== 'all' ? ` AND elem->>'lang' = _Q2_` : '';
		const tokenValues: Record<string, unknown> =
			context.lang !== 'all' ? { _Q1_: qClean, _Q2_: context.lang } : { _Q1_: qClean };
		return fragment(
			`NOT EXISTS (SELECT 1 FROM jsonb_path_query(${context.alias}.${context.column}, '$.${context.tipo}[*]') AS elem ` +
				`WHERE elem->>'iri' IS NOT NULL AND f_unaccent(elem->>'iri') ~* f_unaccent(_Q1_)${langFilter})`,
			tokenValues,
		);
	}
	// literal 'text'
	if (isLiteralQ(effective)) {
		return fragment(existsEnvelope(context, `f_unaccent(elem->>'iri') = f_unaccent(_Q1_)`), {
			_Q1_: effective.slice(1, -1),
		});
	}
	// wildcard anchoring
	const hasLead = effective.startsWith('*');
	const hasTrail = effective.endsWith('*');
	if (hasLead || hasTrail) {
		const qClean = effective.replaceAll('*', '').replaceAll("'", '');
		const matchLogic =
			hasLead && hasTrail
				? `f_unaccent(elem->>'iri') ~* f_unaccent(_Q1_)`
				: hasLead
					? `f_unaccent(elem->>'iri') ~* (f_unaccent(_Q1_) || '$')`
					: `f_unaccent(elem->>'iri') ~* ('^' || f_unaccent(_Q1_))`;
		return fragment(existsEnvelope(context, matchLogic), { _Q1_: qClean });
	}
	// default contains — escape dots for literal URL matching (PHP :547)
	const qClean = effective.replace(/[+*=]/g, '').replaceAll('.', '\\.');
	if (qClean === '') return false;
	return fragment(existsEnvelope(context, `f_unaccent(elem->>'iri') ~* f_unaccent(_Q1_)`), {
		_Q1_: qClean,
	});
}
