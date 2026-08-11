/**
 * Coverage plan §4.3.4 (the plan's LOWEST-RANKED item) — the
 * `unit_test::long_process_stream` dev-knob CLAMPS.
 *
 * Why the clamps and not the action: the action submits a background job that
 * keeps ticking after the test file finishes, inside the single Bun process the
 * whole suite shares. So the arithmetic was EXTRACTED to `longProcessBounds`
 * (behaviour-identical) and the action rewired to call it; this file gates the
 * extraction and asserts the inline copy is gone.
 *
 * Operator-visible failure it prevents: without the UPPER clamps an admin can
 * post `iterations:1e9 @ 60s` and pin a `mediaJobs` slot effectively forever —
 * a self-inflicted availability bug on the one action built to be fired casually.
 * Boundaries only; the middle of the range is not the point.
 */

import { describe, expect, test } from 'bun:test';
import { longProcessBounds } from '../../src/core/area_maintenance/widgets/unit_test.ts';

describe('longProcessBounds — the dev-knob clamps (§4.3.4)', () => {
	test('iterations: the UPPER clamp holds at 10000 (the availability guard)', () => {
		expect(longProcessBounds({ iterations: 1e9 }).iterations).toBe(10000);
		expect(longProcessBounds({ iterations: 10001 }).iterations).toBe(10000);
		expect(longProcessBounds({ iterations: 10000 }).iterations).toBe(10000);
		expect(longProcessBounds({ iterations: 9999 }).iterations).toBe(9999);
	});

	test('iterations: the LOWER clamp is 1, but `|| 10` swallows 0/NaN FIRST (pinned quirk)', () => {
		expect(longProcessBounds({ iterations: 0 }).iterations).toBe(10); // NOT 1
		expect(longProcessBounds({ iterations: 'abc' }).iterations).toBe(10);
		expect(longProcessBounds({}).iterations).toBe(10);
		expect(longProcessBounds({ iterations: -5 }).iterations).toBe(1); // clamped, not defaulted
		expect(longProcessBounds({ iterations: 1 }).iterations).toBe(1);
		expect(longProcessBounds({ iterations: 2.9 }).iterations).toBe(2); // truncated, not rounded
	});

	test('update_rate: clamped to 50 ms .. 60 s at the boundaries', () => {
		expect(longProcessBounds({ update_rate: 1 }).updateRate).toBe(50);
		expect(longProcessBounds({ update_rate: 50 }).updateRate).toBe(50);
		expect(longProcessBounds({ update_rate: 60000 }).updateRate).toBe(60000);
		expect(longProcessBounds({ update_rate: 60001 }).updateRate).toBe(60000);
		expect(longProcessBounds({ update_rate: 1e9 }).updateRate).toBe(60000);
	});

	test('update_rate: a non-numeric / absent / zero value defaults to 1000 ms', () => {
		expect(longProcessBounds({ update_rate: 'abc' }).updateRate).toBe(1000);
		expect(longProcessBounds({}).updateRate).toBe(1000);
		expect(longProcessBounds({ update_rate: 0 }).updateRate).toBe(1000);
	});

	test('the REWIRE: the clamp arithmetic exists only in longProcessBounds', async () => {
		const source = await Bun.file(
			new URL('../../src/core/area_maintenance/widgets/unit_test.ts', import.meta.url),
		).text();
		// Exactly one occurrence of each bound, and both inside the extracted helper.
		expect(source.split('Math.min(10000').length - 1).toBe(1);
		expect(source.split('Math.min(60000').length - 1).toBe(1);
		const action = source.slice(source.indexOf('async function unitTestLongProcessStream'));
		expect(action).not.toContain('Math.min');
		expect(action).toContain('longProcessBounds(options)');
	});
});
