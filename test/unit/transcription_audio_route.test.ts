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
import { TRANSCRIPTION_AUDIO_PATH } from '../../src/core/media/tools/transcription_audio.ts';
import { handleRequest } from '../../src/server.ts';

const context = { requestId: 'test', startedAt: 0 };

async function get(query: string): Promise<Response> {
	return handleRequest(new Request(`http://localhost${TRANSCRIPTION_AUDIO_PATH}${query}`), context);
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

	test('it does not collide with the tool asset route', async () => {
		// The path lives under /dedalo/tools/tool_transcription/, which is also the
		// tool's static asset space — the audio route must win, and a real asset
		// must still serve.
		const asset = await handleRequest(
			new Request('http://localhost/dedalo/tools/tool_transcription/register.json'),
			context,
		);
		expect(asset.status).toBe(200);
	});
});
