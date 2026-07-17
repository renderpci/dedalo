/**
 * Date-family fragment builder — component_date (matrix column 'date').
 *
 * PHP reference: core/component_date/trait.search_component_date.php +
 * trait.search_component_date_tm.php.
 * Data shape: {"<tipo>": [{"start":{"year":…,"time":<abs seconds>}, "end":{…}}]}.
 *
 * TWO q shapes reach here (PHP extract_normalized_date_q):
 *   - OBJECT q — the date search widget sends its structured value as
 *     data.entries, e.g. `[{start:{year,month,day?}, id:1}]` (the synthetic UI
 *     `id` is ignored). PHP passes structured q straight through to the mode
 *     handlers, which read `->start`. This is the COMMON case; the earlier
 *     builder only parsed plain text and silently DROPPED every object q, so
 *     every date search returned unfiltered results (no error). (2026-07-17)
 *   - PLAIN-TEXT q — the autocomplete picker sends the typed string to EVERY
 *     search field: a plain string is parsed as `[op]YYYY[-MM[-DD]]`; an
 *     UNPARSEABLE string DROPS the clause (return false), exactly like the live
 *     oracle (probed: date-clause q 'roma' → the clause contributes nothing to
 *     its $and group). Without the drop, an $and of [text-field, date-field]
 *     free-text clauses zeroes out and the picker shows nothing.
 *
 * TABLE ROUTING (PHP dispatch_date_mode_sql): the matrix_time_machine and
 * matrix_activity tables carry a dedicated `timestamp` timestamptz column, and
 * PHP routes their date searches to search_component_date_tm — SARGable
 * half-open `"timestamp"` ranges (>= start AND < exclusive_end), NEVER an
 * equality on a computed second. Ordinary sections stay on the JSONB
 * `start.time` path. matrix_activity rows are stamped to second precision, so
 * the old JSONB `@.start.time == <day-boundary>` equality matched nothing —
 * that is why "When" search in section Activity (dd542) never filtered.
 *
 * Times inlined into a jsonpath literal (the JSONB path) are derived, never raw
 * client text — jsonpath forbids binds. The time-machine range bounds DO travel
 * as bound `_Q_` params (a plain `"timestamp"` column comparison, not jsonpath).
 *
 * v0 scope note: the ordinary-table comparison is still a single
 * `start.time <op> t` predicate (PHP 'date'-mode); the JSONB range/period/time
 * date_mode handlers remain unported (rewrite/LEDGER.md known-open). The
 * time-machine path below is a faithful port of the 'date'-mode _tm handler.
 */

import type { BuilderContext, BuilderResult } from './types.ts';
import { fragment } from './types.ts';

const SECONDS_PER_DAY = 24 * 60 * 60;
const SECONDS_PER_MONTH = 31 * SECONDS_PER_DAY; // PHP virtual 31-day month
const SECONDS_PER_YEAR = 372 * SECONDS_PER_DAY; // PHP virtual 372-day year (31*12)

/** Tables whose date data lives in the dedicated `timestamp` column (PHP TM). */
const TIME_MACHINE_TABLES: ReadonlySet<string> = new Set([
	'matrix_time_machine',
	'matrix_activity',
]);

/** A normalized date value: op prefix + coarse Y/M/D precision (0 = absent). */
interface NormalizedDate {
	op: string;
	year: number;
	month: number; // 0 when absent
	day: number; // 0 when absent (only set when month is set)
}

/**
 * PHP dd_date::convert_date_to_seconds (class.dd_date.php:1027): virtual
 * calendar — month/day are 1-based and decremented when present.
 */
function convertDateToSeconds(year: number, month: number, day: number): number {
	const monthIndex = month > 0 ? month - 1 : 0;
	const dayIndex = day > 0 ? day - 1 : 0;
	return year * SECONDS_PER_YEAR + monthIndex * SECONDS_PER_MONTH + dayIndex * SECONDS_PER_DAY;
}

/** Coerce an arbitrary q field to a finite integer, or null when unusable. */
function toInt(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
	if (typeof value === 'string' && /^-?[0-9]+$/.test(value.trim())) {
		return Number.parseInt(value, 10);
	}
	return null;
}

/**
 * PHP extract_normalized_date_q plain-text branch: `[op]YYYY[-MM[-DD]]`
 * (trait.search_component_date.php:147-163). Returns op + coarse components, or
 * null when the string is not date-shaped.
 */
function parsePlainTextDate(q: string): NormalizedDate | null {
	const match = /^(\W{1,2})?([0-9]{1,10})-?([0-9]{1,2})?-?([0-9]{1,2})?$/.exec(q.trim());
	if (match === null) return null;
	const op = (match[1] ?? '').trim();
	const year = Number.parseInt(match[2] as string, 10);
	const monthRaw = match[3] !== undefined ? Number.parseInt(match[3], 10) : 0;
	const month = monthRaw > 0 && monthRaw <= 12 ? monthRaw : 0;
	const dayRaw = month > 0 && match[4] !== undefined ? Number.parseInt(match[4], 10) : 0;
	const day = dayRaw > 0 && dayRaw <= 31 ? dayRaw : 0;
	return { op, year, month, day };
}

/**
 * PHP extract_normalized_date_q object branch: the structured widget value.
 * The meaningful date lives in `->start` (extract_time_from_q reads that
 * field); accept a bare `{year,month,day}` object too for robustness. Returns
 * null when no usable year is present.
 */
function parseObjectDate(q: Record<string, unknown>): NormalizedDate | null {
	const start =
		q.start !== null && typeof q.start === 'object' ? (q.start as Record<string, unknown>) : q;
	const year = toInt(start.year);
	if (year === null) return null;
	const monthRaw = toInt(start.month) ?? 0;
	const month = monthRaw > 0 && monthRaw <= 12 ? monthRaw : 0;
	const dayRaw = month > 0 ? (toInt(start.day) ?? 0) : 0;
	const day = dayRaw > 0 && dayRaw <= 31 ? dayRaw : 0;
	const op = typeof start.op === 'string' ? start.op.trim() : '';
	return { op, year, month, day };
}

/**
 * Normalize the raw q payload to a coarse date (PHP extract_normalized_date_q):
 * unwrap a single-element array, then dispatch on object vs plain-text. Returns
 * null when q is absent or not date-shaped (the caller then drops the clause).
 */
function normalizeDateQ(rawQ: unknown): NormalizedDate | null {
	let value = rawQ;
	if (Array.isArray(value)) value = value[0];
	if (value === undefined || value === null) return null;
	if (typeof value === 'object') {
		return parseObjectDate(value as Record<string, unknown>);
	}
	return parsePlainTextDate(String(value));
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

/** Two-digit zero-pad for a month/day component. */
function pad2(value: number): string {
	return String(value).padStart(2, '0');
}

/** Add one day to a Y/M/D date; UTC arithmetic handles month/year/leap rollover. */
function nextDay(year: number, month: number, day: number): string {
	const date = new Date(Date.UTC(year, month - 1, day));
	date.setUTCDate(date.getUTCDate() + 1);
	return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/**
 * Time-machine 'date'-mode SQL: SARGable `"timestamp"` predicates that honour
 * BOTH the date precision AND the comparison operator.
 *
 * The period is the half-open interval [lower, upper) that the typed value
 * covers — a whole year, a whole month, or a single day (PHP
 * resolve_date_mode_date_sql_tm builds exactly these bounds). The operator then
 * picks which boundary(ies) to compare against, so a partial date compares as a
 * whole span (`> 2026` means "after ALL of 2026", `< 2026` means "before it
 * starts"):
 *
 *   '=' / ''  →  >= lower AND < upper   (inside the period — PHP's range)
 *   '>'       →  >= upper               (strictly after the whole period)
 *   '>='      →  >= lower               (at or after the period start)
 *   '<'       →  <  lower               (before the period starts)
 *   '<='      →  <  upper               (at or before the period end)
 *
 * FUNCTIONALITY-OVER-PARITY (2026-07-17): the PHP _tm handler left directional
 * operators unimplemented — its switch collapsed every operator to the '='
 * range, so `>`/`<` silently behaved like `=` (nothing "after"/"before" ever
 * matched). We implement them here (same precedent as the conform.ts
 * format:'function' allowlist). Bounds travel as bound params (a plain column
 * comparison, not jsonpath). Existence operators are handled by the caller.
 */
function buildTimeMachineDateFragment(
	date: NormalizedDate,
	operator: string,
	context: BuilderContext,
): BuilderResult {
	const column = `${context.alias}."timestamp"`;
	let lower: string;
	let upper: string;
	if (date.month === 0) {
		// Year only: [YYYY-01-01, (YYYY+1)-01-01)
		lower = `${date.year}-01-01`;
		upper = `${date.year + 1}-01-01`;
	} else if (date.day === 0) {
		// Year+month: [YYYY-MM-01, next-month-01)
		lower = `${date.year}-${pad2(date.month)}-01`;
		upper =
			date.month === 12 ? `${date.year + 1}-01-01` : `${date.year}-${pad2(date.month + 1)}-01`;
	} else {
		// Full date: [YYYY-MM-DD, +1 day)
		lower = `${date.year}-${pad2(date.month)}-${pad2(date.day)}`;
		upper = nextDay(date.year, date.month, date.day);
	}
	switch (operator) {
		case '>':
			return fragment(`${column} >= _Q1_::date`, { _Q1_: upper });
		case '>=':
			return fragment(`${column} >= _Q1_::date`, { _Q1_: lower });
		case '<':
			return fragment(`${column} < _Q1_::date`, { _Q1_: lower });
		case '<=':
			return fragment(`${column} < _Q1_::date`, { _Q1_: upper });
		default:
			// '=' / '' — inside the period.
			return fragment(`(${column} >= _Q1_::date AND ${column} < _Q2_::date)`, {
				_Q1_: lower,
				_Q2_: upper,
			});
	}
}

export function buildDateFragment(
	rawQ: unknown,
	qOperator: string | null,
	context: BuilderContext,
): BuilderResult {
	const operator = qOperator ?? '';
	const isTimeMachine = TIME_MACHINE_TABLES.has(context.table);

	// Existence operators (PHP resolve_common_date_operators / _tm). The
	// time-machine variant tests the dedicated `timestamp` column.
	if (operator === '!*') {
		return isTimeMachine
			? fragment(`${context.alias}."timestamp" IS NULL`)
			: fragment(`NOT (${context.alias}.${context.column} @? '$.${context.tipo}[*]')`);
	}
	if (operator === '*') {
		return isTimeMachine
			? fragment(`${context.alias}."timestamp" IS NOT NULL`)
			: fragment(`(${context.alias}.${context.column} @? '$.${context.tipo}[*]')`);
	}

	// Normalize q (object widget value OR plain text). Unparseable / absent q
	// DROPS the clause — PHP parity; the autocomplete's $and over [text, date]
	// fields relies on it (the typed word only has to match the text field).
	const date = normalizeDateQ(rawQ);
	if (date === null) return false;

	// The in-string op prefix wins over the sqo q_operator (PHP dd_date->set_op).
	const effectiveOperator = date.op !== '' ? date.op : operator;

	// Time-machine tables: SARGable `timestamp` predicates (precision + operator
	// aware).
	if (isTimeMachine) {
		return buildTimeMachineDateFragment(date, effectiveOperator, context);
	}

	// Ordinary sections: single JSONB `start.time <op> t` predicate (v0 scope).
	const jsonpathOperator = toJsonpathOperator(effectiveOperator);
	if (jsonpathOperator === null) {
		throw new Error(
			`search builder_date: operator '${effectiveOperator}' not implemented yet (uncovered scope)`,
		);
	}
	const time = convertDateToSeconds(date.year, date.month, date.day);
	return fragment(
		`${context.alias}.${context.column} @? '$.${context.tipo}[*] ? (@.start.time ${jsonpathOperator} ${time})'`,
	);
}
