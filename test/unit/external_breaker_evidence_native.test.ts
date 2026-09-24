/**
 * THE BREAKER'S EVIDENCE LAW, and the log that does not flood (2026-09-24).
 *
 * The measured defect: a portal sent unpadded / LOCAL ids to Zenon, Zenon
 * answered `400 Error loading record` three times — three correct answers about
 * three bad requests — and the breaker counted them as service failures and
 * opened the circuit for EVERY Zenon lookup on the install. Every refused lookup
 * after that logged a full ExternalServiceError with a stack.
 *
 * What is proven here, outcome by outcome:
 *   - 3× 400 on one id does NOT open the circuit (nor retry, nor count);
 *   - 3× 503 and 3× timeout DO open it;
 *   - a 4xx is NEUTRAL — it neither counts nor resets the service-failure streak;
 *   - a half-open probe that got a 4xx is released, not judged;
 *   - refusals while open: ONE transition line, N COUNTED (snapshot + counter);
 *   - recovery logs ONCE, and a failed probe logs one re-open;
 *   - on the record path a 400/404 degrades that record to `not_found`, and a
 *     repeated 400 for the same id is logged once, then counted.
 *
 * NO NETWORK: the fetch and the SSRF guard are injected (the transport seam the
 * sibling external gates use). The record-path cases read `test3`'s Zenon
 * api_config from the suite DB's generic `test` TLD ontology — read-only.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { getCounters } from '../../src/core/api/counters.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import {
	breakerSnapshot,
	checkBreaker,
	resetBreakerForOrigin,
} from '../../src/external/breaker.ts';
import {
	drainInFlightExternalFetches,
	externalRowViewKey,
	fetchExternalRows,
} from '../../src/external/cache.ts';
import {
	type ExternalServiceError,
	logExternalError,
	resetExternalLogDedupForTests,
} from '../../src/external/errors.ts';
import {
	recordAnswerSnapshot,
	resetRecordAnswersForTests,
	SUSPECT_STREAK,
} from '../../src/external/record_answers.ts';
import { zenon } from '../../src/external/services/zenon.ts';
import { overrideExternalSettingsForTests } from '../../src/external/settings.ts';
import type { ExternalFetchImpl, TransportDeps } from '../../src/external/transport.ts';
import { fetchExternalJson } from '../../src/external/transport.ts';

const HOST = 'zenon.dainst.org';
const ORIGIN = `https://${HOST}`;
const KEY = `zenon|${ORIGIN}`;
const SECTION = 'test3';
const COOLDOWN_MS = 1000;
const request = { url: `${ORIGIN}/api/v1/record?id=000065686&lgn=en`, method: 'GET' as const };

/** Every console line the subsystem prints, by channel (+ the logged error's message). */
interface LogCapture {
	readonly lines: { channel: string; text: string; message: string }[];
	restore(): void;
}

function captureLogs(): LogCapture {
	const lines: { channel: string; text: string; message: string }[] = [];
	const spies = (['warn', 'error', 'info', 'log'] as const).map((channel) =>
		spyOn(console, channel).mockImplementation((...args: unknown[]) => {
			lines.push({
				channel,
				text: String(args[0]),
				message: args[1] instanceof Error ? args[1].message : '',
			});
		}),
	);
	return {
		lines,
		restore: () => {
			for (const spy of spies) spy.mockRestore();
		},
	};
}

function externalLines(capture: LogCapture): string[] {
	return capture.lines.map((l) => l.text).filter((t) => t.startsWith('[external:'));
}

/** The circuit as seen at the FAKE clock the calls ran on (default 1000 ms). */
function circuit(at = 1000) {
	return breakerSnapshot(at).find((entry) => entry.key === KEY);
}

/** Deps answering `status` (or hanging until the timeout when 'timeout'). */
function answering(
	status: number | 'timeout',
	now: number,
	calls: string[] = [],
): TransportDeps & { fetchImpl: ExternalFetchImpl } {
	return {
		fetchImpl: (url, init) => {
			calls.push(url);
			if (status === 'timeout') {
				return new Promise((_resolve, reject) => {
					init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
				});
			}
			const id = new URL(url).searchParams.get('id') ?? '';
			return Promise.resolve(
				status === 200
					? new Response(JSON.stringify({ records: [{ id, title: `t ${id}` }], status: 'OK' }))
					: new Response('{"status":"ERROR"}', { status }),
			);
		},
		assertPublicUrlImpl: async (uri: string) => ({ url: new URL(uri), addresses: ['141.100.1.1'] }),
		now: () => now,
		random: () => 0,
		sleep: async () => undefined,
	};
}

async function call(deps: TransportDeps): Promise<unknown> {
	return fetchExternalJson({ model: zenon, request, deps }).catch((e: unknown) => e);
}

let logs: LogCapture;

beforeEach(async () => {
	overrideExternalSettingsForTests({
		enabled: true,
		disabledServices: [],
		allowedHosts: [HOST],
		timeoutMs: 10,
		retryAttempts: 2,
		maxConcurrency: 4,
		breakerCooldownMs: COOLDOWN_MS,
		softTtlMs: 300_000,
	});
	resetBreakerForOrigin('zenon', ORIGIN);
	resetExternalLogDedupForTests();
	resetRecordAnswersForTests();
	await clearOntologyDerivedCaches();
	logs = captureLogs();
});

afterEach(async () => {
	logs.restore();
	await drainInFlightExternalFetches();
	overrideExternalSettingsForTests(null);
	resetBreakerForOrigin('zenon', ORIGIN);
	resetExternalLogDedupForTests();
	resetRecordAnswersForTests();
});

describe('only SERVICE failures open the circuit', () => {
	test('3× 400 on one id: no retry, nothing counted, the circuit stays closed', async () => {
		const calls: string[] = [];
		for (let index = 0; index < 3; index++) {
			const error = (await call(answering(400, 1000, calls))) as ExternalServiceError;
			expect(error.kind).toBe('http_status');
			expect(error.status).toBe(400);
		}
		expect(calls.length).toBe(3); // one socket per call: a 400 is an answer, never retried
		expect(circuit()).toBeUndefined(); // nothing counted
		// …so the NEXT lookup (a different, valid record) reaches the service.
		expect(await call(answering(200, 1100, calls))).toMatchObject({ status: 'OK' });
		expect(calls.length).toBe(4);
	});

	test('every answer-about-the-request 4xx is neutral (401/403/404/410/422 too)', async () => {
		for (const status of [401, 403, 404, 410, 422]) {
			for (let index = 0; index < 3; index++) await call(answering(status, 1000));
		}
		expect(circuit()).toBeUndefined();
	});

	test('3× 503 opens it', async () => {
		for (let index = 0; index < 3; index++) {
			expect(((await call(answering(503, 1000))) as ExternalServiceError).kind).toBe('http_status');
		}
		expect(circuit()).toMatchObject({ failures: 3, open: true });
		const calls: string[] = [];
		const refused = (await call(answering(200, 1100, calls))) as ExternalServiceError;
		expect(refused.kind).toBe('circuit_open');
		expect(calls).toEqual([]); // no socket
	});

	test('3× timeout opens it; so do 429 and 408', async () => {
		for (let index = 0; index < 3; index++) {
			expect(((await call(answering('timeout', 1000))) as ExternalServiceError).kind).toBe(
				'timeout',
			);
		}
		expect(circuit()?.open).toBe(true);
		for (const status of [429, 408]) {
			resetBreakerForOrigin('zenon', ORIGIN);
			for (let index = 0; index < 3; index++) await call(answering(status, 1000));
			expect(circuit()?.open, `status ${status}`).toBe(true);
		}
	});

	test('3× connection failure (`transport`) opens it', async () => {
		const refusing: TransportDeps = {
			...answering(200, 1000),
			fetchImpl: async () => {
				throw new Error('ECONNREFUSED');
			},
		};
		for (let index = 0; index < 3; index++) {
			expect(((await call(refusing)) as ExternalServiceError).kind).toBe('transport');
		}
		expect(circuit()?.open).toBe(true);
	});

	test('a 4xx neither counts NOR resets the streak: 503, 503, 400, 503 opens', async () => {
		await call(answering(503, 1000));
		await call(answering(503, 1000));
		await call(answering(400, 1000));
		expect(circuit()).toMatchObject({ failures: 2, open: false });
		await call(answering(503, 1000));
		expect(circuit()).toMatchObject({ failures: 3, open: true });
	});

	test('a SUCCESS still resets it: 503, 503, 200, 503 stays closed', async () => {
		await call(answering(503, 1000));
		await call(answering(503, 1000));
		await call(answering(200, 1000));
		await call(answering(503, 1000));
		expect(circuit()).toMatchObject({ failures: 1, open: false });
	});
});

describe('the half-open probe stays correct', () => {
	async function openIt(): Promise<void> {
		for (let index = 0; index < 3; index++) await call(answering(503, 1000));
		expect(circuit()?.open).toBe(true);
	}

	test('a probe answered 4xx is RELEASED: still half-open, the next call probes and closes', async () => {
		await openIt();
		const calls: string[] = [];
		const probe = (await call(answering(400, 2500, calls))) as ExternalServiceError;
		expect(probe.status).toBe(400);
		expect(calls.length).toBe(1); // the probe had its socket, once
		expect(circuit(2500)).toMatchObject({ halfOpen: true, failures: 3 });
		// Not wedged, not re-opened for a fresh cooldown: the next call is a probe.
		expect(await call(answering(200, 2600, calls))).toMatchObject({ status: 'OK' });
		expect(calls.length).toBe(2);
		expect(circuit()).toBeUndefined();
	});

	test('a probe that fails with a SERVICE failure re-opens it for a fresh cooldown', async () => {
		await openIt();
		await call(answering(503, 2500));
		expect(circuit(2600)).toMatchObject({ open: true, halfOpen: false, failures: 4 });
		const refused = (await call(answering(200, 3000))) as ExternalServiceError;
		expect(refused.kind).toBe('circuit_open'); // 3000 − 2500 < cooldown
	});
});

describe('no log flood', () => {
	test('refusals while open: ONE transition line, N counted — then ONE recovery line', async () => {
		const before = getCounters().external_circuit_refusals ?? 0;
		for (let index = 0; index < 3; index++) await call(answering(503, 1000));
		const opened = externalLines(logs);
		expect(opened.length).toBe(1);
		expect(opened[0]).toContain('external.circuit_open');
		expect(opened[0]).toContain(`origin=${ORIGIN}`);
		// The tripping failure and the cooldown are named (in the error's message).
		const warned = logs.lines.find((l) => l.text.includes('external.circuit_open'));
		expect(warned).toBeDefined();

		// 25 refused lookups through the ROW path (which logs every per-record failure).
		const targets = Array.from({ length: 25 }, (_unused, index) => ({
			sectionTipo: SECTION,
			remoteId: String(100 + index).padStart(9, '0'),
			remoteFields: ['id'],
		}));
		const views = await fetchExternalRows(targets, {
			deps: answering(200, 1200),
			dataLang: 'lg-eng',
		});
		expect([...views.values()].every((view) => view.reason === 'circuit_open')).toBe(true);
		expect(externalLines(logs).length).toBe(1); // still only the opening
		expect(circuit()?.refused).toBe(25);
		expect((getCounters().external_circuit_refusals ?? 0) - before).toBe(25);

		// Recovery: the probe succeeds ⇒ one info line, naming what was refused.
		await call(answering(200, 2500));
		const closed = externalLines(logs).filter((line) => line.includes('circuit_closed'));
		expect(closed.length).toBe(1);
		expect(closed[0]).toContain('refused=25');
		expect(closed[0]).toContain(`origin=${ORIGIN}`);
		// …and a healthy service after that logs nothing more.
		await call(answering(200, 2600));
		expect(externalLines(logs).length).toBe(2);
	});

	test('calls already in flight that fail AFTER the opening add no second line', async () => {
		// Six calls admitted while the circuit was still closed; all fail together.
		let release: () => void = () => undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const slow: TransportDeps = {
			...answering(503, 1000),
			fetchImpl: async () => {
				await gate;
				return new Response('{}', { status: 503 });
			},
		};
		overrideExternalSettingsForTests({
			enabled: true,
			allowedHosts: [HOST],
			retryAttempts: 0,
			maxConcurrency: 8,
			breakerCooldownMs: COOLDOWN_MS,
		});
		const pending = Array.from({ length: 6 }, () => call(slow));
		release();
		await Promise.all(pending);
		expect(circuit()).toMatchObject({ failures: 6, open: true });
		expect(externalLines(logs).length).toBe(1);
	});

	test('a failed probe logs ONE re-open line per cooldown', async () => {
		for (let index = 0; index < 3; index++) await call(answering(503, 1000));
		for (let index = 0; index < 10; index++) await call(answering(200, 1500)); // refused
		await call(answering(503, 2500)); // the probe fails
		const lines = externalLines(logs);
		expect(lines.length).toBe(2);
		const reopened = logs.lines.filter((l) => l.text.includes('external.circuit_open'));
		expect(reopened.length).toBe(2);
	});

	test('the same failure CLASS is logged ONCE per window, then counted — whatever the id', async () => {
		const before = getCounters().external_log_suppressed ?? 0;
		// A real ExternalServiceError, built by the door itself.
		const failureFor = async (remoteId: string, status = 400) =>
			(await fetchExternalJson({
				model: zenon,
				request,
				remoteId,
				deps: answering(status, 1000),
			}).catch((e: unknown) => e)) as ExternalServiceError;
		const failure = await failureFor('000000001');
		for (let index = 0; index < 5; index++) logExternalError(failure, 10_000 + index);
		expect(externalLines(logs).length).toBe(1);
		expect(logs.lines[0]?.text).toContain('id=000000001'); // the example id is named
		expect((getCounters().external_log_suppressed ?? 0) - before).toBe(4);
		// ANOTHER ID of the same class is the same line: an API-wide rejection of
		// every id is ONE line per window, not one stack per record.
		for (let index = 2; index < 50; index++) {
			logExternalError(await failureFor(String(index).padStart(9, '0')), 10_010);
		}
		expect(externalLines(logs).length).toBe(1);
		expect((getCounters().external_log_suppressed ?? 0) - before).toBe(4 + 48);
		// A different CLASS (another status) is its own line.
		logExternalError(await failureFor('000000002', 422), 10_020);
		expect(externalLines(logs).length).toBe(2);
		// Past the window the first class is said again (once).
		logExternalError(failure, 10_000 + 11 * 60_000);
		expect(externalLines(logs).length).toBe(3);
	});

	test('a failed probe re-opens with the refusals of THAT period, not a running total', async () => {
		for (let index = 0; index < 3; index++) await call(answering(503, 1000));
		for (let index = 0; index < 25; index++) await call(answering(200, 1500)); // refused
		await call(answering(503, 2500)); // probe fails → re-open, period 1 refused 25
		for (let index = 0; index < 10; index++) await call(answering(200, 3000)); // refused
		await call(answering(503, 4000)); // probe fails → re-open, period 2 refused 10
		const reopened = logs.lines
			.filter((l) => l.text.includes('external.circuit_open'))
			.map((l) => l.message);
		expect(reopened.length).toBe(3);
		expect(reopened[1]).toContain('refused=25 in the last period');
		expect(reopened[2]).toContain('refused=10 in the last period');
		// …and the closing line counts the LAST period only.
		for (let index = 0; index < 4; index++) await call(answering(200, 4500)); // refused
		await call(answering(200, 5500)); // the probe succeeds
		const closed = externalLines(logs).filter((line) => line.includes('circuit_closed'));
		expect(closed.length).toBe(1);
		expect(closed[0]).toContain('refused=4');
	});
});

describe('the record path degrades ONE record, never the service', () => {
	test('a 400 for one id is `not_found`, logged once however often it is asked', async () => {
		const target = { sectionTipo: SECTION, remoteId: '12281', remoteFields: ['id'] };
		for (let round = 0; round < 3; round++) {
			await clearOntologyDerivedCaches(); // force a refetch every round
			const views = await fetchExternalRows([target], {
				deps: answering(400, 1000),
				dataLang: 'lg-eng',
			});
			const view = views.get(externalRowViewKey(SECTION, '12281'));
			expect(view?.status).toBe('not_found');
			expect(view?.row).toBeNull();
		}
		const lines = externalLines(logs);
		expect(lines.length).toBe(1);
		expect(lines[0]).toContain('status=400');
		expect(lines[0]).toContain('id=12281');
		expect(circuit()).toBeUndefined();
		// …and a valid record is still fetched.
		const ok = await fetchExternalRows(
			[{ sectionTipo: SECTION, remoteId: '000065686', remoteFields: ['id'] }],
			{ deps: answering(200, 1100), dataLang: 'lg-eng' },
		);
		expect(ok.get(externalRowViewKey(SECTION, '000065686'))?.status).toBe('ok');
	});

	test('a 404 is the clean "not there": not_found, negative-cached, not logged', async () => {
		const calls: string[] = [];
		const target = { sectionTipo: SECTION, remoteId: '000999999', remoteFields: ['id'] };
		for (let round = 0; round < 2; round++) {
			const views = await fetchExternalRows([target], {
				deps: answering(404, 1000, calls),
				dataLang: 'lg-eng',
			});
			expect(views.get(externalRowViewKey(SECTION, '000999999'))?.status).toBe('not_found');
		}
		expect(calls.length).toBe(1);
		expect(externalLines(logs)).toEqual([]);
	});

	test('a 403 (our credential) stays a named `unavailable`, not a silent not_found', async () => {
		const views = await fetchExternalRows(
			[{ sectionTipo: SECTION, remoteId: '000000403', remoteFields: ['id'] }],
			{ deps: answering(403, 1000), dataLang: 'lg-eng' },
		);
		const view = views.get(externalRowViewKey(SECTION, '000000403'));
		expect(view?.status).toBe('unavailable');
		expect(view?.reason).toBe('http_status');
		expect(circuit()).toBeUndefined();
	});
});

describe('a caller with MANY targets cannot outrun the breaker (2026-09-24)', () => {
	/** A service that answers 503 after `delayMs` — slow enough that calls overlap. */
	function slow503(calls: string[], delayMs = 5): TransportDeps {
		return {
			...answering(503, 1000),
			fetchImpl: async (url) => {
				calls.push(url);
				await Bun.sleep(delayMs);
				return new Response('{}', { status: 503 });
			},
		};
	}

	const TARGETS = 40;
	const RETRIES = 2;
	const CONCURRENCY = 4;
	const FAILURE_THRESHOLD = 3;
	/**
	 * The worst case once the breaker is honoured: the THRESHOLD calls that open
	 * it, plus the calls holding the other slots at that moment, each at most its
	 * full attempts. Every later call is refused without a socket. Before the fix
	 * every target ran its full attempts: TARGETS × (1 + RETRIES) = 120.
	 */
	const CEILING = (FAILURE_THRESHOLD + CONCURRENCY - 1) * (1 + RETRIES);

	test('queued door calls re-check the breaker when they get a slot', async () => {
		const calls: string[] = [];
		const deps = slow503(calls);
		// Every call passes the arrival check while the circuit is closed, then queues.
		const errors = (await Promise.all(
			Array.from({ length: TARGETS }, (_unused, index) =>
				fetchExternalJson({
					model: zenon,
					request,
					remoteId: String(index).padStart(9, '0'),
					deps,
				}).catch((e: unknown) => e),
			),
		)) as ExternalServiceError[];
		expect(calls.length).toBeLessThanOrEqual(CEILING); // was TARGETS × 3 = 120
		expect(circuit()?.open).toBe(true);
		const refused = errors.filter((error) => error.kind === 'circuit_open').length;
		expect(refused).toBeGreaterThanOrEqual(TARGETS - (FAILURE_THRESHOLD + CONCURRENCY - 1));
	});

	test('fetchExternalRows starts records a few at a time: an opened circuit refuses the rest', async () => {
		const calls: string[] = [];
		const targets = Array.from({ length: TARGETS }, (_unused, index) => ({
			sectionTipo: SECTION,
			remoteId: String(200 + index).padStart(9, '0'),
			remoteFields: ['id'],
		}));
		const views = await fetchExternalRows(targets, { deps: slow503(calls), dataLang: 'lg-eng' });
		expect(calls.length).toBeLessThanOrEqual(CEILING);
		const reasons = [...views.values()].map((view) => view.reason);
		expect(reasons.filter((reason) => reason === 'circuit_open').length).toBeGreaterThanOrEqual(
			TARGETS - (FAILURE_THRESHOLD + CONCURRENCY - 1),
		);
	});

	test('a hanging service: timeouts stop at the circuit, not at the last target', async () => {
		const calls: string[] = [];
		const hanging: TransportDeps = {
			...answering('timeout', 1000, calls),
		};
		const targets = Array.from({ length: TARGETS }, (_unused, index) => ({
			sectionTipo: SECTION,
			remoteId: String(300 + index).padStart(9, '0'),
			remoteFields: ['id'],
		}));
		await fetchExternalRows(targets, { deps: hanging, dataLang: 'lg-eng' });
		expect(calls.length).toBeLessThanOrEqual(CEILING); // was 120 timeouts
		expect(circuit()?.open).toBe(true);
	});

	test('a call whose circuit opened while it waited to retry does not retry', async () => {
		const calls: string[] = [];
		const late: TransportDeps = {
			...answering(503, 1000, calls),
			// Between its first 503 and its retry, three other calls open the circuit.
			sleep: async () => {
				for (let index = 0; index < 3; index++) await call(answering(503, 1000));
			},
		};
		expect(((await call(late)) as ExternalServiceError).status).toBe(503);
		expect(calls.length).toBe(1); // was 1 + RETRIES: two more attempts at a sick service
		expect(circuit()?.open).toBe(true);
	});

	test('a Stop starts no further record', async () => {
		const controller = new AbortController();
		const calls: string[] = [];
		overrideExternalSettingsForTests({
			enabled: true,
			allowedHosts: [HOST],
			retryAttempts: 0,
			maxConcurrency: 1,
			breakerCooldownMs: COOLDOWN_MS,
			softTtlMs: 300_000,
		});
		const deps: TransportDeps = {
			...answering(200, 1000),
			fetchImpl: async (url) => {
				calls.push(url);
				controller.abort(); // the user pressed Stop while the first record was asked
				const id = new URL(url).searchParams.get('id') ?? '';
				return new Response(JSON.stringify({ records: [{ id }], status: 'OK' }));
			},
		};
		const targets = Array.from({ length: 10 }, (_unused, index) => ({
			sectionTipo: SECTION,
			remoteId: String(400 + index).padStart(9, '0'),
			remoteFields: ['id'],
		}));
		const views = await fetchExternalRows(targets, {
			deps,
			dataLang: 'lg-eng',
			signal: controller.signal,
		});
		expect(calls.length).toBe(1);
		expect(views.size).toBe(1);
	});
});

describe('ONLY the probe settles the probe', () => {
	/** A call held at the socket until `release()`, answering `status`. */
	function held(status: number, now: number): { deps: TransportDeps; release: () => void } {
		let release: () => void = () => undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		return {
			deps: {
				...answering(status, now),
				fetchImpl: async () => {
					await gate;
					return new Response('{}', { status });
				},
			},
			release,
		};
	}

	beforeEach(() => {
		overrideExternalSettingsForTests({
			enabled: true,
			allowedHosts: [HOST],
			retryAttempts: 0,
			maxConcurrency: 8,
			breakerCooldownMs: COOLDOWN_MS,
		});
	});

	test('a late non-probe 4xx does not release the probe in flight', async () => {
		const late = held(400, 1000);
		const lateCall = call(late.deps); // admitted while closed; still at the socket
		for (let index = 0; index < 3; index++) await call(answering(503, 1000));
		const probe = held(200, 2500);
		const probeCall = call(probe.deps); // past the cooldown: THE probe
		await Bun.sleep(1);
		late.release();
		await lateCall; // the 400 lands while the probe is still out
		expect(checkBreaker('zenon', ORIGIN, 2600)).toBe('open'); // no second probe
		probe.release();
		await probeCall;
		expect(circuit()).toBeUndefined(); // the probe's success closed it
	});

	test('a late non-probe service failure neither re-opens (no line) nor frees the probe', async () => {
		const late = held(503, 1000);
		const lateCall = call(late.deps);
		for (let index = 0; index < 3; index++) await call(answering(503, 1000));
		expect(externalLines(logs).length).toBe(1); // the opening
		const probe = held(200, 2500);
		const probeCall = call(probe.deps);
		await Bun.sleep(1);
		late.release();
		await lateCall;
		expect(externalLines(logs).length).toBe(1); // no "re-opened" line from a non-probe
		expect(checkBreaker('zenon', ORIGIN, 2600)).toBe('open');
		probe.release();
		await probeCall;
		expect(circuit()).toBeUndefined();
	});
});

describe('a record endpoint that answers 4xx for EVERY id is not silent', () => {
	const ENDPOINT_KEY_PREFIX = 'zenon|';
	const targetsFrom = (start: number, count: number) =>
		Array.from({ length: count }, (_unused, index) => ({
			sectionTipo: SECTION,
			remoteId: String(start + index).padStart(9, '0'),
			remoteFields: ['id'],
		}));

	for (const status of [404, 400]) {
		test(`all-${status}: past the streak the cells read unavailable, ONE suspect line, the circuit stays closed`, async () => {
			const before = getCounters().external_record_endpoint_suspect ?? 0;
			const total = SUSPECT_STREAK + 15;
			const states: string[] = [];
			// One at a time, so the order of answers is the order of the streak.
			for (const target of targetsFrom(500, total)) {
				const views = await fetchExternalRows([target], {
					deps: answering(status, 1000),
					dataLang: 'lg-eng',
				});
				states.push(views.get(externalRowViewKey(SECTION, target.remoteId))?.status ?? '');
			}
			expect(states.slice(0, SUSPECT_STREAK - 1).every((state) => state === 'not_found')).toBe(
				true,
			);
			expect(states.slice(SUSPECT_STREAK - 1).every((state) => state === 'unavailable')).toBe(true);
			const suspect = logs.lines.filter((l) => l.message.includes('record endpoint suspect'));
			expect(suspect.length).toBe(1);
			expect(suspect[0]?.message).toContain(`${status}x${SUSPECT_STREAK}`);
			expect(suspect[0]?.message).toContain('/api/v1/record'); // the path an operator checks
			expect((getCounters().external_record_endpoint_suspect ?? 0) - before).toBe(1);
			// Per-record lines stay bounded: at most one per class (the unavailable
			// http_status reads share one line whatever the id).
			expect(externalLines(logs).length).toBeLessThanOrEqual(3);
			expect(circuit()).toBeUndefined(); // never hidden behind circuit_open
		});
	}

	test("one delivered record ends the episode: a 404 is again that record's not_found", async () => {
		for (const target of targetsFrom(600, SUSPECT_STREAK)) {
			await fetchExternalRows([target], { deps: answering(404, 1000), dataLang: 'lg-eng' });
		}
		expect(recordAnswerSnapshot().find((e) => e.key.startsWith(ENDPOINT_KEY_PREFIX))?.suspect).toBe(
			true,
		);
		const ok = await fetchExternalRows(targetsFrom(700, 1), {
			deps: answering(200, 1000),
			dataLang: 'lg-eng',
		});
		expect([...ok.values()][0]?.status).toBe('ok');
		expect(recordAnswerSnapshot()).toEqual([]);
		const gone = await fetchExternalRows(targetsFrom(701, 1), {
			deps: answering(404, 1000),
			dataLang: 'lg-eng',
		});
		expect([...gone.values()][0]?.status).toBe('not_found');
	});

	test('scattered not_founds between delivered records never make it suspect', async () => {
		for (let round = 0; round < 3 * SUSPECT_STREAK; round++) {
			const status = round % 2 === 0 ? 404 : 200;
			await fetchExternalRows(targetsFrom(800 + round, 1), {
				deps: answering(status, 1000),
				dataLang: 'lg-eng',
			});
		}
		expect(logs.lines.filter((l) => l.message.includes('record endpoint suspect'))).toEqual([]);
	});
});
