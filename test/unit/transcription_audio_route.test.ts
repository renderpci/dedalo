/**
 * TRANSCRIPTION AUDIO ROUTE GATE.
 *
 * The in-browser recogniser reads the whole `audio_tr` WAV before it can
 * transcribe. Reading it from the ordinary media URL made that depend on the
 * media host's ORIGIN (usually a different host/port than the app), on the media
 * COOKIE (not sent cross-site), and on the generated web-server PROTECTION rules —
 * none of which the recogniser can satisfy, and none of which is the security
 * boundary for a temporary derivative of a record the caller must already be able
 * to write.
 *
 * So the engine serves it itself, same-origin, behind its own gate. This gate pins
 * the fail-closed half: no session, a malformed locator or a missing file must all
 * answer a plain 404 that leaks nothing — and the route must never BUILD the file
 * (that stays the permission-gated tool action's job, so the route cannot be used
 * to make the engine transcode anything).
 *
 * The authorized path needs a live session + a record the principal can write, so
 * it is exercised by the tool's own suite and in the browser, not here.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TRANSCRIPTION_AUDIO_PATH } from '../../src/core/media/tools/transcription_audio.ts';
import { SESSION_COOKIE, createSession } from '../../src/core/security/session_store.ts';
import { handleRequest } from '../../src/server.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const context = { requestId: 'test', startedAt: 0 };

async function get(query: string, token?: string): Promise<Response> {
	return handleRequest(
		new Request(`http://localhost${TRANSCRIPTION_AUDIO_PATH}${query}`, {
			headers: token !== undefined ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
		}),
		context,
	);
}

describe('the transcription audio route is fail-closed', () => {
	test('an anonymous request 404s (never 401 — no existence leak)', async () => {
		const response = await get('?section_tipo=rsc167&section_id=506&component_tipo=rsc35');
		expect(response.status).toBe(404);
		const body = await response.text();
		expect(body).not.toContain('rsc167');
		expect(body).not.toContain('audio');
	});

	test('a malformed locator 404s', async () => {
		expect((await get('')).status).toBe(404);
		expect((await get('?section_tipo=../../etc&section_id=1&component_tipo=rsc35')).status).toBe(
			404,
		);
		expect((await get('?section_tipo=rsc167&section_id=0&component_tipo=rsc35')).status).toBe(404);
		expect((await get('?section_tipo=rsc167&section_id=-1&component_tipo=rsc35')).status).toBe(404);
		expect((await get('?section_tipo=rsc167&section_id=abc&component_tipo=rsc35')).status).toBe(
			404,
		);
	});

	test('the route is GET-only', async () => {
		const response = await handleRequest(
			new Request(`http://localhost${TRANSCRIPTION_AUDIO_PATH}?section_tipo=rsc167`, {
				method: 'POST',
			}),
			context,
		);
		expect(response.status).not.toBe(200);
	});

	test('a real tool asset still serves (the route did not shadow the package)', async () => {
		const asset = await handleRequest(
			new Request('http://localhost/dedalo/tools/tool_transcription/register.json'),
			context,
		);
		expect(asset.status).toBe(200);
	});
});

describe('the route is REACHABLE (it is not shadowed by the tool asset route)', () => {
	// This path lives under /dedalo/tools/tool_transcription/, which is ALSO the
	// tool's static asset space. With the asset route first, it resolves the path as
	// a file inside the package, finds none and returns its OWN 404 — the audio
	// handler never runs, and every browser transcription dies with "the audio file
	// could not be read (HTTP 404)". That shipped once, on 2026-07-28.
	//
	// It cannot be caught by response comparison: both routes answer the same
	// fail-closed 404 with the same body, deliberately. What the bug IS, is source
	// order — so that is what this asserts.
	test('the audio route is checked BEFORE the tool asset route in server.ts', () => {
		const server = readFileSync(join(import.meta.dir, '..', '..', 'src', 'server.ts'), 'utf8');

		const audioAt = server.indexOf('url.pathname === TRANSCRIPTION_AUDIO_PATH');
		const assetAt = server.indexOf('await serveToolsRequest(url.pathname');

		expect(audioAt).toBeGreaterThan(-1);
		expect(assetAt).toBeGreaterThan(-1);
		expect(audioAt).toBeLessThan(assetAt);
	});

	test('a real tool asset still serves (moving the route did not shadow the package)', async () => {
		const asset = await handleRequest(
			new Request('http://localhost/dedalo/tools/tool_transcription/js/tool_transcription.js'),
			context,
		);
		expect(asset.status).toBe(200);
	});

	test('an authenticated caller reaches the handler, not a static-file miss', async () => {
		// A superuser session passes gate 1 and gate 3; a well-formed locator passes
		// gate 2; the media resolution then fails for this (non-media) component and
		// the handler answers its own 404. The value here is that the handler RUNS —
		// it is exercised end to end through the real request pipeline.
		const token = createSession(-1, 'root', true);
		const response = await get('?section_tipo=rsc167&section_id=506&component_tipo=rsc35', token);

		expect(response.status).toBe(404);
		expect(await response.text()).toBe(JSON.stringify({ result: false, msg: 'Not found' }));
	});
});
