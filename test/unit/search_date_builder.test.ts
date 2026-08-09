/**
 * builder_date unit gate (no DB, no oracle) — locks the two contracts whose
 * absence broke "When" (dd547) search in section Activity (dd542), 2026-07-17:
 *
 *   1. OBJECT-shaped q. The date search widget sends its value as a structured
 *      object (data.entries: `[{start:{year,month,day?}, id}]`), NOT plain text.
 *      The builder must normalize it; the earlier builder stringified it to
 *      "[object Object]", failed to parse, and silently DROPPED the clause, so
 *      every date search ran unfiltered.
 *
 *   2. TIME-MACHINE table routing. matrix_activity / matrix_time_machine carry a
 *      dedicated `timestamp` column; PHP (search_component_date_tm) builds a
 *      SARGable half-open range there. matrix_activity rows are second-precise,
 *      so the ordinary JSONB `@.start.time == <day-boundary>` equality matched
 *      nothing. The builder must emit a `"timestamp"` range instead.
 *
 * Ordinary-table JSONB behavior is kept as a control so the TM fix does not
 * silently change non-TM sections. Its EXPECTED SHAPE MOVED on 2026-08-09: the
 * v0 single-point `@.start.time == t` predicate this file used to pin was
 * itself the bug (a partial date is a PERIOD, so a year-only search matched
 * only records stamped on 1 January — 0 of 29 matching `oh1` records on the
 * live install). PHP's ordinary-table handler
 * (trait.search_component_date.php `resolve_date_mode_date_range_sql`) always
 * emitted the INTERVAL OVERLAP the two assertions below now pin; the golden
 * moved TOWARD the oracle, not away from it. Ledger:
 * WC-036 addendum 2026-08-09.
 */

import { describe, expect, test } from 'bun:test';
import { conformTmFilter, type ParamSink } from '../../src/core/resolve/tm_filter.ts';
import { buildDateFragment } from '../../src/core/search/builders/builder_date.ts';
import type { BuilderContext } from '../../src/core/search/builders/types.ts';

function ctx(overrides: Partial<BuilderContext> = {}): BuilderContext {
	return {
		alias: 'dd542',
		column: 'date',
		tipo: 'dd547',
		sectionTipo: 'dd542',
		table: 'matrix_activity',
		lang: 'lg-nolan',
		translatable: false,
		model: 'component_date',
		...overrides,
	};
}

describe('builder_date — time-machine tables (matrix_activity)', () => {
	test('object q {start:{year,month}} → SARGable month range on "timestamp"', () => {
		const result = buildDateFragment([{ start: { year: 2026, month: 6 }, id: 1 }], '=', ctx());
		expect(result).toEqual({
			kind: 'fragment',
			sentence: '(dd542."timestamp" >= _Q1_::date AND dd542."timestamp" < _Q2_::date)',
			tokenValues: { _Q1_: '2026-06-01', _Q2_: '2026-07-01' },
		});
	});

	test('bare object q {year,month} (no start wrapper) → same month range', () => {
		const result = buildDateFragment([{ year: 2026, month: 6, id: 1 }], '=', ctx());
		expect(result).toMatchObject({ tokenValues: { _Q1_: '2026-06-01', _Q2_: '2026-07-01' } });
	});

	test('plain-text "2026-06" → same month range (autocomplete picker path)', () => {
		const result = buildDateFragment(['2026-06'], '=', ctx());
		expect(result).toMatchObject({ tokenValues: { _Q1_: '2026-06-01', _Q2_: '2026-07-01' } });
	});

	test('year only → full-year range', () => {
		const result = buildDateFragment(['2026'], '=', ctx());
		expect(result).toMatchObject({ tokenValues: { _Q1_: '2026-01-01', _Q2_: '2027-01-01' } });
	});

	test('December wraps the exclusive upper bound into the next year', () => {
		const result = buildDateFragment([{ start: { year: 2026, month: 12 } }], '=', ctx());
		expect(result).toMatchObject({ tokenValues: { _Q1_: '2026-12-01', _Q2_: '2027-01-01' } });
	});

	test('full date → +1-day range, with month/leap rollover', () => {
		expect(
			buildDateFragment([{ start: { year: 2024, month: 2, day: 29 } }], '=', ctx()),
		).toMatchObject({ tokenValues: { _Q1_: '2024-02-29', _Q2_: '2024-03-01' } });
		expect(
			buildDateFragment([{ start: { year: 2026, month: 1, day: 31 } }], '=', ctx()),
		).toMatchObject({ tokenValues: { _Q1_: '2026-01-31', _Q2_: '2026-02-01' } });
	});

	test('comparison operators compare against the whole period boundaries', () => {
		// day precision, ref 2026-07-16 → period [2026-07-16, 2026-07-17)
		const day = [{ start: { year: 2026, month: 7, day: 16 } }];
		expect(buildDateFragment(day, '>', ctx())).toEqual({
			kind: 'fragment',
			sentence: 'dd542."timestamp" >= _Q1_::date',
			tokenValues: { _Q1_: '2026-07-17' }, // strictly after the whole day
		});
		expect(buildDateFragment(day, '>=', ctx())).toMatchObject({
			sentence: 'dd542."timestamp" >= _Q1_::date',
			tokenValues: { _Q1_: '2026-07-16' },
		});
		expect(buildDateFragment(day, '<', ctx())).toMatchObject({
			sentence: 'dd542."timestamp" < _Q1_::date',
			tokenValues: { _Q1_: '2026-07-16' },
		});
		expect(buildDateFragment(day, '<=', ctx())).toMatchObject({
			sentence: 'dd542."timestamp" < _Q1_::date',
			tokenValues: { _Q1_: '2026-07-17' }, // at or before the whole day
		});
	});

	test('directional operators span the whole period for partial dates', () => {
		// "> 2026" means after ALL of 2026 → >= 2027-01-01; "< 2026" → before it starts.
		expect(buildDateFragment(['2026'], '>', ctx())).toMatchObject({
			sentence: 'dd542."timestamp" >= _Q1_::date',
			tokenValues: { _Q1_: '2027-01-01' },
		});
		expect(buildDateFragment(['2026'], '<', ctx())).toMatchObject({
			sentence: 'dd542."timestamp" < _Q1_::date',
			tokenValues: { _Q1_: '2026-01-01' },
		});
	});

	test('the in-string op prefix wins over q_operator (PHP dd_date->set_op)', () => {
		// plain-text ">2026" carries its own op; the sqo q_operator is empty.
		expect(buildDateFragment(['>2026'], '', ctx())).toMatchObject({
			sentence: 'dd542."timestamp" >= _Q1_::date',
			tokenValues: { _Q1_: '2027-01-01' },
		});
	});

	test('existence operators test the timestamp column, not the jsonb path', () => {
		expect(buildDateFragment(null, '*', ctx())).toMatchObject({
			sentence: 'dd542."timestamp" IS NOT NULL',
		});
		expect(buildDateFragment(null, '!*', ctx())).toMatchObject({
			sentence: 'dd542."timestamp" IS NULL',
		});
	});

	test('absent / unparseable q still drops the clause (picker $and parity)', () => {
		expect(buildDateFragment([{ start: {} }], '=', ctx())).toBe(false);
		expect(buildDateFragment(['not-a-date'], '', ctx())).toBe(false);
		expect(buildDateFragment(null, '', ctx())).toBe(false);
	});
});

describe('builder_date — ordinary sections (JSONB, PHP interval overlap)', () => {
	const ordinary = ctx({ alias: 'oh1', table: 'matrix', tipo: 'oh62' });

	test('object q resolves to the PHP interval overlap (no longer dropped, no longer a point)', () => {
		// GOLDEN MOVED 2026-08-09. This used to expect the single-point
		// `@.start.time == 65131862400`. PHP never emitted that: its
		// resolve_date_mode_date_range_sql expands the typed value to
		// [time, get_final_search_range_seconds(value)] and emits the two-branch
		// OVERLAP below — branch 1 for a stored span that BRACKETS the typed
		// moment (a point equality can never express it), branch 2 for a start
		// falling anywhere inside the typed period. The old expectation encoded
		// the TS v0 shortcut, i.e. the defect; it is not an oracle golden.
		//   convert_date_to_seconds(2026,6,15) = 2026*372d + 5*31d + 14d
		//                                      = 65117260800 + 13392000 + 1209600
		//                                      = 65131862400
		//   final (day set → next day − 1s)    = 65131948799
		const result = buildDateFragment([{ start: { year: 2026, month: 6, day: 15 } }], '=', ordinary);
		expect(result).toMatchObject({
			sentence:
				"oh1.date @? '$.oh62[*] ? ((@.start.time <= 65131862400 && @.end.time >= 65131862400)" +
				" || (@.start.time >= 65131862400 && @.start.time <= 65131948799))'",
		});
	});

	test('plain-text equality spans the WHOLE typed year, as PHP does', () => {
		// GOLDEN MOVED 2026-08-09, same reason. `2026` is a period, not an
		// instant: PHP's final_range is the last second of 2026
		// (2027*372d − 1 = 65149401599), so a record dated 2026-06-25 matches.
		// The retired expectation (`== 65117260800`) matched ONLY records stamped
		// 2026-01-01 — the measured 0-of-29 under-return on `oh1`.
		const result = buildDateFragment(['2026'], '=', ordinary);
		expect(result).toMatchObject({
			sentence:
				"oh1.date @? '$.oh62[*] ? ((@.start.time <= 65117260800 && @.end.time >= 65117260800)" +
				" || (@.start.time >= 65117260800 && @.start.time <= 65149401599))'",
		});
	});

	test('existence operators keep the JSONB @? path', () => {
		expect(buildDateFragment(null, '*', ordinary)).toMatchObject({
			sentence: "(oh1.date @? '$.oh62[*]')",
		});
	});
});

/**
 * `timeMachineDatePredicates` has TWO consumers — this file's builder (the
 * matrix_activity `_Q_`-token path) and `resolve/tm_filter.ts` (the dd15 Time
 * Machine `$N` path). A yearless q has NO expression on a timestamptz column,
 * and the shared function decides that ONCE by returning null; both consumers
 * must therefore DROP the clause. This block gates the second consumer, whose
 * `leaf.q` arrives straight from the client SQO: when the guard lived only in
 * builder_date.ts, `{start:{hour:14}}` typed into the dd15 "When" (dd559) field
 * raised an unhandled Error, i.e. a 500 from ordinary user input. PHP got there
 * too — its `_tm` handler built `get_dd_timestamp("Y-m-d")` from an unset year
 * (`'0000-06-00'`) and Postgres rejected the literal — so the drop is the only
 * behaviour that answers the query at all.
 */
describe('yearless date q is DROPPED on every "timestamp"-column consumer', () => {
	function tmLeaf(q: unknown, operator = '=') {
		return { q, q_operator: operator, path: [{ component_tipo: 'dd559' }] };
	}

	test('tm_filter: a clock-only q drops the clause instead of throwing', () => {
		const sink: ParamSink = { params: [] };
		expect(conformTmFilter(tmLeaf([{ start: { hour: 14 } }]), sink)).toBeNull();
		expect(sink.params).toEqual([]);
	});

	test('tm_filter: a month-only q drops the clause instead of throwing', () => {
		const sink: ParamSink = { params: [] };
		expect(conformTmFilter(tmLeaf([{ start: { month: 6 } }]), sink)).toBeNull();
		expect(sink.params).toEqual([]);
	});

	test('tm_filter: a dropped date clause does not zero out its $and siblings', () => {
		// The dropped leaf must vanish from the group, not turn it into `1=0`.
		const sink: ParamSink = { params: [] };
		const where = conformTmFilter(
			{
				$and: [
					tmLeaf([{ start: { month: 6 } }]),
					{ q: '99', path: [{ component_tipo: 'dd1212' }] },
				],
			},
			sink,
		);
		expect(where).toBe('(section_id = $1)');
		expect(sink.params).toEqual([99]);
	});

	test('tm_filter: a YEAR-bearing q on the same column still builds its range', () => {
		const sink: ParamSink = { params: [] };
		expect(conformTmFilter(tmLeaf([{ start: { year: 2026, month: 6 } }]), sink)).toBe(
			'("timestamp" >= $1::date AND "timestamp" < $2::date)',
		);
		expect(sink.params).toEqual(['2026-06-01', '2026-07-01']);
	});

	test('builder_date: the matrix_activity twin drops it too', () => {
		expect(buildDateFragment([{ start: { hour: 14 } }], '=', ctx())).toBe(false);
	});
});
