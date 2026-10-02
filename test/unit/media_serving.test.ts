/**
 * Phase 7 gate: media serving on the dev listener. In production the reverse
 * proxy serves media and enforces the marker-based access control (spec §7.9,
 * ledgered); this route exists so record images render in dev — and it FAILS
 * CLOSED: no valid session ⇒ 404 (no existence leak), traversal ⇒ 404.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { readEnv } from '../../src/config/env.ts';
import { setServerState } from '../../src/core/resolve/server_state.ts';
import { createSession } from '../../src/core/security/session_store.ts';
import { handleRequest, mediaSvgSafetyHeaders } from '../../src/server.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';
import { TEST_MEDIA_MARKER } from '../helpers/test_media_root.ts';

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
// per-request, so setting the env here takes effect without a reimport. The
// protection mode is pinned OFF via the state override too: a developer's
// ../private/.env may set DEDALO_MEDIA_ACCESS_MODE, and a configured mode
// outranks the flag (protection-wins, MEDIA-04) — these tests assert the
// unprotected dev-route behavior, so they must not inherit that env.
beforeAll(() => {
	process.env.MEDIA_DEV_ROUTE_ENABLED = 'true';
	setServerState({ media_access_mode: false });
});
afterAll(() => {
	// assigning undefined coerces to the STRING 'undefined' — only delete truly unsets the key
	delete process.env.MEDIA_DEV_ROUTE_ENABLED;
	setServerState({ media_access_mode: null });
});

/**
 * THE FIXTURES ARE PLANTED, NEVER FOUND (2026-10-02). This gate used to SAMPLE
 * whatever the media root happened to hold — the first file in a type folder,
 * the first non-media file at the root, the first envelope SVG — and SKIP every
 * route leg when a tree had none (a fresh install, a CI host). Which file it
 * proved the route on, and whether it proved anything, was a fact about the
 * machine. Now each population gets one file this gate writes into the suite's
 * OWN media root (refused unless the root carries the `.dedalo_test_media`
 * marker) and removes after.
 *
 * (!) History the planted names keep honest: the old sampler's first root file
 * on the suite tree was `dedalo_media_protection_map.nginx.conf` (the gate
 * proved the listener could serve an nginx CONFIG and called that success), and
 * its "raw SVG" was the media KIT's `kit/svg.svg`, outside every type folder.
 */
function plantRoot(): string {
	if (mediaRoot === undefined || !existsSync(join(mediaRoot, TEST_MEDIA_MARKER))) {
		throw new Error(
			`media_serving: refusing to plant fixtures in '${String(mediaRoot)}' — it is not a marked suite media root (${TEST_MEDIA_MARKER} missing). Run under the bun test preload.`,
		);
	}
	return mediaRoot;
}
const PLANT_ROOT = plantRoot();
const PLANTED: string[] = [];
function plant(rel: string, body: string | Uint8Array): string {
	mkdirSync(dirname(join(PLANT_ROOT, rel)), { recursive: true });
	writeFileSync(join(PLANT_ROOT, rel), body);
	PLANTED.push(rel);
	return rel;
}
afterAll(() => {
	for (const rel of PLANTED) rmSync(join(PLANT_ROOT, rel), { force: true });
	rmSync(join(PLANT_ROOT, imageFolder, 'zz_media_serving'), { recursive: true, force: true });
});

const imageFolder = config.media.image.folder.replace(/^\//, '');
const svgFolder = config.media.svg.folder.replace(/^\//, '');
/** A media file INSIDE a type folder: 300 bytes, so a 0-99 range is a strict slice. */
const sample = plant(
	`${imageFolder}/zz_media_serving/0/zz_media_serving_sample.jpg`,
	new Uint8Array(300).map((_, i) => i % 251),
);
/** A file at the root, OUTSIDE every type folder — what the allowlist refuses. */
const nonMediaSample = plant('zz_media_serving_note.txt', 'not a media file');
/** A server-generated image ENVELOPE svg (an `svg` segment under the image folder). */
const envelopeSample = plant(
	`${imageFolder}/svg/0/zz_media_serving_envelope.svg`,
	'<svg xmlns="http://www.w3.org/2000/svg"></svg>',
);
/** A RAW uploaded SVG — a `component_svg` file under the SVG TYPE folder. */
const rawSvgSample = plant(
	`${svgFolder}/original/0/zz_media_serving_raw.svg`,
	'<svg xmlns="http://www.w3.org/2000/svg"></svg>',
);

function mediaRequest(path: string, sessionToken?: string, range?: string): Request {
	const headers: Record<string, string> = {};
	if (sessionToken !== undefined) headers.Cookie = `dedalo_ts_session=${sessionToken}`;
	if (range !== undefined) headers.Range = range;
	return new Request(`http://localhost${path}`, { headers });
}

describe('media serving (dev listener, fail-closed)', () => {
	test('a real media file serves ONLY with a valid session', async () => {
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

	test('honours HTTP Range requests with 206 (video/audio playback + seeking)', async () => {
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
	});

	test('the route is OFF when explicitly disabled (M5)', async () => {
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

	test('the route follows the readEnv precedence when process.env is UNSET (default-off, M5)', async () => {
		// The genuine default path: absent from process.env, readEnv falls to
		// ../private/.env then the 'false' default. The private file is
		// APPEND-ONLY and this dev machine legitimately opts in there
		// (MEDIA_DEV_ROUTE_ENABLED=true since 64e9d40) — so the expectation
		// mirrors the precedence chain: file-opt-in → served; no file key →
		// the true default-off 404 (what CI and fresh installs assert).
		const path = `/dedalo/${config.mediaDir}/${sample}`;
		const token = createSession(-1, 'root', true);
		// assigning undefined coerces to the STRING 'undefined' — only delete truly unsets the key
		delete process.env.MEDIA_DEV_ROUTE_ENABLED;
		try {
			const fileOrDefault = readEnv('MEDIA_DEV_ROUTE_ENABLED') ?? 'false';
			const response = await handleRequest(mediaRequest(path, token), context);
			expect(response.status).toBe(fileOrDefault === 'true' ? 200 : 404);
		} finally {
			process.env.MEDIA_DEV_ROUTE_ENABLED = 'true';
		}
	});

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

describe('media serving — the root is an ALLOWLIST of type folders (CARRY-11)', () => {
	test('a file outside every media type folder is REFUSED, session or not', async () => {
		// The route used to carry a DENYLIST of two subtrees (`upload/`,
		// `.publication`), and a denylist only excludes what someone thought of.
		// The suite's own media root also holds `import/` — staged, un-ingested
		// source CSVs, i.e. another curator's raw data — plus `export/`, `kit/`,
		// `html_files/` and the generated nginx config files. All were served.
		// (Measured: the first file this gate's own sampler met at the root was
		// `dedalo_media_protection_map.nginx.conf`, and it asserted a 200 on it.)
		const token = createSession(-1, 'root', true);
		const response = await handleRequest(
			mediaRequest(`/dedalo/${config.mediaDir}/${nonMediaSample}`, token),
			context,
		);
		expect(
			response.status,
			`the dev listener served '${nonMediaSample}', which is not under a media type folder`,
		).toBe(404);
	});

	test('the allowlist is derived from config, not hardcoded', () => {
		// A renamed DEDALO_*_FOLDER must stay servable; a hardcoded list would
		// silently deny an install's entire media tree.
		const server = readFileSync(join(import.meta.dir, '..', '..', 'src/server.ts'), 'utf8');
		expect(server).toContain('MEDIA_TYPE_FOLDERS()');
		expect(server).toContain('mediaTypeOf(model)');
		expect(server).not.toMatch(/\[\s*'image',\s*'av',\s*'pdf',\s*'svg',\s*'3d'\s*\]/);
	});
});

// MEDIA-03 refined (SECURITY_DECISIONS.md DECISION 2): the two SVG populations
// under the media root carry DIFFERENT safety headers, and collapsing the two
// scopes breaks either the client (envelope served attachment/sandboxed →
// component_image renders blank) or the hardening (raw upload served inline →
// stored XSS). This gate locks both scopes.
describe('media serving — SVG safety-header scopes (MEDIA-03)', () => {
	// UNCONDITIONAL half. The two route cases below need a real .svg on disk and
	// SKIP silently without one (fresh install, hermetic CI tier) — so the
	// selection itself is asserted here on synthetic paths, with no corpus. This
	// matters more since XSS-02 relaxed `object-src` to admit the envelope folder
	// (core/api/static_asset.ts): the app CSP no longer backstops a rotted scope.
	test('the selector splits the two populations (no media corpus needed)', () => {
		const imageFolder = config.media.image.folder.replace(/^\//, '');
		const envelope = mediaSvgSafetyHeaders([imageFolder, 'svg', '0', 'x.svg'], 'image/svg+xml');
		expect(envelope['Content-Disposition']).toBeUndefined();
		expect(envelope['Content-Security-Policy']).toContain("script-src 'none'");
		expect(envelope['Content-Security-Policy']).not.toContain('sandbox');

		// Raw upload — same extension, different population. Both a top-level
		// svg/ upload and an svg sitting under the image folder WITHOUT the 'svg'
		// segment must land in the locked-down branch.
		for (const rel of [
			['svg', 'original', '0', 'x.svg'],
			[imageFolder, 'original', '0', 'x.svg'],
		]) {
			const raw = mediaSvgSafetyHeaders(rel, 'image/svg+xml');
			expect(raw['Content-Disposition'], rel.join('/')).toBe('attachment');
			expect(raw['Content-Security-Policy'], rel.join('/')).toContain('sandbox');
		}

		// Non-SVG carries neither (a blanket attachment would break <img>/<video>).
		expect(mediaSvgSafetyHeaders([imageFolder, 'web', '0', 'x.jpg'], 'image/jpeg')).toEqual({});
	});

	test('server-generated image envelope serves INLINE with the script-blocking CSP', async () => {
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
	});

	test('raw uploaded SVG keeps the strict download-only lockdown', async () => {
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
	});
});
