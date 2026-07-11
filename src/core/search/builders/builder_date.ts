/**
 * Date-family fragment builder — component_date (matrix column 'date').
 *
 * PHP reference: core/component_date/trait.search_component_date.php.
 * Data shape: {"<tipo>": [{"start":{"year":…,"time":<abs seconds>}, "end":{…}}]}.
 * Dates are matched by the absolute-second `time` field via jsonpath filters
 * (times are inlined into the jsonpath, NOT parameterized — jsonpath forbids
 * binds inside the literal; the value is derived, never raw client text).
 *
 * Free-text q follows PHP extract_normalized_date_q (2026-07-09, the
 * autocomplete picker sends the typed string to EVERY search field): a plain
 * string is parsed as `[op]YYYY[-MM[-DD]]` and converted to virtual-calendar
 * seconds (dd_date::convert_date_to_seconds — 372-day years, 31-day months);
 * an UNPARSEABLE string DROPS the clause (return false), exactly like the
 * live oracle (probed: date-clause q 'roma' over numisdata6 → unfiltered 564
 * on PHP, i.e. the clause contributes nothing to its group). Without the
 * drop, an $and group of [text-field, date-field] free-text clauses zeroes
 * out and the picker shows nothing.
 *
 * v0 scope note: comparisons are single `start.time <op> t` predicates (PHP
 * 'date'-mode). The range/period/time date_mode handlers remain unported
 * (rewrite/LEDGER.md known-open).
 */

import type { BuilderContext, BuilderResult } from './types.ts';
import { extractNormalizedQ, fragment } from './types.ts';

const SECONDS_PER_DAY = 24 * 60 * 60;
const SECONDS_PER_MONTH = 31 * SECONDS_PER_DAY; // PHP virtual 31-day month
const SECONDS_PER_YEAR = 372 * SECONDS_PER_DAY; // PHP virtual 372-day year (31*12)

/**
 * PHP dd_date::convert_date_to_seconds (class.dd_date.php:1027): virtual
 * calendar — month/day are 1-based and decremented when present.
 */
function convertDateToSeconds(year: number, month: number, day: number): number {
	const monthIndex = month > 0 ? month - 1 : 0;
	const dayIndex = day > 0 ? day - 1 : 0;
	return year * SECONDS_PER_YEAR + monthIndex * SECONDS_PER_MONTH + dayIndex * SECONDS_PER_DAY;
}

/**
 * PHP extract_normalized_date_q plain-text branch: `[op]YYYY[-MM[-DD]]`
 * (trait.search_component_date.php:143-178). Returns the op prefix + the
 * virtual-calendar seconds, or null when the string is not date-shaped.
 */
function parsePlainTextDateQ(q: string): { op: string; time: number } | null {
	const match = /^(\W{1,2})?([0-9]{1,10})-?([0-9]{1,2})?-?([0-9]{1,2})?$/.exec(q.trim());
	if (match === null) return null;
	const op = (match[1] ?? '').trim();
	const year = Number.parseInt(match[2] as string, 10);
	const monthRaw = match[3] !== undefined ? Number.parseInt(match[3], 10) : 0;
	const month = monthRaw > 0 && monthRaw <= 12 ? monthRaw : 0;
	const dayRaw = month > 0 && match[4] !== undefined ? Number.parseInt(match[4], 10) : 0;
	const day = dayRaw > 0 && dayRaw <= 31 ? dayRaw : 0;
	return { op, time: convertDateToSeconds(year, month, day) };
}

/** Map a Dédalo comparison operator to its jsonpath twin (null = unsupported). */
function toJsonpathOperator(operator: string): string | null {
	switch (operator) {
		case '<':
		case '>':
		case '<=':
		case '>=':
			return operator;
		case '=':
		case '':
			return '==';
		default:
			return null;
	}
}

export function buildDateFragment(
	rawQ: unknown,
	qOperator: string | null,
	context: BuilderContext,
): BuilderResult {
	const operator = qOperator ?? '';

	// Existence operators (PHP resolve_common_date_operators).
	if (operator === '!*') {
		return fragment(`NOT (${context.alias}.${context.column} @? '$.${context.tipo}[*]')`);
	}
	if (operator === '*') {
		return fragment(`(${context.alias}.${context.column} @? '$.${context.tipo}[*]')`);
	}

	const q = extractNormalizedQ(rawQ);
	if (q === null) return false;

	// Plain-text parse (PHP regex). Unparseable text with no operator DROPS the
	// clause — PHP parity; the autocomplete's $and over [text, date] fields
	// relies on it (the typed word only has to match the text field).
	const parsed = parsePlainTextDateQ(q);
	if (parsed === null) {
		if (operator === '') return false;
		// Operator present but q unparseable: PHP falls back to an empty q
		// envelope whose mode handler emits nothing — same observable drop.
		return false;
	}

	// The in-string op prefix wins over sqo q_operator (PHP dd_date->set_op).
	const jsonpathOperator = toJsonpathOperator(parsed.op !== '' ? parsed.op : operator);
	if (jsonpathOperator === null) {
		throw new Error(
			`search builder_date: operator '${parsed.op || operator}' not implemented yet (uncovered scope)`,
		);
	}
	return fragment(
		`${context.alias}.${context.column} @? '$.${context.tipo}[*] ? (@.start.time ${jsonpathOperator} ${parsed.time})'`,
	);
}
