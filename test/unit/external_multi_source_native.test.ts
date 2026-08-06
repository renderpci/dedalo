/**
 * MULTI-SOURCE RELATION READ — the gate for the rsc368 shape: ONE component
 * whose request_config declares TWO sources, a dedalo one and an external one,
 * whose locators must dispatch PER LOCATOR.
 *
 * THE TWO DEFECTS THIS PINS SHUT.
 *  1. Only `request_config[0]`'s show map became the portal's children, so the
 *     second item's ddos never existed. A zenon1 locator was then filtered
 *     against dedalo-only ddos, matched nothing, and the cell rendered empty.
 *     PHP has always merged every item (class.common.php:2312 `full_ddo_map`).
 *  2. The per-locator expansion did `getMatrixTableFromTipo` →
 *     `loadRecordCached` → `if (record === null) continue`. An external section
 *     has NO matrix row anywhere, so the locator vanished silently.
 *
 * NO api_engine BRANCH IS ASSERTED, deliberately: routing is by the LOCATOR's
 * section_tipo and the child ddo's declared section_tipo, exactly as the oracle
 * does it. The tests below therefore assert on WHICH ddos reach WHICH target,
 * never on an engine name in the read path.
 *
 * Why native and not differential: the suite database (the test3 playground)
 * carries no `zenon*` ontology, so rsc368 cannot be driven here. This builds a
 * scratch twin of its shape and drives the REAL emission path (`emitDdoData` →
 * registry → portalResolver → expandPortal) over it. Only the socket is stubbed.
 *
 * Scratch surfaces, all swept in afterAll and pre-cleaned in beforeAll:
 *   dd_ontology  test97{0,1}, test98{0,1,2}, test99{0}
 *   matrix       the two test970 target rows (the HOST record is synthesised in
 *                memory — expandPortal takes it as an argument, so it never
 *                needs to exist in the database).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { setExternalTransportDepsForTests } from '../../src/core/components/component_external/value.ts';
import type { Ddo } from '../../src/core/concepts/ddo.ts';
import type { MatrixRecord } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { flattenConfigDdoMaps, normalizedDdoKey } from '../../src/core/relations/config_ddo_map.ts';
import { type DataItem, EmissionContext } from '../../src/core/resolve/component_data.ts';
import { emitDdoData } from '../../src/core/section/read.ts';
import { resetBreakerForOrigin } from '../../src/external/breaker.ts';
import { drainInFlightExternalFetches } from '../../src/external/cache.ts';
import { overrideExternalSettingsForTests } from '../../src/external/settings.ts';
import type { ExternalFetchImpl } from '../../src/external/transport.ts';

const HOST = 'zenon.dainst.org';
const ORIGIN = `https://${HOST}`;

/** The DEDALO target section (a plain scratch section on the default table). */
const DEDALO_SECTION = 'test970';
/** Its literal child — the ddo the dedalo item declares. */
const DEDALO_CHILD = 'test971';
/** The EXTERNAL target section (the zenon1 twin) — carries properties.api_config. */
const EXTERNAL_SECTION = 'test980';
/** Its component_external children (the zenon4 / zenon5 twins). */
const EXTERNAL_TITLE = 'test981';
const EXTERNAL_AUTHORS = 'test982';
/** The two-source component (the rsc368 twin). */
const CALLER = 'test990';

const SCRATCH_TIPOS = [
	DEDALO_SECTION,
	DEDALO_CHILD,
	EXTERNAL_SECTION,
	EXTERNAL_TITLE,
	EXTERNAL_AUTHORS,
	CALLER,
];

/** Zero-padded remote ids — the whole point of never Number()-ing a section_id. */
const REMOTE_ID_A = '000848571';
const REMOTE_ID_B = '001338683';
/** The dedalo target record id. */
const DEDALO_RECORD_ID = 4001;
const DEDALO_VALUE = 'dedalo row renders';

const API_CONFIG = {
	entity: 'zenon',
	api_url: `${ORIGIN}/api/v1/record`,
	ui_base_url: `${ORIGIN}/Record/`,
	response_map: [{ local: 'ar_records', remote: 'records' }],
};

/**
 * The caller's TWO config items. The dedalo one targets the scratch section and
 * declares its child with an ARRAY section_tipo (a multi-target child must
 * survive flattening — sorting a copy for the dedup key, never flattening to
 * [0], which is the numisdata6 §2 bug). The zenon one targets the external
 * section and hydrates its ddos from their own fields_map.
 */
function callerProperties(): string {
	return JSON.stringify({
		source: {
			request_config: [
				{
					api_engine: 'dedalo',
					type: 'main',
					sqo: { section_tipo: [{ value: [DEDALO_SECTION], source: 'section' }] },
					show: {
						ddo_map: [
							{
								tipo: DEDALO_CHILD,
								parent: 'self',
								// Declared as an ARRAY spanning two sections.
								section_tipo: [EXTERNAL_SECTION, DEDALO_SECTION],
							},
						],
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
							{
								tipo: EXTERNAL_AUTHORS,
								parent: 'self',
								fields_map: true,
								section_tipo: EXTERNAL_SECTION,
							},
							// An EXACT duplicate of the first entry — PHP dedups, so must we.
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
}

/** The HOST record: its relation slot holds one dedalo and two external locators. */
function hostRecord(): MatrixRecord {
	return {
		id: 1,
		section_id: 1,
		section_tipo: DEDALO_SECTION,
		columns: {
			relation: {
				[CALLER]: [
					{
						type: 'dd53',
						section_tipo: DEDALO_SECTION,
						section_id: DEDALO_RECORD_ID,
						from_component_tipo: CALLER,
					},
					// STRING ids, zero padding intact.
					{
						type: 'dd53',
						section_tipo: EXTERNAL_SECTION,
						section_id: REMOTE_ID_A,
						from_component_tipo: CALLER,
					},
					{
						type: 'dd53',
						section_tipo: EXTERNAL_SECTION,
						section_id: REMOTE_ID_B,
						from_component_tipo: CALLER,
					},
				],
			},
		},
		rawText: {},
	};
}

// ---------------------------------------------------------------------------
// Transport stub
// ---------------------------------------------------------------------------

/** Every remote call this test made, in order — the batching evidence. */
let calls: string[] = [];

function rowFor(remoteId: string) {
	return {
		id: remoteId,
		title: `title of ${remoteId}`,
		authors: { primary: { 'Casana, Jesse': {} } },
	};
}

/** A stub that answers the id in the query string, after `delayMs`. */
function stubFetch(delayMs = 0, fail = false): ExternalFetchImpl {
	return async (url: string) => {
		calls.push(url);
		if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
		if (fail) return new Response('upstream is down', { status: 503 });
		const remoteId = new URL(url).searchParams.get('id') ?? '';
		return new Response(JSON.stringify({ records: [rowFor(remoteId)] }), { status: 200 });
	};
}

function deps(impl: ExternalFetchImpl) {
	return {
		fetchImpl: impl,
		assertPublicUrlImpl: async (uri: string) => ({ url: new URL(uri), addresses: ['141.100.1.1'] }),
	};
}

// ---------------------------------------------------------------------------
// Scratch installation
// ---------------------------------------------------------------------------

async function sweepScratch(): Promise<void> {
	await sql.unsafe(
		`DELETE FROM dd_ontology WHERE tipo IN ($1, $2, $3, $4, $5, $6)`,
		SCRATCH_TIPOS as unknown as unknown[],
	);
	await sql.unsafe(`DELETE FROM matrix WHERE section_tipo = $1`, [DEDALO_SECTION]);
	await clearOntologyDerivedCaches();
}

async function insertNode(
	tipo: string,
	parent: string,
	model: string,
	properties: string | null,
	translatable = false,
): Promise<void> {
	await sql.unsafe(
		`INSERT INTO dd_ontology (id, tipo, parent, model, tld, properties, is_translatable, term)
		 VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM dd_ontology), $1, $2, $3, 'test', $4::text::jsonb, $5, $6::text::jsonb)`,
		[tipo, parent, model, properties, translatable, JSON.stringify({ 'lg-spa': tipo })],
	);
}

beforeAll(async () => {
	await sweepScratch(); // crashed-run belt and braces
	await insertNode(DEDALO_SECTION, 'test1', 'section', null);
	await insertNode(DEDALO_CHILD, DEDALO_SECTION, 'component_input_text', null);
	await insertNode(
		EXTERNAL_SECTION,
		'test1',
		'section',
		JSON.stringify({ api_config: API_CONFIG }),
	);
	await insertNode(
		EXTERNAL_TITLE,
		EXTERNAL_SECTION,
		'component_external',
		JSON.stringify({ fields_map: [{ local: 'dato', remote: 'title' }] }),
	);
	await insertNode(
		EXTERNAL_AUTHORS,
		EXTERNAL_SECTION,
		'component_external',
		JSON.stringify({ fields_map: [{ local: 'dato', remote: 'authors', format: 'zenon_authors' }] }),
	);
	await insertNode(CALLER, DEDALO_SECTION, 'component_autocomplete', callerProperties());
	// The dedalo TARGET record — a real row, so the untouched dedalo path really
	// loads it (this is what the outage test proves still renders).
	await sql.unsafe(
		`INSERT INTO matrix (section_id, section_tipo, string) VALUES ($1, $2, $3::text::jsonb)`,
		[
			DEDALO_RECORD_ID,
			DEDALO_SECTION,
			JSON.stringify({ [DEDALO_CHILD]: [{ id: 1, lang: 'lg-nolan', value: DEDALO_VALUE }] }),
		],
	);
	await clearOntologyDerivedCaches();
});

afterAll(async () => {
	await sweepScratch();
});

beforeEach(async () => {
	calls = [];
	overrideExternalSettingsForTests({
		enabled: true,
		disabledServices: [],
		allowedHosts: [HOST],
		softTtlMs: 300_000,
		retryAttempts: 0,
		maxConcurrency: 8,
	});
	resetBreakerForOrigin('zenon', ORIGIN);
	// Drop the row cache between cases — otherwise the second case is served the
	// first one's rows and the fetch COUNT assertions become vacuous.
	await clearOntologyDerivedCaches();
});

afterEach(async () => {
	overrideExternalSettingsForTests(null);
	await drainInFlightExternalFetches();
	resetBreakerForOrigin('zenon', ORIGIN);
	overrideExternalSettingsForTests(null);
});

// ---------------------------------------------------------------------------
// The driver
// ---------------------------------------------------------------------------

/** Emit the caller's portal over the host record, with the socket stubbed. */
async function emitCaller(fetchImpl: ExternalFetchImpl): Promise<DataItem[]> {
	const emission = new EmissionContext();
	setExternalTransportDepsForTests(emission, deps(fetchImpl));
	await emitDdoData(
		{ tipo: CALLER, section_tipo: DEDALO_SECTION, parent: DEDALO_SECTION, mode: 'edit' } as Ddo,
		[], // no client map → the component's OWN config children
		hostRecord(),
		{ section_tipo: DEDALO_SECTION, section_id: 1 },
		'edit',
		'lg-eng',
		DEDALO_SECTION,
		emission,
		true, // allowOwnConfigChildren
		0,
	);
	await drainInFlightExternalFetches();
	return emission.items as DataItem[];
}

/** Items for one tipo, in emission order. */
function itemsOf(items: DataItem[], tipo: string): DataItem[] {
	return items.filter((item) => item.tipo === tipo);
}

// ---------------------------------------------------------------------------
// The dedup rule (pure — no DB, no network)
// ---------------------------------------------------------------------------

describe('flattenConfigDdoMaps — the full_ddo_map rule', () => {
	test('every item contributes show THEN hide, in item order', () => {
		const flattened = flattenConfigDdoMaps(
			[
				{ show: { ddo_map: [{ tipo: 'a' }] }, hide: { ddo_map: [{ tipo: 'b' }] } },
				{ show: { ddo_map: [{ tipo: 'c' }] } },
			],
			{ ownerTipo: 'x' },
		);
		expect(flattened.map((ddo) => ddo.tipo)).toEqual(['a', 'b', 'c']);
	});

	test('an item with an EMPTY show map is skipped WHOLE — its hide map too', () => {
		// PHP class.common.php:2317 `continue`s before the hide push.
		const flattened = flattenConfigDdoMaps(
			[
				{ show: { ddo_map: [] }, hide: { ddo_map: [{ tipo: 'orphan' }] } },
				{ show: { ddo_map: [{ tipo: 'kept' }] } },
			],
			{ ownerTipo: 'x' },
		);
		expect(flattened.map((ddo) => ddo.tipo)).toEqual(['kept']);
	});

	test('an EXACT duplicate collapses; the FIRST occurrence survives', () => {
		const ddo = { tipo: 'a', parent: 'self', section_tipo: 'sec', mode: 'list' };
		const flattened = flattenConfigDdoMaps([{ show: { ddo_map: [ddo, { ...ddo }] } }], {
			ownerTipo: 'x',
		});
		expect(flattened).toHaveLength(1);
	});

	test('a ddo differing ONLY in mode / lang / limit SURVIVES', () => {
		// PHP keys on (tipo, parent, json(section_tipo)) and would drop these —
		// the structural key never collapses two ddos that differ. Ledgered in
		// WC-2026-08-05-multi-engine-ddo-expansion.
		const base = { tipo: 'a', parent: 'self', section_tipo: 'sec' };
		const flattened = flattenConfigDdoMaps(
			[
				{
					show: {
						ddo_map: [
							{ ...base, mode: 'list' },
							{ ...base, mode: 'edit' },
							{ ...base, mode: 'edit', lang: 'lg-eng' },
							{ ...base, mode: 'edit', lang: 'lg-eng', limit: 5 },
						],
					},
				},
			],
			{ ownerTipo: 'x' },
		);
		expect(flattened).toHaveLength(4);
	});

	test('a section_tipo ARRAY is a SET for the key, and survives VERBATIM', () => {
		const left = { tipo: 'a', parent: 'self', section_tipo: ['s2', 's1'] };
		const right = { tipo: 'a', parent: 'self', section_tipo: ['s1', 's2'] };
		expect(normalizedDdoKey(left)).toBe(normalizedDdoKey(right));
		const flattened = flattenConfigDdoMaps([{ show: { ddo_map: [left, right] } }], {
			ownerTipo: 'x',
		});
		expect(flattened).toHaveLength(1);
		// The DECLARED order is untouched — the key sorts a COPY.
		expect(flattened[0]?.section_tipo).toEqual(['s2', 's1']);
	});
});

// ---------------------------------------------------------------------------
// Per-locator dispatch
// ---------------------------------------------------------------------------

describe('per-locator dispatch across two sources', () => {
	test('the dedalo locator sees ONLY the dedalo ddos', async () => {
		const items = await emitCaller(stubFetch());
		const dedaloItems = itemsOf(items, DEDALO_CHILD);
		expect(dedaloItems).toHaveLength(1);
		// Anchored to the dedalo target, and carrying the stored value.
		expect(String(dedaloItems[0]?.section_id)).toBe(String(DEDALO_RECORD_ID));
		expect(JSON.stringify(dedaloItems[0]?.entries)).toContain(DEDALO_VALUE);
		// No external component was resolved at the dedalo target.
		for (const item of [...itemsOf(items, EXTERNAL_TITLE), ...itemsOf(items, EXTERNAL_AUTHORS)]) {
			expect(String(item.section_id)).not.toBe(String(DEDALO_RECORD_ID));
		}
	});

	test('an external locator sees ONLY the external ddos — and RESOLVES', async () => {
		const items = await emitCaller(stubFetch());
		const titles = itemsOf(items, EXTERNAL_TITLE);
		const authors = itemsOf(items, EXTERNAL_AUTHORS);
		// One per external locator (the duplicate ddo collapsed).
		expect(titles).toHaveLength(2);
		expect(authors).toHaveLength(2);
		const idsSeen = titles.map((item) => String(item.section_id)).sort();
		// The zero padding survived end to end — a Number() anywhere breaks this.
		expect(idsSeen).toEqual([REMOTE_ID_A, REMOTE_ID_B]);
		const titleA = titles.find((item) => String(item.section_id) === REMOTE_ID_A);
		expect(titleA?.entries).toEqual([`title of ${REMOTE_ID_A}`]);
		expect(authors.find((item) => String(item.section_id) === REMOTE_ID_A)?.entries).toEqual([
			'primary: Casana, Jesse',
		]);
		// The dedalo literal never reached an external target.
		for (const item of itemsOf(items, DEDALO_CHILD)) {
			expect([REMOTE_ID_A, REMOTE_ID_B]).not.toContain(String(item.section_id));
		}
	});

	test('an ARRAY section_tipo child survives and matches by membership', async () => {
		// DEDALO_CHILD declares [EXTERNAL_SECTION, DEDALO_SECTION]: it must match
		// the dedalo locator (membership, not [0]) and be REFUSED at the external
		// target, where a stored literal cannot resolve.
		const items = await emitCaller(stubFetch());
		expect(itemsOf(items, DEDALO_CHILD)).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// Degradation — the single most important assertion here
// ---------------------------------------------------------------------------

describe('a service outage never costs the dedalo rows', () => {
	test('the dedalo row renders in full while the external ones say why', async () => {
		const items = await emitCaller(stubFetch(0, true));
		const dedaloItems = itemsOf(items, DEDALO_CHILD);
		expect(dedaloItems).toHaveLength(1);
		expect(JSON.stringify(dedaloItems[0]?.entries)).toContain(DEDALO_VALUE);
		// The portal's own item still carries every locator.
		const portalItem = itemsOf(items, CALLER)[0];
		expect((portalItem?.entries as unknown[]) ?? []).toHaveLength(3);
		// The external components emit, EMPTY but EXPLAINED — never a silent blank.
		const titles = itemsOf(items, EXTERNAL_TITLE);
		expect(titles).toHaveLength(2);
		for (const item of titles) {
			expect(item.entries).toEqual([]);
			const status = item.source_status as { state?: string; label_key?: string } | undefined;
			expect(status?.state).toBe('unavailable');
			expect(status?.label_key).toBe('external_source_unavailable');
		}
	});
});

// ---------------------------------------------------------------------------
// Batching
// ---------------------------------------------------------------------------

describe('external resolution is BATCHED, not one blocking call per locator', () => {
	test('two components on one record share ONE call; two records = two calls', async () => {
		await emitCaller(stubFetch());
		// EXTERNAL_TITLE + EXTERNAL_AUTHORS both want REMOTE_ID_A: the targets are
		// merged and their field sets unioned before anything is fetched.
		expect(calls).toHaveLength(2);
		const requested = calls.map((url) => new URL(url).searchParams.get('id')).sort();
		expect(requested).toEqual([REMOTE_ID_A, REMOTE_ID_B]);
		// The union is in the request: one call asks for BOTH fields.
		for (const url of calls) {
			const fields = [...new URL(url).searchParams.getAll('field[]')].sort();
			expect(fields).toEqual(['authors', 'title']);
		}
	});

	test('a slow service costs ONE round trip of wall clock, not N', async () => {
		const delayMs = 250;
		const started = Date.now();
		await emitCaller(stubFetch(delayMs));
		const elapsed = Date.now() - started;
		// Serially (v6's shape) two locators would cost 2 × delayMs. The margin is
		// generous — this is a "not serial" assertion, not a benchmark.
		expect(calls).toHaveLength(2);
		expect(elapsed).toBeLessThan(delayMs * 2);
	});
});

// ---------------------------------------------------------------------------
// REGRESSION: an api_config on an ORDINARY section must change nothing
// ---------------------------------------------------------------------------

/**
 * `properties.api_config` is NOT what makes a section external.
 *
 * Two live nodes prove it: `test3` is the playground section (7 stored rows,
 * ~30 children of every model) and `rsc205` is bibliography (~21.7k rows,
 * carrying a stale api_config left by a 2024 edit). An earlier cut of this
 * subsystem classified a section as external whenever it carried an api_config,
 * which refused every ordinary child and rendered EVERY bibliographic citation
 * in the installation blank — with Zenon perfectly healthy, and with the whole
 * gate suite green.
 *
 * The discriminator is record absence plus a derived child model, never the
 * property. This test is the tripwire for that.
 */
describe('an api_config on a section that HAS stored records changes nothing', () => {
	beforeAll(async () => {
		// Give the DEDALO target the rsc205 treatment: a perfectly valid
		// api_config pasted onto an ordinary, record-bearing section.
		await sql.unsafe(`UPDATE dd_ontology SET properties = $1::text::jsonb WHERE tipo = $2`, [
			JSON.stringify({ api_config: API_CONFIG }),
			DEDALO_SECTION,
		]);
		await clearOntologyDerivedCaches();
	});

	afterAll(async () => {
		await sql.unsafe(`UPDATE dd_ontology SET properties = NULL WHERE tipo = $1`, [DEDALO_SECTION]);
		await clearOntologyDerivedCaches();
	});

	test('its stored child still resolves, with its stored value', async () => {
		const items = await emitCaller(stubFetch());
		const dedaloItems = itemsOf(items, DEDALO_CHILD);
		expect(dedaloItems).toHaveLength(1);
		expect(String(dedaloItems[0]?.section_id)).toBe(String(DEDALO_RECORD_ID));
		expect(JSON.stringify(dedaloItems[0]?.entries)).toContain(DEDALO_VALUE);
	});

	test('and the external locators still resolve remotely alongside it', async () => {
		const items = await emitCaller(stubFetch());
		expect(itemsOf(items, EXTERNAL_TITLE)).toHaveLength(2);
	});
});
