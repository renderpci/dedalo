/**
 * WC-051 (restated on envelope v2, engineering/ERRORS_SPEC.md §3-4) — THE
 * `auth.not_logged` CONTRACT: the server's expiry answer names ONE registered
 * code, at the auth status, and the code is what the client's re-login policy
 * keys on.
 *
 * History (why this gate exists): the client has a complete re-login path — a
 * modal, per-component retry on `login_successful`, a dedicated error render —
 * and for a long time it could never run, because the auth gate answered
 * `denied(401, 'Authentication required')`, putting the HUMAN MESSAGE in the
 * machine channel; nothing matched. Then WC-051 gave it the token `not_logged`.
 * Envelope v2 makes that structural: the machine channel is `error.code`, the
 * code is `auth.not_logged` (LEGACY_TOKEN_MAP: not_logged → auth.not_logged),
 * the compat mirror `errors:[code]` carries the same value during the window,
 * and `msg` (compat) is the registry English — never the code.
 *
 * `auth.maintenance` (a demoted non-root session while maintenance is on) is
 * the SIBLING at the same 401: the client relogin policy keys on both codes.
 *
 * The client half (data_manager's body-first parse, the policy table) is owned
 * by client_error_contract_tripwire — deliberately not asserted here.
 */

import { describe, expect, test } from 'bun:test';
import { ERROR_REGISTRY } from '../../src/core/errors/registry.ts';
import { handleRequest } from '../../src/server.ts';

const context = { requestId: 'not-logged-contract-test', startedAt: 0 };

async function unauthenticated(action: string, ddApi: string): Promise<Response> {
	return handleRequest(
		new Request('http://localhost/dedalo/core/api/v1/json/', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action, dd_api: ddApi, prevent_lock: true, source: {} }),
		}),
		context,
	);
}

describe('the server answers an expired/absent session with the code the client keys on', () => {
	test('an unauthenticated non-exempt action is 401 + error.code auth.not_logged', async () => {
		const response = await unauthenticated('get_system_info', 'dd_utils_api');
		expect(response.status).toBe(401);
		expect(response.headers.get('content-type')).toContain('application/json');
		const body = (await response.json()) as {
			ok: boolean;
			request_id: string;
			error: { code: string; category: string; message: string; label_key: string };
			result: unknown;
			msg: string;
			errors: string[];
		};
		expect(body.ok).toBe(false);
		expect(body.request_id).toBe(context.requestId);
		// THE MACHINE CHANNEL — the code the relogin policy switches on.
		expect(body.error.code).toBe('auth.not_logged');
		expect(body.error.category).toBe('auth');
		expect(body.error.label_key).toBe(ERROR_REGISTRY['auth.not_logged'].label_key);
		// The compat mirror during the window: errors[0] IS the code, never prose.
		expect(body.result).toBe(false);
		expect(body.errors).toEqual(['auth.not_logged']);
		// The human message stays where humans read it, and is NOT the code.
		expect(body.msg).toBe('Authentication required');
		expect(body.error.message).toBe('Authentication required');
	});

	test('the registry pins the contract: auth.not_logged and auth.maintenance are both 401/auth', () => {
		expect(ERROR_REGISTRY['auth.not_logged'].status).toBe(401);
		expect(ERROR_REGISTRY['auth.not_logged'].category).toBe('auth');
		expect(ERROR_REGISTRY['auth.maintenance'].status).toBe(401);
		expect(ERROR_REGISTRY['auth.maintenance'].category).toBe('auth');
	});

	test('non-vacuity: an exempt action is NOT refused for the missing session', async () => {
		const response = await unauthenticated('get_environment', 'dd_core_api');
		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean };
		expect(body.ok).toBe(true);
	});
});
