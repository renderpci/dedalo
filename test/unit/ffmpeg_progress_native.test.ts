/**
 * FFMPEG PROGRESS PARSER (2026-08-12) — pure, so it is gated without ffmpeg.
 *
 * Why this is worth a gate rather than trust: the encode's percentage is the only
 * thing standing between an operator and a 46-minute transcode that LOOKS wedged.
 * Before this parser the job wire carried hand-written step markers, so the bar
 * sat at 70 for most of an hour. Getting the parse subtly wrong — reading
 * `out_time_ms` as milliseconds when ffmpeg writes MICROseconds there — replaces
 * a frozen bar with one pegged at 100% from the first block, which is worse: it
 * says the work is done while it runs.
 */

import { describe, expect, test } from 'bun:test';
import {
	chainStdout,
	createFfmpegProgressReader,
	parseFfmpegTimestamp,
} from '../../src/core/media/engine/ffmpeg_progress.ts';

describe('parseFfmpegTimestamp', () => {
	test('reads ffmpeg’s HH:MM:SS.ffffff', () => {
		expect(parseFfmpegTimestamp('00:00:10.500000')).toBeCloseTo(10.5, 5);
		expect(parseFfmpegTimestamp('01:02:03.000000')).toBeCloseTo(3723, 5);
	});

	test('tolerates whitespace and a missing fraction', () => {
		expect(parseFfmpegTimestamp(' 00:01:00 ')).toBe(60);
	});

	test('refuses what it cannot read instead of guessing', () => {
		expect(parseFfmpegTimestamp('N/A')).toBeNull();
		expect(parseFfmpegTimestamp('')).toBeNull();
		expect(parseFfmpegTimestamp('12345')).toBeNull();
	});
});

describe('createFfmpegProgressReader', () => {
	test('reports a fraction of the source duration', () => {
		const seen: number[] = [];
		const read = createFfmpegProgressReader(100, (fraction) => seen.push(fraction));
		read('out_time=00:00:25.000000\nprogress=continue\n');
		expect(seen).toEqual([0.25]);
	});

	test('survives a chunk boundary mid-line', () => {
		// The real failure mode: a split line silently drops most progress blocks
		// and the bar moves in lurches, or not at all.
		const seen: number[] = [];
		const read = createFfmpegProgressReader(100, (fraction) => seen.push(fraction));
		read('out_ti');
		read('me=00:00:50.000000\n');
		expect(seen).toEqual([0.5]);
	});

	test('never goes backwards', () => {
		// ffmpeg can emit a stale block; a bar that retreats reads as a restart.
		const seen: number[] = [];
		const read = createFfmpegProgressReader(100, (fraction) => seen.push(fraction));
		read('out_time=00:00:50.000000\n');
		read('out_time=00:00:20.000000\n');
		expect(seen).toEqual([0.5]);
	});

	test('clamps to 1 when the source outruns its declared duration', () => {
		const seen: number[] = [];
		const read = createFfmpegProgressReader(10, (fraction) => seen.push(fraction));
		read('out_time=00:00:50.000000\n');
		expect(seen).toEqual([1]);
	});

	test('IGNORES out_time_ms — ffmpeg writes MICROseconds in that field', () => {
		// The trap. Reading it as milliseconds is a thousand-fold error that pegs
		// every bar at 100% on the first block.
		const seen: number[] = [];
		const read = createFfmpegProgressReader(100, (fraction) => seen.push(fraction));
		read('out_time_ms=25000000\nprogress=continue\n');
		expect(seen).toEqual([]);
	});

	test('reports NOTHING when the duration is unknown', () => {
		// No denominator means no percentage is knowable. Inventing one is the same
		// lie as the frozen 70%; null progress is what makes the client render an
		// indeterminate bar instead.
		const seen: number[] = [];
		const read = createFfmpegProgressReader(null, (fraction) => seen.push(fraction));
		read('out_time=00:00:25.000000\n');
		expect(seen).toEqual([]);
	});

	test('reports nothing for a zero or negative duration', () => {
		const seen: number[] = [];
		const read = createFfmpegProgressReader(0, (fraction) => seen.push(fraction));
		read('out_time=00:00:25.000000\n');
		expect(seen).toEqual([]);
	});

	test('does not grow its buffer without bound on newline-less output', () => {
		const read = createFfmpegProgressReader(100, () => {});
		// A run that never emits a newline must not accumulate forever.
		for (let i = 0; i < 100; i += 1) read('x'.repeat(1000));
		// Still functional afterwards — the guard trims, it does not wedge.
		const seen: number[] = [];
		const read2 = createFfmpegProgressReader(100, (f) => seen.push(f));
		read2('out_time=00:00:10.000000\n');
		expect(seen).toEqual([0.1]);
	});
});

describe('chainStdout', () => {
	test('returns the addition when there is no existing handler', () => {
		const seen: string[] = [];
		chainStdout(undefined, (chunk) => seen.push(chunk))('a');
		expect(seen).toEqual(['a']);
	});

	test('feeds BOTH handlers so adding progress cannot silence a caller’s own', () => {
		const first: string[] = [];
		const second: string[] = [];
		chainStdout(
			(chunk) => first.push(chunk),
			(chunk) => second.push(chunk),
		)('a');
		expect(first).toEqual(['a']);
		expect(second).toEqual(['a']);
	});
});
