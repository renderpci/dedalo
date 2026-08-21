/**
 * DATA-MODEL PRESERVATION CONTRACT — client/dedalo/core/component_common/js/component_common.js
 *
 * WHY THIS FILE EXISTS. Both the build path and the save path looked their own
 * record up in the API answer and then wrote the miss straight into the model:
 *
 *     const data = result.data.find(el => el.tipo===self.tipo && …)
 *     if(!data){ if(SHOW_DEBUG===true){ console.warn(…) } }   // invisible in production
 *     self.data = data || {}                                  // <- the model is emptied
 *     self.db_data = clone(self.data)                         // <- and so is the baseline
 *
 * A miss was treated as a valid answer. `self.data` lost tipo / section_tipo /
 * section_id / entries, `get_value()` started answering undefined, and the
 * change-detection baseline (`db_data`) was emptied too — so every later edit
 * read as changed and the component went on writing garbage-shaped saves while
 * looking perfectly alive. On the save path the save had SUCCEEDED, which makes
 * the wipe purely self-inflicted.
 *
 * WHAT IS PINNED (contract, not implementation):
 *  A. A save answer that omits this instance's record KEEPS the previous
 *     self.data — identity and entries survive, get_value() still answers.
 *  B. …and flags the instance: self.data_degraded === true.
 *  C. A save answer that CARRIES the record adopts it and clears the flag.
 *  D. The miss is reported unconditionally, not only under SHOW_DEBUG.
 *  F. THE BASELINE IS NOT ADVANCED on a miss. db_data must keep the last value
 *     the server actually confirmed — advancing it to the unconfirmed local
 *     value would assert the edit is stored.
 *  G. …and a degraded instance is never short-circuited by the "nothing
 *     changed" optimisation, so the save the server never acknowledged is
 *     really retried. F+G together are what stops the kept model from turning a
 *     visible wipe into a silent, permanent divergence.
 *  E. SOURCE SHAPE. Neither path may resurrect `self.data = data || {}` — the
 *     one line that caused all of the above. The BUILD path is pinned by this
 *     scan only: do_build needs a full render harness, so its degraded branch
 *     has no behavioural test here.
 *
 * HARNESS. component_common.js is imported REAL. Only `ui.js` is module-masked —
 * it imports a vendor bundle that is not resolvable here — and the mask is a
 * permissive proxy, because `mock.module` is NOT undone by `mock.restore()` and
 * therefore reaches every later file in the run. For the same reason the
 * transport is NOT module-masked: `data_manager.request` is monkey-patched on
 * the real object and restored in afterAll, so files that need the real
 * transport (read_stream, coalescing, deadline) still get it. No DB, no server.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CLIENT_ROOT = join(import.meta.dir, '..', '..', 'client', 'dedalo');
const COMPONENT_COMMON_PATH = join(
	CLIENT_ROOT,
	'core',
	'component_common',
	'js',
	'component_common.js',
);
const UI_PATH = join(CLIENT_ROOT, 'core', 'common', 'js', 'ui.js');
const DATA_MANAGER_PATH = join(CLIENT_ROOT, 'core', 'common', 'js', 'data_manager.js');

const globals = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};

/** a permissive stand-in for anything the masked ui.js is asked for */
// biome-ignore lint/suspicious/noExplicitAny: the client module is untyped vanilla JS
const ui_stub: any = new Proxy((() => {}) as unknown as Record<string, unknown>, {
	get: (_target, prop) => (prop === 'then' ? undefined : ui_stub),
	apply: () => ui_stub,
});

/** the envelope the stubbed transport answers with */
let next_envelope: unknown = null;
/** everything console.error printed during a test */
let errors: unknown[][] = [];
let real_console_error: typeof console.error;

// biome-ignore lint/suspicious/noExplicitAny: the client module is untyped vanilla JS
let component_common: any;
let data_manager: { request: (options: unknown) => Promise<unknown> };
let real_request: (options: unknown) => Promise<unknown>;

beforeAll(async () => {
	for (const key of ['window', 'SHOW_DEBUG', 'SHOW_DEVELOPER', 'DEDALO_CORE_URL', 'page_globals']) {
		saved[key] = globals[key];
	}
	globals.window = globals;
	globals.SHOW_DEBUG = false;
	globals.SHOW_DEVELOPER = false;
	globals.DEDALO_CORE_URL = '';

	// ui.js reaches for a vendor bundle and a DOM that do not exist here
	mock.module(UI_PATH, () => ({ ui: ui_stub, default: ui_stub }));

	// the transport is patched IN PLACE, never module-masked
	const transport = (await import(DATA_MANAGER_PATH)) as unknown as {
		data_manager: { request: (options: unknown) => Promise<unknown> };
	};
	data_manager = transport.data_manager;
	real_request = data_manager.request;
	data_manager.request = async () => next_envelope;

	const module = await import(COMPONENT_COMMON_PATH);
	component_common = module.component_common;
});

afterAll(() => {
	// guarded: a module-mask leaked by an EARLIER file can make beforeAll throw
	// before the transport was captured (the events.js stub other client files
	// install does exactly that) — an unguarded restore adds a second, noisier
	// failure on top of that one.
	if (data_manager && real_request) data_manager.request = real_request;
	for (const [key, value] of Object.entries(saved)) {
		if (value === undefined) delete globals[key];
		else globals[key] = value;
	}
	mock.restore();
});

beforeAll(() => {
	real_console_error = console.error;
});

beforeEach(() => {
	errors = [];
	console.error = (...args: unknown[]) => {
		errors.push(args);
	};
});

// restore in afterEach, NOT inline in each test: an assertion throws past an
// inline restore and would leave console.error swallowed for the whole process
afterEach(() => {
	console.error = real_console_error;
});

/** a bare instance carrying only what save()'s success path reads */
const make_instance = () =>
	({
		__proto__: component_common.prototype,
		id_base: 'test_component',
		model: 'component_input_text',
		tipo: 'test1',
		section_tipo: 'test2',
		section_id: '3',
		mode: 'edit',
		node: null,
		saving: false,
		permissions: 2,
		data: {
			tipo: 'test1',
			section_tipo: 'test2',
			section_id: '3',
			entries: ['the value the user just saved'],
			changed_data: [],
		},
		db_data: {
			tipo: 'test1',
			section_tipo: 'test2',
			section_id: '3',
			entries: ['the value before the edit'],
		},
		// biome-ignore lint/suspicious/noExplicitAny: the client module is untyped vanilla JS
	}) as any;

const CHANGED = [{ action: 'update', key: 0, value: 'the value the user just saved' }];

describe('component_common.save — a response that omits the record', () => {
	test('A+B: keeps the previous data model and flags the instance degraded', async () => {
		const self = make_instance();
		const before = structuredClone(self.data);
		// the envelope is a SUCCESS: it simply does not carry this record
		next_envelope = {
			ok: true,
			data: {
				data: [{ tipo: 'other9', section_tipo: 'test2', section_id: '3', entries: [] }],
				context: [],
			},
		};

		await self.save(CHANGED);

		expect(self.data.tipo).toBe(before.tipo);
		expect(self.data.section_tipo).toBe(before.section_tipo);
		expect(self.data.section_id).toBe(before.section_id);
		expect(self.data.entries).toEqual(before.entries);
		expect(self.get_value()).toEqual(before.entries);
		expect(self.data_degraded).toBe(true);
	});

	test('F: the db_data baseline is NOT advanced to the unconfirmed value', async () => {
		const self = make_instance();
		const baseline = structuredClone(self.db_data);
		next_envelope = { ok: true, data: { data: [], context: [] } };

		await self.save(CHANGED);

		// the baseline still holds the last value the SERVER confirmed
		expect(self.db_data.entries).toEqual(baseline.entries);
		expect(self.db_data.entries).not.toEqual(self.data.entries);
	});

	test('G: a degraded instance still sends the retry (no no-change short-circuit)', async () => {
		const self = make_instance();
		next_envelope = { ok: true, data: { data: [], context: [] } };
		await self.save(CHANGED);
		expect(self.data_degraded).toBe(true);

		// the same edit again: with the baseline advanced this would report
		// "nothing changed" and never reach the wire
		let sent = 0;
		const previous = data_manager.request;
		data_manager.request = async (options: unknown) => {
			sent++;
			return previous(options);
		};
		const answer = await self.save(CHANGED);
		data_manager.request = previous;

		expect(sent).toBe(1);
		expect(answer).not.toBe(false);
	});

	test('D: the miss is reported with SHOW_DEBUG off', async () => {
		const self = make_instance();
		globals.SHOW_DEBUG = false;
		next_envelope = { ok: true, data: { data: [], context: [] } };

		await self.save(CHANGED);

		const said_it = errors.some((args) => String(args[0]).includes('data not found'));
		expect(said_it).toBe(true);
	});

	test('C: a response that carries the record adopts it and clears the flag', async () => {
		const self = make_instance();
		self.data_degraded = true;
		const server_record = {
			tipo: 'test1',
			section_tipo: 'test2',
			section_id: '3',
			entries: ['server value'],
		};
		next_envelope = { ok: true, data: { data: [server_record], context: [] } };

		await self.save(CHANGED);

		expect(self.data.entries).toEqual(['server value']);
		expect(self.data_degraded).toBe(false);
		expect(self.db_data.entries).toEqual(['server value']);
	});
});

describe('source shape', () => {
	test('E: neither path resurrects `self.data = data || {}`', () => {
		const source = readFileSync(COMPONENT_COMMON_PATH, 'utf8');
		const offenders = source
			.split('\n')
			.map((line, index) => ({ line: line.trim(), n: index + 1 }))
			.filter((entry) => /^self\.data\s*=\s*data\s*\|\|\s*\{\s*\}/.test(entry.line));
		expect(offenders).toEqual([]);
	});
});
