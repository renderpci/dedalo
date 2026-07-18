/**
 * Phase 7 gate: media serving on the dev listener. In production the reverse
 * proxy serves media and enforces the marker-based access control (spec §7.9,
 * ledgered); this route exists so record images render in dev — and it FAILS
 * CLOSED: no valid session ⇒ 404 (no existence leak), traversal ⇒ 404.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { readEnv } from '../../src/config/env.ts';
import { createSession } from '../../src/core/security/session_store.ts';
import { handleRequest } from '../../src/server.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const context = { requestId: 'media-test', startedAt: 0 };
/**
 * The CATALOG root (config.media.rootPath), not a raw readEnv('MEDIA_PATH').
 * MEDIA_PATH is a derived key — nothing sets it in the environment — so reading
 * env here made findSampleFile() return null and SKIPPED every route test on
 * every machine. That is why a dead media route (server.ts had the same shadow
 * read, so MEDIA_ROOT was null and all media 404'd) shipped unnoticed.
 */
const mediaRoot = config.media.rootPath ?? undefined;

// The dev media route is opt-in (M5). Enable it for these route tests; it is read
// per-request, so setting the env here takes effect without a reimport.
beforeAll(() => {
	process.env.MEDIA_DEV_ROUTE_ENABLED = 'true';
});
afterAll(() => {
	// biome-ignore lint/performance/noDelete: assigning undefined coerces to the STRING 'undefined' — only delete truly unsets the key
	delete process.env.MEDIA_DEV_ROUTE_ENABLED;
});

/** Find one real media file (relative path) to serve in the test. */
function findSampleFile(): string | null {
	if (mediaRoot === undefined) return null;
	const queue = [''];
	let scanned = 0;
	while (queue.length > 0 && scanned < 200) {
		const dir = queue.shift() as string;
		for (const name of readdirSync(join(mediaRoot, dir))) {
			const rel = dir === '' ? name : `${dir}/${name}`;
			const stats = statSync(join(mediaRoot, rel));
			scanned++;
			if (stats.isFile() && stats.size > 0 && stats.size < 5_000_000) return rel;
			if (stats.isDirectory()) queue.push(rel);
		}
	}
	return null;
}

// Computed synchronously at module load so test.if() can consume it: machines
// without media REPORT the sample-dependent tests as skipped instead of
// passing them vacuously.
const sample = findSampleFile();

function mediaRequest(path: string, sessionToken?: string, range?: string): Request {
	const headers: Record<string, string> = {};
	if (sessionToken !== undefined) headers.Cookie = `dedalo_ts_session=${sessionToken}`;
	if (range !== undefined) headers.Range = range;
	return new Request(`http://localhost${path}`, { headers });
}

describe('media serving (dev listener, fail-closed)', () => {
	test.if(sample !== null)('a real media file serves ONLY with a valid session', async () => {
		const path = `/dedalo/${config.mediaDir}/${sample}`;

		// No session → 404 (fail-closed, no existence leak).
		const anonymous = await handleRequest(mediaRequest(path), context);
		expect(anonymous.status).toBe(404);

		// Valid session → the file bytes.
		const token = createSession(-1, 'root', true);
		const authorized = await handleRequest(mediaRequest(path, token), context);
		expect(authorized.status).toBe(200);
		expect((await authorized.arrayBuffer()).byteLength).toBeGreaterThan(0);
	});

	test.if(sample !== null)(
		'honours HTTP Range requests with 206 (video/audio playback + seeking)',
		async () => {
			// Regression: the endpoint answered Range requests with a full-body 200, so
			// strict browsers (Safari/iOS) refused to play <video>/<audio> and seeking
			// broke everywhere. A bytes= range MUST yield 206 Partial Content with a
			// Content-Range, and every response must advertise Accept-Ranges.
			const path = `/dedalo/${config.mediaDir}/${sample}`;
			const token = createSession(-1, 'root', true);

			// Full response advertises range capability.
			const full = await handleRequest(mediaRequest(path, token), context);
			expect(full.status).toBe(200);
			expect(full.headers.get('accept-ranges')).toBe('bytes');

			// A bytes range yields exactly that slice as 206.
			const total = Number(full.headers.get('content-length'));
			const partial = await handleRequest(mediaRequest(path, token, 'bytes=0-99'), context);
			expect(partial.status).toBe(206);
			expect(partial.headers.get('content-range')).toBe(`bytes 0-99/${total}`);
			expect((await partial.arrayBuffer()).byteLength).toBe(100);

			// An unsatisfiable range fails with 416 (not a silent full body).
			const bad = await handleRequest(mediaRequest(path, token, `bytes=${total + 10}-`), context);
			expect(bad.status).toBe(416);
		},
	);

	test.if(sample !== null)('the route is OFF when explicitly disabled (M5)', async () => {
		const path = `/dedalo/${config.mediaDir}/${sample}`;
		const token = createSession(-1, 'root', true);
		process.env.MEDIA_DEV_ROUTE_ENABLED = 'false';
		try {
			// Even WITH a valid session, a disabled route must not serve the file.
			const response = await handleRequest(mediaRequest(path, token), context);
			expect(response.status).toBe(404);
		} finally {
			process.env.MEDIA_DEV_ROUTE_ENABLED = 'true';
		}
	});

	test.if(sample !== null)(
		'the route follows the readEnv precedence when process.env is UNSET (default-off, M5)',
		async () => {
			// The genuine default path: absent from process.env, readEnv falls to
			// ../private/.env then the 'false' default. The private file is
			// APPEND-ONLY and this dev machine legitimately opts in there
			// (MEDIA_DEV_ROUTE_ENABLED=true since 64e9d40) — so the expectation
			// mirrors the precedence chain: file-opt-in → served; no file key →
			// the true default-off 404 (what CI and fresh installs assert).
			const path = `/dedalo/${config.mediaDir}/${sample}`;
			const token = createSession(-1, 'root', true);
			// biome-ignore lint/performance/noDelete: assigning undefined coerces to the STRING 'undefined' — only delete truly unsets the key
			delete process.env.MEDIA_DEV_ROUTE_ENABLED;
			try {
				const fileOrDefault = readEnv('MEDIA_DEV_ROUTE_ENABLED') ?? 'false';
				const response = await handleRequest(mediaRequest(path, token), context);
				expect(response.status).toBe(fileOrDefault === 'true' ? 200 : 404);
			} finally {
				process.env.MEDIA_DEV_ROUTE_ENABLED = 'true';
			}
		},
	);

	test('traversal outside the media root fails closed', async () => {
		const token = createSession(-1, 'root', true);
		for (const attempt of [
			`/dedalo/${config.mediaDir}/../private/.env`,
			`/dedalo/${config.mediaDir}/..%2f..%2fprivate/.env`,
		]) {
			const response = await handleRequest(mediaRequest(attempt, token), context);
			expect(response.status).toBe(404);
		}
	});
});

/** Find one .svg under the media root matching a path predicate. */
function findSvgFile(matches: (rel: string) => boolean): string | null {
	if (mediaRoot === undefined) return null;
	const queue = [''];
	let scanned = 0;
	while (queue.length > 0 && scanned < 5000) {
		const dir = queue.shift() as string;
		for (const name of readdirSync(join(mediaRoot, dir))) {
			const rel = dir === '' ? name : `${dir}/${name}`;
			const stats = statSync(join(mediaRoot, rel));
			scanned++;
			if (stats.isFile() && rel.endsWith('.svg') && matches(rel)) return rel;
			if (stats.isDirectory()) queue.push(rel);
		}
	}
	return null;
}

const imageFolder = config.media.image.folder.replace(/^\//, '');
const envelopeSample = findSvgFile(
	(rel) => rel.startsWith(`${imageFolder}/`) && rel.split('/').includes('svg'),
);
const rawSvgSample = findSvgFile((rel) => !rel.startsWith(`${imageFolder}/`));

// MEDIA-03 refined (SECURITY_DECISIONS.md DECISION 2): the two SVG populations
// under the media root carry DIFFERENT safety headers, and collapsing the two
// scopes breaks either the client (envelope served attachment/sandboxed →
// component_image renders blank) or the hardening (raw upload served inline →
// stored XSS). This gate locks both scopes.
describe('media serving — SVG safety-header scopes (MEDIA-03)', () => {
	test.if(envelopeSample !== null)(
		'server-generated image envelope serves INLINE with the script-blocking CSP',
		async () => {
			// The client loads this as <object type="image/svg+xml"> and needs
			// same-origin contentDocument + the nested same-origin raster fetch.
			const token = createSession(-1, 'root', true);
			const response = await handleRequest(
				mediaRequest(`/dedalo/${config.mediaDir}/${envelopeSample}`, token),
				context,
			);
			expect(response.status).toBe(200);
			expect(response.headers.get('content-disposition')).toBeNull();
			const csp = response.headers.get('content-security-policy') ?? '';
			expect(csp).toContain("script-src 'none'");
			expect(csp).toContain("img-src 'self'");
			expect(csp).not.toContain('sandbox');
		},
	);

	test.if(rawSvgSample !== null)(
		'raw uploaded SVG keeps the strict download-only lockdown',
		async () => {
			const token = createSession(-1, 'root', true);
			const response = await handleRequest(
				mediaRequest(`/dedalo/${config.mediaDir}/${rawSvgSample}`, token),
				context,
			);
			expect(response.status).toBe(200);
			expect(response.headers.get('content-disposition')).toBe('attachment');
			const csp = response.headers.get('content-security-policy') ?? '';
			expect(csp).toContain("default-src 'none'");
			expect(csp).toContain('sandbox');
		},
	);
});
