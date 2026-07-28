/**
 * TRANSCRIPT POST-PROCESSING GATE — the repetition safety net.
 *
 * The tool's local engine produced transcripts with repeated words. Two distinct
 * failure modes cause that (see the module header): in-segment decoder LOOPS and
 * cross-segment BOUNDARY DUPLICATION from overlapping decode windows. Decoding
 * parameters reduce both and remove neither, so
 * `transcribers/lib/transcript_postprocess.js` is the deterministic net — and this
 * is the gate that keeps it honest.
 *
 * The module is plain ESM loaded by BOTH the browser worker and the TS server
 * path, so importing it here tests the exact code that runs in production (never
 * a re-implementation).
 *
 * The load-bearing assertions are symmetrical: real repetition in speech SURVIVES,
 * decoder repetition DIES.
 */

import { describe, expect, test } from 'bun:test';
import {
	clean_transcript,
	collapse_repeated_ngrams,
	is_degenerate,
	normalize_spacing,
	repetition_score,
	strip_overlap,
} from '../../tools/tool_transcription/transcribers/lib/transcript_postprocess.js';

describe('normalize_spacing', () => {
	test('collapses whitespace and drops the ASR leading space', () => {
		expect(normalize_spacing('  and   then\nhe said  ')).toBe('and then he said');
	});

	test('removes the space before closing punctuation', () => {
		expect(normalize_spacing('Sí , claro .')).toBe('Sí, claro.');
	});

	test('non-string input is empty, never "undefined"', () => {
		expect(normalize_spacing(undefined)).toBe('');
		expect(normalize_spacing(null)).toBe('');
	});
});

describe('collapse_repeated_ngrams', () => {
	test('kills a single-word loop, keeping the allowed repeats', () => {
		const looped = 'gracias gracias gracias gracias gracias gracias gracias';
		expect(collapse_repeated_ngrams(looped)).toBe('gracias gracias gracias');
	});

	test('kills a multi-word phrase loop down to one copy', () => {
		const looped = 'muchas gracias muchas gracias muchas gracias muchas gracias';
		expect(collapse_repeated_ngrams(looped)).toBe('muchas gracias');
	});

	test('matches through punctuation and capitalisation', () => {
		expect(collapse_repeated_ngrams('Gracias. gracias, Gracias gracias gracias')).toBe(
			'Gracias. gracias, Gracias',
		);
	});

	test('ORDINARY SPEECH SURVIVES: emphatic repetition is kept', () => {
		expect(collapse_repeated_ngrams('no, no, no')).toBe('no, no, no');
		expect(collapse_repeated_ngrams('sí sí')).toBe('sí sí');
	});

	test('a word recurring later in the sentence is untouched', () => {
		const text = 'la casa de la familia de la aldea';
		expect(collapse_repeated_ngrams(text)).toBe(text);
	});

	test('the longest phrase wins (no "muchas gracias gracias" residue)', () => {
		const looped = 'y entonces muchas gracias muchas gracias muchas gracias final';
		expect(collapse_repeated_ngrams(looped)).toBe('y entonces muchas gracias final');
	});
});

describe('repetition_score / is_degenerate', () => {
	test('distinct prose scores near zero, a loop scores high', () => {
		expect(repetition_score('cada palabra distinta en esta frase')).toBe(0);
		expect(repetition_score('gracias gracias gracias gracias')).toBeCloseTo(0.75, 5);
	});

	test('a looped window is degenerate, ordinary speech is not', () => {
		expect(is_degenerate('gracias '.repeat(20))).toBe(true);
		expect(
			is_degenerate('mi padre trabajaba en el campo y mi madre cosía para las vecinas del pueblo'),
		).toBe(false);
	});

	test('short texts are never judged degenerate', () => {
		expect(is_degenerate('sí sí sí')).toBe(false);
	});
});

describe('strip_overlap', () => {
	test('removes the duplicated head left by an overlapping decode window', () => {
		const previous = 'y entonces nos fuimos a vivir a la ciudad';
		const next = 'a vivir a la ciudad donde nació mi hermana';
		expect(strip_overlap(previous, next)).toBe('donde nació mi hermana');
	});

	test('a one-word coincidence is NOT treated as overlap', () => {
		expect(strip_overlap('fuimos a la ciudad', 'ciudad grande y ruidosa')).toBe(
			'ciudad grande y ruidosa',
		);
	});

	test('an identical segment is stripped to nothing', () => {
		expect(strip_overlap('la misma frase repetida', 'la misma frase repetida')).toBe('');
	});
});

describe('clean_transcript', () => {
	test('the whole pipeline: loops collapsed, boundary duplication gone', () => {
		const raw = [
			{ text: ' Mi padre trabajaba en el campo,', start: 0, end: 4 },
			{ text: ' en el campo, y mi madre cosía.', start: 3.5, end: 8 },
			{ text: ' gracias gracias gracias gracias gracias', start: 8, end: 12 },
		];

		const cleaned = clean_transcript(raw);

		expect(cleaned.map((s: { text: string }) => s.text)).toEqual([
			'Mi padre trabajaba en el campo,',
			'y mi madre cosía.',
			'gracias gracias gracias',
		]);
	});

	test('a segment that was pure duplication disappears and extends the previous end', () => {
		const cleaned = clean_transcript([
			{ text: 'una frase completa aquí', start: 0, end: 5 },
			{ text: 'una frase completa aquí', start: 5, end: 9 },
		]);

		expect(cleaned).toHaveLength(1);
		expect(cleaned[0]!.end).toBe(9);
	});

	test('a short identical answer far apart is KEPT (two real answers)', () => {
		const cleaned = clean_transcript([
			{ text: 'Sí.', start: 0, end: 1 },
			{ text: 'Y luego volvimos al pueblo.', start: 1, end: 6 },
			{ text: 'Sí.', start: 30, end: 31 },
		]);

		expect(cleaned).toHaveLength(3);
	});

	test('a null final end timestamp is repaired, never left null', () => {
		const cleaned = clean_transcript([
			{ text: 'primera frase', start: 0, end: null },
			{ text: 'segunda frase', start: 4, end: null },
		]);

		expect(cleaned[0]!.end).toBe(4);
		expect(cleaned[1]!.end).toBe(4);
	});

	test('empty and non-array input never throws', () => {
		expect(clean_transcript([])).toEqual([]);
		expect(clean_transcript(undefined)).toEqual([]);
		expect(clean_transcript([{ text: '   ', start: 0, end: 1 }])).toEqual([]);
	});

	test('MEASURED: the repetition score of a looped transcript drops', () => {
		const looped = [
			{ text: 'muy bien muy bien muy bien muy bien muy bien muy bien', start: 0, end: 10 },
			{ text: 'muy bien muy bien muy bien', start: 10, end: 15 },
		];

		const before = repetition_score(looped.map((s) => s.text).join(' '));
		const after = repetition_score(
			clean_transcript(looped)
				.map((s: { text: string }) => s.text)
				.join(' '),
		);

		expect(before).toBeGreaterThan(0.7);
		expect(after).toBeLessThan(0.3);
	});
});
