/**
 * STAGED-UPLOAD ADDRESSING — the read side of the upload staging area.
 *
 * The receiver (upload.ts) writes a user's in-flight files under
 * `stagingDir(userId, keyDir)`. Two client flows need to READ them back:
 *
 *   1. `dd_utils_api::list_uploaded_files` — service_dropzone calls it on every
 *      render and injects the result as existing files, which is how a queue
 *      SURVIVES A PAGE RELOAD. It previously returned a hardcoded `[]`, so every
 *      reload showed an empty dropzone even though the files were still staged.
 *   2. The per-file thumbnail (`file_data.thumbnail_url`, PHP dd_utils_api
 *      :1269) shown in the preview row.
 *
 * Both need an HTTP URL for a staged file. The GENERAL media route deliberately
 * refuses to serve anything under `upload/` (MEDIA-04: it authenticates a
 * session but not an OWNER, so it would let any logged-in user read any other
 * user's in-flight files). So staged files get their own route whose user id
 * comes from the SESSION and never from the URL — `resolveStagedPath` below is
 * the single confinement chokepoint for it.
 */

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { sanitizeSegment, stagingDir } from './add_file.ts';

/**
 * URL prefix for the staged-upload route. Distinct from MEDIA_URL_PREFIX
 * precisely so the MEDIA-04 `upload/` exclusion keeps applying to the general
 * media route unchanged.
 */
export const STAGED_URL_PREFIX = '/dedalo/upload_tmp/';

/** Subdirectory (inside the key_dir) holding generated preview thumbnails. */
export const STAGED_THUMB_DIR = 'thumbnail';

/** Public URL for a completed staged file. */
export function stagedFileUrl(keyDir: string, name: string): string {
	return `${STAGED_URL_PREFIX}${encodeURIComponent(keyDir)}/${encodeURIComponent(name)}`;
}

/** Public URL for a staged file's generated thumbnail. */
export function stagedThumbnailUrl(keyDir: string, name: string): string {
	return (
		`${STAGED_URL_PREFIX}${encodeURIComponent(keyDir)}/` +
		`${STAGED_THUMB_DIR}/${encodeURIComponent(`${name}.jpg`)}`
	);
}

/**
 * True for a staging artifact that is NOT a finished file: an in-flight chunk
 * (`<i>-<name>.blob`) or a half-assembled join (`<name>.assembling`). Listing
 * these would show the user phantom rows for uploads still in progress.
 */
function isPartialArtifact(name: string): boolean {
	return name.endsWith('.blob') || name.endsWith('.assembling');
}

/** One entry of the list_uploaded_files response (the client's mock-file shape). */
export interface StagedFile {
	name: string;
	url: string;
	size: number;
	thumbnail_url: string | null;
}

/**
 * List the COMPLETED files a user has staged under `keyDir`.
 *
 * Returns `[]` for a not-yet-created staging dir (the ordinary first-visit
 * state) — but a malformed `keyDir` still throws out of `stagingDir`, because a
 * bad segment is a caller bug, not an empty result.
 */
export function listStagedFiles(userId: number, keyDir: string, mediaRoot?: string): StagedFile[] {
	const dir = stagingDir(userId, keyDir, mediaRoot);
	if (!existsSync(dir)) return [];

	const out: StagedFile[] = [];
	for (const name of readdirSync(dir)) {
		if (name.startsWith('.') || isPartialArtifact(name)) continue;
		const full = resolve(dir, name);
		let stat: ReturnType<typeof statSync>;
		try {
			stat = statSync(full);
		} catch {
			continue; // raced with a delete — not an error, just gone
		}
		if (!stat.isFile()) continue; // skips the `thumbnail/` subdir
		const thumbPath = resolve(dir, STAGED_THUMB_DIR, `${name}.jpg`);
		out.push({
			name,
			url: stagedFileUrl(keyDir, name),
			size: stat.size,
			thumbnail_url: existsSync(thumbPath) ? stagedThumbnailUrl(keyDir, name) : null,
		});
	}
	// Stable order so a reload reproduces the previous row order.
	out.sort((a, b) => a.name.localeCompare(b.name));
	return out;
}

/**
 * Delete one completed staged file (and its generated thumbnail, and any
 * leftover chunk parts) from a user's staging area.
 *
 * Backs `dd_utils_api::delete_uploaded_file`, which service_dropzone fires from
 * its `removedfile` handler. Returns false when there was nothing to delete —
 * the caller reports that as a successful no-op, since the client has already
 * dropped the row and a hard error would only poison page_globals.api_errors.
 *
 * The user id comes from the session, never the request body: `key_dir` and
 * `fileName` are the only caller-supplied parts and both go through
 * sanitizeSegment.
 */
export function deleteStagedFile(
	userId: number,
	keyDir: string,
	fileName: string,
	mediaRoot?: string,
): boolean {
	const dir = stagingDir(userId, keyDir, mediaRoot);
	const safeName = sanitizeSegment(fileName);
	const full = resolve(dir, safeName);
	if (!full.startsWith(dir + sep)) return false;

	let removed = false;
	if (existsSync(full)) {
		rmSync(full, { force: true });
		removed = true;
	}
	// The generated preview follows the file.
	const thumb = resolve(dir, STAGED_THUMB_DIR, `${safeName}.jpg`);
	if (thumb.startsWith(dir + sep) && existsSync(thumb)) rmSync(thumb, { force: true });

	// Sweep any parts of an ABORTED chunked upload of the same name
	// (`<i>-<name>.blob`, `<name>.assembling`) — otherwise a cancelled upload
	// leaves orphans in the staging dir that nothing ever collects.
	if (existsSync(dir)) {
		const partSuffix = `-${safeName}.blob`;
		for (const entry of readdirSync(dir)) {
			if (entry === `${safeName}.assembling` || entry.endsWith(partSuffix)) {
				const partPath = resolve(dir, entry);
				if (partPath.startsWith(dir + sep)) {
					rmSync(partPath, { force: true });
					removed = true;
				}
			}
		}
	}
	return removed;
}

/**
 * Resolve a staged-upload URL path (everything after STAGED_URL_PREFIX) to an
 * absolute file path inside THIS user's staging area, or null if it does not
 * resolve safely.
 *
 * The user id is supplied by the caller from the session — it is never taken
 * from the URL, which is what keeps one user out of another's staging dir.
 * Accepts `<key_dir>/<name>` and `<key_dir>/thumbnail/<name>`; nothing deeper.
 */
export function resolveStagedPath(
	userId: number,
	relPath: string,
	mediaRoot?: string,
): string | null {
	const segments = relPath.split('/').filter((segment) => segment !== '');
	if (segments.length < 2 || segments.length > 3) return null;

	const [keyDir, ...rest] = segments;
	if (segments.length === 3 && rest[0] !== STAGED_THUMB_DIR) return null;

	let dir: string;
	try {
		// sanitizeSegment (fail-closed) rejects '', '.', '..', NUL and slashes.
		dir = stagingDir(userId, keyDir as string, mediaRoot);
		for (const segment of rest) sanitizeSegment(segment);
	} catch {
		return null;
	}

	const full = resolve(dir, ...rest);
	// Defense in depth over sanitizeSegment: the resolved path must still sit
	// strictly inside this user's key_dir.
	if (!full.startsWith(dir + sep)) return null;
	// A partial artifact is never publicly readable.
	if (isPartialArtifact(full)) return null;
	return full;
}
