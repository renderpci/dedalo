/**
 * MEDIA PATH BUILDER — the deterministic file/dir grammar (Identity law).
 *
 * A media file's on-disk location is fully computed from its identity and
 * quality; the DB never stores an absolute path (only a media-root-relative
 * one). This module ports the PHP grammar so the TS engine can compute,
 * verify, and regenerate files rather than trusting stored paths.
 *
 * PHP references (core/component_media_common/class.component_media_common.php):
 *   - identifier: get_id (:649-681)  →  {component_tipo}_{section_tipo}_{section_id}[_{lang}]
 *   - dir:        get_media_path_dir (:2859)  →  MEDIA_PATH + folder + initial_media_path + '/' + quality + additional_path
 *   - file:       get_media_filepath (:3356)  →  dir + '/' + id + '.' + extension
 *   - bucket:     get_additional_path (:753-819)  →  '/' + max * floor(section_id / max)
 *
 * EVERY absolute path produced here is confined inside the media root via
 * assertInsideMediaRoot — the one traversal chokepoint (stronger than PHP's
 * scattered realpath calls). Identifier segments run through the tipo gate.
 */

import { resolve, sep } from 'node:path';
import { config } from '../../config/config.ts';
import { type MediaTypeSpec, assertValidQuality, mediaTypeOf } from '../concepts/media.ts';
import { assertValidTipo } from '../search/identifier_gate.ts';

/** A media component instance's identity (the identifier inputs). */
export interface MediaIdentity {
	componentTipo: string;
	sectionTipo: string;
	sectionId: number;
	/** Non-null only for translatable media components (PHP get_id lang suffix :672-674). */
	lang: string | null;
}

/** Path-shaping options resolved from ontology (per-section / per-component properties). */
export interface MediaPathOptions {
	/** Per-section initial media segment WITH leading slash, or '' (PHP get_initial_media_path :715). */
	initialMediaPath: string;
	/** properties.max_items_folder bucket size (usually 1000), or null (PHP get_additional_path :801). */
	maxItemsFolder: number | null;
	/**
	 * A pre-resolved properties.additional_path value (another component's value),
	 * leading slash forced / trailing slash stripped by the caller. Wins over the
	 * max_items_folder bucket, matching PHP (:778 before :801). Usually null.
	 */
	additionalPathOverride?: string | null;
	/**
	 * Media root override — production omits it (config.media.rootPath is used);
	 * write-phase gates pass a scratch root so tests never touch the shared dir
	 * (engineering/MEDIA_SPEC.md §7). When set, confinement is relative to this root.
	 */
	mediaRoot?: string;
}

/** A resolved media file location (all three forms the engine needs). */
export interface MediaLocation {
	/** Media-root-relative directory, leading slash (matches files_info.file_path dirname). */
	relativeDir: string;
	/** Media-root-relative file path, leading slash (the stored files_info.file_path shape). */
	relativePath: string;
	/** Absolute filesystem path, confined inside the media root. */
	absolutePath: string;
}

/**
 * Build the media identifier: `{component_tipo}_{section_tipo}_{section_id}`
 * plus `_{lang}` when the component is translatable (PHP get_id :649-681).
 * Both tipos pass the identifier gate; section_id must be a positive integer.
 */
export function buildMediaIdentifier(identity: MediaIdentity): string {
	const componentTipo = assertValidTipo(identity.componentTipo, 'media identifier component_tipo');
	const sectionTipo = assertValidTipo(identity.sectionTipo, 'media identifier section_tipo');
	if (!Number.isInteger(identity.sectionId) || identity.sectionId <= 0) {
		throw new Error(
			`Invalid media section_id '${identity.sectionId}' (must be a positive integer)`,
		);
	}
	let id = `${componentTipo}_${sectionTipo}_${identity.sectionId}`;
	if (identity.lang !== null && identity.lang !== '') {
		// lang is a controlled 'lg-*' code; the gate lives in the section read layer,
		// here we only guard the charset so it can't inject a path separator.
		if (!/^lg-[a-z0-9_]+$/.test(identity.lang)) {
			throw new Error(`Invalid media identifier lang '${identity.lang}'`);
		}
		id += `_${identity.lang}`;
	}
	return id;
}

/**
 * The numeric bucket sub-path (PHP get_additional_path :801):
 * `'/' + max * floor(section_id / max)`. Returns '' when max is null/≤0.
 * (PHP operator precedence: the multiplication happens before the string concat.)
 */
export function additionalPath(sectionId: number, maxItemsFolder: number | null): string {
	if (maxItemsFolder === null || !Number.isFinite(maxItemsFolder) || maxItemsFolder <= 0) {
		return '';
	}
	const bucket = maxItemsFolder * Math.floor(sectionId / maxItemsFolder);
	return `/${bucket}`;
}

/**
 * Compute a media location for a given quality + extension.
 * Dir = folder + initial_media_path + '/' + quality + additional_path (relative
 * to the media root). File appends '/' + identifier + '.' + extension.
 */
export function buildMediaLocation(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	quality: string,
	extension: string,
	opts: MediaPathOptions,
): MediaLocation {
	const safeQuality = assertValidQuality(spec, quality);
	const identifier = buildMediaIdentifier(identity);
	const cleanExtension = String(extension).replace(/^\./, '');
	if (!/^[A-Za-z0-9]+$/.test(cleanExtension)) {
		throw new Error(`Invalid media extension '${extension}'`);
	}
	const bucket =
		opts.additionalPathOverride != null && opts.additionalPathOverride !== ''
			? opts.additionalPathOverride
			: additionalPath(identity.sectionId, opts.maxItemsFolder);
	// PHP: folder + initial_media_path + '/' + quality + additional_path
	const relativeDir = `${spec.folder}${opts.initialMediaPath}/${safeQuality}${bucket}`;
	const relativePath = `${relativeDir}/${identifier}.${cleanExtension}`;
	const root = requireMediaRoot(opts.mediaRoot);
	const absolutePath = assertInsideMediaRoot(resolve(root, `.${relativePath}`), root);
	return { relativeDir, relativePath, absolutePath };
}

/**
 * The absolute media root: an explicit override (scratch/test) or the configured
 * MEDIA_PATH. Throws when neither is set (production must configure it).
 */
export function requireMediaRoot(override?: string): string {
	const root = override ?? config.media.rootPath;
	if (root === null || root === undefined || root === '') {
		throw new Error('MEDIA_PATH is not configured (config.media.rootPath is null)');
	}
	return resolve(root);
}

/**
 * THE traversal chokepoint: confirm an absolute path resolves INSIDE the media
 * root and return it normalized. Throws on escape. Every filesystem touch in
 * the media subsystem passes through here (stronger than PHP's per-call-site
 * realpath checks — one gate, no bypass). `mediaRoot` overrides the configured
 * root for scratch/test roots.
 */
export function assertInsideMediaRoot(absolutePath: string, mediaRoot?: string): string {
	const root = requireMediaRoot(mediaRoot);
	const normalized = resolve(absolutePath);
	if (normalized !== root && !normalized.startsWith(root + sep)) {
		throw new Error('Media path escapes the media root (traversal blocked)');
	}
	return normalized;
}

/**
 * Turn a media-root-relative path (as stored in files_info.file_path, leading
 * slash) into a confined absolute path. Used by the scanner / file ops when
 * they must touch a stored file.
 */
export function absoluteFromRelative(relativePath: string, mediaRoot?: string): string {
	const root = requireMediaRoot(mediaRoot);
	return assertInsideMediaRoot(resolve(root, `.${relativePath}`), root);
}

// ---------------------------------------------------------------------------
// Subtitles grammar (PHP component_av::get_subtitles_path/:619 get_subtitles_url/:644)
// ---------------------------------------------------------------------------

/**
 * Media-root-relative subtitles path (leading slash):
 * `folder + DEDALO_SUBTITLES_FOLDER + '/' + identifier + '_' + lang + '.' + ext`.
 * PHP defines the subtitles grammar on component_av only, so the folder is the
 * AV media folder regardless of identity.componentTipo's own type. The lang is
 * an EXPLICIT suffix (AV identities carry lang:null — the component is not
 * translatable; the subtitle FILE is per-language). SINGLE SOURCE: the tool
 * writer (tool_transcription build_subtitles_file) and the component emitter
 * (component_emit.ts item.subtitles) both build through here — no drift.
 */
export function subtitlesRelativePath(identity: MediaIdentity, lang: string): string {
	const spec = mediaTypeOf('component_av');
	if (spec === null) throw new Error('component_av media spec is not registered');
	if (!/^lg-[a-z0-9_]+$/.test(lang)) {
		throw new Error(`Invalid subtitles lang '${lang}'`);
	}
	const identifier = buildMediaIdentifier(identity);
	const { subtitlesFolder, subtitlesExtension } = config.media.avExtras;
	return `${spec.folder}${subtitlesFolder}/${identifier}_${lang}.${subtitlesExtension}`;
}

/** Absolute subtitles file path, confined inside the media root (PHP get_subtitles_path). */
export function subtitlesPath(identity: MediaIdentity, lang: string, mediaRoot?: string): string {
	return absoluteFromRelative(subtitlesRelativePath(identity, lang), mediaRoot);
}

/**
 * Public subtitles URL (PHP get_subtitles_url — DEDALO_MEDIA_URL root):
 * `/dedalo/<mediaDir>` + the relative path. Matches the shape the AV player's
 * <track> consumes (component_emit.ts item.subtitles.subtitles_url).
 */
export function subtitlesUrl(identity: MediaIdentity, lang: string): string {
	return `/dedalo/${config.mediaDir}${subtitlesRelativePath(identity, lang)}`;
}
