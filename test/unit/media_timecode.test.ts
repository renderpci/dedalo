/**
 * Phase E tail gate: tool_tc timecode offset (pure transform) + module load.
 * The transform clamps at zero and applies positive offsets in reverse order to
 * avoid collisions (PHP replace_tc_codes).
 */

import { describe, expect, test } from 'bun:test';
import { replaceTimecodes } from '../../src/core/media/tools/timecode.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';

describe('replaceTimecodes (PHP replace_tc_codes)', () => {
	test('positive offset shifts every mark', () => {
		const text = 'a [TC_00:00:10.000_TC] b [TC_00:00:20.000_TC] c';
		const { text: out, changes } = replaceTimecodes(text, 5);
		expect(out).toContain('[TC_00:00:15.000_TC]');
		expect(out).toContain('[TC_00:00:25.000_TC]');
		expect(changes['00:00:10.000']).toBe('00:00:15.000');
	});

	test('negative offset clamps at zero', () => {
		const { text } = replaceTimecodes('x [TC_00:00:03.000_TC] y', -10);
		expect(text).toContain('[TC_00:00:00.000_TC]');
	});

	test('positive offset that would collide is applied in reverse (no double-shift)', () => {
		// If applied forward, shifting 10→20 first would then re-match the original 20.
		const text = '[TC_00:00:10.000_TC] [TC_00:00:20.000_TC]';
		const { text: out } = replaceTimecodes(text, 10);
		// 10→20, 20→30 — each mark shifted exactly once.
		expect(out).toBe('[TC_00:00:20.000_TC] [TC_00:00:30.000_TC]');
	});

	test('no marks / empty / non-finite → unchanged', () => {
		expect(replaceTimecodes('no timecodes here', 5).text).toBe('no timecodes here');
		expect(replaceTimecodes('', 5).text).toBe('');
		expect(replaceTimecodes('[TC_00:00:10.000_TC]', Number.NaN).text).toBe('[TC_00:00:10.000_TC]');
	});
});

describe('tool_tc module', () => {
	test('loads with a record-scope write gate', async () => {
		const loaded = await getLoadedTool('tool_tc');
		expect(loaded?.module.apiActions.change_all_timecodes?.permission).toBe('record');
		expect(loaded?.module.apiActions.change_all_timecodes?.minLevel).toBe(2);
	});
});
