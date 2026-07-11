/**
 * section_id fragment builder — component_section_id (REAL int column, not JSONB).
 *
 * PHP reference: core/component_section_id/trait.search_component_section_id.php.
 * The q may carry the operator as a prefix (PHP prepends q_operator to q).
 *
 * Operators: '...' between (as an $and compound), ',' sequence (= ANY array),
 * '!=', '>=', '<=', '>', '<', default '='. Values digit-stripped.
 */

import type { BuilderContext, BuilderResult } from './types.ts';
import { compound, extractNormalizedQ, fragment } from './types.ts';

/** Strip everything but digits (PHP preg_replace('/[^0-9]/','')). */
function digitsOnly(value: string): string {
	return value.replace(/[^0-9]/g, '');
}

export function buildSectionIdFragment(
	rawQ: unknown,
	qOperator: string | null,
	context: BuilderContext,
): BuilderResult {
	// PHP unwraps locator-shaped q ({value} then {section_id}).
	let q = extractNormalizedQ(rawQ);
	if (q === null && rawQ !== null && typeof rawQ === 'object' && 'section_id' in (rawQ as object)) {
		q = String((rawQ as { section_id: unknown }).section_id);
	}
	const effective = `${qOperator ?? ''}${q ?? ''}`;
	if (effective === '') {
		return false;
	}
	const columnExpr = `${context.alias}.section_id::integer`;

	// '...' between → $and of two comparisons (mirrors the PHP clone approach).
	if (effective.includes('...')) {
		const [lowRaw, highRaw] = effective.split('...');
		const low = digitsOnly(lowRaw ?? '');
		const high = digitsOnly(highRaw ?? '');
		if (low === '' || high === '') return false;
		return compound('$and', [
			fragment(`${columnExpr} >= _Q1_`, { _Q1_: low }),
			fragment(`${columnExpr} <= _Q1_`, { _Q1_: high }),
		]);
	}
	// ',' sequence → = ANY('{a,b,c}'::integer[])
	if (effective.includes(',')) {
		const ids = effective
			.split(',')
			.map(digitsOnly)
			.filter((id) => id !== '');
		if (ids.length === 0) return false;
		return fragment(`${columnExpr} = ANY(_Q1_::integer[])`, { _Q1_: `{${ids.join(',')}}` });
	}
	// Comparison operators, longest first.
	for (const comparisonOperator of ['!=', '>=', '<=', '>', '<'] as const) {
		if (effective.startsWith(comparisonOperator)) {
			const value = digitsOnly(effective.slice(comparisonOperator.length));
			if (value === '') return false;
			return fragment(`${columnExpr} ${comparisonOperator} _Q1_`, { _Q1_: value });
		}
	}
	// Default '='
	const value = digitsOnly(effective);
	if (value === '') return false;
	return fragment(`${columnExpr} = _Q1_`, { _Q1_: value });
}
