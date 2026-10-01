/**
 * R2 gate: tool_import_rdf. The RDF/XML parser and the class-map are covered by
 * rdf_xml.test.ts / rdf_map.test.ts; this file gates the TOOL — its action
 * surface, the argument validation, and how it dereferences an IRI through the
 * harvesting door (`harvestFetch`): content negotiation, the redirects a
 * linked-data server answers with, the `.rdf` fallback, robots.txt, and what it
 * reports per URI when the door or the SSRF guard refuses (SEC-072). The door
 * itself is gated in harvest_door_native.test.ts, the guard in ssrf_guard.test.ts
 * and ssrf_one_guard_tripwire.test.ts.
 *
 * Network-free by construction: a refused URI never reaches fetch(), and every
 * other case runs against a scripted site through the door's `hop` seam (or the
 * guard's resolver + socket seam), so every assertion runs credless and offline.
 */
// Migrated to the generic `test` TLD 2026-08-19: the sectionTipos extractor is pure, so
// its ontology tipo and locator are opaque — they now name generic `test` nodes.

import { beforeEach, describe, expect, test } from 'bun:test';
import { DedaloError, toErrorBody } from '../../src/core/errors/index.ts';
import type { HarvestDeps } from '../../src/core/harvest/harvest.ts';
import { clearPacingForTests } from '../../src/core/harvest/pacing.ts';
import { clearRobotsCache } from '../../src/core/harvest/robots.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import type {
	AddressLookup,
	PinnedHopRequest,
	PinnedHopResponse,
} from '../../src/core/security/ssrf_guard.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import {
	loadRdf,
	loadRdfBatch,
	RDF_MAX_URIS,
	type RdfOutcome,
	rdfFileUrl,
} from '../../tools/tool_import_rdf/server/index.ts';
import { mustGet } from '../helpers/assert.ts';
import { refusalOf } from '../helpers/refusal.ts';

/**
 * A wire body without its `debug` block — what a production install sends. The
 * block is the operator's own disclosure ladder (DEDALO_DEBUG_API_ERRORS / dev
 * mode, ERRORS_SPEC), present when this suite runs in dev mode.
 */
function publicPart(body: object | undefined): object {
	const { debug: _debug, ...rest } = (body ?? {}) as Record<string, unknown>;
	return rest;
}

describe('tool_import_rdf module', () => {
	test('loads with get_rdf_data only, gated at READ level, not backgroundRunnable', async () => {
		const loaded = await getLoadedTool('tool_import_rdf');
		expect(loaded).not.toBeNull();
		const actions = loaded!.module.apiActions;
		expect(Object.keys(actions)).toEqual(['get_rdf_data']);
		const spec = mustGet(actions.get_rdf_data, 'get_rdf_data');
		// PHP gates WRITE (level 2) on the LOCATOR's section, and the client sends
		// the target ONLY inside options.locator — so the gate must read the
		// payload, not options.section_tipo.
		expect(spec.permission).toBe('section_list');
		expect(spec.minLevel).toBe(2);
		// Nothing forks: the fetch answers the request that made it.
		expect(loaded!.module.backgroundRunnable).toBeUndefined();
	});

	test('the gate reads the target out of options.locator (the wire the client posts)', async () => {
		const loaded = await getLoadedTool('tool_import_rdf');
		const spec = mustGet(loaded!.module.apiActions.get_rdf_data, 'get_rdf_data');
		// The EXACT options tool_import_rdf.js get_rdf_data (:218-227) posts — note
		// there is NO top-level section_tipo. Reading one gave an empty target and
		// a fail-closed denial, i.e. the action was unreachable from the UI.
		expect(
			spec.sectionTipos?.({
				// ontology_tipo is opaque to the extractor (only `locator` is read).
				ontology_tipo: 'test6',
				ar_values: ['http://viaf.org/viaf/1'],
				locator: { section_tipo: 'test3', section_id: 1 },
			}),
		).toEqual(['test3']);
		// No locator → no target → the 'section_list' gate denies (fail-closed).
		expect(spec.sectionTipos?.({ ar_values: [] })).toEqual([]);
	});

	test('an empty ar_values is refused before any fetch', async () => {
		const loaded = await getLoadedTool('tool_import_rdf');
		const refusal = await refusalOf(
			mustGet(loaded!.module.apiActions.get_rdf_data, 'get_rdf_data').handler({
				principal: await resolvePrincipal(-1),
				userId: -1,
				background: false,
				options: { ar_values: [] },
			}),
		);
		expect(refusal.code).toBe('request.invalid_options');
		expect(refusal.publicMessage).toContain('Missing ar_values');
	});

	test('an unsafe URI is reported per-value, never dereferenced', async () => {
		const loaded = await getLoadedTool('tool_import_rdf');
		const res = await mustGet(loaded!.module.apiActions.get_rdf_data, 'get_rdf_data').handler({
			principal: await resolvePrincipal(-1),
			userId: -1,
			background: false,
			// No `locator` → no section gate inside the handler; the dispatcher's
			// declarative 'section' gate is what protects the real wire.
			options: { ar_values: ['http://169.254.169.254/latest/meta-data'] },
		});
		const data = res.data as {
			rdf: unknown[];
			errors: { uri: string; error: { code: string; retryable: boolean } }[];
		};
		expect(data.rdf).toEqual([]);
		// The per-URI refusals are PAYLOAD (`data.errors`), never the envelope's
		// failure channel — each one the error system's wire body, never the guard's
		// `Error.message`, which names the address a refused host resolved to.
		expect(data.errors).toHaveLength(1);
		expect(data.errors[0]?.uri).toBe('http://169.254.169.254/latest/meta-data');
		expect(data.errors[0]?.error.code).toBe('security.ssrf_blocked');
		const wire = JSON.stringify(publicPart(data.errors[0]?.error));
		expect(wire).not.toContain('169.254');
		expect(wire).not.toContain('ssrf:');
	});

	test('a NAME that resolves inward is reported without the address it resolved to', async () => {
		const loaded = await getLoadedTool('tool_import_rdf');
		const res = await mustGet(loaded!.module.apiActions.get_rdf_data, 'get_rdf_data').handler({
			principal: await resolvePrincipal(-1),
			userId: -1,
			background: false,
			options: { ar_values: ['http://localhost/vocab/term'] },
		});
		const data = res.data as { errors: { uri: string; error: { code: string } }[] };
		expect(data.errors[0]?.error.code).toBe('security.ssrf_blocked');
		const wire = JSON.stringify(publicPart(data.errors[0]?.error));
		for (const address of ['127.0.0.1', '::1']) expect(wire).not.toContain(address);
	});
});

beforeEach(() => {
	// The door remembers robots verdicts and per-site turns process-wide.
	clearRobotsCache();
	clearPacingForTests();
});

/**
 * THE DOOR'S OWN WIRE on a transport failure (WC-2026-09-30-guarded-text-pinned-typed-transport):
 * the per-URI `error` is the registry body of `security.outbound_failed` — category
 * `unavailable`, retryable, the registry's fixed sentence — never `internal.unexpected`
 * and never a host, an address or Bun's own text. Built through the guard's seam (a
 * public answer for the name, a socket that fails), so it runs offline.
 */
describe('tool_import_rdf: a transport failure is published as the typed registry body', () => {
	const PUBLIC: AddressLookup = async () => [{ address: '93.184.216.34', family: 4 }];
	/** No robots.txt: everything allowed (RFC 9309 §2.3.1.3). */
	const NO_ROBOTS = (): Response => new Response(null, { status: 404 });

	function failureOf(outcome: RdfOutcome): {
		code: string;
		category: string;
		retryable: boolean;
		message: string;
	} {
		expect(outcome.kind).toBe('failed');
		if (outcome.kind !== 'failed') throw new Error('loaded');
		return outcome.failure.error as unknown as ReturnType<typeof failureOf>;
	}

	test('a refused connection: security.outbound_failed, unavailable, retryable, no host or runtime text', async () => {
		const asked: string[] = [];
		const outcome = await loadRdf('https://vocab.example.test/term/1', [], {
			pinned: {
				lookup: PUBLIC,
				fetch: async (url) => {
					asked.push(url);
					if (url.endsWith('/robots.txt')) return NO_ROBOTS();
					throw Object.assign(
						new TypeError('Unable to connect. Is the computer able to access the url?'),
						{ code: 'ConnectionRefused' },
					);
				},
			},
		});
		const body = failureOf(outcome);
		expect(outcome.kind === 'failed' && outcome.failure.uri).toBe(
			'https://vocab.example.test/term/1',
		);
		expect(body.code).toBe('security.outbound_failed');
		expect(body.category).toBe('unavailable');
		expect(body.retryable).toBe(true);
		expect(body.message).toBe('The outbound request could not be completed');
		// A transport failure is final: no `.rdf` retry against the same dead host.
		// (The pinned socket is handed the VETTED address, not the name.)
		expect(asked).toEqual(['https://93.184.216.34/robots.txt', 'https://93.184.216.34/term/1']);
		const wire = JSON.stringify(publicPart(body));
		for (const leak of ['vocab.example.test', '93.184.216.34', 'Unable to connect', 'hop connect'])
			expect(wire, leak).not.toContain(leak);
	});

	test('a redirect inward is FOLLOWED, its target refused by address, and not retried at `.rdf`', async () => {
		// The address refusal surfaces from the target origin's robots.txt read (the
		// first thing the door does for a new origin); that the document hop itself
		// is vetted is the door's own property, gated in harvest_door_native.
		const asked: string[] = [];
		const outcome = await loadRdf('https://vocab.example.test/term/2', [], {
			pinned: {
				lookup: PUBLIC,
				fetch: async (url) => {
					asked.push(url);
					if (url.endsWith('/robots.txt')) return NO_ROBOTS();
					return new Response(null, { status: 303, headers: { location: 'https://127.0.0.1/' } });
				},
			},
		});
		expect(failureOf(outcome).code).toBe('security.ssrf_blocked');
		// Followed (a refused redirect would be outbound_failed), the inward target
		// never connected to (its robots.txt included), and no `.rdf` retry.
		expect(asked).toEqual(['https://93.184.216.34/robots.txt', 'https://93.184.216.34/term/2']);
		expect(JSON.stringify(publicPart(failureOf(outcome)))).not.toContain('127.0.0.1');
	});
});

// ---------------------------------------------------------------------------
// The harvesting door, driven through its `hop` seam: a scripted linked-data
// site, no network, no wall clock.
// ---------------------------------------------------------------------------

interface Scripted {
	status: number;
	/** Thrown by the hop instead of answering (a network failure). */
	error?: unknown;
	contentType?: string;
	location?: string;
	body?: string;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** One scripted answer, shaped as the pinned primitive would return it. */
function answer(request: PinnedHopRequest, scripted: Scripted): PinnedHopResponse {
	const headers = new Headers();
	if (scripted.contentType !== undefined) headers.set('content-type', scripted.contentType);
	const location = REDIRECTS.has(scripted.status) ? (scripted.location ?? null) : null;
	const base = { status: scripted.status, headers, location, truncated: false };
	if (location !== null || request.acceptBody?.(scripted.status, headers) === false) {
		return { ...base, bytes: new Uint8Array(0), bodySkipped: true };
	}
	return { ...base, bytes: new TextEncoder().encode(scripted.body ?? ''), bodySkipped: false };
}

interface LinkedDataSite {
	deps: HarvestDeps;
	/** Every request the door sent, in order. */
	sent: PinnedHopRequest[];
}

/** The URL as it goes on the wire: a fragment is never sent. */
function wireUrl(request: PinnedHopRequest): string {
	const url = new URL(request.url);
	url.hash = '';
	return url.toString();
}

/** A site answering by URL (404 for anything unscripted), with a fake clock. */
function linkedDataSite(routes: Record<string, Scripted>): LinkedDataSite {
	const sent: PinnedHopRequest[] = [];
	let now = 1_000_000;
	const deps: HarvestDeps = {
		hop: async (request) => {
			sent.push(request);
			const scripted = routes[wireUrl(request)] ?? { status: 404 };
			if (scripted.error !== undefined) throw scripted.error;
			return answer(request, scripted);
		},
		now: () => now,
		sleep: async (ms) => {
			now += ms;
		},
		setTimer: () => undefined,
	};
	return { deps, sent };
}

/** The non-robots URLs the door asked for, in order. */
function documentsAsked(site: LinkedDataSite): string[] {
	return site.sent.map(wireUrl).filter((url) => !url.endsWith('/robots.txt'));
}

const RDF_DOC = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:skos="http://www.w3.org/2004/02/skos/core#">
  <skos:Concept rdf:about="http://ld.test/id/rome">
    <skos:prefLabel xml:lang="en">Rome</skos:prefLabel>
  </skos:Concept>
</rdf:RDF>`;

const RDF_OK: Scripted = { status: 200, contentType: 'application/rdf+xml', body: RDF_DOC };
const HTML_OK: Scripted = { status: 200, contentType: 'text/html; charset=utf-8', body: '<html/>' };

/** The subjects of a loaded outcome (fails the test on a failure). */
function subjectsOf(outcome: RdfOutcome): unknown[] {
	if (outcome.kind !== 'loaded') {
		throw new Error(`expected loaded, got ${JSON.stringify(outcome.failure.error)}`);
	}
	return outcome.entry.subjects;
}

/** The code of a failed outcome (fails the test when it loaded). */
function codeOf(outcome: RdfOutcome): string {
	if (outcome.kind !== 'failed') throw new Error('expected a failure, it loaded');
	return outcome.failure.error.code;
}

/** The parsed subject of RDF_DOC, as the parser names it. */
function aboutRome(subjects: unknown[]): boolean {
	return JSON.stringify(subjects).includes('http://ld.test/id/rome');
}

describe('tool_import_rdf: dereferencing an IRI through the harvesting door', () => {
	test('content negotiation: the IRI itself answers RDF/XML — asked once, with an RDF Accept', async () => {
		const site = linkedDataSite({ 'https://ld.test/id/rome': RDF_OK });
		const outcome = await loadRdf('https://ld.test/id/rome', [], site.deps);
		expect(aboutRome(subjectsOf(outcome))).toBe(true);
		expect(outcome.kind === 'loaded' && outcome.entry.uri).toBe('https://ld.test/id/rome');
		expect(documentsAsked(site)).toEqual(['https://ld.test/id/rome']);
		const accept = site.sent.find((r) => r.url.pathname === '/id/rome')?.headers.get('accept');
		expect(accept).toBe('application/rdf+xml, application/xml;q=0.9, text/xml;q=0.8');
	});

	test('a 303 See Other is followed to the document', async () => {
		const site = linkedDataSite({
			'https://ld.test/id/rome': { status: 303, location: 'https://ld.test/data/rome.rdf' },
			'https://ld.test/data/rome.rdf': RDF_OK,
		});
		const outcome = await loadRdf('https://ld.test/id/rome', [], site.deps);
		expect(aboutRome(subjectsOf(outcome))).toBe(true);
		// The IRI the cataloguer selected names the entry, not the URL that answered.
		expect(outcome.kind === 'loaded' && outcome.entry.uri).toBe('https://ld.test/id/rome');
		expect(documentsAsked(site)).toEqual([
			'https://ld.test/id/rome',
			'https://ld.test/data/rome.rdf',
		]);
	});

	test('a 301 from http to https is followed', async () => {
		const site = linkedDataSite({
			'http://ld.test/id/rome': { status: 301, location: 'https://ld.test/id/rome' },
			'https://ld.test/id/rome': RDF_OK,
		});
		const outcome = await loadRdf('http://ld.test/id/rome', [], site.deps);
		expect(aboutRome(subjectsOf(outcome))).toBe(true);
		expect(documentsAsked(site)).toEqual(['http://ld.test/id/rome', 'https://ld.test/id/rome']);
	});

	test('the `.rdf` fallback: an IRI that answers HTML is retried once at `<iri>.rdf`', async () => {
		const site = linkedDataSite({
			'https://ld.test/id/rome': HTML_OK,
			'https://ld.test/id/rome.rdf': RDF_OK,
		});
		expect(aboutRome(subjectsOf(await loadRdf('https://ld.test/id/rome', [], site.deps)))).toBe(
			true,
		);
		expect(documentsAsked(site)).toEqual([
			'https://ld.test/id/rome',
			'https://ld.test/id/rome.rdf',
		]);
	});

	test('both attempts: the RDF Accept, a bounded hop, the body ceiling', async () => {
		const site = linkedDataSite({ 'https://ld.test/id/rome': HTML_OK });
		await loadRdf('https://ld.test/id/rome', [], site.deps);
		const documents = site.sent.filter((r) => r.url.pathname !== '/robots.txt');
		expect(documents).toHaveLength(2);
		for (const request of documents) {
			expect(request.headers.get('accept')).toBe(
				'application/rdf+xml, application/xml;q=0.9, text/xml;q=0.8',
			);
			// Bounded well inside the client's 60 s wait (the door's default is 120 s).
			expect(request.timeoutMs).toBe(15_000);
			// The door's 30 s idle default, clamped to the total.
			expect(request.idleTimeoutMs).toBe(15_000);
			expect(request.maxBytes).toBe(20 * 1024 * 1024);
		}
	});

	test('a fragment IRI: the fallback asks the document’s file form (the drop itself: rdfFileUrl test)', async () => {
		const site = linkedDataSite({
			'https://ld.test/vocab': HTML_OK,
			'https://ld.test/vocab.rdf': RDF_OK,
		});
		subjectsOf(await loadRdf('https://ld.test/vocab#Rome', [], site.deps));
		expect(documentsAsked(site)).toEqual(['https://ld.test/vocab', 'https://ld.test/vocab.rdf']);
	});

	test('the reported failure: a wrong media type wins, else the IRI’s own status', async () => {
		// IRI answers a web page, the guessed `.rdf` is 404: the page is the news.
		const htmlThen404 = linkedDataSite({ 'https://ld.test/id/rome': HTML_OK });
		expect(codeOf(await loadRdf('https://ld.test/id/rome', [], htmlThen404.deps))).toBe(
			'harvest.unexpected_type',
		);
		const notFoundThenHtml = linkedDataSite({ 'https://ld.test/id/rome.rdf': HTML_OK });
		expect(codeOf(await loadRdf('https://ld.test/id/rome', [], notFoundThenHtml.deps))).toBe(
			'harvest.unexpected_type',
		);
		clearRobotsCache();
		const bothMissing = linkedDataSite({});
		expect(codeOf(await loadRdf('https://ld.test/id/rome', [], bothMissing.deps))).toBe(
			'security.outbound_failed',
		);
	});

	test('a door refusal is final even when the `.rdf` form would load', async () => {
		// https → http is refused (`downgrade`); the file form is scripted to load.
		const site = linkedDataSite({
			'https://ld.test/id/rome': { status: 303, location: 'http://ld.test/data/rome' },
			'https://ld.test/id/rome.rdf': RDF_OK,
		});
		expect(codeOf(await loadRdf('https://ld.test/id/rome', [], site.deps))).toBe('harvest.refused');
		expect(documentsAsked(site)).toEqual(['https://ld.test/id/rome']);
	});

	test('every accepted media type, per attempt', async () => {
		const negotiated = ['application/rdf+xml', 'application/xml; charset=utf-8', 'text/xml'];
		for (const contentType of negotiated) {
			clearRobotsCache();
			const site = linkedDataSite({ 'https://ld.test/id/rome': { ...RDF_OK, contentType } });
			subjectsOf(await loadRdf('https://ld.test/id/rome', [], site.deps));
			expect(documentsAsked(site), contentType).toEqual(['https://ld.test/id/rome']);
		}
		for (const contentType of [...negotiated, 'application/octet-stream', 'text/plain']) {
			clearRobotsCache();
			const site = linkedDataSite({ 'https://ld.test/id/rome.rdf': { ...RDF_OK, contentType } });
			subjectsOf(await loadRdf('https://ld.test/id/rome', [], site.deps));
		}
		// Bytes or text are the FILE form's allowance only: the IRI itself must negotiate.
		for (const contentType of ['application/octet-stream', 'text/plain']) {
			clearRobotsCache();
			const site = linkedDataSite({
				'https://ld.test/id/rome': { ...RDF_OK, contentType },
				'https://ld.test/id/rome.rdf': RDF_OK,
			});
			subjectsOf(await loadRdf('https://ld.test/id/rome', [], site.deps));
			expect(documentsAsked(site), contentType).toEqual([
				'https://ld.test/id/rome',
				'https://ld.test/id/rome.rdf',
			]);
		}
	});

	test('the `.rdf` fallback: a non-2xx answer is retried too, and the file may be served as bytes', async () => {
		const site = linkedDataSite({
			'https://ld.test/id/rome.rdf': { ...RDF_OK, contentType: 'application/octet-stream' },
		});
		expect(aboutRome(subjectsOf(await loadRdf('https://ld.test/id/rome', [], site.deps)))).toBe(
			true,
		);
		expect(documentsAsked(site)).toEqual([
			'https://ld.test/id/rome',
			'https://ld.test/id/rome.rdf',
		]);
	});

	test('no double suffix: an IRI already naming a `.rdf` file is asked once', async () => {
		const site = linkedDataSite({});
		const outcome = await loadRdf('https://ld.test/id/rome.rdf', [], site.deps);
		expect(codeOf(outcome)).toBe('security.outbound_failed');
		expect(documentsAsked(site)).toEqual(['https://ld.test/id/rome.rdf']);
	});

	test('the `.rdf` form drops the fragment and keeps the query', () => {
		expect(rdfFileUrl('https://ld.test/vocab#Rome')).toBe('https://ld.test/vocab.rdf');
		expect(rdfFileUrl('https://ld.test/id/rome?lang=en')).toBe(
			'https://ld.test/id/rome.rdf?lang=en',
		);
		expect(rdfFileUrl('https://ld.test/id/rome.rdf')).toBeNull();
		expect(rdfFileUrl('https://ld.test/id/rome/')).toBe('https://ld.test/id/rome.rdf');
		expect(rdfFileUrl('https://ld.test/id/rome//')).toBe('https://ld.test/id/rome.rdf');
		expect(rdfFileUrl('https://ld.test/')).toBeNull();
		expect(rdfFileUrl('https://ld.test//')).toBeNull();
		expect(rdfFileUrl('https://ld.test')).toBeNull();
		// Any case already names the file.
		expect(rdfFileUrl('https://ld.test/id/ROME.RDF')).toBeNull();
		// No file form outside the web: the IRI itself is refused by the door.
		expect(rdfFileUrl('urn:isbn:1')).toBeNull();
		expect(rdfFileUrl('mailto:a@ld.test')).toBeNull();
		expect(rdfFileUrl('file:///etc/passwd')).toBeNull();
		expect(rdfFileUrl('not a url')).toBeNull();
	});

	test('an HTML 200 is refused (harvest.unexpected_type), the fallback included', async () => {
		const site = linkedDataSite({
			'https://ld.test/id/rome': HTML_OK,
			'https://ld.test/id/rome.rdf': HTML_OK,
		});
		const outcome = await loadRdf('https://ld.test/id/rome', [], site.deps);
		expect(codeOf(outcome)).toBe('harvest.unexpected_type');
		// The page body was never read: the door refuses before the body.
		expect(documentsAsked(site)).toEqual([
			'https://ld.test/id/rome',
			'https://ld.test/id/rome.rdf',
		]);
	});

	test('robots.txt disallow is reported per URI, and not retried at `.rdf`', async () => {
		// The rule disallows the IRI only (`$`), so the `.rdf` form WOULD be allowed
		// and would load: a refusal is final, never a reason to try the other form.
		const site = linkedDataSite({
			'https://ld.test/robots.txt': {
				status: 200,
				contentType: 'text/plain',
				body: 'User-agent: *\nDisallow: /id/rome$',
			},
			'https://ld.test/id/rome': RDF_OK,
			'https://ld.test/id/rome.rdf': RDF_OK,
		});
		const outcome = await loadRdf('https://ld.test/id/rome', [], site.deps);
		expect(codeOf(outcome)).toBe('harvest.robots_disallowed');
		expect(outcome.kind === 'failed' && outcome.failure.error.details).toEqual({
			site: 'https://ld.test',
		});
		expect(documentsAsked(site)).toEqual([]);
	});

	test('a network failure between two good IRIs: the batch goes on, in order', async () => {
		const site = linkedDataSite({
			'https://a.test/id/1': RDF_OK,
			'https://down.test/id/2': {
				status: 0,
				error: new DedaloError('security.outbound_failed', { message: 'connect refused' }),
			},
			'https://c.test/id/3': RDF_OK,
		});
		const batch = await loadRdfBatch(
			['https://a.test/id/1', 'https://down.test/id/2', 'https://c.test/id/3'],
			[],
			site.deps,
		);
		expect(batch.rdf.map((entry) => entry.uri)).toEqual([
			'https://a.test/id/1',
			'https://c.test/id/3',
		]);
		expect(batch.errors.map((entry) => [entry.uri, entry.error.code])).toEqual([
			['https://down.test/id/2', 'security.outbound_failed'],
		]);
	});

	test('one bad URI never fails the batch', async () => {
		const site = linkedDataSite({ 'https://ld.test/id/rome': RDF_OK });
		const batch = await loadRdfBatch(['not a url', 'https://ld.test/id/rome'], [], site.deps);
		expect(batch.rdf.map((entry) => entry.uri)).toEqual(['https://ld.test/id/rome']);
		expect(batch.errors.map((entry) => [entry.uri, entry.error.code])).toEqual([
			['not a url', 'harvest.refused'],
		]);
	});
});

/** Run `body` with the operator's debug ladder on (status coordinates on the wire). */
async function withDebugErrors<T>(body: () => Promise<T>): Promise<T> {
	const previous = process.env.DEDALO_DEBUG_API_ERRORS;
	process.env.DEDALO_DEBUG_API_ERRORS = 'true';
	try {
		return await body();
	} finally {
		if (previous === undefined) Reflect.deleteProperty(process.env, 'DEDALO_DEBUG_API_ERRORS');
		else process.env.DEDALO_DEBUG_API_ERRORS = previous;
	}
}

/** The log-only HTTP status a failed outcome carries (debug ladder on). */
function statusOf(outcome: RdfOutcome): unknown {
	if (outcome.kind !== 'failed') throw new Error('expected a failure, it loaded');
	const debug = (outcome.failure.error as { debug?: { coordinates?: { status?: unknown } } }).debug;
	return debug?.coordinates?.status;
}

describe('tool_import_rdf: which failures end the attempt, and which one is told', () => {
	test('between two error statuses the IRI’s own is told (410 over the guess’s 404)', async () => {
		const site = linkedDataSite({ 'https://ld.test/id/rome': { status: 410 } });
		const outcome = await withDebugErrors(() => loadRdf('https://ld.test/id/rome', [], site.deps));
		expect(codeOf(outcome)).toBe('security.outbound_failed');
		expect(statusOf(outcome)).toBe(410);
		expect(documentsAsked(site)).toEqual([
			'https://ld.test/id/rome',
			'https://ld.test/id/rome.rdf',
		]);
	});

	test('two wrong media types: the IRI’s own is told, not the guess’s', async () => {
		const site = linkedDataSite({
			'https://ld.test/id/rome': { status: 200, contentType: 'text/turtle', body: '@prefix' },
			'https://ld.test/id/rome.rdf': HTML_OK,
		});
		const outcome = await loadRdf('https://ld.test/id/rome', [], site.deps);
		expect(codeOf(outcome)).toBe('harvest.unexpected_type');
		expect(outcome.kind === 'failed' && outcome.failure.error.details?.content_type).toBe(
			'text/turtle',
		);
	});

	test('a refusal of the GUESSED address never replaces the IRI’s own answer', async () => {
		// robots.txt disallows only the `.rdf` form; the IRI answered a web page.
		const site = linkedDataSite({
			'https://ld.test/robots.txt': {
				status: 200,
				contentType: 'text/plain',
				body: 'User-agent: *\nDisallow: /id/rome.rdf',
			},
			'https://ld.test/id/rome': HTML_OK,
		});
		const outcome = await loadRdf('https://ld.test/id/rome', [], site.deps);
		expect(codeOf(outcome)).toBe('harvest.unexpected_type');
		expect(documentsAsked(site)).toEqual(['https://ld.test/id/rome']);
	});

	for (const status of [408, 429, 500, 503]) {
		test(`a ${status} says the SITE is unwell or busy: told, never retried at \`.rdf\``, async () => {
			const site = linkedDataSite({
				'https://ld.test/id/rome': { status },
				'https://ld.test/id/rome.rdf': RDF_OK,
			});
			const outcome = await withDebugErrors(() =>
				loadRdf('https://ld.test/id/rome', [], site.deps),
			);
			expect(codeOf(outcome)).toBe('security.outbound_failed');
			expect(statusOf(outcome)).toBe(status);
			expect(documentsAsked(site)).toEqual(['https://ld.test/id/rome']);
		});
	}

	test('a body over the ceiling is harvest.too_large, and not retried', async () => {
		const site = linkedDataSite({
			'https://ld.test/id/rome': {
				status: 0,
				error: new DedaloError('security.outbound_failed', {
					coordinates: { reason: 'body_cap', max_bytes: 20 * 1024 * 1024 },
				}),
			},
			'https://ld.test/id/rome.rdf': RDF_OK,
		});
		const outcome = await loadRdf('https://ld.test/id/rome', [], site.deps);
		expect(codeOf(outcome)).toBe('harvest.too_large');
		expect(outcome.kind === 'failed' && outcome.failure.error.details?.max_bytes).toBe(
			20 * 1024 * 1024,
		);
		expect(documentsAsked(site)).toEqual(['https://ld.test/id/rome']);
	});

	test('an unreadable robots.txt is harvest.robots_unavailable: nothing is fetched', async () => {
		const site = linkedDataSite({
			'https://ld.test/robots.txt': { status: 500 },
			'https://ld.test/id/rome': RDF_OK,
			'https://ld.test/id/rome.rdf': RDF_OK,
		});
		const outcome = await loadRdf('https://ld.test/id/rome', [], site.deps);
		expect(codeOf(outcome)).toBe('harvest.robots_unavailable');
		expect(documentsAsked(site)).toEqual([]);
	});

	test('any public host is reachable (hosts: public, not an allowlist)', async () => {
		const site = linkedDataSite({ 'https://viaf.org/viaf/1': RDF_OK });
		subjectsOf(await loadRdf('https://viaf.org/viaf/1', [], site.deps));
	});

	test('a class-map is applied to the parsed subjects', async () => {
		const site = linkedDataSite({ 'https://ld.test/id/rome': RDF_OK });
		const outcome = await loadRdf(
			'https://ld.test/id/rome',
			[{ predicate: 'skos:prefLabel', component_tipo: 'test52' }],
			site.deps,
		);
		expect(subjectsOf(outcome)).toEqual([
			{ sectionId: null, fields: [{ component_tipo: 'test52', values: ['Rome'] }] },
		]);
	});
});

describe('tool_import_rdf: the per-call cap', () => {
	async function call(values: unknown[]) {
		const loaded = await getLoadedTool('tool_import_rdf');
		return mustGet(loaded!.module.apiActions.get_rdf_data, 'get_rdf_data').handler({
			principal: await resolvePrincipal(-1),
			userId: -1,
			background: false,
			options: { ar_values: values },
		});
	}

	test(`more than ${RDF_MAX_URIS} IRIs is refused with a public typed error`, async () => {
		// Addresses the guard refuses without a lookup, so nothing leaves this machine
		// whatever the order. That the cap runs BEFORE the fetch is the handler's
		// order (rdfValues, then loadRdfBatch); this test does not observe it.
		const values = Array.from({ length: RDF_MAX_URIS + 1 }, (_, i) => `http://127.0.0.${i + 1}/id`);
		const refusal = await refusalOf(call(values));
		expect(refusal.code).toBe('tool.too_many_items');
		expect(refusal.details).toEqual({ count: RDF_MAX_URIS + 1, limit: RDF_MAX_URIS });
		// Public on the wire: the counts reach the cataloguer's label.
		const body = toErrorBody(refusal);
		expect(body.category).toBe('caller');
		expect(body.label_key).toBe('error_tool_too_many_items');
		expect(body.details).toEqual({ count: RDF_MAX_URIS + 1, limit: RDF_MAX_URIS });
	});

	test('ar_values must be a list of strings', async () => {
		for (const ar_values of [
			'https://ld.test/id/rome',
			'x',
			[42],
			['https://ld.test/id/1', null],
		]) {
			const refusal = await refusalOf(call(ar_values as unknown[]));
			expect(refusal.code, JSON.stringify(ar_values)).toBe('request.invalid_options');
		}
	});

	test(`exactly ${RDF_MAX_URIS} IRIs pass the cap`, async () => {
		// Unparseable text: refused per URI by the door, offline.
		const res = await call(Array.from({ length: RDF_MAX_URIS }, (_, i) => `not a url ${i}`));
		const data = res.data as { errors: { error: { code: string } }[] };
		expect(data.errors.map((entry) => entry.error.code)).toEqual(
			Array(RDF_MAX_URIS).fill('harvest.refused'),
		);
	});
});
