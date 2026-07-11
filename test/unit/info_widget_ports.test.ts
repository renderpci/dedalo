/**
 * get_archive_states + sum_dates widget ports — TS-shape gates against the
 * PHP class contracts (core/widgets/dmm/get_archive_states,
 * core/widgets/mdcat/sum_dates).
 *
 * NO instance in this install's ontology declares either widget, so the PHP
 * oracle path (get_widget_data / section read) is unreachable for them — a
 * differential would be vacuous. These gates drive the descriptors DIRECTLY
 * with synthetic IPO configs over scratch matrix records (the framework
 * makes widgets testable without ontology instances) and pin the shapes the
 * PHP classes produce: the 14 keyed states outputs with first-item labels,
 * the DateInterval-shaped sums, the estimate/bridge flags, and the parsed
 * humanizer. Reconcile against a live oracle when an instance exists
 * (rewrite/LEDGER.md component_info widgets row).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { get_archive_states } from '../../src/core/components/component_info/widgets/dmm/get_archive_states.ts';
import { sum_dates } from '../../src/core/components/component_info/widgets/mdcat/sum_dates.ts';
import type { WidgetContext } from '../../src/core/components/component_info/widgets/widget_common.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';

const created: { table: string; sectionTipo: string; sectionId: number }[] = [];

function track(sectionTipo: string, sectionId: number, table = 'matrix'): number {
	created.push({ table, sectionTipo, sectionId });
	return sectionId;
}

async function setColumn(
	sectionTipo: string,
	sectionId: number,
	column: string,
	componentTipo: string,
	items: unknown[],
): Promise<void> {
	await sql.unsafe(
		`UPDATE matrix SET ${column} = COALESCE(${column}, '{}'::jsonb) || jsonb_build_object($1::text, $2::text::jsonb)
		 WHERE section_tipo = $3 AND section_id = $4`,
		[componentTipo, JSON.stringify(items), sectionTipo, sectionId],
	);
}

const locatorOf = (sectionTipo: string, sectionId: number, from: string, id = 1) => ({
	id,
	type: 'dd151',
	section_id: String(sectionId),
	section_tipo: sectionTipo,
	from_component_tipo: from,
});

const fixtures = { host: 0, coinA: 0, coinB: 0, coinC: 0 };

function contextFor(sectionId: number): WidgetContext {
	return { sectionTipo: 'numisdata3', sectionId, mode: 'list', lang: 'lg-spa' };
}

beforeAll(async () => {
	// host archive with a 3-coin portal; coins carry radio_button states
	// (numisdata57 'used' = answer / numisdata157 'duplicated' = closed) and
	// date pairs (numisdata491 date_in / numisdata1371 date_out).
	fixtures.host = track('numisdata3', await createSectionRecord('numisdata3', -1));
	fixtures.coinA = track('numisdata4', await createSectionRecord('numisdata4', -1));
	fixtures.coinB = track('numisdata4', await createSectionRecord('numisdata4', -1));
	fixtures.coinC = track('numisdata4', await createSectionRecord('numisdata4', -1));
	await setColumn(
		'numisdata3',
		fixtures.host,
		'relation',
		'numisdata77',
		[fixtures.coinA, fixtures.coinB, fixtures.coinC].map((coin, index) =>
			locatorOf('numisdata4', coin, 'numisdata77', index + 1),
		),
	);
	// coinA: answer affirmative, closed affirmative; dates 2020-01-01..2020-03-16
	await setColumn('numisdata4', fixtures.coinA, 'relation', 'numisdata57', [
		locatorOf('numisdata341', 1, 'numisdata57'),
	]);
	await setColumn('numisdata4', fixtures.coinA, 'relation', 'numisdata157', [
		locatorOf('numisdata341', 1, 'numisdata157'),
	]);
	await setColumn('numisdata4', fixtures.coinA, 'date', 'numisdata491', [
		{ id: 1, start: { year: 2020, month: 1, day: 1 } },
	]);
	await setColumn('numisdata4', fixtures.coinA, 'date', 'numisdata1371', [
		{ id: 1, start: { year: 2020, month: 3, day: 16 } },
	]);
	// coinB: answer negative; date_in only (2021-05-10) and NOTHING later →
	// +1 day estimate path
	await setColumn('numisdata4', fixtures.coinB, 'relation', 'numisdata57', [
		locatorOf('numisdata341', 2, 'numisdata57'),
	]);
	await setColumn('numisdata4', fixtures.coinB, 'date', 'numisdata491', [
		{ id: 1, start: { year: 2021, month: 5, day: 10 } },
	]);
	// coinC: no states, no dates (excluded from counts; empty date pair)
});

afterAll(async () => {
	const leaked: string[] = [];
	for (const row of created) {
		const deleted = (await sql.unsafe(
			`DELETE FROM ${row.table} WHERE section_tipo = $1 AND section_id = $2 RETURNING id`,
			[row.sectionTipo, row.sectionId],
		)) as unknown[];
		if (deleted.length === 0) leaked.push(`${row.sectionTipo}/${row.sectionId}`);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[row.sectionTipo, row.sectionId],
		);
	}
	if (leaked.length > 0) {
		throw new Error(`Scratch cleanup failed: ${leaked.join(', ')}`);
	}
});

const STATES_IPO = [
	{
		input: [
			{ type: 'source', section_tipo: 'self', component_tipo: 'numisdata77' },
			{ type: 'answer', section_tipo: 'current', component_tipo: 'numisdata57' },
			{ type: 'closed', section_tipo: 'current', component_tipo: 'numisdata157' },
		],
		output: [
			'closed_afirmative',
			'closed_afirmative_percent',
			'closed_negative',
			'closed_negative_percent',
			'closed_count',
			'closed_count_percent',
			'closed_total',
			'answer_afirmative',
			'answer_afirmative_percent',
			'answer_negative',
			'answer_negative_percent',
			'answer_count',
			'answer_count_percent',
			'answer_total',
		].map((id) => ({ id })),
	},
];

const SUM_DATES_IPO = [
	{
		input: [
			{ type: 'source', section_tipo: 'self', component_tipo: 'numisdata77' },
			{ type: 'date_in', section_tipo: 'current', component_tipo: 'numisdata491' },
			{ type: 'date_out', section_tipo: 'current', component_tipo: 'numisdata1371' },
		],
		output: [
			{ id: 'sum_intervals' },
			{ id: 'sum_estitmated_time_add' },
			{ id: 'estitmated_time_undefined' },
		],
	},
];

describe('get_archive_states port (PHP class contract shapes)', () => {
	test('get_archive_states: 14 keyed outputs, first item carries labels', async () => {
		if (!('computeData' in get_archive_states)) throw new Error('descriptor is a stub');
		const items = await get_archive_states.computeData(STATES_IPO, contextFor(fixtures.host));
		expect(items.length).toBe(14);
		const byId = new Map(items.map((item) => [item.widget_id, item]));
		// answer: coinA affirmative + coinB negative over 3 linked records
		expect(byId.get('answer_afirmative')?.value).toBe(1);
		expect(byId.get('answer_afirmative_percent')?.value).toBe(33.3);
		expect(byId.get('answer_negative')?.value).toBe(1);
		expect(byId.get('answer_negative_percent')?.value).toBe(33.3);
		expect(byId.get('answer_count')?.value).toBe(2);
		expect(byId.get('answer_count_percent')?.value).toBe(66.7);
		expect(byId.get('answer_total')?.value).toBe(3);
		// closed: only coinA has a datum (affirmative)
		expect(byId.get('closed_afirmative')?.value).toBe(1);
		expect(byId.get('closed_afirmative_percent')?.value).toBe(33.3);
		expect(byId.get('closed_negative')?.value).toBeNull();
		expect(byId.get('closed_negative_percent')?.value).toBeNull();
		expect(byId.get('closed_count')?.value).toBe(1);
		expect(byId.get('closed_total')?.value).toBe(3);
		// first output item carries the dimension labels (PHP contract)
		const first = items[0] as Record<string, unknown>;
		expect(first.widget_id).toBe('closed_afirmative');
		expect(typeof first.closed_label).toBe('string');
		expect(typeof first.answer_label).toBe('string');
		// every item is tagged for the client partition
		for (const item of items) expect(item.widget).toBe('get_archive_states');
	});

	test('get_archive_states: empty portal → [] for the whole widget', async () => {
		if (!('computeData' in get_archive_states)) throw new Error('descriptor is a stub');
		const empty = await get_archive_states.computeData(STATES_IPO, contextFor(fixtures.coinC));
		expect(empty).toEqual([]);
	});
});

describe('sum_dates port (PHP class contract shapes)', () => {
	test('sum_dates: exact pair + estimated +1 day pair sum into DateInterval shapes', async () => {
		if (!('computeData' in sum_dates)) throw new Error('descriptor is a stub');
		const items = await sum_dates.computeData(SUM_DATES_IPO, contextFor(fixtures.host));
		expect(items.length).toBe(3);
		const byId = new Map(items.map((item) => [item.widget_id, item]));
		// coinA 2020-01-01→2020-03-16 = 2m 15d; coinB estimated +1 day; coinC empty
		expect(byId.get('sum_intervals')?.value).toMatchObject({
			y: 0,
			m: 2,
			d: 16, // 2m15d + 1d estimate
			h: 0,
			i: 0,
			s: 0,
			invert: 0,
		});
		expect(byId.get('sum_estitmated_time_add')?.value).toMatchObject({ y: 0, m: 0, d: 1 });
		// coinB's missing date_out is the LAST real date → estimate, not bridge
		expect(byId.get('estitmated_time_undefined')?.value).toBe(false);
	});

	test('sum_dates: computeDataParsed humanizes the intervals (grid/export face)', async () => {
		if (!('computeData' in sum_dates) || sum_dates.computeDataParsed === undefined) {
			throw new Error('descriptor lacks computeDataParsed');
		}
		const parsed = await sum_dates.computeDataParsed(SUM_DATES_IPO, contextFor(fixtures.host));
		const byId = new Map(parsed.map((item) => [item.widget_id, item]));
		// "2 <months> 16 <days>" with localized labels
		expect(String(byId.get('sum_intervals')?.value)).toMatch(/^2 \S+ 16 \S+$/);
		expect(String(byId.get('sum_estitmated_time_add')?.value)).toMatch(/^1 \S+$/);
		expect(byId.get('estitmated_time_undefined')?.value).toBe(false);
	});
});
