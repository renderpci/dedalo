/**
 * Raw record data view — the dedicated, hard-locked GET endpoint (admin tool,
 * core/api/raw_view.ts). Verifies the three gates that make it stricter than the
 * PHP read_raw path, all fail-closed:
 *   - unauthenticated            → 404 (no existence leak);
 *   - invalid identifiers        → 404 (before any SQL);
 *   - non-admin authenticated    → 403;
 *   - users section dd128        → 403, even for the superuser (data denylist);
 *   - admin + normal section     → 200, pretty-printed, same engine as read_raw.
 *
 * The identity gates (session/admin/identifier/denylist) run without Postgres —
 * the superuser resolves in-memory and the denylist refuses before any DB read.
 * The two DB-backed cases guard on a live-connection probe so the file is honest
 * on a machine without the shared database.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { handleRequest } from '../../src/server.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const context = { requestId: 'raw-view-test', startedAt: 0 };
const RAW_URL = '/dedalo/core/api/v1/raw';

// A known real record (same fixture the read_raw differential uses).
const SAMPLE_SECTION_TIPO = 'numisdata6';
const SAMPLE_SECTION_ID = 1;

function rawRequest(query: string, sessionToken?: string): Request {
	return new Request(`http://localhost${RAW_URL}?${query}`, {
		headers: sessionToken !== undefined ? { Cookie: `dedalo_ts_session=${sessionToken}` } : {},
	});
}

let dbReady = false;
beforeAll(async () => {
	try {
		await sql`SELECT 1`;
		dbReady = true;
	} catch {
		dbReady = false; // no shared DB on this machine — DB-backed cases skip honestly
	}
});

describe('raw record data view (dedicated GET, fail-closed)', () => {
	test('no session → 404 (endpoint not revealed)', async () => {
		const response = await handleRequest(
			rawRequest(`section_tipo=${SAMPLE_SECTION_TIPO}&section_id=${SAMPLE_SECTION_ID}`),
			context,
		);
		expect(response.status).toBe(404);
	});

	test('invalid section_tipo → 404 before any SQL', async () => {
		const token = createSession(-1, 'root', true); // superuser: no DB needed to pass the admin gate
		for (const badTipo of ['rsc167; DROP TABLE matrix', 'RSC167', 'notatipo', '']) {
			const response = await handleRequest(
				rawRequest(`section_tipo=${encodeURIComponent(badTipo)}&section_id=1`, token),
				context,
			);
			expect(response.status).toBe(404);
		}
	});

	test('invalid / missing section_id → 404', async () => {
		const token = createSession(-1, 'root', true);
		for (const badId of ['0', '-3', 'abc', '', '1.5']) {
			const response = await handleRequest(
				rawRequest(
					`section_tipo=${SAMPLE_SECTION_TIPO}&section_id=${encodeURIComponent(badId)}`,
					token,
				),
				context,
			);
			expect(response.status).toBe(404);
		}
	});

	test('users section (dd128) is refused even for the superuser', async () => {
		const token = createSession(-1, 'root', true); // superuser — the block overrides admin
		const response = await handleRequest(
			rawRequest(`section_tipo=${config.usersSectionTipo}&section_id=1`, token),
			context,
		);
		expect(response.status).toBe(403);
		const body = (await response.json()) as { result: unknown };
		expect(body.result).toBe(false); // no data returned
	});

	test('authenticated NON-admin → 403', async () => {
		if (!dbReady) return;
		// A user id with no global-admin locator resolves to isGlobalAdmin:false.
		const nonAdminId = 987654321;
		const principal = await resolvePrincipal(nonAdminId);
		expect(principal.isGlobalAdmin).toBe(false); // guard: fixture assumption holds
		const token = createSession(nonAdminId, 'nobody', false);
		const response = await handleRequest(
			rawRequest(`section_tipo=${SAMPLE_SECTION_TIPO}&section_id=${SAMPLE_SECTION_ID}`, token),
			context,
		);
		expect(response.status).toBe(403);
	});

	test('admin + normal section → 200 pretty JSON, same result as read_raw', async () => {
		if (!dbReady) return;
		const token = createSession(-1, 'root', true);
		const response = await handleRequest(
			rawRequest(`section_tipo=${SAMPLE_SECTION_TIPO}&section_id=${SAMPLE_SECTION_ID}`, token),
			context,
		);
		expect(response.status).toBe(200);

		const rawText = await response.text();
		// pretty_print: the body is indented (JSON.stringify(…, null, 2)).
		expect(rawText).toContain('\n  ');
		const body = JSON.parse(rawText) as { result: unknown[]; table: string | null };
		expect(Array.isArray(body.result)).toBe(true);
		expect(body.result.length).toBe(1);

		// Same engine as the POST read_raw handler: build the equivalent RQO and
		// compare the resolved raw rows (the endpoint just wires the SQO server-side).
		const session = getSession(token);
		const principal = await resolvePrincipal(-1);
		const readRawRqo = {
			action: 'read_raw',
			dd_api: 'dd_core_api',
			options: {
				section_tipo: SAMPLE_SECTION_TIPO,
				tipo: SAMPLE_SECTION_TIPO,
				model: 'section',
				type: 'section',
			},
			sqo: {
				section_tipo: [SAMPLE_SECTION_TIPO],
				filter_by_locators: [
					{ section_tipo: SAMPLE_SECTION_TIPO, section_id: String(SAMPLE_SECTION_ID) },
				],
				limit: 1,
			},
		};
		const dispatched = await dispatchRqo(readRawRqo as unknown as Rqo, {
			requestId: 'raw-view-cmp',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		});
		const dispatchedBody = dispatched.body as { result: unknown[]; table: string | null };
		expect(body.result).toEqual(dispatchedBody.result);
		expect(body.table).toBe(dispatchedBody.table);
	});
});
