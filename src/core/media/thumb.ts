/**
 * THE THUMB HANDLER — one entry point for "this record needs its thumbnail
 * (re)built", for all five media models.
 *
 * WHY IT EXISTS. Every trigger used to resolve the thumb's SOURCE for itself, and
 * they disagreed: the image regenerate built from the default tier, the pdf
 * regenerate from the master, the media-versions gear from "default else master",
 * the repair sweep from the default tier only, and av/3d from a posterframe
 * through a completely separate function with its own path grammar. Five rules for
 * one question, so "when is a thumbnail correct?" had no answer — and the gaps
 * between them are exactly where the measured defects lived (a fresh av record
 * with no thumb at all; a 3d thumb the panel could not build; an av thumb that
 * outlived the video it depicts).
 *
 * THE RULE, stated once: **the thumb depicts its source** (concepts/media.ts
 * THUMB_SOURCE_BY_MODEL). Whenever that source changes or disappears, the thumb is
 * rebuilt or retired in the same seam — never left standing as a picture of
 * something the record no longer holds.
 *
 * WHAT STAYS MODEL-SPECIFIC, and why each must:
 *  - the RECIPE that turns a source into a raster (plain resize / pdf page 1 /
 *    librsvg render) — one dispatch, in processing.ts buildThumbVersion;
 *  - who can WRITE a posterframe (POSTERFRAME_WRITER_BY_MODEL): ffmpeg can pull an
 *    av frame here and now, so an av thumb NEVER waits for an operator (PHP
 *    component_av::create_thumb :560 minted one at t=10 for exactly this reason);
 *    a mesh has to be RENDERED, and this engine has no renderer, so a 3d thumb is
 *    the one case the server cannot self-heal — and the refusal says who can.
 *
 * Everything else — the target path, the atomic write, the blank guard, the
 * failure channel — is shared.
 */

import { existsSync } from 'node:fs';
import { config } from '../../config/config.ts';
import {
	CLIENT_POSTERFRAME_REMEDY,
	type MediaTypeSpec,
	POSTERFRAME_WRITER_BY_MODEL,
	THUMB_SOURCE_BY_MODEL,
} from '../concepts/media.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import { moveToDeleted } from './file_ops.ts';
import {
	buildMediaIdentifier,
	buildMediaLocation,
	type MediaIdentity,
	type MediaPathOptions,
	mediaThumbLocation,
	posterframeLocation,
} from './path.ts';
import { buildThumbVersion, resolveMasterSource } from './processing.ts';

/** A resolved media component (spec + identity + path options) — the handler's unit of work. */
export interface ThumbContext {
	spec: MediaTypeSpec;
	identity: MediaIdentity;
	pathOpts: MediaPathOptions;
}

/**
 * The file the thumb must depict right now, or the reason there is none.
 *
 * `mintable` distinguishes the two ways a posterframe can be absent, and it is the
 * whole difference between av and 3d: `true` means the engine can produce one
 * itself (and `rebuildThumb` will), `false` means only a browser can.
 */
export type ThumbSourceResolution =
	| { source: string; mintable?: never; reason?: never }
	| { source: null; mintable: boolean; reason: string };

/**
 * Resolve the thumb's source WITHOUT writing anything — the shared half of the
 * rule, so a caller that only wants to know "could this record have a thumb?"
 * (the repair sweep, a status widget) never has to guess.
 */
export function resolveThumbSource(ctx: ThumbContext): ThumbSourceResolution {
	const { spec, identity, pathOpts } = ctx;
	if (THUMB_SOURCE_BY_MODEL[spec.model] === 'posterframe') {
		const location = posterframeLocation(spec, identity, pathOpts);
		if (location !== null && existsSync(location.absolutePath)) {
			return { source: location.absolutePath };
		}
		const writer = POSTERFRAME_WRITER_BY_MODEL[spec.model];
		return {
			source: null,
			mintable: writer === 'server_frame_extract',
			reason:
				writer === 'server_frame_extract'
					? `no posterframe on disk for ${buildMediaIdentifier(identity)} and none could be extracted`
					: `${spec.model} has no posterframe yet — ${CLIENT_POSTERFRAME_REMEDY[spec.model] ?? 'create the posterframe first'}`,
		};
	}

	// default_tier: the DELIVERED file first, the master only as a fallback.
	//
	// That order is deliberate and measured (it predates this module, in the
	// media-versions gear): on a partial-media box the default file is usually
	// present while the original is not, so requiring the master made the thumb
	// fail for exactly the records that still had something to depict. The
	// fallback is what the pdf and svg gears reach by design — their default
	// extension is not a raster tier, and both recipes read a non-raster source.
	const defaultFile = buildMediaLocation(
		spec,
		identity,
		spec.defaultQuality,
		spec.defaultExtension,
		pathOpts,
	).absolutePath;
	if (existsSync(defaultFile)) return { source: defaultFile };
	const master = resolveMasterSource(spec, identity, pathOpts);
	if (master !== null) return { source: master };
	return {
		source: null,
		mintable: false,
		reason: `no ${spec.defaultQuality} file and no master to build the thumb of ${buildMediaIdentifier(identity)} from`,
	};
}

/** What one `rebuildThumb` pass did. */
export interface ThumbBuildResult {
	/** The thumb path written, or null when nothing was built. */
	built: string | null;
	/** The posterframe this pass minted on the way (av only), or null. */
	mintedPosterframe: string | null;
}

/**
 * (Re)build a record's thumb from whatever its census says the source is,
 * MINTING that source first when the engine is able to (av).
 *
 * THROWS, with a message naming the remedy, when there is no source and none can
 * be made. A thumb that cannot be built is an operator-visible fact — every caller
 * either surfaces it (the panel gear) or records it as a non-fatal value (the
 * regenerates, the repair sweep); none of them may swallow it, because a silently
 * absent thumbnail is indistinguishable from one nobody asked for.
 */
export async function rebuildThumb(ctx: ThumbContext): Promise<ThumbBuildResult> {
	const { spec, identity, pathOpts } = ctx;
	if (!spec.hasThumb) {
		throw new DedaloError('media.unsupported_operation', {
			message: `${spec.model} has no thumb tier`,
			publicMessage: `${spec.model} has no thumb tier`,
		});
	}

	let resolution = resolveThumbSource(ctx);
	let mintedPosterframe: string | null = null;

	if (resolution.source === null && resolution.mintable) {
		// The av self-heal (PHP component_av::create_thumb :560, at t=10). Imported
		// lazily: tools/posterframe.ts is the layer ABOVE this one (it calls
		// buildThumbVersion), and a static edge back down would close an import
		// cycle — the shape engineering/CONVENTIONS.md §2 admits a dynamic import for.
		const { mintPosterframe } = await import('./tools/posterframe.ts');
		mintedPosterframe = await mintPosterframe(ctx);
		resolution = resolveThumbSource(ctx);
	}

	if (resolution.source === null) {
		// The reason names the record identifier, so it stays in the log-only
		// `message`; the wire gets the registry English.
		throw new DedaloError('media.file_not_found', {
			message: `build thumb: ${resolution.reason}`,
			coordinates: { model: spec.model, identifier: buildMediaIdentifier(identity) },
		});
	}

	const built = await buildThumbVersion(spec, identity, resolution.source, pathOpts);
	return { built, mintedPosterframe };
}

/**
 * RETIRE the thumb — move it into `deleted/` because the thing it depicts is gone.
 *
 * The other half of the rule, and the half that had no implementation at all: a
 * `posterframe` thumb survives the deletion of its posterframe and of the master
 * itself, so an operator who removed a video was still served its picture, and
 * `files_info` reported that picture as present and current. Measured on the
 * shipped code, both paths.
 *
 * It is a MOVE, never an unlink (the No-hard-delete law, file_ops.ts): the bytes
 * stay one move away, which on a partial-media box is the difference between
 * "honestly thumb-less" and "silently gone". Returns the path moved, or null when
 * there was no thumb.
 */
export function retireThumb(ctx: ThumbContext): string | null {
	const location = mediaThumbLocation(ctx.spec, ctx.identity, ctx.pathOpts);
	if (location === null) return null;
	return moveToDeleted(location.absolutePath, { mediaRoot: ctx.pathOpts.mediaRoot });
}

/**
 * The thumb is missing on disk — the cheap test the repair sweep and the ingest
 * paths ask before doing any work, so "build what is MISSING, never re-encode what
 * is there" needs no per-model reimplementation.
 */
export function thumbIsMissing(ctx: ThumbContext): boolean {
	const location = mediaThumbLocation(ctx.spec, ctx.identity, ctx.pathOpts);
	if (location === null) return false;
	return !existsSync(location.absolutePath);
}

/** The thumb tier's own quality name — so no caller re-reads the config key. */
export function thumbQualityName(): string {
	return config.media.thumb.quality;
}
