/**
 * DATALIST BUILD — `getDatalist` (src/core/relations/datalist.ts:340), the
 * option list behind every select / radio / check_box / autocomplete widget.
 *
 * What is gated here (the branch inventory of the function, not just its happy
 * path):
 *  - target-section enumeration, including a target whose tipo resolves an
 *    ontology model but NO matrix table (skipped, never fatal);
 *  - the label projection: EVERY component-model show ddo joined with exactly
 *    ' | ', non-component ddos dropped;
 *  - the DEFAULT ordering — strnatcmp on the label ("Item 1 / Item 2 /
 *    Item 10 / Item 20", not the lexicographic "Item 1 / Item 10 / Item 2").
 *    strnatcmp itself is gated directly by test/unit/strnatcmp.test.ts; what
 *    is gated HERE is the WIRING (that the default comparator is that one);
 *  - the properties.sort_by custom rule: DESC / omitted direction / a
 *    non-numeric path / a path no item carries (the `?? 0` fallback);
 *  - fixed_filter narrowing: the FIRST expanded group becomes the option
 *    search's filter, and a fixed_filter that expands to NO group leaves the
 *    enumeration unnarrowed;
 *  - the dd1067 security-tools enrichment (tool_name / always_active), absent
 *    on every other component;
 *  - the CACHE: key `${componentTipo}_${lang}`, eviction through the
 *    section-data listener, and the agreement between a cold
 *    `probeDatalistSize` and the built list.
 *
 * CACHE DISCIPLINE IS PART OF THE CONTRACT UNDER TEST. The cache key ignores
 * `componentProperties`, which is exactly what every case here varies. So each
 * variant uses its OWN componentTipo *and* clears the cache — without that,
 * "the filtered list equals the unfiltered one" would be asserting that the
 * cache returned the cached thing, which no regression can falsify.
 *
 * SCRATCH SURFACE: test3 (matrix_test) records 929001-929999 ONLY — seeded by
 * this file, swept in afterAll (rows + their TM tail, fail-loud). The canonical
 * playground records (test3/1, /2, /27) are never asserted against; every
 * assertion projects the built list onto the seeded id range, because the suite
 * DB is shared and other section rows come and go.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import {
	clearDatalistCache,
	getDatalist,
	probeDatalistSize,
} from '../../src/core/relations/datalist.ts';
import { fireSaveEvent } from '../../src/core/section_record/save_event.ts';
import { PROFILE_TOOLS_COMPONENT } from '../../src/core/tools/ontology_map.ts';

const SECTION = 'test3'; // matrix_test
const LABEL_DDO = 'test52'; // component_input_text
const SECOND_DDO = 'test17'; // component_text_area — the ' | ' join partner
const MARKER_DDO = 'test162'; // component_input_text — the fixed_filter axis
const NOT_A_COMPONENT_DDO = 'test45'; // model 'section_group' — must be dropped
const LANG = 'lg-eng';

/** The seeded options. `marker` is the axis the fixed_filter narrows on. */
const OPTIONS = [
	{ section_id: 929001, label: 'Item 1', second: 'note one', marker: 'KEEPTHIS' },
	{ section_id: 929002, label: 'Item 2', second: 'note two', marker: 'KEEPTHIS' },
	{ section_id: 929010, label: 'Item 10', second: 'note ten', marker: 'DROPTHIS' },
	{ section_id: 929020, label: 'Item 20', second: 'note twenty', marker: 'DROPTHIS' },
];
const SEEDED_IDS = OPTIONS.map((option) => String(option.section_id));
/** An extra id used only by the cache-eviction case (seeded mid-test). */
const LATE_ID = 929030;

/** A request_config that points a (synthetic) component at the test3 options. */
function properties(options: {
	labelDdos?: string[];
	targets?: string[];
	fixedFilter?: unknown[];
	sortBy?: { path?: string; direction?: string }[];
}): Record<string, unknown> {
	const sqo: Record<string, unknown> = {
		section_tipo: [{ source: 'section', value: options.targets ?? [SECTION] }],
	};
	if (options.fixedFilter !== undefined) sqo.fixed_filter = options.fixedFilter;
	const built: Record<string, unknown> = {
		source: {
			request_config: [
				{
					sqo,
					show: {
						ddo_map: (options.labelDdos ?? [LABEL_DDO]).map((tipo) => ({
							tipo,
							parent: SECTION,
							section_tipo: SECTION,
						})),
					},
				},
			],
		},
	};
	if (options.sortBy !== undefined) built.sort_by = options.sortBy;
	return built;
}

/** fixed_filter descriptor matching the options whose marker contains `q`. */
function markerFilter(q: string): unknown[] {
	return [
		{
			source: 'fixed_dato',
			operator: '$and',
			value: [{ q, path: [{ section_tipo: SECTION, component_tipo: MARKER_DDO }] }],
		},
	];
}

/**
 * Seed (idempotent). Called before EVERY case, not only in beforeAll: the
 * suite DB is shared and any other process's `canonical_test3` preload deletes
 * every test3 row, this file's scratch included. Re-asserting the fixture in
 * the same test body that reads it is the only honest way to depend on it.
 */
async function seedOptions(): Promise<void> {
	for (const option of OPTIONS) {
		await writeOption(option.section_id, option.label, option.second, option.marker);
	}
}

async function writeOption(
	sectionId: number,
	label: string,
	second: string,
	marker: string,
): Promise<void> {
	await sql.unsafe(
		`INSERT INTO matrix_test (section_id, section_tipo, string, data)
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)
		 ON CONFLICT (section_id, section_tipo)
		 DO UPDATE SET string = EXCLUDED.string, data = EXCLUDED.data`,
		[
			sectionId,
			SECTION,
			JSON.stringify({
				[LABEL_DDO]: [{ id: 1, lang: LANG, value: label }],
				[SECOND_DDO]: [{ id: 1, lang: LANG, value: second }],
				// test162 is NON-translatable: the search assembler addresses it
				// with `@.lang == "lg-nolan"`, so a lg-eng entry would be invisible
				// to the fixed_filter (measured — this is not a stylistic choice).
				[MARKER_DDO]: [{ id: 1, lang: 'lg-nolan', value: marker }],
			}),
			JSON.stringify({ section_id: sectionId, section_tipo: SECTION }),
		],
	);
}

/** The built list projected onto the seeded ids, in build order. */
function seededOnly(list: { section_id: string }[]): string[] {
	return list.filter((item) => SEEDED_IDS.includes(item.section_id)).map((i) => i.section_id);
}

beforeAll(async () => {
	// A DB failure must FAIL this file, never skip it: every case below is a
	// DB case, so a silent pass here would be a green gate asserting nothing.
	await sql`SELECT 1`;
	await seedOptions();
});

afterAll(async () => {
	await sql.unsafe(
		'DELETE FROM matrix_test WHERE section_tipo = $1 AND section_id >= 929000 AND section_id <= 929999',
		[SECTION],
	);
	await sql.unsafe(
		'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id >= 929000 AND section_id <= 929999',
		[SECTION],
	);
	const rows = (await sql.unsafe(
		`SELECT
			(SELECT count(*)::int FROM matrix_test
			  WHERE section_tipo = $1 AND section_id BETWEEN 929000 AND 929999) AS records,
			(SELECT count(*)::int FROM matrix_time_machine
			  WHERE section_tipo = $1 AND section_id BETWEEN 929000 AND 929999) AS tm`,
		[SECTION],
	)) as { records: number; tm: number }[];
	if (rows[0]?.records !== 0 || rows[0]?.tm !== 0) {
		throw new Error(
			`datalist_build_native cleanup did not reach zero: ${rows[0]?.records} records / ${rows[0]?.tm} TM rows left in ${SECTION} 929000-929999`,
		);
	}
	clearDatalistCache();
	await fireSaveEvent(SECTION); // drop any list this file cached for other files
});

describe('getDatalist — label projection and ordering', () => {
	test('default order is strnatcmp on the label, not lexicographic', async () => {
		await seedOptions();
		clearDatalistCache();
		const list = await getDatalist('zzdlorder1', properties({}), SECTION, LANG);
		// Natural: 1 < 2 < 10 < 20. Byte order would give 1, 10, 2, 20.
		expect(seededOnly(list)).toEqual(['929001', '929002', '929010', '929020']);
		const labels = list
			.filter((item) => SEEDED_IDS.includes(item.section_id))
			.map((item) => item.label);
		expect(labels).toEqual(['Item 1', 'Item 2', 'Item 10', 'Item 20']);
	});

	test('every component show ddo joins into the label with exactly " | "', async () => {
		await seedOptions();
		clearDatalistCache();
		const list = await getDatalist(
			'zzdljoin1',
			properties({ labelDdos: [LABEL_DDO, SECOND_DDO] }),
			SECTION,
			LANG,
		);
		const seeded = list.filter((item) => SEEDED_IDS.includes(item.section_id));
		expect(seeded.map((item) => item.label)).toEqual([
			'Item 1 | note one',
			'Item 2 | note two',
			'Item 10 | note ten',
			'Item 20 | note twenty',
		]);
		// The separator is the PHP implode(' | ') byte-for-byte — no trimming,
		// no ', ', and the parts stay in ddo_map order.
		for (const item of seeded) expect(item.label.split(' | ').length).toBe(2);
	});

	test('a NON-component show ddo contributes nothing to the label', async () => {
		await seedOptions();
		clearDatalistCache();
		// test45 is a section_group: the model filter (`model.startsWith
		// ('component_')`) drops it, so no label part is produced at all.
		const list = await getDatalist(
			'zzdlmodel1',
			properties({ labelDdos: [NOT_A_COMPONENT_DDO] }),
			SECTION,
			LANG,
		);
		const seeded = list.filter((item) => SEEDED_IDS.includes(item.section_id));
		expect(seeded.length).toBe(OPTIONS.length);
		for (const item of seeded) expect(item.label).toBe('');
		// …and the mixed map keeps only the component half.
		clearDatalistCache();
		const mixed = await getDatalist(
			'zzdlmodel2',
			properties({ labelDdos: [NOT_A_COMPONENT_DDO, LABEL_DDO] }),
			SECTION,
			LANG,
		);
		expect(mixed.filter((item) => item.section_id === '929001').map((item) => item.label)).toEqual([
			'Item 1',
		]);
	});

	test('each option carries its locator, a string section_id and a hide array', async () => {
		await seedOptions();
		clearDatalistCache();
		const list = await getDatalist('zzdlshape1', properties({}), SECTION, LANG);
		const one = list.find((item) => item.section_id === '929001');
		expect(one).toBeDefined();
		expect(one?.value).toEqual({ section_tipo: SECTION, section_id: '929001' });
		expect(typeof one?.section_id).toBe('string'); // PHP passes the raw row value
		expect(one?.hide).toEqual([]); // no hide ddos declared
		expect(one?.tool_name).toBeUndefined(); // not the security-tools component
		expect(one?.always_active).toBeUndefined();
	});

	test('a target tipo with no matrix table is skipped, never fatal', async () => {
		await seedOptions();
		clearDatalistCache();
		// test52 resolves an ontology model (so it survives check_tipo_is_valid)
		// but is a COMPONENT: getMatrixTableFromTipo returns null for it.
		const list = await getDatalist(
			'zzdlnotable1',
			properties({ targets: [LABEL_DDO, SECTION] }),
			SECTION,
			LANG,
		);
		expect(seededOnly(list)).toEqual(['929001', '929002', '929010', '929020']);
		for (const item of list) expect(item.value.section_tipo).toBe(SECTION);
	});
});

describe('getDatalist — fixed_filter narrowing', () => {
	test('the first fixed_filter group narrows the enumeration', async () => {
		await seedOptions();
		clearDatalistCache();
		const filtered = await getDatalist(
			'zzdlfilter1',
			properties({ fixedFilter: markerFilter('KEEPTHIS') }),
			SECTION,
			LANG,
		);
		expect(filtered.map((item) => item.section_id)).toEqual(['929001', '929002']);

		// The CONTRAST, rebuilt from scratch (own tipo + cleared cache): without
		// the filter the very same options list carries the dropped ids too.
		clearDatalistCache();
		const unfiltered = await getDatalist('zzdlfilter2', properties({}), SECTION, LANG);
		expect(seededOnly(unfiltered)).toEqual(['929001', '929002', '929010', '929020']);
	});

	test('a fixed_filter that expands to NO group leaves the list unnarrowed', async () => {
		await seedOptions();
		clearDatalistCache();
		// A fixed_dato item whose last path tipo is not an installed ontology
		// node is skipped (PHP check_active_tld parity) — the descriptor then
		// contributes zero items, so no group is emitted and `filterGroup`
		// stays undefined. This is the REACHABLE form of "the filter is
		// ignored"; see the unreachable-bad-format case below.
		const unnarrowed = await getDatalist(
			'zzdlfilter3',
			properties({
				fixedFilter: [
					{
						source: 'fixed_dato',
						operator: '$and',
						value: [
							{ q: 'KEEPTHIS', path: [{ section_tipo: SECTION, component_tipo: 'zznosuchtipo1' }] },
						],
					},
				],
			}),
			SECTION,
			LANG,
		);
		expect(seededOnly(unnarrowed)).toEqual(['929001', '929002', '929010', '929020']);
	});

	test('a malformed fixed_filter descriptor is rejected by the config build', async () => {
		await seedOptions();
		clearDatalistCache();
		// MEASURED, and a correction to the plan's "bad entry" case: a
		// `fixed_filter: ['nonsense']` never reaches getDatalist's bad-format
		// branch — expandFixedFilter (request_config/filters.ts:217) throws on
		// the unknown source first. Which means the `console.error("ignored
		// fixed filter, bad format")` arm in datalist.ts is UNREACHABLE through
		// the request_config build path: every entry the parser can put in
		// sqo.fixed_filter is a `{operator: items}` object. Pinned as today's
		// behaviour — if the parser ever starts passing raw descriptors
		// through, this expectation must become the console.error assertion.
		await expect(
			getDatalist('zzdlfilter4', properties({ fixedFilter: ['nonsense'] }), SECTION, LANG),
		).rejects.toThrow(/unknown fixed_filter source/);
	});
});

describe('getDatalist — properties.sort_by', () => {
	test('DESC reverses a numeric path, and the omitted direction is ASC', async () => {
		await seedOptions();
		clearDatalistCache();
		const descending = await getDatalist(
			'zzdlsort1',
			properties({
				fixedFilter: markerFilter('KEEPTHIS'),
				sortBy: [{ path: 'section_id', direction: 'DESC' }],
			}),
			SECTION,
			LANG,
		);
		expect(descending.map((item) => item.section_id)).toEqual(['929002', '929001']);

		clearDatalistCache();
		const ascending = await getDatalist(
			'zzdlsort2',
			properties({ fixedFilter: markerFilter('KEEPTHIS'), sortBy: [{ path: 'section_id' }] }),
			SECTION,
			LANG,
		);
		expect(ascending.map((item) => item.section_id)).toEqual(['929001', '929002']);
	});

	test('a non-numeric path falls back to strnatcmp, direction-aware', async () => {
		await seedOptions();
		clearDatalistCache();
		const list = await getDatalist(
			'zzdlsort3',
			properties({ sortBy: [{ path: 'label', direction: 'DESC' }] }),
			SECTION,
			LANG,
		);
		// Natural order reversed: 20, 10, 2, 1 (byte-reversed would be 20,2,10,1).
		expect(seededOnly(list)).toEqual(['929020', '929010', '929002', '929001']);
	});

	test('a path no item carries compares equal (the ?? 0 fallback), order preserved', async () => {
		await seedOptions();
		clearDatalistCache();
		const list = await getDatalist(
			'zzdlsort4',
			properties({ fixedFilter: markerFilter('KEEPTHIS'), sortBy: [{ path: 'nope' }] }),
			SECTION,
			LANG,
		);
		// Both sides resolve `undefined ?? 0` → 0 → numeric diff 0: no throw and
		// the enumeration order (section_id ascending) survives.
		expect(list.map((item) => item.section_id)).toEqual(['929001', '929002']);
	});

	test('only the FIRST sort_by rule is applied', async () => {
		await seedOptions();
		clearDatalistCache();
		const list = await getDatalist(
			'zzdlsort5',
			properties({
				fixedFilter: markerFilter('KEEPTHIS'),
				sortBy: [
					{ path: 'section_id', direction: 'DESC' },
					{ path: 'section_id', direction: 'ASC' },
				],
			}),
			SECTION,
			LANG,
		);
		expect(list.map((item) => item.section_id)).toEqual(['929002', '929001']);
	});
});

describe('getDatalist — the dd1067 security-tools enrichment', () => {
	test('the profile-tools component stamps tool_name / always_active on every option', async () => {
		await seedOptions();
		clearDatalistCache();
		const list = await getDatalist(PROFILE_TOOLS_COMPONENT, properties({}), SECTION, LANG);
		const seeded = list.filter((item) => SEEDED_IDS.includes(item.section_id));
		expect(seeded.length).toBe(OPTIONS.length);
		for (const item of seeded) {
			// These scratch records are not registered tools: PHP's fallback pair.
			expect(item.tool_name).toBe('Unknown');
			expect(item.always_active).toBe(false);
		}
		clearDatalistCache();
		// Same properties, ANY other component tipo: the keys must not appear.
		const plain = await getDatalist('zzdltools1', properties({}), SECTION, LANG);
		for (const item of plain) {
			expect('tool_name' in item).toBe(false);
			expect('always_active' in item).toBe(false);
		}
	});
});

describe('getDatalist — the cache', () => {
	test('the cache key is componentTipo_lang and IGNORES componentProperties', async () => {
		await seedOptions();
		clearDatalistCache();
		const first = await getDatalist('zzdlcache1', properties({}), SECTION, LANG);
		// Same tipo + lang, DIFFERENT properties (a filter that would drop half
		// the options): the cached list comes back untouched, same reference.
		const second = await getDatalist(
			'zzdlcache1',
			properties({ fixedFilter: markerFilter('KEEPTHIS') }),
			SECTION,
			LANG,
		);
		expect(second).toBe(first);
		expect(seededOnly(second)).toEqual(['929001', '929002', '929010', '929020']);
		// Pinned, not endorsed: this is why every case in this file clears the
		// cache. In production the properties for a tipo come from that tipo's
		// ontology node, so the key holds — a caller that passes synthetic
		// properties (or a per-record preset) would be served the wrong list.
		clearDatalistCache();
		const rebuilt = await getDatalist(
			'zzdlcache1',
			properties({ fixedFilter: markerFilter('KEEPTHIS') }),
			SECTION,
			LANG,
		);
		expect(rebuilt).not.toBe(first);
		expect(rebuilt.map((item) => item.section_id)).toEqual(['929001', '929002']);
	});

	test('the lang is part of the key: a second lang builds its own list', async () => {
		await seedOptions();
		clearDatalistCache();
		const english = await getDatalist('zzdlcache2', properties({}), SECTION, LANG);
		const spanish = await getDatalist('zzdlcache2', properties({}), SECTION, 'lg-spa');
		expect(spanish).not.toBe(english);
		expect(seededOnly(spanish)).toEqual(seededOnly(english));
	});

	test('a write to the TARGET section evicts the cached list', async () => {
		await seedOptions();
		await sql.unsafe('DELETE FROM matrix_test WHERE section_tipo = $1 AND section_id = $2', [
			SECTION,
			LATE_ID,
		]);
		clearDatalistCache();
		const before = await getDatalist('zzdlevict1', properties({}), SECTION, LANG);
		expect(before.some((item) => item.section_id === String(LATE_ID))).toBe(false);

		await writeOption(LATE_ID, 'Item 30', 'note thirty', 'DROPTHIS');
		// Still cached — the row alone does not stale it (this half is what
		// proves the next half is not a no-op).
		const stale = await getDatalist('zzdlevict1', properties({}), SECTION, LANG);
		expect(stale).toBe(before);

		await fireSaveEvent(SECTION); // the durable S1-11 eviction channel
		const after = await getDatalist('zzdlevict1', properties({}), SECTION, LANG);
		expect(after).not.toBe(before);
		expect(after.some((item) => item.section_id === String(LATE_ID))).toBe(true);

		await sql.unsafe('DELETE FROM matrix_test WHERE section_tipo = $1 AND section_id = $2', [
			SECTION,
			LATE_ID,
		]);
		await fireSaveEvent(SECTION);
	});
});

describe('probeDatalistSize agrees with the built list', () => {
	test('a COLD probe (SQL path) equals min(list.length, limit)', async () => {
		await seedOptions();
		// Cleared IMMEDIATELY before the probe so it cannot answer from a cached
		// list — this is the case that must take the LIMIT-ed SQL path.
		clearDatalistCache();
		const probedWide = await probeDatalistSize(
			'zzdlprobe1',
			properties({ fixedFilter: markerFilter('KEEPTHIS') }),
			SECTION,
			LANG,
			5,
		);
		clearDatalistCache();
		const probedTight = await probeDatalistSize(
			'zzdlprobe1',
			properties({ fixedFilter: markerFilter('KEEPTHIS') }),
			SECTION,
			LANG,
			1,
		);
		clearDatalistCache();
		const list = await getDatalist(
			'zzdlprobe1',
			properties({ fixedFilter: markerFilter('KEEPTHIS') }),
			SECTION,
			LANG,
		);
		expect(list.length).toBe(2);
		expect(probedWide).toBe(Math.min(list.length, 5));
		expect(probedTight).toBe(Math.min(list.length, 1));
		// The probe must NOT populate the cache (that is its whole reason to
		// exist): the list above rebuilt from SQL, and a fresh probe now takes
		// the cached branch instead.
		expect(
			await probeDatalistSize(
				'zzdlprobe1',
				properties({ fixedFilter: markerFilter('KEEPTHIS') }),
				SECTION,
				LANG,
				5,
			),
		).toBe(2);
	});

	test('the unfiltered probe counts records up to the limit', async () => {
		await seedOptions();
		clearDatalistCache();
		// No fixed_filter → the plain `LIMIT n` row probe. The section holds the
		// four seeded options plus the canonical playground records, so a
		// 3-limit probe saturates.
		expect(await probeDatalistSize('zzdlprobe2', properties({}), SECTION, LANG, 3)).toBe(3);
		clearDatalistCache();
		expect(await probeDatalistSize('zzdlprobe2', properties({}), SECTION, LANG, 0)).toBe(0);
		clearDatalistCache();
		expect(await probeDatalistSize('zzdlprobe2', properties({}), SECTION, LANG, -1)).toBe(0);
	});

	test('a cached list answers the probe without touching the DB', async () => {
		await seedOptions();
		clearDatalistCache();
		const list = await getDatalist(
			'zzdlprobe3',
			properties({ fixedFilter: markerFilter('KEEPTHIS') }),
			SECTION,
			LANG,
		);
		expect(list.length).toBe(2);
		// Same tipo + lang: the cached branch, so the (ignored) properties can
		// even be a filter-less config and the answer is still the cached 2.
		expect(await probeDatalistSize('zzdlprobe3', properties({}), SECTION, LANG, 10)).toBe(2);
		expect(await probeDatalistSize('zzdlprobe3', properties({}), SECTION, LANG, 1)).toBe(1);
	});
});
