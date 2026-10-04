/**
 * request_activity_native — the slow-server cue is ONE page-level STATE.
 *
 * It replaced a per-request "Awaiting for busy server.." bubble raised by the
 * transport's /health probe at timeout/2: N slow parallel reads stacked N
 * identical bubbles, each lingering on its own timer after its response had
 * arrived. The contract the page indicator relies on:
 *
 *  A. A fast request never changes the level (no cue below slow_ms).
 *  B. N parallel slow requests produce ONE change to 'slow', not N.
 *  C. The level escalates to 'very_slow' on elapsed time.
 *  D. The cue drops to 'idle' the instant the LAST pending request ends — not
 *     before (one of N ending keeps it) and not on a timer.
 *  E. `end` is idempotent (every exit path may call it).
 *
 * HARNESS. request_activity.js has no imports and no DOM: imported REAL, driven
 * with millisecond thresholds and real timers.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const MODULE_PATH = join(
	import.meta.dir,
	'..',
	'..',
	'client',
	'dedalo',
	'core',
	'common',
	'js',
	'request_activity.js',
);

type State = { level: string; pending: number };
type Tracker = { begin: () => () => void; level: () => string; pending: () => number };
type Factory = (options: {
	slow_ms?: number;
	very_slow_ms?: number;
	on_change?: (state: State) => void;
}) => Tracker;

let create_request_activity: Factory;

beforeAll(async () => {
	({ create_request_activity } = await import(MODULE_PATH));
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Wide margins on purpose: real timers in a loaded full-suite run can stall the
// event loop for tens of ms. Every wait sits >= 150 ms away from a threshold.
const SLOW_MS = 200;
const VERY_SLOW_MS = 600;
/** inside the slow band: past SLOW_MS, well before VERY_SLOW_MS */
const IN_SLOW = 350;
/** past VERY_SLOW_MS */
const PAST_VERY_SLOW = 800;

const make = () => {
	const changes: State[] = [];
	const tracker = create_request_activity({
		slow_ms: SLOW_MS,
		very_slow_ms: VERY_SLOW_MS,
		on_change: (state) => changes.push(state),
	});
	return { tracker, changes };
};

describe('request_activity — the slow-server cue is one state', () => {
	test('A. a fast request never raises the cue', async () => {
		const { tracker, changes } = make();
		const end = tracker.begin();
		await sleep(5);
		end();
		await sleep(PAST_VERY_SLOW);
		expect(changes.length, 'a fast request raised the cue').toBe(0);
		expect(tracker.level()).toBe('idle');
		expect(tracker.pending()).toBe(0);
		// positive control: the same tracker DOES raise for a slow one, so the
		// silence above is the threshold working, not a dead on_change
		const end_slow = tracker.begin();
		await sleep(IN_SLOW);
		end_slow();
		expect(changes.map((c) => c.level)).toEqual(['slow', 'idle']);
	});

	test('B. N parallel slow requests raise it ONCE', async () => {
		const { tracker, changes } = make();
		const ends = [tracker.begin(), tracker.begin(), tracker.begin(), tracker.begin()];
		await sleep(IN_SLOW);
		expect(changes).toEqual([{ level: 'slow', pending: 4 }]);
		for (const end of ends) end();
	});

	test('C. it escalates to very_slow on elapsed time', async () => {
		const { tracker, changes } = make();
		const end = tracker.begin();
		await sleep(PAST_VERY_SLOW);
		expect(changes.map((c) => c.level)).toEqual(['slow', 'very_slow']);
		end();
		expect(tracker.level()).toBe('idle');
	});

	test('D. it drops only when the LAST pending request ends, immediately', async () => {
		const { tracker, changes } = make();
		const end_a = tracker.begin();
		const end_b = tracker.begin();
		await sleep(IN_SLOW);
		end_a();
		expect(tracker.level(), 'one of two ending must keep the cue').toBe('slow');
		end_b();
		expect(tracker.level(), 'the cue outlived its last request').toBe('idle');
		expect(changes.map((c) => c.level)).toEqual(['slow', 'idle']);
		// no timer of an ended request may bring the cue back
		await sleep(PAST_VERY_SLOW);
		expect(changes.map((c) => c.level)).toEqual(['slow', 'idle']);
	});

	test('D2. a new fast request while slow does not reset the level', async () => {
		const { tracker, changes } = make();
		const end_slow = tracker.begin();
		await sleep(IN_SLOW);
		const end_fast = tracker.begin();
		end_fast();
		expect(tracker.level()).toBe('slow');
		end_slow();
		expect(changes.map((c) => c.level)).toEqual(['slow', 'idle']);
	});

	test('E. end is idempotent', async () => {
		const { tracker, changes } = make();
		const end_a = tracker.begin();
		const end_b = tracker.begin();
		await sleep(IN_SLOW);
		end_a();
		end_a();
		expect(tracker.pending()).toBe(1);
		expect(tracker.level()).toBe('slow');
		end_b();
		expect(changes.map((c) => c.level)).toEqual(['slow', 'idle']);
	});
});
