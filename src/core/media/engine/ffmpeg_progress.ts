/**
 * ffmpeg `-progress` PARSER — turn the liveness channel into a real percentage.
 *
 * `engine/ffmpeg.ts` already injects `-progress pipe:1` into every ffmpeg run,
 * but only as a WATCHDOG signal: `engine/spawn.ts` re-arms its inactivity cap on
 * any byte and throws the bytes away. So the job wire could report only the step
 * markers a caller hand-wrote — `onProgress(70)` before the audio tier, then 100
 * — which on a 46-minute master means the panel reads "70%" for most of an hour.
 * A bar that does not move is worse than no bar: it reads as a wedged job.
 *
 * This module parses the same stream into a fraction. It is PURE (a string in, a
 * callback out — no spawn, no fs, no timers), so it is gated without ffmpeg.
 *
 * WIRE NOTE: `-progress` emits `key=value` lines, one block per stats period,
 * terminated by `progress=continue` (or `progress=end`). We read `out_time`
 * (`HH:MM:SS.ffffff`) in preference to `out_time_ms`, because ffmpeg's
 * `out_time_ms` has historically carried MICROseconds despite its name — a
 * thousand-fold error that would peg every bar at 100% instantly.
 */

/** Seconds from an ffmpeg `HH:MM:SS.ffffff` timestamp, or null when unparseable. */
export function parseFfmpegTimestamp(value: string): number | null {
	const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value.trim());
	if (match === null) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	const seconds = Number(match[3]);
	if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
		return null;
	}
	return hours * 3600 + minutes * 60 + seconds;
}

/**
 * A stateful reader for one ffmpeg run's stdout.
 *
 * `onFraction` receives 0..1 of THIS run, monotonically — a fraction is never
 * reported lower than one already sent. ffmpeg can emit a stale block after a
 * seek, and a bar that goes backwards reads as a restart.
 *
 * `durationSeconds` null (an unprobeable source) means no percentage is
 * knowable: the reader then reports NOTHING rather than inventing a number, and
 * the caller leaves `progress` null so the client renders an indeterminate bar.
 * Guessing here would be the same lie as the frozen 70%.
 */
export function createFfmpegProgressReader(
	durationSeconds: number | null,
	onFraction: (fraction: number) => void,
): (chunk: string) => void {
	let buffer = '';
	let highWater = 0;
	const usable =
		durationSeconds !== null && Number.isFinite(durationSeconds) && durationSeconds > 0;

	return (chunk: string): void => {
		if (!usable) return;
		buffer += chunk;
		// Keep the trailing partial line in the buffer — a chunk boundary lands
		// mid-line often enough that dropping it loses most of the blocks.
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';
		highWater = publishAdvances(lines, durationSeconds as number, highWater, onFraction);
		// An unbounded buffer would be a slow leak on a run that never emits a
		// newline. No real -progress block approaches this.
		if (buffer.length > BUFFER_CAP) buffer = '';
	};
}

/**
 * Publish every FORWARD step these lines describe; returns the new high-water
 * fraction.
 *
 * The monotonic rule lives here rather than in the reader closure: ffmpeg can
 * emit a stale block after a seek, and a bar that retreats reads as a restart.
 * Split out from the closure so each stays under the complexity cap the crap
 * ratchet enforces on new files.
 */
function publishAdvances(
	lines: readonly string[],
	durationSeconds: number,
	highWater: number,
	onFraction: (fraction: number) => void,
): number {
	let mark = highWater;
	for (const line of lines) {
		const seconds = outTimeSecondsOf(line);
		if (seconds === null) continue;
		const fraction = Math.max(0, Math.min(1, seconds / durationSeconds));
		if (fraction <= mark) continue;
		mark = fraction;
		onFraction(fraction);
	}
	return mark;
}

/** Longest `-progress` line we will hold while waiting for its newline. */
const BUFFER_CAP = 4096;

/**
 * The `out_time` value of one `-progress` line, in seconds, or null when the
 * line is anything else.
 *
 * Extracted from the reader closure so each piece stays under the complexity
 * cap the crap ratchet enforces on new files — and it reads better besides: the
 * reader now says "for each line, how far in are we?", and this says what a
 * line is worth.
 */
function outTimeSecondsOf(line: string): number | null {
	const equals = line.indexOf('=');
	if (equals === -1) return null;
	if (line.slice(0, equals).trim() !== 'out_time') return null;
	return parseFfmpegTimestamp(line.slice(equals + 1));
}

/**
 * Compose a spawn `onStdout` that feeds a progress reader WITHOUT displacing a
 * handler the caller already set. Callers do not set one today; this exists so
 * that adding one later cannot silently disable progress reporting.
 */
export function chainStdout(
	existing: ((chunk: string) => void) | undefined,
	added: (chunk: string) => void,
): (chunk: string) => void {
	if (existing === undefined) return added;
	return (chunk: string): void => {
		existing(chunk);
		added(chunk);
	};
}
