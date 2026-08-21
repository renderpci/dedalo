/**
 * REQUEST COALESCING CONTRACT — client/dedalo/core/common/js/data_manager.js
 *
 * WHY THIS FILE EXISTS. `data_manager.request` never de-duplicated identical
 * concurrent API calls: N components asking the same question in the same tick
 * produced N HTTP round-trips (the sibling defect to the get_instance build
 * race pinned by client_instances_inflight_tripwire.test.ts). The fix is an
 * in-flight registry keyed on `cache_handler.id` — the caller's EXPLICIT
 * declaration that the request is an idempotent, cacheable READ. Keying on
 * that id (never on a hash of the body) makes it structurally impossible to
 * coalesce a WRITE: two saves that happen to serialize identically are two
 * distinct operations, and collapsing them is silent data loss.
 *
 * WHAT IS PINNED (contract, not implementation):
 *  A. Two concurrent requests with the SAME cache_handler.id issue ONE fetch;
 *     both resolve an equivalent success envelope, and the joined caller gets
 *     its OWN object (a clone), never the leader's instance — callers mutate
 *     what they get back.
 *  B. Requests WITHOUT a cache_handler (the write shape) are NEVER coalesced,
 *     even with byte-identical bodies.
 *  C. The registry does not retain a settled key: a later same-id request
 *     fetches again (the persisted localdb layer, absent here, is what serves
 *     repeats — the registry only spans the in-flight window).
 *  D. A FAILED request clears the entry too, so a later call can retry
 *     instead of being served the failure forever.
 *  E. A request carrying a caller `signal` is not coalesced — a joined caller
 *     must not inherit another caller's abort.
 *  F. The transparent CSRF resend (`_csrf_retried:true`) BYPASSES coalescing.
 *     It fires INSIDE the leader's own execution while the leader's promise is
 *     still registered under the same cache_handler.id; joining would make the
 *     leader await its own promise — a permanent, silent hang of that read.
 *  G. Clone-on-SUCCESS only. A joined caller's FAILURE envelope is returned
 *     SHARED: structuredClone would strip the ApiError class prototype and
 *     break `request_failed(api_response)` — THE documented failure test.
 *
 * HARNESS. Same pattern as client_local_db_singleton_tripwire.test.ts: minimal
 * browser globals, ui.js masked (not importable from disk at all), everything
 * else imported REAL. `globalThis.fetch` is replaced with a counting stub that
 * answers real `Response` objects; no indexedDB is installed, so the localdb
 * layer reports unavailable and every request reaches the (stubbed) network.
 * No DB, no server, no credentials.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { join } from 'node:path';

const CLIENT_COMMON = join(import.meta.dir, '..', '..', 'client', 'dedalo', 'core', 'common', 'js');
const DATA_MANAGER_PATH = join(CLIENT_COMMON, 'data_manager.js');

type Envelope = { ok: boolean; result?: unknown; error?: unknown };
type DataManager = {
	request: (options: Record<string, unknown>) => Promise<Envelope>;
};

const globals = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let data_manager: DataManager;
let ApiError: new (...args: unknown[]) => Error;
let request_failed: (api_response: unknown) => boolean;

/** per-test journal of fetch calls */
let fetch_calls: Array<{ url: string; body: string | null }> = [];
/** when true the NEXT fetch rejects like a dropped connection */
let fail_next_fetch = false;
/** resolvers to release fetches held open, so tests control the in-flight window */
let held_fetches: Array<() => void> = [];
/** when true fetches stay pending until release_fetches() runs */
let hold_fetches = false;
/** when true the NEXT fetch answers an `auth.csrf_failed` failure envelope */
let csrf_fail_next_fetch = false;
/** when true every fetch answers a generic failure envelope (ok:false) */
let fail_envelope_fetches = false;

const release_fetches = () => {
	for (const release of held_fetches) release();
	held_fetches = [];
};

const stub_fetch = async (url: string | URL, init?: RequestInit): Promise<Response> => {
	fetch_calls.push({ url: String(url), body: (init?.body as string) ?? null });
	if (fail_next_fetch) {
		fail_next_fetch = false;
		throw new TypeError('fetch failed (stub network drop)');
	}
	if (hold_fetches) {
		await new Promise<void>((resolve) => held_fetches.push(resolve));
	}
	if (csrf_fail_next_fetch) {
		csrf_fail_next_fetch = false;
		return new Response(
			JSON.stringify({
				ok: false,
				error: { code: 'auth.csrf_failed', message: 'CSRF token mismatch (stub)' },
			}),
			{ status: 403, headers: { 'Content-Type': 'application/json' } },
		);
	}
	if (fail_envelope_fetches) {
		return new Response(
			JSON.stringify({
				ok: false,
				error: { code: 'server.error', message: 'stub failure envelope' },
			}),
			{ status: 200, headers: { 'Content-Type': 'application/json' } },
		);
	}
	return new Response(JSON.stringify({ ok: true, result: { answered: fetch_calls.length } }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
};

beforeAll(async () => {
	for (const key of ['window', 'page_globals', 'SHOW_DEBUG', 'DEDALO_API_URL', 'fetch'])
		saved[key] = globals[key];

	globals.page_globals = {
		dedalo_data_lang: 'lg-eng',
		stream_readers: [],
		recovery_mode: false,
		request_message: null,
	};
	globals.SHOW_DEBUG = false;
	globals.DEDALO_API_URL = '/api/v1/json/';
	globals.window = globalThis;
	globals.fetch = stub_fetch;

	mock.module(join(CLIENT_COMMON, 'ui.js'), () => ({
		ui: {
			create_dom_element: () => ({ classList: { add() {}, remove() {} }, addEventListener() {} }),
			show_message: () => {},
		},
	}));

	data_manager = ((await import(DATA_MANAGER_PATH)) as { data_manager: DataManager }).data_manager;

	const api_error_module = (await import(join(CLIENT_COMMON, 'api_error.js'))) as {
		ApiError: new (...args: unknown[]) => Error;
		request_failed: (api_response: unknown) => boolean;
	};
	ApiError = api_error_module.ApiError;
	request_failed = api_error_module.request_failed;
});

afterAll(() => {
	for (const key of Object.keys(saved)) {
		if (saved[key] === undefined) delete globals[key];
		else globals[key] = saved[key];
	}
	mock.restore();
});

beforeEach(() => {
	fetch_calls = [];
	fail_next_fetch = false;
	hold_fetches = false;
	held_fetches = [];
	csrf_fail_next_fetch = false;
	fail_envelope_fetches = false;
});

const read_options = (id: string, extra: Record<string, unknown> = {}) => ({
	body: { action: 'read_probe', options: { id } },
	cache_handler: { handler: 'localdb', id },
	retries: 1,
	timeout: 2000,
	...extra,
});

describe('request coalescing — identical concurrent reads share one fetch (A)', () => {
	test('two concurrent same-id reads → ONE fetch, equivalent envelopes, DISTINCT objects', async () => {
		hold_fetches = true;
		const p1 = data_manager.request(read_options('coalesce_a'));
		const p2 = data_manager.request(read_options('coalesce_a'));
		// both issued in the same in-flight window
		await new Promise((resolve) => setTimeout(resolve, 10));
		release_fetches();
		const [r1, r2] = await Promise.all([p1, p2]);

		expect(fetch_calls.length).toBe(1);
		expect(r1.ok).toBe(true);
		expect(r2.ok).toBe(true);
		// equivalent payloads…
		expect(JSON.parse(JSON.stringify(r2.result))).toEqual(JSON.parse(JSON.stringify(r1.result)));
		// …but NEVER the same object: callers mutate what they get back
		expect(r2).not.toBe(r1);
		// distinctness is deep: patching one caller's result must not bleed
		// into the other's (context patching, response_data storage)
		(r1.result as Record<string, unknown>).patched_by_caller_1 = true;
		expect((r2.result as Record<string, unknown>).patched_by_caller_1).toBeUndefined();
	});
});

describe('request coalescing — writes are never coalesced (B)', () => {
	test('two concurrent identical-bodied requests WITHOUT cache_handler → TWO fetches', async () => {
		hold_fetches = true;
		const write_options = () => ({
			body: { action: 'save', options: { value: 'same bytes' } },
			retries: 1,
			timeout: 2000,
		});
		const p1 = data_manager.request(write_options());
		const p2 = data_manager.request(write_options());
		await new Promise((resolve) => setTimeout(resolve, 10));
		release_fetches();
		await Promise.all([p1, p2]);

		expect(fetch_calls.length).toBe(2);
	});
});

describe('request coalescing — the registry spans only the in-flight window (C)', () => {
	test('a later same-id request (after settle) fetches again', async () => {
		await data_manager.request(read_options('coalesce_c'));
		await data_manager.request(read_options('coalesce_c'));

		// no indexedDB here, so a second network trip proves the entry was cleared
		expect(fetch_calls.length).toBe(2);
	});
});

describe('request coalescing — a failure clears the entry so retries can run (D)', () => {
	test('failed leader does not pin the key: the next call reaches the network', async () => {
		fail_next_fetch = true;
		const failed = await data_manager.request(read_options('coalesce_d'));
		expect(failed.ok).toBe(false);

		const retried = await data_manager.request(read_options('coalesce_d'));
		expect(retried.ok).toBe(true);
		expect(fetch_calls.length).toBe(2);
	});
});

describe('request coalescing — abortable reads run alone (E)', () => {
	test('a request carrying a caller signal is not joined and not joinable', async () => {
		hold_fetches = true;
		const controller = new AbortController();
		const p1 = data_manager.request(read_options('coalesce_e', { signal: controller.signal }));
		const p2 = data_manager.request(read_options('coalesce_e'));
		await new Promise((resolve) => setTimeout(resolve, 10));
		release_fetches();
		await Promise.all([p1, p2]);

		expect(fetch_calls.length).toBe(2);
	});
});

describe('request coalescing — the CSRF resend bypasses coalescing (F)', () => {
	test('an auth.csrf_failed leader resends once and RESOLVES — never awaits itself', async () => {
		csrf_fail_next_fetch = true;

		// WITHOUT the `!options._csrf_retried` eligibility exclusion the internal
		// resend would find the leader's own still-registered promise under the
		// same cache_handler.id and await itself: a permanent hang with no error.
		// Bound the wait so a regression FAILS fast instead of timing the suite out.
		const result = await Promise.race([
			data_manager.request(read_options('coalesce_f')),
			new Promise<'hang'>((resolve) => setTimeout(() => resolve('hang'), 1500)),
		]);

		expect(result).not.toBe('hang');
		const envelope = result as Envelope;
		expect(envelope.ok).toBe(true);
		// exactly TWO fetches: the rejected original + the one transparent resend
		expect(fetch_calls.length).toBe(2);
	});
});

describe('request coalescing — clone on success ONLY; failures stay shared (G)', () => {
	test('a joined caller of a FAILED read keeps the ApiError prototype (request_failed works)', async () => {
		hold_fetches = true;
		fail_envelope_fetches = true;
		const p1 = data_manager.request(read_options('coalesce_g'));
		const p2 = data_manager.request(read_options('coalesce_g'));
		await new Promise((resolve) => setTimeout(resolve, 10));
		release_fetches();
		const [r1, r2] = await Promise.all([p1, p2]);

		expect(fetch_calls.length).toBe(1);
		expect(r1.ok).toBe(false);
		expect(r2.ok).toBe(false);
		// the failure envelope is returned SHARED: structuredClone would strip
		// the ApiError class prototype and break request_failed — THE documented
		// failure test. Both callers must hold a real ApiError instance.
		expect(r1.error instanceof ApiError).toBe(true);
		expect(r2.error instanceof ApiError).toBe(true);
		expect(request_failed(r1)).toBe(true);
		expect(request_failed(r2)).toBe(true);
	});
});
