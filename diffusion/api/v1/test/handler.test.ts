/**
 * HANDLER TESTS
 * Exercises the exported handle_request action switch: method routing,
 * body validation, uniform Bun-side auth (401 for every authenticated
 * action), token auth for server-to-server actions, and input validation.
 *
 * The PHP API is mocked by overriding globalThis.fetch: check_auth() POSTs
 * get_environment and expects result.page_globals.is_logged === true.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { handle_request } from '../index';

const BASE = 'http://localhost';

// -----------------------------------------------------
// fetch mocking (save/restore)
// -----------------------------------------------------
const real_fetch = globalThis.fetch;

function mock_php_auth(is_logged: boolean): void {
	globalThis.fetch = (async (_input: any, _init?: any) => {
		return Response.json({
			result: { page_globals: { is_logged } },
			msg: 'mock',
		});
	}) as unknown as typeof fetch;
}

afterEach(() => {
	globalThis.fetch = real_fetch;
	delete process.env.DIFFUSION_INTERNAL_TOKEN;
});

function post(body: unknown, headers: Record<string, string> = {}): Request {
	return new Request(BASE + '/api/v1/', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...headers },
		body: typeof body === 'string' ? body : JSON.stringify(body),
	});
}

// authed request: carries a session cookie so check_auth() consults the
// (mocked) PHP API instead of short-circuiting on the missing header
function post_authed(body: unknown, headers: Record<string, string> = {}): Request {
	return post(body, { 'Cookie': 'dedalo_test=session-token', ...headers });
}

// -----------------------------------------------------
// Method + body routing
// -----------------------------------------------------
describe('handler routing', () => {

	test('GET /api/v1/health responds 200 without auth', async () => {
		const res = await handle_request(new Request(BASE + '/api/v1/health'));
		expect(res.status).toBe(200);
		const data = await res.json() as any;
		expect(data.result).toBe(true);
	});

	test('GET on any other path responds 405', async () => {
		const res = await handle_request(new Request(BASE + '/api/v1/'));
		expect(res.status).toBe(405);
	});

	test('invalid JSON body responds 400', async () => {
		const res = await handle_request(post('{not json'));
		expect(res.status).toBe(400);
	});

	test('unknown action responds 400', async () => {
		mock_php_auth(true);
		const res = await handle_request(post_authed({ action: 'no_such_action', source: {} }));
		expect(res.status).toBe(400);
		const data = await res.json() as any;
		expect(data.msg).toContain('Unknown action');
	});
});

// -----------------------------------------------------
// Uniform auth: EVERY action is authenticated at Bun
// -----------------------------------------------------
const session_actions = [
	'diffuse',
	'get_process_status',
	'validate',
	'get_ontology_map',
	'get_diffusion_info',
	'retry_pending_deletions',
	'list_processes',
	'cancel_process',
	'get_diffusion_status',
];
const server_actions = [
	'delete_record',
	'check_database',
	'backup_database',
	'rebuild_media_index',
];

describe('uniform Bun-side auth', () => {

	for (const action of [...session_actions, ...server_actions]) {
		test(`${action} without session responds 401`, async () => {
			mock_php_auth(false);
			const res = await handle_request(post({ action, source: {} }));
			expect(res.status).toBe(401);
			const data = await res.json() as any;
			expect(data.errors).toContain('not_logged');
		});
	}

	for (const action of server_actions) {
		test(`${action} with valid internal token passes auth (no session)`, async () => {
			mock_php_auth(false);
			process.env.DIFFUSION_INTERNAL_TOKEN = 'contract-test-token';
			const res = await handle_request(post(
				{ action, source: {} },
				{ 'X-Diffusion-Internal-Token': 'contract-test-token' }
			));
			// auth passed: the response is NOT 401 (validation may 400 on empty input)
			expect(res.status).not.toBe(401);
		});

		test(`${action} with wrong internal token responds 401`, async () => {
			mock_php_auth(false);
			process.env.DIFFUSION_INTERNAL_TOKEN = 'contract-test-token';
			const res = await handle_request(post(
				{ action, source: {} },
				{ 'X-Diffusion-Internal-Token': 'wrong-token-padded' }
			));
			expect(res.status).toBe(401);
		});
	}

	test('token auth is rejected outright when DIFFUSION_INTERNAL_TOKEN is unset', async () => {
		mock_php_auth(false);
		delete process.env.DIFFUSION_INTERNAL_TOKEN;
		const res = await handle_request(post(
			{ action: 'delete_record', source: {} },
			{ 'X-Diffusion-Internal-Token': 'anything' }
		));
		expect(res.status).toBe(401);
	});
});

// -----------------------------------------------------
// Input validation after auth
// -----------------------------------------------------
describe('action input validation', () => {

	test('delete_record with missing targets responds 400', async () => {
		mock_php_auth(true);
		const res = await handle_request(post_authed({ action: 'delete_record', source: {} }));
		expect(res.status).toBe(400);
	});

	test('delete_record with malformed target responds 400', async () => {
		mock_php_auth(true);
		const res = await handle_request(post_authed({
			action: 'delete_record',
			source: {},
			targets: [{ table_name: 'interview', section_ids: [1] }], // missing database_name
		}));
		expect(res.status).toBe(400);
	});

	test('rebuild_media_index with missing targets responds 400', async () => {
		mock_php_auth(true);
		const res = await handle_request(post_authed({ action: 'rebuild_media_index', source: {} }));
		expect(res.status).toBe(400);
	});

	test('rebuild_media_index with malformed target responds 400', async () => {
		mock_php_auth(true);
		const res = await handle_request(post_authed({
			action: 'rebuild_media_index',
			source: {},
			targets: [{ database_name: 'web_a', table_name: 'interview' }], // missing section_tipo
		}));
		expect(res.status).toBe(400);
	});

	test('rebuild_media_index reports failure when DEDALO_MEDIA_PATH is unset', async () => {
		mock_php_auth(true);
		const saved = process.env.DEDALO_MEDIA_PATH;
		delete process.env.DEDALO_MEDIA_PATH;
		try {
			const res = await handle_request(post_authed({
				action: 'rebuild_media_index',
				source: {},
				targets: [],
			}));
			expect(res.status).toBe(200);
			const data = await res.json() as any;
			expect(data.result).toBe(false);
			expect(data.msg).toContain('DEDALO_MEDIA_PATH');
		} finally {
			if (saved !== undefined) process.env.DEDALO_MEDIA_PATH = saved;
		}
	});

	test('cancel_process without process_id responds 400', async () => {
		mock_php_auth(true);
		const res = await handle_request(post_authed({ action: 'cancel_process', source: {} }));
		expect(res.status).toBe(400);
	});

	test('check_database without database_name responds with result false', async () => {
		mock_php_auth(true);
		const res = await handle_request(post_authed({ action: 'check_database', source: {} }));
		const data = await res.json() as any;
		expect(data.result).toBe(false);
		expect(data.msg).toContain('database_name');
	});
});
