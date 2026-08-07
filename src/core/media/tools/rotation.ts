/**
 * tool_image_rotation core (PHP tool_image_rotation::apply_rotation).
 *
 * Rotates every NON-original quality tier in place (Original law: the original
 * is never mutated) and optionally crops, with the crop box scaled per tier from
 * the default-quality reference dimensions. Uses the ImageMagick adapter over
 * the spawn discipline; each derivative is rewritten via temp+rename.
 *
 * THE RETOUCHED MASTER IS ROTATED TOO, DELIBERATELY (checked 2026-08-07 against
 * the two-masters change). Only `spec.originalQuality` is skipped, and that is
 * v6's rule verbatim — frozen tool_image_rotation :190 / :229 skip the literal
 * 'original' and nothing else — but it is also the RIGHT rule under the two-
 * masters model, which is why it was left alone rather than widened to
 * `spec.masterQualities`:
 *
 *  - the retouched tier IS the human's working master ("a better look of the
 *    image"), and rotating/cropping is a human retouching act; it belongs in it;
 *  - it is the only way rotation SURVIVES. The derived tiers are re-encoded from
 *    the best master on every master change (processing.ts regenerateImage), so
 *    a rotation that lived only in them is reverted the next time anything
 *    touches the masters. Rotating the retouch keeps the whole ladder rotated.
 *
 * The archival ORIGINAL is never touched here — that invariant is the one this
 * file must hold, and it is gated (test/unit/media_two_masters.test.ts).
 *
 * KNOWN, NOT NARROWED: for a record with NO retouch, a rotation still lives only
 * in the derived tiers and a later master change reverts it (pre-existing — the
 * default tier and thumb have always been rebuilt unconditionally). The durable
 * fix is storing the rotation/crop as record state and re-applying it after a
 * rebuild; v6 did not do that either.
 */

import { existsSync } from 'node:fs';
import type { MediaTypeSpec } from '../../concepts/media.ts';
import { writeAtomically } from '../atomic.ts';
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
			try {
				// writeAtomically, NOT an ad-hoc temp built from the tier path plus a
				// rotation suffix and the pid. That name APPENDED to the full filename,
				// so it dropped the extension and ImageMagick fell back to the SOURCE
				// format and could write e.g. TIFF bytes into a `.jpg` tier (the exact trap
				// tempSibling documents), and it was not unique per call, so two
				// concurrent rotations of the same tier collided. The per-entry
				// try/catch stays: PHP collects rotate errors rather than aborting.
				await writeAtomically(path, (temp) =>
					rotateImage(path, temp, options.degrees, mode, background),
				);
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
					// Same writer as the rotate pass above, same reasons (extension-
					// preserving temp, unique per call, debris swept on failure).
					await writeAtomically(path, (temp) => cropImage(path, temp, box));
					result.cropped.push(path);
				} catch (error) {
					result.errors.push(`crop ${entry.quality}: ${(error as Error).message}`);
				}
			}
		}
	}

	return result;
}
