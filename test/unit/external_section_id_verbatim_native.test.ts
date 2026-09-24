/**
 * EXTERNAL SECTION IDS STAY VERBATIM, AND AN EXTERNAL COLUMN NEVER FIRES FOR A
 * FOREIGN TARGET — the two defects measured 2026-09-24 on the rsc368 portal
 * (engineering/EXTERNAL_SPEC.md §3 addendum 2026-09-24,
 * engineering/wire_contract/WC-2026-09-24-external-foreign-target-and-verbatim-id.md).
 *
 * BUG A — `Number(targetId)`. Zenon locators are stored as zero-padded 9-char
 * STRINGS ('000065686'). The flat-value resolvers (relation_list.ts, the export
 * atoms, the export walk's relation hop) Number()-ed them before the external
 * derivation, so the service was asked for id=65686 — a 400 ("Error loading
 * record"), or a DIFFERENT record.
 *
 * BUG B — a foreign target. rsc368 mixes zenon1 targets with LOCAL rsc205
 * publications. The flat resolvers apply EVERY child ddo of the portal to EVERY
 * target, and rsc205 carries legacy `api_config` residue, so the zenon column
 * fired for the LOCAL record and sent its local id to the service. Padding that
 * id would fetch an unrelated remote record, so the fix is not a better id: an
 * external component resolves only for records of its OWN section (ontology
 * ownership), and anywhere else the column simply does not apply — no call, no
 * degraded marker. Three 400s for one record were also enough to open the
 * breaker for every Zenon lookup of the installation.
 *
 * THE SITUATION IS BUILT (`zzxz`, dropped in afterAll with residue asserted 0):
 *   zzxz1 section — the HOST; its §1 holds zzxz2 AND zzxz7, each with THREE
 *         locators: [zzxz5 '000012281', zzxz3 12281, zzxz5 '000065686']
 *     zzxz2 component_portal — two config items (the rsc368 shape):
 *           dedalo → zzxz3 [zzxz4];  zenon → zzxz5 [zzxz6 fields_map title]
 *     zzxz7 component_autocomplete — the same config (rsc368's own model: the
 *           export FANS OUT through it instead of the compact portal cell)
 *   zzxz3 section — LOCAL targets, carrying an api_config RESIDUE (the rsc205
 *         twin); §12281 has zzxz4 = 'local publication'
 *     zzxz4 component_input_text
 *   zzxz5 section — the EXTERNAL section (the zenon1 twin): api_config, no rows
 *   zzxz8 section — VIRTUAL of zzxz5 (owns zzxz6 through getSectionRealTipo)
 *     zzxz6 component_external, fields_map remote 'title'
 * The local id and the first remote id are the SAME digits (12281 vs
 * '000012281'): the two different records Bug A/B confused.
 *
 * THE SOCKET NEVER OPENS. `api_url` is an IP LITERAL (no resolver traffic —
 * ssrf_guard answers a public literal without DNS), and `fetch` is replaced
 * for the whole file by a counting stub that answers every requested id with a
 * row naming that id. The read-path case also parks the stub through the
 * per-read transport seam (setExternalTransportDepsForTests) — the flat and
 * export paths have no per-read context to park it on. What the stub records
 * IS the assertion: exactly which remote ids were asked for.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
	deriveExternalValue,
	externalComponentAppliesTo,
	setExternalTransportDepsForTests,
} from '../../src/core/components/component_external/value.ts';
import type { Ddo } from '../../src/core/concepts/ddo.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { type DataItem, EmissionContext } from '../../src/core/resolve/component_data.ts';
import {
	resolveCellValue,
	resolveRelationTargetValues,
} from '../../src/core/resolve/relation_list.ts';
import { emitDdoData } from '../../src/core/section/read.ts';
import { type Principal, resolvePrincipal } from '../../src/core/security/permissions.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import type { ToolActionContext, ToolResponse } from '../../src/core/tools/module.ts';
import { drainInFlightExternalFetches } from '../../src/external/api/index.ts';
import { resetBreakerForOrigin } from '../../src/external/breaker.ts';
import { overrideExternalSettingsForTests } from '../../src/external/settings.ts';
import { toolExportGetExportGrid } from '../../tools/tool_export/server/tool_export.ts';

/** A PUBLIC IP literal: allowlistable, and vetted without a DNS lookup. */
const HOST = '141.100.1.1';
const ORIGIN = `https://${HOST}`;

const HOST_SECTION = 'zzxz1';
const PORTAL = 'zzxz2';
const LOCAL_SECTION = 'zzxz3';
const LOCAL_LABEL = 'zzxz4';
const EXTERNAL_SECTION = 'zzxz5';
const EXTERNAL_TITLE = 'zzxz6';
/** The SAME config on a component_autocomplete — rsc368's own model, whose export
 * path FANS OUT per child instead of taking the compact portal cell. */
const AUTOCOMPLETE = 'zzxz7';
/** A VIRTUAL section of the external one (relations → zzxz5): borrows its children. */
const VIRTUAL_EXTERNAL = 'zzxz8';

const HOST_ID = 1;
const LOCAL_ID = 12281;
/** Same digits as LOCAL_ID, a different record: the remote one. */
const REMOTE_ID_A = '000012281';
const REMOTE_ID_B = '000065686';
const LOCAL_VALUE = 'local publication';

const API_CONFIG = {
	entity: 'zenon',
	api_url: `${ORIGIN}/api/v1/record`,
	ui_base_url: `${ORIGIN}/Record/`,
	response_map: [{ local: 'ar_records', remote: 'records' }],
};

const titleOf = (remoteId: string): string => `remote title ${remoteId}`;

/** The rsc368 shape: a dedalo item AND an external item, one component. */
const mixedConfig = () => ({
	source: {
		request_config: [
			{
				api_engine: 'dedalo',
				type: 'main',
				sqo: { section_tipo: [{ value: [LOCAL_SECTION], source: 'section' }] },
				show: {
					ddo_map: [{ tipo: LOCAL_LABEL, parent: 'self', section_tipo: LOCAL_SECTION }],
					fields_separator: ', ',
				},
			},
			{
				api_engine: 'zenon',
				type: 'main',
				sqo: { section_tipo: [{ value: [EXTERNAL_SECTION], source: 'section' }] },
				show: {
					ddo_map: [
						{
							tipo: EXTERNAL_TITLE,
							parent: 'self',
							fields_map: true,
							section_tipo: EXTERNAL_SECTION,
						},
					],
					fields_separator: ' | ',
				},
			},
		],
	},
});

/** The three stored locators — remote, LOCAL (same digits), remote. */
const mixedLocators = (from: string) => [
	{
		type: 'dd151',
		section_tipo: EXTERNAL_SECTION,
		section_id: REMOTE_ID_A,
		from_component_tipo: from,
	},
	{ type: 'dd151', section_tipo: LOCAL_SECTION, section_id: LOCAL_ID, from_component_tipo: from },
	{
		type: 'dd151',
		section_tipo: EXTERNAL_SECTION,
		section_id: REMOTE_ID_B,
		from_component_tipo: from,
	},
];

const S = situation({
	name: 'external section_id verbatim + foreign target',
	tld: 'zzxz',
	nodes: [
		{ tipo: HOST_SECTION, parent: 'test1', model: 'section', term: { 'lg-spa': 'zz host' } },
		{
			tipo: PORTAL,
			parent: HOST_SECTION,
			model: 'component_portal',
			term: { 'lg-spa': 'zz mixed portal' },
			properties: mixedConfig(),
		},
		{
			tipo: AUTOCOMPLETE,
			parent: HOST_SECTION,
			model: 'component_autocomplete',
			term: { 'lg-spa': 'zz mixed autocomplete' },
			properties: mixedConfig(),
		},
		{
			tipo: LOCAL_SECTION,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'zz local publications' },
			// The rsc205 residue: a LOCAL section that also carries an api_config.
			properties: { api_config: API_CONFIG },
		},
		{
			tipo: LOCAL_LABEL,
			parent: LOCAL_SECTION,
			model: 'component_input_text',
			term: { 'lg-spa': 'zz local title' },
		},
		{
			tipo: EXTERNAL_SECTION,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'zz remote catalogue' },
			properties: { api_config: API_CONFIG },
		},
		{
			tipo: VIRTUAL_EXTERNAL,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'zz virtual remote catalogue' },
			relations: [{ tipo: EXTERNAL_SECTION }],
		},
		{
			tipo: EXTERNAL_TITLE,
			parent: EXTERNAL_SECTION,
			model: 'component_external',
			term: { 'lg-spa': 'zz remote title' },
			properties: { fields_map: [{ local: 'dato', remote: 'title' }] },
		},
	],
	records: [
		{
			section_tipo: HOST_SECTION,
			section_id: HOST_ID,
			columns: {
				relation: { [PORTAL]: mixedLocators(PORTAL), [AUTOCOMPLETE]: mixedLocators(AUTOCOMPLETE) },
			},
		},
		{
			section_tipo: LOCAL_SECTION,
			section_id: LOCAL_ID,
			columns: {
				string: { [LOCAL_LABEL]: [{ id: 1, lang: 'lg-nolan', value: LOCAL_VALUE }] },
			},
		},
	],
});

// ---------------------------------------------------------------------------
// The socket stub — every remote id asked for, in order
// ---------------------------------------------------------------------------

let askedIds: string[] = [];
const realFetch = globalThis.fetch;

async function stubFetch(input: unknown): Promise<Response> {
	const url = String(input instanceof Request ? input.url : input);
	const remoteId = new URL(url).searchParams.get('id') ?? '';
	askedIds.push(remoteId);
	return new Response(
		JSON.stringify({ records: [{ id: remoteId, title: titleOf(remoteId) }], status: 'OK' }),
		{ status: 200 },
	);
}

let principal!: Principal;

beforeAll(async () => {
	globalThis.fetch = stubFetch as unknown as typeof fetch;
	principal = await resolvePrincipal(-1);
	await ensureSituation(S);
});

afterAll(async () => {
	overrideExternalSettingsForTests(null);
	await drainInFlightExternalFetches();
	resetBreakerForOrigin('zenon', ORIGIN);
	globalThis.fetch = realFetch;
	expect(await dropSituation(S)).toBe(0);
});

beforeEach(async () => {
	askedIds = [];
	overrideExternalSettingsForTests({
		enabled: true,
		disabledServices: [],
		allowedHosts: [HOST],
		softTtlMs: 300_000,
		retryAttempts: 0,
		maxConcurrency: 4,
	});
	resetBreakerForOrigin('zenon', ORIGIN);
	// The row cache is ontology-lifecycled: dropping it makes every case ask the
	// socket again, so the asked-id assertions are never vacuous.
	await clearOntologyDerivedCaches();
});

afterEach(async () => {
	await drainInFlightExternalFetches();
	overrideExternalSettingsForTests(null);
});

/** The only ids any path may send: the stored remote ids, verbatim. */
const REMOTE_IDS = [REMOTE_ID_A, REMOTE_ID_B];

function expectOnlyVerbatimRemoteIds(): void {
	expect(askedIds.length).toBeGreaterThan(0);
	expect([...new Set(askedIds)].sort()).toEqual([...REMOTE_IDS].sort());
}

// ---------------------------------------------------------------------------

describe('the ownership rule (ontology, never the target api_config)', () => {
	test('owner / foreign are decided by the component parent section', async () => {
		expect(await externalComponentAppliesTo(EXTERNAL_TITLE, EXTERNAL_SECTION)).toBe('owner');
		// The residue section carries an api_config — still foreign.
		expect(await externalComponentAppliesTo(EXTERNAL_TITLE, LOCAL_SECTION)).toBe('foreign');
		// A virtual section borrows its real section's children, so it owns them too.
		expect(await externalComponentAppliesTo(EXTERNAL_TITLE, VIRTUAL_EXTERNAL)).toBe('owner');
	});

	test('a foreign target derives nothing: no call, no degraded marker', async () => {
		const derived = await deriveExternalValue(EXTERNAL_TITLE, LOCAL_SECTION, String(LOCAL_ID));
		expect(derived).toEqual({ entries: [] });
		expect(askedIds).toEqual([]);
	});

	test('an owned target reaches the transport with the id verbatim', async () => {
		const derived = await deriveExternalValue(EXTERNAL_TITLE, EXTERNAL_SECTION, REMOTE_ID_B);
		expect(derived.entries).toEqual([titleOf(REMOTE_ID_B)]);
		expect(derived.source_status).toBeUndefined();
		expect(askedIds).toEqual([REMOTE_ID_B]);
	});
});

describe('relation_list flat values (the Referencias / export cell resolver)', () => {
	test('per target: remote ids verbatim, the local target never asked for', async () => {
		const unresolved: string[] = [];
		const targets = await resolveRelationTargetValues(
			HOST_SECTION,
			HOST_ID,
			PORTAL,
			'lg-spa',
			unresolved,
		);
		expect(targets.map((target) => [target.sectionTipo, target.sectionId, target.parts])).toEqual([
			[EXTERNAL_SECTION, REMOTE_ID_A, [titleOf(REMOTE_ID_A)]],
			// The local record: its own value, and NOTHING from the remote column.
			[LOCAL_SECTION, LOCAL_ID, [LOCAL_VALUE]],
			[EXTERNAL_SECTION, REMOTE_ID_B, [titleOf(REMOTE_ID_B)]],
		]);
		expectOnlyVerbatimRemoteIds();
		// A column that does not apply is not a gap.
		expect(unresolved).toEqual([]);
	});

	test('the joined cell carries the same three values', async () => {
		const unresolved: string[] = [];
		const cell = await resolveCellValue(HOST_SECTION, HOST_ID, PORTAL, 'lg-spa', unresolved);
		expect(cell).toBe([titleOf(REMOTE_ID_A), LOCAL_VALUE, titleOf(REMOTE_ID_B)].join(' | '));
		expectOnlyVerbatimRemoteIds();
		expect(unresolved).toEqual([]);
	});

	test('a stored-family column never reads a padded remote id as a record address', async () => {
		// '000012281' is NOT record 12281 — it must not read the local row.
		const unresolved: string[] = [];
		expect(
			await resolveCellValue(LOCAL_SECTION, REMOTE_ID_A, LOCAL_LABEL, 'lg-spa', unresolved),
		).toBeNull();
		// The canonical address (and its unswept string form) still reads.
		expect(await resolveCellValue(LOCAL_SECTION, LOCAL_ID, LOCAL_LABEL, 'lg-spa', [])).toBe(
			LOCAL_VALUE,
		);
		expect(await resolveCellValue(LOCAL_SECTION, String(LOCAL_ID), LOCAL_LABEL, 'lg-spa', [])).toBe(
			LOCAL_VALUE,
		);
		expect(askedIds).toEqual([]);
	});
});

// ---------------------------------------------------------------------------

interface Grid {
	rows?: { rec?: unknown; c?: Record<string, string> }[];
	unresolved?: string[];
}

async function exportGrid(path: Record<string, unknown>[], format: string): Promise<Grid> {
	const response: ToolResponse = await toolExportGetExportGrid({
		principal,
		userId: -1,
		background: false,
		options: {
			section_tipo: HOST_SECTION,
			model: 'section',
			data_format: format,
			breakdown: 'rows',
			lang: 'lg-spa',
			ar_ddo_to_export: [{ path }],
			sqo: {
				section_tipo: [HOST_SECTION],
				limit: 0,
				offset: 0,
				filter_by_locators: [{ section_tipo: HOST_SECTION, section_id: HOST_ID }],
			},
		},
	} as ToolActionContext);
	return (response.data ?? {}) as Grid;
}

/** Every cell text of the grid, flattened (cells are JSON strings). */
function cellTexts(grid: Grid): string {
	return JSON.stringify(grid.rows ?? []);
}

const mainStep = (tipo: string, model: string) => ({
	section_tipo: HOST_SECTION,
	component_tipo: tipo,
	model,
	name: tipo,
});
const REMOTE_STEP = {
	section_tipo: EXTERNAL_SECTION,
	component_tipo: EXTERNAL_TITLE,
	model: 'component_external',
	name: 'zz remote title',
};

describe('tool_export', () => {
	const MAINS = [
		mainStep(PORTAL, 'component_portal'),
		mainStep(AUTOCOMPLETE, 'component_autocomplete'),
	];
	for (const [format, main] of ['value', 'grid_value'].flatMap((f) =>
		MAINS.map((m) => [f, m] as const),
	)) {
		test(`${format} ${main.model}: the main cell — verbatim ids, local never asked`, async () => {
			const grid = await exportGrid([main], format);
			const text = cellTexts(grid);
			expect(text).toContain(titleOf(REMOTE_ID_A));
			expect(text).toContain(titleOf(REMOTE_ID_B));
			expect(text).toContain(LOCAL_VALUE);
			expect(text).not.toContain(titleOf(String(LOCAL_ID)));
			expectOnlyVerbatimRemoteIds();
		});

		test(`${format} ${main.model} → remote column (the walk hop) — verbatim ids`, async () => {
			const grid = await exportGrid([main, REMOTE_STEP], format);
			const text = cellTexts(grid);
			expect(text).toContain(titleOf(REMOTE_ID_A));
			expect(text).toContain(titleOf(REMOTE_ID_B));
			// The hop through the LOCAL target reaches the remote column too: it
			// does not apply there, so nothing is asked and nothing is shown.
			expect(text).not.toContain(titleOf(String(LOCAL_ID)));
			expect(grid.unresolved ?? []).not.toContain('component_external');
			expectOnlyVerbatimRemoteIds();
		});
	}
});

// ---------------------------------------------------------------------------

describe('read path (portal expansion + emit hook)', () => {
	test('the expansion asks for the stored remote ids verbatim, never the local one', async () => {
		const emission = new EmissionContext();
		setExternalTransportDepsForTests(emission, {
			fetchImpl: (url: string) => stubFetch(url),
			assertPublicUrlImpl: async (uri: string) => ({ url: new URL(uri), addresses: [HOST] }),
		});
		await emitDdoData(
			{ tipo: PORTAL, section_tipo: HOST_SECTION, parent: HOST_SECTION, mode: 'edit' } as Ddo,
			[],
			{
				id: 1,
				section_id: HOST_ID,
				section_tipo: HOST_SECTION,
				columns: {
					relation: {
						[PORTAL]: [
							{ type: 'dd151', section_tipo: EXTERNAL_SECTION, section_id: REMOTE_ID_A },
							{ type: 'dd151', section_tipo: LOCAL_SECTION, section_id: LOCAL_ID },
							{ type: 'dd151', section_tipo: EXTERNAL_SECTION, section_id: REMOTE_ID_B },
						],
					},
				},
				rawText: {},
			},
			{ section_tipo: HOST_SECTION, section_id: HOST_ID },
			'edit',
			'lg-spa',
			HOST_SECTION,
			emission,
			true,
			0,
		);
		await drainInFlightExternalFetches();
		const items = (emission.items as DataItem[]).filter((item) => item.tipo === EXTERNAL_TITLE);
		// The client matches its instance by STRING equality of the echoed id.
		expect(items.map((item) => item.section_id).sort()).toEqual([...REMOTE_IDS].sort());
		for (const item of items) {
			expect((item as { entries?: unknown }).entries).toEqual([titleOf(String(item.section_id))]);
			expect((item as { source_status?: unknown }).source_status).toBeUndefined();
		}
		expectOnlyVerbatimRemoteIds();
	});
});
