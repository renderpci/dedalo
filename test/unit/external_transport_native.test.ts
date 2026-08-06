/**
 * THE OUTBOUND DOOR — the load-bearing order, proven step by step.
 *
 * Every case here asserts a REFUSAL HAPPENS EARLY ENOUGH: not just that the
 * request failed, but that the step after it never ran. That distinction is the
 * whole security argument — an allowlist consulted after DNS still leaks a
 * resolver lookup to an attacker-chosen name, and a credential attached before
 * the target is vetted is a credential an ontology edit can exfiltrate.
 *
 * NO NETWORK. The fetch and the SSRF guard are both injected; the guard stub
 * records whether it was called at all, which is how "before DNS" is testable.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { breakerSnapshot, resetBreakerForOrigin } from '../../src/external/breaker.ts';
import type { ExternalServiceModel } from '../../src/external/descriptor_types.ts';
import type { ExternalServiceError } from '../../src/external/errors.ts';
import { zenon } from '../../src/external/services/zenon.ts';
import { overrideExternalSettingsForTests } from '../../src/external/settings.ts';
import type { ExternalFetchImpl, TransportDeps } from '../../src/external/transport.ts';
import {
	activeConcurrency,
	fetchExternalJson,
	isAllowedExternalHost,
} from '../../src/external/transport.ts';

const HOST = 'zenon.dainst.org';
const ORIGIN = `https://${HOST}`;
const API_URL = `${ORIGIN}/api/v1/record`;
const VETTED_IP = '141.100.1.1';
const CREDENTIAL_KEY = 'DEDALO_EXTERNAL_ZENON_API_KEY';

const request = { url: `${API_URL}?id=000848571&lgn=en`, method: 'GET' as const };

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), { status, headers });
}

/** A guard stub that records its calls, so "before DNS" is observable. */
function guardStub(record: string[], addresses: string[] = [VETTED_IP]) {
	return async (uri: string) => {
		record.push('resolve');
		return { url: new URL(uri), addresses };
	};
}

beforeEach(() => {
	overrideExternalSettingsForTests({
		enabled: true,
		disabledServices: [],
		allowedHosts: [HOST],
		timeoutMs: 50,
		retryAttempts: 2,
		maxConcurrency: 4,
		breakerCooldownMs: 1000,
	});
	resetBreakerForOrigin('zenon', ORIGIN);
});

afterEach(() => {
	overrideExternalSettingsForTests(null);
	resetBreakerForOrigin('zenon', ORIGIN);
	delete process.env[CREDENTIAL_KEY];
});

describe('step 1 — the kill switches refuse without a socket', () => {
	test('the master switch off ⇒ disabled, no resolve, no fetch', async () => {
		overrideExternalSettingsForTests({ enabled: false, allowedHosts: [HOST] });
		const calls: string[] = [];
		const error = await fetchExternalJson({
			model: zenon,
			request,
			deps: {
				fetchImpl: async () => {
					calls.push('fetch');
					return jsonResponse({});
				},
				assertPublicUrlImpl: guardStub(calls),
			},
		}).catch((e: unknown) => e as ExternalServiceError);
		expect((error as ExternalServiceError).kind).toBe('disabled');
		expect(calls).toEqual([]);
	});

	test('a per-service kill switch refuses that service only', async () => {
		overrideExternalSettingsForTests({
			enabled: true,
			allowedHosts: [HOST],
			disabledServices: ['zenon'],
		});
		const error = (await fetchExternalJson({ model: zenon, request }).catch(
			(e: unknown) => e,
		)) as ExternalServiceError;
		expect(error.kind).toBe('disabled');
	});
});

describe('step 3 — the host allowlist, BEFORE any DNS', () => {
	test('a non-allowlisted host is refused and the resolver is never called', async () => {
		const calls: string[] = [];
		const error = (await fetchExternalJson({
			model: zenon,
			request: { url: 'https://evil.example.org/api/v1/record?id=1', method: 'GET' },
			deps: {
				fetchImpl: async () => {
					calls.push('fetch');
					return jsonResponse({});
				},
				assertPublicUrlImpl: guardStub(calls),
			},
		}).catch((e: unknown) => e)) as ExternalServiceError;
		expect(error.kind).toBe('blocked_host');
		expect(calls).toEqual([]); // no DNS, no socket
		// The error names the ORIGIN and never the query string.
		expect(error.origin).toBe('https://evil.example.org');
		expect(error.message).not.toContain('id=1');
	});

	test('an EMPTY allowlist refuses everything (the fail-closed default)', async () => {
		overrideExternalSettingsForTests({ enabled: true, allowedHosts: [] });
		expect(isAllowedExternalHost(HOST)).toBe(false);
		const error = (await fetchExternalJson({ model: zenon, request }).catch(
			(e: unknown) => e,
		)) as ExternalServiceError;
		expect(error.kind).toBe('blocked_host');
	});

	test('the comparison is host-only and case-insensitive; no wildcards', () => {
		overrideExternalSettingsForTests({ allowedHosts: ['zenon.dainst.org'] });
		expect(isAllowedExternalHost('ZENON.DAINST.ORG')).toBe(true);
		expect(isAllowedExternalHost('evil.zenon.dainst.org')).toBe(false);
		expect(isAllowedExternalHost('zenon.dainst.org.evil.net')).toBe(false);
	});

	test('a non-http scheme and embedded credentials are refused', async () => {
		for (const url of ['ftp://zenon.dainst.org/x', 'https://user:pw@zenon.dainst.org/x']) {
			const error = (await fetchExternalJson({
				model: zenon,
				request: { url, method: 'GET' },
			}).catch((e: unknown) => e)) as ExternalServiceError;
			expect(error.kind).toBe('blocked_host');
		}
	});
});

describe('step 4 — the SSRF guard and the socket pin', () => {
	test('a private address behind an allowlisted name is still refused', async () => {
		const error = (await fetchExternalJson({
			model: zenon,
			request,
			deps: {
				// the REAL guard's verdict shape for a name resolving to loopback
				assertPublicUrlImpl: async () => {
					throw new Error('ssrf: resolves to a private/reserved address (127.0.0.1)');
				},
				fetchImpl: async () => jsonResponse({}),
			},
		}).catch((e: unknown) => e)) as ExternalServiceError;
		expect(error.kind).toBe('blocked_host');
	});

	test('the socket is PINNED to a vetted address, with SNI and Host kept at the real name', async () => {
		let seenUrl = '';
		let seenServerName: string | undefined;
		let seenHost: string | null = null;
		const fetchImpl: ExternalFetchImpl = async (url, init) => {
			seenUrl = url;
			seenServerName = init.tls?.serverName;
			seenHost = new Headers(init.headers).get('Host');
			return jsonResponse({ ok: true });
		};
		await fetchExternalJson({
			model: zenon,
			request,
			deps: { fetchImpl, assertPublicUrlImpl: guardStub([]) },
		});
		expect(new URL(seenUrl).hostname).toBe(VETTED_IP);
		expect(seenServerName).toBe(HOST);
		expect(seenHost as string | null).toBe(HOST);
	});
});

describe('step 5 — the credential is attached ONLY after the target is vetted', () => {
	test('the guard runs before the credential exists on the request', async () => {
		process.env[CREDENTIAL_KEY] = 'super-secret';
		const order: string[] = [];
		const fetchImpl: ExternalFetchImpl = async (_url, init) => {
			order.push(
				new Headers(init.headers).get('Authorization') === 'Bearer super-secret'
					? 'fetch-with-credential'
					: 'fetch-without-credential',
			);
			return jsonResponse({ ok: true });
		};
		await fetchExternalJson({
			model: zenon,
			request,
			deps: { fetchImpl, assertPublicUrlImpl: guardStub(order) },
		});
		expect(order).toEqual(['resolve', 'fetch-with-credential']);
	});

	test('a refused host never reaches the credential attach', async () => {
		process.env[CREDENTIAL_KEY] = 'super-secret';
		const order: string[] = [];
		const error = (await fetchExternalJson({
			model: zenon,
			request: { url: 'https://evil.example.org/x', method: 'GET' },
			deps: {
				fetchImpl: async (_url, init) => {
					order.push(String(new Headers(init.headers).get('Authorization')));
					return jsonResponse({});
				},
				assertPublicUrlImpl: guardStub(order),
			},
		}).catch((e: unknown) => e)) as ExternalServiceError;
		expect(error.kind).toBe('blocked_host');
		expect(order).toEqual([]);
		expect(error.message).not.toContain('super-secret');
	});

	test('an unset credential means an unauthenticated request, not a failure', async () => {
		let header: string | null | undefined;
		await fetchExternalJson({
			model: zenon,
			request,
			deps: {
				fetchImpl: async (_url, init) => {
					header = new Headers(init.headers).get('Authorization');
					return jsonResponse({ ok: true });
				},
				assertPublicUrlImpl: guardStub([]),
			},
		});
		expect(header as string | null | undefined).toBeNull();
	});
});

describe('step 6 — the guarded read', () => {
	test('redirects are refused, not followed; Accept and method come from the adapter', async () => {
		let seen: RequestInit | undefined;
		await fetchExternalJson({
			model: zenon,
			request,
			deps: {
				fetchImpl: async (_url, init) => {
					seen = init;
					return jsonResponse({ ok: true });
				},
				assertPublicUrlImpl: guardStub([]),
			},
		});
		expect(seen?.redirect).toBe('error');
		expect(seen?.method).toBe('GET');
		expect(seen?.signal).toBeDefined();
		expect(new Headers(seen?.headers).get('Accept')).toBe('application/json');
	});

	test('a response beyond the byte ceiling is too_large — never truncated into a value', async () => {
		overrideExternalSettingsForTests({
			enabled: true,
			allowedHosts: [HOST],
			maxBytes: 16,
			retryAttempts: 0,
		});
		const error = (await fetchExternalJson({
			model: zenon,
			request,
			deps: {
				fetchImpl: async () => jsonResponse({ padding: 'x'.repeat(500) }),
				assertPublicUrlImpl: guardStub([]),
			},
		}).catch((e: unknown) => e)) as ExternalServiceError;
		expect(error.kind).toBe('too_large');
	});

	test('the timeout aborts the request', async () => {
		const hanging: ExternalFetchImpl = (_url, init) =>
			new Promise((_resolve, reject) => {
				init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
			});
		overrideExternalSettingsForTests({
			enabled: true,
			allowedHosts: [HOST],
			timeoutMs: 10,
			retryAttempts: 0,
		});
		const error = (await fetchExternalJson({
			model: zenon,
			request,
			deps: { fetchImpl: hanging, assertPublicUrlImpl: guardStub([]) },
		}).catch((e: unknown) => e)) as ExternalServiceError;
		expect(error.kind).toBe('timeout');
	});

	test('step 9 — a non-JSON body is `protocol`, and is NOT retried', async () => {
		let attempts = 0;
		const error = (await fetchExternalJson({
			model: zenon,
			request,
			deps: {
				fetchImpl: async () => {
					attempts++;
					return new Response('<html>maintenance</html>', { status: 200 });
				},
				assertPublicUrlImpl: guardStub([]),
			},
		}).catch((e: unknown) => e)) as ExternalServiceError;
		expect(error.kind).toBe('protocol');
		expect(attempts).toBe(1);
	});
});

describe('step 7 — the retry policy', () => {
	function retryDeps(statuses: number[], waits: number[], extra: Partial<TransportDeps> = {}) {
		let index = 0;
		return {
			fetchImpl: async () => {
				const status = statuses[Math.min(index, statuses.length - 1)] ?? 200;
				index++;
				return status === 200 ? jsonResponse({ ok: true }) : jsonResponse({}, status);
			},
			assertPublicUrlImpl: guardStub([]),
			random: () => 0.5,
			sleep: async (ms: number) => {
				waits.push(ms);
			},
			attempts: () => index,
			...extra,
		};
	}

	test('a 5xx is retried up to the configured count, then fails', async () => {
		const waits: number[] = [];
		const deps = retryDeps([500, 500, 500], waits);
		const error = (await fetchExternalJson({ model: zenon, request, deps }).catch(
			(e: unknown) => e,
		)) as ExternalServiceError;
		expect(error.kind).toBe('http_status');
		expect(error.status).toBe(500);
		expect(deps.attempts()).toBe(3); // 1 + retryAttempts(2)
	});

	test('a 5xx that recovers returns the payload', async () => {
		const waits: number[] = [];
		const deps = retryDeps([500, 200], waits);
		expect(await fetchExternalJson({ model: zenon, request, deps })).toEqual({ ok: true });
		expect(deps.attempts()).toBe(2);
	});

	test('a 429 is retried; a 404 and a 403 NEVER are (a 4xx is an answer)', async () => {
		const waits: number[] = [];
		const retried = retryDeps([429, 200], waits);
		await fetchExternalJson({ model: zenon, request, deps: retried });
		expect(retried.attempts()).toBe(2);

		for (const status of [400, 403, 404]) {
			resetBreakerForOrigin('zenon', ORIGIN);
			const notRetried = retryDeps([status], []);
			const error = (await fetchExternalJson({ model: zenon, request, deps: notRetried }).catch(
				(e: unknown) => e,
			)) as ExternalServiceError;
			expect(error.status).toBe(status);
			expect(notRetried.attempts()).toBe(1);
		}
	});

	test('the backoff is FULL JITTER: uniform in [0, base·2^attempt)', async () => {
		for (const random of [0, 0.999999]) {
			resetBreakerForOrigin('zenon', ORIGIN);
			const waits: number[] = [];
			const deps = retryDeps([500, 500, 500], waits, { random: () => random });
			await fetchExternalJson({ model: zenon, request, deps }).catch(() => undefined);
			expect(waits.length).toBe(2);
			expect(waits[0]).toBeGreaterThanOrEqual(0);
			expect(waits[0]).toBeLessThan(200); // base · 2^0
			expect(waits[1]).toBeLessThan(400); // base · 2^1
		}
	});

	test('Retry-After is honoured over the jitter', async () => {
		const waits: number[] = [];
		let index = 0;
		await fetchExternalJson({
			model: zenon,
			request,
			deps: {
				fetchImpl: async () => {
					index++;
					return index === 1
						? jsonResponse({}, 503, { 'retry-after': '2' })
						: jsonResponse({ ok: true });
				},
				assertPublicUrlImpl: guardStub([]),
				random: () => 0,
				sleep: async (ms: number) => {
					waits.push(ms);
				},
			},
		});
		expect(waits).toEqual([2000]);
	});
});

describe('step 8 — the circuit breaker', () => {
	/** One failing CALL (a 500 with retries disabled). */
	async function failOnce(now: number, calls: string[]): Promise<ExternalServiceError> {
		return (await fetchExternalJson({
			model: zenon,
			request,
			deps: {
				fetchImpl: async () => {
					calls.push('fetch');
					return jsonResponse({}, 500);
				},
				assertPublicUrlImpl: guardStub(calls),
				now: () => now,
			},
		}).catch((e: unknown) => e)) as ExternalServiceError;
	}

	test('3 consecutive failed calls open it; then NO socket is opened at all', async () => {
		overrideExternalSettingsForTests({
			enabled: true,
			allowedHosts: [HOST],
			retryAttempts: 0,
			breakerCooldownMs: 1000,
		});
		const calls: string[] = [];
		for (let index = 0; index < 3; index++) {
			expect((await failOnce(1000, calls)).kind).toBe('http_status');
		}
		const socketsBefore = calls.filter((c) => c === 'fetch').length;
		expect(socketsBefore).toBe(3);

		const shortCircuited = await failOnce(1500, calls); // still inside the cooldown
		expect(shortCircuited.kind).toBe('circuit_open');
		expect(calls.filter((c) => c === 'fetch').length).toBe(socketsBefore); // no new socket
		expect(calls.filter((c) => c === 'resolve').length).toBe(3); // no new DNS either
	});

	test('half-open admits EXACTLY ONE probe, and a success closes the circuit', async () => {
		overrideExternalSettingsForTests({
			enabled: true,
			allowedHosts: [HOST],
			retryAttempts: 0,
			breakerCooldownMs: 1000,
		});
		const calls: string[] = [];
		for (let index = 0; index < 3; index++) await failOnce(1000, calls);
		const fetchesAfterOpen = calls.filter((c) => c === 'fetch').length;

		// Past the cooldown: two concurrent callers, exactly one probe socket.
		const okDeps = (now: number) => ({
			fetchImpl: async () => {
				calls.push('fetch');
				return jsonResponse({ ok: true });
			},
			assertPublicUrlImpl: guardStub(calls),
			now: () => now,
		});
		const [first, second] = await Promise.allSettled([
			fetchExternalJson({ model: zenon, request, deps: okDeps(3000) }),
			fetchExternalJson({ model: zenon, request, deps: okDeps(3000) }),
		]);
		const outcomes = [first, second];
		expect(outcomes.filter((o) => o.status === 'fulfilled').length).toBe(1);
		expect(calls.filter((c) => c === 'fetch').length).toBe(fetchesAfterOpen + 1);
		const rejected = outcomes.find((o) => o.status === 'rejected');
		expect((rejected as PromiseRejectedResult).reason.kind).toBe('circuit_open');

		// The probe succeeded ⇒ the circuit is closed again.
		expect(await fetchExternalJson({ model: zenon, request, deps: okDeps(3100) })).toEqual({
			ok: true,
		});
	});

	test('a probe killed by a LOCAL bug releases the half-open state, and counts no failure', async () => {
		// The escape is real, not hypothetical: an adapter is DATA, and one naming a
		// credential key that is not in the config catalog makes catalogEntry throw
		// a plain Error on the way to the socket — past `attempt`'s classified
		// errors, straight out of the retry loop. Unsettled, that probe leaves
		// probeInFlight true forever: every later check refreshes touchedAt, so the
		// prune never reaps the entry and the origin answers `circuit_open` until a
		// restart — a permanent outage of a HEALTHY service, wearing the mask of a
		// remote one. Counting it as a failure would be just as wrong: a local
		// defect is hit on every request, so it would open the circuit by itself.
		overrideExternalSettingsForTests({
			enabled: true,
			allowedHosts: [HOST],
			retryAttempts: 0,
			breakerCooldownMs: 1000,
		});
		const calls: string[] = [];
		for (let index = 0; index < 3; index++) await failOnce(1000, calls);
		expect(breakerSnapshot().find((entry) => entry.key === `zenon|${ORIGIN}`)?.failures).toBe(3);

		const misdeclared: ExternalServiceModel = {
			...zenon,
			credentialCatalogKey: 'DEDALO_EXTERNAL_NOT_IN_THE_CATALOG',
		};
		const escaped = await fetchExternalJson({
			model: misdeclared,
			request,
			deps: {
				fetchImpl: async () => {
					calls.push('fetch');
					return jsonResponse({ ok: true });
				},
				assertPublicUrlImpl: guardStub(calls),
				now: () => 3000, // past the cooldown ⇒ this call IS the half-open probe
			},
		}).catch((error: unknown) => error);
		expect(escaped).toBeInstanceOf(Error);
		expect((escaped as Error).message).toContain('not in the catalog');
		expect((escaped as { kind?: string }).kind).toBeUndefined(); // NOT a classified failure

		// The local bug taught us nothing about the remote end: no failure counted.
		expect(breakerSnapshot().find((entry) => entry.key === `zenon|${ORIGIN}`)?.failures).toBe(3);

		// …and the probe is settled, so the next request is admitted and can close
		// the circuit. Under the wedge this rejects `circuit_open` with no socket.
		const healthy = {
			fetchImpl: async () => {
				calls.push('fetch');
				return jsonResponse({ ok: true });
			},
			assertPublicUrlImpl: guardStub(calls),
			now: () => 3100,
		};
		expect(await fetchExternalJson({ model: zenon, request, deps: healthy })).toEqual({ ok: true });
		expect(breakerSnapshot().some((entry) => entry.key === `zenon|${ORIGIN}`)).toBe(false);
	});
});

describe('the concurrency ceiling', () => {
	test('a 40-call burst never exceeds maxConcurrency in flight', async () => {
		overrideExternalSettingsForTests({
			enabled: true,
			allowedHosts: [HOST],
			maxConcurrency: 4,
			retryAttempts: 0,
		});
		let inFlight = 0;
		let peak = 0;
		const fetchImpl: ExternalFetchImpl = async () => {
			inFlight++;
			peak = Math.max(peak, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 1));
			inFlight--;
			return jsonResponse({ ok: true });
		};
		const deps = { fetchImpl, assertPublicUrlImpl: guardStub([]) };
		await Promise.all(
			Array.from({ length: 40 }, () => fetchExternalJson({ model: zenon, request, deps })),
		);
		expect(peak).toBeLessThanOrEqual(4);
		expect(peak).toBeGreaterThan(1); // the ceiling is a ceiling, not a serializer
	});

	test('callers arriving DURING a slot handoff cannot push it over the ceiling', async () => {
		// THE HANDOFF WINDOW. Releasing a slot only RESOLVES the next waiter — its
		// `active++` runs a microtask later. A burst that all arrives in one tick
		// (the test above) never sees that window: everyone is already queued. The
		// real shape does — a page's callers reach the door through their own
		// `await` chains (fetchExternalRows resolves one ontology binding per
		// record before it fetches), so one of them lands between the release and
		// the waiter's resume, sees a free slot that is already spoken for, and
		// takes it. Staggered microtask depths reproduce exactly that.
		overrideExternalSettingsForTests({
			enabled: true,
			allowedHosts: [HOST],
			maxConcurrency: 2,
			retryAttempts: 0,
		});
		let inFlight = 0;
		let peakInFlight = 0;
		let peakAccounted = 0;
		let unaccounted = 0;
		let calls = 0;
		const fetchImpl: ExternalFetchImpl = async () => {
			inFlight++;
			peakInFlight = Math.max(peakInFlight, inFlight);
			const accounted = activeConcurrency('zenon', ORIGIN);
			peakAccounted = Math.max(peakAccounted, accounted);
			// Every call in flight is a call the accounting KNOWS about. A slot map
			// entry dropped while a woken waiter was still en route would orphan that
			// waiter: its work would run outside activeConcurrency and outside the
			// ceiling of the entry the next caller creates.
			if (accounted < inFlight) unaccounted++;
			// Microtask-scale work, of UNEVEN length: a setTimeout would drain every
			// pending arrival before the first release and close the window this test
			// is about, and calls of equal length release in lockstep, which is the
			// one interleaving that hides both bugs.
			const hops = 1 + (calls++ % 2);
			for (let hop = 0; hop < hops; hop++) await Promise.resolve();
			inFlight--;
			return jsonResponse({ ok: true });
		};
		const deps = { fetchImpl, assertPublicUrlImpl: guardStub([]) };
		await Promise.all(
			Array.from({ length: 60 }, (_unused, index) =>
				(async () => {
					for (let hop = 0; hop < index; hop++) await Promise.resolve();
					return fetchExternalJson({ model: zenon, request, deps });
				})(),
			),
		);
		expect(peakInFlight).toBeLessThanOrEqual(2);
		expect(peakAccounted).toBeLessThanOrEqual(2);
		expect(unaccounted).toBe(0);
		// And the slot map self-drains: nothing is left holding the key.
		expect(activeConcurrency('zenon', ORIGIN)).toBe(0);
	});
});
