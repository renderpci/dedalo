/**
 * R0 gate: dd_utils_api::get_system_info (the upload/import/media-edit init call).
 * Two levels:
 *  1. buildSystemInfo() emits the client-critical shape (max_size_bytes numeric,
 *     upload_service_chunk_files number|false) — the fields service_upload.js reads.
 *  2. Over the real HTTP layer, the action requires a session + CSRF (it is NOT in
 *     NO_LOGIN_ACTIONS / CSRF_EXEMPT_ACTIONS) and returns result = the payload.
 */

import { describe, expect, test } from 'bun:test';
import { buildSystemInfo } from '../../src/core/api/handlers/system_info.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { handleRequest } from '../../src/server.ts';

const context = { requestId: 'system-info-test', startedAt: 0 };

function apiRequest(body: unknown, cookie?: string, csrfToken?: string): Request {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (cookie) headers.Cookie = cookie;
	if (csrfToken !== undefined) headers['X-Dedalo-Csrf-Token'] = csrfToken;
	return new Request('http://localhost/dedalo/core/api/v1/json/', {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
	});
}

const RQO = { action: 'get_system_info', dd_api: 'dd_utils_api', prevent_lock: true, source: {} };

describe('dd_utils_api.get_system_info (R0)', () => {
	test('buildSystemInfo emits the client-critical shape', () => {
		const info = buildSystemInfo();
		// The two fields service_upload.js gates transfer on.
		expect(typeof info.max_size_bytes).toBe('number');
		expect(info.max_size_bytes).toBeGreaterThan(0);
		expect(
			typeof info.upload_service_chunk_files === 'number' ||
				info.upload_service_chunk_files === false,
		).toBe(true);
		// The rest of the seven fields the client copies onto itself.
		expect(typeof info.sys_get_temp_dir).toBe('string');
		expect(typeof info.upload_tmp_dir).toBe('string');
		expect(typeof info.upload_tmp_perms).toBe('number');
		expect(typeof info.session_cache_expire).toBe('number');
		expect(typeof info.pdf_ocr_engine).toBe('boolean');
	});

	test('authenticated call returns the payload as result', async () => {
		const token = createSession(-1, 'root', true);
		const cookie = `dedalo_ts_session=${token}`;
		const csrf = getSession(token)?.csrfToken as string;
		const res = await handleRequest(apiRequest(RQO, cookie, csrf), context);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { result: { max_size_bytes?: number }; msg: string };
		expect(body.result).toBeDefined();
		expect(typeof body.result.max_size_bytes).toBe('number');
	});

	test('unauthenticated call is refused (not in NO_LOGIN_ACTIONS)', async () => {
		const res = await handleRequest(apiRequest(RQO), context);
		// No session → the auth gate rejects before the handler runs.
		expect(res.status).not.toBe(200);
	});
});
