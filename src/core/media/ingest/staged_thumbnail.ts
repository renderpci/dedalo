/**
 * STAGED-UPLOAD PREVIEW THUMBNAIL (PHP dd_utils_api::create_thumbnail :3354,
 * assigned to `file_data->thumbnail_url` at :1269 / :1539).
 *
 * The upload queue's success handler swaps the browser-generated preview for
 * the server's own rendering of the staged bytes, so the row reflects what was
 * actually stored (a TIFF or a CMYK JPEG previews very differently once
 * rasterised). The TS engine never emitted `thumbnail_url`, so that swap fed
 * `undefined` into the preview img.
 *
 * BEST EFFORT BY CONTRACT: a thumbnail is a nicety, never a reason to fail an
 * upload that already passed magic-byte validation. Every failure here resolves
 * to null and the client keeps its local preview.
 */

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildThumb } from '../engine/imagemagick.ts';
import { stagingDir } from './add_file.ts';
import { STAGED_THUMB_DIR, stagedThumbnailUrl } from './staged_files.ts';

/**
 * Extensions ImageMagick can rasterise into a preview here. Deliberately a
 * SMALL allowlist of still-image formats rather than "try everything and see":
 * spawning a converter for an arbitrary uploaded blob (video, archive, PDF with
 * embedded content) is both slow on the request path and a wider attack surface
 * than a preview warrants. Anything outside it simply gets no thumbnail.
 */
const THUMBNAILABLE: ReadonlySet<string> = new Set([
	'jpg',
	'jpeg',
	'png',
	'gif',
	'webp',
	'bmp',
	'tif',
	'tiff',
]);

/**
 * Render a preview thumbnail for a completed staged file and return its URL,
 * or null when the format is not previewable or the conversion failed.
 */
export async function createStagedThumbnail(
	userId: number,
	keyDir: string,
	tmpName: string,
	extension: string | null,
	mediaRoot?: string,
): Promise<string | null> {
	if (extension === null || !THUMBNAILABLE.has(extension.toLowerCase())) return null;
	try {
		const dir = stagingDir(userId, keyDir, mediaRoot);
		const thumbDir = resolve(dir, STAGED_THUMB_DIR);
		mkdirSync(thumbDir, { recursive: true, mode: 0o750 });
		const source = resolve(dir, tmpName);
		// Confinement: tmpName came from stagedTmpName/sanitizeSegment upstream,
		// but re-assert that neither path escaped the key_dir before spawning.
		if (!source.startsWith(dir) || !thumbDir.startsWith(dir)) return null;
		await buildThumb(source, resolve(thumbDir, `${tmpName}.jpg`));
		return stagedThumbnailUrl(keyDir, tmpName);
	} catch (error) {
		console.error('[staged_thumbnail] preview generation failed:', (error as Error).message);
		return null;
	}
}
