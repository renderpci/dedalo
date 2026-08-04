/**
 * PROCESS_UPLOADED_FILE — the ingest orchestrator (PHP tool_upload::
 * process_uploaded_file → component process_uploaded_file → regenerate_component).
 *
 * Moves the staged upload into the original tier (add_file), builds the
 * derivatives per type (image/pdf/svg/3d synchronously; av transcode via the job
 * manager), and returns the freshly-scanned files_info. The original is never
 * mutated; derivatives are atomic.
 *
 * ORDERING LAW (2026-08-04): the derivative pass is NON-FATAL and reports
 * through IngestResult.derivativeErrors, because it runs AFTER add_file has
 * irreversibly moved the staged upload. Only the pre-move assertions and the
 * move itself may abort an ingest — see IngestResult.derivativeErrors.
 */

import { existsSync } from 'node:fs';
import {
	assertAllowedExtension,
	assertIngestableQuality,
	assertNormalizedExtensionForTier,
	type MediaTypeSpec,
	mediaTypeOf,
} from '../../concepts/media.ts';
// The av encoder lives in ../av_versions.ts — ONE encoder for ingest and for the
// media-versions tool's per-quality build (see that module's header).
import { submitAvTranscode } from '../av_versions.ts';
import { type FileInfoEntry, scanContextFromItem, scanFilesInfo } from '../files_info.ts';
import { buildMediaLocation } from '../path.ts';
import {
	regenerate3d,
	regenerateImage,
	regeneratePdf,
	regenerateSvg,
	resolveOriginalSource,
} from '../processing.ts';
import { regenerateMissingDerivatives } from '../repair.ts';
import { readStoredMediaItems } from '../tool_support.ts';
import { type AddFileInput, addFile } from './add_file.ts';
import { fireMediaIngestEvent } from './ingest_event.ts';

export interface IngestInput extends Omit<AddFileInput, 'spec'> {
	spec: MediaTypeSpec;
}

/**
 * Whether the target tier is the ORIGINAL one. It selects WHICH regenerate runs,
 * never whether one runs at all:
 *
 * - original tier → the ingest builders, which re-encode UNCONDITIONALLY (a
 *   fresh original should re-encode every derivative from it);
 * - any other tier → `regenerateMissingDerivatives` (v6 regenerate_component
 *   parity): the default quality only when ABSENT — so the file the operator
 *   just placed is never overwritten — the image thumb ALWAYS, rebuilt from the
 *   default-quality file, and the SVG envelope created-or-path-fixed.
 *
 * PHP called regenerate_component either way; skipping it for a non-original
 * tier would leave the thumb showing the PREVIOUS image while the web tier
 * serves the new one, and persist a files_info recording exactly that mismatch.
 */
function isOriginalTier(spec: MediaTypeSpec, quality: string | undefined): boolean {
	return quality === undefined || quality === spec.originalQuality;
}

export interface IngestResult {
	/** The stored original's file name + extension. */
	originalFileName: string;
	extension: string;
	/** Fresh files_info after derivative generation. */
	filesInfo: FileInfoEntry[];
	/**
	 * Derivative-build failures, one message per failing pass. EMPTY on success —
	 * a non-empty array means the ORIGINAL landed and is indexed, but one or more
	 * derived tiers (thumb / web quality / SVG envelope) are missing.
	 *
	 * Why these are NOT thrown (2026-08-04): by the time the derivative pass runs,
	 * `addFile` has already moved the staged upload IRREVERSIBLY into the original
	 * tier. A throw past that point unwinds the caller before it can persist
	 * files_info, so the record ends up created, portal-linked, with the original
	 * on disk and `matrix.media` NULL — the file exists but no record knows it,
	 * the staged source is consumed, and the import cannot be retried. That was
	 * the measured state of records 440866/440867.
	 *
	 * v6 behaved the same way on purpose: component_image::create_thumb returned
	 * false and logged; it never aborted an ingest. The asymmetry is the point —
	 * a missing tier is rebuildable at any time (tool_media_versions, repair.ts,
	 * regenerateMissingDerivatives), a lost index is not.
	 *
	 * Callers MUST surface these (they are real failures, not noise); every
	 * consumer routes them into the channel it already has. See
	 * tools/tool_import_files, tools/tool_upload and src/ai/mcp/tools/media.ts.
	 */
	derivativeErrors: string[];
	/**
	 * For av: START the transcode. DEFERRED on purpose — the job writes its
	 * finished files_info back onto the record, so it must not be racing the
	 * caller's own persist of the ingest-time scan. Call it AFTER that persist
	 * commits and the ordering is an invariant instead of a probability. null for
	 * every other type (and for an av upload that needs no transcode).
	 */
	startTranscode: (() => string) | null;
}

/**
 * Ingest a staged upload for a media component. Synchronous derivative types
 * return complete files_info; av returns a DEFERRED `startTranscode` plus
 * files_info for whatever exists so far (the client polls the job; the job
 * writes the finished index back onto the record itself — see submitAvTranscode,
 * and IngestResult.startTranscode for why the caller starts it).
 *
 * `input.quality` (the client's custom_target_quality / tool_upload's quality)
 * parks the upload in a NON-original tier; the derivative pass then builds only
 * what is missing around it — see isOriginalTier.
 */
export async function processUploadedFile(input: IngestInput): Promise<IngestResult> {
	const { spec, identity, pathOpts } = input;
	// '' is "unset", not a tier: the client sends an empty selector value, and
	// tool_upload / tool_import_files must not disagree about what it means. One
	// normalisation for every entry point.
	const quality = input.quality === undefined || input.quality === '' ? undefined : input.quality;
	// Refuse an impossible target BEFORE the file is moved — a rejected upload
	// must leave the staging dir and the media tree exactly as they were. Both
	// rules live beside assertValidQuality (concepts/media.ts) so their carve-out
	// lists cannot drift from that one's: a DERIVED tier is unscannable, and a
	// non-normalized extension in a derivative tier is shadowed by the tier's
	// canonical file.
	if (quality !== undefined) {
		assertIngestableQuality(spec, quality);
		assertNormalizedExtensionForTier(spec, quality, assertAllowedExtension(spec, input.extension));
	}
	const added = addFile({ ...input, quality });
	const original = isOriginalTier(spec, quality);

	let startTranscode: (() => string) | null = null;
	// NON-FATAL FROM HERE ON. The catch covers EXACTLY the derivative pass, and
	// nothing else: everything above it either runs BEFORE the move
	// (assertIngestableQuality / assertNormalizedExtensionForTier) or IS the move
	// (addFile), and those must stay fatal — a refused upload has to leave the
	// staging dir and the media tree untouched. Everything below it (the
	// files_info scan, the ingest event, the av submit) is what turns the moved
	// file into an INDEXED file, and is precisely what a derivative throw used to
	// skip. See IngestResult.derivativeErrors for the full rationale.
	const derivativeErrors: string[] = [];
	try {
		if (original) {
			switch (spec.model) {
				case 'component_image':
					await regenerateImage(spec, identity, pathOpts, added.extension);
					break;
				case 'component_pdf':
					await regeneratePdf(spec, identity, pathOpts);
					break;
				case 'component_svg':
					await regenerateSvg(spec, identity, pathOpts);
					break;
				case 'component_3d':
					regenerate3d(spec, identity, pathOpts, added.extension);
					break;
				// component_av: submitted LAST, below — see the barrier note there.
			}
		} else {
			// Non-original tier: build only what is MISSING around the file just
			// placed (see isOriginalTier). regenerateMissingDerivatives has no
			// component_av branch — av derivatives are an async transcode — so the av
			// case is handled with the submit below.
			await regenerateMissingDerivatives(spec.model, spec, identity, pathOpts, {
				rawExtension: added.extension,
				deleteNormalized: false,
				bulkProcessId: null,
			});
		}
	} catch (error) {
		// Never swallowed: logged here for the operator's server log AND returned
		// so the calling tool can put it in front of the user (the scan below
		// records which tiers actually exist, so the record stays honest about it).
		const message = (error as Error).message;
		derivativeErrors.push(message);
		console.warn(
			`[process_uploaded_file] derivative build failed for ${spec.model} ${identity.componentTipo}_${identity.sectionTipo}_${identity.sectionId}: ${message}`,
		);
	}

	// The stored cues (external_source, the original/modified normalized-name
	// twins) still describe this component — a non-original upload does not
	// invalidate them, and dropping them loses the raw-original twin from the
	// index. Only the ORIGINAL tier's own cue is replaced, by what was just
	// stored; scanContextFromItem is the one reader of the other two.
	const storedCues = scanContextFromItem(
		original
			? undefined
			: ((await readStoredMediaItems(
					identity.sectionTipo,
					identity.sectionId,
					identity.componentTipo,
				).then((items) => items.find((entry) => (entry.lang ?? null) === identity.lang))) ??
					undefined),
	);
	const filesInfo = scanFilesInfo(spec, identity, pathOpts, {
		...storedCues,
		...(original
			? {
					originalNormalizedName: `${identity.componentTipo}_${identity.sectionTipo}_${identity.sectionId}.${added.extension}`,
				}
			: {}),
	});

	// The single chokepoint every upload route passes through (tool_upload, the
	// batch importer, the MCP media tool), so one notification covers them all.
	// Fired AFTER the derivatives exist, because a listener's whole job is to
	// read them. Best-effort by construction — see ingest_event.ts.
	//
	// For av the transcode has not even been submitted yet (only the original is
	// on disk); a listener that needs the derivatives must poll `jobId`.
	await fireMediaIngestEvent({
		componentTipo: identity.componentTipo,
		sectionTipo: identity.sectionTipo,
		sectionId: identity.sectionId,
		model: spec.model,
	});

	// The transcode is handed back UNSTARTED. It writes its finished files_info
	// onto the record, and the caller writes the ingest-time scan onto the same
	// jsonb key moments from now — whichever lands second wins the whole key, so
	// "the encode is slower than a DB round-trip" is not good enough. The caller
	// starts it after its own persist commits.
	//
	// A NON-original av upload transcodes too — the build-only-what-is-missing
	// rule the other types get from regenerateMissingDerivatives, which has no av
	// branch (PHP ran regenerate_component for an av upload into any tier). Two
	// conditions, both load-bearing: the default tier must be ABSENT (never
	// re-encode over a derivative that exists), and an ORIGINAL must be on this
	// box — a transcode derives from the original, so without one the job would
	// only fail with 'AV original not found'. A file parked in a quality tier IS
	// that tier; nothing derives FROM it.
	if (spec.model === 'component_av') {
		const defaultFile = buildMediaLocation(
			spec,
			identity,
			spec.defaultQuality,
			spec.defaultExtension,
			pathOpts,
		).absolutePath;
		const canDerive =
			original || resolveOriginalSource(spec, identity, pathOpts, added.extension) !== null;
		if (canDerive && (original || !existsSync(defaultFile))) {
			startTranscode = (): string => submitAvTranscode(spec, identity, pathOpts, added.extension);
		}
	}

	return {
		originalFileName: added.fileName,
		extension: added.extension,
		filesInfo,
		derivativeErrors,
		startTranscode,
	};
}

/** Resolve a media spec from a model name (convenience for callers). */
export function requireMediaSpec(model: string): MediaTypeSpec {
	const spec = mediaTypeOf(model);
	if (spec === null) throw new Error(`Not a media model: ${model}`);
	return spec;
}
