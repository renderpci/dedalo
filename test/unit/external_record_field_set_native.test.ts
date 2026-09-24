/**
 * ONE REQUEST PER REMOTE RECORD, CARRYING THE SECTION'S WHOLE FIELD SET — and
 * no external id ever read as a LOCAL record address (2026-09-24,
 * engineering/wire_contract/WC-2026-09-24-external-record-field-set.md,
 * engineering/EXTERNAL_SPEC.md §3 addendum).
 *
 * BUG C, measured live against Zenon. A component_external asked the service
 * for ITS OWN field only (`field[]=title`). Zenon answers exactly the fields it
 * is asked for, so the row came back WITHOUT `id`; the identity check
 * (fields_map.ts defaultPickRow — the row's id must equal the requested one)
 * refused it, and every non-id column read `not_found`. And one record cost one
 * GET per component. The fix asks ONCE per record with the UNION of the fields
 * every component_external of the section maps, plus the id field
 * (src/external/record_fields.ts, applied inside cache.ts fetchExternalRows).
 *
 * THE STUB IS THE SERVICE'S CONTRACT: it answers ONLY the `field[]` it was
 * asked for (Zenon's behaviour). Everything asserted is what it recorded.
 *
 * E — the relation prepass and the frontier:
 *   - a component_external ddo that declares NO section_tipo matches every
 *     target by declaration; the ownership rule (value.ts
 *     externalComponentAppliesTo) must still keep a LOCAL target (with
 *     api_config residue) from being sent to the service;
 *   - an external target's padded id is never Number()-ed into a local record
 *     address (a row at the same digits must not render as the remote record);
 *   - frontierRecordAllowed: an external reference has no local record, so it
 *     passes the RECORD key; padded digits on a LOCAL section address nothing
 *     and fail closed.
 *
 * THE SITUATION IS BUILT (`zzxf`, dropped in afterAll, residue asserted 0):
 *   zzxf1 section — EXTERNAL (api_config), the zenon1 twin
 *     zzxf2 component_external  title
 *     zzxf3 component_external  authors  (format zenon_authors)
 *     zzxf4 component_external  publicationDates (format array_values)
 *     zzxf5 component_external  id
 *     zzxf8 component_input_text  a STORED child (§12281 holds a decoy row)
 *   zzxf10 section — VIRTUAL of zzxf1
 *   zzxf6 section — HOST; zzxf7 component_portal over [zzxf9 local, zzxf1 remote]
 *   zzxf9 section — LOCAL with api_config RESIDUE (the rsc205 twin); §12281
 *     zzxf11 component_input_text
 *   zzxf12 section — OTHER; zzxf13 component_external (foreign to both targets)
 *   zzxf14 component_external of zzxf1 mapping `dc:title` — a name the zenon
 *     adapter REFUSES (bare identifiers only). It must make ITSELF
 *     `misconfigured` and stay out of the section's shared request, never take
 *     the record's other columns down (2026-09-24).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
	deriveExternalValue,
	setExternalTransportDepsForTests,
} from '../../src/core/components/component_external/value.ts';
import type { Ddo } from '../../src/core/concepts/ddo.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { EmissionContext } from '../../src/core/resolve/component_data.ts';
import { emitDdoData } from '../../src/core/section/read.ts';
import { frontierRecordAllowed } from '../../src/core/security/frontier_scope.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import {
	drainInFlightExternalFetches,
	fetchExternalRows,
	getExternalServiceForSection,
} from '../../src/external/api/index.ts';
import { resetBreakerForOrigin } from '../../src/external/breaker.ts';
import { sectionMappedRemoteFields } from '../../src/external/record_fields.ts';
import { overrideExternalSettingsForTests } from '../../src/external/settings.ts';

/** A PUBLIC IP literal: allowlistable, and vetted without a DNS lookup. */
const HOST = '141.100.1.3';
const ORIGIN = `https://${HOST}`;

const EXTERNAL = 'zzxf1';
const TITLE = 'zzxf2';
const AUTHORS = 'zzxf3';
const DATES = 'zzxf4';
const ID = 'zzxf5';
const HOST_SECTION = 'zzxf6';
const PORTAL = 'zzxf7';
const EXT_NOTE = 'zzxf8';
const LOCAL = 'zzxf9';
const VIRTUAL = 'zzxf10';
const LOCAL_LABEL = 'zzxf11';
const OTHER = 'zzxf12';
const OTHER_EXTERNAL = 'zzxf13';
const BAD_FIELD = 'zzxf14';

const REMOTE_ID = '000012281';
/** The core users section (the engine's own, not an install TLD). */
const USERS_SECTION = 'dd128';
const LOCAL_ID = 12281;
const MISSING_LOCAL_ID = 55_555;
const DECOY = 'decoy local row at 12281';
const LOCAL_VALUE = 'local publication';

const API_CONFIG = {
	entity: 'zenon',
	api_url: `${ORIGIN}/api/v1/record`,
	ui_base_url: `${ORIGIN}/Record/`,
	response_map: [{ local: 'ar_records', remote: 'records' }],
};

/** The FULL remote record. The stub hands out only the requested fields of it. */
const fullRecord = (remoteId: string): Record<string, unknown> => ({
	id: remoteId,
	title: `title ${remoteId}`,
	authors: { primary: { 'Author, A.': [] }, secondary: [] },
	publicationDates: ['1999', '2001'],
	summary: 'never mapped — must never be asked for',
});

const S = situation({
	name: 'external record field set + id discipline',
	tld: 'zzxf',
	nodes: [
		{
			tipo: EXTERNAL,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'zz remote catalogue' },
			properties: { api_config: API_CONFIG },
		},
		{
			tipo: TITLE,
			parent: EXTERNAL,
			model: 'component_external',
			term: { 'lg-spa': 'zz title' },
			properties: { fields_map: [{ local: 'dato', remote: 'title' }] },
		},
		{
			tipo: AUTHORS,
			parent: EXTERNAL,
			model: 'component_external',
			term: { 'lg-spa': 'zz authors' },
			properties: { fields_map: [{ local: 'dato', remote: 'authors', format: 'zenon_authors' }] },
		},
		{
			tipo: DATES,
			parent: EXTERNAL,
			model: 'component_external',
			term: { 'lg-spa': 'zz dates' },
			properties: {
				fields_map: [{ local: 'dato', remote: 'publicationDates', format: 'array_values' }],
			},
		},
		{
			tipo: ID,
			parent: EXTERNAL,
			model: 'component_external',
			term: { 'lg-spa': 'zz id' },
			properties: { fields_map: [{ local: 'dato', remote: 'id' }] },
		},
		{
			tipo: EXT_NOTE,
			parent: EXTERNAL,
			model: 'component_input_text',
			term: { 'lg-spa': 'zz stored note' },
		},
		{
			tipo: VIRTUAL,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'zz virtual remote catalogue' },
			relations: [{ tipo: EXTERNAL }],
		},
		{ tipo: HOST_SECTION, parent: 'test1', model: 'section', term: { 'lg-spa': 'zz host' } },
		{
			tipo: PORTAL,
			parent: HOST_SECTION,
			model: 'component_portal',
			term: { 'lg-spa': 'zz portal' },
			properties: {
				source: {
					request_config: [
						{
							api_engine: 'dedalo',
							type: 'main',
							sqo: {
								section_tipo: [{ value: [LOCAL, EXTERNAL], source: 'section' }],
							},
							show: {
								// NO section_tipo on any ddo: each matches EVERY target by
								// declaration — the ownership rule must do the sorting.
								ddo_map: [
									{ tipo: LOCAL_LABEL, parent: 'self' },
									{ tipo: TITLE, parent: 'self' },
									{ tipo: EXT_NOTE, parent: 'self' },
									// A component_external of ANOTHER section: foreign at both
									// targets, so its field is never asked for.
									{ tipo: OTHER_EXTERNAL, parent: 'self' },
								],
							},
						},
					],
				},
			},
		},
		{
			tipo: LOCAL,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'zz local publications' },
			// The rsc205 residue: a LOCAL section that also carries an api_config.
			properties: { api_config: API_CONFIG },
		},
		{ tipo: OTHER, parent: 'test1', model: 'section', term: { 'lg-spa': 'zz other' } },
		{
			tipo: OTHER_EXTERNAL,
			parent: OTHER,
			model: 'component_external',
			term: { 'lg-spa': 'zz other external' },
			properties: { fields_map: [{ local: 'dato', remote: 'summary' }] },
		},
		{
			tipo: BAD_FIELD,
			parent: EXTERNAL,
			model: 'component_external',
			term: { 'lg-spa': 'zz refused field' },
			properties: { fields_map: [{ local: 'dato', remote: 'dc:title' }] },
		},
		{
			tipo: LOCAL_LABEL,
			parent: LOCAL,
			model: 'component_input_text',
			term: { 'lg-spa': 'zz local title' },
		},
	],
	records: [
		{
			section_tipo: LOCAL,
			section_id: LOCAL_ID,
			columns: { string: { [LOCAL_LABEL]: [{ id: 1, lang: 'lg-nolan', value: LOCAL_VALUE }] } },
		},
		{
			// The DECOY: a stored row of the external section at the SAME digits as
			// the remote id. '000012281' Number()-ed would read it.
			section_tipo: EXTERNAL,
			section_id: LOCAL_ID,
			columns: { string: { [EXT_NOTE]: [{ id: 1, lang: 'lg-nolan', value: DECOY }] } },
		},
	],
});

// ---------------------------------------------------------------------------
// The service stub — answers ONLY the requested fields (Zenon's contract)
// ---------------------------------------------------------------------------

interface Asked {
	id: string;
	fields: string[];
}
let asked: Asked[] = [];
/** When set, the stub answers a row carrying THIS id instead of the asked one. */
let answerIdOverride: string | null = null;
const realFetch = globalThis.fetch;

async function stubFetch(input: unknown): Promise<Response> {
	const url = new URL(String(input instanceof Request ? input.url : input));
	const id = url.searchParams.get('id') ?? '';
	const fields = url.searchParams.getAll('field[]');
	asked.push({ id, fields });
	const record = fullRecord(answerIdOverride ?? id);
	const row: Record<string, unknown> = {};
	for (const field of fields) if (field in record) row[field] = record[field];
	return new Response(JSON.stringify({ records: [row], status: 'OK' }), { status: 200 });
}

const DEPS = {
	fetchImpl: (url: string) => stubFetch(url),
	assertPublicUrlImpl: async (uri: string) => ({ url: new URL(uri), addresses: [HOST] }),
};

beforeAll(async () => {
	globalThis.fetch = stubFetch as unknown as typeof fetch;
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
	asked = [];
	answerIdOverride = null;
	overrideExternalSettingsForTests({
		enabled: true,
		disabledServices: [],
		allowedHosts: [HOST],
		softTtlMs: 300_000,
		retryAttempts: 0,
		maxConcurrency: 4,
	});
	resetBreakerForOrigin('zenon', ORIGIN);
	// Drop the row cache (ontology-lifecycled): every case starts from the socket.
	await clearOntologyDerivedCaches();
});

afterEach(async () => {
	await drainInFlightExternalFetches();
	overrideExternalSettingsForTests(null);
});

/** One emission carrying the stub as its per-read transport seam. */
function stubbedEmission(): EmissionContext {
	const emission = new EmissionContext();
	setExternalTransportDepsForTests(emission, DEPS);
	return emission;
}

const EXPECTED = {
	[TITLE]: [`title ${REMOTE_ID}`],
	[AUTHORS]: ['primary: Author, A.'],
	[DATES]: ['1999 | 2001'],
	[ID]: [REMOTE_ID],
} as const;

// ---------------------------------------------------------------------------

describe('the record field set (C)', () => {
	test('the set is the id field + every mapped field, ontology order; virtual-aware', async () => {
		const model = (await getExternalServiceForSection(EXTERNAL))?.model;
		if (model === undefined) throw new Error('zzxf1 binds no service');
		// zzxf14's 'dc:title' is mapped but REFUSED by the adapter: not in the set.
		expect([...(await sectionMappedRemoteFields(EXTERNAL, model))]).toEqual([
			'title',
			'authors',
			'publicationDates',
			'id',
		]);
		// A virtual section borrows its real section's children — same set.
		expect([...(await sectionMappedRemoteFields(VIRTUAL, model))]).toEqual([
			'title',
			'authors',
			'publicationDates',
			'id',
		]);
	});

	test('four components of one record, derived in series: all four values, ONE request', async () => {
		const emission = stubbedEmission();
		for (const [tipo, entries] of Object.entries(EXPECTED)) {
			const derived = await deriveExternalValue(tipo, EXTERNAL, REMOTE_ID, { emission });
			expect(derived.entries, tipo).toEqual([...entries]);
			expect(derived.source_status, tipo).toBeUndefined();
		}
		expect(asked).toHaveLength(1);
		// The id field FIRST (the identity check needs it), then the mapped fields.
		expect(asked[0]).toEqual({
			id: REMOTE_ID,
			fields: ['id', 'title', 'authors', 'publicationDates'],
		});
	});

	test('the same four, concurrently: still ONE request (coalesced on one key)', async () => {
		const emission = stubbedEmission();
		const derived = await Promise.all(
			Object.keys(EXPECTED).map((tipo) =>
				deriveExternalValue(tipo, EXTERNAL, REMOTE_ID, { emission }),
			),
		);
		expect(derived.map((value) => value.entries)).toEqual(
			Object.values(EXPECTED).map((entries) => [...entries]),
		);
		expect(asked).toHaveLength(1);
	});

	test('callers naming different fields share ONE cache entry (no fragmentation)', async () => {
		const first = await fetchExternalRows(
			[{ sectionTipo: EXTERNAL, remoteId: REMOTE_ID, remoteFields: ['title'] }],
			{ deps: DEPS },
		);
		const second = await fetchExternalRows(
			[{ sectionTipo: EXTERNAL, remoteId: REMOTE_ID, remoteFields: ['authors'] }],
			{ deps: DEPS },
		);
		expect(asked).toHaveLength(1);
		const view = second.get(`${EXTERNAL}|${REMOTE_ID}`);
		expect(view?.status).toBe('ok');
		// The view names the fields it was requested with: self-describing coverage.
		expect(view?.remoteFields).toEqual(['id', 'title', 'authors', 'publicationDates']);
		expect(first.get(`${EXTERNAL}|${REMOTE_ID}`)?.row).toEqual(view?.row ?? null);
	});

	test('the identity check stays: a row naming ANOTHER id is refused (not_found)', async () => {
		answerIdOverride = '000099999';
		const emission = stubbedEmission();
		const derived = await deriveExternalValue(TITLE, EXTERNAL, REMOTE_ID, { emission });
		expect(derived.entries).toEqual([]);
		expect(derived.source_status?.state).toBe('not_found');
		expect(asked).toHaveLength(1);
		expect(asked[0]?.fields).toContain('id');
	});
});

describe('a remote field name the adapter refuses (2026-09-24)', () => {
	test('only ITS component is misconfigured; every other column renders, from ONE request without it', async () => {
		const emission = stubbedEmission();
		const bad = await deriveExternalValue(BAD_FIELD, EXTERNAL, REMOTE_ID, { emission });
		expect(bad.entries).toEqual([]);
		// The operator's cause, not a retryable outage.
		expect(bad.source_status?.state).toBe('misconfigured');
		for (const [tipo, entries] of Object.entries(EXPECTED)) {
			const derived = await deriveExternalValue(tipo, EXTERNAL, REMOTE_ID, { emission });
			expect(derived.entries, tipo).toEqual([...entries]);
			expect(derived.source_status, tipo).toBeUndefined();
		}
		expect(asked).toEqual([
			{ id: REMOTE_ID, fields: ['id', 'title', 'authors', 'publicationDates'] },
		]);
	});

	test("a caller naming the refused field does not fail the record's shared request", async () => {
		const views = await fetchExternalRows(
			[{ sectionTipo: EXTERNAL, remoteId: REMOTE_ID, remoteFields: ['title', 'dc:title'] }],
			{ deps: DEPS },
		);
		const view = views.get(`${EXTERNAL}|${REMOTE_ID}`);
		expect(view?.status).toBe('ok');
		expect(view?.remoteFields).toEqual(['id', 'title', 'authors', 'publicationDates']);
		expect(asked).toHaveLength(1);
		expect(asked[0]?.fields).not.toContain('dc:title');
	});
});

describe('the relation prepass + the portal expansion (E)', () => {
	test('undeclared-section ddos: the local target never reaches the service, no id is Number()-ed', async () => {
		const emission = stubbedEmission();
		await emitDdoData(
			{ tipo: PORTAL, section_tipo: HOST_SECTION, parent: HOST_SECTION, mode: 'edit' } as Ddo,
			[],
			{
				id: 1,
				section_id: 1,
				section_tipo: HOST_SECTION,
				columns: {
					relation: {
						[PORTAL]: [
							{ type: 'dd151', section_tipo: LOCAL, section_id: LOCAL_ID },
							// A LOCAL locator whose record does not exist: no derived child
							// applies there, so it is skipped — never rendered from the
							// identity-only placeholder as if it were a remote record.
							{ type: 'dd151', section_tipo: LOCAL, section_id: MISSING_LOCAL_ID },
							{ type: 'dd151', section_tipo: EXTERNAL, section_id: REMOTE_ID },
						],
					},
				},
				rawText: {},
			},
			{ section_tipo: HOST_SECTION, section_id: 1 },
			'edit',
			'lg-spa',
			HOST_SECTION,
			emission,
			true,
			0,
		);
		await drainInFlightExternalFetches();
		// Only the remote id, verbatim — never the local target's 12281 — asked
		// ONCE, with exactly the section's field set (the foreign component's
		// 'summary' is not in it).
		expect(asked).toEqual([
			{ id: REMOTE_ID, fields: ['id', 'title', 'authors', 'publicationDates'] },
		]);
		const wire = JSON.stringify(emission.items);
		expect(wire).toContain(`title ${REMOTE_ID}`);
		expect(wire).toContain(LOCAL_VALUE);
		// The decoy row at the same digits is NEVER rendered as the remote record.
		expect(wire).not.toContain(DECOY);
		// The missing local target emits nothing (the foreign external child does
		// not make it a derived target).
		const items = emission.items as { section_id?: unknown }[];
		expect(items.filter((item) => item.section_id === MISSING_LOCAL_ID)).toEqual([]);
		expect(items.some((item) => item.section_id === LOCAL_ID)).toBe(true);
	});
});

describe('frontierRecordAllowed (E)', () => {
	/** A non-admin: the record key is actually evaluated. */
	const scope = {
		principal: { userId: 987_654, isGlobalAdmin: false, isDeveloper: false },
		surface: 'export',
		door: 'external_record_field_set_gate',
	} as const;

	test('an external reference passes the record key (it has no local record)', async () => {
		expect(await frontierRecordAllowed(scope, EXTERNAL, REMOTE_ID)).toBe(true);
	});

	test('api_config RESIDUE is not externality: a non-address on a local section with no component_external fails closed', async () => {
		// zzxf9 (the rsc205 twin) binds a service but owns no component_external:
		// '010' is not record 10 and not a remote reference; 'abc' is junk.
		expect(await frontierRecordAllowed(scope, LOCAL, '010')).toBe(false);
		expect(await frontierRecordAllowed(scope, LOCAL, 'abc')).toBe(false);
		// Control: the section that OWNS a component_external still passes a
		// remote id, even though it also holds a stored row (mixed, like test3).
		expect(await frontierRecordAllowed(scope, EXTERNAL, REMOTE_ID)).toBe(true);
	});

	test('padded digits on a LOCAL section address nothing: fail closed', async () => {
		// No api_config on the host section: '000000001' is not a record address.
		expect(await frontierRecordAllowed(scope, HOST_SECTION, '000000001')).toBe(false);
		// Discriminating: Number('-000001') is -1, the ROOT USER locator the record
		// key lets through (record_scope carve-out) — padded, it addresses NOTHING.
		expect(await frontierRecordAllowed(scope, USERS_SECTION, -1)).toBe(true);
		expect(await frontierRecordAllowed(scope, USERS_SECTION, '-000001')).toBe(false);
	});
});
