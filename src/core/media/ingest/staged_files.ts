/**
 * STAGED-UPLOAD ADDRESSING — the read side of the upload staging area.
 *
 * The receiver (upload.ts) writes a user's in-flight files under
 * `stagingDir(userId, keyDir)`. Two client flows need to READ them back:
 *
 *   1. `dd_utils_api::list_uploaded_files` — `service_upload`'s multi-file queue
 *      calls it on every render and injects the result as existing files, which
 *      is how a queue SURVIVES A PAGE RELOAD. It previously returned a hardcoded
 *      `[]`, so every reload showed an empty queue even though the files were
 *      still staged.
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
import { DedaloError } from '../../errors/dedalo_error.ts';
import { sanitizeSegment, stagingDir } from './add_file.ts';
import { forgetStagedDisplayName } from './staged_name_record.ts';
import { cancelStagedUpload, sweepStagedOrphans, UPLOAD_DIR_PREFIX } from './staging_gc.ts';
import { stagedTmpName } from './upload.ts';

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
 * True for a staging artifact that is NOT a finished file: a transfer's artifact
 * directory (`.up_<upload_id>/`, the current layout) or a leftover of the flat
 * one (`<i>-<name>.blob`, `<name>.assembling`). Listing these would show the
 * user phantom rows for uploads still in progress.
 *
 * Takes ONE path SEGMENT, never a full path: `startsWith` on a joined path would
 * misjudge a legitimate key_dir or file name that merely contains the prefix.
 */
function isPartialArtifact(segment: string): boolean {
	return (
		segment.endsWith('.blob') ||
		segment.endsWith('.assembling') ||
		segment.startsWith(UPLOAD_DIR_PREFIX)
	);
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

	// GC hook for abandoned transfers (staging_gc.ts). The queue renderer calls
	// the listing on every render, so this is the once-per-key_dir, low-frequency
	// place to collect them; it only ever removes in-flight artifacts untouched
	// for the retention window, never a completed file. Best effort: a GC failure
	// must not turn into a failed render.
	try {
		sweepStagedOrphans(userId, keyDir, mediaRoot);
	} catch (error) {
		console.warn('[staged_files] staging sweep failed:', (error as Error).message);
	}

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
 * Backs `dd_utils_api::delete_uploaded_file`, which the upload queue fires when
 * a row is removed. Returns false when there was nothing to delete —
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
	uploadId?: string | null,
): boolean {
	const dir = stagingDir(userId, keyDir, mediaRoot);
	// Validate the caller-supplied name FIRST (it throws on anything that is not
	// one safe segment), so a malformed request changes nothing at all.
	const safeName = sanitizeSegment(fileName);
	// EXPLICIT CANCEL: the client may remove a row for a transfer that never
	// completed, in which case there is no staged file to delete and the bytes
	// live in `.up_<upload_id>/`. Dropping it here is what frees them immediately
	// instead of waiting for the age sweep (staging_gc.ts).
	let cancelled = false;
	if (typeof uploadId === 'string' && uploadId !== '') {
		cancelled = cancelStagedUpload(userId, keyDir, uploadId, mediaRoot);
	}
	const full = resolve(dir, safeName);
	if (!full.startsWith(dir + sep)) return cancelled;

	let removed = cancelled;
	if (existsSync(full)) {
		rmSync(full, { force: true });
		removed = true;
	}
	// The generated preview follows the file.
	const thumb = resolve(dir, STAGED_THUMB_DIR, `${safeName}.jpg`);
	if (thumb.startsWith(dir + sep) && existsSync(thumb)) rmSync(thumb, { force: true });
	// So does the server's record of what the file was CALLED
	// (staged_name_record.ts) — a record describes ONE staged file and has no
	// meaning once that file is gone. Dropped here, with the file, rather than
	// left for the age sweep.
	forgetStagedDisplayName(dir, safeName);

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
 * Resolve ONE batch-import entry to the staged base NAME on disk.
 *
 * The staged name is SERVER-ASSIGNED (upload.ts claimStagedName): two client
 * names that sanitize to the same thing now produce `x.jpg` and `x-1.jpg`, so
 * re-deriving it from the client's display name is no longer sound. Every import
 * client must forward the server's `file_data.tmp_name` per entry — that is the
 * authoritative answer and the only one taken when present.
 *
 * The fallback for an entry WITHOUT `tmp_name` (an older queue restored from
 * localStorage, a third-party caller) is the legacy transform — but it is
 * explicitly bounded, never a guess: if collision-suffixed candidates for the
 * legacy name exist, this THROWS naming the fix rather than silently importing
 * whichever file the ladder happened to land on.
 *
 * ORDER IS THE WHOLE CONTRACT (fixed 2026-08-03). The collision scan used to run
 * only AFTER `existsSync(legacy)` returned false, so the refusal fired exactly
 * when it did not matter and stayed silent when it did: with `DSC001.jpg` AND
 * `DSC001-1.jpg` both staged — the shape a curator produces by re-uploading a
 * corrected scan, since a re-upload no longer overwrites — an entry with no
 * `tmp_name` returned the OLD file. Wrong bytes, right catalogue record, no
 * error anywhere. The presence of a suffixed candidate is what makes the name
 * ambiguous; whether the unsuffixed one also exists is irrelevant to that.
 *
 * Returns the base name only; the caller resolves + confines it against the
 * user's staging dir.
 */
export function resolveStagedName(
	dir: string,
	clientName: string,
	forwardedTmpName?: string | null,
): string {
	if (typeof forwardedTmpName === 'string' && forwardedTmpName !== '') {
		// Throws on anything that is not one safe segment — a forwarded value is
		// still client input.
		return sanitizeSegment(forwardedTmpName);
	}
	const legacy = stagedTmpName(clientName);

	const dot = legacy.lastIndexOf('.');
	const stem = dot > 0 ? legacy.slice(0, dot) : legacy;
	const suffix = dot > 0 ? legacy.slice(dot) : '';
	const collisionSuffixed = new RegExp(
		`^${stem.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}-[0-9a-f]{1,8}${suffix.replace(/\./g, '\\.')}$`,
	);
	let candidates: string[] = [];
	try {
		candidates = readdirSync(dir).filter((entry) => collisionSuffixed.test(entry));
	} catch {
		return legacy; // no staging dir → the caller reports "staged file not found"
	}
	if (candidates.length > 0) {
		throw new DedaloError('media.upload_conflict', {
			message: `'${clientName}': the staged name is ambiguous (${candidates.length} collision-suffixed candidates) because the client did not forward file_data.tmp_name`,
			publicMessage:
				'The staged name is ambiguous: several collision-suffixed candidates match it. The client must forward file_data.tmp_name.',
		});
	}
	return legacy;
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
	// A partial artifact is never publicly readable. Judged on the LAST SEGMENT:
	// the full path carries the key_dir, and a key_dir that happens to contain
	// '.blob' or '.up_' must not make its finished files unreadable.
	const lastSegment = segments[segments.length - 1] as string;
	if (isPartialArtifact(lastSegment)) return null;
	return full;
}
