/**
 * AV DERIVATIVE ENCODER — the ONE place an av quality tier is produced.
 *
 * Two callers, one encoder:
 *  - INGEST (`ingest/process_uploaded_file.ts` → submitAvTranscode): after an
 *    upload, build the default quality + the audio tier.
 *  - THE TOOL (`tools/versions.ts` → build_version, the media-versions panel's
 *    gear): build the ONE quality tier the operator asked for.
 *
 * The tool path used to call `submitAvTranscode` directly, which knows only the
 * default quality — so a click on 1080/720/576/240 re-encoded 404 instead, the
 * requested tier never appeared on disk, and the panel blinked "Processing"
 * forever polling for a file nobody was building. PHP built `$quality`
 * (component_av::build_version → Ffmpeg::get_setting_name($source, $quality)).
 *
 * Source resolution is PHP's (component_av::build_version :1470): the ORIGINAL,
 * falling back to the default-quality file when the box has no original. A tier
 * is never built from itself.
 */

import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { AUDIO_TR_QUALITY, assertValidQuality, type MediaTypeSpec } from '../concepts/media.ts';
import { extractAudio, probeStreams, standardFromFps, transcodeTwoPass } from './engine/ffmpeg.ts';
import { getFfmpegProfile, settingName } from './engine/ffmpeg_profiles.ts';
import { scanContextFromItem, scanFilesInfo } from './files_info.ts';
import { mediaJobs } from './jobs.ts';
import { buildMediaLocation, type MediaIdentity, type MediaPathOptions } from './path.ts';
import { resolveMasterSource } from './processing.ts';
import { readStoredMediaItems } from './tool_support.ts';
import { reconcileStoredFilesInfo } from './tools/files_info_persist.ts';

/** Ensure the parent dir of an output file exists (mirrors processing.ts ensureDir). */
function ensureMediaDir(absolutePath: string): void {
	const dir = dirname(absolutePath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o775 });
}

/** Best-effort removal of ffmpeg's two-pass stats scratch (`${passLog}-0.log` + .mbtree). */
function removePassLog(passLog: string): void {
	for (const suffix of ['-0.log', '-0.log.mbtree']) {
		rmSync(`${passLog}${suffix}`, { force: true });
	}
}

/** 16x9 vs 4x3 from dimensions (PHP get_aspect_ratio). */
function pickAspect(width?: number, height?: number): '16x9' | '4x3' | null {
	if (!width || !height) return null;
	const ratio = width / height;
	return ratio > 1.5 ? '16x9' : '4x3';
}

/** What the source file's streams say about the encode (PHP get_setting_name inputs). */
export interface AvSourceProfile {
	standard: 'pal' | 'ntsc';
	aspect: '16x9' | '4x3' | null;
	hasAudio: boolean;
	hasVideo: boolean;
}

/** Probe the source once; both encode branches read the result. */
export async function probeAvSource(source: string): Promise<AvSourceProfile> {
	const probe = await probeStreams(source);
	const video = probe?.streams?.find((entry) => entry.codec_type === 'video');
	return {
		standard: standardFromFps(video?.avg_frame_rate),
		aspect: pickAspect(video?.width, video?.height),
		hasAudio: probe?.streams?.some((entry) => entry.codec_type === 'audio') ?? false,
		hasVideo: video !== undefined,
	};
}

/** Whether a quality is one of the audio-only tiers (no video pass). */
function isAudioTier(quality: string): boolean {
	return quality === 'audio' || quality === AUDIO_TR_QUALITY;
}

/**
 * The result of encoding ONE tier. `skipped` is a REASON, never a silent no-op:
 * ingest tolerates both (a video-only source has no audio to extract; a tier
 * outside the profile table is not buildable on this install), while the tool
 * path turns either into a loud failure the operator can read.
 */
export type AvEncodeOutcome = { built: string } | { skipped: 'no_profile' | 'no_audio_stream' };

/**
 * Encode one av quality tier from `source`. Video tiers run the two-pass x264
 * profile for `<quality>_<standard>[_<aspect>]`; audio tiers extract. Output is
 * atomic (temp + rename) and the two-pass stats scratch is removed.
 */
/*
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): requires the ffmpeg / ImageMagick
 * BINARIES and MUTATES THE REAL MEDIA TREE, so no scratch surface can contain a
 * run. The gateable content is the pure argv/profile builders in these files,
 * gated in test/unit/tier1_media_argv_native.test.ts.
 */
export async function encodeAvQuality(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	quality: string,
	source: string,
	profile: AvSourceProfile,
): Promise<AvEncodeOutcome> {
	const target = buildMediaLocation(
		spec,
		identity,
		quality,
		spec.defaultExtension,
		pathOpts,
	).absolutePath;

	if (isAudioTier(quality)) {
		// A silent/video-only source makes ffmpeg emit "Output file does not
		// contain any stream" and exit non-zero — a skip, not a failure.
		if (!profile.hasAudio) return { skipped: 'no_audio_stream' };
		ensureMediaDir(target);
		await extractAudio(source, target, quality === AUDIO_TR_QUALITY ? 'audio_tr' : 'audio');
		return { built: target };
	}

	const profileName = settingName(quality, profile.standard, profile.aspect);
	if (getFfmpegProfile(profileName) === null) return { skipped: 'no_profile' };

	// The quality tier's directory (e.g. av/576/<bucket>/) may not exist yet.
	// ffmpeg pass 1 writes its two-pass stats file into this dir, so without the
	// mkdir it dies with "ratecontrol_init: can't open stats file" and NO
	// derivative is ever produced.
	ensureMediaDir(target);
	const temp = `${target}.tmp.${process.pid}`;
	const passLog = `${target}.passlog`;
	try {
		await transcodeTwoPass(profileName, source, temp, passLog);
		renameSync(temp, target);
	} finally {
		removePassLog(passLog);
		rmSync(temp, { force: true });
	}
	return { built: target };
}

/**
 * Resolve the file an av derivative is built FROM (PHP component_av::
 * build_version :1470): the original, else the default-quality file. Returns
 * null when neither is on this box.
 *
 * `targetQuality` is excluded from the fallback — a tier is never built from
 * itself (re-encoding 404 over 404 through a lossy profile is destruction, not
 * a build).
 */
export function resolveAvBuildSource(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	targetQuality: string,
	rawExtension?: string | null,
): string | null {
	const original = resolveMasterSource(spec, identity, pathOpts, rawExtension);
	if (original !== null) return original;
	if (targetQuality === spec.defaultQuality) return null;
	for (const extension of [spec.defaultExtension, ...spec.allowedExtensions]) {
		const candidate = buildMediaLocation(
			spec,
			identity,
			spec.defaultQuality,
			extension,
			pathOpts,
		).absolutePath;
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

/**
 * Write the finished transcode's files_info back onto the record.
 *
 * A transcode ends long after the request that started it returned, so the
 * caller's own persist could only record the ORIGINAL — the derivatives it
 * produced (the default quality, the extracted audio) never reached the matrix,
 * and unlike a read-time-rescanned emit, everything that consumes the STORED
 * index (diffusion, publication, export, tool_media_versions) kept seeing an
 * av record that owned nothing but its source file.
 *
 * The stored items are RE-READ under the row lock inside
 * `reconcileStoredFilesInfo`, never closed over: the request's snapshot is long
 * stale, and both the caller's own persist and a concurrent save can commit on
 * this key while ffmpeg runs. Only the ONE cue the scan needs — the stored
 * normalized names / external source — is read (unlocked) beforehand; a stale
 * cue at worst costs an index entry, it cannot revert someone's write.
 *
 * No stored item ⇒ the reconcile no-ops (it never mints — the passive-scan rule:
 * a transcode must not create a stored value for a component that has none; the
 * operator's explicit sync_files repair is the one path that may). That decision
 * is left to the reconcile, INSIDE the lock — an unlocked pre-check here could
 * read "no item" a moment before the caller's own persist created one, and skip
 * the write-back this whole path exists for.
 */
export async function persistTranscodedFilesInfo(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
): Promise<void> {
	const items = await readStoredMediaItems(
		identity.sectionTipo,
		identity.sectionId,
		identity.componentTipo,
	);
	const item = items.find((entry) => (entry.lang ?? null) === identity.lang) ?? items[0];
	const filesInfo = scanFilesInfo(spec, identity, pathOpts, scanContextFromItem(item));
	await reconcileStoredFilesInfo({
		sectionTipo: identity.sectionTipo,
		sectionId: identity.sectionId,
		componentTipo: identity.componentTipo,
		lang: identity.lang,
		freshFilesInfo: filesInfo,
	});
}

/**
 * Run the write-back and report its failure INSTEAD of failing the job: the
 * derivatives really are on disk, and reporting the transcode as errored would
 * send the client back to a re-transcode it does not need. Still loud
 * (console.error + a `persist_error` in the payload) because a record that does
 * not know its own files is exactly the bug this exists to fix.
 */
async function persistOrReport(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
): Promise<string | null> {
	try {
		await persistTranscodedFilesInfo(spec, identity, pathOpts);
		return null;
	} catch (error) {
		const message = (error as Error).message;
		console.error(
			`[media jobs] av_transcode ${identity.sectionTipo}/${identity.sectionId}/${identity.componentTipo}: files_info write-back failed: ${message}`,
		);
		return message;
	}
}

/**
 * Submit the INGEST transcode: the default quality (two-pass) + the audio tier,
 * then the files_info write-back. Returns the job id.
 */
export function submitAvTranscode(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	rawExtension: string,
): string {
	const record = mediaJobs.submit('av_transcode', async ({ onProgress }) => {
		const source = resolveMasterSource(spec, identity, pathOpts, rawExtension);
		if (source === null) throw new Error('AV original not found for transcode');
		const profile = await probeAvSource(source);
		const created: string[] = [];

		const video = await encodeAvQuality(
			spec,
			identity,
			pathOpts,
			spec.defaultQuality,
			source,
			profile,
		);
		if ('built' in video) created.push(video.built);
		onProgress(70);

		if (spec.qualities.includes('audio')) {
			const audio = await encodeAvQuality(spec, identity, pathOpts, 'audio', source, profile);
			if ('built' in audio) created.push(audio.built);
		}

		const persistError = await persistOrReport(spec, identity, pathOpts);
		onProgress(100);
		return { created, persist_error: persistError };
	});
	return record.id;
}

/** Why a per-quality build cannot even be submitted (the operator-facing reason). */
export class AvBuildRefused extends Error {}

/**
 * Submit the TOOL's per-quality build (PHP build_version($quality, async)).
 *
 * PRE-FLIGHT, before the job id is handed to the client: the quality must be
 * valid, a source file must exist, and the encode must be possible for THIS
 * source (a profile for the tier, an audio stream for an audio tier). The panel
 * shows "Processing" the moment it gets a job id, so a refusal that can be known
 * now must be raised now — an accepted job that dies two seconds later is the
 * shape of the bug this replaces. Throws `AvBuildRefused`; the tool handler
 * turns that into `result:false` + msg.
 */
export async function submitAvVersionBuild(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	quality: string,
	rawExtension?: string | null,
): Promise<string> {
	if (spec.model !== 'component_av') {
		throw new AvBuildRefused('build_version: not an av component');
	}
	assertValidQuality(spec, quality);
	if (quality === spec.originalQuality) {
		throw new AvBuildRefused('build_version: the original is the source, it cannot be built');
	}

	const source = resolveAvBuildSource(spec, identity, pathOpts, quality, rawExtension);
	if (source === null) {
		throw new AvBuildRefused(
			`build_version: no original and no ${spec.defaultQuality} file to build '${quality}' from`,
		);
	}
	const profile = await probeAvSource(source);
	if (isAudioTier(quality)) {
		if (!profile.hasAudio) {
			throw new AvBuildRefused(`build_version: the source has no audio stream ('${quality}')`);
		}
	} else {
		const profileName = settingName(quality, profile.standard, profile.aspect);
		if (getFfmpegProfile(profileName) === null) {
			throw new AvBuildRefused(`build_version: no encode profile '${profileName}'`);
		}
	}

	const record = mediaJobs.submit('av_transcode', async ({ onProgress }) => {
		onProgress(5);
		const outcome = await encodeAvQuality(spec, identity, pathOpts, quality, source, profile);
		// Unreachable via the pre-flight above unless the source changed under us
		// mid-flight — then it IS the job's failure, and the panel reads the reason.
		if (!('built' in outcome)) {
			throw new Error(`build_version: '${quality}' not built (${outcome.skipped})`);
		}
		onProgress(90);
		const persistError = await persistOrReport(spec, identity, pathOpts);
		onProgress(100);
		return { created: [outcome.built], quality, persist_error: persistError };
	});
	return record.id;
}
