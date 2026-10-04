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

import { DedaloError } from '../../errors/dedalo_error.ts';
import type { BuilderContext, BuilderOpts, BuilderResult, Classified, Fragment } from './types.ts';
import {
	anchoredRegexOperand,
	effectiveOf,
	extractNormalizedQ,
	fragment,
	isLiteralQ,
	regexOperand,
} from './types.ts';

function buildJsonPath(context: BuilderContext): string {
	return context.lang === 'all'
		? `$.${context.tipo}[*]`
		: `$.${context.tipo}[*] ? (@.lang == "${context.lang}")`;
}

/**
 * Some entry's `iri` matches `matchLogic`. No `@?` pre-guard — the builder_json
 * twin carries the full reasoning and the measurement (WC-055): the EXISTS over
 * a STRICT `jsonb_path_query` is already false for a NULL column or an empty
 * path, so the guard only re-evaluated the same jsonpath a second time per row.
 * The negative branches below keep theirs, where it is load-bearing.
 */
function existsEnvelope(context: BuilderContext, matchLogic: string): string {
	const jsonPath = buildJsonPath(context);
	return (
		`EXISTS (SELECT 1 FROM jsonb_path_query(${context.alias}.${context.column}, '${jsonPath}') AS elem ` +
		`WHERE ${matchLogic})`
	);
}

/** The one parsed operator of an iri leaf. */
export type IriOp =
	| 'none'
	| 'empty'
	| 'notEmpty'
	| 'duplicated'
	| 'different'
	| 'exact'
	| 'notContains'
	| 'literal'
	| 'wildcard'
	| 'contains'
	| 'containsRaw'
	| 'hasEntries';

/**
 * THE iri-family classifier (see builder_string classifyString — same law).
 * Polarity: '!*' neg(twin '*'), '-x' neg(twin containsRaw x, lang kept),
 * '!=x' neq(has hasEntries, twin '==x' stars stripped); everything else pos.
 */
export function classifyIri(
	rawQ: unknown,
	qOperator: string | null,
	opts?: BuilderOpts,
): Classified<IriOp> {
	if (opts?.mode === 'containsRaw' || opts?.mode === 'hasEntries') {
		return { kind: 'pos', op: opts.mode };
	}
	if (opts?.mode !== undefined) {
		throw new DedaloError('internal.invariant', {
			message: `builder_iri: unsupported internal mode '${opts.mode}'`,
		});
	}
	const effective = effectiveOf(rawQ, qOperator);
	if (effective === '') return { kind: 'pos', op: 'none' };
	if (effective.startsWith('!*')) {
		return { kind: 'neg', op: 'empty', twin: { q: '*', qOperator: null } };
	}
	if (effective === '*') return { kind: 'pos', op: 'notEmpty' };
	if (effective.startsWith('!!')) return { kind: 'pos', op: 'duplicated' };
	if (effective.startsWith('!=')) {
		return {
			kind: 'neq',
			op: 'different',
			has: { q: '', qOperator: null, opts: { mode: 'hasEntries' } },
			twin: { q: `==${effective.slice(2).replaceAll('*', '')}`, qOperator: null },
		};
	}
	if (effective.startsWith('==')) return { kind: 'pos', op: 'exact' };
	if (effective.startsWith('-')) {
		return {
			kind: 'neg',
			op: 'notContains',
			twin: { q: effective.slice(1), qOperator: null, opts: { mode: 'containsRaw' } },
		};
	}
	if (isLiteralQ(effective)) return { kind: 'pos', op: 'literal' };
	if (effective.startsWith('*') || effective.endsWith('*')) return { kind: 'pos', op: 'wildcard' };
	return { kind: 'pos', op: 'contains' };
}

/** The '-' match body (raw term, lang as bound _Q2_). */
function notContainsBody(context: BuilderContext, qClean: string): Fragment {
	const langFilter = context.lang !== 'all' ? ` AND elem->>'lang' = _Q2_` : '';
	const tokenValues: Record<string, unknown> =
		context.lang !== 'all' ? { _Q1_: qClean, _Q2_: context.lang } : { _Q1_: qClean };
	return fragment(
		`SELECT 1 FROM jsonb_path_query(${context.alias}.${context.column}, '$.${context.tipo}[*]') AS elem ` +
			`WHERE elem->>'iri' IS NOT NULL AND f_unaccent(elem->>'iri') ~* ${regexOperand('_Q1_')}${langFilter}`,
		tokenValues,
	);
}

export function buildIriFragment(
	rawQ: unknown,
	qOperator: string | null,
	context: BuilderContext,
	opts?: BuilderOpts,
): BuilderResult {
	const effective = effectiveOf(rawQ, qOperator);
	const { op } = classifyIri(rawQ, qOperator, opts);

	switch (op) {
		case 'none':
			return false;
		case 'containsRaw': {
			const body = notContainsBody(context, extractNormalizedQ(rawQ) ?? '');
			return fragment(`EXISTS (${body.sentence})`, body.tokenValues);
		}
		case 'hasEntries':
			return fragment(`(${context.alias}.${context.column} @? '${buildJsonPath(context)}')`);
		case 'empty':
		case 'notEmpty': {
			const path =
				context.lang === 'all'
					? `$.${context.tipo}[*].iri ? (@ != "" && @ != null)`
					: `$.${context.tipo}[*] ? (@.lang == "${context.lang}" && @.iri != "" && @.iri != null)`;
			return op === 'empty'
				? fragment(
						`(${context.alias}.${context.column} IS NULL OR NOT (${context.alias}.${context.column} @? (_Q1_)::jsonpath))`,
						{ _Q1_: path },
					)
				: fragment(`${context.alias}.${context.column} @? (_Q1_)::jsonpath`, { _Q1_: path });
		}
		case 'duplicated':
			// '!!' duplicated — deferred.
			throw new DedaloError('engine.uncovered_scope', {
				message:
					"search builder_iri: '!!' duplicated operator not implemented yet (uncovered scope)",
			});
		case 'different': {
			const qClean = effective.slice(2).replaceAll('*', '');
			const jsonPath = buildJsonPath(context);
			return fragment(
				`(${context.alias}.${context.column} @? '${jsonPath}') AND NOT EXISTS (SELECT 1 FROM jsonb_path_query(${context.alias}.${context.column}, '${jsonPath}') AS elem WHERE f_unaccent(elem->>'iri') = f_unaccent(_Q1_))`,
				{ _Q1_: qClean },
			);
		}
		case 'exact':
			return fragment(existsEnvelope(context, `f_unaccent(elem->>'iri') = f_unaccent(_Q1_)`), {
				_Q1_: effective.slice(2),
			});
		case 'notContains': {
			const body = notContainsBody(context, effective.slice(1));
			return fragment(`NOT EXISTS (${body.sentence})`, body.tokenValues);
		}
		case 'literal':
			return fragment(existsEnvelope(context, `f_unaccent(elem->>'iri') = f_unaccent(_Q1_)`), {
				_Q1_: effective.slice(1, -1),
			});
		case 'wildcard': {
			const hasLead = effective.startsWith('*');
			const hasTrail = effective.endsWith('*');
			const qClean = effective.replaceAll('*', '').replaceAll("'", '');
			const matchLogic =
				hasLead && hasTrail
					? `f_unaccent(elem->>'iri') ~* ${regexOperand('_Q1_')}`
					: hasLead
						? `f_unaccent(elem->>'iri') ~* ${anchoredRegexOperand('_Q1_', 'ends')}`
						: `f_unaccent(elem->>'iri') ~* ${anchoredRegexOperand('_Q1_', 'begins')}`;
			return fragment(existsEnvelope(context, matchLogic), { _Q1_: qClean });
		}
		case 'contains': {
			// default contains. PHP escaped only the dot (:547) for literal URL
			// matching; `regexOperand` makes the WHOLE term literal in SQL (DATA-34)
			// — a URL carries '?', '+' and '(' as often as it carries '.'.
			const qClean = effective.replace(/[+*=]/g, '');
			if (qClean === '') return false;
			return fragment(
				existsEnvelope(context, `f_unaccent(elem->>'iri') ~* ${regexOperand('_Q1_')}`),
				{
					_Q1_: qClean,
				},
			);
		}
	}
}
