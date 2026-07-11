/**
 * Subtitles builder gate — pure port of PHP shared/class.subtitles.php
 * (build_subtitles_text + helpers) driven over fixture transcripts: WEBVTT
 * header, cue numbering/count, timecode format and interpolation, the 2-line
 * break, tag balancing, mark stripping, and the mandatory-var failures.
 * The handler around it (tool_transcription::build_subtitles_file) is covered
 * for its validation surface in tool_transcription.test.ts; the full DB+file
 * drive is ledgered (needs a seeded AV record + media files).
 */

import { describe, expect, test } from 'bun:test';
import { subtitlesRelativePath, subtitlesUrl } from '../../src/core/media/path.ts';
import {
	buildSubtitlesText,
	calculateGlobalCharTime,
	cleanTextForSubtitles,
	fragmentSplit,
	getArLines,
	reviseTagInLine,
	textLength,
	trimText,
	truncateText,
} from '../../src/core/media/tools/subtitles.ts';

const CUE_TC_LINE = /^\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}$/;

describe('buildSubtitlesText', () => {
	test('mandatory vars: empty sourceText / maxCharLine fail with the PHP message', () => {
		const noText = buildSubtitlesText({ sourceText: '', maxCharLine: 144 });
		expect(noText.result).toBe(false);
		expect(noText.msg).toContain("Var 'sourceText' is mandatory!");

		const noMax = buildSubtitlesText({ sourceText: 'hello', maxCharLine: 0 });
		expect(noMax.result).toBe(false);
		expect(noMax.msg).toContain("Var 'maxCharLine' is mandatory!");
	});

	test('two TC segments → WEBVTT with two numbered cues and correct timecodes', () => {
		const sourceText =
			'[TC_00:00:00.000_TC]Hello world this is a test.<p>[TC_00:00:05.000_TC]Second segment text here.';
		const built = buildSubtitlesText({ sourceText, maxCharLine: 144, total_ms: 10000 });
		expect(built.msg).toBe('OK. Request done [build_subtitles_text]');
		expect(typeof built.result).toBe('string');
		const vtt = built.result as string;

		expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
		const cues = vtt
			.slice('WEBVTT\n\n'.length)
			.split('\n\n')
			.filter((cue) => cue !== '');
		expect(cues).toHaveLength(2);

		const [first, second] = cues as [string, string];
		const firstLines = first.split('\n');
		expect(firstLines[0]).toBe('1');
		expect(firstLines[1]).toBe('00:00:00.000 --> 00:00:05.000');
		expect(firstLines[2]).toBe('Hello world this is a test.');

		const secondLines = second.split('\n');
		expect(secondLines[0]).toBe('2');
		// last cue: tcout = tcin + 5 s (PHP fallback)
		expect(secondLines[1]).toBe('00:00:05.000 --> 00:00:10.000');
		expect(secondLines[2]).toBe('Second segment text here.');
	});

	test('every cue timecode line matches the HH:MM:SS.mmm --> HH:MM:SS.mmm shape', () => {
		const sourceText =
			'[TC_00:00:01.850_TC]Can you say me your name please and something more.' +
			'<p>[TC_00:00:13.450_TC]My name is a very long name indeed for a test transcript.' +
			'<p>[TC_00:01:25.627_TC]Closing remarks at the end.';
		const built = buildSubtitlesText({ sourceText, maxCharLine: 144, total_ms: 95000 });
		const vtt = built.result as string;
		const tcLines = vtt.split('\n').filter((line) => line.includes(' --> '));
		expect(tcLines.length).toBeGreaterThanOrEqual(3);
		for (const line of tcLines) {
			expect(line).toMatch(CUE_TC_LINE);
		}
		// interpolated cue tcins are monotonically ordered by construction
		expect(vtt).toContain('00:00:01.850 --> ');
		expect(vtt).toContain('00:00:13.450 --> ');
		expect(vtt).toContain('00:01:25.627 --> ');
	});

	test('a long fragment splits into multiple interpolated cues (maxCharLine bound)', () => {
		const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
		const sourceText = `[TC_00:00:00.000_TC]${words}<p>[TC_00:01:00.000_TC]end.`;
		const built = buildSubtitlesText({ sourceText, maxCharLine: 40, total_ms: 65000 });
		const vtt = built.result as string;
		const tcLines = vtt.split('\n').filter((line) => line.includes(' --> '));
		// 30 words ≫ 40 chars per line → several cues before the 'end.' one
		expect(tcLines.length).toBeGreaterThan(3);
		for (const line of tcLines) {
			expect(line).toMatch(CUE_TC_LINE);
		}
		// the first interpolated cue starts at the fragment tc
		expect(tcLines[0]?.startsWith('00:00:00.000 --> ')).toBe(true);
	});

	test('a cue longer than maxCharLine/2 breaks into two display lines', () => {
		const text = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh';
		const sourceText = `[TC_00:00:00.000_TC]${text}<p>[TC_00:00:10.000_TC]end.`;
		const built = buildSubtitlesText({ sourceText, maxCharLine: 60, total_ms: 15000 });
		const vtt = built.result as string;
		const firstCue = vtt.slice('WEBVTT\n\n'.length).split('\n\n')[0] as string;
		const lines = firstCue.split('\n');
		// number, tc line, then TWO text lines
		expect(lines).toHaveLength(4);
		expect(`${lines[2]} ${lines[3]}`.replace(/\s+/g, ' ')).toBe(text);
	});
});

describe('subtitles helpers', () => {
	test('cleanTextForSubtitles: strips non-TC marks, keeps TC, normalizes tags', () => {
		const raw =
			'<p>[TC_00:00:01.850_TC]Hello <strong>bold</strong> and <em>italic</em>' +
			'[index-n-1-label-data:d:data] world[/index-n-1-label-data:d:data]' +
			'[note-a-2-data:{"x":1}:data]&nbsp;tail</p>';
		const clean = cleanTextForSubtitles(raw);
		expect(clean).toContain('[TC_00:00:01.850_TC]'); // deleteTC=false
		expect(clean).not.toContain('[index');
		expect(clean).not.toContain('[/index');
		expect(clean).not.toContain('[note');
		expect(clean).not.toContain('<p>');
		expect(clean).toContain('<b>bold</b>');
		expect(clean).toContain('<i>italic</i>');
		expect(clean).toContain(' tail'); // &nbsp; → space
	});

	test('calculateGlobalCharTime: ms / chars / 1000, zero on empty inputs', () => {
		expect(calculateGlobalCharTime('ab', 4000)).toBe(2); // 4000/2/1000
		expect(calculateGlobalCharTime('', 4000)).toBe(0);
		expect(calculateGlobalCharTime('abc', 0)).toBe(0);
		expect(calculateGlobalCharTime('abc', null)).toBe(0);
	});

	test('trimText / truncateText / textLength (mb semantics)', () => {
		expect(trimText('\nhello\r')).toBe('hello');
		expect(trimText(null)).toBe('');
		expect(truncateText('hello world again', 11, ' ', '')).toBe('hello');
		expect(truncateText('short', 50)).toBe('short');
		expect(textLength('a€b')).toBe(3);
		// Astral char (emoji, 2 UTF-16 units / 1 code point) before the break
		// space: the breakpoint must be code-point indexed. A UTF-16 lastIndexOf
		// here would over-slice and drop/keep the wrong characters (mb_strrpos).
		// '😀 x y z' cut to 5 code points = '😀 x y', last space at code-point 3.
		expect(truncateText('😀 x y z', 5, ' ', '')).toBe('😀 x');
		expect([...truncateText('😀 x y z', 5, ' ', '')]).toHaveLength(3);
	});

	test('reviseTagInLine balances stray bold/italic tags', () => {
		expect(reviseTagInLine('<b>open only', 'b')).toBe('<b>open only</b>');
		expect(reviseTagInLine('close only</i>', 'i')).toBe('<i>close only</i>');
		expect(reviseTagInLine('a</b><b>b', 'b')).toBe('ab');
		expect(reviseTagInLine('balanced <b>x</b>', 'b')).toBe('balanced <b>x</b>');
	});

	test('fragmentSplit carries bold continuity across lines', () => {
		const text = '<b>bold spans across the whole line and continues</b> tail words here';
		const lines = fragmentSplit(text, '[TC_00:00:00.000_TC]', '[TC_00:00:10.000_TC]', {
			maxCharLine: 30,
			charTime: 0.1,
		});
		expect(lines.length).toBeGreaterThan(1);
		for (const line of lines) {
			// every emitted line is self-balanced
			const opens = line.text.split('<b>').length - 1;
			const closes = line.text.split('</b>').length - 1;
			expect(opens).toBe(closes);
			expect(line.tcin).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
		}
	});

	test('getArLines: legacy no-ms TC tags are accepted', () => {
		const lines = getArLines('[TC_00:00:03_TC]legacy tag text', {
			maxCharLine: 144,
			charTime: 0,
		});
		expect(lines).toHaveLength(1);
		expect(lines[0]?.tcin).toBe('00:00:03.000');
		expect(lines[0]?.text).toBe('legacy tag text');
	});

	test('unbreakable-word guard: no infinite loop, whole chunk taken', () => {
		const text = 'x'.repeat(50); // no spaces at all
		const lines = fragmentSplit(text, null, null, { maxCharLine: 20, charTime: 0 });
		expect(lines.length).toBe(3); // 20 + 20 + 10
		expect(lines.map((line) => line.text).join('')).toBe(text);
	});
});

describe('subtitles path grammar (shared single source)', () => {
	const identity = {
		componentTipo: 'rsc35',
		sectionTipo: 'rsc167',
		sectionId: 1,
		lang: null,
	};

	test('relative path + url follow the PHP get_subtitles_path/url grammar', () => {
		expect(subtitlesRelativePath(identity, 'lg-spa')).toBe(
			'/av/subtitles/rsc35_rsc167_1_lg-spa.vtt',
		);
		expect(subtitlesUrl(identity, 'lg-spa')).toBe(
			'/dedalo/media/av/subtitles/rsc35_rsc167_1_lg-spa.vtt',
		);
	});

	test('rejects a lang that could break the filename grammar', () => {
		expect(() => subtitlesRelativePath(identity, '../evil')).toThrow(/Invalid subtitles lang/);
		expect(() => subtitlesRelativePath(identity, '')).toThrow(/Invalid subtitles lang/);
	});
});
