/**
 * The engine media fallback is bound to the DEV LISTENER, not to an operator's memory.
 *
 * Media is served by the WEB SERVER (src/core/media/protection.ts generates the Apache/
 * nginx rules; one stat() per request, sendfile + Range intact). The engine route in
 * server.ts is the fallback for the ONE case with no web server in the path: a developer
 * on the TCP dev listener. Before this, that fallback was gated on MEDIA_DEV_ROUTE_ENABLED,
 * off by default — and docs/install/dev_quickstart.md never mentions the key. So a fresh
 * install, set up exactly as documented, 404'd every image, video and PDF.
 *
 * Making it "just work" must NOT re-open MEDIA-04 (the fallback applies no per-record ACL
 * and bypasses the generated rules). Hence it is allowed only where production cannot be:
 *
 *   - the TCP dev listener (production is socket-only: SERVER_TCP_PORT unset), AND
 *   - media protection unconfigured (once private/publication is set, the web-server rules
 *     are authoritative and the engine must never serve the same bytes with weaker checks).
 *
 * MEDIA_DEV_ROUTE_ENABLED still overrides both ways. This gate pins all four branches; the
 * load-bearing one is "the unix-socket path never serves media".
 */

import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { setServerState } from '../../src/core/resolve/server_state.ts';
import { SESSION_COOKIE, createSession } from '../../src/core/security/session_store.ts';
import { createRequestContext, handleRequest } from '../../src/server.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const mediaRoot = config.media.rootPath;
/** A real file under the media root, created if the tree is empty. */
const REL_PATH = 'image/thumb/0/test_fallback_gate_1.jpg';
const URL_PATH = `/dedalo/${config.mediaDir}/${REL_PATH}`;

let cookie = '';

beforeAll(() => {
	if (mediaRoot === null) return;
	const full = join(mediaRoot, REL_PATH);
	mkdirSync(dirname(full), { recursive: true });
	if (!existsSync(full)) writeFileSync(full, 'fake-media-bytes');
	cookie = `${SESSION_COOKIE}=${createSession(-1, 'root', true)}`;
});

afterEach(() => {
	// biome-ignore lint/performance/noDelete: assigning undefined coerces to the STRING 'undefined'
	delete process.env.MEDIA_DEV_ROUTE_ENABLED;
	// ALWAYS restore: a leaked 'private' here would leave the developer's own install
	// expecting web-server-enforced rules that nothing is generating.
	setServerState({ media_access_mode: null });
});

/** GET the media URL with a valid session, from one listener or the other. */
async function get(devListener: boolean): Promise<number> {
	const response = await handleRequest(
		new Request(`http://localhost${URL_PATH}`, { headers: { cookie } }),
		createRequestContext({ devListener }),
	);
	return response.status;
}

describe.skipIf(mediaRoot === null)('engine media fallback ↔ listener binding', () => {
	test('DEV listener + protection unconfigured → served, with NO config at all', async () => {
		// The fresh-install case: dev_quickstart, no MEDIA_DEV_ROUTE_ENABLED anywhere.
		expect(process.env.MEDIA_DEV_ROUTE_ENABLED).toBeUndefined();
		expect(await get(true)).toBe(200);
	});

	test('the unix SOCKET path never serves media, even with a valid session', async () => {
		// Production is socket-only. This is what makes MEDIA-04 structural rather than a
		// rule someone has to remember: there is no listener there that can answer.
		expect(await get(false)).toBe(404);
	});

	test('MEDIA_DEV_ROUTE_ENABLED=false forces it off even on the dev listener', async () => {
		process.env.MEDIA_DEV_ROUTE_ENABLED = 'false';
		expect(await get(true)).toBe(404);
	});

	test('MEDIA_DEV_ROUTE_ENABLED=true still forces it on (back-compat escape hatch)', async () => {
		process.env.MEDIA_DEV_ROUTE_ENABLED = 'true';
		expect(await get(false)).toBe(200); // forced: applies to every listener — hence the boot warning
	});

	test('protection CONFIGURED ⇒ the engine stands down, even on the dev listener', async () => {
		// The web-server rules are authoritative once a mode is set. If the engine kept
		// serving the same bytes session-only, it would silently undo the marker gate the
		// admin just switched on (MEDIA-04) — and the 200 would "prove" protection works.
		setServerState({ media_access_mode: 'private' });
		expect(await get(true)).toBe(404);
	});

	/**
	 * The bypass that must not exist. A stale MEDIA_DEV_ROUTE_ENABLED=true — copied
	 * between .env files, or left over from a laptop — must NOT punch through a gate an
	 * admin switched on. It would hand any logged-in session every master file the markers
	 * were withholding, and it would BREAK rule B: an anonymous visitor of a PUBLISHED
	 * record carries no session, so the engine would 404 the very file the marker says is
	 * public. A configured mode outranks the flag, on every listener.
	 */
	for (const mode of ['private', 'publication'] as const) {
		test(`MEDIA_DEV_ROUTE_ENABLED=true cannot override protection '${mode}'`, async () => {
			setServerState({ media_access_mode: mode });
			process.env.MEDIA_DEV_ROUTE_ENABLED = 'true';
			expect(await get(true)).toBe(404); // dev listener
			expect(await get(false)).toBe(404); // socket
		});
	}

	/**
	 * MEDIA-04, now load-bearing. These paths were already denied, but nothing proved it
	 * THROUGH this route — and it used to be off by default, so the denial rarely ran. It
	 * is on by default in dev now, so pin it with files that REALLY EXIST: a 404 over a
	 * missing file proves nothing.
	 *
	 * `.publication/auth/{value}`: the filenames in that directory ARE valid
	 * `dedalo_media_auth` cookie values. Serving one hands the reader ~48 h of unrestricted
	 * access to the entire media tree. `upload/`: other users' in-flight staged files.
	 */
	for (const [label, rel] of [
		['the auth marker store', `.publication/auth/${'a'.repeat(128)}`],
		['the pub marker store', '.publication/pub/test3_1'],
		['staged uploads', 'upload/someone_elses_in_flight_file.jpg'],
	] as const) {
		test(`${label} is NEVER served, even to a valid session on the dev listener`, async () => {
			const full = join(mediaRoot as string, rel);
			mkdirSync(dirname(full), { recursive: true });
			writeFileSync(full, 'REAL FILE — the 404 must come from the deny list, not from absence');
			expect(existsSync(full)).toBe(true); // the file is really there…

			const response = await handleRequest(
				new Request(`http://localhost/dedalo/${config.mediaDir}/${rel}`, { headers: { cookie } }),
				createRequestContext({ devListener: true }),
			);
			expect(response.status).toBe(404); // …and it is still refused

			rmSync(full, { force: true });
		});
	}

	test('no session ⇒ 404 on the dev listener too (fail-closed, no existence leak)', async () => {
		const response = await handleRequest(
			new Request(`http://localhost${URL_PATH}`),
			createRequestContext({ devListener: true }),
		);
		expect(response.status).toBe(404);
	});
});
