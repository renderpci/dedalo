/**
 * Phase F gate: the media upload HTTP route on the real server handler.
 * Fail-closed: anonymous → 404 (no leak), bad CSRF → 403; a valid session +
 * CSRF stages a real jpg and returns the file_data descriptor.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolveMagick } from '../../src/core/media/engine/imagemagick.ts';
import { runBinary } from '../../src/core/media/engine/spawn.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { handleRequest } from '../../src/server.ts';

/** Create a session and return { token, csrf }. */
function newSession(userId: number): { token: string; csrf: string } {
	const token = createSession(userId, 'tester', false);
	const session = getSession(token)!;
	return { token, csrf: session.csrfToken };
}

const context = { requestId: 'upload-test', startedAt: 0 };
const API_URL = 'http://localhost/dedalo/core/api/v1/json/';
const HAVE_MAGICK = existsSync(resolveMagick());

async function jpegBlob(): Promise<Blob> {
	const tmp = `${process.env.TMPDIR ?? '/tmp'}/dedalo_upload_ep_${process.pid}.jpg`;
	await runBinary([resolveMagick(), '-size', '120x120', 'xc:teal', tmp], { nice: false });
	const bytes = new Uint8Array(await Bun.file(tmp).arrayBuffer());
	return new Blob([bytes as BlobPart], { type: 'image/jpeg' });
}

function multipartRequest(blob: Blob, opts: { cookie?: string; csrf?: string }): Request {
	const form = new FormData();
	form.set('key_dir', 'kd_ep');
	form.set('file_name', 'shot.jpg');
	form.set('chunked', 'false');
	form.set('file_to_upload', blob, 'shot.jpg');
	const headers: Record<string, string> = {};
	if (opts.cookie) headers.Cookie = opts.cookie;
	if (opts.csrf) headers['x-dedalo-csrf-token'] = opts.csrf;
	return new Request(API_URL, { method: 'POST', body: form, headers });
}

describe('media upload endpoint (fail-closed auth/CSRF)', () => {
	test.if(HAVE_MAGICK)('anonymous upload → 404 (no existence leak)', async () => {
		const res = await handleRequest(multipartRequest(await jpegBlob(), {}), context);
		expect(res.status).toBe(404);
	});

	test.if(HAVE_MAGICK)('valid session but missing/blank CSRF → 403', async () => {
		const s = newSession(3);
		const res = await handleRequest(
			multipartRequest(await jpegBlob(), { cookie: `dedalo_ts_session=${s.token}` }),
			context,
		);
		expect(res.status).toBe(403);
	});

	test.if(HAVE_MAGICK)('valid session + CSRF stages the file and returns file_data', async () => {
		const s = newSession(3);
		const res = await handleRequest(
			multipartRequest(await jpegBlob(), {
				cookie: `dedalo_ts_session=${s.token}`,
				csrf: s.csrf,
			}),
			context,
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { result: boolean; file_data: Record<string, unknown> };
		expect(body.result).toBe(true);
		expect(body.file_data.complete).toBe(true);
		expect(body.file_data.extension).toBe('jpg');
		expect(body.file_data.tmp_name).toBe('shot.jpg');
	});
});

describe('chunked upload contract through the real server (the browser flow)', () => {
	test.if(HAVE_MAGICK)(
		'chunk POST echoes chunk_index/total_chunks; join_chunked_files_uploaded assembles',
		async () => {
			const s = newSession(3);
			const blob = await jpegBlob();
			// The client ALWAYS chunks (DEDALO_UPLOAD_SERVICE_CHUNK_FILES > 0); a small
			// image is a single chunk with total_chunks=1.
			const form = new FormData();
			form.set('key_dir', 'kd_chunk');
			form.set('file_name', 'c.jpg');
			form.set('chunked', 'true');
			form.set('chunk_index', '0');
			form.set('total_chunks', '1');
			form.set('file_to_upload', blob, 'c.jpg');
			const chunkReq = new Request(API_URL, {
				method: 'POST',
				body: form,
				headers: {
					Cookie: `dedalo_ts_session=${s.token}`,
					'x-dedalo-csrf-token': s.csrf,
					'X-File-Name': encodeURIComponent('c.jpg'),
				},
			});
			const chunkRes = await handleRequest(chunkReq, context);
			expect(chunkRes.status).toBe(200);
			const chunkBody = (await chunkRes.json()) as { file_data: Record<string, unknown> };
			// The fields the client's completion counter reads (were missing → NaN → hang).
			expect(chunkBody.file_data.chunk_index).toBe(0);
			expect(chunkBody.file_data.total_chunks).toBe(1);
			expect(chunkBody.file_data.tmp_name).toBe('c.jpg');

			// Client fires the join once all chunks are counted.
			const joinRqo = {
				dd_api: 'dd_utils_api',
				action: 'join_chunked_files_uploaded',
				options: { file_data: chunkBody.file_data, files_chunked: ['c.jpg'] },
			};
			const joinRes = await handleRequest(
				new Request(API_URL, {
					method: 'POST',
					body: JSON.stringify(joinRqo),
					headers: {
						'Content-Type': 'application/json',
						Cookie: `dedalo_ts_session=${s.token}`,
						'x-dedalo-csrf-token': s.csrf,
					},
				}),
				context,
			);
			expect(joinRes.status).toBe(200);
			const joinBody = (await joinRes.json()) as {
				result: boolean;
				file_data: Record<string, unknown>;
			};
			expect(joinBody.result).toBe(true);
			expect(joinBody.file_data.tmp_name).toBe('c.jpg');
			expect(joinBody.file_data.extension).toBe('jpg');
			expect(joinBody.file_data.complete).toBe(true);
		},
	);
});
