/**
 * THE ONE FLAT-DATE FORMATTER — behaviour gate (2026-08 oh1 beta audit §5.6).
 *
 * The audit found a SECOND date formatter in the relation-list / export cell
 * resolver: `d-m-Y` joined with '-', no `date_mode` dispatch, and the MONTH
 * silently dropped whenever the day was absent. A partial date (year, or
 * year+month) is the NORM in heritage cataloguing, so live `rsc170`/`rsc26`
 * "Dating" records reachable from the oh1 image portals were losing their
 * month in every "Referencias" cell and every `tool_export` cell.
 *
 * WHAT IS PINNED HERE:
 *
 *  1. `dateItemToValue` (src/core/components/component_date/date_value.ts) —
 *     the ONE implementation — against the FROZEN PHP ORACLE. The expectations
 *     are NOT hand-written: fixtures/date_value_native/date_value.oracle.json
 *     was produced by eval'ing the frozen
 *     `component_date::data_item_to_value()` method's own source text over the
 *     real `dd_date` class under PHP 8.5. Never regenerate it from TS output —
 *     recapture it from the frozen method with the harvester that sits next to
 *     it (`php test/unit/fixtures/date_value_native/harvest.php > …/date_value.oracle.json`).
 *
 *  2. The DAY-LESS date (year+month, the case the duplicate got wrong) coming
 *     out identically on the surfaces the duplicate served: the relation-list
 *     panel and the export cell BOTH enter `resolveCellValue`, and both must
 *     equal what the indexation grid's atoms resolver produces for the same
 *     stored item — i.e. `dateItemToValue` itself.
 *
 *  3. That the full `date_mode` dispatch is reachable through
 *     `resolveCellValue` (a 'range' node renders the range, a 'date' node the
 *     calendar date) — the duplicate had no dispatch at all.
 *
 * The THIRD surface (the thesaurus indexation grid) is held to the same value
 * structurally rather than by rebuilding a whole grid here: the single-source
 * tripwire (date_flat_value_single_source_tripwire.test.ts) proves the grid has
 * no formatter of its own and imports this module, so "identical" is a property
 * of the code, not of three sampled assertions.
 *
 * Scratch surfaces (this file's namespace): test3 / 925040-925045 in
 * matrix_test, created and deleted here. `test145` is the test3 component_date.
 */
// Generic-TLD migration 2026-08-20 (AGENTS.md hard rule). The `rsc`/`oh` tipos this
// gate names are SEED-SHIPPED ontology — they exist on every installation, so they are
// generic already and stay. They are spelled through `seed()` so the census can tell an
// install BINDING from a seed reference, and so the intent is explicit at each site.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	dateItemToValue,
	dateModeOf,
	resolvePeriodLabels,
} from '../../src/core/components/component_date/date_value.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getNode } from '../../src/core/ontology/resolver.ts';
import { resolveCellValue } from '../../src/core/resolve/relation_list.ts';
import oracle from './fixtures/date_value_native/date_value.oracle.json';

/** Seed-shipped tipo, spelled so the census sees a reference, not a binding. */
const seed = <T extends string, N extends number>(tld: T, id: N): `${T}${N}` => `${tld}${id}`;

interface OracleCase {
	id: string;
	mode: string;
	item: Record<string, unknown>;
	php: string;
}

const CASES = oracle.cases as OracleCase[];
const caseById = (id: string): OracleCase => {
	const found = CASES.find((entry) => entry.id === id);
	if (found === undefined) throw new Error(`date oracle corpus has no case '${id}'`);
	return found;
};

// ---------------------------------------------------------------------------
// 1. The one implementation vs the frozen PHP method
// ---------------------------------------------------------------------------

describe('dateItemToValue is the frozen PHP component_date::data_item_to_value', () => {
	test('the corpus is the PHP capture and still covers every date_mode', () => {
		expect(oracle._source).toContain('class.component_date.php');
		// A corpus that lost its cases would make this whole file green while
		// asserting nothing (the silent-narrowing trap).
		expect(CASES.length).toBeGreaterThanOrEqual(25);
		for (const mode of ['date', 'range', 'time', 'time_range', 'date_time', 'period']) {
			expect(
				CASES.filter((entry) => entry.mode === mode).length,
				`corpus lost its '${mode}' cases`,
			).toBeGreaterThan(0);
		}
	});

	test('every captured case matches, byte for byte', async () => {
		// PHP's label::get_label() was stubbed to return the key, which is what
		// the master (English) catalog serves for these three.
		const periodLabels = { years: 'years', months: 'months', days: 'days' };
		const mismatches: string[] = [];
		for (const entry of CASES) {
			const actual = dateItemToValue(entry.item, entry.mode, { periodLabels });
			if (actual !== entry.php) {
				mismatches.push(
					`${entry.id}: expected ${JSON.stringify(entry.php)}, got ${JSON.stringify(actual)}`,
				);
			}
		}
		expect(mismatches).toEqual([]);
		// The label plumbing itself must resolve (the 'period' mode refuses to
		// guess), and the master strings are the ones the capture used.
		const resolved = await resolvePeriodLabels();
		expect(Object.keys(resolved).sort()).toEqual(['days', 'months', 'years']);
	});

	test('the DAY-LESS date keeps its month — the exact loss the duplicate caused', () => {
		// The duplicate returned String(year) whenever day OR month was absent.
		expect(dateItemToValue(caseById('date_year_month').item, 'date')).toBe('1975/03');
		expect(dateItemToValue(caseById('date_year_month').item, 'date')).not.toBe('1975');
		expect(dateItemToValue(caseById('range_year_month').item, 'range')).toBe('1987/04 <> 1988/11');
		// ...and it used '-' as both the field separator and the field order.
		expect(dateItemToValue(caseById('date_full').item, 'date')).toBe('1628/06/09');
	});

	test("date_mode 'period' refuses to guess its unit labels", () => {
		expect(() => dateItemToValue(caseById('period_full').item, 'period')).toThrow(/periodLabels/);
	});

	test('an unknown date_mode still renders (PHP default:), it is not whitelisted away', () => {
		// Over-strict whitelisting is itself a silent narrowing: PHP's switch
		// has a `default:` and so must this.
		expect(dateItemToValue(caseById('date_year_month').item, 'not_a_mode')).toBe('1975/03');
		expect(dateModeOf({ date_mode: 'range' })).toBe('range');
		expect(dateModeOf({})).toBe('date');
		expect(dateModeOf(null)).toBe('date');
	});
});

// ---------------------------------------------------------------------------
// 2. + 3. The relation-list / export cell resolver routes through it
// ---------------------------------------------------------------------------

const SECTION = 'test3';
/** The test3 component_date. */
const DATE_TIPO = 'test145';
const IDS = {
	/** year + month, NO day — the case the duplicate silently truncated. */
	dayLess: 925040,
	/** year only. */
	yearOnly: 925041,
	/** a full start + end range. */
	range: 925042,
	/** two items — the multi-item join. */
	twoItems: 925043,
};
const SCRATCH_IDS = Object.values(IDS);

/** The stored items, keyed by the scratch id that holds them. */
const SEED = {
	[IDS.dayLess]: [{ id: 1, lang: 'lg-nolan', start: { year: 1975, month: 3 } }],
	[IDS.yearOnly]: [{ id: 1, lang: 'lg-nolan', start: { year: 1975 } }],
	[IDS.range]: [
		{
			id: 1,
			lang: 'lg-nolan',
			start: { year: 1628, month: 6, day: 9 },
			end: { year: 2024, month: 6, day: 25 },
		},
	],
	[IDS.twoItems]: [
		{ id: 1, lang: 'lg-nolan', start: { year: 1987, month: 4 } },
		{ id: 2, lang: 'lg-nolan', start: { year: 1988 } },
	],
} satisfies Record<number, Record<string, unknown>[]>;

/** The items seeded at a scratch id (throws rather than asserting on undefined). */
function seeded(id: number): Record<string, unknown>[] {
	const items = (SEED as Record<number, Record<string, unknown>[]>)[id];
	if (items === undefined) throw new Error(`no seed for scratch id ${id}`);
	return items;
}

/** The FIRST seeded item at a scratch id. */
function seededItem(id: number): Record<string, unknown> {
	const item = seeded(id)[0];
	if (item === undefined) throw new Error(`seed for scratch id ${id} is empty`);
	return item;
}

async function sweep(): Promise<void> {
	for (const id of SCRATCH_IDS) {
		await sql.unsafe('DELETE FROM matrix_test WHERE section_tipo = $1 AND section_id = $2', [
			SECTION,
			id,
		]);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[SECTION, id],
		);
	}
}

beforeAll(async () => {
	await sweep(); // pre-clean a crashed prior run

	// PRECONDITION: never write over a coordinate this gate did not create.
	const occupied: number[] = [];
	for (const id of SCRATCH_IDS) {
		const rows = (await sql.unsafe(
			'SELECT section_id FROM matrix_test WHERE section_tipo = $1 AND section_id = $2',
			[SECTION, id],
		)) as unknown[];
		if (rows.length > 0) occupied.push(id);
	}
	if (occupied.length > 0) {
		throw new Error(
			`date flat-value gate: scratch ids ${occupied.join(',')} are not free after the sweep — refusing to write over records this gate did not create.`,
		);
	}

	for (const id of SCRATCH_IDS) {
		const items = seeded(id);
		await sql.unsafe(
			`INSERT INTO matrix_test (section_id, section_tipo, date)
			 VALUES ($1, $2, jsonb_build_object($3::text, $4::text::jsonb))`,
			[id, SECTION, DATE_TIPO, JSON.stringify(items)],
		);
	}
});

afterAll(async () => {
	await sweep();
	for (const id of SCRATCH_IDS) {
		const rows = (await sql.unsafe(
			'SELECT section_id FROM matrix_test WHERE section_tipo = $1 AND section_id = $2',
			[SECTION, id],
		)) as unknown[];
		expect(rows.length, `scratch record ${SECTION}/${id} survived cleanup`).toBe(0);
	}
});

describe('the relation-list and export cells render the ONE formatter', () => {
	/** The date_mode the test3 date component actually declares. */
	const declaredMode = async (): Promise<string> =>
		dateModeOf((await getNode(DATE_TIPO))?.properties);

	test('a DAY-LESS date keeps its month in the cell (the reported production loss)', async () => {
		const unresolved: string[] = [];
		const cell = await resolveCellValue(SECTION, IDS.dayLess, DATE_TIPO, 'lg-nolan', unresolved);
		// The canonical formatter, on the very item that was stored.
		const canonical = dateItemToValue(seededItem(IDS.dayLess), await declaredMode());
		expect(cell).toBe(canonical);
		expect(cell).toBe('1975/03');
		// The two shapes the deleted duplicate produced.
		expect(cell).not.toBe('1975');
		expect(cell).not.toContain('-');
		expect(unresolved).toEqual([]);
	});

	test('year-only, full and range cells all equal the canonical formatter', async () => {
		const unresolved: string[] = [];
		const mode = await declaredMode();
		for (const id of [IDS.yearOnly, IDS.range]) {
			const cell = await resolveCellValue(SECTION, id, DATE_TIPO, 'lg-nolan', unresolved);
			expect(cell, `scratch ${id}`).toBe(dateItemToValue(seededItem(id), mode));
		}
		expect(await resolveCellValue(SECTION, IDS.yearOnly, DATE_TIPO, 'lg-nolan', unresolved)).toBe(
			'1975',
		);
		expect(unresolved).toEqual([]);
	});

	test('multiple items join with the caller separator, each formatted canonically', async () => {
		const unresolved: string[] = [];
		const mode = await declaredMode();
		const cell = await resolveCellValue(SECTION, IDS.twoItems, DATE_TIPO, 'lg-nolan', unresolved);
		expect(cell).toBe(
			seeded(IDS.twoItems)
				.map((item) => dateItemToValue(item, mode))
				.join(' | '),
		);
		expect(cell).toBe('1987/04 | 1988');
		expect(unresolved).toEqual([]);
	});

	test("the cell resolver DISPATCHES on the node's date_mode", async () => {
		// The duplicate ignored date_mode entirely. Reading the same stored
		// range item under both modes must differ: 'date' keeps only the start.
		const item = seededItem(IDS.range);
		expect(dateItemToValue(item, 'range')).toBe('1628/06/09 <> 2024/06/25');
		expect(dateItemToValue(item, 'date')).toBe('1628/06/09');
		// And the resolver reads the mode from the ontology, not from a constant.
		const unresolved: string[] = [];
		const cell = await resolveCellValue(SECTION, IDS.range, DATE_TIPO, 'lg-nolan', unresolved);
		expect(cell).toBe(dateItemToValue(item, await declaredMode()));
	});
});
