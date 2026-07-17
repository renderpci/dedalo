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
 * Ordinary-table JSONB behavior (the v0 `start.time <op> t` predicate) is kept
 * as a control so the fix does not silently change non-TM sections.
 */

import { describe, expect, test } from 'bun:test';
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

describe('builder_date — ordinary sections (JSONB start.time, unchanged)', () => {
	const ordinary = ctx({ alias: 'oh1', table: 'matrix', tipo: 'oh62' });

	test('object q now resolves to the JSONB equality predicate (no longer dropped)', () => {
		// convert_date_to_seconds(2026, 6, 15) — the derived virtual-calendar second.
		const result = buildDateFragment([{ start: { year: 2026, month: 6, day: 15 } }], '=', ordinary);
		expect(result).toMatchObject({
			sentence: "oh1.date @? '$.oh62[*] ? (@.start.time == 65131862400)'",
		});
	});

	test('plain-text equality keeps the JSONB path shape', () => {
		const result = buildDateFragment(['2026'], '=', ordinary);
		expect(result).toMatchObject({
			sentence: "oh1.date @? '$.oh62[*] ? (@.start.time == 65117260800)'",
		});
	});

	test('existence operators keep the JSONB @? path', () => {
		expect(buildDateFragment(null, '*', ordinary)).toMatchObject({
			sentence: "(oh1.date @? '$.oh62[*]')",
		});
	});
});
