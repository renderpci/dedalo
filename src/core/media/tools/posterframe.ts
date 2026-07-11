/**
 * Posterframe core (PHP tool_posterframe::create_identifying_image media half).
 * Given a resolved AV source context and a resolved target IMAGE context, extract
 * a frame at `timecode` from the AV original into the image's ORIGINAL-quality
 * path, then regenerate the image derivatives from it (PHP: Ffmpeg::
 * create_posterframe → component_image->process_uploaded_file).
 *
 * The DB half — creating the portal target record that hosts the image — is the
 * tool module's job; this core is filesystem-only so it can be gated with a real
 * ffmpeg binary against a scratch tree.
 */

import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { config } from '../../../config/config.ts';
import type { MediaTypeSpec } from '../../concepts/media.ts';
import { createPosterframe, probeStreams } from '../engine/ffmpeg.ts';
import { buildThumb } from '../engine/imagemagick.ts';
import { type FileInfoEntry, scanFilesInfo } from '../files_info.ts';
import { sanitizeSegment, stagingDir } from '../ingest/add_file.ts';
import {
	type MediaIdentity,
	type MediaPathOptions,
	absoluteFromRelative,
	additionalPath,
	buildMediaIdentifier,
	buildMediaLocation,
} from '../path.ts';
import { resolveOriginalSource } from '../processing.ts';
import { regenerateImage } from '../processing.ts';

/** A resolved media component context (spec + identity + path options). */
export interface MediaContext {
	spec: MediaTypeSpec;
	identity: MediaIdentity;
	pathOpts: MediaPathOptions;
}

export interface PosterframeResult {
	/** true when a frame was extracted (false when the AV had no video stream). */
	created: boolean;
	/** The image original path written (when created). */
	posterframePath: string | null;
	/** The image component's files_info after regeneration. */
	filesInfo: FileInfoEntry[];
}

/**
 * Build the identifying image from an AV frame. Resolves the AV original (with
 * the PHP default-quality fallback), sizes the frame to the source video, writes
 * it to the image original path, and regenerates the image derivatives.
 */
export async function createIdentifyingImageCore(
	av: MediaContext,
	image: MediaContext,
	timecode: string,
): Promise<PosterframeResult> {
	if (av.spec.model !== 'component_av') throw new Error('posterframe source must be component_av');
	if (image.spec.model !== 'component_image')
		throw new Error('posterframe target must be component_image');

	// AV source: original quality, else default quality (PHP fallback when the
	// original file is absent).
	let source = resolveOriginalSource(av.spec, av.identity, av.pathOpts);
	if (source === null) {
		for (const ext of [av.spec.defaultExtension, ...av.spec.allowedExtensions]) {
			const loc = buildMediaLocation(
				av.spec,
				av.identity,
				av.spec.defaultQuality,
				ext,
				av.pathOpts,
			);
			if (existsSync(loc.absolutePath)) {
				source = loc.absolutePath;
				break;
			}
		}
	}
	if (source === null) throw new Error('AV source file not found');

	// Frame size = the source video dimensions (PHP derived it internally).
	const probe = await probeStreams(source);
	const video = probe?.streams?.find((s) => s.codec_type === 'video');
	if (video?.width == null || video?.height == null) {
		return { created: false, posterframePath: null, filesInfo: [] };
	}

	const target = buildMediaLocation(
		image.spec,
		image.identity,
		image.spec.originalQuality,
		image.spec.defaultExtension,
		image.pathOpts,
	).absolutePath;
	mkdirSync(dirname(target), { recursive: true, mode: 0o775 });

	const created = await createPosterframe(source, timecode, target, {
		width: Number(video.width),
		height: Number(video.height),
	});
	if (!created) return { created: false, posterframePath: null, filesInfo: [] };

	// Regenerate the image derivatives from the freshly written original.
	await regenerateImage(image.spec, image.identity, image.pathOpts, image.spec.defaultExtension);
	const filesInfo = scanFilesInfo(image.spec, image.identity, image.pathOpts, {
		originalNormalizedName: `${image.identity.componentTipo}_${image.identity.sectionTipo}_${image.identity.sectionId}.${image.spec.defaultExtension}`,
	});
	return { created: true, posterframePath: target, filesInfo };
}

/**
 * Absolute path for one of the AV component's derived media files, built with the
 * standard media grammar (`{folder}{initial_media_path}/{segment}{bucket}/{id}.{ext}`)
 * but WITHOUT buildMediaLocation's quality gate — the AV posterframe lives in a
 * folder the ladder gate rejects (posterframe is not a quality at all; the thumb
 * IS a real av tier — av.hasThumb — but this helper predates that and serves the
 * posterframe segment). PHP: component_media_common::get_media_filepath.
 */
function avDerivedPath(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	segment: string,
	extension: string,
): string {
	const identifier = buildMediaIdentifier(identity);
	const bucket =
		pathOpts.additionalPathOverride != null && pathOpts.additionalPathOverride !== ''
			? pathOpts.additionalPathOverride
			: additionalPath(identity.sectionId, pathOpts.maxItemsFolder);
	const relativePath = `${spec.folder}${pathOpts.initialMediaPath}/${segment}${bucket}/${identifier}.${extension}`;
	return absoluteFromRelative(relativePath, pathOpts.mediaRoot);
}

/**
 * The AV component's OWN posterframe file path. The posterframe lives in a
 * dedicated `posterframe` sub-folder (a sibling of the quality folders, NOT a
 * quality itself). Built to match EXACTLY the URL the section read serves
 * (read.ts:941 — `{folder}{initial_media_path}/posterframe{bucket}/{id}.{ext}`)
 * so the file we write is the file the client displays. PHP:
 * component_av::get_posterframe_filepath.
 */
export function posterframeAbsolutePath(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
): string {
	return avDerivedPath(
		spec,
		identity,
		pathOpts,
		'posterframe',
		config.media.avExtras.posterframeExtension,
	);
}

/**
 * Create the AV component's own posterframe (PHP component_av::create_posterframe).
 * Resolves the AV source (original quality, else default quality — PHP fallback),
 * extracts a frame at `timecode` sized to the source video, writes it to the
 * posterframe folder, then regenerates the AV thumb FROM the posterframe (PHP
 * calls create_thumb() afterward so the two stay in sync).
 *
 * Returns false — never throws — when there is no usable source file or the
 * source carries no video stream (audio-only), matching the PHP contract that
 * feeds the client a plain result:false.
 */
export async function createAvPosterframe(av: MediaContext, timecode: string): Promise<boolean> {
	if (av.spec.model !== 'component_av') throw new Error('posterframe source must be component_av');

	// AV source: original quality, else default quality (PHP fallback when the
	// original file is absent).
	let source = resolveOriginalSource(av.spec, av.identity, av.pathOpts);
	if (source === null) {
		for (const ext of [av.spec.defaultExtension, ...av.spec.allowedExtensions]) {
			const loc = buildMediaLocation(
				av.spec,
				av.identity,
				av.spec.defaultQuality,
				ext,
				av.pathOpts,
			);
			if (existsSync(loc.absolutePath)) {
				source = loc.absolutePath;
				break;
			}
		}
	}
	if (source === null) return false;

	// Frame size = the source video dimensions; no video stream ⇒ nothing to do.
	const probe = await probeStreams(source);
	const video = probe?.streams?.find((s) => s.codec_type === 'video');
	if (video?.width == null || video?.height == null) return false;

	const target = posterframeAbsolutePath(av.spec, av.identity, av.pathOpts);
	mkdirSync(dirname(target), { recursive: true, mode: 0o775 });

	const created = await createPosterframe(source, timecode, target, {
		width: Number(video.width),
		height: Number(video.height),
	});
	if (!created) return false;

	// Regenerate the thumb FROM the freshly written posterframe (PHP create_thumb:
	// ImageMagick::dd_thumb(posterframe → av/thumb/id.jpg)). Best-effort, mirroring
	// PHP where create_thumb's result does not gate create_posterframe's return.
	try {
		const thumbTarget = avDerivedPath(
			av.spec,
			av.identity,
			av.pathOpts,
			config.media.thumb.quality,
			config.media.thumb.extension,
		);
		mkdirSync(dirname(thumbTarget), { recursive: true, mode: 0o775 });
		await buildThumb(target, thumbTarget);
	} catch {
		// posterframe already written; a thumb failure must not fail the operation.
	}
	return true;
}

/** Media models that carry a posterframe (PHP tool_posterframe ar_allowed). */
function assertPosterframeModel(spec: MediaTypeSpec): void {
	if (spec.model !== 'component_av' && spec.model !== 'component_3d') {
		throw new Error('posterframe target must be component_av or component_3d');
	}
}

/**
 * Delete a component's own posterframe (PHP component_{av,3d}::delete_posterframe).
 * Direct unlink (not a move-to-deleted); returns false when the file is absent,
 * which PHP treats as a non-error since the desired end state already holds.
 */
export function deletePosterframe(ctx: MediaContext): boolean {
	assertPosterframeModel(ctx.spec);
	const target = posterframeAbsolutePath(ctx.spec, ctx.identity, ctx.pathOpts);
	if (!existsSync(target)) return false;
	rmSync(target);
	return true;
}

/** The extension of a client-supplied file name, lower-cased and charset-gated. */
function uploadedExtension(fileName: string): string {
	const dot = fileName.lastIndexOf('.');
	const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
	if (!/^[a-z0-9]+$/.test(ext)) throw new Error(`invalid uploaded file extension in '${fileName}'`);
	return ext;
}

/**
 * Move a staged upload into a component media sub-folder (PHP
 * dd_component_3d_api::move_file_to_dir). The 3D posterframe is a client-rendered
 * canvas snapshot: the browser uploads it to the staging tree, then this binds it
 * to the record. The source is REBUILT from the allowlisted staging root + user id
 * + sanitized key_dir/tmp_name (never a client path); the target file name is the
 * media identifier (not the client stem) at the uploaded extension. When the
 * target is `posterframe` the thumb is regenerated from it (PHP create_thumb),
 * best-effort. Returns false when the staged source is missing.
 */
export async function moveUploadedToMediaDir(input: {
	ctx: MediaContext;
	userId: number;
	keyDir: string;
	tmpName: string;
	fileName: string;
	targetDir: string;
}): Promise<boolean> {
	const { ctx, userId, keyDir, tmpName, fileName, targetDir } = input;
	assertPosterframeModel(ctx.spec);
	const segment = sanitizeSegment(targetDir);

	// Source: rebuilt from the staging allowlist (SEC-063), confined, must exist.
	const dir = stagingDir(userId, keyDir, ctx.pathOpts.mediaRoot);
	const source = resolve(dir, sanitizeSegment(tmpName));
	if (source !== dir && !source.startsWith(dir + sep)) {
		throw new Error('staged source escapes the staging dir');
	}
	if (!existsSync(source) || !statSync(source).isFile()) return false;

	// Target: {folder}{initial}/{segment}{bucket}/{identifier}.{ext} — the identifier
	// name (PHP file_data.name is the identifier; we recompute it, never trusting the
	// client stem) at the uploaded extension.
	const target = avDerivedPath(
		ctx.spec,
		ctx.identity,
		ctx.pathOpts,
		segment,
		uploadedExtension(fileName),
	);
	mkdirSync(dirname(target), { recursive: true, mode: 0o750 });
	renameSync(source, target);

	// Regenerate the thumb from a freshly moved posterframe (PHP create_thumb).
	if (segment === 'posterframe') {
		try {
			const thumbTarget = avDerivedPath(
				ctx.spec,
				ctx.identity,
				ctx.pathOpts,
				config.media.thumb.quality,
				config.media.thumb.extension,
			);
			mkdirSync(dirname(thumbTarget), { recursive: true, mode: 0o775 });
			await buildThumb(target, thumbTarget);
		} catch {
			// posterframe already in place; a thumb failure must not fail the move.
		}
	}
	return true;
}

/**
 * The absolute path of the AV file at `quality`, resolved across the type's
 * extensions (PHP component_av::get_media_filepath). null when none exists.
 */
function resolveAvQualityFile(av: MediaContext, quality: string): string | null {
	for (const ext of [av.spec.defaultExtension, ...av.spec.allowedExtensions]) {
		const loc = buildMediaLocation(av.spec, av.identity, quality, ext, av.pathOpts);
		if (existsSync(loc.absolutePath)) return loc.absolutePath;
	}
	return null;
}

/**
 * ffprobe the AV file at a quality (PHP component_av::get_media_streams →
 * Ffmpeg::get_media_streams). Defaults to the component's default quality when
 * none is given (PHP get_default_quality fallback). Returns null when there is no
 * file at that quality — the client degrades gracefully (streams → []).
 */
export async function getAvMediaStreams(
	av: MediaContext,
	quality?: string | null,
): Promise<{ streams: unknown[] } | null> {
	if (av.spec.model !== 'component_av')
		throw new Error('media streams source must be component_av');
	const targetQuality = quality != null && quality !== '' ? quality : av.spec.defaultQuality;
	const file = resolveAvQualityFile(av, targetQuality);
	if (file === null) return null;
	return probeStreams(file);
}
