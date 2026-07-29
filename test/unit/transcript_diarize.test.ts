/**
 * DIARIZATION POST-PROCESSING GATE (tools/tool_transcription/transcribers/lib/
 * diarize.js — the pure half of speaker detection; the model inference lives
 * in the Worker and is not testable here, exactly the vad.js split).
 *
 * Pins the three contracts the feature stands on:
 *  - cross-chunk identity stitching: local speaker labels of overlapping
 *    chunks map onto GLOBAL speakers by co-activity in the overlap zone —
 *    label permutation between chunks must not invent people;
 *  - segment attribution: a segment belongs to the speaker covering most of
 *    it, uncovered segments inherit continuity, the caller's array is never
 *    mutated;
 *  - speaker tags in the stored text: segments_to_html emits the mapped
 *    person tag at each speaker TURN (never repeated inside a run), right
 *    after the paragraph's opening TC mark, surviving HTML escaping byte-
 *    exactly (the v6 tag position).
 */

import { describe, expect, test } from 'bun:test';
import { parseTagId } from '../../src/core/components/component_text_area/tag_grammar.ts';
import {
	assign_speakers_to_segments,
	cluster_speaker_turns,
	speaker_stats,
	stitch_diarization_chunks,
} from '../../tools/tool_transcription/transcribers/lib/diarize.js';
import { segments_to_html } from '../../tools/tool_transcription/transcribers/lib/paragraphs.js';

describe('stitch_diarization_chunks', () => {
	test('two chunks with PERMUTED local labels resolve to the same two people', () => {
		// A conversational handover sits inside the overlap zone [25,30]: both
		// voices are audible there, so both can be re-identified even though
		// chunk 2 labels them in the OPPOSITE order.
		//   Chunk 1 (0-30):  A = local 0 (0-27.5), B = local 1 (27.5-30).
		//   Chunk 2 (25-55): A's tail is local 0 (rel 0-2.5), B answers as
		//   local 1 (rel 2.5-15 = abs 27.5-40), then A again (rel 15-30).
		const turns = stitch_diarization_chunks(
			[
				{
					offset: 0,
					turns: [
						{ id: 0, start: 0, end: 27.5 },
						{ id: 1, start: 27.5, end: 30 },
					],
				},
				{
					offset: 25,
					turns: [
						{ id: 0, start: 0, end: 2.5 },
						{ id: 1, start: 2.5, end: 15 },
						{ id: 0, start: 15, end: 30 },
					],
				},
			],
			{ overlap_seconds: 5 },
		);
		expect(turns).toEqual([
			{ speaker: 0, start: 0, end: 27.5 }, // A, duplicated tail merged
			{ speaker: 1, start: 27.5, end: 40 }, // B, duplicated detection merged
			{ speaker: 0, start: 40, end: 55 }, // A again — same person, not a third
		]);
	});

	test('a voice with no co-activity in the overlap becomes a NEW speaker (never a guess)', () => {
		const turns = stitch_diarization_chunks(
			[
				{ offset: 0, turns: [{ id: 0, start: 0, end: 28 }] },
				// Overlap zone 25-30 is silent in chunk 2; its voice starts at 40.
				{ offset: 25, turns: [{ id: 0, start: 15, end: 25 }] },
			],
			{ overlap_seconds: 5 },
		);
		expect(turns).toEqual([
			{ speaker: 0, start: 0, end: 28 },
			{ speaker: 1, start: 40, end: 50 },
		]);
	});

	test('noise turns below min_turn_seconds are dropped', () => {
		const turns = stitch_diarization_chunks(
			[
				{
					offset: 0,
					turns: [
						{ id: 0, start: 0, end: 0.2 },
						{ id: 0, start: 2, end: 5 },
					],
				},
			],
			{ min_turn_seconds: 0.4 },
		);
		expect(turns).toEqual([{ speaker: 0, start: 2, end: 5 }]);
	});

	test('empty input is empty output', () => {
		expect(stitch_diarization_chunks([], {})).toEqual([]);
		expect(stitch_diarization_chunks([{ offset: 0, turns: [] }], {})).toEqual([]);
	});
});

describe('cluster_speaker_turns (voice-fingerprint identity — coherence on long audio)', () => {
	// Synthetic fingerprints: voice A ~ [1,0,ε], voice B ~ [0,1,ε]. Local ids
	// PERMUTE across chunks and speakers vanish from overlaps — exactly the
	// case that fragments co-activity stitching on long interviews.
	const A = (jitter: number) => [1, jitter, 0.05];
	const B = (jitter: number) => [jitter, 1, -0.05];

	test('the same voice keeps ONE speaker id across distant, non-overlapping chunks', () => {
		const turns = cluster_speaker_turns(
			[
				// chunk 1: A speaks (local 0), B interjects (local 1)
				{ turns: [{ start: 0, end: 120 }], embedding: A(0.02) },
				{ turns: [{ start: 120, end: 130 }], embedding: B(0.01) },
				// chunk 2 (minutes later): B is local 0 there, A is local 1
				{ turns: [{ start: 900, end: 960 }], embedding: B(0.06) },
				{ turns: [{ start: 960, end: 1100 }], embedding: A(0.04) },
				// chunk 3: only A speaks — absent from every overlap
				{ turns: [{ start: 2400, end: 2600 }], embedding: A(0.03) },
			],
			{ cluster_similarity: 0.5 },
		);
		// TWO people, appearance-ordered: A (first voice heard) = 0, B = 1.
		expect(turns.map((turn) => turn.speaker)).toEqual([0, 1, 1, 0, 0]);
		expect(new Set(turns.map((turn) => turn.speaker)).size).toBe(2);
	});

	test('a fingerprint-less group keeps its own identity — never merged by guessing', () => {
		const turns = cluster_speaker_turns(
			[
				{ turns: [{ start: 0, end: 10 }], embedding: A(0) },
				{ turns: [{ start: 20, end: 30 }], embedding: null },
				{ turns: [{ start: 40, end: 50 }], embedding: A(0.01) },
			],
			{ cluster_similarity: 0.5 },
		);
		expect(turns.map((turn) => turn.speaker)).toEqual([0, 1, 0]);
	});

	test('dissimilar voices never merge; empty input is empty output', () => {
		const turns = cluster_speaker_turns(
			[
				{ turns: [{ start: 0, end: 5 }], embedding: [1, 0, 0] },
				{ turns: [{ start: 5, end: 9 }], embedding: [0, 0, 1] },
			],
			{ cluster_similarity: 0.5 },
		);
		expect(new Set(turns.map((turn) => turn.speaker)).size).toBe(2);
		expect(cluster_speaker_turns([], {})).toEqual([]);
	});
});

describe('assign_speakers_to_segments', () => {
	const TURNS = [
		{ speaker: 0, start: 0, end: 10 },
		{ speaker: 1, start: 10, end: 20 },
	];

	test('majority coverage wins; continuity fills uncovered gaps; input not mutated', () => {
		const segments = [
			{ text: 'a', start: 1, end: 4 }, // fully speaker 0
			{ text: 'b', start: 8, end: 13 }, // 2s of spk0, 3s of spk1 → 1
			{ text: 'c', start: 25, end: 27 }, // uncovered → inherits 1
		];
		const attributed = assign_speakers_to_segments(segments, TURNS);
		expect(attributed.map((segment) => segment.speaker)).toEqual([0, 1, 1]);
		expect('speaker' in segments[0]!).toBe(false); // caller's objects untouched
	});

	test('segments before any turn stay unattributed', () => {
		const attributed = assign_speakers_to_segments(
			[{ text: 'intro', start: 0, end: 1 }],
			[{ speaker: 0, start: 5, end: 9 }],
		);
		expect('speaker' in attributed[0]!).toBe(false);
	});
});

describe('speaker_stats', () => {
	test('turns count runs, seconds accumulate, samples are turn starts', () => {
		const stats = speaker_stats([
			{ text: 'q1', start: 0, end: 5, speaker: 0 },
			{ text: 'a1', start: 5, end: 30, speaker: 1 },
			{ text: 'a1b', start: 30, end: 60, speaker: 1 }, // same turn (same run)
			{ text: 'q2', start: 60, end: 63, speaker: 0 },
			{ text: 'a2', start: 63, end: 90, speaker: 1 },
		]);
		expect(stats.map((entry) => entry.speaker)).toEqual([0, 1]); // first-appearance order
		expect(stats[0]).toMatchObject({ speaker: 0, turns: 2, seconds: 8 });
		expect(stats[1]).toMatchObject({ speaker: 1, turns: 2, seconds: 82 });
		expect(stats[1]?.samples).toEqual([5, 63]);
	});
});

describe('speaker tags in the stored text (segments_to_html speaker_tags)', () => {
	const TAG_0 =
		"[person-b-1-AraBo-data:{'section_tipo':'rsc197','section_id':'15857','component_tipo':'rsc50'}:data]";
	const TAG_1 =
		"[person-a-1-DyaDa-data:{'section_tipo':'rsc197','section_id':'15855','component_tipo':'oh24'}:data]";

	test('the tag opens each speaker TURN, right after the TC mark, byte-exact', () => {
		const html = segments_to_html(
			[
				{ text: 'What year was it?', start: 0, end: 2, speaker: 0 },
				{ text: 'It was 1936.', start: 2, end: 5, speaker: 1 },
				{ text: 'We lived in Valencia then.', start: 5, end: 8, speaker: 1 },
				{ text: 'And after?', start: 8, end: 10, speaker: 0 },
			],
			{ tc_mode: 'paragraph', speaker_tags: { 0: TAG_0, 1: TAG_1 } },
		);
		// Speaker changes → 3 paragraphs, each opened by its speaker's tag —
		// and NO "0: " textual prefix: the tag replaces it.
		expect(html).toBe(
			`<p>[TC_00:00:00.000_TC]${TAG_0}What year was it?</p>` +
				`<p>[TC_00:00:02.000_TC]${TAG_1}It was 1936. We lived in Valencia then.</p>` +
				`<p>[TC_00:00:08.000_TC]${TAG_0}And after?</p>`,
		);
	});

	test('a same-speaker run split by paragraph caps carries the tag ONCE', () => {
		const html = segments_to_html(
			[
				{ text: 'First part.', start: 0, end: 3, speaker: 1 },
				// 9s gap forces a paragraph break inside the same speaker's run.
				{ text: 'Second part after a long pause.', start: 12, end: 15, speaker: 1 },
			],
			{ tc_mode: 'paragraph', gap_seconds: 4, speaker_tags: { 1: TAG_1 } },
		);
		const occurrences = html.split(TAG_1).length - 1;
		expect(occurrences).toBe(1);
		expect(html.startsWith(`<p>[TC_00:00:00.000_TC]${TAG_1}First part.</p>`)).toBe(true);
	});

	test('PLACEHOLDER tags (empty data payload) compose and parse — the unresolved form', () => {
		// The immediate-save flow opens every turn with '[person-a-N-PN-data::data]';
		// the empty payload is what marks the tag assignable later (the identity
		// binding swaps the whole tag string, all occurrences, via the save path).
		const P1 = '[person-a-1-P1-data::data]';
		const P2 = '[person-a-2-P2-data::data]';
		const html = segments_to_html(
			[
				{ text: 'Question.', start: 0, end: 2, speaker: 0 },
				{ text: 'Answer.', start: 2, end: 5, speaker: 1 },
			],
			{ tc_mode: 'paragraph', speaker_tags: { 0: P1, 1: P2 } },
		);
		expect(html).toBe(
			`<p>[TC_00:00:00.000_TC]${P1}Question.</p><p>[TC_00:00:02.000_TC]${P2}Answer.</p>`,
		);
		// The short form renders as a badge through the v7 tag grammar.
		expect(parseTagId('[person-a-1-P1]')).toMatchObject({
			kind: 'sprite',
			type: 'person',
			display: 'P1',
		});
		// And the binding is a plain whole-tag swap: byte-exact, all occurrences.
		const bound = html.split(P2).join(TAG_1);
		expect(bound).toContain(`[TC_00:00:02.000_TC]${TAG_1}Answer.`);
		expect(bound).not.toContain('data::data]Answer');
	});

	test('segments without speakers render exactly as before (no map, no change)', () => {
		const segments = [{ text: 'Plain text.', start: 0, end: 2 }];
		expect(segments_to_html(segments, { tc_mode: 'paragraph' })).toBe(
			'<p>[TC_00:00:00.000_TC]Plain text.</p>',
		);
		// A map with no matching speakers is inert too.
		expect(segments_to_html(segments, { tc_mode: 'paragraph', speaker_tags: { 0: TAG_0 } })).toBe(
			'<p>[TC_00:00:00.000_TC]Plain text.</p>',
		);
	});
});
