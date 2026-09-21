/**
 * A section read honours the rqo `source.properties` OVERRIDE
 * (src/core/section/read.ts — the section's own structure-context entry and
 * `deriveSectionDdoMap`).
 *
 * WHY IT EXISTS. PHP applies the client-sent properties to the element it is
 * reading before building any context (`dd_core_api` read :2305-2308,
 * `$element->set_properties`) — and its `$model==='section'` branch is included.
 * TS applied it on the component and get_data paths only, so a TOOL that opens a
 * section with its OWN declared layout was served the section's plain
 * `section_list` instead: different columns, and — the part that actually broke —
 * without the caller's per-column FLAGS. `tool_cataloging`'s mosaic view
 * (`tools/tool_cataloging/js/view_tool_cataloging_mosaic.js`) filters its
 * columns on `in_mosaic===true`, so every column was filtered out and each
 * record rendered as a bare drag handle over an empty row.
 *
 * WHAT IS PINNED (outcomes, never spellings):
 *   1. the override's ddo_map REPLACES the ontology default in the emitted
 *      context — and the default is asserted first, so the replacement cannot
 *      be confused with "the ontology happened to say that";
 *   2. caller-declared per-column keys survive to the wire (`in_mosaic` here) —
 *      losing them is the exact shape of the bug;
 *   3. the DATA half agrees with the context half: the rows carry the
 *      override's column and NOT the columns it replaced. The client binds each
 *      rendered cell to its context by an exact tipo match and silently drops
 *      the rest, so the two halves disagreeing is invisible until a user
 *      notices an empty list;
 *   4. the override also feeds the PAGE SIZE (PHP resolves
 *      calculate_default_limit from the replaced properties too) — and, because
 *      it is client input applied AFTER sanitizeClientSqo, a declared limit is
 *      clamped at CLIENT_MAX_LIMIT instead of being the one number on the read
 *      that never met the sanitizer;
 *   5. a read WITHOUT an override is unchanged.
 *
 * FIXTURE: the generic `test` TLD playground section `test3` and its own
 * component `test52` — no install's records, no install's TLD.
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { deriveSectionListSqoDefaults, readSection } from '../../src/core/section/read.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';

const SECTION = 'test3';
const OVERRIDE_COLUMN = 'test52';
/** A column the ontology default carries and the override does NOT. */
const REPLACED_COLUMN = 'test17';

type Ddo = { tipo?: string; in_mosaic?: unknown };

function baseRqo(properties?: unknown): never {
	return {
		action: 'read',
		source: {
			action: null,
			model: 'section',
			tipo: SECTION,
			section_tipo: SECTION,
			mode: 'list',
			...(properties === undefined ? {} : { properties }),
		},
		sqo: { section_tipo: [SECTION], limit: 2, offset: 0 },
	} as never;
}

/** A tool's declared layout: ONE column, carrying a flag only the client reads. */
const TOOL_PAGE_SIZE = 3;

const TOOL_PROPERTIES = {
	view: 'a_tool_view',
	source: {
		request_config: [
			{
				sqo: { section_tipo: [{ value: [SECTION], source: 'section' }], limit: TOOL_PAGE_SIZE },
				show: {
					ddo_map: [
						{
							tipo: OVERRIDE_COLUMN,
							parent: 'self',
							section_tipo: 'self',
							mode: 'list',
							view: 'text',
							in_mosaic: true,
						},
					],
				},
			},
		],
	},
};

const columnsOf = (context: unknown[]): Ddo[] =>
	((context[0] as { request_config?: { show?: { ddo_map?: Ddo[] } }[] } | undefined)
		?.request_config?.[0]?.show?.ddo_map ?? []) as Ddo[];

const emittedTipos = (data: unknown[]): Set<string> =>
	new Set(
		data
			.filter((item) => (item as { typo?: string }).typo !== 'sections')
			.map((item) => String((item as { tipo?: unknown }).tipo)),
	);

test('WITHOUT an override the section serves its ontology default columns', async () => {
	const { context, data } = await readSection(baseRqo());
	const tipos = columnsOf(context).map((ddo) => ddo.tipo);

	// The default is MORE than the one column the override names below — which is
	// what makes the replacement assertion meaningful.
	expect(tipos.length).toBeGreaterThan(1);
	expect(tipos).toContain(OVERRIDE_COLUMN);
	// ANCHORED: the last test's anti-assertion is "test17 is gone under the
	// override". If an ontology edit dropped test17 from test3's section_list,
	// that assertion would pass vacuously — so pin its presence here.
	expect(tipos).toContain(REPLACED_COLUMN);
	expect(emittedTipos(data).size).toBeGreaterThan(1);
});

test('WITH an override the caller’s ddo_map replaces the ontology default', async () => {
	const { context } = await readSection(baseRqo(TOOL_PROPERTIES));

	expect(columnsOf(context).map((ddo) => ddo.tipo)).toEqual([OVERRIDE_COLUMN]);
});

test('the caller’s per-column flags survive to the wire', async () => {
	const { context } = await readSection(baseRqo(TOOL_PROPERTIES));
	const column = columnsOf(context).find((ddo) => ddo.tipo === OVERRIDE_COLUMN);

	// The client filters its mosaic columns on exactly this key; dropping it is
	// indistinguishable from "no columns at all" in the browser.
	expect(column?.in_mosaic).toBe(true);
});

test('the DATA half follows the same override as the context half', async () => {
	const { data } = await readSection(baseRqo(TOOL_PROPERTIES));
	const tipos = emittedTipos(data);

	expect(tipos.has(OVERRIDE_COLUMN)).toBe(true);
	// A column the ONTOLOGY default carries but the override does not must be
	// gone from the rows too — else the client renders cells with no context.
	expect(tipos.has(REPLACED_COLUMN)).toBe(false);
});

test('the override also supplies the default page size', async () => {
	const { data } = await readSection({
		action: 'read',
		source: {
			action: null,
			model: 'section',
			tipo: SECTION,
			section_tipo: SECTION,
			mode: 'list',
			properties: TOOL_PROPERTIES,
		},
		// No client limit: the server must page by the DECLARED size.
		sqo: { section_tipo: [SECTION], offset: 0 },
	} as never);
	const envelope = data.find((item) => (item as { typo?: string }).typo === 'sections') as
		| { entries?: unknown[] }
		| undefined;

	expect(envelope?.entries?.length).toBe(TOOL_PAGE_SIZE);
});

test('a page size declared by the CLIENT is clamped like any client limit', async () => {
	const { CLIENT_MAX_LIMIT } = await import('../../src/core/concepts/sqo.ts');
	const greedy = structuredClone(TOOL_PROPERTIES) as typeof TOOL_PROPERTIES & {
		source: { request_config: { sqo: { limit: number } }[] };
	};
	const greedyConfig = greedy.source.request_config[0];
	if (greedyConfig === undefined) throw new Error('fixture lost its request_config');
	greedyConfig.sqo.limit = CLIENT_MAX_LIMIT * 10;

	// These defaults are applied AFTER sanitizeClientSqo — the clamp has to
	// happen here or it happens nowhere.
	expect((await deriveSectionListSqoDefaults(SECTION, SECTION, 'list', greedy)).limit).toBe(
		CLIENT_MAX_LIMIT,
	);
});

// ---------------------------------------------------------------------------
// The OTHER side of the clamp, which needs an ontology of its own: the clamp
// must apply ONLY to the client's override. An install may legitimately
// configure a list page larger than the client ceiling, and clamping THAT would
// silently shorten its lists — a mutation that clamps unconditionally is
// invisible to any fixture whose configured limit is already below the ceiling.
// ---------------------------------------------------------------------------

const BIG_SECTION = 'zzlim1';
const BIG_LIST = 'zzlim2';
const BIG_LIMIT = 5000; // deliberately above CLIENT_MAX_LIMIT (1000 by default)

const BIG = situation({
	name: 'section list page size above the client ceiling',
	tld: 'zzlim',
	nodes: [
		{ tipo: BIG_SECTION, parent: 'test1', model: 'section', relations: [{ tipo: 'test24' }] },
		{
			tipo: BIG_LIST,
			parent: BIG_SECTION,
			model: 'section_list',
			properties: {
				source: {
					request_config: [
						{
							sqo: {
								section_tipo: [{ value: [BIG_SECTION], source: 'section' }],
								limit: BIG_LIMIT,
							},
							show: { ddo_map: [] },
						},
					],
				},
			},
		},
	],
});

beforeAll(async () => {
	await ensureSituation(BIG);
}, 60000);

afterAll(async () => {
	expect(await dropSituation(BIG)).toBe(0);
}, 60000);

test("the ONTOLOGY's own configured page size is never clamped", async () => {
	const { CLIENT_MAX_LIMIT } = await import('../../src/core/concepts/sqo.ts');
	expect(BIG_LIMIT).toBeGreaterThan(CLIENT_MAX_LIMIT);

	// No override → not client input → the install's configured size stands.
	expect((await deriveSectionListSqoDefaults(BIG_SECTION, BIG_SECTION, 'list')).limit).toBe(
		BIG_LIMIT,
	);
});
