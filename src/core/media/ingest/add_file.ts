/**
 * ADD_FILE — move a staged upload into the original quality dir (PHP
 * component_media_common::add_file :901, SEC-063).
 *
 * The source path is REBUILT server-side from the staging-root allowlist + the
 * user id + a sanitized key_dir/tmp_name — never taken from a client-supplied
 * path. It is realpath-confined to the staging root, its extension is
 * re-validated against the type allowlist, any existing target is backed up
 * (rename_old_files), and it is renamed into the target quality dir — the
 * ORIGINAL tier unless the caller asked for another one (PHP set_quality()).
 * The original tier keeps the raw upload; the normalized default-ext copy is
 * built by regenerate (Original law).
 */

import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { config } from '../../../config/config.ts';
import {
	assertAllowedExtension,
	assertValidQuality,
	type MediaTypeSpec,
} from '../../concepts/media.ts';
import { DedaloError } from '../../errors/dedalo_error.ts';
import { renameOldFiles } from '../file_ops.ts';
import {
	buildMediaLocation,
	type MediaIdentity,
	type MediaPathOptions,
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
		!/^[A-Za-z0-9_.-]+$/.test(value)
	) {
		// Disclosure `operator`: the rejected segment is raw client input and stays
		// in the log-only `message`.
		throw new DedaloError('media.invalid_path', { message: `Unsafe path segment '${value}'` });
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
		throw new DedaloError('media.invalid_path', {
			message: 'Staging dir escapes the upload root',
			coordinates: { dir },
		});
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
	/**
	 * Target quality tier (PHP set_quality() before add_file — tool_import_files'
	 * custom_target_quality, tool_upload's quality). Defaults to the ORIGINAL
	 * tier. CLIENT-SUPPLIED and it becomes a path segment, so it is validated
	 * against this type's ladder + charset (assertValidQuality) before use.
	 */
	quality?: string;
	/**
	 * The HUMAN file name as uploaded ('María Piñón.mp4') — PHP add_file's `$name`,
	 * which becomes `ready.original_file_name` and, from there, the record's
	 * provenance keys and the `target_filename` companion field.
	 *
	 * NOT `tmpName`. The staged name is sanitized so it is safe as a FILESYSTEM
	 * segment, and that transform is neither reversible nor injective; using it as
	 * the recorded name is how an accented, spaced, human title became
	 * 'Mar_a_Pi_n.mp4' in the archive.
	 *
	 * OPTIONAL, and no ingest door depends on it: the receiver persists the name
	 * beside the staged file, so the ingest recovers it from the SERVER
	 * ({@link recordedFileName}) rather than from a caller that may or may not
	 * relay it. This key is for a caller that knows a better name than the one the
	 * bytes arrived under — `tool_import_files`' per-entry operator name.
	 */
	originalFileName?: string;
	/**
	 * The name the SERVER recorded for this staged file when it received it
	 * (`staged_name_record.ts`, read by `processUploadedFile` — the ONE caller of
	 * this function). null when the staging area holds no record: a file dropped
	 * in out of band, or one staged by a server older than 2026-08-09.
	 *
	 * Ranked BELOW `originalFileName` because an explicit caller name is a
	 * statement, and ABOVE `tmpName` because it is the real name of these exact
	 * bytes rather than the filesystem segment they were parked under.
	 */
	recordedFileName?: string | null;
	now?: Date;
}

export interface AddFileResult {
	/** Absolute path of the file now in the original quality dir. */
	originalFilePath: string;
	/** The validated, normalized extension of the stored original. */
	extension: string;
	/** File name (stem.ext) of the stored original. */
	fileName: string;
	/**
	 * The HUMAN name this upload is recorded under (PHP `ready.original_file_name`).
	 * Decided HERE so the whole ingest has ONE answer to "what was this file
	 * called"; see {@link humanFileNameOf} for why it is not `fileName`.
	 */
	humanFileName: string;
}

/**
 * The human file name to record for an upload, in THREE ranks:
 *
 *   1. `originalFileName` — an explicit statement by the caller (only
 *      `tool_import_files` makes one, from the operator's own queue entry);
 *   2. `recordedFileName` — what the SERVER wrote down when it received these
 *      bytes (`staged_name_record.ts`). This is the rank that carries every
 *      ordinary upload, and it is why the restoration does not depend on any
 *      caller cooperating: as of 2026-08-09 none of the three ingest callers
 *      passes rank 1, and wiring the name only through the transport left the
 *      defect fully live in production;
 *   3. the staged name — the OLD, lossy behaviour, and the honest answer for a
 *      file the server has no record of receiving: one dropped into the staging
 *      area out of band, or staged by a server older than the record.
 *
 * Rank 3 is a real fallback and not a contract fiction, so it is not tripwired
 * away; what IS gated is that ranks 1 and 2 both reach here from every door
 * (test/unit/media_ingest_properties_native.test.ts).
 */
export function humanFileNameOf(input: {
	originalFileName?: string;
	recordedFileName?: string | null;
	tmpName: string;
}): string {
	const supplied = input.originalFileName?.trim() ?? '';
	if (supplied !== '') return supplied;
	const recorded = input.recordedFileName?.trim() ?? '';
	return recorded !== '' ? recorded : input.tmpName;
}

/**
 * Move a staged file into `<target quality dir>/<id>.<ext>` (the ORIGINAL tier
 * unless `quality` says otherwise) after confinement and extension validation,
 * backing up any existing file first.
 */
export function addFile(input: AddFileInput): AddFileResult {
	const extension = assertAllowedExtension(input.spec, input.extension);
	const quality =
		input.quality === undefined
			? input.spec.originalQuality
			: assertValidQuality(input.spec, input.quality);
	// Rebuild the source path from the allowlisted staging root (SEC-063).
	const dir = stagingDir(input.userId, input.keyDir, input.pathOpts.mediaRoot);
	const tmpName = sanitizeSegment(input.tmpName);
	const source = resolve(dir, tmpName);
	if (source !== resolve(dir, tmpName) || !source.startsWith(dir + sep)) {
		throw new DedaloError('media.invalid_path', {
			message: 'Staged source escapes the staging dir',
			coordinates: { source },
		});
	}
	if (!existsSync(source) || !statSync(source).isFile()) {
		throw new DedaloError('media.file_not_found', {
			message: 'Staged upload not found',
			publicMessage: 'Staged upload not found',
			coordinates: { source },
		});
	}
	// Target = the requested quality tier (original by default), raw extension.
	const target = buildMediaLocation(
		input.spec,
		input.identity,
		quality,
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
		humanFileName: humanFileNameOf(input),
	};
}
