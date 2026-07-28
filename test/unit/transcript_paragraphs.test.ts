/**
 * PARAGRAPH GATE — an interview transcript, not a cue list.
 *
 * Speech recognisers emit one segment every few seconds; the tool used to write
 * each of them as its own `<p>` with its own `[TC_…_TC]`, which destroys the
 * paragraph structure an oral-history transcript depends on.
 * `transcribers/lib/paragraphs.js` groups those segments into paragraphs, and this
 * gate pins the grouping rules and the three timecode-density modes.
 *
 * THE LOAD-BEARING INTERACTION: the subtitle builder derives cue times by
 * interpolating BETWEEN consecutive TC marks (src/core/media/tools/subtitles.ts),
 * so paragraph-only marks would read beautifully and drift the subtitles. The
 * default 'paragraph_anchors' mode exists for exactly that, and the last describe
 * block asserts the built VTT still tracks the audio.
 *
 * The module is plain ESM shared verbatim with the browser worker — importing it
 * here tests the code that actually runs.
 */

import { describe, expect, test } from 'bun:test';
import { buildSubtitlesText } from '../../src/core/media/tools/subtitles.ts';
import {
	build_paragraph_text,
	group_paragraphs,
	parse_transcript,
	seconds_to_tc,
	segments_to_html,
	tc_to_seconds,
} from '../../tools/tool_transcription/transcribers/lib/paragraphs.js';
import type {
	Paragraph,
	TranscriptSegment as Segment,
} from '../../tools/tool_transcription/transcribers/lib/paragraphs.js';

/** A run of consecutive segments, each `seconds` long, starting at `from`. */
function run(texts: string[], from = 0, seconds = 4): Segment[] {
	return texts.map((text, index) => ({
		text,
		start: from + index * seconds,
		end: from + (index + 1) * seconds,
	}));
}

describe('timecode format', () => {
	test('round-trips through the Dédalo HH:MM:SS.mmm form', () => {
		expect(seconds_to_tc(5.6)).toBe('00:00:05.600');
		expect(seconds_to_tc(3661.5)).toBe('01:01:01.500');
		expect(tc_to_seconds('01:01:01.500')).toBe(3661.5);
	});

	test('a null/absent timestamp becomes zero, never NaN', () => {
		expect(seconds_to_tc(null)).toBe('00:00:00.000');
		expect(seconds_to_tc(undefined)).toBe('00:00:00.000');
	});

	test('millisecond rounding carries into seconds', () => {
		expect(seconds_to_tc(5.9999)).toBe('00:00:06.000');
	});
});

describe('group_paragraphs', () => {
	test('consecutive short segments become ONE paragraph', () => {
		const paragraphs: Paragraph[] = group_paragraphs(
			run(['Mi padre trabajaba en el campo', 'y mi madre cosía para las vecinas']),
		);

		expect(paragraphs).toHaveLength(1);
		expect(paragraphs[0]!.text).toBe(
			'Mi padre trabajaba en el campo y mi madre cosía para las vecinas',
		);
	});

	test('a silence longer than the gap starts a new paragraph', () => {
		const paragraphs: Paragraph[] = group_paragraphs([
			{ text: 'Primera respuesta', start: 0, end: 4 },
			{ text: 'Segunda respuesta', start: 6, end: 10 },
		]);

		expect(paragraphs).toHaveLength(2);
		expect(paragraphs[1]!.start).toBe(6);
	});

	test('a sentence end breaks only once the paragraph can stand alone', () => {
		// Four 4-second segments: the sentence ends at 8s (< min_seconds 12) and
		// again at 16s, so the ONLY break is the second one.
		const paragraphs: Paragraph[] = group_paragraphs(
			run(['Sí, claro.', 'Nos fuimos al pueblo', 'de mi abuela en verano.', 'Y allí estuvimos']),
		);

		expect(paragraphs).toHaveLength(2);
		expect(paragraphs[0]!.text).toBe('Sí, claro. Nos fuimos al pueblo de mi abuela en verano.');
		expect(paragraphs[1]!.text).toBe('Y allí estuvimos');
	});

	test('the hard duration cap breaks a monologue that never pauses', () => {
		const long = run(Array.from({ length: 40 }, (_, i) => `frase número ${i}`));
		const paragraphs: Paragraph[] = group_paragraphs(long);

		expect(paragraphs.length).toBeGreaterThan(1);
		for (const paragraph of paragraphs) {
			expect((paragraph.end ?? 0) - paragraph.start).toBeLessThanOrEqual(94);
		}
	});

	test('a speaker change always starts a new paragraph', () => {
		const paragraphs: Paragraph[] = group_paragraphs([
			{ text: '¿Y qué pasó entonces?', start: 0, end: 2, speaker: 'ENTREVISTADOR' },
			{ text: 'Pues nos fuimos', start: 2, end: 5, speaker: 'INFORMANTE' },
		]);

		expect(paragraphs).toHaveLength(2);
		expect(paragraphs[1]!.speaker).toBe('INFORMANTE');
	});

	test("'segment' mode reproduces the historical one-paragraph-per-segment output", () => {
		const paragraphs: Paragraph[] = group_paragraphs(run(['uno', 'dos', 'tres']), {
			tc_mode: 'segment',
		});

		expect(paragraphs).toHaveLength(3);
	});

	test('empty input never throws', () => {
		expect(group_paragraphs([])).toEqual([]);
		expect(group_paragraphs(undefined)).toEqual([]);
	});
});

describe('build_paragraph_text — timecode density', () => {
	const segments = run(
		['Primera parte', 'segunda parte', 'tercera parte', 'cuarta parte', 'quinta parte'],
		0,
		5,
	);

	test("'paragraph' mode writes exactly one mark", () => {
		const [paragraph] = group_paragraphs(segments, { tc_mode: 'paragraph' });
		const text = build_paragraph_text(paragraph!, { tc_mode: 'paragraph' });

		expect(text.match(/\[TC_/g)).toHaveLength(1);
		expect(text.startsWith('[TC_00:00:00.000_TC]Primera parte')).toBe(true);
	});

	test("'paragraph_anchors' adds inline marks at the configured spacing", () => {
		const [paragraph] = group_paragraphs(segments, { tc_mode: 'paragraph_anchors' });
		const text = build_paragraph_text(paragraph!, {
			tc_mode: 'paragraph_anchors',
			anchor_seconds: 10,
		});

		// Marks at 0s, then the first segment starting >= 10s after each anchor.
		expect(text.match(/\[TC_/g)!.length).toBeGreaterThan(1);
		expect(text).toContain('[TC_00:00:10.000_TC]');
	});

	test('a paragraph shorter than the anchor spacing gets a single mark', () => {
		const [paragraph] = group_paragraphs(run(['corta', 'respuesta'], 0, 2));
		const text = build_paragraph_text(paragraph!, { anchor_seconds: 15 });

		expect(text.match(/\[TC_/g)).toHaveLength(1);
	});

	test('the speaker label is written once, at the paragraph head', () => {
		const [paragraph] = group_paragraphs([
			{ text: 'Pues nos fuimos', start: 0, end: 3, speaker: 'INFORMANTE' },
		]);
		const text = build_paragraph_text(paragraph!);

		expect(text).toBe('[TC_00:00:00.000_TC]INFORMANTE: Pues nos fuimos');
	});
});

describe('segments_to_html', () => {
	test('produces the <p> structure component_text_area stores', () => {
		const html = segments_to_html([
			{ text: 'Primera respuesta completa.', start: 0, end: 4 },
			{ text: 'Segunda respuesta, después de una pausa.', start: 8, end: 12 },
		]);

		expect(html).toBe(
			'<p>[TC_00:00:00.000_TC]Primera respuesta completa.</p>' +
				'<p>[TC_00:00:08.000_TC]Segunda respuesta, después de una pausa.</p>',
		);
	});

	test('SEC-031: recognised speech is escaped, never injected as markup', () => {
		const html = segments_to_html([
			{ text: 'dijo <script>alert(1)</script> y se fue', start: 0, end: 3 },
		]);

		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
	});
});

describe('parse_transcript — re-grouping an existing transcript', () => {
	test('reads stored TC-tagged HTML back into segments', () => {
		const segments: Segment[] = parse_transcript(
			'<p>[TC_00:00:00.000_TC]Primera frase.</p><p>[TC_00:00:08.500_TC]Segunda frase.</p>',
		);

		expect(segments).toEqual([
			{ text: 'Primera frase.', start: 0, end: 8.5 },
			{ text: 'Segunda frase.', start: 8.5, end: null },
		]);
	});

	test('inline anchors inside a paragraph become their own segments', () => {
		const segments: Segment[] = parse_transcript(
			'<p>[TC_00:00:00.000_TC]Empieza aquí [TC_00:00:15.000_TC]y sigue aquí.</p>',
		);

		expect(segments).toHaveLength(2);
		expect(segments[1]!.start).toBe(15);
	});

	test('a cue-list transcript round-trips into readable paragraphs', () => {
		const cue_list = segments_to_html(run(['uno', 'dos', 'tres'], 0, 2), { tc_mode: 'segment' });
		const regrouped = segments_to_html(parse_transcript(cue_list), { tc_mode: 'paragraph' });

		expect(cue_list.match(/<p>/g)).toHaveLength(3);
		expect(regrouped).toBe('<p>[TC_00:00:00.000_TC]uno dos tres</p>');
	});

	test('text with no marks at all still yields one segment', () => {
		expect(parse_transcript('<p>texto sin marcas</p>')).toEqual([
			{ text: 'texto sin marcas', start: 0, end: null },
		]);
	});

	test('empty input never throws', () => {
		expect(parse_transcript('')).toEqual([]);
		expect(parse_transcript(undefined)).toEqual([]);
	});
});

describe('subtitles still work on a paragraphed transcript', () => {
	// 60 seconds of audio, one segment every 5 seconds.
	const segments = run(
		[
			'Mi padre trabajaba en el campo',
			'y mi madre cosía para las vecinas',
			'del pueblo donde nacimos todos',
			'y allí vivimos hasta el año sesenta',
			'cuando nos fuimos a la ciudad',
			'buscando un trabajo mejor',
			'porque en el campo ya no había nada',
			'y la familia era muy grande',
			'con siete hermanos y los abuelos',
			'todos en la misma casa pequeña',
			'que mi padre había construido',
			'con sus propias manos',
		],
		0,
		5,
	);

	test('anchored paragraphs keep the VTT tracking the audio', () => {
		const paragraphed = segments_to_html(segments, {
			tc_mode: 'paragraph_anchors',
			anchor_seconds: 15,
		});

		const vtt = buildSubtitlesText({
			sourceText: paragraphed,
			maxCharLine: 60,
			total_ms: 60000,
		});

		expect(vtt.result).not.toBe(false);
		const text = vtt.result as string;
		expect(text.startsWith('WEBVTT')).toBe(true);
		// Cue times must be spread across the recording, not bunched at its head.
		expect(text).toContain('00:00:');
		expect(/00:00:(4[0-9]|5[0-9])/.test(text)).toBe(true);
	});
});
