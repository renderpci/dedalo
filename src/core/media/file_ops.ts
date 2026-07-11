/**
 * MEDIA FILE OPS — the No-hard-delete law + duplication + TM deleted-scan.
 *
 * Ports PHP move_deleted_file (:1929) / rename_old_files (:1193) /
 * duplicate_component_media_files (:1999) / the get_deleted_image natsort scan.
 * Every filesystem touch is confined via assertInsideMediaRoot (the path
 * chokepoint). Files are never hard-deleted — they move to '<dir>/deleted/'.
 *
 * Datestamp note (engineering/MEDIA_SPEC.md §5.6): PHP has TWO formats and BOTH are
 * preserved per call-site. move_deleted_file uses `Y-m-d_Hi`; the section-delete
 * path (delete_record.removeSectionMediaFiles) uses `Y-m-d_Gis`. Do NOT unify —
 * time-machine scanners and humans read both.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../../config/config.ts';
import type { MediaTypeSpec } from '../concepts/media.ts';
import {
	type MediaIdentity,
	type MediaPathOptions,
	assertInsideMediaRoot,
	buildMediaLocation,
} from './path.ts';

/** PHP date('Y-m-d_Hi') — the move_deleted_file / rename_old_files stamp. */
export function deletedStampHi(now: Date): string {
	const pad = (v: number): string => String(v).padStart(2, '0');
	return (
		`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
		`_${pad(now.getHours())}${pad(now.getMinutes())}`
	);
}

/** Split an absolute file path into { dir, stem, extension }. */
function splitPath(absolutePath: string): { dir: string; stem: string; extension: string } {
	const slash = absolutePath.lastIndexOf('/');
	const dir = absolutePath.slice(0, slash);
	const fileName = absolutePath.slice(slash + 1);
	const dot = fileName.lastIndexOf('.');
	return {
		dir,
		stem: dot > 0 ? fileName.slice(0, dot) : fileName,
		extension: dot > 0 ? fileName.slice(dot + 1) : '',
	};
}

/**
 * Move a file into '<dir>/deleted[/<bulkProcessId>]/<stem>_deleted_<stamp>.<ext>'
 * (PHP move_deleted_file :1929). Bulk mode drops the stamp (plain '<stem>.<ext>').
 * Returns the target path, or null when the source is absent (idempotent).
 */
export function moveToDeleted(
	absolutePath: string,
	opts: { bulkProcessId?: string; now?: Date; mediaRoot?: string } = {},
): string | null {
	const source = assertInsideMediaRoot(absolutePath, opts.mediaRoot);
	if (!existsSync(source)) return null;
	const { dir, stem, extension } = splitPath(source);
	const deletedDir = assertInsideMediaRoot(
		opts.bulkProcessId ? `${dir}/deleted/${opts.bulkProcessId}` : `${dir}/deleted`,
		opts.mediaRoot,
	);
	if (!existsSync(deletedDir)) mkdirSync(deletedDir, { recursive: true, mode: 0o775 });
	const extSuffix = extension !== '' ? `.${extension}` : '';
	const target = opts.bulkProcessId
		? `${deletedDir}/${stem}${extSuffix}`
		: `${deletedDir}/${stem}_deleted_${deletedStampHi(opts.now ?? new Date())}${extSuffix}`;
	renameSync(source, assertInsideMediaRoot(target, opts.mediaRoot));
	return target;
}

/**
 * Back up any existing file at `absolutePath` into deleted/ BEFORE it is
 * overwritten (PHP rename_old_files :1193). No-op (null) when nothing is there.
 */
export function renameOldFiles(
	absolutePath: string,
	now: Date = new Date(),
	mediaRoot?: string,
): string | null {
	return existsSync(assertInsideMediaRoot(absolutePath, mediaRoot))
		? moveToDeleted(absolutePath, { now, mediaRoot })
		: null;
}

/**
 * Copy every existing quality × extension file of a source identity to a target
 * identity (PHP duplicate_component_media_files :1999). Returns the created
 * absolute paths. The caller then refreshStoredFilesInfo + save on the target so
 * files_info carries the target's paths, not the source's.
 */
export function duplicateMediaFiles(
	spec: MediaTypeSpec,
	source: MediaIdentity,
	target: MediaIdentity,
	pathOpts: { source: MediaPathOptions; target: MediaPathOptions },
): string[] {
	const thumbQuality = config.media.thumb.quality;
	const thumbExtension = config.media.thumb.extension;
	const qualities = [...spec.qualities];
	if (spec.hasThumb && !qualities.includes(thumbQuality)) qualities.push(thumbQuality);
	const extensions = [
		...new Set(
			[spec.defaultExtension, ...spec.allowedExtensions, ...spec.alternateExtensions].map((e) =>
				e.toLowerCase(),
			),
		),
	];
	const created: string[] = [];
	for (const quality of qualities) {
		const exts = quality === thumbQuality ? [thumbExtension] : extensions;
		for (const extension of exts) {
			const from = buildMediaLocation(
				spec,
				source,
				quality,
				extension,
				pathOpts.source,
			).absolutePath;
			if (!existsSync(from)) continue;
			const to = buildMediaLocation(spec, target, quality, extension, pathOpts.target).absolutePath;
			const toDir = dirname(to);
			if (!existsSync(toDir)) mkdirSync(toDir, { recursive: true, mode: 0o775 });
			copyFileSync(from, to);
			created.push(to);
		}
	}
	return created;
}

/**
 * List the deleted versions of a quality (PHP get_deleted_image glob + natsort):
 * '<quality dir>/deleted/<id>_*.<ext>', natural-sorted, newest last. Absolute
 * paths. Used by time-machine reads to recover a soft-deleted file.
 */
export function listDeletedVersions(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	quality: string,
	extension: string,
	pathOpts: MediaPathOptions,
): string[] {
	const location = buildMediaLocation(spec, identity, quality, extension, pathOpts);
	const { dir, stem } = splitPath(location.absolutePath);
	const deletedDir = `${dir}/deleted`;
	if (!existsSync(deletedDir)) return [];
	const prefix = `${stem}_`;
	const matches = readdirSync(deletedDir)
		.filter((name) => name.startsWith(prefix))
		.map((name) => `${deletedDir}/${name}`)
		.filter((path) => {
			try {
				return statSync(path).isFile();
			} catch {
				return false;
			}
		});
	// Natural sort (PHP natsort) so '..._9' precedes '..._10'.
	return matches.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
