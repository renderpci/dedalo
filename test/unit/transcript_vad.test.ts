/**
 * VAD / DECODE-WINDOW GATE.
 *
 * The recogniser used to cut the audio every 30 seconds with a 5-second overlap.
 * That overlap is transcribed twice (the duplicated phrases users report) and the
 * silence inside those blind windows is what makes Whisper hallucinate repetition
 * loops. `transcribers/lib/vad.js` cuts at real pauses instead, so windows need no
 * overlap and silence never reaches the model.
 *
 * Synthetic audio (tone bursts separated by silence) is enough to pin the
 * behaviour that matters: WHERE the cuts land, that no window exceeds the model's
 * context length, and that a recording the detector cannot read still gets
 * transcribed rather than silently coming back empty.
 *
 * The module is plain ESM shared verbatim with the browser worker.
 */

import { describe, expect, test } from 'bun:test';
import {
	build_windows,
	find_speech_regions,
	plan_windows,
	total_speech_seconds,
} from '../../tools/tool_transcription/transcribers/lib/vad.js';

const SAMPLE_RATE = 16000;

interface Region {
	start: number;
	end: number;
}

/**
 * Build mono PCM from a spec of [seconds, amplitude] pairs — amplitude 0 is
 * silence, anything else is a 440 Hz tone standing in for speech.
 */
function audio(spec: [number, number][]): Float32Array {
	const total = spec.reduce((sum, [seconds]) => sum + seconds, 0);
	const samples = new Float32Array(Math.round(total * SAMPLE_RATE));

	let cursor = 0;
	for (const [seconds, amplitude] of spec) {
		const count = Math.round(seconds * SAMPLE_RATE);
		for (let i = 0; i < count; i++) {
			// A little dither everywhere: real recordings are never digitally silent.
			const noise = (Math.sin(cursor * 0.7) + Math.sin(cursor * 3.1)) * 1e-5;
			samples[cursor] =
				amplitude === 0
					? noise
					: noise + amplitude * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE);
			cursor++;
		}
	}

	return samples;
}

describe('find_speech_regions', () => {
	test('finds the speech and skips the silence between two bursts', () => {
		const samples = audio([
			[1, 0], // 1s silence
			[3, 0.3], // 3s speech
			[2, 0], // 2s silence
			[2, 0.3], // 2s speech
			[1, 0], // 1s silence
		]);

		const regions: Region[] = find_speech_regions(samples, SAMPLE_RATE);

		expect(regions).toHaveLength(2);
		expect(regions[0]!.start).toBeCloseTo(0.8, 1);
		expect(regions[0]!.end).toBeCloseTo(4.2, 1);
		expect(regions[1]!.start).toBeCloseTo(5.8, 1);
	});

	test('a brief dip inside a phrase does NOT split it (hysteresis)', () => {
		const samples = audio([
			[2, 0.3],
			[0.1, 0], // a consonant, not a pause
			[2, 0.3],
		]);

		expect(find_speech_regions(samples, SAMPLE_RATE)).toHaveLength(1);
	});

	test('a click shorter than min_speech_seconds is not speech', () => {
		const samples = audio([
			[1, 0],
			[0.05, 0.4],
			[1, 0],
		]);

		expect(find_speech_regions(samples, SAMPLE_RATE)).toHaveLength(0);
	});

	test('silence only yields no regions', () => {
		expect(find_speech_regions(audio([[5, 0]]), SAMPLE_RATE)).toHaveLength(0);
	});

	test('empty or invalid input never throws', () => {
		expect(find_speech_regions(new Float32Array(0), SAMPLE_RATE)).toEqual([]);
		expect(find_speech_regions(undefined, SAMPLE_RATE)).toEqual([]);
		expect(find_speech_regions(audio([[1, 0.3]]), 0)).toEqual([]);
	});
});

describe('build_windows', () => {
	test('packs consecutive regions into one window while they fit', () => {
		const windows: Region[] = build_windows([
			{ start: 0, end: 5 },
			{ start: 6, end: 10 },
			{ start: 11, end: 15 },
		]);

		expect(windows).toHaveLength(1);
		expect(windows[0]).toEqual({ start: 0, end: 15 });
	});

	test('never exceeds the model context cap', () => {
		const regions: Region[] = [];
		for (let i = 0; i < 20; i++) {
			regions.push({ start: i * 10, end: i * 10 + 8 });
		}

		for (const window of build_windows(regions) as Region[]) {
			expect(window.end - window.start).toBeLessThanOrEqual(28);
		}
	});

	test('an uninterrupted monologue is split at the cap', () => {
		const windows: Region[] = build_windows([{ start: 0, end: 70 }]);

		expect(windows.length).toBeGreaterThanOrEqual(3);
		expect(windows[0]).toEqual({ start: 0, end: 28 });
		expect(windows[windows.length - 1]!.end).toBe(70);
	});

	test('empty input never throws', () => {
		expect(build_windows([])).toEqual([]);
		expect(build_windows(undefined)).toEqual([]);
	});
});

describe('plan_windows', () => {
	test('plans windows over the speech only', () => {
		const samples = audio([
			[2, 0.3],
			[4, 0], // a long pause: not decoded
			[2, 0.3],
		]);

		const windows: Region[] = plan_windows(samples, SAMPLE_RATE);
		const covered = total_speech_seconds(windows);

		expect(windows.length).toBeGreaterThan(0);
		// 8 seconds of audio, ~4 of speech: the long pause is never sent to the model.
		expect(covered).toBeLessThan(6);
	});

	test('FALLBACK: audio the detector cannot read is still transcribed', () => {
		const windows: Region[] = plan_windows(audio([[60, 0]]), SAMPLE_RATE);

		expect(windows.length).toBeGreaterThan(0);
		expect(windows[0]!.start).toBe(0);
		expect(windows[windows.length - 1]!.end).toBeCloseTo(60, 3);
	});

	test('no audio at all yields no windows (nothing to decode)', () => {
		expect(plan_windows(new Float32Array(0), SAMPLE_RATE)).toEqual([]);
	});
});
