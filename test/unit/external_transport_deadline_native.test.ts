/**
 * THE EXTERNAL DOOR'S DEADLINE COVERS THE WHOLE ATTEMPT — the SSRF guard's
 * lookup and the response body included (W4 cross-authz_read:r2, review-diff S3).
 *
 * `fetchExternalJson`'s timeout used to start only at the fetch: step 4 (the
 * guard's resolve + vet — a DNS lookup) ran with no deadline at all, and the
 * body was read without the deadline's signal, so a resolver that never
 * answered, or a body the fetch implementation did not wire to the signal,
 * held the attempt — and its per-(service, origin) concurrency slot — for ever.
 *
 * OUTCOMES (no network; the guard and the fetch are injected):
 *   D1 a guard whose lookup NEVER settles: the call ends within the deadline,
 *      classified `timeout`, and the fetch is never reached;
 *   D2 a 200 whose body never yields a byte and ignores every signal: the call
 *      ends within the deadline, classified `timeout`;
 *   D3 control: a guard REFUSAL inside the deadline is still `blocked_host`.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { resetBreakerForOrigin } from '../../src/external/breaker.ts';
import type { ExternalServiceError } from '../../src/external/errors.ts';
import { zenon } from '../../src/external/services/zenon.ts';
import { overrideExternalSettingsForTests } from '../../src/external/settings.ts';
import { fetchExternalJson } from '../../src/external/transport.ts';

const HOST = 'zenon.dainst.org';
const ORIGIN = `https://${HOST}`;
const request = { url: `${ORIGIN}/api/v1/record?id=1&lgn=en`, method: 'GET' as const };
const TIMEOUT_MS = 40;
/** Far above the deadline, far below the test timeout: "it ended because of the deadline". */
const SETTLE_BOUND_MS = 2_000;

beforeEach(() => {
	overrideExternalSettingsForTests({
		enabled: true,
		disabledServices: [],
		allowedHosts: [HOST],
		timeoutMs: TIMEOUT_MS,
		retryAttempts: 0,
		maxConcurrency: 4,
		breakerCooldownMs: 1000,
	});
	resetBreakerForOrigin('zenon', ORIGIN);
});

afterEach(() => {
	overrideExternalSettingsForTests(null);
	resetBreakerForOrigin('zenon', ORIGIN);
});

/** The outcome of `work`, or 'STILL RUNNING' when it has not settled by the bound. */
async function settledWithin(work: Promise<unknown>): Promise<unknown> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const bound = new Promise((resolve) => {
		timer = setTimeout(() => resolve('STILL RUNNING'), SETTLE_BOUND_MS);
	});
	try {
		return await Promise.race([
			work.then(
				(value) => value,
				(error: unknown) => error,
			),
			bound,
		]);
	} finally {
		clearTimeout(timer);
	}
}

describe('the external door: one deadline from the lookup to the last body byte', () => {
	test('D1 a guard lookup that never settles is a `timeout`, and nothing is fetched', async () => {
		const calls: string[] = [];
		const outcome = await settledWithin(
			fetchExternalJson({
				model: zenon,
				request,
				deps: {
					assertPublicUrlImpl: () => {
						calls.push('resolve');
						return new Promise(() => {});
					},
					fetchImpl: async () => {
						calls.push('fetch');
						return new Response('{}');
					},
				},
			}),
		);
		expect(outcome).not.toBe('STILL RUNNING');
		expect((outcome as ExternalServiceError).kind).toBe('timeout');
		// The lookup ran (and never answered); the fetch after it never did.
		expect(calls).toEqual(['resolve']);
	});

	test('D2 a body that never yields and ignores the signal is a `timeout`', async () => {
		const stalledBody = () =>
			new Response(
				new ReadableStream<Uint8Array>({
					pull: () => new Promise(() => {}), // never a chunk, never an end
				}),
				{ status: 200 },
			);
		const outcome = await settledWithin(
			fetchExternalJson({
				model: zenon,
				request,
				deps: {
					assertPublicUrlImpl: async (uri: string) => ({
						url: new URL(uri),
						addresses: ['141.100.1.1'],
					}),
					fetchImpl: async () => stalledBody(),
				},
			}),
		);
		expect(outcome).not.toBe('STILL RUNNING');
		expect((outcome as ExternalServiceError).kind).toBe('timeout');
	});

	test('D3 control: a guard refusal within the deadline is still `blocked_host`', async () => {
		const outcome = await settledWithin(
			fetchExternalJson({
				model: zenon,
				request,
				deps: {
					assertPublicUrlImpl: async () => {
						throw new Error('private address');
					},
					fetchImpl: async () => new Response('{}'),
				},
			}),
		);
		expect((outcome as ExternalServiceError).kind).toBe('blocked_host');
	});
});
