/**
 * PROCESS_UPLOADED_FILE — the ingest orchestrator (PHP tool_upload::
 * process_uploaded_file → component process_uploaded_file → regenerate_component).
 *
 * Moves the staged upload into the original tier (add_file), builds the
 * derivatives per type (image/pdf/svg/3d synchronously; av transcode via the job
 * manager), and returns the freshly-scanned files_info. The original is never
 * mutated; derivatives are atomic.
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { type MediaTypeSpec, mediaTypeOf } from '../../concepts/media.ts';
import {
	extractAudio,
	getAudioCodec,
	probeStreams,
	standardFromFps,
	transcodeTwoPass,
} from '../engine/ffmpeg.ts';
import { getFfmpegProfile, settingName } from '../engine/ffmpeg_profiles.ts';
import { type FileInfoEntry, scanFilesInfo } from '../files_info.ts';
import { mediaJobs } from '../jobs.ts';
import { type MediaIdentity, type MediaPathOptions, buildMediaLocation } from '../path.ts';
import {
	regenerate3d,
	regenerateImage,
	regeneratePdf,
	regenerateSvg,
	resolveOriginalSource,
} from '../processing.ts';
import { type AddFileInput, addFile } from './add_file.ts';

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

export interface IngestInput extends Omit<AddFileInput, 'spec'> {
	spec: MediaTypeSpec;
}

export interface IngestResult {
	/** The stored original's file name + extension. */
	originalFileName: string;
	extension: string;
	/** Fresh files_info after derivative generation. */
	filesInfo: FileInfoEntry[];
	/** For av: the transcode job id (poll it), else null. */
	jobId: string | null;
}

/**
 * Ingest a staged upload for a media component. Synchronous derivative types
 * return complete files_info; av returns a job id and files_info for whatever
 * exists so far (the client polls the job, then re-scans via sync_files).
 */
export async function processUploadedFile(input: IngestInput): Promise<IngestResult> {
	const { spec, identity, pathOpts } = input;
	const added = addFile(input);

	let jobId: string | null = null;
	switch (spec.model) {
		case 'component_image':
			await regenerateImage(spec, identity, pathOpts, added.extension);
			break;
		case 'component_pdf':
			await regeneratePdf(spec, identity, pathOpts);
			break;
		case 'component_svg':
			await regenerateSvg(spec, identity, pathOpts);
			break;
		case 'component_3d':
			regenerate3d(spec, identity, pathOpts, added.extension);
			break;
		case 'component_av':
			jobId = submitAvTranscode(spec, identity, pathOpts, added.extension);
			break;
	}

	const filesInfo = scanFilesInfo(spec, identity, pathOpts, {
		originalNormalizedName: `${identity.componentTipo}_${identity.sectionTipo}_${identity.sectionId}.${added.extension}`,
	});
	return { originalFileName: added.fileName, extension: added.extension, filesInfo, jobId };
}

/**
 * Submit the AV transcode to the job manager (PHP async build_version). Builds
 * the default quality (two-pass) and the audio quality; returns the job id.
 */
export function submitAvTranscode(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	rawExtension: string,
): string {
	const record = mediaJobs.submit('av_transcode', async ({ onProgress }) => {
		const source = resolveOriginalSource(spec, identity, pathOpts, rawExtension);
		if (source === null) throw new Error('AV original not found for transcode');
		const created: string[] = [];

		// Determine standard/aspect from the source streams.
		const probe = await probeStreams(source);
		const video = probe?.streams?.find((s) => s.codec_type === 'video');
		const hasAudioStream = probe?.streams?.some((s) => s.codec_type === 'audio') ?? false;
		const standard = standardFromFps(video?.avg_frame_rate);
		const aspect = pickAspect(video?.width, video?.height);

		// Default quality (e.g. '404') via the matching two-pass profile.
		const profileName = settingName(spec.defaultQuality, standard, aspect);
		if (getFfmpegProfile(profileName) !== null) {
			const target = buildMediaLocation(
				spec,
				identity,
				spec.defaultQuality,
				spec.defaultExtension,
				pathOpts,
			).absolutePath;
			// The quality tier's directory (e.g. av/404/<bucket>/) does not exist yet
			// — only the original tier was created by addFile. ffmpeg pass 1 writes
			// its two-pass stats file (passLog) into this dir, so without the mkdir
			// it dies with "ratecontrol_init: can't open stats file" and NO derivative
			// is ever produced (client then finds no default-quality file → no video).
			ensureMediaDir(target);
			const temp = `${target}.tmp.${process.pid}`;
			const passLog = `${target}.passlog`;
			await transcodeTwoPass(profileName, source, temp, passLog);
			await import('node:fs').then((fs) => fs.renameSync(temp, target));
			// ffmpeg writes two-pass stats as `${passLog}-0.log` (+ .mbtree). Remove
			// them so they don't litter the quality dir (and get mistaken for media).
			removePassLog(passLog);
			created.push(target);
			onProgress(70);
		}

		// Audio quality (single-pass extraction) — ONLY when the source actually
		// carries an audio stream. A silent/video-only source (common for screen
		// captures and muxed clips) makes ffmpeg emit "Output file does not contain
		// any stream" and exit non-zero; letting that throw would fail the WHOLE
		// transcode job even though the video derivative was already built, so the
		// client sees a failed job and never plays the (existing) video.
		if (spec.qualities.includes('audio') && hasAudioStream) {
			const audioTarget = buildMediaLocation(
				spec,
				identity,
				'audio',
				spec.defaultExtension,
				pathOpts,
			).absolutePath;
			// Same as above: the audio tier's directory must exist before extraction.
			ensureMediaDir(audioTarget);
			await getAudioCodec();
			await extractAudio(source, audioTarget, 'audio');
			created.push(audioTarget);
		}
		onProgress(100);
		return { created };
	});
	return record.id;
}

/** 16x9 vs 4x3 from dimensions (PHP get_aspect_ratio). */
function pickAspect(width?: number, height?: number): '16x9' | '4x3' | null {
	if (!width || !height) return null;
	const ratio = width / height;
	return ratio > 1.5 ? '16x9' : '4x3';
}

/** Resolve a media spec from a model name (convenience for callers). */
export function requireMediaSpec(model: string): MediaTypeSpec {
	const spec = mediaTypeOf(model);
	if (spec === null) throw new Error(`Not a media model: ${model}`);
	return spec;
}
