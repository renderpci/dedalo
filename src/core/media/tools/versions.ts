/**
 * tool_media_versions core (PHP tool_media_versions).
 *
 * get_files_info (re-scan), build_version (one quality derivative; av async via
 * the job manager), delete_version / delete_quality (soft-delete), sync_files
 * (re-scan → the fresh files_info). The original is never mutated.
 */

import { existsSync } from 'node:fs';
import { config } from '../../../config/config.ts';
import { type MediaTypeSpec, assertValidQuality } from '../../concepts/media.ts';
import { conformHeader } from '../engine/ffmpeg.ts';
import { moveToDeleted } from '../file_ops.ts';
import { type FileInfoEntry, type ScanContext, scanFilesInfo } from '../files_info.ts';
import { submitAvTranscode } from '../ingest/process_uploaded_file.ts';
import { type MediaIdentity, type MediaPathOptions, buildMediaLocation } from '../path.ts';
import {
	buildImageVersion,
	buildPdfCover,
	buildThumbVersion,
	copyToQuality,
	resolveOriginalSource,
} from '../processing.ts';
import { applyRotationCore } from './rotation.ts';

/**
 * Re-scan and return the current files_info (get_files_info / sync_files).
 * `context` carries the stored data[0] cues (external_source, original/modified
 * normalized names) so external media and the raw-original twin resolve exactly
 * as PHP get_files_info does.
 */
export function getFilesInfoCore(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	context: ScanContext = {},
): FileInfoEntry[] {
	return scanFilesInfo(spec, identity, pathOpts, context);
}

export interface BuildVersionResult {
	built: string[];
	jobId: string | null;
}

/**
 * Build one quality derivative from the original (PHP build_version). Image tiers
 * resize; the thumb tier thumbnails; pdf 'web' copies + covers; av transcodes via
 * the job manager (returns a job id). Throws on an unknown quality / missing
 * original.
 */
export async function buildVersionCore(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	quality: string,
	rawExtension?: string | null,
): Promise<BuildVersionResult> {
	assertValidQuality(spec, quality);
	const thumbQuality = config.media.thumb.quality;

	if (spec.model === 'component_av') {
		return {
			built: [],
			jobId: submitAvTranscode(spec, identity, pathOpts, rawExtension ?? spec.defaultExtension),
		};
	}

	// THUMB builds from the DEFAULT-QUALITY file, not the original (v6
	// component_image::create_thumb :393 — get_media_filepath(default_quality)).
	// On a partial-media box the default file is usually present while the
	// original is not; requiring the original here made the thumb gear fail with
	// 'original not found' for exactly those records.
	if (quality === thumbQuality) {
		const defaultLocation = buildMediaLocation(
			spec,
			identity,
			spec.defaultQuality,
			spec.defaultExtension,
			pathOpts,
		);
		const thumbSource = existsSync(defaultLocation.absolutePath)
			? defaultLocation.absolutePath
			: resolveOriginalSource(spec, identity, pathOpts, rawExtension);
		if (thumbSource === null) {
			throw new Error(
				`build_version: no ${spec.defaultQuality} file and no original to build the thumb from`,
			);
		}
		return { built: [await buildThumbVersion(spec, identity, thumbSource, pathOpts)], jobId: null };
	}

	const source = resolveOriginalSource(spec, identity, pathOpts, rawExtension);
	if (source === null) throw new Error('build_version: original not found');

	if (spec.model === 'component_image') {
		return {
			built: [await buildImageVersion(spec, identity, quality, source, pathOpts)],
			jobId: null,
		};
	}
	if (spec.model === 'component_pdf') {
		// pdf 'web' = copy; the jpg cover rides along.
		const built = [
			copyToQuality(spec, identity, quality, source, 'pdf', pathOpts),
			await buildPdfCover(spec, identity, source, pathOpts),
		];
		return { built, jobId: null };
	}
	// svg / 3d: naive copy to the target quality.
	return {
		built: [copyToQuality(spec, identity, quality, source, spec.defaultExtension, pathOpts)],
		jobId: null,
	};
}

/**
 * Soft-delete one quality×extension file (PHP delete_version): move it into
 * deleted/. Returns the moved path or null (absent). thumb routing is implicit
 * (the caller passes the thumb quality + extension).
 */
export function deleteVersionCore(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	quality: string,
	extension: string,
): string | null {
	assertValidQuality(spec, quality);
	const path = buildMediaLocation(spec, identity, quality, extension, pathOpts).absolutePath;
	return moveToDeleted(path, { mediaRoot: pathOpts.mediaRoot });
}

/**
 * Soft-delete EVERY extension of one quality tier (PHP delete_quality →
 * delete_file($quality) → remove_component_media_files([$quality], null), which
 * iterates all known extensions). We scan the live files_info for that quality
 * (this also surfaces the raw-original / modified twins under 'original'/'modified')
 * and move each present, non-external file into deleted/. Returns the moved paths.
 */
export function deleteQualityCore(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	quality: string,
	context: ScanContext = {},
): string[] {
	assertValidQuality(spec, quality);
	const moved: string[] = [];
	for (const entry of scanFilesInfo(spec, identity, pathOpts, context)) {
		if (entry.quality !== quality || entry.external || entry.extension == null) continue;
		const path = buildMediaLocation(
			spec,
			identity,
			quality,
			entry.extension,
			pathOpts,
		).absolutePath;
		const target = moveToDeleted(path, { mediaRoot: pathOpts.mediaRoot });
		if (target !== null) moved.push(target);
	}
	return moved;
}

/**
 * Conform an AV container's headers in place (PHP tool_media_versions::
 * conform_headers → component_av::conform_headers). av-only; remuxes the quality
 * file (stream copy) and relocates the moov atom via qt-faststart, preserving the
 * pre-conform file as `<stem>_untouched.<ext>`. Throws on a wrong model, unknown
 * quality, or missing source file.
 */
export async function conformHeadersCore(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	quality: string,
	rawExtension?: string | null,
): Promise<boolean> {
	if (spec.model !== 'component_av') {
		throw new Error('conform_headers: only supported for component_av');
	}
	assertValidQuality(spec, quality);
	const extension = rawExtension ?? spec.defaultExtension;
	const source = buildMediaLocation(spec, identity, quality, extension, pathOpts).absolutePath;
	if (!existsSync(source)) throw new Error('conform_headers: file does not exist');
	await conformHeader(source);
	return true;
}

export interface RotateVersionResult {
	result: boolean;
	errors: string[];
}

/**
 * Rotate one quality tier in place (PHP tool_media_versions::rotate →
 * component_image::rotate, rotation_mode 'expanded'). image-only; rotates every
 * on-disk file of the requested quality (there may be more than one extension)
 * by `degrees`. The original tier is never mutated (Original law). Returns
 * result=false with the collected per-file errors on any failure.
 */
export async function rotateVersionCore(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	quality: string,
	degrees: number,
	context: ScanContext = {},
): Promise<RotateVersionResult> {
	if (spec.model !== 'component_image') {
		throw new Error('rotate: only supported for component_image');
	}
	assertValidQuality(spec, quality);
	const entries = scanFilesInfo(spec, identity, pathOpts, context)
		.filter((entry) => entry.quality === quality && entry.file_exist && entry.extension != null)
		.map((entry) => ({
			quality: entry.quality,
			extension: entry.extension as string,
			file_exist: true,
		}));
	if (entries.length === 0) {
		return { result: false, errors: [`rotate: no file found for quality '${quality}'`] };
	}
	const rotation = await applyRotationCore(spec, identity, pathOpts, entries, {
		degrees: Number(degrees),
		mode: 'expanded',
	});
	return { result: rotation.errors.length === 0, errors: rotation.errors };
}
