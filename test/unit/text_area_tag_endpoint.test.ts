/**
 * component_text_area tag ENDPOINT gate — drives the real route through
 * handleRequest (no socket), covering the response contract:
 *   - deterministic badge → 200 image/svg+xml, revalidating cache (immutable only
 *     for the client's version-addressed `&v=` url), ETag, 304 replay;
 *   - malformed id → fail-closed 404;
 *   - locator tag without a session → fail-closed 404 (no existence leak).
 */
// BINDS INSTALL TLDs: rsc — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { describe, expect, test } from 'bun:test';
import { handleRequest } from '../../src/server.ts';

const context = { requestId: 'test', startedAt: 0 };

/**
 * Build a GET request for the tag endpoint with a properly-encoded id, optionally
 * carrying the client's renderer fingerprint (`&v=`, tr.tag_badge_version).
 */
function tagRequest(id: string, headers?: Record<string, string>, version?: string): Request {
	const versionSuffix = version === undefined ? '' : `&v=${encodeURIComponent(version)}`;
	const url = `http://localhost/dedalo/core/component_text_area/tag/?id=${encodeURIComponent(id)}${versionSuffix}`;
	return new Request(url, { method: 'GET', headers });
}

describe('tag endpoint — deterministic badges', () => {
	// WC-2026-08-11-vector-tag-badges: the drawing changes, so a version-free url
	// must revalidate; only the client's `&v=<fingerprint>` url may be pinned.
	test('a timecode tag returns a revalidating, ETagged SVG', async () => {
		const response = await handleRequest(tagRequest('[TC_00:00:25.684_TC]'), context);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('image/svg+xml');
		expect(response.headers.get('cache-control')).toBe('public, max-age=3600, must-revalidate');
		expect(response.headers.get('etag')).toBeTruthy();
		const body = await response.text();
		expect(body).toContain('<svg');
		expect(body).toContain('>00:00:25.684<');
	});

	test('If-None-Match with the current ETag yields 304', async () => {
		const first = await handleRequest(tagRequest('[index-n-1-Madrid]'), context);
		const etag = first.headers.get('etag') ?? '';
		expect(etag).toBeTruthy();
		const second = await handleRequest(
			tagRequest('[index-n-1-Madrid]', { 'if-none-match': etag }),
			context,
		);
		expect(second.status).toBe(304);
		expect(second.headers.get('etag')).toBe(etag);
	});

	test('the versioned url the client builds is served immutable, same bytes', async () => {
		const bare = await handleRequest(tagRequest('[index-n-1-Madrid]'), context);
		const versioned = await handleRequest(
			tagRequest('[index-n-1-Madrid]', undefined, 'b948b27e'),
			context,
		);
		expect(versioned.status).toBe(200);
		expect(versioned.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
		expect(await versioned.text()).toBe(await bare.text());
	});

	test('identical ids across records produce identical bodies (cacheable/de-dupable)', async () => {
		const a = await (await handleRequest(tagRequest('[person-a-2-JavNa]'), context)).text();
		const b = await (await handleRequest(tagRequest('[person-a-2-JavNa]'), context)).text();
		expect(a).toBe(b);
	});
});

describe('tag endpoint — fail closed', () => {
	test('missing id → 404', async () => {
		const response = await handleRequest(
			new Request('http://localhost/dedalo/core/component_text_area/tag/', { method: 'GET' }),
			context,
		);
		expect(response.status).toBe(404);
	});

	test('malformed id → 404', async () => {
		expect((await handleRequest(tagRequest('[bogus-n-1-x]'), context)).status).toBe(404);
		expect((await handleRequest(tagRequest('not a tag'), context)).status).toBe(404);
	});

	test('locator tag WITHOUT a valid session → 404 (no existence leak)', async () => {
		const response = await handleRequest(
			tagRequest('{"section_tipo":"rsc167","section_id":"29","component_tipo":"rsc170"}'),
			context,
		);
		expect(response.status).toBe(404);
	});
});
