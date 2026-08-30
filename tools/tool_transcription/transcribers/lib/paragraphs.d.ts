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
	speaker?: string | number;
	/** Word-level timings, carried through untouched. */
	words?: unknown[];
	/**
	 * The stored HTML fragment this segment was read back from, VERBATIM — set by
	 * parse_transcript only when re-escaping `text` would not reproduce it (inline
	 * markup, or an entity outside escape_html's four). It is what
	 * build_paragraph_text emits, and it is why a re-grouping no longer deletes the
	 * archivist's markup (2026-08-30, P0-12).
	 */
	html?: string;
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
	/** speaker id → ready-made person tag string, emitted at each speaker turn. */
	speaker_tags?: Record<string | number, string>;
	/** One paragraph's resolved tag (internal; set by segments_to_html). */
	speaker_tag?: string;
}

export interface Paragraph {
	start: number;
	end: number | null;
	speaker?: string | number;
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
