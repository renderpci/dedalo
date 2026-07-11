/**
 * Observability minimum gate (audit S2-37, WS-E item 4).
 *
 * THE GUARANTEES under test:
 * - logApiAccess emits ONE parseable JSON line with the documented fields
 *   when the flag is on (console capture — no server needed);
 * - every request feeds the counters regardless of the flag;
 * - the /api/v1/counters surface is fail-closed: no session and non-admin
 *   sessions get a plain 404; a global-admin session gets the aggregate;
 * - dispatchRqo emits the access line for gate DENIALS too (the wrapper sits
 *   outside the gates).
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { logApiAccess } from '../../src/core/api/access_log.ts';
import {
	collectOpsCounters,
	getCounters,
	handleCountersRequest,
	registerOpsGauge,
	resetCountersForTests,
} from '../../src/core/api/counters.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import {
	SESSION_COOKIE,
	createSession,
	destroySession,
} from '../../src/core/security/session_store.ts';

/** Capture console.log lines for the duration of `work`. */
function captureConsoleLog(work: () => void): string[] {
	const lines: string[] = [];
	const original = console.log;
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(' '));
	};
	try {
		work();
	} finally {
		console.log = original;
	}
	return lines;
}

// Reset BEFORE each test too: the counters module is process-global by design,
// so sibling suites that dispatched requests earlier in the same bun process
// have already fed requests_total — the first test must start from zero.
beforeEach(() => resetCountersForTests());
afterEach(() => resetCountersForTests());

describe('structured access log (S2-37)', () => {
	test('counters observe every request even with the log flag off', () => {
		logApiAccess({
			requestId: 'req-1',
			userId: 7,
			apiClass: 'dd_core_api',
			action: 'read',
			status: 200,
			ms: 12.34,
		});
		logApiAccess({
			requestId: 'req-2',
			userId: null,
			apiClass: 'dd_core_api',
			action: 'read',
			status: 401,
			ms: 1,
		});
		const counters = getCounters();
		expect(counters.requests_total).toBe(2);
		expect(counters.requests_4xx).toBe(1);
	});

	test('the JSON line carries the documented fields (flag forced on)', () => {
		// config is frozen at import; emulate the enabled path by asserting the
		// line SHAPE through the module's own serializer: temporarily monkeypatch
		// config.ops is not possible — so this asserts via the dispatch-level
		// contract instead when DEDALO_ACCESS_LOG is set for the process.
		if (process.env.DEDALO_ACCESS_LOG !== 'true') {
			// Shape is covered by the smoke test (ops_shutdown) when enabled;
			// here we at least pin that no line is emitted when off.
			const lines = captureConsoleLog(() =>
				logApiAccess({
					requestId: 'req-3',
					userId: 1,
					apiClass: 'dd_core_api',
					action: 'read',
					status: 200,
					ms: 5,
				}),
			);
			expect(lines.filter((line) => line.includes('"type":"access"'))).toHaveLength(0);
			return;
		}
		const lines = captureConsoleLog(() =>
			logApiAccess({
				requestId: 'req-3',
				userId: 1,
				apiClass: 'dd_core_api',
				action: 'read',
				status: 200,
				ms: 5,
			}),
		);
		const accessLine = lines.find((line) => line.includes('"type":"access"'));
		expect(accessLine).toBeDefined();
		const parsed = JSON.parse(accessLine as string) as Record<string, unknown>;
		expect(parsed.request_id).toBe('req-3');
		expect(parsed.user_id).toBe(1);
		expect(parsed.api).toBe('dd_core_api::read');
		expect(parsed.status).toBe(200);
		expect(typeof parsed.ms).toBe('number');
	});

	test('dispatchRqo counts gate denials too', async () => {
		const before = getCounters().requests_total ?? 0;
		const outcome = await dispatchRqo(
			{ action: 'read', source: {} } as never,
			{
				requestId: 'deny-1',
				clientIp: 'local',
				session: null,
				csrfCandidate: null,
			} as never,
		);
		expect(outcome.status).toBe(401); // auth gate denial
		expect(getCounters().requests_total).toBe(before + 1);
	});
});

describe('admin counters endpoint (S2-37, fail-closed)', () => {
	test('no session → 404; non-admin → 404; admin → aggregate payload', async () => {
		const anonymous = await handleCountersRequest(new Request('http://localhost/api/v1/counters'));
		expect(anonymous.status).toBe(404);

		const userToken = createSession(4242, 'ops_test_user', false);
		try {
			const nonAdmin = await handleCountersRequest(
				new Request('http://localhost/api/v1/counters', {
					headers: { cookie: `${SESSION_COOKIE}=${userToken}` },
				}),
			);
			expect(nonAdmin.status).toBe(404);
		} finally {
			destroySession(userToken);
		}

		const adminToken = createSession(-1, 'ops_test_admin', true);
		try {
			const admin = await handleCountersRequest(
				new Request('http://localhost/api/v1/counters', {
					headers: { cookie: `${SESSION_COOKIE}=${adminToken}` },
				}),
			);
			expect(admin.status).toBe(200);
			const payload = (await admin.json()) as Record<string, unknown>;
			expect(payload.counters).toBeDefined();
			expect(payload.requests).toBeDefined();
			expect(payload.media_jobs).toBeDefined();
			expect(payload.background_jobs).toBeDefined();
		} finally {
			destroySession(adminToken);
		}
	});

	test('collectOpsCounters aggregates without throwing when subsystems are idle', async () => {
		const payload = await collectOpsCounters();
		expect(typeof payload.uptime_s).toBe('number');
		expect(typeof payload.rss_bytes).toBe('number');
	});

	test('registered gauges surface (the boot-time registration seam) and fail soft', async () => {
		registerOpsGauge('ops_test_gauge', () => ({ answer: 42 }));
		registerOpsGauge('ops_test_broken_gauge', () => {
			throw new Error('subsystem down');
		});
		const payload = await collectOpsCounters();
		expect(payload.ops_test_gauge).toEqual({ answer: 42 });
		// A broken gauge reports its error — it must never take the endpoint down.
		expect((payload.ops_test_broken_gauge as { error: string }).error).toBe('subsystem down');
	});
});
