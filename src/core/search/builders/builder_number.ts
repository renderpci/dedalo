/**
 * Number-family fragment builder — component_number (column 'number').
 *
 * PHP reference: core/component_number/trait.search_component_number.php.
 * Data shape: {"<tipo>": [{"id":1,"value":4.54}, …]}.
 *
 * Operators (2-char before 1-char): '!*', '*', '...' between, '>=', '<=',
 * '>', '<', default '='. Every bound value is cast ::numeric; non-numeric
 * input coerces to '0' (PHP SEARCH-02 hardening).
 */

import type { BuilderContext, BuilderResult } from './types.ts';
import { extractNormalizedQ, fragment } from './types.ts';

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

export function buildNumberFragment(
	rawQ: unknown,
	qOperator: string | null,
	context: BuilderContext,
): BuilderResult {
	const q = extractNormalizedQ(rawQ) ?? '';
	const operator = qOperator ?? '';
	const effective = operator !== '' ? operator + q : q;

	if (effective === '') {
		return false;
	}

	// '!*' — empty
	if (effective.startsWith('!*')) {
		return fragment(
			`(${context.alias}.${context.column}->'${context.tipo}' IS NULL OR NOT ${context.alias}.${context.column} @? (_Q1_)::jsonpath)`,
			{ _Q1_: `$.${context.tipo}[*] ? (@.value != null)` },
		);
	}
	// '*' — not-empty
	if (effective === '*') {
		return fragment(`${context.alias}.${context.column} @? (_Q1_)::jsonpath`, {
			_Q1_: `$.${context.tipo}[*].value ? (@ != null)`,
		});
	}
	// '...' between
	if (effective.includes('...')) {
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
	for (const comparisonOperator of ['>=', '<=', '>', '<'] as const) {
		if (effective.startsWith(comparisonOperator)) {
			const value = coerceNumeric(effective.slice(comparisonOperator.length));
			return fragment(
				numericEnvelope(context, `(elem->>'value')::numeric ${comparisonOperator} (_Q1_)::numeric`),
				{ _Q1_: value },
			);
		}
	}
	// Default '=' (strip '+' and commas already handled by coerceNumeric).
	return fragment(numericEnvelope(context, `(elem->>'value')::numeric = (_Q1_)::numeric`), {
		_Q1_: coerceNumeric(effective.replace(/^=/, '')),
	});
}
