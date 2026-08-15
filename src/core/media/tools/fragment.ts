/**
 * AV FRAGMENT CUT — the clip an oral-history index entry points at
 * (PHP dd_component_av_api::download_fragment → Ffmpeg::build_fragment :1200).
 *
 * Every AV index row in the thesaurus indexation grid carries two "Download
 * fragment" buttons — plain and watermarked. Both post `download_fragment` to
 * `dd_component_av_api`; unported, both were dead 400s ("Undefined or
 * unauthorized method"), which is a capability an archive USES: extracting the
 * exact segment a researcher's index entry describes, to cite or to hand over.
 *
 * The cut lands in a `fragments/` sub-folder of the quality directory, named for
 * the component locator plus the tag id (PHP's grammar, kept verbatim — the
 * client builds the download filename from the URL's last segment).
 *
 * TWO PASSES FOR THE WATERMARK, AND THAT IS DELIBERATE (PHP's shape, :1265-1276).
 * A watermarked clip must depict the SAME seconds as the unwatermarked one, or
 * the two buttons on one row hand a researcher two different excerpts. So the
 * watermark path cuts with a stream copy exactly as the plain path does — same
 * keyframe-snapped in-point — and only then re-encodes THAT clip to burn the
 * overlay in. A single-pass `-ss … -filter_complex` would be one process fewer
 * and would silently start somewhere else.
 *
 * The one modernization is the filtergraph's SOURCE: PHP inlined the watermark
 * PATH into a `movie=…` filter string, where a path holding `:` `'` `[` or `\`
 * corrupts the graph. Here it is a second INPUT (`-i`), which needs no escaping
 * at all and composites identically (`overlay` repeats a still input's last
 * frame for the whole clip). Same output, no parser in the middle.
 *
 * WHO CAN FETCH THE RESULT, and how the tree stays bounded — both follow from the
 * filename, so both are recorded here:
 *
 *  - The URL is served under the media root, where rule A of the generated access
 *    rules (`media/protection.ts`) admits a logged-in Dédalo user by cookie. That
 *    is who clicked. Rule B (the anonymous public path) keys on the LAST TWO
 *    underscore tokens of a filename as `{section_tipo}_{section_id}` and then
 *    requires a `.publication/pub/<tipo>_<id>` marker; on a fragment those two
 *    tokens are `{section_id}_{tag_id}`, both numeric, and no tipo is numeric — so
 *    no marker can ever exist for one and a fragment is never anonymously
 *    reachable, whatever quality folder it sits in.
 *  - The name is a pure function of (component, record, tag), so re-cutting the
 *    same index entry REPLACES its fragment. The folder grows with the number of
 *    distinct index entries downloaded, never with the number of downloads.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../../config/config.ts';
import { assertValidQuality, type MediaTypeSpec } from '../../concepts/media.ts';
import { secondsToTc } from '../../resolve/tr_marks.ts';
import { withTempSibling, writeAtomically } from '../atomic.ts';
import { buildFragmentArgv, producerSpawnOptions } from '../engine/ffmpeg.ts';
import { assertSpawnOk, runBinary } from '../engine/spawn.ts';
import {
	assertInsideMediaRoot,
	buildMediaIdentifier,
	buildMediaLocation,
	type MediaIdentity,
	type MediaPathOptions,
	requireMediaRoot,
} from '../path.ts';

/**
 * A tag id reaches the FILESYSTEM as part of a filename, so it is validated as an
 * identifier rather than sanitized into one. Silently rewriting `../../x` would
 * hand the caller some other record's fragment (or overwrite it); refusing says
 * what happened. Index tag ids are the grid's own `tag_id` values — digits, and
 * at most an `-`/`_` separator — so nothing legitimate is excluded.
 */
const TAG_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The watermark still (PHP `DEDALO_AV_WATERMARK_FILE`, sample.config.php:454:
 * `DEDALO_MEDIA_PATH .'/'. DEDALO_AV_FOLDER .'/watermark/watermark.png'`).
 *
 * DERIVED, not a config key — it is derived in PHP too, and adding an env key for
 * a path that has exactly one legal value would be a new way for an install to be
 * wrong. It is confined to the media root like every other media path.
 */
export function watermarkFilePath(mediaRoot?: string): string {
	const root = requireMediaRoot(mediaRoot);
	const folder = config.media.av.folder.replace(/^\//, '');
	return assertInsideMediaRoot(join(root, folder, 'watermark', 'watermark.png'), root);
}

/**
 * `fragment_<tipo>_<section_tipo>_<section_id>[_<lang>]_<tag_id>.<ext>` — PHP's
 * `implode('_', ['fragment', tipo, section_tipo, section_id, tag_id])` plus the
 * component's own identifier rules, so a translatable component's fragments do
 * not collide across langs (the identifier already carries the lang suffix).
 * Concurrent requests for different tags of one record never share a name.
 */
export function fragmentFileName(
	identity: MediaIdentity,
	tagId: string,
	extension: string,
): string {
	if (!TAG_ID.test(tagId)) {
		throw new Error(
			`download_fragment: invalid tag_id '${tagId}' — it becomes part of a filename, so it must be letters, digits, '_' or '-' (max 64)`,
		);
	}
	const cleanExtension = String(extension).replace(/^\./, '');
	if (!/^[A-Za-z0-9]+$/.test(cleanExtension)) {
		throw new Error(`download_fragment: invalid extension '${extension}'`);
	}
	return `fragment_${buildMediaIdentifier(identity)}_${tagId}.${cleanExtension}`;
}

/** Where a fragment lives: `<quality dir>/fragments/<fragment file name>`. */
export function fragmentLocation(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	quality: string,
	tagId: string,
	extension: string,
	pathOpts: MediaPathOptions,
): { relativePath: string; absolutePath: string } {
	const tier = buildMediaLocation(spec, identity, quality, extension, pathOpts);
	const relativePath = `${tier.relativeDir}/fragments/${fragmentFileName(identity, tagId, extension)}`;
	const root = requireMediaRoot(pathOpts.mediaRoot);
	return {
		relativePath,
		absolutePath: assertInsideMediaRoot(`${root}${relativePath}`, root),
	};
}

/**
 * Burn the watermark into an already-cut clip (PHP :1273, the second command).
 * The still is a second input and the overlay sits 10px in from the top-right,
 * which is the position the archive's watermark has always occupied.
 */
export function buildFragmentWatermarkArgv(
	cutSource: string,
	watermarkFile: string,
	target: string,
): string[] {
	return [
		config.media.binaries.ffmpeg,
		'-i',
		cutSource,
		'-i',
		watermarkFile,
		'-filter_complex',
		'[0:v][1:v]overlay=main_w-overlay_w-10:10',
		'-y',
		target,
	];
}

export interface FragmentRequest {
	spec: MediaTypeSpec;
	identity: MediaIdentity;
	pathOpts: MediaPathOptions;
	/** Quality tier to cut FROM (PHP options.quality). */
	quality: string;
	/** The index entry's tag id — part of the fragment filename. */
	tagId: string;
	tcInSeconds: number;
	tcOutSeconds: number;
	watermark: boolean;
	/** Source container extension; defaults to the type's normalized one. */
	extension?: string | null;
}

export interface FragmentOutcome {
	/** The public URL the client downloads (PHP `$response->result`). */
	url: string;
	/** Media-root-relative path, leading slash. */
	relativePath: string;
	absolutePath: string;
}

/**
 * Cut the fragment and return its URL. Throws — with the reason — on every
 * refusal: an unknown quality, a missing source, a non-positive duration, a
 * missing watermark still, or an ffmpeg run that did not succeed. The handler
 * turns that into the refusal envelope; nothing here reports a URL for a file
 * that is not on disk.
 */
export async function buildAvFragment(request: FragmentRequest): Promise<FragmentOutcome> {
	const { spec, identity, pathOpts, tagId, watermark } = request;
	if (spec.model !== 'component_av') {
		throw new Error('download_fragment: only supported for component_av');
	}
	const quality = assertValidQuality(spec, request.quality);
	const extension = request.extension ?? spec.defaultExtension;
	const source = buildMediaLocation(spec, identity, quality, extension, pathOpts).absolutePath;
	if (!existsSync(source)) {
		throw new Error(
			`download_fragment: no '${quality}' file for ${buildMediaIdentifier(identity)} to cut from`,
		);
	}

	// The RANGE is checked before anything spawns. ffmpeg accepts a zero or
	// negative `-t` by producing an empty (or whole-file) output, which would then
	// be published as a fragment — a download that is not the excerpt it claims.
	const tcIn = Number(request.tcInSeconds);
	const tcOut = Number(request.tcOutSeconds);
	if (!Number.isFinite(tcIn) || !Number.isFinite(tcOut) || tcIn < 0) {
		throw new Error('download_fragment: tc_in_secs / tc_out_secs must be finite seconds');
	}
	const durationSeconds = tcOut - tcIn;
	if (!(durationSeconds > 0)) {
		throw new Error(
			`download_fragment: the fragment duration is ${String(durationSeconds)}s — tc_out_secs must be later than tc_in_secs`,
		);
	}
	// The IN-POINT goes to ffmpeg as an HH:MM:SS.mmm timecode (PHP
	// OptimizeTC::seg2tc — the same grammar the tr marks the grid reads use); the
	// DURATION goes as plain seconds, which is what `buildFragmentArgv` (the ported
	// recipe, engine/ffmpeg.ts) emits and which ffmpeg's `-t` accepts identically.
	const startTc = secondsToTc(tcIn);

	const watermarkFile = watermark ? watermarkFilePath(pathOpts.mediaRoot) : null;
	if (watermarkFile !== null && !existsSync(watermarkFile)) {
		// PHP fails the whole request rather than quietly shipping an unwatermarked
		// clip, because the watermark is an access-control expectation: whoever
		// clicked the watermarked button is entitled to a marked copy, not to a
		// clean one.
		throw new Error(
			`download_fragment: the watermark file is missing (${watermarkFile}) — a watermarked fragment cannot be produced, and an unmarked one is not a substitute`,
		);
	}

	const location = fragmentLocation(spec, identity, quality, tagId, extension, pathOpts);
	await writeAtomically(location.absolutePath, async (temp) => {
		if (watermarkFile === null) {
			await runFfmpeg(
				buildFragmentArgv(source, temp, startTc, durationSeconds),
				`download_fragment cut of ${buildMediaIdentifier(identity)}`,
			);
			return;
		}
		// Pass 1 into an intermediate that never survives the call, pass 2 into the
		// staged final. Both scratch names come from the atomic writer.
		await withTempSibling(location.absolutePath, `.${extension}`, async (cut) => {
			await runFfmpeg(
				buildFragmentArgv(source, cut, startTc, durationSeconds),
				`download_fragment cut of ${buildMediaIdentifier(identity)}`,
			);
			await runFfmpeg(
				buildFragmentWatermarkArgv(cut, watermarkFile, temp),
				`download_fragment watermark of ${buildMediaIdentifier(identity)}`,
			);
		});
	});

	return {
		url: `${config.media.webBase}${location.relativePath}`,
		relativePath: location.relativePath,
		absolutePath: location.absolutePath,
	};
}

/**
 * The one spawn in this module. It carries the producer policy (the inactivity
 * cap — an hour-long interview's clip is legitimately slow, a wedged ffmpeg is
 * not) and CONSULTS the outcome through `assertSpawnOk`: a command killed by a
 * signal reads as "exit 137" and would otherwise publish a truncated clip as a
 * finished download.
 */
async function runFfmpeg(argv: readonly string[], context: string): Promise<void> {
	const result = await runBinary(
		[argv[0] as string, '-progress', 'pipe:1', ...argv.slice(1)],
		producerSpawnOptions(),
	);
	assertSpawnOk(result, context);
}
