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
import { buildMediaLocation, type MediaIdentity, type MediaPathOptions } from '../path.ts';

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
	/**
	 * Crop box in PIXELS of the default-quality reference file — the tier the
	 * client previews and measures the selection against
	 * (render_tool_image_crop.update_crop_area scales display px → natural px of
	 * that file). It is turned into a proportion here and re-scaled per tier
	 * (MEDIA_SPEC: "proportional crop computed from the default-quality
	 * reference dimensions"). Null skips the crop pass.
	 */
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

	// Crop pass: the client box is measured in default-quality PIXELS, so it is
	// normalized against that reference tier's dimensions and re-scaled per tier.
	if (options.cropArea && options.cropArea.width > 0 && options.cropArea.height > 0) {
		const refPath = buildMediaLocation(
			spec,
			identity,
			spec.defaultQuality,
			spec.defaultExtension,
			pathOpts,
		).absolutePath;
		if (existsSync(refPath)) {
			const refDims = await getDimensions(refPath);
			if (!(refDims.width > 0 && refDims.height > 0)) {
				result.errors.push(
					`crop: unreadable ${spec.defaultQuality} reference dimensions (${refPath})`,
				);
				return result;
			}
			const fraction = {
				x: options.cropArea.x / refDims.width,
				y: options.cropArea.y / refDims.height,
				width: options.cropArea.width / refDims.width,
				height: options.cropArea.height / refDims.height,
			};
			// A box the client could not have drawn (outside the reference image)
			// would be silently clamped by ImageMagick to a no-op full-frame crop.
			if (
				fraction.x < 0 ||
				fraction.y < 0 ||
				fraction.x + fraction.width > 1.001 ||
				fraction.y + fraction.height > 1.001
			) {
				result.errors.push(
					`crop: box ${options.cropArea.width}x${options.cropArea.height}+${options.cropArea.x}+${options.cropArea.y} falls outside the ${spec.defaultQuality} reference (${refDims.width}x${refDims.height})`,
				);
				return result;
			}
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
						x: Math.round(fraction.x * dims.width),
						y: Math.round(fraction.y * dims.height),
						width: Math.round(fraction.width * dims.width),
						height: Math.round(fraction.height * dims.height),
					};
					// Rounding can push the far edge 1px past the tier bounds —
					// ImageMagick would warn ("geometry does not contain image") and
					// the tier would be lost. Clamp instead.
					box.width = Math.min(box.width, dims.width - box.x);
					box.height = Math.min(box.height, dims.height - box.y);
					if (box.width < 1 || box.height < 1) continue;
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
