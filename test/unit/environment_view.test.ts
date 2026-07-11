/**
 * Environment diagnostic view — the dedicated, session-gated GET endpoint
 * (developer tool, core/api/environment_view.ts). Replaces the PHP menu link to
 * core/common/js/environment.js.php (which the TS server can't run). Verifies:
 *   - unauthenticated            → 404 (fail-closed, no existence leak);
 *   - authenticated              → 200, pretty JSON, == the buildEnvironment payload.
 *
 * The session gate runs without Postgres (superuser resolves in-memory); the 200
 * case exercises buildEnvironment (labels / page_globals) and so guards on a live
 * DB probe, honest on a machine without the shared database.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { buildEnvironment } from '../../src/core/resolve/environment.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { handleRequest } from '../../src/server.ts';

const context = { requestId: 'env-view-test', startedAt: 0 };
const ENV_URL = '/dedalo/core/api/v1/environment';

function envRequest(sessionToken?: string): Request {
	return new Request(`http://localhost${ENV_URL}`, {
		headers: sessionToken !== undefined ? { Cookie: `dedalo_ts_session=${sessionToken}` } : {},
	});
}

let dbReady = false;
beforeAll(async () => {
	try {
		await sql`SELECT 1`;
		dbReady = true;
	} catch {
		dbReady = false; // no shared DB — the payload case skips honestly
	}
});

describe('environment diagnostic view (dedicated GET, session-gated)', () => {
	test('no session → 404 (endpoint not revealed)', async () => {
		const response = await handleRequest(envRequest(), context);
		expect(response.status).toBe(404);
	});

	test('authenticated → 200 pretty JSON == buildEnvironment payload', async () => {
		if (!dbReady) return;
		const token = createSession(-1, 'root', true);
		const response = await handleRequest(envRequest(token), context);
		expect(response.status).toBe(200);

		const rawText = await response.text();
		expect(rawText).toContain('\n  '); // pretty-printed (2-space indent)
		const body = JSON.parse(rawText) as { result?: Record<string, unknown> };
		expect(body.result).toBeDefined();
		for (const key of ['page_globals', 'plain_vars', 'get_label']) {
			expect(body.result?.[key]).toBeDefined();
		}

		// Same payload the boot-time get_environment returns to this user.
		const session = getSession(token);
		const principal = await resolvePrincipal(-1);
		const expected = await buildEnvironment(session, principal);
		expect(body).toEqual(expected);
	});
});
