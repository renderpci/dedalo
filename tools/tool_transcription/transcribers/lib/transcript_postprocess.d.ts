/**
 * Types for `transcript_postprocess.js` — the repetition safety net shared by the
 * browser worker and the TypeScript server path.
 */

import type { TranscriptSegment } from './paragraphs.d.ts';

export interface PostprocessOptions {
	max_ngram?: number;
	max_unigram_repeats?: number;
	max_ngram_repeats?: number;
	max_overlap_words?: number;
	min_overlap_words?: number;
	duplicate_max_gap_seconds?: number;
	duplicate_min_words?: number;
	degenerate_min_words?: number;
	degenerate_score?: number;
}

export declare const DEFAULT_OPTIONS: Required<PostprocessOptions>;

export declare function normalize_spacing(text: unknown): string;

export declare function collapse_repeated_ngrams(
	text: string,
	options?: PostprocessOptions,
): string;

/** 0 (every word distinct) … ~1 (one word forever). */
export declare function repetition_score(text: string): number;

/** True when a decode window looks like a repetition loop rather than speech. */
export declare function is_degenerate(text: string, options?: PostprocessOptions): boolean;

export declare function strip_overlap(
	previous_text: string,
	next_text: string,
	options?: PostprocessOptions,
): string;

export declare function clean_transcript(
	segments: readonly TranscriptSegment[] | null | undefined,
	options?: PostprocessOptions,
): TranscriptSegment[];
