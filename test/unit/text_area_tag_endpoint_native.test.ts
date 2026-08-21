/**
 * TEXT_AREA TAG ENDPOINT — handleTagRequest (src/core/components/component_text_area/tag_endpoint.ts:124)
 *
 * The endpoint answers the <img src=".../tag/?id=…"> requests the copied client
 * emits for every inline tag. It has exactly two response classes and one
 * fail-closed default, and the whole point of the gate is that ORDER MATTERS:
 * every miss returns the SAME generic 404 by design, so an ACL assertion is
 * vacuous unless the very same locator has first been PROVEN to redirect.
 *
 * Sequence enforced below:
 *   1. authenticated locator → 302 (proves the locator is resolvable at all);
 *   2. the SAME locator with no cookie / a garbage cookie → byte-identical 404
 *      (now a real ACL assertion, not a coincidence);
 *   3. deterministic badges → 200 + ETag/304 revalidation, immutable ONLY for a
 *      version-addressed (`&v=`) url;
 *   4. indistinguishability: every other miss is byte-identical to (2) — the
 *      guard against ADDING a branch that tells "no access" from "absent".
 *
 * No matrix rows are needed: the locator branch resolves a media PATH from the
 * ontology (model + max_items_folder + the section's initial_media_path) and
 * redirects; it never reads the record. The only scratch surface is the session
 * store (already per-run scratch via test/preload/session_db.ts) and the
 * section_id namespace 935000-935999, which appears in a URL only.
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rule: a test uses
// the generic `test` TLD and BUILDS the situation it tests). The tipos below are
// OPAQUE IDENTIFIERS to this gate — it parses and renders them, it never reads a
// record — so the migration is a rename: same grammar, no install in it.

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { handleTagRequest } from '../../src/core/components/component_text_area/tag_endpoint.ts';
import { getModelByTipo } from '../../src/core/ontology/resolver.ts';
import { createSession, SESSION_COOKIE } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

/** The test3 playground's svg component (component_svg, max_items_folder 1000). */
const MEDIA_COMPONENT = 'test177';
/** The section that owns it. */
const SECTION_TIPO = 'test3';
/** Scratch section id namespace for this item (935000-935999). Never written. */
const SECTION_ID = 935001;
/** A real, non-media component model in the same ontology (section_group). */
const NON_MEDIA_TIPO = 'test45';

const ENDPOINT = 'http://localhost/dedalo/core/component_text_area/tag/';

function locatorId(
	overrides: { section_tipo?: string; section_id?: string | number; component_tipo?: string } = {},
): string {
	return JSON.stringify({
		section_tipo: overrides.section_tipo ?? SECTION_TIPO,
		section_id: overrides.section_id ?? String(SECTION_ID),
		component_tipo: overrides.component_tipo ?? MEDIA_COMPONENT,
	});
}

/** Call the endpoint exactly the way server.ts does (same URL object, same request). */
async function callTag(
	id: string | null,
	init: { cookie?: string; ifNoneMatch?: string; version?: string } = {},
): Promise<Response> {
	const url = new URL(ENDPOINT);
	if (id !== null) url.searchParams.set('id', id);
	// The client's renderer fingerprint (`&v=`), when the caller pins one.
	if (init.version !== undefined) url.searchParams.set('v', init.version);
	const headers: Record<string, string> = {};
	if (init.cookie !== undefined) headers.cookie = init.cookie;
	if (init.ifNoneMatch !== undefined) headers['if-none-match'] = init.ifNoneMatch;
	return handleTagRequest(new Request(url, { headers }), url);
}

/**
 * A comparable fingerprint of a miss response. Envelope v2 gives every failure
 * a FRESH `request_id` (a per-request correlation id, not information about the
 * resource) and, under DEDALO_DEBUG_API_ERRORS, a `debug` block carrying the
 * throw site — both are stripped here so what is compared is exactly what a
 * caller could use to tell one miss class from another: status, headers, and
 * the error identity (`ok`/`code`/`category`/`message`/`label_key`/`retryable`).
 */
async function fingerprint(response: Response): Promise<string> {
	const raw = await response.text();
	const body = JSON.parse(raw) as {
		ok: boolean;
		request_id?: string;
		error: Record<string, unknown>;
	};
	const { debug: _debug, ...error } = body.error;
	return JSON.stringify({
		status: response.status,
		contentType: response.headers.get('content-type'),
		cacheControl: response.headers.get('cache-control'),
		location: response.headers.get('location'),
		body: { ok: body.ok, error },
	});
}

let sessionCookie = '';

beforeAll(() => {
	// Synthetic admin session: the locator branch only asks "is there a valid session".
	sessionCookie = `${SESSION_COOKIE}=${createSession(-1, 'root', true)}`;
});

describe('handleTagRequest — 1. locator branch resolves (must run first)', () => {
	test('the fixture component really is a media component', async () => {
		// Loud fixture check: if the ontology ever loses test177 the ACL cases below
		// would go green against a 404 that has nothing to do with authorization.
		expect(await getModelByTipo(MEDIA_COMPONENT)).toBe('component_svg');
		expect(config.media.webBase.length).toBeGreaterThan(0);
	});

	test('authenticated locator → 302 to the media file, private cache', async () => {
		const response = await callTag(locatorId(), { cookie: sessionCookie });

		expect(response.status).toBe(302);
		// Literal expectation, not a re-computation of the production path builder:
		// /svg (folder) + '' (no initial_media_path on test3) + /web (component_svg
		// defaultQuality) + /935000 (additional_path bucket, max_items_folder 1000)
		// + /test177_test3_935001.svg (defaultExtension)
		expect(response.headers.get('Location')).toBe(
			`${config.media.webBase}/svg/web/935000/${MEDIA_COMPONENT}_${SECTION_TIPO}_${SECTION_ID}.svg`,
		);
		expect(response.headers.get('Cache-Control')).toBe('private, max-age=10800');
		expect(await response.text()).toBe('');
	});
});

describe('handleTagRequest — 2. ACL on the SAME, proven-resolvable locator', () => {
	let reference404 = '';

	test('no cookie → 404', async () => {
		const response = await callTag(locatorId());
		expect(response.status).toBe(404);
		expect(response.headers.get('Content-Type')).toBe('application/json');
		const missBody = (await response.clone().json()) as {
			ok: boolean;
			error: { code: string; message: string };
		};
		expect(missBody.ok).toBe(false);
		expect(missBody.error.code).toBe('resource.not_found');
		expect(missBody.error.message).toBe('Not found');
		// No Location, no cache directive: nothing distinguishes it from a miss.
		expect(response.headers.get('Location')).toBeNull();
		expect(response.headers.get('Cache-Control')).toBeNull();
		reference404 = await fingerprint(response);
	});

	test('garbage cookie → byte-identical 404', async () => {
		const garbage = await callTag(locatorId(), {
			cookie: `${SESSION_COOKIE}=not-a-real-token; other=1`,
		});
		expect(await fingerprint(garbage)).toBe(reference404);

		// A cookie header that never names the session cookie at all.
		const unrelated = await callTag(locatorId(), { cookie: 'other=1; another=2' });
		expect(await fingerprint(unrelated)).toBe(reference404);
	});

	test('the same locator still 302s WITH the session (the ACL is the only variable)', async () => {
		const response = await callTag(locatorId(), { cookie: sessionCookie });
		expect(response.status).toBe(302);
	});
});

describe('handleTagRequest — 3. deterministic badges', () => {
	// '[index-n-5]' is the REAL short grammar the client emits; 'in-5' parses as
	// {kind:'invalid'} and would silently exercise the 404 branch instead.
	const BADGE_ID = '[index-n-5]';

	/**
	 * WC-2026-08-11-vector-tag-badges: `immutable` is only true for a
	 * VERSION-ADDRESSED url. A bare `?id=` is not — its bytes moved when the badge
	 * was redrawn — so it must stay revalidatable, or every warm browser keeps the
	 * old drawing for a year and the redraw never reaches the reporter.
	 */
	test('sprite badge → 200 svg, revalidating cache, quoted ETag; no session needed', async () => {
		const response = await callTag(BADGE_ID);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('image/svg+xml; charset=utf-8');
		expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600, must-revalidate');
		const etag = response.headers.get('ETag');
		expect(etag).not.toBeNull();
		// Quoted, per RFC 7232 — an unquoted ETag is silently ignored by caches.
		expect(etag).toMatch(/^"[0-9a-f]+"$/);

		const body = await response.text();
		expect(body.startsWith('<svg')).toBe(true);
		expect(body).toContain('5');
	});

	test('two calls produce the identical ETag (the badge is a pure function of the id)', async () => {
		const first = await callTag(BADGE_ID);
		const second = await callTag(BADGE_ID);
		expect(second.headers.get('ETag')).toBe(first.headers.get('ETag'));
		expect(await second.text()).toBe(await first.text());

		// A different id must NOT collide with it.
		const other = await callTag('[index-n-6]');
		expect(other.headers.get('ETag')).not.toBe(first.headers.get('ETag'));
	});

	test('if-none-match → 304, null body, same ETag + Cache-Control', async () => {
		const first = await callTag(BADGE_ID);
		const etag = first.headers.get('ETag') as string;

		const revalidated = await callTag(BADGE_ID, { ifNoneMatch: etag });
		expect(revalidated.status).toBe(304);
		expect(revalidated.body).toBeNull();
		expect(revalidated.headers.get('ETag')).toBe(etag);
		expect(revalidated.headers.get('Cache-Control')).toBe('public, max-age=3600, must-revalidate');

		// A stale validator must serve the body again, not a 304.
		const stale = await callTag(BADGE_ID, { ifNoneMatch: '"deadbeef"' });
		expect(stale.status).toBe(200);
	});

	/**
	 * The client appends `&v=<renderer fingerprint>` (tr.tag_badge_version), which
	 * makes the URL change whenever the drawing changes — THAT url may be pinned
	 * for a year. The token's value is never interpreted: the badge is still a
	 * pure function of `?id=`, so the bytes and the ETag are unchanged by it.
	 */
	test('version-addressed badge (&v=…) → same bytes, immutable for a year', async () => {
		const bare = await callTag(BADGE_ID);
		const versioned = await callTag(BADGE_ID, { version: 'b948b27e' });

		expect(versioned.status).toBe(200);
		expect(versioned.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
		expect(versioned.headers.get('ETag')).toBe(bare.headers.get('ETag'));
		expect(await versioned.text()).toBe(await bare.text());

		// 304s on the versioned url carry the versioned policy too.
		const etag = versioned.headers.get('ETag') as string;
		const replay = await callTag(BADGE_ID, { version: 'b948b27e', ifNoneMatch: etag });
		expect(replay.status).toBe(304);
		expect(replay.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');

		// An EMPTY token is not a version pin — it must not buy immutability.
		const empty = await callTag(BADGE_ID, { version: '' });
		expect(empty.headers.get('Cache-Control')).toBe('public, max-age=3600, must-revalidate');
	});

	test('draw tag → 200 svg on its own branch', async () => {
		const response = await callTag('[draw-n-7-Sketch]');
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('image/svg+xml; charset=utf-8');
		expect(await response.text()).toContain('Sketch');
	});
});

describe('handleTagRequest — 4. indistinguishability of every miss', () => {
	/**
	 * Every case here must be byte-identical to the authenticated locator miss.
	 * This is a guard against ADDING a distinguishing branch: any future
	 * 'invalid tipo' / 'no such record' / 403 response reddens the whole table.
	 */
	test('all miss classes return the byte-identical 404', async () => {
		const reference = await fingerprint(
			await callTag(locatorId({ component_tipo: NON_MEDIA_TIPO }), { cookie: sessionCookie }),
		);
		// Sanity: the reference itself is the generic 404 (not some other shape).
		expect(JSON.parse(reference).status).toBe(404);
		expect(JSON.parse(reference).body).toEqual({
			ok: false,
			error: {
				code: 'resource.not_found',
				category: 'not_found',
				message: 'Not found',
				label_key: 'error_resource_not_found',
				retryable: false,
			},
		});

		const misses: Array<[string, Promise<Response>]> = [
			['id absent', callTag(null, { cookie: sessionCookie })],
			['id empty', callTag('', { cookie: sessionCookie })],
			['unparseable id', callTag('in-5', { cookie: sessionCookie })],
			['plain text id', callTag('hello world', { cookie: sessionCookie })],
			['truncated json', callTag('{"section_tipo":"test3"', { cookie: sessionCookie })],
			[
				'sql-ish section tipo',
				callTag(locatorId({ section_tipo: 'test3; DROP' }), { cookie: sessionCookie }),
			],
			[
				'sql-ish component tipo',
				callTag(locatorId({ component_tipo: 'test3; DROP' }), { cookie: sessionCookie }),
			],
			[
				'empty component tipo',
				callTag(locatorId({ component_tipo: '' }), { cookie: sessionCookie }),
			],
			['section_id 0', callTag(locatorId({ section_id: '0' }), { cookie: sessionCookie })],
			['section_id -3', callTag(locatorId({ section_id: '-3' }), { cookie: sessionCookie })],
			[
				'section_id non numeric',
				callTag(locatorId({ section_id: 'abc' }), { cookie: sessionCookie }),
			],
			[
				'section_id fractional',
				callTag(locatorId({ section_id: '1.5' }), { cookie: sessionCookie }),
			],
			[
				'unknown component tipo',
				callTag(locatorId({ component_tipo: 'test999999' }), { cookie: sessionCookie }),
			],
			['non-media model, no session', callTag(locatorId({ component_tipo: NON_MEDIA_TIPO }))],
		];

		for (const [label, pending] of misses) {
			const actual = await fingerprint(await pending);
			expect(`${label}: ${actual}`).toBe(`${label}: ${reference}`);
		}
	});
});
