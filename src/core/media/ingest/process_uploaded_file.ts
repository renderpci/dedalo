/**
 * PROCESS_UPLOADED_FILE — the ingest orchestrator (PHP tool_upload::
 * process_uploaded_file → component process_uploaded_file → regenerate_component).
 *
 * Moves the staged upload into the original tier (add_file), builds the
 * derivatives per type (image/pdf/svg/3d synchronously; av transcode via the job
 * manager), and returns the freshly-scanned files_info. The original is never
 * mutated; derivatives are atomic.
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import {
	assertAllowedExtension,
	assertIngestableQuality,
	assertNormalizedExtensionForTier,
	type MediaTypeSpec,
	mediaTypeOf,
} from '../../concepts/media.ts';
import {
	extractAudio,
	getAudioCodec,
	probeStreams,
	standardFromFps,
	transcodeTwoPass,
} from '../engine/ffmpeg.ts';
import { getFfmpegProfile, settingName } from '../engine/ffmpeg_profiles.ts';
import { type FileInfoEntry, scanContextFromItem, scanFilesInfo } from '../files_info.ts';
import { mediaJobs } from '../jobs.ts';
import { buildMediaLocation, type MediaIdentity, type MediaPathOptions } from '../path.ts';
import {
	regenerate3d,
	regenerateImage,
	regeneratePdf,
	regenerateSvg,
	resolveOriginalSource,
} from '../processing.ts';
import { regenerateMissingDerivatives } from '../repair.ts';
import { readStoredMediaItems } from '../tool_support.ts';
import { reconcileStoredFilesInfo } from '../tools/files_info_persist.ts';
import { type AddFileInput, addFile } from './add_file.ts';
import { fireMediaIngestEvent } from './ingest_event.ts';

/** Ensure the parent dir of an output file exists (mirrors processing.ts ensureDir). */
function ensureMediaDir(absolutePath: string): void {
	const dir = dirname(absolutePath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o775 });
}

/** Best-effort removal of ffmpeg's two-pass stats scratch (`${passLog}-0.log` + .mbtree). */
function removePassLog(passLog: string): void {
	for (const suffix of ['-0.log', '-0.log.mbtree']) {
		rmSync(`${passLog}${suffix}`, { force: true });
	}
}

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
		startTranscode,
	};
}

/**
 * Write the finished transcode's files_info back onto the record.
 *
 * A transcode ends long after the request that started it returned, so the
 * caller's own persist could only record the ORIGINAL — the derivatives it
 * produced (the default quality, the extracted audio) never reached the matrix,
 * and unlike a read-time-rescanned emit, everything that consumes the STORED
 * index (diffusion, publication, export, tool_media_versions) kept seeing an
 * av record that owned nothing but its source file.
 *
 * The stored items are RE-READ under the row lock inside
 * `reconcileStoredFilesInfo`, never closed over: the request's snapshot is long
 * stale, and both the caller's own persist and a concurrent save can commit on
 * this key while ffmpeg runs. Only the ONE cue the scan needs — the stored
 * normalized names / external source — is read (unlocked) beforehand; a stale
 * cue at worst costs an index entry, it cannot revert someone's write.
 *
 * No stored item ⇒ the reconcile no-ops (it never mints — the passive-scan rule:
 * a transcode must not create a stored value for a component that has none; the
 * operator's explicit sync_files repair is the one path that may). That decision
 * is left to the reconcile, INSIDE the lock — an unlocked pre-check here could
 * read "no item" a moment before the caller's own persist created one, and skip
 * the write-back this whole path exists for.
 */
async function persistTranscodedFilesInfo(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
): Promise<void> {
	const items = await readStoredMediaItems(
		identity.sectionTipo,
		identity.sectionId,
		identity.componentTipo,
	);
	const item = items.find((entry) => (entry.lang ?? null) === identity.lang) ?? items[0];
	const filesInfo = scanFilesInfo(spec, identity, pathOpts, scanContextFromItem(item));
	await reconcileStoredFilesInfo({
		sectionTipo: identity.sectionTipo,
		sectionId: identity.sectionId,
		componentTipo: identity.componentTipo,
		lang: identity.lang,
		freshFilesInfo: filesInfo,
	});
}

/**
 * Submit the AV transcode to the job manager (PHP async build_version). Builds
 * the default quality (two-pass) and the audio quality, then records the result
 * on the record (persistTranscodedFilesInfo); returns the job id.
 */
export function submitAvTranscode(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	rawExtension: string,
): string {
	const record = mediaJobs.submit('av_transcode', async ({ onProgress }) => {
		const source = resolveOriginalSource(spec, identity, pathOpts, rawExtension);
		if (source === null) throw new Error('AV original not found for transcode');
		const created: string[] = [];

		// Determine standard/aspect from the source streams.
		const probe = await probeStreams(source);
		const video = probe?.streams?.find((s) => s.codec_type === 'video');
		const hasAudioStream = probe?.streams?.some((s) => s.codec_type === 'audio') ?? false;
		const standard = standardFromFps(video?.avg_frame_rate);
		const aspect = pickAspect(video?.width, video?.height);

		// Default quality (e.g. '404') via the matching two-pass profile.
		const profileName = settingName(spec.defaultQuality, standard, aspect);
		if (getFfmpegProfile(profileName) !== null) {
			const target = buildMediaLocation(
				spec,
				identity,
				spec.defaultQuality,
				spec.defaultExtension,
				pathOpts,
			).absolutePath;
			// The quality tier's directory (e.g. av/404/<bucket>/) does not exist yet
			// — only the original tier was created by addFile. ffmpeg pass 1 writes
			// its two-pass stats file (passLog) into this dir, so without the mkdir
			// it dies with "ratecontrol_init: can't open stats file" and NO derivative
			// is ever produced (client then finds no default-quality file → no video).
			ensureMediaDir(target);
			const temp = `${target}.tmp.${process.pid}`;
			const passLog = `${target}.passlog`;
			await transcodeTwoPass(profileName, source, temp, passLog);
			await import('node:fs').then((fs) => fs.renameSync(temp, target));
			// ffmpeg writes two-pass stats as `${passLog}-0.log` (+ .mbtree). Remove
			// them so they don't litter the quality dir (and get mistaken for media).
			removePassLog(passLog);
			created.push(target);
			onProgress(70);
		}

		// Audio quality (single-pass extraction) — ONLY when the source actually
		// carries an audio stream. A silent/video-only source (common for screen
		// captures and muxed clips) makes ffmpeg emit "Output file does not contain
		// any stream" and exit non-zero; letting that throw would fail the WHOLE
		// transcode job even though the video derivative was already built, so the
		// client sees a failed job and never plays the (existing) video.
		if (spec.qualities.includes('audio') && hasAudioStream) {
			const audioTarget = buildMediaLocation(
				spec,
				identity,
				'audio',
				spec.defaultExtension,
				pathOpts,
			).absolutePath;
			// Same as above: the audio tier's directory must exist before extraction.
			ensureMediaDir(audioTarget);
			await getAudioCodec();
			await extractAudio(source, audioTarget, 'audio');
			created.push(audioTarget);
		}

		// Record what was built. A failure here does NOT fail the job: the
		// derivatives really are on disk, and reporting the transcode as errored
		// would send the client back to a re-transcode it does not need. It is
		// still loud (console.error + a `persist_error` in the payload) because a
		// record that does not know its own files is exactly the bug this fixes.
		let persistError: string | null = null;
		try {
			await persistTranscodedFilesInfo(spec, identity, pathOpts);
		} catch (error) {
			persistError = (error as Error).message;
			console.error(
				`[media jobs] av_transcode ${identity.sectionTipo}/${identity.sectionId}/${identity.componentTipo}: files_info write-back failed: ${persistError}`,
			);
		}
		onProgress(100);
		return { created, persist_error: persistError };
	});
	return record.id;
}

/** 16x9 vs 4x3 from dimensions (PHP get_aspect_ratio). */
function pickAspect(width?: number, height?: number): '16x9' | '4x3' | null {
	if (!width || !height) return null;
	const ratio = width / height;
	return ratio > 1.5 ? '16x9' : '4x3';
}

/** Resolve a media spec from a model name (convenience for callers). */
export function requireMediaSpec(model: string): MediaTypeSpec {
	const spec = mediaTypeOf(model);
	if (spec === null) throw new Error(`Not a media model: ${model}`);
	return spec;
}
