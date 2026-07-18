/**
 * Error-report intake gate + handler (WC-017; SECURITY_DECISIONS DECISION 7).
 *
 * Drives dispatchRqo directly with an ANONYMOUS context (the machine-to-machine
 * posture) and flips the dynamic env keys the gate reads at call time
 * (readEnv — the install-gate pattern):
 *  - flag OFF → the EXACT Gate-1 unregistered-action shape (no existence leak);
 *  - flag ON + valid wire payload → 200, row appended with the RECEIVER-stamped
 *    source_ip;
 *  - strict schema: unknown fields REJECTED with a terse generic envelope;
 *  - oversize payload refused;
 *  - wrong/missing token (when required) → the unregistered-action shape, and
 *    the attempt still consumes throttle budget;
 *  - IP allowlist deny → 403;
 *  - per-(entity,ip) sliding-window throttle → 429 past the cap.
 *
 * Scratch hygiene: the throttle store is the per-run scratch sqlite (bunfig
 * preload); inserted rows are tracked and deleted in afterAll with a loud
 * 0-rows guard (the info_widget leak lesson).
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { ApiRequestContext } from '../../src/core/api/handler_context.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';

const UNDEFINED_METHOD = 'Undefined or unauthorized method (action)';

/** Unique per-run entity so throttle windows never bleed across runs. */
const ENTITY = `test_er_${process.pid}`;

const insertedIds: number[] = [];

function anon(
	clientIp = '203.0.113.9',
	reportToken: string | null = null,
	bodyByteLength?: number,
): ApiRequestContext {
	return {
		requestId: 't-er',
		clientIp,
		session: null,
		csrfCandidate: null,
		reportTokenCandidate: reportToken,
		bodyByteLength,
	};
}

function validWirePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		description: 'The section list renders blank after saving.',
		page_url: '/dedalo/core/page/?tipo=oh1',
		section_tipo: 'oh1',
		section_id: '1',
		user_agent: 'test-agent',
		js_errors: [
			{
				type: 'error',
				msg: 'boom',
				source: '/dedalo/core/page/js/index.js',
				line: 10,
				col: 2,
				stack: 'Error: boom\n  at index.js:10:2',
				time: '2026-07-10T10:00:00.000Z',
				count: 1,
			},
		],
		client_globals: {
			user_id: 5,
			dedalo_version: '7.0.0.dev',
			application_lang: 'lg-spa',
			data_lang: 'lg-spa',
		},
		user_id: 5,
		entity: ENTITY,
		entity_label: 'Test entity',
		dedalo_version: '7.0.0.dev',
		langs: { application: 'lg-spa', data: 'lg-spa' },
		sent_at: '2026-07-10T10:00:01.000Z',
		report_version: 1,
		...overrides,
	};
}

function rqo(options: Record<string, unknown>): Rqo {
	return { dd_api: 'dd_error_report_api', action: 'receive_report', options } as unknown as Rqo;
}

async function post(
	options: Record<string, unknown>,
	context: ApiRequestContext = anon(),
): Promise<{ status: number; body: Record<string, unknown> }> {
	const result = await dispatchRqo(rqo(options), context);
	const reportId = (result.body as { report_id?: unknown }).report_id;
	if (typeof reportId === 'number') insertedIds.push(reportId);
	return result;
}

beforeAll(() => {
	process.env.DEDALO_ERROR_REPORT_RECEIVER = 'true';
});

afterEach(() => {
	// Reset the optional gates between tests; the flag itself stays on.
	// '' = unset for every gate predicate (biome bans `delete`; assigning
	// undefined would set the literal string "undefined").
	process.env.DEDALO_ERROR_REPORT_TOKEN = '';
	process.env.DEDALO_ERROR_REPORT_ALLOWED_IPS = '';
});

afterAll(async () => {
	process.env.DEDALO_ERROR_REPORT_RECEIVER = '';
	if (insertedIds.length > 0) {
		// Bun.sql binds a JS array as bare text — pass a PG array literal + cast.
		const deleted = (await sql.unsafe(
			'DELETE FROM dedalo_ts_error_reports WHERE id = ANY($1::bigint[]) RETURNING id',
			[`{${insertedIds.join(',')}}`],
		)) as { id: number }[];
		// Loud cleanup (the info_widget lesson): a wrong-table/no-op delete is
		// a test failure, never a silent scratch leak.
		expect(deleted.length).toBe(insertedIds.length);
	}
});

describe('error-report intake (WC-017)', () => {
	test('flag OFF → the exact Gate-1 unregistered-action shape (no existence leak)', async () => {
		process.env.DEDALO_ERROR_REPORT_RECEIVER = '';
		try {
			const result = await post(validWirePayload());
			expect(result.status).toBe(400);
			expect(result.body.msg).toBe(UNDEFINED_METHOD);
		} finally {
			process.env.DEDALO_ERROR_REPORT_RECEIVER = 'true';
		}
	});

	test('flag ON + valid payload → 200, row appended, source_ip receiver-stamped', async () => {
		const result = await post(validWirePayload(), anon('198.51.100.7'));
		expect(result.status).toBe(200);
		expect(result.body.result).toBe(true);
		const reportId = result.body.report_id as number;
		expect(typeof reportId).toBe('number');

		const rows = (await sql.unsafe(
			'SELECT source_ip, entity, user_id, description, received_at::text AS received_at, js_errors, context FROM dedalo_ts_error_reports WHERE id = $1',
			[reportId],
		)) as Record<string, unknown>[];
		expect(rows.length).toBe(1);
		// The receiver's ONLY trusted fields are its own stamps.
		expect(rows[0]?.source_ip).toBe('198.51.100.7');
		expect(typeof rows[0]?.received_at).toBe('string');
		// Sender claims stored as-is (self-reported).
		expect(rows[0]?.entity).toBe(ENTITY);
		expect(rows[0]?.user_id).toBe(5);
		expect((rows[0]?.js_errors as unknown[]).length).toBe(1);
		expect((rows[0]?.context as { report_version?: unknown }).report_version).toBe(1);
	});

	test('screenshot: a valid image data URL is accepted and stored in context', async () => {
		// 1x1 transparent PNG — a well-formed data:image/png;base64 URL.
		const dataUrl =
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
		const result = await post(validWirePayload({ screenshot: dataUrl }), anon('198.51.100.8'));
		expect(result.status).toBe(200);
		const reportId = result.body.report_id as number;
		const rows = (await sql.unsafe('SELECT context FROM dedalo_ts_error_reports WHERE id = $1', [
			reportId,
		])) as Record<string, unknown>[];
		expect((rows[0]?.context as { screenshot?: unknown }).screenshot).toBe(dataUrl);
	});

	test('screenshot: a non-data URL (http) is refused — no fetchable-URL smuggling', async () => {
		const result = await post(validWirePayload({ screenshot: 'http://evil.example/x.png' }));
		expect(result.status).toBe(400);
		expect(result.body.msg).toBe('Invalid error report');
	});

	test('screenshot: omitted entirely still validates (optional, cross-version wire)', async () => {
		const payload = validWirePayload();
		expect('screenshot' in payload).toBe(false);
		const result = await post(payload, anon('198.51.100.11'));
		expect(result.status).toBe(200);
	});

	test('strict schema: an unknown field is REJECTED with a terse generic envelope', async () => {
		const result = await post(validWirePayload({ smuggled: 'field' }));
		expect(result.status).toBe(400);
		expect(result.body.msg).toBe('Invalid error report');
		// No field-level detail leaks (IN-6).
		expect(JSON.stringify(result.body)).not.toContain('smuggled');
	});

	test('identifier chokepoint: a non-tipo section_tipo is refused', async () => {
		const result = await post(validWirePayload({ section_tipo: 'oh1; DROP TABLE x' }));
		expect(result.status).toBe(400);
		expect(result.body.msg).toBe('Invalid error report');
	});

	test('oversize payload (beyond 256 KiB) is refused before parsing', async () => {
		const result = await post(validWirePayload({ description: 'x'.repeat(300 * 1024) }));
		expect(result.status).toBe(400);
		expect(result.body.msg).toBe('Invalid error report');
	});

	test('token required: wrong/missing → unregistered-action shape; correct → accepted', async () => {
		process.env.DEDALO_ERROR_REPORT_TOKEN = 'fleet-secret';

		const missing = await post(validWirePayload());
		expect(missing.status).toBe(400);
		expect(missing.body.msg).toBe(UNDEFINED_METHOD);

		const wrong = await post(validWirePayload(), anon('203.0.113.9', 'guess'));
		expect(wrong.status).toBe(400);
		expect(wrong.body.msg).toBe(UNDEFINED_METHOD);

		const right = await post(validWirePayload(), anon('203.0.113.9', 'fleet-secret'));
		expect(right.status).toBe(200);
		expect(right.body.result).toBe(true);
	});

	test('IP allowlist: a non-listed caller gets 403; loopback shorthand admits local', async () => {
		process.env.DEDALO_ERROR_REPORT_ALLOWED_IPS = 'loopback, 192.0.2.1';

		const denied = await post(validWirePayload(), anon('198.51.100.99'));
		expect(denied.status).toBe(403);

		const listed = await post(validWirePayload(), anon('192.0.2.1'));
		expect(listed.status).toBe(200);

		const local = await post(validWirePayload(), anon('local'));
		expect(local.status).toBe(200);
	});

	test('throttle: the cap closes the window per IP — junk consumes budget too', async () => {
		// A dedicated IP so this test owns its window.
		const ip = '203.0.113.77';
		// 30 rejected junk posts (invalid schema — still recorded BEFORE parsing).
		for (let index = 0; index < 30; index++) {
			const junk = await post({ junk: true }, anon(ip));
			expect(junk.status).toBe(400);
		}
		// The 31st request — even a VALID one — is throttled.
		const result = await post(validWirePayload(), anon(ip));
		expect(result.status).toBe(429);
	});

	test('throttle is per-IP: rotating the attacker-controlled entity does NOT mint fresh buckets (S2 fix)', async () => {
		const ip = '203.0.113.88';
		// Rotate a DISTINCT claimed entity on every post — if the key folded in
		// `entity`, each would land in its own bucket and never trip the cap.
		for (let index = 0; index < 30; index++) {
			const junk = await post({ entity: `rotated_${index}`, junk: true }, anon(ip));
			expect(junk.status).toBe(400);
		}
		// The 31st, with yet another fresh entity, is STILL throttled — the key
		// ignores `entity` entirely.
		const result = await post(validWirePayload({ entity: 'rotated_final' }), anon(ip));
		expect(result.status).toBe(429);
	});

	test('Content-Length fast-reject: an oversize declared body is refused before the schema', async () => {
		const result = await post(
			validWirePayload(),
			anon('192.0.2.55', null, 300 * 1024), // declares > 256 KiB
		);
		expect(result.status).toBe(400);
		expect(result.body.msg).toBe('Invalid error report');
	});
});
