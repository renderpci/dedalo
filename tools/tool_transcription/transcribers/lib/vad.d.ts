/**
 * Types for `vad.js` — speech detection and decode-window planning, shared by the
 * browser worker and the test gates.
 */

/** A stretch of audio, in SECONDS from the start of the recording. */
export interface AudioRegion {
	start: number;
	end: number;
}

export interface VadOptions {
	frame_seconds?: number;
	noise_percentile?: number;
	speech_percentile?: number;
	high_threshold_ratio?: number;
	low_threshold_ratio?: number;
	min_dynamic_range?: number;
	absolute_floor?: number;
	min_speech_seconds?: number;
	min_silence_seconds?: number;
	pad_seconds?: number;
	max_merge_gap_seconds?: number;
	max_window_seconds?: number;
	min_window_seconds?: number;
}

export declare const DEFAULT_OPTIONS: Required<VadOptions>;

export declare function find_speech_regions(
	samples: Float32Array | null | undefined,
	sample_rate: number,
	options?: VadOptions,
): AudioRegion[];

export declare function build_windows(
	regions: readonly AudioRegion[] | null | undefined,
	options?: VadOptions,
): AudioRegion[];

export declare function plan_windows(
	samples: Float32Array | null | undefined,
	sample_rate: number,
	options?: VadOptions,
): AudioRegion[];

export declare function total_speech_seconds(
	windows: readonly AudioRegion[] | null | undefined,
): number;
