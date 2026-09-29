/**
 * `fetchPinnedHop` — ONE vetted, pinned request with the redirect handed back — and
 * the two primitives under it that other doors share: `readBytesCapped` (the one
 * streamed byte ceiling) and `pinToVettedAddress` (the one socket pin).
 *
 * Driven entirely through the `deps` seam (`lookup` for the resolver, `fetch` for the
 * socket), so every case is hermetic and each asserts the exact thing a regression
 * would change: the URL the socket was aimed at, the Host header and the TLS server
 * name, the redirect mode, the exact bytes kept, the failure's `reason` and `stage`.
 * The harvesting door built on it has its own gate (harvest_door_native.test.ts).
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { DedaloError } from '../../src/core/errors/index.ts';
import { runWithJobSignal } from '../../src/core/media/job_scope.ts';
import {
	type AddressLookup,
	fetchPinnedHop,
	nat64DiscoveryState,
	type PinnedFetchInit,
	type PinnedHopDeps,
	type PinnedHopRequest,
	pinToVettedAddress,
	readBytesCapped,
	setNat64DiscoveryForTests,
} from '../../src/core/security/ssrf_guard.ts';

/**
 * HERMETIC NAT64 DISCOVERY. A public IPv6 target without a `lookup` seam is vetted
 * against the guard's process-wide discovery cache, which an expired entry refreshes
 * through the machine's REAL resolver (`ipv4only.arpa`) — and whatever that answers
 * (a CI runner behind DNS64 answers real prefixes) stays for every later file in the
 * same bun process. So every case starts from a fresh, EMPTY, unexpired cache, and
 * the one case that needs a refresh supplies its own resolver; the original state is
 * put back after each.
 */
const originalDiscovery = nat64DiscoveryState();
/**
 * No DECLARED prefix either: pinned to '' (a deleted key falls back to
 * ../private/.env through readEnv), so an operator's `DEDALO_NAT64_PREFIXES` —
 * a real one, or a typo that fails IPv6 closed — cannot change what these judge.
 */
const NAT64_SETTING = 'DEDALO_NAT64_PREFIXES';
const originalNat64 = process.env[NAT64_SETTING];
beforeEach(() => {
	process.env[NAT64_SETTING] = '';
	setNat64DiscoveryForTests({ prefixes: [], expiresAt: Date.now() + 60 * 60_000 });
});
afterEach(() => {
	if (originalNat64 === undefined) delete process.env[NAT64_SETTING];
	else process.env[NAT64_SETTING] = originalNat64;
	setNat64DiscoveryForTests(originalDiscovery);
});

const PUBLIC_V4 = '93.184.216.34';
const PUBLIC_V4_B = '198.41.0.4';
const PUBLIC_V6 = '2606:4700:4700::1111';

/** A resolver seam with a fixed answer per name (no NAT64 on this "network"). */
function lookupOf(answers: Record<string, string[]>): AddressLookup {
	return async (host) => {
		const addresses = answers[host];
		if (addresses === undefined) throw new Error(`ENOTFOUND ${host}`);
		return addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
	};
}

interface SeenCall {
	url: string;
	init: PinnedFetchInit;
}

/** A fetch seam that records every call and answers with `respond`. */
function recordingFetch(
	respond: (url: string, init: PinnedFetchInit) => Promise<Response> | Response,
): { calls: SeenCall[]; fetch: NonNullable<PinnedHopDeps['fetch']> } {
	const calls: SeenCall[] = [];
	return {
		calls,
		fetch: async (url, init) => {
			calls.push({ url, init });
			return respond(url, init);
		},
	};
}

/** A body stream of the given chunks that records whether it was cancelled. */
function trackedBody(chunks: Uint8Array[]): {
	stream: ReadableStream<Uint8Array>;
	cancelled: () => boolean;
} {
	let wasCancelled = false;
	let index = 0;
	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			const next = chunks[index++];
			if (next === undefined) controller.close();
			else controller.enqueue(next);
		},
		cancel() {
			wasCancelled = true;
		},
	});
	return { stream, cancelled: () => wasCancelled };
}

/**
 * A body that sends `first` and then never another byte (and never closes), and
 * records whether it was cancelled — the primitive promises to cancel an abandoned
 * body so the socket is released, not leaked.
 */
function stallingBody(first: Uint8Array): {
	stream: ReadableStream<Uint8Array>;
	cancelled: () => boolean;
} {
	let wasCancelled = false;
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(first);
		},
		cancel() {
			wasCancelled = true;
		},
	});
	return { stream, cancelled: () => wasCancelled };
}

/** Let a cancel the primitive fired (not awaited) reach the stream's source. */
const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const bytesOf = (length: number, fill = 0x61): Uint8Array<ArrayBuffer> =>
	new Uint8Array(length).fill(fill);

function hop(overrides: Partial<PinnedHopRequest> = {}): PinnedHopRequest {
	return {
		url: new URL('https://pin.test/path?q=1'),
		method: 'GET',
		headers: new Headers({ Accept: 'text/html' }),
		maxBytes: 1024,
		timeoutMs: 5_000,
		...overrides,
	};
}

const pinLookup = lookupOf({ 'pin.test': [PUBLIC_V4] });

/** The DedaloError a promise rejects with (fails the test if it resolves). */
async function failureOf(promise: Promise<unknown>): Promise<DedaloError> {
	try {
		await promise;
	} catch (error) {
		expect(error).toBeInstanceOf(DedaloError);
		return error as DedaloError;
	}
	throw new Error('expected a failure, got a pass');
}

describe('the pin', () => {
	test('the socket goes to the VETTED IP; Host and SNI keep the real name; redirect is manual', async () => {
		const { calls, fetch } = recordingFetch(() => new Response('ok'));
		const answer = await fetchPinnedHop(hop(), { lookup: pinLookup, fetch });
		expect(answer.status).toBe(200);
		expect(calls).toHaveLength(1);
		const [call] = calls;
		const aimed = new URL(call?.url ?? '');
		expect(aimed.hostname).toBe(PUBLIC_V4);
		expect(aimed.pathname + aimed.search).toBe('/path?q=1');
		expect(aimed.protocol).toBe('https:');
		const headers = new Headers(call?.init.headers);
		expect(headers.get('host')).toBe('pin.test');
		expect(headers.get('accept')).toBe('text/html'); // the caller's headers ride along
		expect(call?.init.tls?.serverName).toBe('pin.test');
		expect(call?.init.redirect).toBe('manual');
		expect(call?.init.method).toBe('GET');
	});

	test('a non-default port stays in the Host header', async () => {
		const { calls, fetch } = recordingFetch(() => new Response('ok'));
		await fetchPinnedHop(hop({ url: new URL('http://pin.test:8081/x') }), {
			lookup: pinLookup,
			fetch,
		});
		expect(new Headers(calls[0]?.init.headers).get('host')).toBe('pin.test:8081');
		expect(new URL(calls[0]?.url ?? '').port).toBe('8081');
	});

	test('an IPv6 pin is bracketed', async () => {
		const { calls, fetch } = recordingFetch(() => new Response('ok'));
		await fetchPinnedHop(hop(), { lookup: lookupOf({ 'pin.test': [PUBLIC_V6] }), fetch });
		expect(new URL(calls[0]?.url ?? '').hostname).toBe(`[${PUBLIC_V6}]`);
		expect(calls[0]?.init.tls?.serverName).toBe('pin.test');
	});

	test('an IPv6 LITERAL target is left as it is: no Host header, no SNI rewrite', async () => {
		// The URL parser hands the pin `[2606:…]`, brackets included: read as a NAME it
		// would get a Host header and `tls.serverName = '[2606:…]'`, an invalid SNI.
		const { calls, fetch } = recordingFetch(() => new Response('ok'));
		// An expired cache: the literal's vetting refreshes discovery — through THIS seam.
		setNat64DiscoveryForTests({ prefixes: [], expiresAt: 0 });
		const asked: string[] = [];
		const cacheRefreshLookup: AddressLookup = async (host) => {
			asked.push(host);
			return [];
		};
		await fetchPinnedHop(hop({ url: new URL(`https://[${PUBLIC_V6}]/x`) }), {
			fetch,
			cacheRefreshLookup,
		});
		expect(asked).toEqual(['ipv4only.arpa']); // never the machine's resolver
		expect(calls).toHaveLength(1);
		expect(new Headers(calls[0]?.init.headers).has('host')).toBe(false);
		expect(calls[0]?.init.tls).toBeUndefined();
		expect(new URL(calls[0]?.url ?? '').hostname).toBe(`[${PUBLIC_V6}]`);
	});

	test('a POST carries its body and method', async () => {
		const { calls, fetch } = recordingFetch(() => new Response('ok'));
		await fetchPinnedHop(hop({ method: 'POST', body: 'q=1' }), { lookup: pinLookup, fetch });
		expect(calls[0]?.init.method).toBe('POST');
		expect(calls[0]?.init.body).toBe('q=1');
	});

	test('the caller’s Headers object is never mutated by the pin', async () => {
		const headers = new Headers({ Accept: 'x/y' });
		const { fetch } = recordingFetch(() => new Response('ok'));
		await fetchPinnedHop(hop({ headers }), { lookup: pinLookup, fetch });
		expect(headers.has('host')).toBe(false);
	});

	test('a private or zoned address is refused BEFORE any socket', async () => {
		const { calls, fetch } = recordingFetch(() => new Response('ok'));
		const cases: [Record<string, string[]>, string][] = [
			[{ 'pin.test': ['127.0.0.1'] }, 'private_resolved'],
			[{ 'pin.test': [PUBLIC_V4, '10.0.0.1'] }, 'private_resolved'],
			[{ 'pin.test': [`${PUBLIC_V6}%eth0`] }, 'zone_id'], // a GLOBAL address, zoned
		];
		for (const [answers, reason] of cases) {
			const failure = await failureOf(fetchPinnedHop(hop(), { lookup: lookupOf(answers), fetch }));
			expect(failure.code).toBe('security.ssrf_blocked');
			expect(failure.coordinates?.reason).toBe(reason);
		}
		expect(calls).toHaveLength(0);
	});
});

describe('pinToVettedAddress — self-checked', () => {
	test('a pin that takes rewrites the URL and keeps the name for Host and SNI', () => {
		const target = new URL('https://pin.test/a');
		const headers = new Headers();
		const init: PinnedFetchInit = {};
		pinToVettedAddress(target, PUBLIC_V4, headers, init);
		expect(target.hostname).toBe(PUBLIC_V4);
		expect(headers.get('host')).toBe('pin.test');
		expect(init.tls?.serverName).toBe('pin.test');
	});

	test('a trailing-dot host: SNI without the dot (RFC 6066 §3), Host as written', () => {
		const target = new URL('https://pin.test./a');
		const headers = new Headers();
		const init: PinnedFetchInit = {};
		pinToVettedAddress(target, PUBLIC_V4, headers, init);
		expect(init.tls?.serverName).toBe('pin.test');
		expect(headers.get('host')).toBe('pin.test.');
		expect(target.hostname).toBe(PUBLIC_V4);
	});

	test('a pin the URL setter silently ignores is REFUSED (pin_failed)', () => {
		for (const address of [`${PUBLIC_V6}%eth0`, 'fe80::1%25eth0', 'not-an-ip']) {
			const target = new URL('https://pin.test/a');
			let caught: unknown;
			try {
				pinToVettedAddress(target, address, new Headers(), {});
			} catch (error) {
				caught = error;
			}
			expect(caught, address).toBeInstanceOf(DedaloError);
			expect((caught as DedaloError).code).toBe('security.ssrf_blocked');
			expect((caught as DedaloError).coordinates?.reason).toBe('pin_failed');
		}
	});

	test('an IP-literal target must BE the vetted address', () => {
		const same = new URL(`https://${PUBLIC_V4}/`);
		const headers = new Headers();
		pinToVettedAddress(same, PUBLIC_V4, headers, {});
		expect(same.hostname).toBe(PUBLIC_V4);
		expect(headers.has('host')).toBe(false); // nothing to rebind, nothing rewritten
		// A different spelling of the same IPv6 is the same address.
		pinToVettedAddress(new URL('https://[2606:4700:4700:0::1111]/'), PUBLIC_V6, new Headers(), {});
		expect(() =>
			pinToVettedAddress(new URL(`https://${PUBLIC_V4}/`), PUBLIC_V4_B, new Headers(), {}),
		).toThrow(DedaloError);
	});
});

describe('the body', () => {
	test('exactly maxBytes is a whole body; maxBytes+1 is body_cap, cancelled', async () => {
		const exact = trackedBody([bytesOf(600), bytesOf(424)]);
		const whole = await fetchPinnedHop(hop(), {
			lookup: pinLookup,
			fetch: async () => new Response(exact.stream),
		});
		expect(whole.bytes.byteLength).toBe(1024);
		expect(whole.truncated).toBe(false);

		const over = trackedBody([bytesOf(600), bytesOf(425), bytesOf(10)]);
		const failure = await failureOf(
			fetchPinnedHop(hop(), { lookup: pinLookup, fetch: async () => new Response(over.stream) }),
		);
		expect(failure.code).toBe('security.outbound_failed');
		expect(failure.coordinates?.reason).toBe('body_cap');
		expect(over.cancelled()).toBe(true);
	});

	test("overflow 'truncate' keeps EXACTLY the first maxBytes bytes", async () => {
		const first = bytesOf(700, 0x41);
		const second = new Uint8Array(700).map((_, index) => index % 251);
		const body = trackedBody([first, second, bytesOf(5)]);
		const answer = await fetchPinnedHop(hop({ overflow: 'truncate' }), {
			lookup: pinLookup,
			fetch: async () => new Response(body.stream),
		});
		expect(answer.truncated).toBe(true);
		expect(answer.bodySkipped).toBe(false);
		expect(answer.bytes.byteLength).toBe(1024);
		expect([...answer.bytes.subarray(0, 700)]).toEqual([...first]);
		expect([...answer.bytes.subarray(700)]).toEqual([...second.subarray(0, 324)]);
		expect(body.cancelled()).toBe(true);
	});

	test('readBytesCapped hands a caller’s own breach error through (onBreach)', async () => {
		class TooBig extends Error {}
		let asked = -1;
		const failure = readBytesCapped(new Response(bytesOf(11)), 10, {
			onBreach: (max) => {
				asked = max;
				return new TooBig('too big');
			},
		});
		expect(failure).rejects.toBeInstanceOf(TooBig);
		await failure.catch(() => undefined);
		expect(asked).toBe(10);
		const empty = await readBytesCapped(new Response(null), 10);
		expect(empty).toEqual({ bytes: new Uint8Array(0), truncated: false });
	});
});

describe('redirects and refused bodies come back unread', () => {
	test('a 302 hands back its Location, no bytes, the body cancelled', async () => {
		const body = trackedBody([bytesOf(10)]);
		const answer = await fetchPinnedHop(hop(), {
			lookup: pinLookup,
			fetch: async () => new Response(body.stream, { status: 302, headers: { Location: '/next' } }),
		});
		expect(answer.status).toBe(302);
		expect(answer.location).toBe('/next');
		expect(answer.bytes.byteLength).toBe(0);
		expect(answer.bodySkipped).toBe(true);
		expect(body.cancelled()).toBe(true);
	});

	test('every redirect status carries its Location', async () => {
		for (const status of [301, 302, 303, 307, 308]) {
			const answer = await fetchPinnedHop(hop(), {
				lookup: pinLookup,
				fetch: async () => new Response(null, { status, headers: { Location: 'https://b.test/' } }),
			});
			expect(answer.location, String(status)).toBe('https://b.test/');
		}
	});

	test('a Location on a NON-redirect status is not a redirect: location null, body read', async () => {
		for (const status of [200, 201, 300, 304, 305]) {
			const payload = status === 304 ? null : 'body';
			const answer = await fetchPinnedHop(hop(), {
				lookup: pinLookup,
				fetch: async () => new Response(payload, { status, headers: { Location: '/elsewhere' } }),
			});
			expect(answer.location, String(status)).toBeNull();
			expect(answer.bodySkipped, String(status)).toBe(false);
			expect(new TextDecoder().decode(answer.bytes), String(status)).toBe(payload ?? '');
		}
	});

	test('a redirect status with no Location is an ordinary answer', async () => {
		const answer = await fetchPinnedHop(hop(), {
			lookup: pinLookup,
			fetch: async () => new Response('moved', { status: 302 }),
		});
		expect(answer.location).toBeNull();
		expect(new TextDecoder().decode(answer.bytes)).toBe('moved');
	});

	test('acceptBody false cancels the body unread (bodySkipped); it sees status and headers', async () => {
		const body = trackedBody([bytesOf(10)]);
		let seen: [number, string | null] | undefined;
		const answer = await fetchPinnedHop(
			hop({
				acceptBody: (status, headers) => {
					seen = [status, headers.get('content-type')];
					return false;
				},
			}),
			{
				lookup: pinLookup,
				fetch: async () =>
					new Response(body.stream, { status: 404, headers: { 'Content-Type': 'text/html' } }),
			},
		);
		expect(seen).toEqual([404, 'text/html']);
		expect(answer.status).toBe(404);
		expect(answer.bodySkipped).toBe(true);
		expect(answer.bytes.byteLength).toBe(0);
		expect(body.cancelled()).toBe(true);

		const kept = await fetchPinnedHop(hop({ acceptBody: () => true }), {
			lookup: pinLookup,
			fetch: async () => new Response('yes'),
		});
		expect(new TextDecoder().decode(kept.bytes)).toBe('yes');
	});
});

describe('address fallback', () => {
	test('a CONNECT failure on the first vetted address tries the next', async () => {
		const lookup = lookupOf({ 'pin.test': [PUBLIC_V6, PUBLIC_V4] });
		const { calls, fetch } = recordingFetch((url) => {
			if (new URL(url).hostname === `[${PUBLIC_V6}]`) throw new TypeError('ECONNREFUSED');
			return new Response('second');
		});
		const answer = await fetchPinnedHop(hop(), { lookup, fetch });
		expect(new TextDecoder().decode(answer.bytes)).toBe('second');
		expect(calls.map((call) => new URL(call.url).hostname)).toEqual([`[${PUBLIC_V6}]`, PUBLIC_V4]);
		// Each attempt carries its own, single Host header.
		expect(new Headers(calls[1]?.init.headers).get('host')).toBe('pin.test');
	});

	test('never after an HTTP answer: a 500 from the first address is the answer', async () => {
		const lookup = lookupOf({ 'pin.test': [PUBLIC_V4, PUBLIC_V4_B] });
		const { calls, fetch } = recordingFetch(() => new Response('broken', { status: 500 }));
		const answer = await fetchPinnedHop(hop(), { lookup, fetch });
		expect(answer.status).toBe(500);
		expect(calls).toHaveLength(1);
	});

	test('every address failing to connect is reason transport, stage connect', async () => {
		const lookup = lookupOf({ 'pin.test': [PUBLIC_V4, PUBLIC_V4_B] });
		const { calls, fetch } = recordingFetch(() => {
			throw new TypeError('ECONNREFUSED');
		});
		const failure = await failureOf(fetchPinnedHop(hop(), { lookup, fetch }));
		expect(failure.code).toBe('security.outbound_failed');
		expect(failure.coordinates).toMatchObject({ reason: 'transport', stage: 'connect' });
		expect(calls).toHaveLength(2);
	});
});

describe('deadlines and cancellation — every failure typed', () => {
	/** A fetch that never answers and IGNORES its signal (the worst implementation). */
	const neverAnswers: NonNullable<PinnedHopDeps['fetch']> = () => new Promise<Response>(() => {});

	test('a fetch that never answers ends at the TOTAL deadline: reason timeout, stage connect', async () => {
		const started = Date.now();
		const failure = await failureOf(
			fetchPinnedHop(hop({ timeoutMs: 40 }), { lookup: pinLookup, fetch: neverAnswers }),
		);
		expect(failure.code).toBe('security.outbound_failed');
		expect(failure.coordinates).toMatchObject({ reason: 'timeout', stage: 'connect' });
		expect(Date.now() - started).toBeLessThan(2_000);
	});

	test('the TOTAL deadline covers DNS: a resolver that never answers is reason timeout, stage resolve', async () => {
		// The system resolver has no timeout, and a harvest hop waits on it while it
		// holds its origin's pacing turn — so the hop's budget must cover it too.
		const hanging: AddressLookup = () => new Promise(() => {});
		const { calls, fetch } = recordingFetch(() => new Response('ok'));
		const started = Date.now();
		const failure = await failureOf(
			fetchPinnedHop(hop({ timeoutMs: 40 }), { lookup: hanging, fetch }),
		);
		expect(failure.code).toBe('security.outbound_failed');
		expect(failure.coordinates).toMatchObject({ reason: 'timeout', stage: 'resolve' });
		expect(Date.now() - started).toBeLessThan(2_000);
		expect(calls).toHaveLength(0);
	});

	test('a job stopped while its hop resolves leaves at once: reason aborted, stage resolve', async () => {
		const job = new AbortController();
		setTimeout(() => job.abort(), 20);
		const failure = await failureOf(
			runWithJobSignal(job.signal, () =>
				fetchPinnedHop(hop({ timeoutMs: 5_000 }), { lookup: () => new Promise(() => {}) }),
			),
		);
		expect(failure.coordinates).toMatchObject({ reason: 'aborted', stage: 'resolve' });
	});

	test('an address refusal inside the budget is still the guard’s own refusal', async () => {
		const failure = await failureOf(
			fetchPinnedHop(hop(), { lookup: lookupOf({ 'pin.test': ['10.0.0.1'] }) }),
		);
		expect(failure.code).toBe('security.ssrf_blocked');
		expect(failure.coordinates?.reason).toBe('private_resolved');
	});

	test('the deadline does NOT move on to the next address', async () => {
		const lookup = lookupOf({ 'pin.test': [PUBLIC_V4, PUBLIC_V4_B] });
		const { calls, fetch } = recordingFetch(() => new Promise<Response>(() => {}));
		await failureOf(fetchPinnedHop(hop({ timeoutMs: 30 }), { lookup, fetch }));
		expect(calls).toHaveLength(1);
	});

	test('a body that stalls is reason idle, stage body — before the total deadline', async () => {
		const body = stallingBody(bytesOf(3));
		const failure = await failureOf(
			fetchPinnedHop(hop({ timeoutMs: 5_000, idleTimeoutMs: 40 }), {
				lookup: pinLookup,
				fetch: async () => new Response(body.stream),
			}),
		);
		expect(failure.code).toBe('security.outbound_failed');
		expect(failure.coordinates).toMatchObject({ reason: 'idle', stage: 'body' });
		await settled();
		expect(body.cancelled()).toBe(true); // the socket is released, not leaked
	});

	test('the TOTAL deadline covers the body (trickling bytes do not extend it)', async () => {
		let timer: ReturnType<typeof setInterval> | undefined;
		let trickleCancelled = false;
		const trickle = new ReadableStream<Uint8Array>({
			start(controller) {
				timer = setInterval(() => controller.enqueue(bytesOf(1)), 5);
			},
			cancel() {
				trickleCancelled = true;
				clearInterval(timer);
			},
		});
		const failure = await failureOf(
			fetchPinnedHop(hop({ timeoutMs: 60, idleTimeoutMs: 1_000 }), {
				lookup: pinLookup,
				fetch: async () => new Response(trickle),
			}),
		);
		await settled();
		expect(trickleCancelled).toBe(true); // the deadline cancels the body, too
		clearInterval(timer);
		expect(failure.coordinates).toMatchObject({ reason: 'timeout', stage: 'body' });
	});

	test('the running job being stopped is reason aborted — at connect and mid-body', async () => {
		const job = new AbortController();
		setTimeout(() => job.abort(), 20);
		const atConnect = await failureOf(
			runWithJobSignal(job.signal, () =>
				fetchPinnedHop(hop(), { lookup: pinLookup, fetch: neverAnswers }),
			),
		);
		expect(atConnect.coordinates).toMatchObject({ reason: 'aborted', stage: 'connect' });

		const midBody = new AbortController();
		setTimeout(() => midBody.abort(), 20);
		const body = stallingBody(bytesOf(3));
		const inBody = await failureOf(
			runWithJobSignal(midBody.signal, () =>
				fetchPinnedHop(hop(), {
					lookup: pinLookup,
					fetch: async () => new Response(body.stream),
				}),
			),
		);
		expect(inBody.coordinates).toMatchObject({ reason: 'aborted', stage: 'body' });
		await settled();
		expect(body.cancelled()).toBe(true);
	});

	test('detachedFromJob ignores the job signal (its own deadline still bounds it)', async () => {
		const job = new AbortController();
		job.abort();
		const answer = await runWithJobSignal(job.signal, () =>
			fetchPinnedHop(hop({ detachedFromJob: true }), {
				lookup: pinLookup,
				fetch: async () => new Response('shared'),
			}),
		);
		expect(new TextDecoder().decode(answer.bytes)).toBe('shared');
		// …and without the flag the same stopped job fails it.
		const failure = await failureOf(
			runWithJobSignal(job.signal, () =>
				fetchPinnedHop(hop(), { lookup: pinLookup, fetch: async () => new Response('x') }),
			),
		);
		expect(failure.coordinates?.reason).toBe('aborted');
	});

	test('a body that ERRORS mid-stream is reason transport, stage body', async () => {
		const broken = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(bytesOf(2));
				controller.error(new TypeError('socket reset'));
			},
		});
		const failure = await failureOf(
			fetchPinnedHop(hop(), { lookup: pinLookup, fetch: async () => new Response(broken) }),
		);
		expect(failure.code).toBe('security.outbound_failed');
		expect(failure.coordinates).toMatchObject({ reason: 'transport', stage: 'body' });
	});
});
