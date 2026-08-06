/**
 * THE ROW LAYER — the cache key, the soft TTL, and the coalescer.
 *
 * The key is the whole correctness argument, so every one of its six parts is
 * asserted to CHANGE the key, and the two parts v6 got wrong are additionally
 * asserted behaviourally: two languages and two field sets must never serve
 * each other's row (v6's static cache omitted the field set, so a component
 * asking for {id,title} was handed a row fetched for {id} and rendered nothing).
 *
 * `test3` is the canonical playground section and really does carry a Zenon
 * api_config, so these run against the REAL ontology resolver — only the socket
 * is injected.
 *
 * ONE scratch surface: dd_ontology tipo `test990`, a second external section
 * whose api_config is EDITED mid-flight (the only way to drive the "the binding
 * changed while the fetch was in the air" case, which no read-only fixture can
 * reach). Inserted in beforeAll, swept in afterAll, pre-cleaned for crashed
 * runs. No matrix rows are written.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { resetBreakerForOrigin } from '../../src/external/breaker.ts';
import {
	drainInFlightExternalFetches,
	externalRowCacheKey,
	externalRowViewKey,
	fetchExternalRows,
} from '../../src/external/cache.ts';
import { overrideExternalSettingsForTests } from '../../src/external/settings.ts';
import type { ExternalFetchImpl } from '../../src/external/transport.ts';

const HOST = 'zenon.dainst.org';
const ORIGIN = `https://${HOST}`;
const SECTION = 'test3';

const BASE_KEY_PARTS = {
	service: 'zenon',
	apiUrl: `${ORIGIN}/api/v1/record`,
	sectionTipo: SECTION,
	remoteId: '000848571',
	dataLang: 'lg-eng',
	remoteFields: ['id', 'title'],
};

/** A fetch stub answering with the requested id, counting its calls. */
function countingFetch(): { impl: ExternalFetchImpl; calls: string[] } {
	const calls: string[] = [];
	const impl: ExternalFetchImpl = async (url) => {
		calls.push(url);
		const id = new URL(url).searchParams.get('id') ?? '';
		return new Response(
			JSON.stringify({ records: [{ id, title: `title for ${id}`, marker: url }], status: 'OK' }),
			{ status: 200 },
		);
	};
	return { impl, calls };
}

function deps(impl: ExternalFetchImpl) {
	return {
		fetchImpl: impl,
		assertPublicUrlImpl: async (uri: string) => ({ url: new URL(uri), addresses: ['141.100.1.1'] }),
	};
}

beforeEach(async () => {
	overrideExternalSettingsForTests({
		enabled: true,
		disabledServices: [],
		allowedHosts: [HOST],
		softTtlMs: 300_000,
		retryAttempts: 0,
		maxConcurrency: 4,
	});
	resetBreakerForOrigin('zenon', ORIGIN);
	await clearOntologyDerivedCaches(); // drops the row cache too, by construction
});

afterEach(async () => {
	overrideExternalSettingsForTests(null);
	await drainInFlightExternalFetches();
	resetBreakerForOrigin('zenon', ORIGIN);
});

describe('the cache key carries every identity the row depends on', () => {
	const base = externalRowCacheKey(BASE_KEY_PARTS);

	test('it is the documented six-part key', () => {
		expect(base).toBe(
			'zenon|https://zenon.dainst.org/api/v1/record|test3|000848571|lg-eng|id,title',
		);
	});

	test('each of the six parts changes it', () => {
		const variants = {
			service: { ...BASE_KEY_PARTS, service: 'wikidata' },
			apiUrl: { ...BASE_KEY_PARTS, apiUrl: `${ORIGIN}/api/v2/record` },
			sectionTipo: { ...BASE_KEY_PARTS, sectionTipo: 'zenon1' },
			remoteId: { ...BASE_KEY_PARTS, remoteId: '001338683' },
			dataLang: { ...BASE_KEY_PARTS, dataLang: 'lg-spa' },
			remoteFields: { ...BASE_KEY_PARTS, remoteFields: ['id'] },
		};
		for (const [name, parts] of Object.entries(variants)) {
			expect(externalRowCacheKey(parts), `${name} must change the key`).not.toBe(base);
		}
	});

	test('the field signature is order-INdependent (a sorted set, not a list)', () => {
		expect(externalRowCacheKey({ ...BASE_KEY_PARTS, remoteFields: ['title', 'id'] })).toBe(base);
	});

	test('the api_url QUERY is excluded — a query-scheme credential can never key a row', () => {
		expect(
			externalRowCacheKey({ ...BASE_KEY_PARTS, apiUrl: `${BASE_KEY_PARTS.apiUrl}?key=SECRET` }),
		).toBe(base);
	});

	test('NO principal is in the key — the shared-cache legality claim, stated', () => {
		// With `record_identifiers` egress and ONE install-wide credential the
		// response cannot vary by user. If an adapter ever needs a per-USER
		// credential, the principal must join the key (or that service must opt
		// out of the shared cache) — this assertion is the tripwire on that claim.
		expect(base).not.toContain('principal');
		expect(Object.keys(BASE_KEY_PARTS)).toEqual([
			'service',
			'apiUrl',
			'sectionTipo',
			'remoteId',
			'dataLang',
			'remoteFields',
		]);
	});
});

describe('fetching, caching and refreshing rows', () => {
	test('a first read fetches; a second read inside the soft TTL does not', async () => {
		const { impl, calls } = countingFetch();
		const target = { sectionTipo: SECTION, remoteId: '000100001', remoteFields: ['id', 'title'] };
		const first = await fetchExternalRows([target], { deps: deps(impl), dataLang: 'lg-eng' });
		expect(first.get(externalRowViewKey(SECTION, '000100001'))?.status).toBe('ok');
		expect(calls.length).toBe(1);

		const second = await fetchExternalRows([target], { deps: deps(impl), dataLang: 'lg-eng' });
		expect(second.get(externalRowViewKey(SECTION, '000100001'))?.status).toBe('ok');
		expect(calls.length).toBe(1); // served from the row cache
	});

	test('past the soft TTL the row is served as OK and refreshed behind it', async () => {
		const { impl, calls } = countingFetch();
		const target = { sectionTipo: SECTION, remoteId: '000100002', remoteFields: ['id'] };
		await fetchExternalRows([target], { deps: deps(impl), dataLang: 'lg-eng' });
		expect(calls.length).toBe(1);

		overrideExternalSettingsForTests({ enabled: true, allowedHosts: [HOST], softTtlMs: 0 });
		const served = await fetchExternalRows([target], { deps: deps(impl), dataLang: 'lg-eng' });
		const view = served.get(externalRowViewKey(SECTION, '000100002'));
		// PASSING THE SOFT TTL IS NOT A DEGRADATION. The service is healthy and
		// the row is current; marking it 'stale' put "showing the last known
		// data from the external source" under every field every 5 minutes,
		// which is both false and unreadable. 'stale' means a refresh FAILED.
		expect(view?.status).toBe('ok');
		expect(view?.row).not.toBeNull();
		await drainInFlightExternalFetches();
		expect(calls.length).toBe(2); // the refresh DID happen, behind the request
	});

	test('only a FAILED refresh downgrades the served row to stale', async () => {
		const { impl } = countingFetch();
		const target = { sectionTipo: SECTION, remoteId: '000100022', remoteFields: ['id'] };
		await fetchExternalRows([target], { deps: deps(impl), dataLang: 'lg-eng' });

		// Soft-expire, and make the background refresh fail.
		overrideExternalSettingsForTests({ enabled: true, allowedHosts: [HOST], softTtlMs: 0 });
		const failing: typeof impl = async () => {
			throw new Error('remote down');
		};
		// The serve that TRIGGERS the failing refresh still reports the row as
		// ok — the failure has not happened yet when the view is built.
		const during = await fetchExternalRows([target], {
			deps: deps(failing),
			dataLang: 'lg-eng',
		});
		expect(during.get(externalRowViewKey(SECTION, '000100022'))?.status).toBe('ok');
		await drainInFlightExternalFetches();

		// The NEXT serve carries the downgrade, with the last good row intact.
		const after = await fetchExternalRows([target], { deps: deps(failing), dataLang: 'lg-eng' });
		const view = after.get(externalRowViewKey(SECTION, '000100022'));
		expect(view?.status).toBe('stale');
		expect(view?.row).not.toBeNull();
		await drainInFlightExternalFetches();

		// And a refresh that SUCCEEDS clears the downgrade again.
		const recovered = await fetchExternalRows([target], {
			deps: deps(impl),
			dataLang: 'lg-eng',
		});
		expect(recovered.get(externalRowViewKey(SECTION, '000100022'))?.status).toBe('stale');
		await drainInFlightExternalFetches();
		const healthy = await fetchExternalRows([target], { deps: deps(impl), dataLang: 'lg-eng' });
		expect(healthy.get(externalRowViewKey(SECTION, '000100022'))?.status).toBe('ok');
	});

	test('N sibling components asking for the same record collapse to ONE call', async () => {
		const { impl, calls } = countingFetch();
		const target = { sectionTipo: SECTION, remoteId: '000100003', remoteFields: ['id', 'title'] };
		const results = await Promise.all(
			Array.from({ length: 8 }, () =>
				fetchExternalRows([target], { deps: deps(impl), dataLang: 'lg-eng' }),
			),
		);
		expect(calls.length).toBe(1);
		for (const result of results) {
			expect(result.get(externalRowViewKey(SECTION, '000100003'))?.row?.title).toBe(
				'title for 000100003',
			);
		}
	});

	test('targets naming one record are merged and their field sets UNIONED', async () => {
		const { impl, calls } = countingFetch();
		await fetchExternalRows(
			[
				{ sectionTipo: SECTION, remoteId: '000100004', remoteFields: ['id'] },
				{ sectionTipo: SECTION, remoteId: '000100004', remoteFields: ['title'] },
				{ sectionTipo: SECTION, remoteId: '000100004', remoteFields: ['authors'] },
			],
			{ deps: deps(impl), dataLang: 'lg-eng' },
		);
		expect(calls.length).toBe(1);
		expect(calls[0]).toContain('field[]=id');
		expect(calls[0]).toContain('field[]=title');
		expect(calls[0]).toContain('field[]=authors');
	});

	test('an ontology write drops the row cache (the createOntologyCache lifecycle)', async () => {
		const { impl, calls } = countingFetch();
		const target = { sectionTipo: SECTION, remoteId: '000100005', remoteFields: ['id'] };
		await fetchExternalRows([target], { deps: deps(impl), dataLang: 'lg-eng' });
		expect(calls.length).toBe(1);
		await clearOntologyDerivedCaches();
		await fetchExternalRows([target], { deps: deps(impl), dataLang: 'lg-eng' });
		expect(calls.length).toBe(2);
	});

	test('a record the service does not have is not_found — and negative-cached', async () => {
		const calls: string[] = [];
		const impl: ExternalFetchImpl = async (url) => {
			calls.push(url);
			// A well-formed answer about a DIFFERENT record: never "whatever came first".
			return new Response(JSON.stringify({ records: [{ id: '999999999' }], status: 'OK' }), {
				status: 200,
			});
		};
		const target = { sectionTipo: SECTION, remoteId: '000100006', remoteFields: ['id'] };
		const result = await fetchExternalRows([target], { deps: deps(impl), dataLang: 'lg-eng' });
		const view = result.get(externalRowViewKey(SECTION, '000100006'));
		expect(view?.status).toBe('not_found');
		expect(view?.row).toBeNull();
		await fetchExternalRows([target], { deps: deps(impl), dataLang: 'lg-eng' });
		expect(calls.length).toBe(1); // the negative answer is cached too
	});

	test('an unreachable service with no cached row is `unavailable`, with its reason', async () => {
		const impl: ExternalFetchImpl = async () => new Response('{}', { status: 500 });
		const result = await fetchExternalRows(
			[{ sectionTipo: SECTION, remoteId: '000100007', remoteFields: ['id'] }],
			{ deps: deps(impl), dataLang: 'lg-eng' },
		);
		const view = result.get(externalRowViewKey(SECTION, '000100007'));
		expect(view?.status).toBe('unavailable');
		expect(view?.reason).toBe('http_status');
	});

	test('a section with no api_config is a WIRING BUG and throws — never an empty row', async () => {
		await expect(
			fetchExternalRows([{ sectionTipo: 'test1', remoteId: '1', remoteFields: [] }], {
				deps: deps(countingFetch().impl),
				dataLang: 'lg-eng',
			}),
		).rejects.toThrow(/not an external section/);
	});
});

describe('an ontology write also invalidates the fetches ALREADY IN THE AIR', () => {
	/**
	 * The scratch external section. Its api_config is rewritten mid-request, which
	 * is the whole point: `response_map` decides how a payload is unwrapped and is
	 * deliberately NOT part of the cache key, so a row stored after the edit would
	 * be a pre-edit shape served as fresh for a whole soft TTL.
	 */
	const SCRATCH = 'test990';
	const REMOTE_ID = '000200001';
	const target = { sectionTipo: SCRATCH, remoteId: REMOTE_ID, remoteFields: ['id', 'title'] };

	function apiConfig(rowsKey: 'records' | 'data'): string {
		return JSON.stringify({
			api_config: {
				entity: 'zenon',
				api_url: `${ORIGIN}/api/v1/record`,
				response_map: [{ local: 'ar_records', remote: rowsKey }],
			},
		});
	}

	/** A payload carrying BOTH shapes, so either response_map resolves a row. */
	function bothShapes(): Response {
		return new Response(
			JSON.stringify({
				records: [{ id: REMOTE_ID, title: 'unwrapped by the PRE-edit map' }],
				data: [{ id: REMOTE_ID, title: 'unwrapped by the POST-edit map' }],
			}),
			{ status: 200 },
		);
	}

	/** A fetch that parks until it is released — the "still in the air" window. */
	function gatedFetch(): { impl: ExternalFetchImpl; calls: string[]; release: () => void } {
		const calls: string[] = [];
		let open = false;
		const release = () => {
			open = true;
		};
		const impl: ExternalFetchImpl = async (url) => {
			calls.push(url);
			while (!open) await new Promise((resolve) => setTimeout(resolve, 1));
			return bothShapes();
		};
		return { impl, calls, release };
	}

	async function waitForFetchEntry(calls: string[]): Promise<void> {
		while (calls.length === 0) await new Promise((resolve) => setTimeout(resolve, 1));
	}

	async function writeScratchConfig(rowsKey: 'records' | 'data'): Promise<void> {
		await sql.unsafe(`UPDATE dd_ontology SET properties = $1::text::jsonb WHERE tipo = $2`, [
			apiConfig(rowsKey),
			SCRATCH,
		]);
		await clearOntologyDerivedCaches(); // what every dd_ontology write fires
	}

	beforeAll(async () => {
		await sql.unsafe(`DELETE FROM dd_ontology WHERE tipo = $1`, [SCRATCH]);
		await sql.unsafe(
			`INSERT INTO dd_ontology (id, tipo, parent, model, tld, properties, is_translatable, term)
			 VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM dd_ontology), $1, 'test1', 'section', 'test',
			         $2::text::jsonb, false, $3::text::jsonb)`,
			[SCRATCH, apiConfig('records'), JSON.stringify({ 'lg-spa': SCRATCH })],
		);
		await clearOntologyDerivedCaches();
	});

	afterAll(async () => {
		await sql.unsafe(`DELETE FROM dd_ontology WHERE tipo = $1`, [SCRATCH]);
		await clearOntologyDerivedCaches();
	});

	test('a fetch settling after an api_config edit does NOT re-populate the cache', async () => {
		await writeScratchConfig('records');
		const { impl, calls, release } = gatedFetch();
		const inAir = fetchExternalRows([target], { deps: deps(impl), dataLang: 'lg-eng' });
		await waitForFetchEntry(calls);

		// The cataloguer saves a new response_map while the request is in the air.
		// Clearing the cache is NOT enough on its own: this fetch settles afterwards.
		await writeScratchConfig('data');
		release();

		const served = await inAir;
		// The request that asked still gets what it fetched — refusing it would 500
		// a page because somebody else pressed save.
		expect(served.get(externalRowViewKey(SCRATCH, REMOTE_ID))?.row?.title).toBe(
			'unwrapped by the PRE-edit map',
		);

		// …but the next reader must NOT be served that row: same cache key, changed
		// binding. A new call, unwrapped by the map that is actually in force.
		const { impl: freshImpl, calls: freshCalls, release: freshRelease } = gatedFetch();
		freshRelease();
		const next = await fetchExternalRows([target], { deps: deps(freshImpl), dataLang: 'lg-eng' });
		expect(freshCalls.length).toBe(1);
		expect(next.get(externalRowViewKey(SCRATCH, REMOTE_ID))?.row?.title).toBe(
			'unwrapped by the POST-edit map',
		);
	});

	test('an UNCHANGED binding still caches — the check is identity, not paranoia', async () => {
		await writeScratchConfig('records');
		const { impl, calls, release } = gatedFetch();
		const inAir = fetchExternalRows([target], { deps: deps(impl), dataLang: 'lg-eng' });
		await waitForFetchEntry(calls);
		// An unrelated dd_ontology write: the cache is dropped, the binding is not.
		await clearOntologyDerivedCaches();
		release();
		await inAir;

		const { impl: secondImpl, calls: secondCalls, release: secondRelease } = gatedFetch();
		secondRelease();
		const second = await fetchExternalRows([target], {
			deps: deps(secondImpl),
			dataLang: 'lg-eng',
		});
		expect(secondCalls.length).toBe(0); // served from the row cache the fetch stored
		expect(second.get(externalRowViewKey(SCRATCH, REMOTE_ID))?.status).toBe('ok');
	});
});

describe('isolation between langs and field sets', () => {
	test('two langs never serve each other’s row', async () => {
		const { impl, calls } = countingFetch();
		const target = { sectionTipo: SECTION, remoteId: '000100010', remoteFields: ['title'] };
		await fetchExternalRows([target], { deps: deps(impl), dataLang: 'lg-eng' });
		await fetchExternalRows([target], { deps: deps(impl), dataLang: 'lg-spa' });
		expect(calls.length).toBe(2);
		expect(calls[0]).toContain('lgn=en');
		expect(calls[1]).toContain('lgn=es');
	});

	test('two field sets never serve each other’s row (the v6 hole)', async () => {
		const { impl, calls } = countingFetch();
		await fetchExternalRows(
			[{ sectionTipo: SECTION, remoteId: '000100011', remoteFields: ['id'] }],
			{ deps: deps(impl), dataLang: 'lg-eng' },
		);
		await fetchExternalRows(
			[{ sectionTipo: SECTION, remoteId: '000100011', remoteFields: ['id', 'title'] }],
			{ deps: deps(impl), dataLang: 'lg-eng' },
		);
		expect(calls.length).toBe(2);
	});

	test('the data lang comes from the REQUEST scope, read at call time', async () => {
		const { impl, calls } = countingFetch();
		const target = { sectionTipo: SECTION, remoteId: '000100012', remoteFields: ['id'] };
		await runWithRequestLangs({ applicationLang: 'lg-eng', dataLang: 'lg-deu' }, () =>
			fetchExternalRows([target], { deps: deps(impl) }),
		);
		expect(calls[0]).toContain('lgn=de');
		await runWithRequestLangs({ applicationLang: 'lg-eng', dataLang: 'lg-fra' }, () =>
			fetchExternalRows([target], { deps: deps(impl) }),
		);
		expect(calls[1]).toContain('lgn=fr');
	});
});
