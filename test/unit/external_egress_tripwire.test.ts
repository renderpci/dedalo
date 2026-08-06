/**
 * TRIPWIRE — egress classification, mechanically checked (the
 * agent_egress_tripwire posture, applied to the outbound record subsystem).
 *
 * Every adapter must CLASSIFY what leaves the institution, and the class must
 * be true of the request it actually builds. The class that matters today is
 * `record_identifiers`: only remote record ids, the language code and remote
 * FIELD NAMES may go out. Note what that already discloses — the id set tells
 * the remote service which records this institution holds, and how often they
 * are consulted. It is the smallest honest class, not "nothing".
 *
 * METHOD. Sentinel-driven, not eyeballed: a record is loaded whose CONTENT is a
 * unique sentinel string, and the sentinel is grepped out of every URL, header
 * and body the transport is handed. A future adapter that folds record content
 * into a request (a "find similar" call, a de-duplication probe) fails here
 * unless it declares `record_content` — which is exactly the review this gate
 * exists to force.
 *
 * TWO PATHS, TWO CLASSES (2026-08-06, server-side search). A record request
 * sends ids the installation already holds; a SEARCH request sends free text a
 * cataloguer typed, which is strictly heavier. One `egress` field cannot be
 * honest about both, so an adapter that implements `buildSearchRequest` also
 * declares `searchEgress`, and this gate holds each path to its OWN class:
 *
 *   - a record request is proven to carry no query terms — and, more strongly,
 *     to be UNABLE to: `ExternalRecordRequestContext` has nowhere to put one;
 *   - a search request is proven to carry nothing BEYOND the terms, the lang,
 *     the field names and a closed set of paging/control constants.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { getAlpha2FromCode } from '../../src/core/resolve/lang_names.ts';
import { resetBreakerForOrigin } from '../../src/external/breaker.ts';
import { drainInFlightExternalFetches, fetchExternalRows } from '../../src/external/cache.ts';
import { listExternalServices } from '../../src/external/registry.ts';
import { overrideExternalSettingsForTests } from '../../src/external/settings.ts';
import type { ExternalFetchImpl } from '../../src/external/transport.ts';

const HOST = 'zenon.dainst.org';
const ORIGIN = `https://${HOST}`;
const API_URL = `${ORIGIN}/api/v1/record`;
const SEARCH_URL = `${ORIGIN}/api/v1/search`;
const SECTION = 'test3';

/** Content that exists ONLY inside this installation's records. */
const SENTINEL = 'RECORD-CONTENT-SENTINEL-9f3a2b';

beforeEach(async () => {
	overrideExternalSettingsForTests({
		enabled: true,
		allowedHosts: [HOST],
		retryAttempts: 0,
		softTtlMs: 0, // force a real request on every read, so nothing is cache-hidden
	});
	resetBreakerForOrigin('zenon', ORIGIN);
	await clearOntologyDerivedCaches();
});

afterEach(async () => {
	await drainInFlightExternalFetches();
	overrideExternalSettingsForTests(null);
	resetBreakerForOrigin('zenon', ORIGIN);
});

/** Heaviness order: each class discloses everything the previous one does, plus more. */
const EGRESS_WEIGHT: Readonly<Record<string, number>> = {
	record_identifiers: 0,
	query_terms: 1,
	record_content: 2,
};

describe('every adapter declares an egress class', () => {
	test('the class is one of the three, and nothing defaults', () => {
		const models = listExternalServices();
		expect(models.length).toBeGreaterThan(0);
		for (const model of models) {
			expect(
				['record_identifiers', 'query_terms', 'record_content'],
				`${model.service} must DECLARE its egress`,
			).toContain(model.egress);
		}
	});

	test('an adapter that can SEARCH declares searchEgress, and it is query_terms or heavier', () => {
		for (const model of listExternalServices()) {
			if (model.buildSearchRequest === undefined) {
				// No search path ⇒ no search class to declare. Declaring one anyway
				// would be a promise nothing keeps.
				expect(
					model.searchEgress,
					`${model.service} declares searchEgress but no search`,
				).toBeUndefined();
				continue;
			}
			expect(
				['record_identifiers', 'query_terms', 'record_content'],
				`${model.service} implements search and must DECLARE searchEgress`,
			).toContain(model.searchEgress ?? '<undeclared>');
			expect(
				EGRESS_WEIGHT[model.searchEgress as string] ?? -1,
				`${model.service}: a search sends terms the cataloguer typed — 'record_identifiers' cannot be true of it`,
			).toBeGreaterThanOrEqual(EGRESS_WEIGHT.query_terms as number);
		}
	});
});

describe('a RECORD request cannot send query terms — structurally, not by luck', () => {
	/**
	 * The strongest form of the claim: the record builder is handed a context
	 * type with no `terms` field, so there is nothing to leak. A future edit that
	 * widens `ExternalRecordRequestContext` to carry terms fails here BEFORE any
	 * adapter has a chance to spend them.
	 */
	test('ExternalRecordRequestContext declares no terms/query/search field', async () => {
		const source = await Bun.file(
			`${import.meta.dir}/../../src/external/descriptor_types.ts`,
		).text();
		const start = source.indexOf('export interface ExternalRecordRequestContext');
		expect(start).toBeGreaterThan(-1);
		const body = source.slice(start, source.indexOf('}', start));
		for (const forbidden of ['terms', 'query', 'lookfor', 'search']) {
			expect(
				new RegExp(`readonly\\s+${forbidden}\\b`).test(body),
				`ExternalRecordRequestContext gained a '${forbidden}' field — a record fetch would then be able to send what a cataloguer typed, under the record_identifiers class`,
			).toBe(false);
		}
	});

	test('a term sentinel never appears in a built record request', () => {
		const TERM = 'CATALOGUER-TYPED-SENTINEL-4c81de';
		for (const model of listExternalServices()) {
			const request = model.buildRecordRequest({
				apiUrl: API_URL,
				remoteId: '000848571',
				dataLang: 'lg-deu',
				remoteFields: ['id', 'title'],
			});
			const serialized = `${request.url} ${request.body ?? ''}`;
			expect(serialized, `${model.service} record request leaked a query term`).not.toContain(TERM);
		}
	});
});

describe('a query_terms SEARCH sends the terms, the lang, the field names — and nothing else', () => {
	for (const model of listExternalServices()) {
		if (model.buildSearchRequest === undefined) continue;
		if (model.searchEgress !== 'query_terms') continue;

		test(`${model.service}: every search query value is classified`, () => {
			const remoteFields = ['id', 'title', 'authors'];
			const request = model.buildSearchRequest?.({
				apiUrlSearch: SEARCH_URL,
				terms: ['Ripolles', 'Hispania'],
				dataLang: 'lg-deu',
				remoteFields,
				limit: 20,
				offset: 20,
			});
			expect(request).toBeDefined();
			const url = new URL(request?.url ?? '');
			expect(url.origin + url.pathname).toBe(SEARCH_URL);
			// The CLOSED set of non-term values a search may carry. Anything else —
			// a user id, a project code, a record's own content folded in as a
			// "context" hint — fails here and must declare `record_content`.
			const permitted = new Set([
				'Ripolles Hispania', // the terms, joined
				getAlpha2FromCode('lg-deu') ?? 'en',
				...remoteFields,
				// paging + fixed control constants
				'20',
				'2',
				'false',
				'AllFields',
				'relevance',
			]);
			for (const [, value] of url.searchParams) {
				expect(permitted, `an unclassified value left the installation: ${value}`).toContain(value);
			}
			// A search carries its query in the URL; no body means no second surface
			// to audit. An adapter that needs one must be re-reviewed here.
			expect(request?.body).toBeUndefined();
		});

		test(`${model.service}: this installation's RECORD CONTENT is not folded into a search`, () => {
			// The sentinel discipline of the record path, applied to the search one:
			// the only free text that may leave is what the caller passed as terms.
			const request = model.buildSearchRequest?.({
				apiUrlSearch: SEARCH_URL,
				terms: ['casana'],
				dataLang: 'lg-deu',
				remoteFields: ['id'],
				limit: 20,
				offset: 0,
			});
			expect(`${request?.url} ${request?.body ?? ''}`).not.toContain(SENTINEL);
		});
	}
});

describe('a record_identifiers adapter sends ids, lang and field NAMES — nothing else', () => {
	for (const model of listExternalServices()) {
		if (model.egress !== 'record_identifiers') continue;

		test(`${model.service}: every query value is an id, a lang code or a field name`, () => {
			const remoteFields = ['id', 'title', 'authors'];
			const request = model.buildRecordRequest({
				apiUrl: API_URL,
				remoteId: '000848571',
				dataLang: 'lg-deu',
				remoteFields,
			});
			const url = new URL(request.url);
			expect(url.origin + url.pathname).toBe(API_URL);
			const permitted = new Set([
				'000848571',
				getAlpha2FromCode('lg-deu') ?? 'en',
				...remoteFields,
			]);
			for (const [, value] of url.searchParams) {
				expect(permitted, `an unclassified value left the installation: ${value}`).toContain(value);
			}
			// A record request carries no body at all.
			expect(request.body).toBeUndefined();
		});
	}
});

describe('sentinel control — record content never reaches the wire', () => {
	/**
	 * The fetch stub answers with a row whose values ARE the sentinel, so the
	 * sentinel is genuinely present in this installation's cached record data.
	 * The next request must still not contain it.
	 */
	function sentinelFetch(): { impl: ExternalFetchImpl; sent: string[] } {
		const sent: string[] = [];
		const impl: ExternalFetchImpl = async (url, init) => {
			sent.push(url);
			for (const [name, value] of new Headers(init.headers)) sent.push(`${name}: ${value}`);
			if (typeof init.body === 'string') sent.push(init.body);
			const id = new URL(url).searchParams.get('id') ?? '';
			return new Response(
				JSON.stringify({
					records: [{ id, title: SENTINEL, authors: { primary: { [SENTINEL]: [] } } }],
				}),
				{ status: 200 },
			);
		};
		return { impl, sent };
	}

	test('a second read of a record whose CONTENT is the sentinel never sends it', async () => {
		const { impl, sent } = sentinelFetch();
		const deps = {
			fetchImpl: impl,
			assertPublicUrlImpl: async (uri: string) => ({
				url: new URL(uri),
				addresses: ['141.100.1.1'],
			}),
		};
		const target = { sectionTipo: SECTION, remoteId: '000300001', remoteFields: ['id', 'title'] };
		// First read: the sentinel enters the row cache as record content.
		const first = await fetchExternalRows([target], { deps, dataLang: 'lg-eng' });
		expect(first.get(`${SECTION}|000300001`)?.row?.title).toBe(SENTINEL);
		// Second read (soft TTL 0 ⇒ a real request) plus its background refresh.
		await fetchExternalRows([target], { deps, dataLang: 'lg-eng' });
		await drainInFlightExternalFetches();

		expect(sent.length).toBeGreaterThanOrEqual(2);
		for (const line of sent) {
			expect(line, 'record content reached the wire').not.toContain(SENTINEL);
		}
	});

	test('only the id, the lang and the field names appear across every request made', async () => {
		const { impl, sent } = sentinelFetch();
		const deps = {
			fetchImpl: impl,
			assertPublicUrlImpl: async (uri: string) => ({
				url: new URL(uri),
				addresses: ['141.100.1.1'],
			}),
		};
		await fetchExternalRows(
			[{ sectionTipo: SECTION, remoteId: '000300002', remoteFields: ['id', 'authors'] }],
			{ deps, dataLang: 'lg-spa' },
		);
		await drainInFlightExternalFetches();
		const urls = sent.filter((line) => line.startsWith('http'));
		expect(urls.length).toBeGreaterThan(0);
		for (const url of urls) {
			const permitted = new Set(['000300002', 'es', 'id', 'authors']);
			for (const [, value] of new URL(url).searchParams) expect(permitted).toContain(value);
		}
	});
});
