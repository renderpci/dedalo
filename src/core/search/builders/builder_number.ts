/**
 * Number-family fragment builder — component_number (column 'number').
 *
 * PHP reference: core/component_number/trait.search_component_number.php.
 * Data shape: {"<tipo>": [{"id":1,"value":4.54}, …]}.
 *
 * Operators (2-char before 1-char): '!*', '*', '!=' different, '...' between,
 * '>=', '<=', '>', '<', default '='.
 *
 * '!=' (WC-2026-09-29-number-not-equal): "has a value AND no value equals n".
 * It used to fall through to the default '=' branch, whose coercion turned
 * '!=5' into '= 0' — a "different from 5" search returned the records whose
 * value is ZERO. Every bound value is cast ::numeric; non-numeric
 * input coerces to '0' (PHP SEARCH-02 hardening).
 */

import { DedaloError } from '../../errors/dedalo_error.ts';
import type { BuilderContext, BuilderResult, Classified } from './types.ts';
import { effectiveOf, fragment } from './types.ts';

/** Numeric envelope: entries exist AND at least one satisfies the comparison. */
function numericEnvelope(context: BuilderContext, comparison: string): string {
	return (
		`(${context.alias}.${context.column} @? '$.${context.tipo}[*]') AND EXISTS (` +
		`SELECT 1 FROM jsonb_array_elements(${context.alias}.${context.column}->'${context.tipo}') AS elem ` +
		`WHERE ${comparison})`
	);
}

/** SEARCH-02: coerce to a numeric literal string; garbage → '0'. */
function coerceNumeric(value: string): string {
	const normalized = value.replaceAll(',', '.').replace(/[+\s]/g, '');
	return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : '0';
}

/** The one parsed operator of a number leaf. */
export type NumberOp =
	| 'none'
	| 'empty'
	| 'notEmpty'
	| 'different'
	| 'between'
	| 'compare'
	| 'equal';

/** The '!=' guard: some entry carries a non-null value (the '*' test, literal path). */
function hasValue(context: BuilderContext): string {
	return `(${context.alias}.${context.column} @? '$.${context.tipo}[*].value ? (@ != null)')`;
}

/**
 * THE number-family classifier (see builder_string classifyString — same law).
 * Polarity: '!*' neg(twin '*'); '!=n' neq(has '*', twin n — the rest after
 * '!=' through the same grammar, so '!=5' twins '=5'); everything else pos.
 */
export function classifyNumber(rawQ: unknown, qOperator: string | null): Classified<NumberOp> {
	const effective = effectiveOf(rawQ, qOperator);
	if (effective === '') return { kind: 'pos', op: 'none' };
	if (effective.startsWith('!*')) {
		return { kind: 'neg', op: 'empty', twin: { q: '*', qOperator: null } };
	}
	if (effective === '*') return { kind: 'pos', op: 'notEmpty' };
	if (effective.startsWith('!=')) {
		const rest = effective.slice(2);
		if (rest === '') return { kind: 'pos', op: 'none' };
		return {
			kind: 'neq',
			op: 'different',
			has: { q: '*', qOperator: null },
			twin: { q: rest, qOperator: null },
		};
	}
	if (effective.includes('...')) return { kind: 'pos', op: 'between' };
	if (['>=', '<=', '>', '<'].some((comparison) => effective.startsWith(comparison))) {
		return { kind: 'pos', op: 'compare' };
	}
	return { kind: 'pos', op: 'equal' };
}

/** '!=' — has a value AND no value matches the twin (the neq lift, shallow). */
function buildDifferentFragment(
	classified: ReturnType<typeof classifyNumber>,
	context: BuilderContext,
): BuilderResult {
	if (classified.kind !== 'neq')
		throw new DedaloError('internal.invariant', {
			message: 'builder_number: different must classify neq',
		});
	const twin = buildNumberFragment(classified.twin.q, classified.twin.qOperator, context);
	if (twin === false || twin.kind !== 'fragment') return false;
	return fragment(`${hasValue(context)} AND NOT (${twin.sentence})`, twin.tokenValues);
}

export function buildNumberFragment(
	rawQ: unknown,
	qOperator: string | null,
	context: BuilderContext,
): BuilderResult {
	const effective = effectiveOf(rawQ, qOperator);
	const classified = classifyNumber(rawQ, qOperator);

	switch (classified.op) {
		case 'none':
			return false;
		// '!*' — empty
		case 'empty':
			return fragment(
				`(${context.alias}.${context.column}->'${context.tipo}' IS NULL OR NOT ${context.alias}.${context.column} @? (_Q1_)::jsonpath)`,
				{ _Q1_: `$.${context.tipo}[*] ? (@.value != null)` },
			);
		// '*' — not-empty
		case 'notEmpty':
			return fragment(`${context.alias}.${context.column} @? (_Q1_)::jsonpath`, {
				_Q1_: `$.${context.tipo}[*].value ? (@ != null)`,
			});
		// '!=' — has a value AND no value matches the twin (the neq lift, shallow).
		case 'different':
			return buildDifferentFragment(classified, context);
		// '...' between
		case 'between': {
			const [lowRaw, highRaw] = effective.split('...');
			return fragment(
				numericEnvelope(
					context,
					`(elem->>'value')::numeric >= (_Q1_)::numeric AND (elem->>'value')::numeric <= (_Q2_)::numeric`,
				),
				{ _Q1_: coerceNumeric(lowRaw ?? ''), _Q2_: coerceNumeric(highRaw ?? '') },
			);
		}
		// Single comparison operators, longest first.
		case 'compare': {
			const comparisonOperator = (['>=', '<=', '>', '<'] as const).find((comparison) =>
				effective.startsWith(comparison),
			) as string;
			const value = coerceNumeric(effective.slice(comparisonOperator.length));
			return fragment(
				numericEnvelope(context, `(elem->>'value')::numeric ${comparisonOperator} (_Q1_)::numeric`),
				{ _Q1_: value },
			);
		}
		// Default '=' (strip '+' and commas already handled by coerceNumeric).
		case 'equal':
			return fragment(numericEnvelope(context, `(elem->>'value')::numeric = (_Q1_)::numeric`), {
				_Q1_: coerceNumeric(effective.replace(/^=/, '')),
			});
	}
}
