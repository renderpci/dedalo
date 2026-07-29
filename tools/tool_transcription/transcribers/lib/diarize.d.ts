/** Types for diarize.js — see the module header there for the semantics. */

export interface DiarizeOptions {
	chunk_seconds?: number;
	overlap_seconds?: number;
	min_turn_seconds?: number;
	merge_gap_seconds?: number;
	match_min_seconds?: number;
}

export interface DiarizationChunk {
	/** The chunk's position in the recording, seconds. */
	offset: number;
	/** Model turns RELATIVE to the chunk. */
	turns: { id: number | string; start: number; end: number; confidence?: number }[];
}

export interface SpeakerTurn {
	speaker: number;
	start: number;
	end: number;
}

export interface SpeakerStat {
	speaker: number;
	turns: number;
	seconds: number;
	first_start: number;
	/** Up to 3 turn-start timestamps (listen jump points). */
	samples: number[];
}

export const DEFAULT_DIARIZE: Required<DiarizeOptions>;

export function stitch_diarization_chunks(
	chunks: DiarizationChunk[],
	options?: DiarizeOptions,
): SpeakerTurn[];

export function assign_speakers_to_segments<T extends { start?: number; end?: number }>(
	segments: T[],
	turns: SpeakerTurn[],
): (T & { speaker?: number })[];

export function speaker_stats(
	segments: { start?: number; end?: number; speaker?: number; [key: string]: unknown }[],
): SpeakerStat[];
