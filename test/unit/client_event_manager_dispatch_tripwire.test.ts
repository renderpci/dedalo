/**
 * PUBLISH DISPATCH CONTRACT — client/dedalo/core/common/js/event_manager.js
 *
 * WHY THIS FILE EXISTS. `publish()` iterated the LIVE subscriber Set with
 * `forEach` and wrapped nothing in try/catch, while its own comment claimed it
 * snapshotted. Two defects:
 *
 *  1. NO ISOLATION. One throwing subscriber aborted the iteration, so every
 *     later subscriber was silently skipped. Worst on 'api_error', which every
 *     failing request publishes and which page.js, error_dispatch and per-tool
 *     policies all listen on — one bad handler disabled error reporting for the
 *     rest of the session.
 *  2. NO SNAPSHOT. `Set.prototype.forEach` visits entries appended during
 *     iteration, so a handler that subscribed during dispatch fired in the same
 *     pass — the opposite of the documented behaviour.
 *
 * WHAT IS PINNED (contract, not implementation):
 *  A. A throwing subscriber does not stop the ones after it.
 *  B. A thrower contributes NO entry to the results array (callers iterate and
 *     dereference results; a placeholder would relocate the crash).
 *  C. A subscriber added DURING a publish does not fire in that pass.
 *  D. A subscriber unsubscribed DURING a publish does NOT fire — this is what
 *     makes destroy()-mid-dispatch safe, since destroy nulls context/data/node.
 *  E. clear_event during a publish stops the remaining subscribers.
 *  F. No subscribers still returns `false` (not []), and subscribe_once still
 *     fires exactly once.
 *
 * HARNESS. event_manager.js imports nothing and only needs the SHOW_DEBUG and
 * window globals. No DB, no network, no credentials.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const EM_PATH = join(
	import.meta.dir,
	'..',
	'..',
	'client',
	'dedalo',
	'core',
	'common',
	'js',
	'event_manager.js',
);

type EventManager = {
	subscribe: (name: string, cb: (data?: unknown) => unknown) => string;
	subscribe_once: (name: string, cb: (data?: unknown) => unknown) => string;
	unsubscribe: (token: string) => boolean;
	publish: (name: string, data?: unknown) => unknown[] | false;
	clear_event: (name: string) => boolean;
	clear_all: () => void;
	get_total_events: () => number;
};

const globals = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let event_manager: EventManager;
let console_errors: string[] = [];
let real_console_error: typeof console.error;

beforeAll(async () => {
	for (const key of ['SHOW_DEBUG', 'window']) saved[key] = globals[key];
	globals.SHOW_DEBUG = false;
	globals.window = globalThis;

	event_manager = ((await import(EM_PATH)) as { event_manager: EventManager }).event_manager;

	real_console_error = console.error;
});

afterAll(() => {
	console.error = real_console_error;
	for (const key of Object.keys(saved)) {
		if (saved[key] === undefined) delete globals[key];
		else globals[key] = saved[key];
	}
});

beforeEach(() => {
	event_manager.clear_all();
	console_errors = [];
	// capture the REPORTED half of the swallow contract (CONVENTIONS §1)
	console.error = (...args: unknown[]) => {
		console_errors.push(args.map((a) => String(a)).join(' '));
	};
});

describe('publish — one throwing subscriber does not silence the others (A, B)', () => {
	test('later subscribers still run, the thrower is reported, and contributes no result', () => {
		const ran: string[] = [];

		event_manager.subscribe('api_error', () => {
			ran.push('first');
			return 'first_result';
		});
		event_manager.subscribe('api_error', () => {
			ran.push('thrower');
			throw new Error('subscriber blew up');
		});
		event_manager.subscribe('api_error', () => {
			ran.push('third');
			return 'third_result';
		});

		const results = event_manager.publish('api_error', { code: 'x' });

		// pre-fix: ['first','thrower'] — 'third' never ran
		expect(ran).toEqual(['first', 'thrower', 'third']);

		// the thrower leaves NO hole for a caller to dereference
		expect(results).toEqual(['first_result', 'third_result']);

		// swallow is only legal when REPORTED
		expect(console_errors.length).toBe(1);
		expect(console_errors[0]).toContain('api_error');
	});
});

describe('publish — snapshot: a subscriber added mid-dispatch waits for the next pass (C)', () => {
	test('the newly added callback does not fire in the publish that added it', () => {
		const ran: string[] = [];

		event_manager.subscribe('render', () => {
			ran.push('original');
			event_manager.subscribe('render', () => ran.push('added_during_dispatch'));
		});

		event_manager.publish('render');
		// pre-fix Set.forEach visited the appended entry in the SAME pass
		expect(ran).toEqual(['original']);

		// ...and it does fire on the next publish
		event_manager.publish('render');
		expect(ran).toEqual(['original', 'original', 'added_during_dispatch']);
	});
});

describe('publish — removals during dispatch are honoured (D, E)', () => {
	test('a subscriber unsubscribed by an earlier subscriber never runs', () => {
		const ran: string[] = [];

		let victim_token = '';
		event_manager.subscribe('quit', () => {
			ran.push('destroyer');
			// exactly what do_delete_self does mid-dispatch
			event_manager.unsubscribe(victim_token);
		});
		victim_token = event_manager.subscribe('quit', () => ran.push('victim'));

		event_manager.publish('quit');

		// firing 'victim' here would call into an instance destroy() has already
		// emptied (context/data/node nulled)
		expect(ran).toEqual(['destroyer']);
	});

	test('clear_event during dispatch stops the remaining subscribers', () => {
		const ran: string[] = [];

		event_manager.subscribe('change_lang', () => {
			ran.push('first');
			event_manager.clear_event('change_lang');
		});
		event_manager.subscribe('change_lang', () => ran.push('second'));

		event_manager.publish('change_lang');
		expect(ran).toEqual(['first']);
	});
});

describe('publish — unchanged contracts (F)', () => {
	test('no subscribers returns false, not an empty array', () => {
		expect(event_manager.publish('nobody_listens')).toBe(false);
	});

	test('all-throwing subscribers still return an array, distinguishable from false', () => {
		event_manager.subscribe('boom', () => {
			throw new Error('nope');
		});
		const results = event_manager.publish('boom');
		expect(results).toEqual([]);
		expect(results).not.toBe(false);
	});

	test('subscribe_once fires exactly once and releases its token', () => {
		const ran: string[] = [];
		event_manager.subscribe_once('one_shot', () => ran.push('hit'));

		event_manager.publish('one_shot');
		event_manager.publish('one_shot');

		expect(ran).toEqual(['hit']);
		expect(event_manager.get_total_events()).toBe(0);
	});

	test('results preserve subscription order and pass the same data to each', () => {
		const seen: unknown[] = [];
		event_manager.subscribe('ordered', (d) => {
			seen.push(d);
			return 1;
		});
		event_manager.subscribe('ordered', (d) => {
			seen.push(d);
			return 2;
		});

		const payload = { data: 152 };
		expect(event_manager.publish('ordered', payload)).toEqual([1, 2]);
		expect(seen).toEqual([payload, payload]);
	});
});
