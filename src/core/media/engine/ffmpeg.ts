/**
 * FFMPEG ADAPTER — argv recipes ported from PHP class.Ffmpeg.php.
 *
 * Pure `build*Argv` builders (unit-tested against the PHP command recipes) +
 * `run*`/`probe*` executors over the spawn discipline. The two-pass x264 chain
 * that PHP wrote to a self-deleting `.sh` becomes two supervised spawns here (no
 * shell, no temp script); the passlog scratch is cleaned by the job runner.
 *
 * PHP anchors: build_av_alternate_command (:491), create_posterframe (:1075),
 * conform_header (:1346), convert_to_dedalo_av (:1497), build_fragment (:1200),
 * get_media_attributes (:1585), get_media_streams (:1651), get_audio_codec (:1722).
 */

import { renameSync, rmSync } from 'node:fs';
import { dirname, extname } from 'node:path';
import { config } from '../../../config/config.ts';
import { type FfmpegProfile, getFfmpegProfile } from './ffmpeg_profiles.ts';
import { type SpawnOptions, runBinary } from './spawn.ts';

function ffmpeg(): string {
	return config.media.binaries.ffmpeg;
}
function ffprobe(): string {
	return config.media.binaries.ffprobe;
}
function faststart(): string {
	return config.media.binaries.qtFaststart;
}

/** Split a PHP filter fragment ('-vf yadif') into argv tokens; '' → []. */
function fragmentTokens(fragment: string): string[] {
	return fragment.trim() === '' ? [] : fragment.trim().split(/\s+/);
}

/**
 * Two-pass libx264 video encode — PASS 1 argv (PHP :766).
 * `<ffmpeg> -i <src> -an -pass 1 -vcodec .. -vb .. -s .. -g .. <yadif> <gamma> -f .. -loglevel error -passlogfile <log> -y /dev/null`
 */
export function buildTranscodePass1Argv(
	profile: FfmpegProfile,
	source: string,
	passLog: string,
): string[] {
	if (profile.videoCodec === null)
		throw new Error(`Profile ${profile.name} is audio-only, no video pass`);
	return [
		ffmpeg(),
		'-i',
		source,
		'-an',
		'-pass',
		'1',
		'-vcodec',
		profile.videoCodec,
		'-vb',
		profile.videoBitrate ?? '',
		'-s',
		profile.scale ?? '',
		'-g',
		String(profile.gop ?? 0),
		...fragmentTokens(profile.deinterlace),
		...fragmentTokens(profile.gammaFilter),
		'-f',
		profile.force,
		'-loglevel',
		'error',
		'-passlogfile',
		passLog,
		'-y',
		'/dev/null',
	];
}

/**
 * Two-pass libx264 video encode — PASS 2 argv (PHP :773-775): adds the audio
 * track and writes the temp output.
 */
export function buildTranscodePass2Argv(
	profile: FfmpegProfile,
	source: string,
	passLog: string,
	tempTarget: string,
	audioCodec: string,
): string[] {
	if (profile.videoCodec === null)
		throw new Error(`Profile ${profile.name} is audio-only, no video pass`);
	return [
		ffmpeg(),
		'-i',
		source,
		'-pass',
		'2',
		'-vcodec',
		profile.videoCodec,
		'-vb',
		profile.videoBitrate ?? '',
		'-s',
		profile.scale ?? '',
		'-g',
		String(profile.gop ?? 0),
		...fragmentTokens(profile.deinterlace),
		...fragmentTokens(profile.gammaFilter),
		'-f',
		profile.force,
		'-passlogfile',
		passLog,
		'-acodec',
		audioCodec,
		'-ar',
		String(profile.audioRate ?? 44100),
		'-ab',
		profile.audioBitrate ?? '128k',
		'-ac',
		String(profile.audioChannels ?? 2),
		'-y',
		tempTarget,
	];
}

/** Audio-only extraction argv (PHP :710): -vn -acodec .. -ar 44100 -ab 128k -ac 2. */
export function buildAudioArgv(source: string, target: string, audioCodec: string): string[] {
	return [
		ffmpeg(),
		'-i',
		source,
		'-vn',
		'-acodec',
		audioCodec,
		'-ar',
		'44100',
		'-ab',
		'128k',
		'-ac',
		'2',
		target,
	];
}

/** Speech-to-text audio (audio_tr) argv (PHP :695): -vn -ar 16000 -ac 1 (16 kHz mono WAV). */
export function buildAudioTrArgv(source: string, target: string): string[] {
	return [ffmpeg(), '-i', source, '-vn', '-ar', '16000', '-ac', '1', target];
}

/** qt-faststart argv (moov-atom relocation): <qt-faststart> <src> <dst>. */
export function buildFaststartArgv(source: string, target: string): string[] {
	return [faststart(), source, target];
}

/**
 * Posterframe extraction argv (PHP create_posterframe :1153):
 * `<ffmpeg> -ss <tc> -i <src> -y -vframes 1 -f rawvideo -an -vcodec mjpeg -s WxH <dst>`.
 */
export function buildPosterframeArgv(
	source: string,
	timecode: string,
	target: string,
	size: { width: number; height: number },
): string[] {
	// number_format(x,3) parity: 3 decimal places.
	const tc = Number(timecode);
	const formatted = Number.isFinite(tc) ? tc.toFixed(3) : '0.000';
	return [
		ffmpeg(),
		'-ss',
		formatted,
		'-i',
		source,
		'-y',
		'-vframes',
		'1',
		'-f',
		'rawvideo',
		'-an',
		'-vcodec',
		'mjpeg',
		'-s',
		`${size.width}x${size.height}`,
		target,
	];
}

/** conform_header remux argv (PHP :1374): -c:v copy -c:a copy into a temp. */
export function buildConformHeaderArgv(source: string, tempTarget: string): string[] {
	return [ffmpeg(), '-i', source, '-c:v', 'copy', '-c:a', 'copy', tempTarget];
}

/** build_fragment (no watermark) argv (PHP :1281): -ss in -i src -t dur -vcodec copy -acodec copy -y dst. */
export function buildFragmentArgv(
	source: string,
	target: string,
	startTc: string,
	durationSeconds: number,
): string[] {
	return [
		ffmpeg(),
		'-ss',
		startTc,
		'-i',
		source,
		'-t',
		String(durationSeconds),
		'-vcodec',
		'copy',
		'-acodec',
		'copy',
		'-y',
		target,
	];
}

// -------- probes --------

/** ffprobe -show_format as parsed JSON (PHP get_media_attributes :1585). */
export async function probeFormat(source: string): Promise<unknown> {
	const result = await runBinary(
		[ffprobe(), '-v', 'quiet', '-print_format', 'json', '-show_format', source],
		{ nice: false },
	);
	try {
		return JSON.parse(result.stdout);
	} catch {
		return null;
	}
}

/** ffprobe -show_streams as parsed JSON (PHP get_media_streams :1651). */
export async function probeStreams(source: string): Promise<{ streams: MediaStream[] } | null> {
	const result = await runBinary(
		[ffprobe(), '-v', 'quiet', '-show_streams', '-print_format', 'json', source],
		{ nice: false },
	);
	try {
		return JSON.parse(result.stdout) as { streams: MediaStream[] };
	} catch {
		return null;
	}
}

/** The stream fields the engine reads (a subset of ffprobe's stream object). */
export interface MediaStream {
	codec_type?: string;
	codec_name?: string;
	width?: number;
	height?: number;
	avg_frame_rate?: string;
	display_aspect_ratio?: string;
	duration?: string;
	channels?: number;
	sample_rate?: string;
}

/** Whether the source has a video stream (PHP posterframe guard :1108-1114). */
export async function hasVideoStream(source: string): Promise<boolean> {
	const probe = await probeStreams(source);
	return probe?.streams?.some((s) => s.codec_type === 'video') ?? false;
}

/**
 * Broadcast standard from source fps (PHP get_media_standard :321): ≥29 → ntsc.
 * Returns 'pal' when the fps is unknown or below the NTSC threshold.
 */
export function standardFromFps(avgFrameRate: string | undefined): 'pal' | 'ntsc' {
	if (!avgFrameRate) return 'pal';
	const parts = avgFrameRate.split('/').map(Number);
	const num = parts[0] ?? 0;
	const den = parts[1] ?? 0;
	const fps = den ? num / den : num;
	return Number.isFinite(fps) && fps >= 29 ? 'ntsc' : 'pal';
}

/**
 * Pick the best available AAC encoder (PHP get_audio_codec :1722):
 * libfdk_aac > libvo_aacenc > aac, from `ffmpeg -buildconf`. Cached per process.
 */
let cachedAudioCodec: string | null = null;
export async function getAudioCodec(): Promise<string> {
	if (cachedAudioCodec !== null) return cachedAudioCodec;
	try {
		const result = await runBinary([ffmpeg(), '-loglevel', 'error', '-buildconf'], { nice: false });
		const conf = result.stdout + result.stderr;
		if (/--enable-libfdk-aac/.test(conf)) cachedAudioCodec = 'libfdk_aac';
		else if (/--enable-libvo-aacenc/.test(conf)) cachedAudioCodec = 'libvo_aacenc';
		else cachedAudioCodec = 'aac';
	} catch {
		cachedAudioCodec = 'aac';
	}
	return cachedAudioCodec;
}

// -------- high-level runners --------

/** Extract a posterframe. Returns false when the source has no video (audio-only). */
export async function createPosterframe(
	source: string,
	timecode: string,
	target: string,
	size: { width: number; height: number },
): Promise<boolean> {
	// Single probe: video presence + duration (avoids a second hasVideoStream probe).
	const probe = await probeStreams(source);
	const video = probe?.streams?.find((s) => s.codec_type === 'video');
	if (video === undefined) return false; // audio-only source → no posterframe.

	// Clamp the requested seek into the source's valid range. ffmpeg input-seeking
	// (`-ss` before `-i`) PAST the end of a stream yields no frame, so the mjpeg
	// encoder gets no input and errors out — the whole extraction then fails. A
	// too-short or truncated source (or a current_time reported beyond its real
	// duration) would otherwise produce nothing. PHP does not clamp, so this is a
	// strict robustness improvement: for a normal current_time within a real
	// video's duration the timecode is unchanged.
	const effectiveTimecode = clampTimecodeToDuration(timecode, video.duration);
	const result = await runBinary(buildPosterframeArgv(source, effectiveTimecode, target, size));
	if (result.exitCode !== 0 && !result.timedOut) {
		throw new Error(`ffmpeg posterframe failed: ${result.stderr}`);
	}
	return true;
}

/**
 * Clamp a requested posterframe timecode to `[0, duration)` so a frame is always
 * available. Returns the timecode unchanged when the duration is unknown or the
 * requested time already lies within the stream (the normal case).
 */
function clampTimecodeToDuration(timecode: string, streamDuration: string | undefined): string {
	const requested = Number(timecode);
	const duration = Number(streamDuration);
	if (!Number.isFinite(requested) || !Number.isFinite(duration) || duration <= 0) {
		return timecode;
	}
	if (requested < duration) return timecode;
	// Seek just inside the last available moment (never negative → 0 for tiny clips).
	return String(Math.max(0, duration - 0.1));
}

/**
 * Conform an AV container's headers (PHP Ffmpeg::conform_header :1346 /
 * component_av::conform_headers :1610). Remuxes the stream (no re-encode:
 * `-c:v copy -c:a copy`) into a temp file, preserves the pre-conform file as
 * `<stem>_untouched.<ext>`, then runs qt-faststart from the temp back onto the
 * source path so the moov atom sits at the front (progressive playback). The
 * temp is removed on success. Throws on any step failure.
 */
export async function conformHeader(source: string): Promise<void> {
	const dir = dirname(source);
	const ext = extname(source); // includes the leading dot, or ''
	const stem =
		ext === '' ? source.slice(dir.length + 1) : source.slice(dir.length + 1, -ext.length);
	const temp = `${dir}/${stem}_temp${ext}`;
	const untouched = `${dir}/${stem}_untouched${ext}`;

	// 1. Remux (stream copy) source → temp.
	const remux = await runBinary(buildConformHeaderArgv(source, temp));
	if (remux.exitCode !== 0 && !remux.timedOut) {
		throw new Error(`ffmpeg conform remux failed: ${remux.stderr}`);
	}
	// 2. Preserve the original file untouched (PHP mv source → *_untouched).
	renameSync(source, untouched);
	// 3. qt-faststart temp → source (final progressive file at the source path).
	const fast = await runBinary(buildFaststartArgv(temp, source));
	if (fast.exitCode !== 0 && !fast.timedOut) {
		throw new Error(`qt-faststart conform failed: ${fast.stderr}`);
	}
	// 4. Drop the temp.
	rmSync(temp, { force: true });
}

/** Extract the audio (or audio_tr) quality. */
export async function extractAudio(
	source: string,
	target: string,
	kind: 'audio' | 'audio_tr',
): Promise<void> {
	const argv =
		kind === 'audio_tr'
			? buildAudioTrArgv(source, target)
			: buildAudioArgv(source, target, await getAudioCodec());
	const result = await runBinary(argv);
	if (result.exitCode !== 0 && !result.timedOut) {
		throw new Error(`ffmpeg ${kind} extraction failed: ${result.stderr}`);
	}
}

/**
 * Run the two-pass video transcode for a profile, streaming progress via
 * `-progress` if a callback is given (a modernization; PHP had none). Writes to
 * `tempTarget`; the caller renames it into place and cleans the passlog.
 */
export async function transcodeTwoPass(
	settingName: string,
	source: string,
	tempTarget: string,
	passLog: string,
	spawnOptions: SpawnOptions = {},
): Promise<void> {
	const profile = getFfmpegProfile(settingName);
	if (profile === null) throw new Error(`Unknown ffmpeg profile '${settingName}'`);
	const audioCodec = await getAudioCodec();
	const pass1 = await runBinary(buildTranscodePass1Argv(profile, source, passLog), spawnOptions);
	if (pass1.exitCode !== 0 && !pass1.timedOut) {
		throw new Error(`ffmpeg pass 1 failed (${settingName}): ${pass1.stderr}`);
	}
	const pass2 = await runBinary(
		buildTranscodePass2Argv(profile, source, passLog, tempTarget, audioCodec),
		spawnOptions,
	);
	if (pass2.exitCode !== 0 && !pass2.timedOut) {
		throw new Error(`ffmpeg pass 2 failed (${settingName}): ${pass2.stderr}`);
	}
}
