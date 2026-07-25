/**
 * WC-051 — THE `not_logged` CONTRACT: the server's expiry answer and the client's
 * recovery must name the SAME token, and the token must be able to REACH the client.
 *
 * This gates a defect that was invisible from either side alone. The client has a
 * complete, mature re-login path — a modal (page.js), per-component retry on
 * `login_successful` (component_common.js, common.js), a dedicated error render
 * (render_common.js) — and every branch of it dispatches on the literal error string
 * `not_logged`, inherited from the PHP oracle. The TS engine never emitted that string:
 * the auth gate answered `denied(401, 'Authentication required')`, which puts the HUMAN
 * MESSAGE in `errors`. Nothing matched, so none of that recovery UI could ever run.
 *
 * It could not even be reached to fail. `_fetch_with_retry_and_timeout` threw an
 * HttpError on every non-ok status, classified 401 as non-retryable, painted a
 * permanent red "Not retry-able HTTP error 401" and threw — so the envelope never
 * reached `.json()` and `api_response_errors` never published.
 *
 * Net effect before this gate: an expired session surfaced as a network error and
 * blank widgets. At a 12h TTL that was rare enough to look like flakiness; at the
 * 1h idle window it is the normal end of every working session, so BOTH halves are
 * asserted here — the wire token, and the client's ability to receive it.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { notLogged } from '../../src/core/api/response.ts';
import { handleRequest } from '../../src/server.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const context = { requestId: 'not-logged-contract-test', startedAt: 0 };

function readClient(relativePath: string): string {
	return readFileSync(join(REPO_ROOT, 'client', 'dedalo', 'core', relativePath), 'utf8');
}

describe('the server answers an expired/absent session with the token the client keys on', () => {
	test('an unauthenticated non-exempt action returns 401 with errors:["not_logged"]', async () => {
		const response = await handleRequest(
			new Request('http://localhost/dedalo/core/api/v1/json/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'get_system_info',
					dd_api: 'dd_utils_api',
					prevent_lock: true,
					source: {},
				}),
			}),
			context,
		);

		expect(response.status).toBe(401);
		const body = (await response.json()) as { result: unknown; msg: string; errors: string[] };
		expect(body.result).toBe(false);
		// The MACHINE token — this is what every client branch switches on.
		expect(body.errors).toContain('not_logged');
		// The human message stays where humans read it, and must NOT be the token.
		expect(body.msg).toBe('Authentication required');
	});

	test('notLogged() keeps the message out of errors (the original defect, directly)', () => {
		const result = notLogged();
		expect(result.status).toBe(401);
		expect(result.body.errors).toEqual(['not_logged']);
		expect(result.body.errors).not.toContain('Authentication required');
	});
});

describe('the client can still RECEIVE that token', () => {
	test('data_manager exempts 401 from the HttpError throw', () => {
		// Without this exemption the envelope dies in the retry wrapper and every
		// assertion above becomes decorative: the token is emitted and never read.
		const source = readClient('common/js/data_manager.js');
		expect(source).toContain('response?.status !== 401');
	});

	test('data_manager publishes api_response_errors — the event the modal listens to', () => {
		const source = readClient('common/js/data_manager.js');
		expect(source).toContain("event_manager.publish('api_response_errors'");
	});

	test('every client branch that recovers from expiry still names the token', () => {
		// If the client ever renames it, the server token above is orphaned and the
		// recovery silently dies again — the exact failure this file exists to catch.
		for (const path of [
			'page/js/page.js',
			'common/js/common.js',
			'common/js/render_common.js',
			'component_common/js/component_common.js',
		]) {
			expect(readClient(path)).toContain('not_logged');
		}
	});
});
