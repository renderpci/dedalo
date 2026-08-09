/**
 * Date-family fragment builder — component_date (matrix column 'date').
 *
 * PHP reference: core/component_date/trait.search_component_date.php +
 * trait.search_component_date_tm.php, with
 * component_date::get_final_search_range_seconds and
 * dd_date::convert_date_to_seconds (class.dd_date.php:1004).
 * Data shape: {"<tipo>": [{"start":{"year":…,"time":<abs seconds>}, "end":{…}}]}.
 *
 * TWO q shapes reach here (PHP extract_normalized_date_q):
 *   - OBJECT q — the date search widget sends its structured value as
 *     data.entries, e.g. `[{start:{year,month,day?}, id:1}]` (the synthetic UI
 *     `id` is ignored). PHP passes structured q straight through to the mode
 *     handlers, which read `->start` (or `->period` in 'period' mode). This is
 *     the COMMON case; an early builder only parsed plain text and silently
 *     DROPPED every object q, so every date search returned unfiltered results
 *     (no error). (2026-07-17)
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
 * equality on a computed second. Ordinary sections stay on the JSONB path.
 * matrix_activity rows are stamped to second precision, so the old JSONB
 * `@.start.time == <day-boundary>` equality matched nothing — that is why
 * "When" search in section Activity (dd542) never filtered.
 *
 * MODE ROUTING on ordinary tables (PHP dispatch_date_mode_sql, restored
 * 2026-08-09 — audits/2026-08_oh1_beta §5.5). The ontology node's `date_mode`
 * property selects the handler; the builder receives it as
 * `BuilderContext.dateMode` (conform.ts reads it, PHP get_date_search_context
 * reads the same property). 'date'/'range' → interval overlap, 'period' →
 * equality on the `period` container, 'time' → clock window, 'date_time' →
 * start-only window. An UNHANDLED mode THROWS: PHP logged an ERROR and emitted
 * no sentence at all — a silent empty result, the exact failure class this
 * change closes (ledgered: WC-2026-08-09-date-search-uncovered-mode-throws,
 * which also records why the comparison ordinal is always DERIVED here).
 *
 * PARTIAL DATES ARE PERIODS, NOT INSTANTS. A typed `1628` covers the WHOLE of
 * 1628, so equality is an OVERLAP against `[time, final_range]` and the
 * directional operators pick the boundary the question implies (PHP
 * resolve_date_mode_date_range_sql). Before this was ported the ordinary branch
 * emitted a single `start.time == <first second of the period>` predicate, so a
 * year-only search matched only records stamped on 1 January: 0 of 29 matching
 * `oh1` records on the live install, with no error.
 *
 * DERIVED TIMES ONLY. PHP's extract_time_from_q trusts the CLIENT's
 * precomputed `time` field when present; we always recompute it from the
 * y/m/d/h/m/s components. Times are inlined into a jsonpath literal (jsonpath
 * forbids binds), so nothing there may come from raw client input. For a
 * well-formed widget value the two are identical — the widget runs the same
 * dd_date arithmetic. The time-machine range bounds DO travel as bound `_Q_`
 * params (a plain `"timestamp"` column comparison, not jsonpath).
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

/** PHP get_date_search_context: `$properties->date_mode ?? 'date'`. */
const DEFAULT_DATE_MODE = 'date';

/**
 * A normalized date value: op prefix + the dd_date components that were
 * actually supplied. `null` means ABSENT (PHP dd_date's unset field), which is
 * distinct from 0 — midnight is `hour: 0`, no hour at all is `hour: null`, and
 * get_final_search_range_seconds branches on exactly that distinction.
 */
export interface NormalizedDate {
	op: string;
	year: number | null;
	month: number | null;
	day: number | null;
	hour: number | null;
	minute: number | null;
	second: number | null;
}

/** One half-open boundary comparison against a date column (`col cmp bound`). */
export interface DateBoundary {
	cmp: '>=' | '<';
	/** A `YYYY-MM-DD` date string (cast to ::date by the caller). */
	bound: string;
}

/** The comparison operators the date family accepts (PHP's own switch arms). */
const COMPARISON_OPERATORS: ReadonlySet<string> = new Set(['', '=', '<', '>', '<=', '>=']);

/**
 * PHP dd_date::convert_date_to_seconds (class.dd_date.php:1027): virtual
 * calendar — month/day are 1-based and decremented when present; absent fields
 * count as 0. NOT a unix timestamp, an ordinal.
 */
function convertDateToSeconds(date: NormalizedDate): number {
	const year = date.year ?? 0;
	const monthRaw = date.month ?? 0;
	const dayRaw = date.day ?? 0;
	const month = Math.max(monthRaw > 0 ? monthRaw - 1 : monthRaw, 0);
	const day = Math.max(dayRaw > 0 ? dayRaw - 1 : dayRaw, 0);
	const hour = Math.max(date.hour ?? 0, 0);
	const minute = Math.max(date.minute ?? 0, 0);
	const second = Math.max(date.second ?? 0, 0);
	return (
		year * SECONDS_PER_YEAR +
		month * SECONDS_PER_MONTH +
		day * SECONDS_PER_DAY +
		hour * 3600 +
		minute * 60 +
		second
	);
}

/**
 * PHP component_date::get_final_search_range_seconds (class.component_date.php:515)
 * — the INCLUSIVE upper bound of the period a partial date covers.
 *
 * Time block: the finest UNSET clock field is filled with its maximum (minute
 * set, second unset → :59; hour set, minute unset → :59:59); a set second is
 * already exact.
 * Date block (runs second and OVERWRITES the time block, as PHP's does):
 * advance the least-significant SET calendar field by one and subtract a
 * second, so `1628` → last second of 1628, `1628-06` → last second of June.
 *
 * The virtual calendar makes the rollovers fall out for free: month 12 + 1 = 13
 * decrements to index 12 = 372 days = exactly one virtual year.
 */
function finalSearchRangeSeconds(date: NormalizedDate): number {
	let final = 0;

	// Time
	if (date.second !== null) {
		final = convertDateToSeconds(date);
	} else if (date.minute !== null) {
		final = convertDateToSeconds({ ...date, second: 59 });
	} else if (date.hour !== null) {
		final = convertDateToSeconds({ ...date, minute: 59, second: 59 });
	}

	// Date (overwrites the time block — PHP's documented ordering)
	if (date.day !== null) {
		final = convertDateToSeconds({ ...date, day: date.day + 1 }) - 1;
	} else if (date.month !== null) {
		final = convertDateToSeconds({ ...date, month: date.month + 1 }) - 1;
	} else if (date.year !== null) {
		final = convertDateToSeconds({ ...date, year: date.year + 1 }) - 1;
	}

	return final;
}

/** Coerce an arbitrary q field to a finite integer, or null when unusable. */
function toInt(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
	if (typeof value === 'string' && /^-?[0-9]+$/.test(value.trim())) {
		return Number.parseInt(value, 10);
	}
	return null;
}

/** Accept an integer only inside `[min, max]`; anything else is ABSENT (null). */
function bounded(value: unknown, min: number, max: number): number | null {
	const parsed = toInt(value);
	if (parsed === null || parsed < min || parsed > max) return null;
	return parsed;
}

const EMPTY_DATE: NormalizedDate = {
	op: '',
	year: null,
	month: null,
	day: null,
	hour: null,
	minute: null,
	second: null,
};

/**
 * PHP extract_normalized_date_q plain-text branch: `[op]YYYY[-MM[-DD]]`
 * (trait.search_component_date.php:147-163). Returns op + coarse components, or
 * null when the string is not date-shaped.
 */
function parsePlainTextDate(q: string): NormalizedDate | null {
	const match = /^(\W{1,2})?([0-9]{1,10})-?([0-9]{1,2})?-?([0-9]{1,2})?$/.exec(q.trim());
	if (match === null) return null;
	const month = bounded(match[3], 1, 12);
	// PHP nests the day capture inside the month check — no day without a month.
	const day = month === null ? null : bounded(match[4], 1, 31);
	return {
		...EMPTY_DATE,
		op: (match[1] ?? '').trim(),
		year: Number.parseInt(match[2] as string, 10),
		month,
		day,
	};
}

/**
 * PHP extract_normalized_date_q object branch: the structured widget value.
 * The meaningful container is `->start` for every mode except 'period', whose
 * handler reads `->period` (PHP extract_time_from_q's `$field`); a bare
 * `{year,month,day}` object is accepted too for robustness. Returns null when
 * the container carries NO usable component — a clock-only value (`{hour:14}`,
 * date_mode 'time') is perfectly usable and must NOT be dropped.
 */
function parseObjectDate(q: Record<string, unknown>, field: string): NormalizedDate | null {
	const container =
		q[field] !== null && typeof q[field] === 'object'
			? (q[field] as Record<string, unknown>)
			: field === 'start'
				? q
				: null;
	if (container === null) return null;
	const month = bounded(container.month, 1, 12);
	const day = month === null ? null : bounded(container.day, 1, 31);
	const date: NormalizedDate = {
		op: typeof container.op === 'string' ? container.op.trim() : '',
		year: toInt(container.year),
		month,
		day,
		hour: bounded(container.hour, 0, 23),
		minute: bounded(container.minute, 0, 59),
		second: bounded(container.second, 0, 59),
	};
	const usable =
		date.year !== null ||
		date.month !== null ||
		date.hour !== null ||
		date.minute !== null ||
		date.second !== null;
	return usable ? date : null;
}

/**
 * Normalize the raw q payload to a coarse date (PHP extract_normalized_date_q):
 * unwrap a single-element array, then dispatch on object vs plain-text. Returns
 * null when q is absent or not date-shaped (the caller then drops the clause).
 * `field` names the container the active date_mode reads ('start' everywhere
 * except 'period').
 */
export function normalizeDateQ(rawQ: unknown, field = 'start'): NormalizedDate | null {
	let value = rawQ;
	if (Array.isArray(value)) value = value[0];
	if (value === undefined || value === null) return null;
	if (typeof value === 'object') {
		return parseObjectDate(value as Record<string, unknown>, field);
	}
	// A plain string only ever spells a CALENDAR date; a duration has no
	// plain-text spelling (the 'period' widget is a numeric year/month/day
	// triple). PHP parsed the text into `->start` anyway, then read the absent
	// `->period` and emitted `period.time == 0` — a clause matching nothing,
	// which zeroes out the picker's $and over [text-field, period-field]. We
	// DROP it instead, the same contract as any other unparseable date q
	// (probed on the live oracle: 'roma' contributes nothing to its $and).
	return field === 'start' ? parsePlainTextDate(String(value)) : null;
}

/** Map a Dédalo comparison operator to its jsonpath twin. */
function toJsonpathOperator(operator: string): string {
	return operator === '=' || operator === '' ? '==' : operator;
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
 * The `[lower, upper)` date boundaries the typed value covers — a whole year,
 * month, or single day (PHP resolve_date_mode_date_sql_tm builds exactly these).
 * The year is a REQUIRED parameter, not read off NormalizedDate: a yearless q
 * has no `timestamp`-column expression at all, and taking `year: number` makes
 * that impossible to forget at a call site (the only caller is
 * timeMachineDatePredicates, which decides the yearless case once, for both
 * consumers).
 */
function periodBounds(
	year: number,
	month: number | null,
	day: number | null,
): { lower: string; upper: string } {
	if (month === null) {
		// Year only: [YYYY-01-01, (YYYY+1)-01-01)
		return { lower: `${year}-01-01`, upper: `${year + 1}-01-01` };
	}
	if (day === null) {
		// Year+month: [YYYY-MM-01, next-month-01)
		return {
			lower: `${year}-${pad2(month)}-01`,
			upper: month === 12 ? `${year + 1}-01-01` : `${year}-${pad2(month + 1)}-01`,
		};
	}
	// Full date: [YYYY-MM-DD, +1 day)
	return {
		lower: `${year}-${pad2(month)}-${pad2(day)}`,
		upper: nextDay(year, month, day),
	};
}

/**
 * The SARGable `timestamp`-column comparison(s) a `(date, operator)` implies —
 * the SINGLE source of truth shared by the standard date builder (matrix_activity
 * / matrix_time_machine, `_Q_`-token fragments) and the Time Machine read path
 * (resolve/tm_filter.ts, `$N` params). A partial date compares as a WHOLE span:
 *
 *   '=' / ''  →  >= lower AND < upper   (inside the period)
 *   '>'       →  >= upper               (strictly after the whole period)
 *   '>='      →  >= lower               (at or after the period start)
 *   '<'       →  <  lower               (before the period starts)
 *   '<='      →  <  upper               (at or before the period end)
 *
 * FUNCTIONALITY-OVER-PARITY (2026-07-17): PHP's `_tm` handler left directional
 * operators unimplemented — its switch collapsed every operator to the '=' range,
 * so `>`/`<` silently behaved like `=`. We implement them (WC-036).
 *
 * YEARLESS q → `null` (DROP THE CLAUSE), the ONE place that decision is taken.
 * A clock-only value (`{hour:14}`, date_mode 'time') has no expression on a
 * timestamptz column: there is no calendar span to bound. PHP fell through to
 * its "full date" branch and built `get_dd_timestamp("Y-m-d")` off an unset
 * year — the literal `'0000-06-00'`, which Postgres rejects, so the whole
 * search 500'd. Dropping the clause is the date family's established contract
 * for a q this column cannot express (the same contract as an unparseable
 * plain-text q), and returning null rather than throwing keeps BOTH consumers
 * — this file's TM branch and resolve/tm_filter.ts — on it by construction.
 * The caller must not substitute a bound of its own.
 */
export function timeMachineDatePredicates(
	date: NormalizedDate,
	operator: string,
): DateBoundary[] | null {
	if (date.year === null) return null;
	const { lower, upper } = periodBounds(date.year, date.month, date.day);
	switch (operator) {
		case '>':
			return [{ cmp: '>=', bound: upper }];
		case '>=':
			return [{ cmp: '>=', bound: lower }];
		case '<':
			return [{ cmp: '<', bound: lower }];
		case '<=':
			return [{ cmp: '<', bound: upper }];
		default:
			// '=' / '' — inside the period.
			return [
				{ cmp: '>=', bound: lower },
				{ cmp: '<', bound: upper },
			];
	}
}

function buildTimeMachineDateFragment(
	date: NormalizedDate,
	operator: string,
	context: BuilderContext,
): BuilderResult {
	const column = `${context.alias}."timestamp"`;
	const predicates = timeMachineDatePredicates(date, operator);
	// Yearless q: not addressable on a timestamp column — drop the clause.
	if (predicates === null) return false;
	const tokens: Record<string, unknown> = {};
	const parts = predicates.map((predicate, index) => {
		const token = `_Q${index + 1}_`;
		tokens[token] = predicate.bound;
		return `${column} ${predicate.cmp} ${token}::date`;
	});
	const sentence = parts.length > 1 ? `(${parts.join(' AND ')})` : (parts[0] as string);
	return fragment(sentence, tokens);
}

/** `<alias>.<column> @? '$.<tipo>[*] ? (<predicate>)'` — the PHP sentence shape. */
function jsonpathFragment(context: BuilderContext, predicate: string): BuilderResult {
	return fragment(`${context.alias}.${context.column} @? '$.${context.tipo}[*] ? (${predicate})'`);
}

/**
 * PHP resolve_date_mode_date_range_sql — date_mode 'date' and 'range'.
 *
 *   '<' / '>='  → threshold on the period START (the typed moment).
 *   '>' / '<='  → threshold on the period END, so `> 1930` excludes records
 *                 that started DURING 1930.
 *   '=' / other → INTERVAL OVERLAP: a stored span whose [start, end] brackets
 *                 the typed moment, OR a start falling anywhere inside the
 *                 typed period (the branch that carries single-container
 *                 'date' records, which have no `end`).
 */
function buildDateRangeFragment(
	date: NormalizedDate,
	operator: string,
	context: BuilderContext,
): BuilderResult {
	const time = convertDateToSeconds(date);
	if (operator === '<' || operator === '>=') {
		return jsonpathFragment(context, `@.start.time ${operator} ${time}`);
	}
	if (operator === '>' || operator === '<=') {
		return jsonpathFragment(context, `@.start.time ${operator} ${finalSearchRangeSeconds(date)}`);
	}
	const final = finalSearchRangeSeconds(date);
	return jsonpathFragment(
		context,
		`(@.start.time <= ${time} && @.end.time >= ${time})` +
			` || (@.start.time >= ${time} && @.start.time <= ${final})`,
	);
}

/**
 * PHP resolve_date_mode_period_sql — date_mode 'period' (durations: "2 years,
 * 3 months"). The value lives in the `period` container, and EVERY operator
 * falls through to exact equality (PHP has no directional period comparison).
 */
function buildPeriodFragment(date: NormalizedDate, context: BuilderContext): BuilderResult {
	return jsonpathFragment(context, `@.period.time == ${convertDateToSeconds(date)}`);
}

/**
 * PHP resolve_date_mode_time_sql — date_mode 'time' (clock-only values).
 * '=' is a window over the typed precision ('14' covers 14:00:00–14:59:59);
 * every other operator compares the exact typed second.
 */
function buildTimeFragment(
	date: NormalizedDate,
	operator: string,
	context: BuilderContext,
): BuilderResult {
	const time = convertDateToSeconds(date);
	if (operator === '==') {
		return jsonpathFragment(
			context,
			`@.start.time >= ${time} && @.start.time <= ${finalSearchRangeSeconds(date)}`,
		);
	}
	return jsonpathFragment(context, `@.start.time ${operator} ${time}`);
}

/**
 * PHP resolve_date_mode_date_time_sql — date_mode 'date_time'. Same boundary
 * choice as 'date'/'range', but the '=' case is a plain window on start.time:
 * a date_time value has no `end` container, so there is no overlap to test.
 */
function buildDateTimeFragment(
	date: NormalizedDate,
	operator: string,
	context: BuilderContext,
): BuilderResult {
	const time = convertDateToSeconds(date);
	const final = finalSearchRangeSeconds(date);
	if (operator === '<' || operator === '>=') {
		return jsonpathFragment(context, `@.start.time ${operator} ${time}`);
	}
	if (operator === '>' || operator === '<=') {
		return jsonpathFragment(context, `@.start.time ${operator} ${final}`);
	}
	return jsonpathFragment(context, `@.start.time >= ${time} && @.start.time <= ${final}`);
}

export function buildDateFragment(
	rawQ: unknown,
	qOperator: string | null,
	context: BuilderContext,
): BuilderResult {
	const operator = qOperator ?? '';
	const isTimeMachine = TIME_MACHINE_TABLES.has(context.table);

	// Existence operators (PHP resolve_common_date_operators / _tm), resolved
	// BEFORE the mode dispatch — they are mode-agnostic and need no date value.
	// The time-machine variant tests the dedicated `timestamp` column.
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

	const dateMode = context.dateMode ?? DEFAULT_DATE_MODE;

	// Which container the active mode reads (PHP extract_time_from_q $field).
	const container = dateMode === 'period' ? 'period' : 'start';

	// Normalize q (object widget value OR plain text). Unparseable / absent q
	// DROPS the clause — PHP parity; the autocomplete's $and over [text, date]
	// fields relies on it (the typed word only has to match the text field).
	const date = normalizeDateQ(rawQ, container);
	if (date === null) return false;

	// The in-string op prefix wins over the sqo q_operator (WC-036; PHP stores
	// it on the dd_date via set_op but never consults it when building SQL).
	const effectiveOperator = date.op !== '' ? date.op : operator;
	if (!COMPARISON_OPERATORS.has(effectiveOperator)) {
		throw new Error(
			`search builder_date: operator '${effectiveOperator}' not implemented yet (uncovered scope)`,
		);
	}

	// Time-machine tables: SARGable `timestamp` predicates (precision + operator
	// aware). A yearless q there cannot be expressed and drops the clause —
	// decided once inside timeMachineDatePredicates, shared with tm_filter.ts.
	if (isTimeMachine) {
		return buildTimeMachineDateFragment(date, effectiveOperator, context);
	}

	// Ordinary sections: the JSONB per-mode handlers (PHP dispatch_date_mode_sql).
	const jsonpathOperator = toJsonpathOperator(effectiveOperator);
	switch (dateMode) {
		case 'date':
		case 'range':
			return buildDateRangeFragment(date, jsonpathOperator, context);
		case 'period':
			return buildPeriodFragment(date, context);
		case 'time':
			return buildTimeFragment(date, jsonpathOperator, context);
		case 'datetime': // PHP logs the misspelling and falls through
		case 'date_time':
			return buildDateTimeFragment(date, jsonpathOperator, context);
		default:
			// PHP resolve_date_mode_unknown_sql logs an ERROR and emits NO
			// sentence — a silent empty result. Uncovered scope fails loudly.
			throw new Error(
				`search builder_date: date_mode '${dateMode}' is not implemented (uncovered scope; PHP emitted no sentence at all here)`,
			);
	}
}
