/**
 * MEDIA FILE OPS — the No-hard-delete law + duplication + the deleted/ scan, and
 * the RECORD-level pair that law exists for: delete a record's media and put it
 * back (PHP section_record::remove_section_media_files /
 * restore_deleted_section_media_files, engineering/MEDIA_SPEC.md §5.6 + §8).
 *
 * Ports PHP move_deleted_file (:1929) / rename_old_files (:1193) /
 * duplicate_component_media_files (:1999) / the get_deleted_image natsort scan.
 * Every filesystem touch is confined via assertInsideMediaRoot (the path
 * chokepoint). Files are never hard-deleted — they move to '<dir>/deleted/'.
 *
 * DELETE AND RESTORE ARE ONE PAIR AND LIVE IN ONE FILE. They were not: the
 * remove half sat in `section/record/delete_record.ts` resolving the media root
 * from a bare env key that is normally UNSET (the root is a DERIVED default), so
 * on an ordinary install it moved nothing at all; the restore half — which
 * `MEDIA_SPEC.md` §8 names as the tool_time_machine section-restore touchpoint —
 * did not exist, so an undeleted record reported success with its audio, image or
 * scanned consent form still in `deleted/` and a files_info claiming
 * `file_exist:true`. A half-pair is how that happens; the halves are written
 * against each other here, and the round trip is gated as a round trip
 * (test/unit/media_lifecycle_native.test.ts).
 *
 * NEITHER HALF READS files_info. It is a filesystem-derived CACHE, and a delete
 * is precisely the moment it may be stale (a file added since the last scan would
 * be left behind, live, under a deleted record's name). Both halves enumerate the
 * type's own census — every quality × managed extension, plus the AV POSTERFRAME,
 * which is not a quality and which neither PHP-side caller could reach through
 * files_info either.
 *
 * Datestamp note: PHP has TWO formats, per call-site.
 * `move_deleted_file` (:1929 — the soft-delete every record-level and tier-level
 * delete goes through, INCLUDING the section delete) uses `Y-m-d_Hi`;
 * `rename_old_files` (:1226 — the pre-overwrite backup on upload) uses
 * `Y-m-d_Gis`. Do NOT unify: time-machine scanners and humans read both.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../../config/config.ts';
import { isMediaModel, type MediaTypeSpec, mediaTypeOf } from '../concepts/media.ts';
import { getColumnNameByModel, getModelByTipo, getNode } from '../ontology/resolver.ts';
import { normalizeAdditionalPath, resolveMediaPathOptions } from './ontology_path.ts';
import {
	assertInsideMediaRoot,
	buildMediaLocation,
	type MediaIdentity,
	type MediaPathOptions,
	posterframeLocation,
} from './path.ts';

/**
 * PHP `date('Y-m-d_Hi')` — the `move_deleted_file` stamp, i.e. every soft-delete:
 * a tier, a twin, a whole record.
 *
 * It is NOT PHP's `rename_old_files` stamp, which is `Y-m-d_Gis`
 * (class.component_media_common.php:1226). `renameOldFiles` below stamps `Hi`
 * for both of its callers; on `processing.ts` (the derivative-replacement pass,
 * which has no PHP counterpart at all) that is simply this engine's own choice,
 * but on `ingest/add_file.ts` — the pre-overwrite upload backup, which IS
 * PHP's rename_old_files — it is a KNOWN, ledgered divergence in the on-disk
 * name. Nothing reads the stamp to make a decision (the deleted/ scan matches
 * `<id>_*.<ext>` and orders by name), so it costs recognisability, not
 * recoverability. Handed off rather than changed here: the two callers would
 * have to be told apart first, and that is not this workstream's file.
 */
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
	const created: string[] = [];
	for (const [quality, extension] of managedFileSlots(spec)) {
		const from = buildMediaLocation(spec, source, quality, extension, pathOpts.source).absolutePath;
		if (!existsSync(from)) continue;
		const to = buildMediaLocation(spec, target, quality, extension, pathOpts.target).absolutePath;
		const toDir = dirname(to);
		if (!existsSync(toDir)) mkdirSync(toDir, { recursive: true, mode: 0o775 });
		copyFileSync(from, to);
		created.push(to);
	}
	return created;
}

/**
 * EVERY `[quality, extension]` slot a media type may hold on disk — the ONE
 * census behind duplicate, record-delete and record-restore, so those three can
 * never disagree about what "this record's files" means.
 *
 * It is the MANAGED extension list, never the BUILT one. A walk that enumerates
 * only what the engine builds silently drops the pdf COVER (built whether or not
 * the config lists it) and every configured-but-refused legacy file — which on a
 * copy left the duplicate without the only visual a pdf has in a list view, and
 * on a delete would leave a live file behind under a deleted record's name. See
 * MediaTypeSpec.managedExtensions for the measurement.
 *
 * The thumb tier is the one exception: `files_info` scans it with
 * `config.media.thumb.extension` alone, so any other file there could never be
 * indexed and is not this record's.
 */
export function managedFileSlots(spec: MediaTypeSpec): [string, string][] {
	const thumbQuality = config.media.thumb.quality;
	const qualities = [...spec.qualities];
	if (spec.hasThumb && !qualities.includes(thumbQuality)) qualities.push(thumbQuality);
	const slots: [string, string][] = [];
	for (const quality of qualities) {
		const extensions =
			quality === thumbQuality ? [config.media.thumb.extension] : spec.managedExtensions;
		for (const extension of extensions) slots.push([quality, extension]);
	}
	return slots;
}

/**
 * List the deleted versions of ONE quality × extension (PHP get_deleted_image /
 * restore_component_media_files, both `glob("<id>_*.<ext>")` + natsort):
 * '<quality dir>/deleted/<id>_*.<ext>', natural-sorted, newest last. Absolute
 * paths. Used by time-machine reads to recover a soft-deleted file.
 *
 * THE EXTENSION IS PART OF THE MATCH, as it is in PHP's glob. Keying on the STEM
 * alone was harmless while a tier held exactly one file and is not any more — the
 * engine BUILDS alternate-extension twins since 2026-08-07, so a stem-only scan
 * of the default tier answers with the '.avif' twin's soft-deleted bytes as
 * readily as the '.jpg' it was asked for, and a restore would then write those
 * bytes to the '.jpg' path. Every browser would refuse the result.
 */
export function listDeletedVersions(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	quality: string,
	extension: string,
	pathOpts: MediaPathOptions,
): string[] {
	const location = buildMediaLocation(spec, identity, quality, extension, pathOpts);
	const { dir, stem, extension: cleanExtension } = splitPath(location.absolutePath);
	return listDeletedIn(dir, stem, cleanExtension);
}

/**
 * The deleted/ scan itself, on a plain directory + stem + extension — shared by
 * `listDeletedVersions` (quality files) and the POSTERFRAME restore, which is not
 * a quality and so has no `buildMediaLocation` to go through.
 */
function listDeletedIn(dir: string, stem: string, extension: string): string[] {
	const deletedDir = `${dir}/deleted`;
	if (!existsSync(deletedDir)) return [];
	const prefix = `${stem}_`;
	const suffix = extension === '' ? '' : `.${extension}`;
	const matches = readdirSync(deletedDir)
		.filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
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

// ---------------------------------------------------------------------------
// The record-level pair: delete a record's media, and put it back
// ---------------------------------------------------------------------------

/** One media component this pass handled (PHP returns `{tipo, model}` objects). */
export interface SectionMediaComponent {
	tipo: string;
	model: string;
}

/** What a record-level media pass did. `errors` is never thrown away. */
export interface SectionMediaFilesOutcome {
	/** The media components actually walked, in column order. */
	components: SectionMediaComponent[];
	/** Absolute paths of the files this pass moved (targets). */
	files: string[];
	/**
	 * Per-component failures. PHP logs and continues here, and so do we: one
	 * unreadable component may not abort the other five, and a delete whose media
	 * pass half-ran must SAY so rather than report a clean sweep. The caller
	 * surfaces them; nothing is silently narrowed.
	 */
	errors: string[];
}

/** Options shared by both directions. `mediaRoot` is the scratch-root seam. */
export interface SectionMediaFilesOptions {
	now?: Date;
	mediaRoot?: string;
	/** Bulk-import batch id — drops the datestamp (PHP move_deleted_file). */
	bulkProcessId?: string;
	/**
	 * `properties.additional_path` values the CALLER already knows, keyed by
	 * component tipo — authoritative, and resolved from here otherwise.
	 *
	 * It exists because `additional_path` is a NAMED bucket folder taken from
	 * ANOTHER COMPONENT'S VALUE IN THIS RECORD (rsc165's Certificate of Cession and
	 * Questionnaire files live in one), so resolving it needs the record to be
	 * readable — and the section delete runs POST-COMMIT, when the row is already
	 * gone. Left to resolve itself there, the walk falls back to the numeric bucket
	 * and sweeps a folder the ingest never wrote to, i.e. leaves the files live
	 * under a deleted record's name.
	 *
	 * Both delete doors hand over the pre-delete record instead — see `snapshot`
	 * below, which resolves this per component from it. This field stays for the
	 * caller that knows the bucket outright (and for the gates); a caller whose
	 * row IS readable can omit both, and the resolution below is exact.
	 */
	additionalPathOverrides?: Record<string, string | null>;
	/**
	 * The record's FULL jsonb columns (the Time Machine snapshot shape:
	 * `{media:{…}, string:{…}, …}`) — the readable form of the same problem
	 * `additionalPathOverrides` solves, for the caller that HAS the snapshot and
	 * should not have to re-implement PHP's `get_additional_path` to use it.
	 *
	 * Given it, the bucket of a component declaring `properties.additional_path`
	 * is read from the SNAPSHOT's sibling value instead of from the (already
	 * deleted, or about-to-be-emptied) row. An explicit `additionalPathOverrides`
	 * entry still wins; a component that declares no `additional_path` is
	 * untouched by either.
	 */
	snapshot?: Record<string, unknown>;
}

/**
 * The `properties.additional_path` bucket for ONE media component, read from a
 * RECORD SNAPSHOT rather than from the database (PHP get_additional_path
 * :778-819 — same rule, different source).
 *
 * `undefined` means "this component declares no named bucket, resolve normally";
 * a string (possibly `''`) is the bucket, exactly as
 * `resolveAdditionalPathOverride` returns it. Throws — via
 * {@link normalizeAdditionalPath} — on a stored value that would escape the
 * media tree; the caller's per-component catch turns that into a reported error
 * rather than a half-swept record.
 */
async function additionalPathFromSnapshot(
	componentTipo: string,
	snapshot: Record<string, unknown>,
): Promise<string | undefined> {
	const properties = ((await getNode(componentTipo))?.properties ?? {}) as {
		additional_path?: unknown;
	};
	const siblingTipo = properties.additional_path;
	if (typeof siblingTipo !== 'string' || siblingTipo === '') return undefined;
	const siblingModel = await getModelByTipo(siblingTipo);
	const column = siblingModel === null ? null : getColumnNameByModel(siblingModel);
	const stored =
		column === null
			? undefined
			: (snapshot[column] as Record<string, unknown> | null | undefined)?.[siblingTipo];
	return normalizeAdditionalPath(snapshotFlatValue(stored));
}

/**
 * A sibling component's flat scalar value as PHP reads it for a path
 * (`component_common::get_value()`): the lg-nolan items, else every stored item,
 * values joined with ' | '. Twin of `ontology_path.ts siblingFlatValue`, which
 * reads the same rule from the DATABASE — this one reads it from a snapshot, and
 * the two must agree or a delete would sweep a different folder than the ingest
 * wrote to. Exported so the rule is gated directly.
 */
export function snapshotFlatValue(stored: unknown): string {
	if (!Array.isArray(stored)) return '';
	const items = stored as { lang?: unknown; value?: unknown }[];
	const nolan = items.filter((item) => {
		const lang = item?.lang ?? null;
		return lang === null || lang === 'lg-nolan';
	});
	const slice = nolan.length > 0 ? nolan : items;
	return slice
		.map((item) => (typeof item?.value === 'string' ? item.value : ''))
		.filter((value) => value !== '')
		.join(' | ');
}

/**
 * Walk a record's `media` column and hand each media component's identity to
 * `handle`. The two directions differ ONLY in what `handle` does, so the
 * ontology resolution, the model gate, the per-lang identity fan-out and the
 * error contract are written once.
 *
 * The per-item `lang` fan-out mirrors `duplicate_record.ts`: a translatable media
 * component stores one item per lang and each has its own identifier on disk, so
 * a pass that assumed `lang:null` would leave every translated file behind. With
 * no stored items at all we still walk once with `lang:null` — the column key
 * exists, so the record HAD this component, and its files must not survive it.
 */
async function walkSectionMedia(
	sectionTipo: string,
	sectionId: number,
	mediaColumn: Record<string, unknown[]> | null | undefined,
	options: SectionMediaFilesOptions,
	handle: (
		spec: MediaTypeSpec,
		identity: MediaIdentity,
		pathOpts: MediaPathOptions,
	) => string[] | Promise<string[]>,
): Promise<SectionMediaFilesOutcome> {
	const mediaRoot = options.mediaRoot;
	const outcome: SectionMediaFilesOutcome = { components: [], files: [], errors: [] };
	if (mediaColumn === null || mediaColumn === undefined) return outcome;

	for (const [componentTipo, rawItems] of Object.entries(mediaColumn)) {
		const model = await getModelByTipo(componentTipo);
		const spec = model === null || !isMediaModel(model) ? null : mediaTypeOf(model);
		if (model === null || spec === null) {
			// PHP logs an ERROR ("Inconsistent data in media column") and skips. It is
			// reported rather than swallowed: a non-media tipo in the media column is a
			// data fault someone has to see, and on the delete side it is also a file
			// that may still be live.
			outcome.errors.push(
				`media column of ${sectionTipo}/${String(sectionId)} holds '${componentTipo}', whose model is ` +
					`${model === null ? 'unknown' : `'${model}'`} — not a media component; its files were NOT touched`,
			);
			continue;
		}
		try {
			// THE RECORD-SCOPED RESOLUTION (three arguments), so `additional_path`'s
			// NAMED bucket is honoured: the ingest wrote there, and a delete that swept
			// the numeric bucket instead would leave those files live. A caller-supplied
			// value wins — see SectionMediaFilesOptions.additionalPathOverrides for the
			// post-commit case where the record can no longer be read at all.
			const resolved = await resolveMediaPathOptions(componentTipo, sectionTipo, sectionId);
			const explicit = options.additionalPathOverrides?.[componentTipo];
			const supplied =
				explicit !== undefined
					? explicit
					: options.snapshot === undefined
						? undefined
						: await additionalPathFromSnapshot(componentTipo, options.snapshot);
			const pathOpts: MediaPathOptions = {
				...resolved,
				...(supplied === undefined ? {} : { additionalPathOverride: supplied }),
				mediaRoot,
			};
			const items = Array.isArray(rawItems) ? rawItems : [];
			const langs = new Set<string | null>();
			for (const item of items) {
				langs.add((item as { lang?: string } | null)?.lang ?? null);
			}
			if (langs.size === 0) langs.add(null);
			for (const lang of langs) {
				const identity: MediaIdentity = { componentTipo, sectionTipo, sectionId, lang };
				outcome.files.push(...(await handle(spec, identity, pathOpts)));
			}
			outcome.components.push({ tipo: componentTipo, model });
		} catch (error) {
			outcome.errors.push(`${componentTipo} (${model}): ${(error as Error).message}`);
		}
	}
	return outcome;
}

/**
 * Move EVERY file of a deleted record's media into its own `deleted/` folder
 * (PHP section_record::remove_section_media_files → component_media_common::
 * remove_component_media_files → move_deleted_file, plus component_av's override
 * for the posterframe).
 *
 * Recoverable by construction: this is a move, and `restoreDeletedSectionMediaFiles`
 * below is the exact inverse. Files that are already absent are silent no-ops
 * (`moveToDeleted` returns null), so the pass is idempotent — which matters
 * because it runs POST-COMMIT, after the row is already gone.
 */
export async function removeSectionMediaFiles(
	sectionTipo: string,
	sectionId: number,
	mediaColumn: Record<string, unknown[]> | null | undefined,
	options: SectionMediaFilesOptions = {},
): Promise<SectionMediaFilesOutcome> {
	const now = options.now ?? new Date();
	return walkSectionMedia(
		sectionTipo,
		sectionId,
		mediaColumn,
		options,
		(spec, identity, pathOpts) => {
			const moved: string[] = [];
			for (const [quality, extension] of managedFileSlots(spec)) {
				const path = buildMediaLocation(spec, identity, quality, extension, pathOpts).absolutePath;
				const target = moveToDeleted(path, {
					now,
					mediaRoot: pathOpts.mediaRoot,
					bulkProcessId: options.bulkProcessId,
				});
				if (target !== null) moved.push(target);
			}
			// THE POSTERFRAME IS NOT A QUALITY, and no quality walk can reach it. PHP
			// overrides the whole method on component_av for exactly this file; the TS
			// delete path moved it in neither shape, so a deleted interview left its
			// still frame in a live folder — the one image of the record every list
			// view shows.
			const posterframe = posterframeLocation(spec, identity, pathOpts);
			if (posterframe !== null) {
				const target = moveToDeleted(posterframe.absolutePath, {
					now,
					mediaRoot: pathOpts.mediaRoot,
					bulkProcessId: options.bulkProcessId,
				});
				if (target !== null) moved.push(target);
			}
			return moved;
		},
	);
}

/**
 * Put a record's soft-deleted media back (PHP section_record::
 * restore_deleted_section_media_files → restore_component_media_files + the
 * component_av posterframe override) — the tool_time_machine section-restore
 * touchpoint `engineering/MEDIA_SPEC.md` §8 names.
 *
 * Per quality × extension (and for the posterframe): take the NEWEST version in
 * `deleted/` and move it back to the live path. Older versions STAY — a restore
 * consumes one deletion, not the record's whole deletion history, and PHP's
 * `end(natsort(glob()))` says the same.
 *
 * A quality with nothing in `deleted/` is skipped, exactly as PHP skips it: the
 * file may simply never have existed, and the alternative — failing the restore —
 * would deny the record every file that IS recoverable.
 *
 * It does NOT overwrite a live file. PHP's `rename()` would; but a restore runs
 * AFTER the record's data is already back, and by then an operator may have
 * re-uploaded. Silently replacing the newer file with the pre-delete one is the
 * one outcome nothing can undo, so the live file wins and the deleted version
 * stays where it is, still recoverable by hand.
 */
export async function restoreDeletedSectionMediaFiles(
	sectionTipo: string,
	sectionId: number,
	mediaColumn: Record<string, unknown[]> | null | undefined,
	options: SectionMediaFilesOptions = {},
): Promise<SectionMediaFilesOutcome> {
	return walkSectionMedia(
		sectionTipo,
		sectionId,
		mediaColumn,
		options,
		(spec, identity, pathOpts) => {
			const restored: string[] = [];
			for (const [quality, extension] of managedFileSlots(spec)) {
				const live = buildMediaLocation(spec, identity, quality, extension, pathOpts).absolutePath;
				const versions = listDeletedVersions(spec, identity, quality, extension, pathOpts);
				const target = restoreNewest(versions, live, pathOpts.mediaRoot);
				if (target !== null) restored.push(target);
			}
			const posterframe = posterframeLocation(spec, identity, pathOpts);
			if (posterframe !== null) {
				const { dir, stem, extension } = splitPath(posterframe.absolutePath);
				const target = restoreNewest(
					listDeletedIn(dir, stem, extension),
					posterframe.absolutePath,
					pathOpts.mediaRoot,
				);
				if (target !== null) restored.push(target);
			}
			return restored;
		},
	);
}

/**
 * Move the newest entry of `versions` back to `live`, or null when there is
 * nothing to restore or a live file is already there (see the no-overwrite rule
 * above). Both paths pass the media-root chokepoint.
 */
function restoreNewest(versions: string[], live: string, mediaRoot?: string): string | null {
	const newest = versions[versions.length - 1];
	if (newest === undefined) return null;
	const target = assertInsideMediaRoot(live, mediaRoot);
	if (existsSync(target)) return null;
	const liveDir = dirname(target);
	if (!existsSync(liveDir)) mkdirSync(liveDir, { recursive: true, mode: 0o775 });
	renameSync(assertInsideMediaRoot(newest, mediaRoot), target);
	return target;
}
