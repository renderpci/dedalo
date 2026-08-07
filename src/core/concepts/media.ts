/**
 * MEDIA contract — the ONE typed accessor over the media catalog.
 *
 * Dédalo has five media component models (image, av, pdf, svg, 3d). Each is
 * defined by a TYPE catalog — quality ladder, default/original quality,
 * extensions, thumbnail dims — that PHP holds as `DEDALO_*` config constants
 * (core/base/config/catalog/domains/media_*.php) and this rewrite holds in the
 * env-based config (engineering/MEDIA_SPEC.md §3). This module resolves a model name
 * to its `MediaTypeSpec` and provides the pure predicates the engine relies on
 * (quality validation, pixel-area budget). It hardcodes NOTHING — every value
 * comes from `config.media`; the scattered LIST_QUALITIES/environment literals
 * this replaces were the named §1 defect.
 *
 * PHP references: component_media_common::get_media_components() (:309),
 * sanitize_quality() (:2830, SEC-065), component_image pixel law (:1850-1899).
 */

import { config, type MediaTypeConfig } from '../../config/config.ts';

/** The five media component model names (PHP get_media_components, sorted). */
export type MediaModel =
	| 'component_3d'
	| 'component_av'
	| 'component_image'
	| 'component_pdf'
	| 'component_svg';

/** The type-folder label (first path segment under the media root, no slash). */
export type MediaTypeFolder = 'image' | 'av' | 'pdf' | 'svg' | '3d';

/**
 * The resolved catalog for one media model — everything the path builder,
 * files_info scanner, and processors need. Built from `config.media`.
 */
export interface MediaTypeSpec {
	readonly model: MediaModel;
	/** First path segment under the media root, WITHOUT leading slash ('image', 'av', …). */
	readonly typeFolder: MediaTypeFolder;
	/** The raw config folder value WITH leading slash (DEDALO_*_FOLDER, e.g. '/image') — used verbatim in paths. */
	readonly folder: string;
	/** Full ordered quality ladder, high→low. */
	readonly qualities: readonly string[];
	/** Default web-delivery quality. */
	readonly defaultQuality: string;
	/** Original (source-of-truth) quality — never mutated in place (Original law). */
	readonly originalQuality: string;
	/**
	 * The MASTER tiers: the ones that hold RAW uploads and act as derivative
	 * SOURCES, in PRECEDENCE ORDER, highest first.
	 *
	 * Dédalo's domain has TWO masters for images, not one (v6
	 * component_image::get_image_source / get_normalized_ar_quality, frozen PHP
	 * class.component_image.php:1569 + :296):
	 *  - the ORIGINAL is the camera/scanner shot, stored AS IS, never mutated;
	 *  - the RETOUCHED tier (DEDALO_IMAGE_QUALITY_RETOUCHED, canonically
	 *    'modified') is the HUMAN-RETOUCHED master — colour-corrected, cropped,
	 *    background removed. It is a SECOND MASTER, not a derivative: it is
	 *    stored full-size and losslessly, in whatever format the upload
	 *    allowlist admits (.tif / .psd), and it OUTRANKS the original as the
	 *    source every other tier is built from, for as long as it exists.
	 *
	 * Every other model has one master (its `originalQuality`); no ladder but
	 * the image one has a retouched tier at all.
	 *
	 * Derived from config, never from the literal 'modified': installs rename
	 * these tiers, which is why protection.ts:316 forbids hardcoding them.
	 *
	 * NOT the same idea as `protection.ts masterQualities()`: that is a
	 * cross-model SECURITY set (it also carries the literal names as a belt, so
	 * a renamed tier can never be configured web-public). This is the per-type
	 * PRECEDENCE list the processing layer resolves sources through.
	 */
	readonly masterQualities: readonly string[];
	/** Normalized default extension the type converts to. */
	readonly defaultExtension: string;
	/** Upload allowlist. */
	readonly allowedExtensions: readonly string[];
	/** Extra derivative extensions built alongside the default. */
	readonly alternateExtensions: readonly string[];
	/**
	 * The qualities projected into list-mode reads (replaces the old hardcoded
	 * media_list_value LIST_QUALITIES — now covers av/3d too). Default quality +
	 * thumb where the type has one.
	 */
	readonly listQualities: readonly string[];
	/** Whether this type builds a thumbnail (image/av/pdf/3d yes; svg no). */
	readonly hasThumb: boolean;
}

/** Model → its config block + folder label (the only place the mapping lives). */
const MODEL_TO_TYPE: Readonly<
	Record<MediaModel, { readonly folder: MediaTypeFolder; readonly cfg: () => MediaTypeConfig }>
> = {
	component_image: { folder: 'image', cfg: () => config.media.image },
	component_av: { folder: 'av', cfg: () => config.media.av },
	component_pdf: { folder: 'pdf', cfg: () => config.media.pdf },
	component_svg: { folder: 'svg', cfg: () => config.media.svg },
	component_3d: { folder: '3d', cfg: () => config.media.threeD },
};

/** The thumb quality name from config (shared across types). */
export function thumbQuality(): string {
	return config.media.thumb.quality;
}

/**
 * List qualities per type: the default quality, plus the thumb for the types
 * that have one (image/pdf/3d). svg has no thumb (single 'web'). av lists its
 * default ('404') — historically absent from the TS projection, now covered.
 */
function listQualitiesFor(folder: MediaTypeFolder, cfg: MediaTypeConfig): string[] {
	const thumb = config.media.thumb.quality;
	switch (folder) {
		case 'image':
			return [cfg.defaultQuality, thumb];
		case 'pdf':
			return [cfg.defaultQuality, thumb];
		case '3d':
			return [cfg.defaultQuality, thumb];
		case 'av':
			// PHP component_media_common::get_list_value projects [default_quality,
			// thumb_quality] for EVERY media type, av included — the stored thumb is
			// the posterframe-derived jpg the list view shows (extension filtering
			// keeps the jpg over the mp4 for the thumb row).
			return [cfg.defaultQuality, thumb];
		case 'svg':
			return [cfg.defaultQuality];
	}
}

/**
 * Whether the type exposes a generic 'thumb' quality tier. image/av/pdf/3d do;
 * svg has none. av's thumb is the posterframe-derived jpg written by
 * tool_posterframe into the standard thumb quality dir — PHP
 * component_media_common::get_list_value projects [default, thumb] for av, so
 * the scanner must treat thumb as a real av tier (thumbExtension jpg).
 */
function typeHasThumb(folder: MediaTypeFolder): boolean {
	return folder === 'image' || folder === 'av' || folder === 'pdf' || folder === '3d';
}

/**
 * The master tiers of one type, HIGHEST PRECEDENCE FIRST — see
 * MediaTypeSpec.masterQualities for what a master IS.
 *
 * Only component_image has a second master (the retouched tier), and only when
 * this install actually put it in the ladder: `DEDALO_IMAGE_QUALITY_RETOUCHED`
 * always has a value ('modified' by default), but an install is free to drop
 * that tier from `DEDALO_IMAGE_AR_QUALITY`. A master that is not in the ladder
 * cannot be uploaded into (assertIngestableQuality refuses it) and is never
 * scanned into files_info (files_info.ts appendNormalizedTwin bails on exactly
 * this test), so treating it as a source would resolve files nothing can ever
 * put there.
 */
function masterQualitiesFor(folder: MediaTypeFolder, cfg: MediaTypeConfig): string[] {
	if (folder !== 'image') return [cfg.originalQuality];
	const retouched = config.media.imageQualityRetouched;
	const hasRetouchedTier =
		retouched !== '' && retouched !== cfg.originalQuality && cfg.qualities.includes(retouched);
	return hasRetouchedTier ? [retouched, cfg.originalQuality] : [cfg.originalQuality];
}

const specCache = new Map<MediaModel, MediaTypeSpec>();

/**
 * Resolve a model name to its `MediaTypeSpec`, or null when it is not a media
 * model. Cached (config is frozen at boot). PHP get_media_components membership.
 */
export function mediaTypeOf(model: string): MediaTypeSpec | null {
	const entry = MODEL_TO_TYPE[model as MediaModel];
	if (entry === undefined) return null;
	const cached = specCache.get(model as MediaModel);
	if (cached !== undefined) return cached;
	const cfg = entry.cfg();
	const spec: MediaTypeSpec = Object.freeze({
		model: model as MediaModel,
		typeFolder: entry.folder,
		folder: cfg.folder,
		qualities: cfg.qualities,
		defaultQuality: cfg.defaultQuality,
		originalQuality: cfg.originalQuality,
		masterQualities: Object.freeze(masterQualitiesFor(entry.folder, cfg)),
		defaultExtension: cfg.extension,
		allowedExtensions: cfg.allowedExtensions,
		alternateExtensions: cfg.alternateExtensions,
		listQualities: Object.freeze(listQualitiesFor(entry.folder, cfg)),
		hasThumb: typeHasThumb(entry.folder),
	});
	specCache.set(model as MediaModel, spec);
	return spec;
}

/** Whether `model` is one of the five media models. */
export function isMediaModel(model: string): boolean {
	return model in MODEL_TO_TYPE;
}

/** SEC-065 charset: quality dir names allow only [A-Za-z0-9_\-.]. */
const QUALITY_CHARSET = /^[A-Za-z0-9_\-.]+$/;

/**
 * The transcription-only av derivative quality (16 kHz mono WAV). Off-ladder:
 * built on demand by tool_transcription, never listed by get_files_info. Kept as
 * a named constant so the tool and the quality gate agree on the exact literal.
 */
export const AUDIO_TR_QUALITY = 'audio_tr';

/**
 * Validate a client-or-computed quality string. STRONGER than PHP's
 * sanitize_quality (SEC-065): PHP only checks the charset and silently falls
 * back to the original quality; we require the charset AND membership in the
 * type's ladder, and throw loudly on violation (fail-closed — a bad quality
 * must never reach a filesystem path). Returns the quality unchanged on pass.
 */
export function assertValidQuality(spec: MediaTypeSpec, quality: unknown): string {
	if (typeof quality !== 'string' || quality === '') {
		throw new Error(`Invalid media quality (empty) for ${spec.model}`);
	}
	if (quality === '.' || quality === '..' || !QUALITY_CHARSET.test(quality)) {
		throw new Error(`Invalid media quality '${quality}' for ${spec.model} (charset)`);
	}
	// The thumb tier is a valid quality dir for the types that build one, even
	// though it is appended beyond the base ladder (PHP get_files_info :1347).
	const isThumb = spec.hasThumb && quality === config.media.thumb.quality;
	// audio_tr is the transcription-only 16 kHz mono WAV derivative (PHP
	// tool_transcription build_version('audio_tr')): a real av quality dir that
	// lives OUTSIDE the display ladder (never surfaced by get_files_info).
	const isAudioTr = spec.model === 'component_av' && quality === AUDIO_TR_QUALITY;
	if (!isThumb && !isAudioTr && !spec.qualities.includes(quality)) {
		throw new Error(
			`Unknown media quality '${quality}' for ${spec.model} (not in ladder [${spec.qualities.join(', ')}])`,
		);
	}
	return quality;
}

/**
 * Validate a quality as an INGEST TARGET — stricter than assertValidQuality,
 * and deliberately its neighbour so the two carve-out lists cannot drift.
 *
 * assertValidQuality admits two tiers that are NOT in `spec.qualities`: the
 * thumb tier and `audio_tr`. Both are DERIVED — `scanFilesInfo` walks the thumb
 * tier with the thumb extension ALONE (files_info.ts) and never walks audio_tr
 * at all — so a file uploaded into either is invisible to the record forever,
 * and sync_files cannot repair it (its scan finds nothing to record). PHP placed
 * such a file and lost it silently; we refuse.
 *
 * Any future off-ladder carve-out added above must be considered here too.
 */
export function assertIngestableQuality(spec: MediaTypeSpec, quality: unknown): string {
	const validated = assertValidQuality(spec, quality);
	if (spec.hasThumb && validated === config.media.thumb.quality) {
		throw new Error(
			`Cannot upload into the '${validated}' tier: it is a generated thumbnail, rebuilt from the ${spec.defaultQuality} file`,
		);
	}
	if (validated === AUDIO_TR_QUALITY) {
		throw new Error(
			`Cannot upload into the '${validated}' tier: it is a generated transcription derivative`,
		);
	}
	return validated;
}

/**
 * A DERIVATIVE tier holds NORMALIZED files — one per extension the type builds.
 * An upload into such a tier must therefore carry one of those extensions, or it
 * is SHADOWED: the tier's canonical `<id>.<defaultExtension>` still exists (or
 * gets rebuilt from the old original), the scanner emits it FIRST for that
 * quality, the thumb is regenerated from it, and the record keeps serving the
 * previous image while the upload sits beside it, reported as a success.
 *
 * EVERY MASTER TIER IS EXEMPT (spec.masterQualities), not just the original.
 * A master is not a derivative: nothing regenerates it, so nothing can shadow
 * it — it keeps the raw upload in whatever the allowlist admits, which is the
 * whole point of it. For the ORIGINAL that is the Original law; for the
 * RETOUCHED tier it is the same law for the same reason, because a retouch
 * delivered by a photographer arrives as a .tif or .psd and IS the new master
 * every derived tier is then built from (v6 get_image_source).
 *
 * Refusing a raw extension there was the reported defect: importing with the
 * target quality set to 'modified' failed per file with "Cannot upload a '.tif'
 * file into the 'modified' tier", because the retouched tier was classified as
 * a derivative it never was.
 */
export function assertNormalizedExtensionForTier(
	spec: MediaTypeSpec,
	quality: string,
	extension: string,
): void {
	if (spec.masterQualities.includes(quality)) return;
	const normalized = [spec.defaultExtension, ...spec.alternateExtensions];
	if (!normalized.includes(extension)) {
		const targets = spec.masterQualities.map((value) => `'${value}'`).join(' or ');
		throw new Error(
			`Cannot upload a '.${extension}' file into the '${quality}' tier: it holds normalized ${normalized.map((value) => `.${value}`).join(' / ')} files, so the upload would be shadowed by them. Upload into ${targets} instead.`,
		);
	}
}

/** Validate an extension against the type's upload allowlist. Throws. */
export function assertAllowedExtension(spec: MediaTypeSpec, extension: unknown): string {
	if (typeof extension !== 'string' || extension === '') {
		throw new Error(`Invalid media extension (empty) for ${spec.model}`);
	}
	const normalized = extension.toLowerCase().replace(/^\./, '');
	if (!spec.allowedExtensions.includes(normalized)) {
		throw new Error(`Extension '${extension}' not allowed for ${spec.model}`);
	}
	return normalized;
}

/**
 * Image quality → target pixel-area budget (PHP component_image:1850-1899).
 * MB × 350000 = pixel area; the derivative never upscales past the source.
 * Returns null for unbounded tiers (original/modified) or non-MB quality names.
 *
 * convert_quality_to_megabytes semantics (PHP :576): '1.5MB'→1.5, '>100MB'→101,
 * '<1MB'→0.9, 'thumb'/'original'/'modified'→null.
 */
const PIXELS_PER_MEGABYTE = 350000;

export function qualityToMegabytes(quality: string): number | null {
	const match = quality.match(/^([<>]?)([0-9]+(?:\.[0-9]+)?)MB$/);
	if (match === null) return null;
	const value = Number(match[2]);
	if (!Number.isFinite(value)) return null;
	if (match[1] === '>') return value + 1; // '>100MB' → 101
	if (match[1] === '<') return value - 0.1; // '<1MB' → 0.9
	return value;
}

export function pixelAreaBudget(quality: string): number | null {
	const mb = qualityToMegabytes(quality);
	return mb === null ? null : Math.round(mb * PIXELS_PER_MEGABYTE);
}
