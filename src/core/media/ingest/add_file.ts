/**
 * ADD_FILE — move a staged upload into the original quality dir (PHP
 * component_media_common::add_file :901, SEC-063).
 *
 * The source path is REBUILT server-side from the staging-root allowlist + the
 * user id + a sanitized key_dir/tmp_name — never taken from a client-supplied
 * path. It is realpath-confined to the staging root, its extension is
 * re-validated against the type allowlist, any existing target is backed up
 * (rename_old_files), and it is renamed into the original quality dir. The
 * original tier keeps the raw upload; the normalized default-ext copy is built
 * by regenerate (Original law).
 */

import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { config } from '../../../config/config.ts';
import { type MediaTypeSpec, assertAllowedExtension } from '../../concepts/media.ts';
import { renameOldFiles } from '../file_ops.ts';
import {
	type MediaIdentity,
	type MediaPathOptions,
	buildMediaLocation,
	requireMediaRoot,
} from '../path.ts';

/**
 * Sanitize a single path segment (key_dir / tmp_name). STRICTER than PHP's
 * basename-strip: any NUL, slash, or traversal is rejected outright (fail-closed)
 * rather than silently reduced to a basename — a segment must be exactly one
 * safe name.
 */
export function sanitizeSegment(value: string): string {
	if (
		value === '' ||
		value === '.' ||
		value === '..' ||
		value.includes('\0') ||
		value.includes('/') ||
		!/^[A-Za-z0-9_.\-]+$/.test(value)
	) {
		throw new Error(`Unsafe path segment '${value}'`);
	}
	return value;
}

/** The staging root for a user + key_dir (PHP DEDALO_UPLOAD_TMP_DIR/<user>/<key_dir>). */
export function stagingDir(userId: number, keyDir: string, mediaRoot?: string): string {
	const root = requireMediaRoot(mediaRoot);
	const safeKey = sanitizeSegment(keyDir);
	// The user id becomes a path segment. Reject only non-integers and 0 — the
	// ROOT user is -1 (PHP logged_user_id()), a legitimate authenticated caller;
	// String(-1)='-1' is a safe segment (the confinement check below still holds).
	if (!Number.isInteger(userId) || userId === 0) throw new Error('Invalid user id for staging dir');
	const dir = resolve(root, config.media.upload.tmpSubdir, String(userId), safeKey);
	// Confine to the staging subtree under the media root.
	const stagingBase = resolve(root, config.media.upload.tmpSubdir);
	if (dir !== stagingBase && !dir.startsWith(stagingBase + sep)) {
		throw new Error('Staging dir escapes the upload root');
	}
	return dir;
}

export interface AddFileInput {
	spec: MediaTypeSpec;
	identity: MediaIdentity;
	pathOpts: MediaPathOptions;
	userId: number;
	keyDir: string;
	/** The staged temp file name (as returned by the upload receiver). */
	tmpName: string;
	/** The declared/ sniffed extension (re-validated against the allowlist). */
	extension: string;
	now?: Date;
}

export interface AddFileResult {
	/** Absolute path of the file now in the original quality dir. */
	originalFilePath: string;
	/** The validated, normalized extension of the stored original. */
	extension: string;
	/** File name (stem.ext) of the stored original. */
	fileName: string;
}

/**
 * Move a staged file into `<original quality dir>/<id>.<ext>` after confinement
 * and extension validation, backing up any existing file first.
 */
export function addFile(input: AddFileInput): AddFileResult {
	const extension = assertAllowedExtension(input.spec, input.extension);
	// Rebuild the source path from the allowlisted staging root (SEC-063).
	const dir = stagingDir(input.userId, input.keyDir, input.pathOpts.mediaRoot);
	const tmpName = sanitizeSegment(input.tmpName);
	const source = resolve(dir, tmpName);
	if (source !== resolve(dir, tmpName) || !source.startsWith(dir + sep)) {
		throw new Error('Staged source escapes the staging dir');
	}
	if (!existsSync(source) || !statSync(source).isFile()) {
		throw new Error('Staged upload not found');
	}
	// Target = original quality, raw extension.
	const target = buildMediaLocation(
		input.spec,
		input.identity,
		input.spec.originalQuality,
		extension,
		input.pathOpts,
	).absolutePath;
	const targetDir = target.slice(0, target.lastIndexOf('/'));
	if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true, mode: 0o775 });
	// Back up any existing target (rename_old_files) then move the staged file in.
	renameOldFiles(target, input.now ?? new Date(), input.pathOpts.mediaRoot);
	renameSync(source, target);
	return {
		originalFilePath: target,
		extension,
		fileName: target.slice(target.lastIndexOf('/') + 1),
	};
}
