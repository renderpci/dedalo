/**
 * tool_image_rotation core (PHP tool_image_rotation::apply_rotation).
 *
 * Rotates every NON-original quality tier in place (Original law: the original
 * is never mutated) and optionally crops, with the crop box scaled per tier from
 * the default-quality reference dimensions. Uses the ImageMagick adapter over
 * the spawn discipline; each derivative is rewritten via temp+rename.
 */

import { existsSync, renameSync } from 'node:fs';
import type { MediaTypeSpec } from '../../concepts/media.ts';
import { type CropBox, cropImage, getDimensions, rotateImage } from '../engine/imagemagick.ts';
import { type MediaIdentity, type MediaPathOptions, buildMediaLocation } from '../path.ts';

/** A stored files_info entry (quality + extension) the rotation walks. */
export interface RotationTargetEntry {
	quality: string;
	extension: string;
	file_exist?: boolean;
}

export interface ApplyRotationOptions {
	/** Degrees to rotate (0 skips the rotate pass). */
	degrees: number;
	/** 'expanded' grows the canvas; 'default' keeps it (PHP rotation_mode). */
	mode?: 'expanded' | 'default';
	/** Background color for exposed corners (jpg → '#ffffff'; null → transparent). */
	background?: string | null;
	/** Proportional crop box (fractions 0..1 of the default-quality reference), or null. */
	cropArea?: { x: number; y: number; width: number; height: number } | null;
}

export interface RotationResult {
	rotated: string[];
	cropped: string[];
	errors: string[];
}

/**
 * Apply rotation + optional crop across every non-original tier present in
 * `entries`. Returns the touched paths and any per-tier errors (PHP collects
 * rotate errors rather than aborting).
 */
export async function applyRotationCore(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	entries: RotationTargetEntry[],
	options: ApplyRotationOptions,
): Promise<RotationResult> {
	const result: RotationResult = { rotated: [], cropped: [], errors: [] };
	const background = options.background === undefined ? '#ffffff' : options.background;
	const mode = options.mode ?? 'expanded';

	// Rotate pass (skip original; skip zero rotation).
	if (options.degrees !== 0 && !Number.isNaN(options.degrees)) {
		for (const entry of entries) {
			if (entry.quality === spec.originalQuality) continue;
			if (entry.file_exist === false) continue;
			const path = buildMediaLocation(
				spec,
				identity,
				entry.quality,
				entry.extension,
				pathOpts,
			).absolutePath;
			if (!existsSync(path)) continue;
			const temp = `${path}.rot.${process.pid}`;
			try {
				await rotateImage(path, temp, options.degrees, mode, background);
				renameSync(temp, path);
				result.rotated.push(path);
			} catch (error) {
				result.errors.push(`${entry.quality}: ${(error as Error).message}`);
			}
		}
	}

	// Crop pass: scale the fractional box per tier from the default-quality dims.
	if (options.cropArea && options.cropArea.width > 0 && options.cropArea.height > 0) {
		const refPath = buildMediaLocation(
			spec,
			identity,
			spec.defaultQuality,
			spec.defaultExtension,
			pathOpts,
		).absolutePath;
		if (existsSync(refPath)) {
			for (const entry of entries) {
				if (entry.quality === spec.originalQuality) continue;
				if (entry.file_exist === false) continue;
				const path = buildMediaLocation(
					spec,
					identity,
					entry.quality,
					entry.extension,
					pathOpts,
				).absolutePath;
				if (!existsSync(path)) continue;
				try {
					const dims = await getDimensions(path);
					const box: CropBox = {
						x: Math.round(options.cropArea.x * dims.width),
						y: Math.round(options.cropArea.y * dims.height),
						width: Math.round(options.cropArea.width * dims.width),
						height: Math.round(options.cropArea.height * dims.height),
					};
					const temp = `${path}.crop.${process.pid}`;
					await cropImage(path, temp, box);
					renameSync(temp, path);
					result.cropped.push(path);
				} catch (error) {
					result.errors.push(`crop ${entry.quality}: ${(error as Error).message}`);
				}
			}
		}
	}

	return result;
}
