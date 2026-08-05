/**
 * IMAGE SOURCE PROBE — the source-shape abstraction every image recipe decides on.
 *
 * An image file is not necessarily ONE image. A Photoshop-layered TIFF, a
 * multi-page TIFF/PDF, an animated or delta-frame GIF and a plain JPEG all enter
 * the same derivative ladder, and ImageMagick treats each as a SEQUENCE: an argv
 * that leaves N images in the pipeline writes N files (`<stem>-0.jpg`,
 * `<stem>-1.jpg`, …) and never the bare `<stem>.jpg` the atomic rename expects.
 * That is the 2026-08-04 import failure (exit 0, empty stderr, ENOENT on rename,
 * `matrix.media` left NULL). Every recipe now asks this module what it is looking
 * at and selects a scene accordingly.
 *
 * ONE `magick identify -ping` call answers everything this abstraction promises:
 * scene count, per-scene pixel and page geometry, colorspace, orientation,
 * channel layout and the CONTAINER FORMAT. `-ping` reads headers only, so it stays
 * cheap enough to run per derivative rather than threading probe results through
 * the call graph — see `probeImageSource` for the measurements that make `-ping`
 * non-negotiable here, and `probeMetaChannels` for the ONE question it cannot
 * answer and what asking it actually costs.
 *
 * A probe failure THROWS. An unreadable source must fail loudly and at the point
 * of failure; callers that are allowed to degrade (the RAG image indexer, the
 * staged-upload thumbnail) catch it themselves and say so.
 *
 * KNOWN-OPEN (2026-08-04): this classifies by GEOMETRY only, so it cannot tell a
 * multi-page TIFF from a TIFF whose image 0 is a reduced-resolution PREVIEW IFD
 * (the TIFF `NewSubfileType` bit some scanners and Photoshop write). Both look
 * like "a full-frame image 0 followed by more images", so both take image 0 — a
 * preview-first master yields a small derivative. ImageMagick does report
 * `%[tiff:subfiletype]` (measured: `PAGE` for ordinary pages), which is the
 * signal a future rule would use; no real REDUCEDIMAGE file exists on this box to
 * verify it against, and guessing at an unverified tag would be worse than the
 * honest limit. Ledgered as known-open.
 */

import { runIdentify } from './binaries.ts';
import { sceneToken } from './scene.ts';

/** One image inside a source sequence (a layer, a page, a frame). */
export interface SceneInfo {
	/** Scene index as ImageMagick reports it (%s), 0-based. */
	readonly index: number;
	/** Pixel size of the scene's own raster (%w %h). */
	readonly width: number;
	readonly height: number;
	/** Size of the page/canvas the scene declares it lives on (%W %H). */
	readonly pageWidth: number;
	readonly pageHeight: number;
	/** Offset of the scene inside that page (%X %Y). Can be negative. */
	readonly pageX: number;
	readonly pageY: number;
	/**
	 * Channel LAYOUT ('srgb', 'srgba', 'gray', 'graya', 'cmyk', 'cmyka').
	 *
	 * Measured trap: ImageMagick 7.1.2 reports %[channels] as the layout PLUS the
	 * depth — `'srgb  4.0'`, `'graya 2.0'`. Only the leading token is kept here,
	 * so a substring test on this field means what it says.
	 */
	readonly channels: string;
	/**
	 * NO `metaChannels` FIELD HERE, DELIBERATELY. `-ping` reports the meta-channel
	 * count as ZERO for a file that has one (measured — see `probeImageSource`), so
	 * a field on this interface could only ever be a confident lie. That question
	 * has its own function, `probeMetaChannels`, which is explicit about the full
	 * pixel decode it costs and is called only where that cost is justified.
	 *
	 * MEASURED TRAP — THIS FLAG IS NOT AUTHORITATIVE FOR TIFF EITHER. `-ping` also
	 * under-reports ALPHA when a TIFF stores it as an extra sample. A fixture whose
	 * IFD reads `Extra Samples: 2<unassoc-alpha, unspecified>`, `Samples/Pixel: 5`
	 * reports `srgba 5.1` on a full read and `srgb 3.0` under `-ping`: no alpha, no
	 * meta channel, both invisible. (PNG is fine: `srgba` under `-ping` too.) So any
	 * decision that turns on "does this source really have an alpha plane" must read
	 * it from `probeMetaChannels`, which returns both facts from the one
	 * authoritative call. This flag stays for diagnosis and for the formats where it
	 * is exact.
	 *
	 * True when the channel layout carries an alpha plane. DIAGNOSTIC ONLY — the
	 * flatten background is decided by the TARGET extension, never by this flag
	 * (see backgroundForTarget in imagemagick.ts): bare JPEG encoding does not
	 * composite alpha, it drops the plane and keeps the producing application's
	 * hidden RGB, which was measured as red, black AND white on different sources.
	 */
	readonly hasAlpha: boolean;
}

/** The shape of an image source: how many images it holds and how they sit. */
export interface ImageSourceProbe {
	readonly scenes: readonly SceneInfo[];
	readonly sceneCount: number;
	/**
	 * The geometry a derivative built from this source will occupy: scene 0's
	 * PAGE box (see the measurements in probeImageSource), never its raster size
	 * and never a union across scenes.
	 */
	readonly canvasWidth: number;
	readonly canvasHeight: number;
	/** Colorspace of scene 0 (%[colorspace]) — drives the CMYK→sRGB branch. */
	readonly colorspace: string;
	/**
	 * The container format as ImageMagick DETECTED it (%m): 'TIFF', 'JPEG', 'PSD'…
	 *
	 * Detected from CONTENT, not from the filename — verified by copying a TIFF
	 * master to `mislabeled.jpg`, which still reports 'TIFF'. That is why the
	 * meta-channel decision gates on this rather than on the path's extension: an
	 * upload's extension is attacker- and accident-controlled, its magic bytes are
	 * what ImageMagick will actually act on.
	 */
	readonly format: string;
	/** EXIF orientation of scene 0 (%[orientation]). */
	readonly orientation: string;
	/**
	 * Scene 0 is a FULL-FRAME image of its own page (+0+0, raster == page), i.e.
	 * the source declares its own representative image: a merged PSD/TIFF
	 * composite, page 1 of a paged source, frame 1 of a GIF. False only when
	 * scene 0 is a partial patch that cannot stand alone, which is when the stack
	 * has to be composited instead.
	 */
	readonly hasRepresentativeScene: boolean;
}

/**
 * The probe format string. Two measured traps are baked into this literal:
 *
 *  1. The separator is a LITERAL '|'. ImageMagick does NOT interpret '\t' in a
 *     -format string — `'%w\t%h'` on a 645x888 image prints `645t888`, which
 *     parses to NaN and would SILENTLY disable the CMYK branch and the resize
 *     budget. '\n' IS interpreted, so it is the only escape used here.
 *  2. The whole format REPEATS ONCE PER SCENE. That is why the scene count is
 *     `lines.length` and never `%n`: a 3-scene file prints `%n` three times,
 *     yielding the string `333`.
 */
const PROBE_FORMAT = '%s|%w|%h|%W|%H|%X|%Y|%[orientation]|%[colorspace]|%[channels]|%m\n';

/** Field count of PROBE_FORMAT — a short line means a format/parse mismatch. */
const PROBE_FIELDS = 11;

/**
 * Probe an image source.
 *
 * `-ping` IS LOAD-BEARING AND MUST STAY. It makes ImageMagick read headers only;
 * without it, `identify` DECODES EVERY PIXEL. MEASURED (IM 7.1.2-18, this box):
 *
 *   192 MP TIFF (16000x12000, 1.2 MB zip)   -ping 0.00 s / 4.5 MB RSS
 *                                        no -ping 1.04 s / 2.3 GB RSS
 *   1.2 GP TIFF (40000x30000, 7.3 MB zip)   -ping 0.00 s / 4.5 MB RSS
 *                                  no -ping, `[0]` 7.23 s / 14.4 GB RSS
 *
 * Those are ORDINARY heritage scans, and this function is not a rare call: it runs
 * on every derivative build, inside `runMagickTo` on every output written, and
 * behind `getDimensions`. It is also reached from the authenticated upload request
 * (createStagedThumbnail → buildThumbAtomically). A 14 GB allocation on a request
 * path is a denial of service, and the engine's ImageMagick policy sets no
 * `domain="resource"` limit to bound it. Do NOT drop `-ping` from this call.
 *
 * WHAT `-ping` COSTS US, precisely and only: the META-CHANNEL COUNT. Measured on
 * the 3-scene medal master `rsc29_rsc170_440866.tif`:
 *
 *   with    -ping → `0|srgb  3.0`, `1|srgba 3.0`, `2|srgba 3.0`
 *   without -ping → `0|srgb  4.1`, `1|srgba 5.1`, `2|srgba 5.1`
 *
 * i.e. under `-ping` a meta channel is invisible. That single question therefore
 * has its own opt-in function, `probeMetaChannels`, which pays the decode
 * deliberately and only for the container formats that can carry an extra sample.
 * (`-ping -verbose` does print `Channels: 4.1`, but it is not a shortcut: measured
 * 24.3 s / 3.1 GB on the 192 MP file, because it computes channel statistics.)
 *
 * Every OTHER field was re-verified identical with and without `-ping` on the two
 * medal masters, a plain jpg, an alpha png, an animated gif and a CMYK tif:
 * %s %w %h %W %H %X %Y %[orientation] %[colorspace] %m never moved, and the
 * %[channels] LAYOUT token (which is all this function keeps) never moved either —
 * only the numeric `<total>.<meta>` token does.
 *
 * Throws on a timeout, on an empty report and on any unparseable field.
 */
export async function probeImageSource(source: string): Promise<ImageSourceProbe> {
	// `runIdentify` (engine/binaries.ts), never a bare spawn: ImageMagick selects a
	// coder by CONTENT, so this reads RAW UPLOADED BYTES with a coder we did not
	// choose (a `.png` holding PostScript selects PS). It must run under the
	// hardened policy like every other ImageMagick process.
	const result = await runIdentify(['-ping', '-quiet', '-format', PROBE_FORMAT, source]);
	if (result.timedOut) {
		throw new Error(`image probe timed out: ${source}`);
	}
	const lines = result.stdout
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '');
	if (lines.length === 0) {
		throw new Error(
			`image probe produced no report for ${source} (exit ${String(result.exitCode)}): ${
				result.stderr.slice(0, 400) || '<empty stderr>'
			}`,
		);
	}

	const scenes = lines.map((line, position) => parseSceneLine(line, position, source));

	const first = scenes[0] as ParsedScene;

	// THE CANVAS IS SCENE 0'S PAGE BOX — because that is exactly what every recipe
	// in this engine writes. MEASURED (IM 7.1.2):
	//
	//   `-flatten` composites onto the PAGE OF THE FIRST IMAGE in the pipeline,
	//   whatever the rest of the sequence declares:
	//     60x40 raster in a 200x150 page, `SOURCE[0] -background white -flatten`
	//       → 200x150  (so the canvas follows the PAGE, not the 60x40 raster)
	//     the same raster at +170+130 (overhanging the page)
	//       → 200x150  (the overhang is CROPPED, so a union with `pageX + width`
	//                   would report 230x185 for a file that is 200x150)
	//     a 2-page TIFF, page 1 = 300x200, page 2 = 500x400, flattened
	//       → 300x200  (page 2 is stamped onto page 1's canvas, not unioned)
	//
	// The two page CONVENTIONS also rule a union out: a GIF stores the shared
	// logical screen in %W/%H for every frame, while a layered TIFF stores each
	// scene's OWN size (measured on the reported master: `0|645|888|645|888|+0+0`,
	// `1|582|825|582|825|+31|+31`). A union is therefore not a canvas in either
	// convention — it is a number no file has. This value drives the resize budget
	// and the SVG envelope, both of which must describe the file that gets written.
	const canvasWidth = first.pageWidth;
	const canvasHeight = first.pageHeight;

	// A single-image source is trivially its own representative. For a sequence,
	// scene 0 qualifies when it is a FULL-FRAME image of its page: un-offset and
	// filling that page. Verified: layered TIFF/PSD composite, multi-page TIFF
	// (= page 1), animated and delta-frame GIF (= frame 1) all qualify; a GIF whose
	// frame 0 is a repaged 60x40 sub-rectangle does not.
	//
	// It deliberately does NOT compare scene 0's page with the other scenes' —
	// that test (2026-08-04 review) sent two REAL classes down the composite branch
	// where `-flatten` is destructive by construction, since flatten collapses onto
	// scene 0's page anyway:
	//   - a TIFF whose image 0 is a small preview IFD (160x120) ahead of the
	//     2000x1500 master: composite yielded a 160x120 derivative AND a probe
	//     claiming a 2000x1500 canvas — a wrong tier plus a desynchronised envelope;
	//   - a mixed-orientation multi-page TIFF (600x800 then 800x600): composite
	//     stamped page 2 over page 1 — measured AE 360000 px, 75 % of page 1's
	//     frame (page 2 covers its whole top 600x600).
	// Both are ordinary heritage scans. Taking scene 0 gives page 1 intact and a
	// canvas that matches the output.
	const hasRepresentativeScene =
		scenes.length === 1 ||
		(first.pageX === 0 &&
			first.pageY === 0 &&
			first.width === first.pageWidth &&
			first.height === first.pageHeight);

	return {
		scenes,
		sceneCount: scenes.length,
		canvasWidth,
		canvasHeight,
		// %[colorspace] / %[orientation] / %m repeat identically per scene; scene 0 wins.
		colorspace: first.colorspaceRaw,
		orientation: first.orientationRaw,
		format: first.formatRaw,
		hasRepresentativeScene,
	};
}

/**
 * Internal parse shape: SceneInfo plus the two per-scene strings that are only
 * reported at source level (they repeat identically per scene; scene 0 wins).
 */
interface ParsedScene extends SceneInfo {
	readonly colorspaceRaw: string;
	readonly orientationRaw: string;
	readonly formatRaw: string;
}

/** Parse one report line into a scene. Any unparseable number throws. */
function parseSceneLine(line: string, position: number, source: string): ParsedScene {
	const fields = line.split('|');
	if (fields.length !== PROBE_FIELDS) {
		throw new Error(
			`image probe line ${position} of ${source} has ${fields.length} fields, expected ${PROBE_FIELDS}: ${line}`,
		);
	}
	const index = parseNumericField(fields[0] as string, 'scene index', line, source);
	const width = parseNumericField(fields[1] as string, 'width', line, source);
	const height = parseNumericField(fields[2] as string, 'height', line, source);
	const pageWidth = parseNumericField(fields[3] as string, 'page width', line, source);
	const pageHeight = parseNumericField(fields[4] as string, 'page height', line, source);
	const pageX = parseNumericField(fields[5] as string, 'page x', line, source);
	const pageY = parseNumericField(fields[6] as string, 'page y', line, source);
	// %[channels] is 'srgb  4.1' / 'graya 2.0' on IM 7.1.2 — a LAYOUT token then a
	// numeric '<total>.<meta>' token. Only the layout is kept: it is the one part
	// `-ping` reports truthfully (the numeric token reads '3.0' for a file that has
	// a meta channel), so a substring test on this field means what it says.
	const channels = (fields[9] as string).trim().split(/\s+/)[0] ?? '';
	return {
		index,
		width,
		height,
		pageWidth,
		pageHeight,
		pageX,
		pageY,
		channels,
		// 'srgba', 'graya', 'cmyka' carry alpha; 'srgb', 'gray', 'cmyk' do not.
		hasAlpha: channels.endsWith('a'),
		colorspaceRaw: (fields[8] as string).trim(),
		orientationRaw: (fields[7] as string).trim(),
		formatRaw: (fields[10] as string).trim().toUpperCase(),
	};
}

/**
 * Container formats that can carry a TIFF-style "extra sample" (a meta channel).
 *
 * The gate for `probeMetaChannels`: everything else is spared the decode.
 * Matched against `ImageSourceProbe.format`, which ImageMagick derives from the
 * file's CONTENT, so a TIFF uploaded as `photo.jpg` is still recognised.
 */
const EXTRA_SAMPLE_FORMATS: ReadonlySet<string> = new Set(['TIFF', 'TIFF64', 'PSD', 'PSB']);

/** True when this probed format can carry an extra sample at all. */
export function canCarryMetaChannel(probe: ImageSourceProbe): boolean {
	return EXTRA_SAMPLE_FORMATS.has(probe.format);
}

/** What the authoritative (non-`-ping`) read says about image 0's channel planes. */
export interface MetaChannelReport {
	/** How many meta channels ("extra samples" with no declared meaning) it has. */
	readonly metaChannels: number;
	/** Whether it carries a REAL alpha plane. Authoritative, unlike SceneInfo.hasAlpha. */
	readonly hasAlpha: boolean;
}

/**
 * What image 0 of `source` really carries: META CHANNELS ("extra samples") and
 * whether there is a true alpha plane. BOTH come from this one call because both
 * are invisible to `-ping` on a TIFF (see `SceneInfo.hasAlpha` for the measurement),
 * and the meta-alpha decision needs them to agree with each other.
 *
 * WHAT A META CHANNEL IS: a sample plane the container declares but does not give
 * a meaning to. Photoshop writes a saved selection or a layer mask there. The TIFF
 * tag is explicit about the ambiguity — `tiffinfo` on the 2026-08-04 medal masters
 * prints `Extra Samples: 1<unspecified>`, i.e. the FORMAT ITSELF says this plane is
 * not declared to be transparency. ImageMagick agrees and renders the image fully
 * opaque. Promoting it is therefore an INFERENCE, and `processing.ts` owns the
 * rules and the safety net that make that inference survivable.
 *
 * GRAMMAR (v6 `class.ImageMagick.php::has_meta_channel`, re-measured on IM 7.1.2):
 * %[channels] is `<layout>  <total>.<meta>` — `'srgb  3.0'` = none, `'srgb  4.1'` =
 * RGB plus one meta, `'srgb  5.2'` = RGB plus two, `'srgba 5.1'` = RGB + a real
 * alpha plane + one meta. The layout's trailing 'a' is the alpha, the digit after
 * the dot is the meta count.
 *
 * THIS CALL IS EXPENSIVE — that is the entire reason it is not folded into
 * `probeImageSource`. It cannot use `-ping` (which reports `3.0` for a `4.1` file),
 * so ImageMagick decodes every pixel: measured 7.23 s and 14.4 GB RSS for image 0
 * of a 40000x30000 TIFF. Call it ONLY when `canCarryMetaChannel` is true and only
 * where the answer changes the recipe. In `regenerateImage` that is once per record
 * (the thumb is built from the already-converted default tier, a JPEG, which this
 * gate skips), against a convert of the same master measured at 59.5 s / 23.8 GB —
 * so the added cost is a fraction of work already being done.
 *
 * It reads `source[0]` and never the whole sequence: only image 0 can supply
 * `meta0` to `-channel-fx` (measured — see `processing.ts`).
 *
 * Degrades rather than throwing on an unreadable or unparseable report, and the
 * degraded answer is the SAFE one on both fields: no meta channel (so the fx is not
 * applied) and alpha present (so it is not applied for that reason either). Unlike
 * every other probe in this module that is correct here — the only consumer decides
 * whether to APPLY an fx that HARD-FAILS and writes nothing when `meta0` is absent,
 * so "unknown" and "none" must reach the same answer, and a source that is
 * perfectly convertible must not be taken down by a question about a rare channel.
 */
export async function probeMetaChannels(source: string): Promise<MetaChannelReport> {
	const unknown: MetaChannelReport = { metaChannels: 0, hasAlpha: true };
	const result = await runIdentify([
		'-quiet',
		'-format',
		'%[channels]\n',
		sceneToken(source, 'representative'),
	]);
	if (result.timedOut) return unknown;
	const tokens = result.stdout.trim().split('\n')[0]?.trim().split(/\s+/);
	const layout = tokens?.[0];
	const numeric = tokens?.[1];
	if (layout === undefined || layout === '' || numeric === undefined) return unknown;
	const dot = numeric.indexOf('.');
	const value = dot < 0 ? Number.NaN : Number(numeric.slice(dot + 1));
	return {
		metaChannels: Number.isFinite(value) && value > 0 ? value : 0,
		hasAlpha: layout.endsWith('a'),
	};
}

/**
 * The standard deviation of a WRITTEN derivative's pixels, 0…1 — "how much picture
 * is left in this file". 0 means a perfectly uniform image (one flat colour).
 *
 * The safety net for the meta-alpha promotion: a mask that is empty, inverted, or
 * simply not a mask at all turns a derivative into a blank rectangle, and the
 * conversion still exits 0. See `processing.ts` for the measured cases.
 *
 * MEASURED TRAP — this must be run against the WRITTEN DERIVATIVE, never against
 * the master with the fx applied inline. `%[fx:standard_deviation]` includes the
 * META CHANNEL in its statistics, and the meta channel is the mask, which has
 * plenty of variance of its own: the same inverted-mask source measured 0.106
 * inline (mask counted) and 0.0038 on the written jpg (mask gone, picture gone).
 * The inline number hides exactly the failure this function exists to catch.
 *
 * Returns null when the value cannot be read, which callers must treat as "no
 * evidence of damage" — a failed measurement may not condemn a good derivative.
 */
export async function probeContentSpread(path: string): Promise<number | null> {
	const result = await runIdentify(['-quiet', '-format', '%[fx:standard_deviation]', path]);
	if (result.timedOut) return null;
	const value = Number(result.stdout.trim());
	return Number.isFinite(value) ? value : null;
}

/**
 * Parse one numeric probe field.
 *
 * %X/%Y arrive SIGNED and with an explicit '+' — `+31`, `-40`, and (when a
 * geometry-producing operator has been applied upstream) the doubled form
 * `+-40`. JS `Number('+31')` is 31 but `Number('+-40')` is NaN, so a single
 * leading '+' is stripped before conversion. NaN is never tolerated: a silent
 * NaN here would disable the CMYK branch and the resize budget (the '\t' trap
 * above is exactly how that happens).
 */
function parseNumericField(raw: string, field: string, line: string, source: string): number {
	const value = Number(raw.trim().replace(/^\+/, ''));
	if (!Number.isFinite(value)) {
		throw new Error(`image probe of ${source}: ${field} is not a number (${raw}) in line: ${line}`);
	}
	return value;
}
