/**
 * Posterframe core (PHP tool_posterframe::create_identifying_image media half).
 * Given a resolved AV source context and a resolved target IMAGE context, extract
 * a frame at `timecode` from the AV original into the image's ORIGINAL-quality
 * path, then regenerate the image derivatives from it (PHP: Ffmpeg::
 * create_posterframe → component_image->process_uploaded_file).
 *
 * The DB half — creating the portal target record that hosts the image — is the
 * tool module's job; this core is filesystem-only so it can be gated with a real
 * ffmpeg binary against a scratch tree.
 */

import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import {
	CLIENT_POSTERFRAME_REMEDY,
	hasPosterframe,
	type MediaTypeSpec,
	POSTERFRAME_WRITER_BY_MODEL,
} from '../../concepts/media.ts';
import { DedaloError } from '../../errors/dedalo_error.ts';
import { writeAtomically } from '../atomic.ts';
import { createPosterframe, probeFormat, probeStreams } from '../engine/ffmpeg.ts';
import { moveToDeleted } from '../file_ops.ts';
import { type FileInfoEntry, scanFilesInfo } from '../files_info.ts';
import { sanitizeSegment, stagingDir } from '../ingest/add_file.ts';
import {
	buildMediaIdentifier,
	buildMediaLocation,
	buildMediaSegmentLocation,
	type MediaIdentity,
	type MediaPathOptions,
	type MediaSegment,
	posterframeLocation,
} from '../path.ts';
import {
	buildThumbVersion,
	noteOutrankingMaster,
	regenerateImage,
	resolveMasterSource,
} from '../processing.ts';

/** A resolved media component context (spec + identity + path options). */
export interface MediaContext {
	spec: MediaTypeSpec;
	identity: MediaIdentity;
	pathOpts: MediaPathOptions;
}

export interface PosterframeResult {
	/** true when a frame was extracted (false when the AV had no video stream). */
	created: boolean;
	/** The image original path written (when created). */
	posterframePath: string | null;
	/** The image component's files_info after regeneration. */
	filesInfo: FileInfoEntry[];
}

/**
 * Build the identifying image from an AV frame. Resolves the AV original (with
 * the PHP default-quality fallback), sizes the frame to the source video, writes
 * it to the image original path, and regenerates the image derivatives.
 */
export async function createIdentifyingImageCore(
	av: MediaContext,
	image: MediaContext,
	timecode: string,
): Promise<PosterframeResult> {
	if (av.spec.model !== 'component_av') throw notAvSource();
	if (image.spec.model !== 'component_image') {
		throw new DedaloError('media.unsupported_operation', {
			message: 'posterframe target must be component_image',
			publicMessage: 'posterframe target must be component_image',
		});
	}

	// AV source: original quality, else default quality (PHP fallback when the
	// original file is absent).
	let source = resolveMasterSource(av.spec, av.identity, av.pathOpts);
	if (source === null) {
		for (const ext of [av.spec.defaultExtension, ...av.spec.allowedExtensions]) {
			const loc = buildMediaLocation(
				av.spec,
				av.identity,
				av.spec.defaultQuality,
				ext,
				av.pathOpts,
			);
			if (existsSync(loc.absolutePath)) {
				source = loc.absolutePath;
				break;
			}
		}
	}
	if (source === null) {
		throw new DedaloError('media.file_not_found', {
			message: 'AV source file not found',
			publicMessage: 'AV source file not found',
		});
	}

	// Frame size = the source video dimensions (PHP derived it internally).
	const probe = await probeStreams(source);
	const video = probe?.streams?.find((s) => s.codec_type === 'video');
	if (video?.width == null || video?.height == null) {
		return { created: false, posterframePath: null, filesInfo: [] };
	}

	const target = buildMediaLocation(
		image.spec,
		image.identity,
		image.spec.originalQuality,
		image.spec.defaultExtension,
		image.pathOpts,
	).absolutePath;
	mkdirSync(dirname(target), { recursive: true, mode: 0o775 });

	const created = await createPosterframe(source, timecode, target, {
		width: Number(video.width),
		height: Number(video.height),
	});
	if (!created) return { created: false, posterframePath: null, filesInfo: [] };

	// Regenerate the image derivatives from the freshly written original.
	//
	// "From the original" is not guaranteed: if the poster's image component
	// carries a RETOUCHED master (an operator colour-corrected an earlier
	// posterframe — exactly what that tier is for), it outranks the frame just
	// written and every derived tier is rebuilt from it, so picking a new
	// timecode changes nothing visible. That is the same settled precedence the
	// ingest path follows, applied to the other entry point that writes a
	// master — so it gets the same notice rather than happening in silence.
	noteOutrankingMaster(
		image.spec,
		image.identity,
		image.pathOpts,
		image.spec.originalQuality,
		'wrote a new posterframe',
	);
	await regenerateImage(image.spec, image.identity, image.pathOpts, image.spec.defaultExtension);
	const filesInfo = scanFilesInfo(image.spec, image.identity, image.pathOpts, {
		originalNormalizedName: `${image.identity.componentTipo}_${image.identity.sectionTipo}_${image.identity.sectionId}.${image.spec.defaultExtension}`,
	});
	return { created: true, posterframePath: target, filesInfo };
}

/**
 * The component's OWN posterframe file path (av + 3d), via the ONE grammar
 * producer (`path.ts buildMediaSegmentLocation`). The posterframe lives in a
 * dedicated `posterframe` sub-folder — a sibling of the quality folders, NOT a
 * quality — which is why it needs the segment builder rather than
 * `buildMediaLocation`. Kept as a named helper because it is the file every
 * posterframe caller means. PHP: component_av::get_posterframe_filepath.
 */
export function posterframeAbsolutePath(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
): string {
	const location = posterframeLocation(spec, identity, pathOpts);
	if (location === null) {
		throw new DedaloError('media.unsupported_operation', {
			message: `${spec.model} has no posterframe`,
			publicMessage: `${spec.model} has no posterframe`,
		});
	}
	return location.absolutePath;
}

/**
 * Build the thumb of a POSTERFRAME MODEL from its posterframe — av AND 3d
 * (PHP component_{av,3d}::create_thumb → ImageMagick::dd_thumb(posterframe →
 * {type}/thumb/id.jpg)).
 *
 * IT IS A THIN ALIAS OF THE SHARED HANDLER (`thumb.ts rebuildThumb`) and exists
 * only for the callers that have just WRITTEN a posterframe and want the thumb put
 * back in step with it. The source resolution, the av self-heal and the refusal
 * text all live in the handler — this must never grow a second copy of them.
 */
export async function buildThumbFromPosterframe(ctx: MediaContext): Promise<string> {
	assertPosterframeModel(ctx.spec);
	const { rebuildThumb } = await import('../thumb.ts');
	const outcome = await rebuildThumb(ctx);
	if (outcome.built === null) {
		throw new Error(`build thumb: nothing built for ${buildMediaIdentifier(ctx.identity)}`);
	}
	return outcome.built;
}

/**
 * Write the component's thumb tier from one image file.
 *
 * `source` is a PARAMETER, not re-derived from the identity, because the caller
 * that binds a client-uploaded posterframe knows the extension the BROWSER sent,
 * which need not be the configured posterframe extension.
 *
 * The target path and the recipe are NOT decided here: it delegates to
 * `buildThumbVersion`, the same writer image/pdf/svg go through, so the av/3d
 * thumb lands at the gated `buildMediaLocation` path like every other thumb. It
 * used to write through a private, ungated path helper — one file written by one
 * grammar and read back (files_info) by another.
 */
async function writeThumbFrom(ctx: MediaContext, source: string): Promise<string> {
	return buildThumbVersion(ctx.spec, ctx.identity, source, ctx.pathOpts);
}

/**
 * Create the AV component's own posterframe (PHP component_av::create_posterframe).
 * Resolves the AV source (original quality, else default quality — PHP fallback),
 * extracts a frame at `timecode` sized to the source video, writes it to the
 * posterframe folder, then regenerates the AV thumb FROM the posterframe (PHP
 * calls create_thumb() afterward so the two stay in sync).
 *
 * Returns false — never throws — when there is no usable source file or the
 * source carries no video stream (audio-only). The handler turns that into the
 * `ok:false` outcome the client renders (PHP fed it a plain false result).
 */
export async function createAvPosterframe(av: MediaContext, timecode: string): Promise<boolean> {
	if (av.spec.model !== 'component_av') throw notAvSource();

	// AV source: original quality, else default quality (PHP fallback when the
	// original file is absent).
	let source = resolveMasterSource(av.spec, av.identity, av.pathOpts);
	if (source === null) {
		for (const ext of [av.spec.defaultExtension, ...av.spec.allowedExtensions]) {
			const loc = buildMediaLocation(
				av.spec,
				av.identity,
				av.spec.defaultQuality,
				ext,
				av.pathOpts,
			);
			if (existsSync(loc.absolutePath)) {
				source = loc.absolutePath;
				break;
			}
		}
	}
	if (source === null) return false;

	// Frame size = the source video dimensions; no video stream ⇒ nothing to do.
	const probe = await probeStreams(source);
	const video = probe?.streams?.find((s) => s.codec_type === 'video');
	if (video?.width == null || video?.height == null) return false;

	const target = posterframeAbsolutePath(av.spec, av.identity, av.pathOpts);

	// ATOMIC, like every other derivative (atomic.ts): ffmpeg used to write
	// straight to the final path, so a reader could serve a half-written JPEG and a
	// failed run left the debris behind. The posterframe is served directly to the
	// client as `posterframe_url` — it is the one derivative a browser fetches by
	// name without going through files_info — so a partial file there is visible.
	let created = false;
	await writeAtomically(target, async (temp) => {
		created = await createPosterframe(source as string, timecode, temp, {
			width: Number(video.width),
			height: Number(video.height),
		});
		if (!created) {
			// Nothing to rename into place; the temp is swept by writeAtomically.
			throw new PosterframeNotCreated();
		}
	}).catch((error) => {
		if (error instanceof PosterframeNotCreated) return '';
		throw error;
	});
	if (!created) return false;

	// Regenerate the thumb FROM the freshly written posterframe (PHP create_thumb:
	// ImageMagick::dd_thumb(posterframe → av/thumb/id.jpg)). Best-effort, mirroring
	// PHP where create_thumb's result does not gate create_posterframe's return.
	//
	// The LOW-LEVEL writer, deliberately: this function has just written the
	// posterframe, so it knows the source and has nothing to resolve. Going through
	// `rebuildThumb` here would also re-enter the mint path it may have been called
	// FROM (rebuildThumb → mintPosterframe → here), building the same thumb twice.
	try {
		await writeThumbFrom(av, target);
	} catch (error) {
		// posterframe already written; a thumb failure must not fail the operation —
		// but it is logged, not silent (same rule as moveUploadedToMediaDir below).
		console.warn(
			`[posterframe] thumb not built for ${buildMediaIdentifier(av.identity)}: ${(error as Error).message}`,
		);
	}
	return true;
}

/**
 * The frame an auto-minted av posterframe is taken at, in seconds.
 *
 * PHP `component_av::create_thumb` (frozen class.component_av.php:581) used the
 * literal 10.00 — mirrored here, like the pdf thumb's density/quality literals.
 * Its own doc block flags the flaw ("may produce a black frame for very short
 * clips"), and `mintPosterframe` fixes exactly that by clamping to the middle of
 * anything shorter: a still nobody can see is not a thumbnail.
 */
const AV_AUTO_POSTERFRAME_SECONDS = 10;

/**
 * Internal signal: ffmpeg reported "no frame" — not an error, just nothing to
 * rename. It is thrown and caught INSIDE `createAvPosterframe` and never
 * escapes, but it is a `DedaloError` subclass with a fixed code all the same
 * (ERRORS_SPEC §4): if a refactor ever lets it out, it converts like everything
 * else instead of reaching the wire as an untyped exception. The
 * `instanceof PosterframeNotCreated` catch site is unchanged.
 */
class PosterframeNotCreated extends DedaloError {
	constructor() {
		super('media.action_failed', { message: 'posterframe: ffmpeg produced no frame' });
		this.name = 'PosterframeNotCreated';
	}
}

/** The "this is not an av component" refusal, shared by the three posterframe entry points. */
function notAvSource(message = 'posterframe source must be component_av'): DedaloError {
	return new DedaloError('media.unsupported_operation', {
		message,
		publicMessage: message,
	});
}

/**
 * MINT a posterframe the engine is able to produce by itself — the av self-heal,
 * and the reason an av thumb never waits for an operator (PHP did the same, at a
 * fixed t=10, inside create_thumb).
 *
 * Called by `thumb.ts rebuildThumb` when the census says the model's posterframe
 * writer is `server_frame_extract` and none is on disk. Throws when the frame
 * cannot be produced (no source, audio-only) — the caller turns that into the
 * operator-facing refusal, so the reason survives.
 *
 * THE TIMECODE IS CLAMPED to the clip: `min(10s, duration/2)`. A 4-second
 * interview clip probed at t=10 yields ffmpeg's last-frame-or-nothing, which is
 * how records ended up with a black posterframe that looked like a broken file.
 */
export async function mintPosterframe(ctx: MediaContext): Promise<string> {
	const writer = POSTERFRAME_WRITER_BY_MODEL[ctx.spec.model];
	if (writer !== 'server_frame_extract') {
		// PUBLIC: the model name and the remedy table are engine data; the remedy
		// IS the operator's next move, so it must reach them.
		const reason = `${ctx.spec.model} posterframes cannot be minted by this engine — ${CLIENT_POSTERFRAME_REMEDY[ctx.spec.model] ?? 'create it first'}`;
		throw new DedaloError('media.unsupported_operation', {
			message: reason,
			publicMessage: reason,
		});
	}
	const source = resolveAvSource(ctx);
	if (source === null) {
		throw new DedaloError('media.file_not_found', {
			message: `no ${ctx.spec.model} source file to extract a posterframe from (${buildMediaIdentifier(ctx.identity)})`,
			publicMessage: `no ${ctx.spec.model} source file to extract a posterframe from`,
		});
	}
	const format = (await probeFormat(source)) as { format?: { duration?: unknown } } | null;
	const duration = Number(format?.format?.duration ?? 0);
	const seconds =
		Number.isFinite(duration) && duration > 0
			? Math.min(AV_AUTO_POSTERFRAME_SECONDS, duration / 2)
			: AV_AUTO_POSTERFRAME_SECONDS;
	const created = await createAvPosterframe(ctx, seconds.toFixed(3));
	if (!created) {
		throw new DedaloError('media.unsupported_operation', {
			message: `no video frame to build a posterframe from (${buildMediaIdentifier(ctx.identity)} — an audio-only source has no picture)`,
			publicMessage:
				'no video frame to build a posterframe from — an audio-only source has no picture',
		});
	}
	return posterframeAbsolutePath(ctx.spec, ctx.identity, ctx.pathOpts);
}

/**
 * The av file a posterframe is extracted from: the master, else the delivered
 * default-quality file across the type's extensions (PHP's fallback when the
 * original is not on this box). Extracted from createAvPosterframe so the mint
 * path and the explicit-timecode path resolve it identically.
 */
function resolveAvSource(ctx: MediaContext): string | null {
	const master = resolveMasterSource(ctx.spec, ctx.identity, ctx.pathOpts);
	if (master !== null) return master;
	for (const ext of [ctx.spec.defaultExtension, ...ctx.spec.allowedExtensions]) {
		const loc = buildMediaLocation(
			ctx.spec,
			ctx.identity,
			ctx.spec.defaultQuality,
			ext,
			ctx.pathOpts,
		);
		if (existsSync(loc.absolutePath)) return loc.absolutePath;
	}
	return null;
}

/**
 * Media models that carry a posterframe (PHP tool_posterframe ar_allowed). The
 * census itself lives in concepts/media.ts POSTERFRAME_MODELS — the thumb builder
 * branches on the same set, and two hand-written model lists would be one edit
 * away from disagreeing about which models have a posterframe at all.
 */
function assertPosterframeModel(spec: MediaTypeSpec): void {
	if (!hasPosterframe(spec.model)) {
		throw new DedaloError('media.unsupported_operation', {
			message: 'posterframe target must be component_av or component_3d',
			publicMessage: 'posterframe target must be component_av or component_3d',
		});
	}
}

export interface DeletePosterframeResult {
	/** true when a posterframe was really removed (false = there was none). */
	ok: boolean;
	/** The thumb retired with it, or null (see below). */
	retiredThumb: string | null;
	/** The thumb rebuilt from a freshly minted replacement (av), or null. */
	rebuiltThumb: string | null;
}

/**
 * Delete a component's own posterframe (PHP component_{av,3d}::delete_posterframe)
 * AND put the thumb back in step with it — the two are one operation, because the
 * thumb IS a picture of the posterframe (THUMB_SOURCE_BY_MODEL).
 *
 * WHAT THIS FIXES. The delete used to remove the posterframe alone. The thumb
 * stayed on disk and in files_info, so every list view kept serving a picture of a
 * file the operator had just deleted, reported as present and current — measured
 * on both the av and the 3d handler. The engine's own doctrine already says this
 * out loud for alternate twins ("no twin without its companion", versions.ts
 * retireOrphanTwins); a thumb without its posterframe is the same wrong, one
 * derivative up.
 *
 * IT IS A MOVE, NOT AN UNLINK, for the posterframe too. PHP unlinked it, and that
 * made it the ONE file in the media subsystem that left without going to
 * `deleted/` (the No-hard-delete law, file_ops.ts). The parity was not worth a
 * law exception: an operator who deletes the wrong posterframe of an irreplaceable
 * recording should be one move away from it, not one restore-from-backup away.
 *
 * FOR AV THE THUMB IS REBUILT, not just retired: the engine can mint a replacement
 * posterframe from the video itself, so "delete the posterframe" means "drop this
 * frame choice", not "leave this record pictureless". For 3d there is nothing to
 * mint from, so the thumb is retired and the record honestly shows its placeholder
 * until someone captures a new scene.
 */
export async function deletePosterframe(ctx: MediaContext): Promise<DeletePosterframeResult> {
	assertPosterframeModel(ctx.spec);
	const target = posterframeAbsolutePath(ctx.spec, ctx.identity, ctx.pathOpts);
	if (!existsSync(target)) {
		return { ok: false, retiredThumb: null, rebuiltThumb: null };
	}
	moveToDeleted(target, { mediaRoot: ctx.pathOpts.mediaRoot });

	const { rebuildThumb, retireThumb } = await import('../thumb.ts');
	// Retire FIRST: whatever happens next, the thumb that depicted the deleted
	// posterframe must not survive this call.
	const retiredThumb = retireThumb(ctx);
	if (POSTERFRAME_WRITER_BY_MODEL[ctx.spec.model] !== 'server_frame_extract') {
		return { ok: true, retiredThumb, rebuiltThumb: null };
	}
	try {
		const outcome = await rebuildThumb(ctx);
		return { ok: true, retiredThumb, rebuiltThumb: outcome.built };
	} catch (error) {
		// An audio-only av, or a box with no source file: the delete stands, the
		// record is honestly thumb-less, and the reason is said out loud.
		console.warn(
			`[posterframe] ${buildMediaIdentifier(ctx.identity)}: posterframe deleted, no replacement minted: ${(error as Error).message}`,
		);
		return { ok: true, retiredThumb, rebuiltThumb: null };
	}
}

/** The extension of a client-supplied file name, lower-cased and charset-gated. */
function uploadedExtension(fileName: string): string {
	const dot = fileName.lastIndexOf('.');
	const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
	if (!/^[a-z0-9]+$/.test(ext)) {
		throw new DedaloError('media.invalid_extension', {
			message: `invalid uploaded file extension in '${fileName}'`,
		});
	}
	return ext;
}

/**
 * Move a staged upload into a component media sub-folder (PHP
 * dd_component_3d_api::move_file_to_dir). The 3D posterframe is a client-rendered
 * canvas snapshot: the browser uploads it to the staging tree, then this binds it
 * to the record. The source is REBUILT from the allowlisted staging root + user id
 * + sanitized key_dir/tmp_name (never a client path); the target file name is the
 * media identifier (not the client stem) at the uploaded extension. When the
 * target is `posterframe` the thumb is regenerated from it (PHP create_thumb),
 * best-effort. Returns false when the staged source is missing.
 */
export async function moveUploadedToMediaDir(input: {
	ctx: MediaContext;
	userId: number;
	keyDir: string;
	tmpName: string;
	fileName: string;
	targetDir: string;
}): Promise<boolean> {
	const { ctx, userId, keyDir, tmpName, fileName, targetDir } = input;
	assertPosterframeModel(ctx.spec);
	const segment = sanitizeSegment(targetDir);

	// Source: rebuilt from the staging allowlist (SEC-063), confined, must exist.
	const dir = stagingDir(userId, keyDir, ctx.pathOpts.mediaRoot);
	const source = resolve(dir, sanitizeSegment(tmpName));
	if (source !== dir && !source.startsWith(dir + sep)) {
		throw new DedaloError('media.invalid_path', {
			message: 'staged source escapes the staging dir',
			coordinates: { source },
		});
	}
	if (!existsSync(source) || !statSync(source).isFile()) return false;

	// Target: the SEGMENT builder, which is an allowlist (path.ts MEDIA_SEGMENTS) —
	// the identifier name (PHP file_data.name is the identifier; we recompute it,
	// never trusting the client stem) at the uploaded extension.
	//
	// THE ALLOWLIST IS THE POINT. `target_dir` arrives from the client and used to be
	// only charset-sanitized, so a caller with section-write could bind a staged file
	// into ANY folder of the grammar — 'original', 'web', 'thumb' — at any
	// `[a-z0-9]+` extension, walking straight past `assertIngestableQuality`,
	// `assertNormalizedExtensionForTier` and the upload allowlist every other upload
	// passes. A file parked in a master tier is resolvable AS THE MASTER
	// (resolveMasterSource walks allowedExtensions), so that is a write into the
	// archival record through the posterframe door. Only declared segments now.
	const target = buildMediaSegmentLocation(
		ctx.spec,
		ctx.identity,
		segment as MediaSegment,
		uploadedExtension(fileName),
		ctx.pathOpts,
	).absolutePath;
	mkdirSync(dirname(target), { recursive: true, mode: 0o750 });
	renameSync(source, target);

	// Regenerate the thumb from a freshly moved posterframe (PHP create_thumb) —
	// FROM `target`, the file just bound, not from the configured posterframe path:
	// they are the same file whenever the client uploads the configured extension
	// (the 3D capture sends jpg), and when they are not, the thumb must depict what
	// the operator actually uploaded.
	if (segment === 'posterframe') {
		try {
			await writeThumbFrom(ctx, target);
		} catch (error) {
			// The posterframe is already in place; a thumb failure must not fail the
			// move. But it is SAID OUT LOUD: this swallow used to make a missing av
			// thumb indistinguishable from a thumb nobody asked for.
			console.warn(
				`[posterframe] thumb not built for ${buildMediaIdentifier(ctx.identity)}: ${(error as Error).message}`,
			);
		}
	}
	return true;
}

/**
 * The absolute path of the AV file at `quality`, resolved across the type's
 * extensions (PHP component_av::get_media_filepath). null when none exists.
 */
function resolveAvQualityFile(av: MediaContext, quality: string): string | null {
	for (const ext of [av.spec.defaultExtension, ...av.spec.allowedExtensions]) {
		const loc = buildMediaLocation(av.spec, av.identity, quality, ext, av.pathOpts);
		if (existsSync(loc.absolutePath)) return loc.absolutePath;
	}
	return null;
}

/**
 * ffprobe the AV file at a quality (PHP component_av::get_media_streams →
 * Ffmpeg::get_media_streams). Defaults to the component's default quality when
 * none is given (PHP get_default_quality fallback). Returns null when there is no
 * file at that quality — the client degrades gracefully (streams → []).
 */
export async function getAvMediaStreams(
	av: MediaContext,
	quality?: string | null,
): Promise<{ streams: unknown[] } | null> {
	if (av.spec.model !== 'component_av')
		throw notAvSource('media streams source must be component_av');
	const targetQuality = quality != null && quality !== '' ? quality : av.spec.defaultQuality;
	const file = resolveAvQualityFile(av, targetQuality);
	if (file === null) return null;
	return probeStreams(file);
}
