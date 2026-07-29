/**
 * Types for `paragraphs.js` — the transcript formatter shared by the browser
 * worker and the TypeScript server path.
 *
 * The module itself is plain ESM (it must run inside a Worker, with no build
 * step); this file is what lets the server import it with real types instead of
 * an escape hatch.
 */

/** One recogniser segment. Times are SECONDS from the start of the recording. */
export interface TranscriptSegment {
	text: string;
	start?: number | null;
	end?: number | null;
	/** Diarization label, when the engine produced one. */
	speaker?: string;
	/** Word-level timings, carried through untouched. */
	words?: unknown[];
}

/** How segments are grouped into paragraphs and how dense the time marks are. */
export interface ParagraphOptions {
	tc_mode?: 'paragraph_anchors' | 'paragraph' | 'segment';
	gap_seconds?: number;
	min_seconds?: number;
	min_chars?: number;
	max_seconds?: number;
	max_chars?: number;
	anchor_seconds?: number;
	speaker_prefix?: boolean;
}

export interface Paragraph {
	start: number;
	end: number | null;
	speaker?: string;
	text: string;
	segments: TranscriptSegment[];
}

export declare const DEFAULT_OPTIONS: Required<ParagraphOptions>;

export declare function seconds_to_tc(total_seconds: number | null | undefined): string;
export declare function tc_to_seconds(tc: string): number;

export declare function group_paragraphs(
	segments: readonly TranscriptSegment[] | null | undefined,
	options?: ParagraphOptions,
): Paragraph[];

export declare function build_paragraph_text(
	paragraph: Paragraph,
	options?: ParagraphOptions,
): string;

export declare function segments_to_html(
	segments: readonly TranscriptSegment[] | null | undefined,
	options?: ParagraphOptions,
): string;

export declare function escape_html(text: string): string;

export declare function parse_transcript(html: string | null | undefined): TranscriptSegment[];
