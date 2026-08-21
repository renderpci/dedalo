/**
 * GET_INSTANCE IN-FLIGHT BUILD CONTRACT — client/dedalo/core/common/js/instances.js
 *
 * WHY THIS FILE EXISTS. `get_instance(options)` is the client's instance
 * factory + cache. Its cache lookup is synchronous but the build between the
 * lookup and `instances_map.set(key, instance)` spans a dynamic `import()` and
 * an `await instance.init(options)`. Two defects lived in that window:
 *
 *  1. THE RACE. Two concurrent callers for the same key both miss the cache,
 *     both construct, both init(). The second set() overwrites the first —
 *     orphaning an instance that keeps every event subscription taken during
 *     init() and is unreachable, so destroy() can never release them. The fix
 *     is an in-flight build registry (key → in-progress Promise) the file's
 *     own comments described for years without implementing.
 *  2. THE HANG. When the module's main export constructs to a non-object the
 *     code did `return null` from inside the Promise executor's .then()
 *     instead of `return resolve(null)` — the Promise never settled and every
 *     awaiting caller hung forever.
 *
 * WHAT IS PINNED (contract, not implementation):
 *  A. Two concurrent get_instance() calls for one key return the SAME object
 *     identity, and construct/init run exactly ONCE.
 *  B. A non-object-constructing model RESOLVES (to null) under a real timeout,
 *     so a regression fails loudly instead of stalling the suite.
 *  C. The in-flight registry does not retain a settled key: after
 *     delete_instance(key), a later get_instance() builds AGAIN.
 *  D. The success path RELEASES the in-flight entry in the same synchronous
 *     slice as the instances_map write, before resolve() wakes any awaiter.
 *     (Source-level, deliberately — see the note on that test.)
 *
 * HARNESS. Same pattern as client_upload_transport.test.ts: minimal browser
 * globals; ONLY ui.js is masked (it is not importable from disk at all — see
 * that file's mask comment — so the process-global mock.module leak can only
 * replace a module that would otherwise THROW); data_manager.js, utils/,
 * api_error.js are imported REAL. The dynamic model import is steered through
 * the REAL DEDALO_TOOLS_URLS seam — `tool_*` models import from an absolute
 * URL, which here is an absolute path into
 * test/unit/fixtures/client_instances/. No DB, no network, no credentials
 * (every call supplies options.model, so data_manager is never invoked).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CLIENT_COMMON = join(import.meta.dir, '..', '..', 'client', 'dedalo', 'core', 'common', 'js');
const INSTANCES_PATH = join(CLIENT_COMMON, 'instances.js');
const FIXTURES = join(import.meta.dir, 'fixtures', 'client_instances');

type Counters = { constructed: number; init_started: number; init_finished: number };

type InstancesModule = {
	get_instance: (options: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
	delete_instance: (key: string) => boolean;
	get_instance_by_id: (key: string) => Record<string, unknown> | null;
};

const globals = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let instances: InstancesModule;

const counters = (): Counters => globals.__gate_counters as Counters;

/** Awaits `promise`, failing LOUDLY (never stalling the suite) if it does not settle in time. */
const with_timeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
	Promise.race([
		promise,
		new Promise<never>((_resolve, reject) => {
			const timer = setTimeout(
				() =>
					reject(new Error(`TIMEOUT ${ms}ms: ${label} never settled — the pre-fix hang defect`)),
				ms,
			);
			// let the process exit even if the race is won
			if (typeof timer === 'object' && 'unref' in timer) (timer as { unref: () => void }).unref();
		}),
	]);

beforeAll(async () => {
	for (const key of [
		'page_globals',
		'SHOW_DEBUG',
		'window',
		'DEDALO_TOOLS_URLS',
		'DEDALO_API_URL',
		'__gate_counters',
	])
		saved[key] = globals[key];

	globals.page_globals = { dedalo_data_lang: 'lg-eng', csrf_token: 'TOK' };
	globals.DEDALO_API_URL = '/api/v1/json/';
	globals.SHOW_DEBUG = false;
	globals.window = globalThis; // instances.js does `window.get_instance_by_id = …` at import time
	// The REAL seam: tool_* models import `${DEDALO_TOOLS_URLS[model]}/js/${model}.js`.
	globals.DEDALO_TOOLS_URLS = {
		tool_gate_ok: join(FIXTURES, 'tool_gate_ok'),
		tool_gate_bad: join(FIXTURES, 'tool_gate_bad'),
	};
	globals.__gate_counters = { constructed: 0, init_started: 0, init_finished: 0 };

	// (!) instances.js statically imports data_manager.js, which reaches
	// render_api_error.js → ui.js — and ui.js is not importable from disk AT ALL
	// (it pulls lib/codex-tooltip through a serving-only path). Mask ONLY ui.js,
	// exactly like client_upload_transport.test.ts (see its mask comment for why
	// the process-global mock.module leak is harmless here: a leaked stub can
	// only replace a module that would otherwise THROW). Everything else —
	// data_manager.js, utils/, api_error.js — is imported REAL and untouched.
	mock.module(join(CLIENT_COMMON, 'ui.js'), () => ({
		ui: {
			create_dom_element: () => ({ classList: { add() {}, remove() {} }, addEventListener() {} }),
			show_message: () => {},
		},
	}));

	instances = (await import(INSTANCES_PATH)) as InstancesModule;
});

afterAll(() => {
	for (const key of Object.keys(saved)) {
		if (saved[key] === undefined) delete globals[key];
		else globals[key] = saved[key];
	}
	mock.restore();
});

beforeEach(() => {
	globals.__gate_counters = { constructed: 0, init_started: 0, init_finished: 0 };
});

const base_options = (over: Record<string, unknown> = {}) => ({
	model: 'tool_gate_ok',
	tipo: 'test52',
	section_tipo: 'test3',
	section_id: '1',
	mode: 'edit',
	lang: 'lg-eng',
	...over,
});

describe('get_instance — in-flight build de-duplication (A)', () => {
	test('two concurrent callers for one key get the SAME instance; construct+init run ONCE', async () => {
		const options_a = base_options();
		const options_b = base_options(); // distinct options object, same canonical key

		// both calls start BEFORE either resolves — this is the race window
		const p1 = instances.get_instance(options_a);
		const p2 = instances.get_instance(options_b);

		const [i1, i2] = await with_timeout(
			Promise.all([p1, p2]),
			3000,
			'concurrent get_instance pair',
		);

		expect(i1).not.toBeNull();
		expect(i1).toBeInstanceOf(Object);
		// SAME identity: pre-fix, two distinct instances came back and the loser
		// stayed alive holding its init() event subscriptions, unreachable forever
		expect(i1 as object).toBe(i2 as object);
		expect(counters().constructed).toBe(1);
		expect(counters().init_started).toBe(1);
		expect(counters().init_finished).toBe(1);

		// the winner is the registered one
		const key = (i1 as Record<string, unknown>).id as string;
		expect(instances.get_instance_by_id(key) as object).toBe(i1 as object);
		instances.delete_instance(key);
	});
});

describe('get_instance — non-object construct resolves, never hangs (B)', () => {
	test('a model whose export constructs to a non-object resolves to null within the timeout', async () => {
		const result = await with_timeout(
			instances.get_instance(base_options({ model: 'tool_gate_bad', tipo: 'test53' })),
			3000,
			'get_instance(tool_gate_bad)',
		);
		expect(result).toBeNull();
		// and it never leaked a half-built entry into the registry
		expect(instances.get_instance_by_id('tool_gate_bad_test53_test3_1_edit_lg-eng')).toBeNull();
	});
});

describe('get_instance — settled builds leave the in-flight registry (C)', () => {
	test('after delete_instance, the same key builds AGAIN (registry does not retain the key)', async () => {
		const first = await with_timeout(
			instances.get_instance(base_options({ tipo: 'test54' })),
			3000,
			'first build',
		);
		expect(first).not.toBeNull();
		expect(counters().constructed).toBe(1);

		const key = (first as Record<string, unknown>).id as string;
		expect(instances.delete_instance(key)).toBe(true);

		// If the in-flight registry retained the settled key, this would return
		// the STALE promise's instance without rebuilding — constructed stays 1
		// and the "deleted" instance resurrects.
		const second = await with_timeout(
			instances.get_instance(base_options({ tipo: 'test54' })),
			3000,
			'rebuild after delete_instance',
		);
		expect(second).not.toBeNull();
		expect(counters().constructed).toBe(2);
		expect(second).not.toBe(first as object);
		instances.delete_instance(key);
	});
});

describe('get_instance — the in-flight entry is released before any awaiter wakes (D)', () => {
	/**
	 * WHY THIS ONE IS A SOURCE ASSERTION AND NOT A BEHAVIOURAL ONE.
	 *
	 * The bug this pins: if the success path relied ONLY on the trailing
	 * `build_promise.finally(...)` to clear the in-flight entry, then for a few
	 * microtasks after the build settles the key would be live in BOTH
	 * registries. A delete_instance(key) landing in that gap empties the cache
	 * but not the in-flight map, so the very next get_instance(key) is served
	 * the JUST-DELETED instance out of the stale in-flight entry instead of
	 * rebuilding.
	 *
	 * That gap is NOT reachable from any awaiter of get_instance: the `finally`
	 * is attached directly to the inner build promise, while every caller
	 * observes through the async-function wrapper, which adopts it and
	 * therefore always resumes LATER (verified: resolve → finally →
	 * caller-continuation). Only a foreign microtask chain already queued in
	 * that window could observe it. So a behavioural test here would either be
	 * a microtask-timing coin flip or — worse — pass on the broken code and
	 * pin nothing. The ORDER is the invariant, so the order is what is pinned.
	 *
	 * If this test fails, do not relax it: restore the synchronous release, or
	 * prove the gap unobservable and delete the test with the proof in hand.
	 */
	test('the success path clears in_flight_builds between the cache write and resolve()', () => {
		const source = readFileSync(INSTANCES_PATH, 'utf8');

		const at_set = source.indexOf('instances_map.set(key, instance_element)');
		const at_release = source.indexOf('in_flight_builds.delete(key)');
		const at_resolve = source.indexOf('resolve(instance_element)');

		expect(at_set).toBeGreaterThan(-1);
		expect(at_release).toBeGreaterThan(-1);
		expect(at_resolve).toBeGreaterThan(-1);

		// cache write → release the in-flight entry → only then wake the awaiters
		expect(at_release).toBeGreaterThan(at_set);
		expect(at_resolve).toBeGreaterThan(at_release);

		// and the trailing finally is still there as the catch-all for the
		// FAILURE paths, which never reach the release above
		expect(source).toContain('build_promise.finally(');
	});
});
