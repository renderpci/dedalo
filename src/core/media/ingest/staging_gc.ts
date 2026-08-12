/**
 * STAGING GARBAGE COLLECTION — the sweeper for abandoned upload artifacts.
 *
 * WHAT LEAKED. Chunk parts were unlinked ONLY inside a successful join. A user
 * who cancelled a transfer, lost the connection, or closed the tab left every
 * part already delivered parked in their staging dir forever — nothing anywhere
 * in `media/ingest/` collected them. A failed 4 GB upload leaked ~4 GB, and it
 * repeated every retry. (`deleteStagedFile` swept parts of the SAME NAME, but
 * only when the user explicitly removed a row that, for an aborted upload,
 * never existed.)
 *
 * THE RETENTION RULE — an upload is collectable when NOTHING has touched it for
 * STAGING_ORPHAN_TTL_MS (24 h), measured as the NEWEST mtime among the upload
 * directory and its parts, never per part. That distinction is the whole safety
 * argument: chunks arrive concurrently and out of order over hours on a slow
 * link, so part 0 of a live 30 GB transfer can be a day older than the transfer
 * itself — an age rule on individual parts would delete data still in flight.
 * A whole upload untouched for 24 h, by contrast, is dead by construction: the
 * client retries a stalled part 5 times at 5 s intervals and then fails the
 * transfer (`upload_transport.js` send_part_with_retry), so no live upload is
 * ever idle for hours.
 *
 * 24 h and not a config key on purpose: this is an internal GC detail, not an
 * institutional policy, and the value only has to be far larger than any
 * possible client-side stall — which it is by three orders of magnitude.
 *
 * WHERE IT RUNS. On `listStagedFiles` (the upload queue calls it on every
 * render, so it is the natural low-frequency hook, once per key_dir), and on a
 * completed join. It NEVER walks another user's tree: every entry point takes
 * the user id from the session and rebuilds the path through `stagingDir`.
 */

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { sanitizeSegment, stagingDir } from './add_file.ts';
import { pruneOrphanStagedNames } from './staged_name_record.ts';

/** How long an untouched in-flight upload survives before it is collected. */
export const STAGING_ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Directory prefix for one logical upload's in-flight artifacts. The leading dot
 * keeps it out of `listStagedFiles` (which skips dotfiles) and out of
 * `resolveStagedPath` (which only ever accepts `<key_dir>[/thumbnail]/<name>`).
 */
export const UPLOAD_DIR_PREFIX = '.up_';

/** Absolute path of one logical upload's artifact directory, confined to key_dir. */
export function uploadArtifactDir(
	userId: number,
	keyDir: string,
	uploadId: string,
	mediaRoot?: string,
): string {
	const dir = stagingDir(userId, keyDir, mediaRoot);
	// sanitizeSegment fail-closes on '', '.', '..', NUL, '/' and anything outside
	// [A-Za-z0-9_.-] — the upload id is validated far more strictly upstream
	// (upload.ts assertUploadId), this is the defense-in-depth twin.
	const name = sanitizeSegment(`${UPLOAD_DIR_PREFIX}${uploadId}`);
	const full = resolve(dir, name);
	if (!full.startsWith(dir + sep)) throw new Error('upload artifact dir escapes the staging dir');
	return full;
}

/** True for a leftover of the PRE-2026-08-03 flat layout (`<i>-<name>.blob`, `<name>.assembling`). */
function isLegacyArtifact(name: string): boolean {
	return name.endsWith('.blob') || name.endsWith('.assembling');
}

/**
 * The ACTIVITY stamp of an artifact: its own mtime, or — for an upload
 * directory — the NEWEST mtime among it and its parts. Anything unreadable
 * reports +Infinity, i.e. never collectable: the sweeper's failure mode must be
 * keeping data, never deleting it.
 */
function lastActivity(path: string): number {
	let newest: number;
	try {
		newest = statSync(path).mtimeMs;
	} catch {
		return Number.POSITIVE_INFINITY;
	}
	// A legacy flat artifact is a FILE: readdir fails on it and its own mtime is
	// the whole answer (reading the directory listing inside the same try would
	// have discarded it — and with it every legacy orphan).
	let entries: string[];
	try {
		entries = readdirSync(path);
	} catch {
		return newest;
	}
	for (const entry of entries) {
		try {
			newest = Math.max(newest, statSync(resolve(path, entry)).mtimeMs);
		} catch {
			// Raced with our own join unlinking a part — not an error.
		}
	}
	return newest;
}

/**
 * Remove every abandoned in-flight artifact under ONE user's key_dir. Returns
 * how many were removed. Completed staged files are never touched, and neither
 * is an upload whose newest artifact is younger than the TTL.
 *
 * Best effort by contract: it runs on the listing path, where a GC failure must
 * never turn into a failed render.
 */
export function sweepStagedOrphans(
	userId: number,
	keyDir: string,
	mediaRoot?: string,
	now: number = Date.now(),
): number {
	let dir: string;
	try {
		dir = stagingDir(userId, keyDir, mediaRoot);
	} catch {
		return 0; // a malformed key_dir is the caller's problem, not the sweeper's
	}
	if (!existsSync(dir)) return 0;

	let removed = 0;
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return 0;
	}
	for (const entry of entries) {
		const isUploadDir = entry.startsWith(UPLOAD_DIR_PREFIX);
		if (!isUploadDir && !isLegacyArtifact(entry)) continue;
		const full = resolve(dir, entry);
		if (!full.startsWith(dir + sep)) continue;
		if (now - lastActivity(full) <= STAGING_ORPHAN_TTL_MS) continue;
		try {
			rmSync(full, { recursive: true, force: true });
			removed++;
		} catch (error) {
			console.warn('[staging_gc] could not remove', entry, (error as Error).message);
		}
	}
	// The display-name records (staged_name_record.ts) follow the same rule as the
	// artifacts above: one belongs to ONE staged file, and is collectable once that
	// file is gone AND it has been untouched for the retention window. Normally
	// they are dropped with their file (by the ingest or by deleteStagedFile); this
	// is the backstop for a file removed by something that did neither.
	removed += pruneOrphanStagedNames(dir, now, STAGING_ORPHAN_TTL_MS);
	return removed;
}

/**
 * Drop ONE logical upload's artifacts immediately — the explicit cancel that
 * backs `dd_utils_api::delete_uploaded_file` when the client passes an
 * `upload_id` (its Dropzone `removedfile` / transport `abort()` path). Returns
 * true when something was removed.
 *
 * This is the only way to free a cancelled transfer's bytes BEFORE the TTL; the
 * age sweep above is the backstop for a client that never gets to send it.
 */
export function cancelStagedUpload(
	userId: number,
	keyDir: string,
	uploadId: string,
	mediaRoot?: string,
): boolean {
	const dir = uploadArtifactDir(userId, keyDir, uploadId, mediaRoot);
	if (!existsSync(dir)) return false;
	rmSync(dir, { recursive: true, force: true });
	return true;
}
