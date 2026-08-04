/**
 * Phase C gate: the processing engines run REAL binaries (ImageMagick/ffmpeg/
 * pdf tools) on generated fixtures. Parity is REALISTIC, not byte-equality —
 * encoder builds differ across versions (engineering/MEDIA_SPEC.md §7 Phase C): we
 * assert dimensions/format/colorspace via identify, pdftotext text content, and
 * ffprobe stream shape. Skipped honestly when a binary is absent.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { config } from '../../src/config/config.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import { probeStreams } from '../../src/core/media/engine/ffmpeg.ts';
import {
	buildThumb,
	getDimensions,
	resolveMagick,
	rotateImage,
} from '../../src/core/media/engine/imagemagick.ts';
import { extractText, getPageCount } from '../../src/core/media/engine/pdf.ts';
import { probeImageSource } from '../../src/core/media/engine/probe.ts';
import { runBinary } from '../../src/core/media/engine/spawn.ts';
import type { MediaIdentity, MediaPathOptions } from '../../src/core/media/path.ts';
import {
	buildThumbVersion,
	regenerateImage,
	regeneratePdf,
	resolveOriginalSource,
} from '../../src/core/media/processing.ts';

const ROOT = `${tmpdir()}/dedalo_media_proc_${process.pid}`;
const image = mediaTypeOf('component_image')!;
const pdf = mediaTypeOf('component_pdf')!;
const pathOpts: MediaPathOptions = { initialMediaPath: '', maxItemsFolder: null, mediaRoot: ROOT };

function have(bin: string): boolean {
	return existsSync(bin);
}
const HAVE_MAGICK = have(resolveMagick());

/** Create a real NxN test image at a media-relative path via ImageMagick. */
async function makeImage(relative: string, size: string, color: string): Promise<void> {
	const abs = `${ROOT}${relative}`;
	mkdirSync(abs.slice(0, abs.lastIndexOf('/')), { recursive: true });
	await runBinary([resolveMagick(), '-size', size, `xc:${color}`, abs], { nice: false });
}

/**
 * Create a real MULTI-IMAGE fixture at a media-relative path: `args` is the
 * magick argv between the binary and the output (each `-size … xc:…` adds one
 * image to the pipeline, `( … )` groups one).
 *
 * These fixtures are the whole point of this tier: a Photoshop-layered TIFF, a
 * multi-page TIFF, an animated GIF and a delta-frame GIF all reach the same
 * derivative ladder, and ImageMagick writes ONE FILE PER IMAGE left in the
 * pipeline (`<stem>-0.jpg`, `<stem>-1.jpg`, …) — never the bare target.
 */
async function makeMagickFixture(relative: string, args: string[]): Promise<void> {
	const abs = `${ROOT}${relative}`;
	mkdirSync(abs.slice(0, abs.lastIndexOf('/')), { recursive: true });
	const result = await runBinary([resolveMagick(), ...args, abs], { nice: false });
	// A fixture that failed to build must be LOUD. Silently continuing turns the
	// gate below into a test of "the source is missing", which passes for the
	// wrong reason and reports an ImageMagick output-contract failure to an
	// operator whose actual problem is a policy/disk/delegate change.
	if (result.exitCode !== 0) {
		throw new Error(
			`fixture build failed for ${relative} (exit ${String(result.exitCode)}): ${result.stderr}`,
		);
	}
}

/**
 * Read one pixel as 8-bit r,g,b. `%[fx:…]` is used instead of `%[pixel:…]`
 * because the latter answers with colour NAMES ('white', 'red') for exact
 * matches and `srgb(…)` otherwise — two shapes to parse for one number.
 */
async function pixelAt(path: string, x: number, y: number): Promise<[number, number, number]> {
	const format =
		`%[fx:int(255*p{${x},${y}}.r)],` +
		`%[fx:int(255*p{${x},${y}}.g)],` +
		`%[fx:int(255*p{${x},${y}}.b)]`;
	const result = await runBinary([resolveMagick(), path, '-format', format, 'info:'], {
		nice: false,
	});
	const parts = result.stdout.trim().split(',').map(Number);
	if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
		throw new Error(`cannot read pixel ${x},${y} of ${path}: '${result.stdout}' ${result.stderr}`);
	}
	return [parts[0] as number, parts[1] as number, parts[2] as number];
}

/**
 * Every file under `dir` that is WRITE DEBRIS: an unrenamed atomic temp
 * (`<stem>.tmp.<pid>.<uuid>.<ext>`) or a sequence split sibling
 * (`<stem>-0.jpg`…). Both are the 2026-08-04 failure's fingerprint — six
 * `…tmp.…-N.jpg` orphans sat in a live thumb dir with nothing to collect them —
 * so a green derivative run must leave NONE of either, anywhere in the tree.
 */
function writeDebrisUnder(dir: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = `${dir}/${entry.name}`;
		if (entry.isDirectory()) {
			found.push(...writeDebrisUnder(full));
			continue;
		}
		if (entry.name.includes('.tmp.') || /-\d+\.(jpg|jpeg|png|gif|tiff?|svg)$/i.test(entry.name)) {
			found.push(full);
		}
	}
	return found;
}

/** Run `body` with console.warn captured (restored even when it throws). */
async function captureWarnings(body: () => Promise<void>): Promise<string[]> {
	const lines: string[] = [];
	const real = console.warn;
	console.warn = (...args: unknown[]): void => {
		lines.push(args.map((a) => String(a)).join(' '));
	};
	try {
		await body();
	} finally {
		console.warn = real;
	}
	return lines;
}

const GS_BIN = ['/opt/homebrew/bin/gs', '/usr/bin/gs', '/usr/local/bin/gs'].find(have) ?? 'gs';
const HAVE_GS = have('/opt/homebrew/bin/gs') || have('/usr/bin/gs') || have('/usr/local/bin/gs');

/** Create a real one-page PDF carrying the text 'HELLO' via ghostscript. */
async function makePdf(relative: string): Promise<void> {
	const abs = `${ROOT}${relative}`;
	mkdirSync(abs.slice(0, abs.lastIndexOf('/')), { recursive: true });
	await runBinary(
		[
			GS_BIN,
			'-q',
			'-dNOPAUSE',
			'-dBATCH',
			'-sDEVICE=pdfwrite',
			'-o',
			abs,
			'-c',
			'<< /PageSize [200 200] >> setpagedevice /Helvetica findfont 24 scalefont setfont 20 100 moveto (HELLO) show showpage',
		],
		{ nice: false },
	);
}

/** Create a real N-page PDF via ghostscript (one `showpage` per page). */
async function makeMultiPagePdf(relative: string, pages: number): Promise<void> {
	const abs = `${ROOT}${relative}`;
	mkdirSync(abs.slice(0, abs.lastIndexOf('/')), { recursive: true });
	const body = Array.from(
		{ length: pages },
		(_, i) => `20 100 moveto (PAGE${i + 1}) show showpage`,
	).join(' ');
	await runBinary(
		[
			GS_BIN,
			'-q',
			'-dNOPAUSE',
			'-dBATCH',
			'-sDEVICE=pdfwrite',
			'-o',
			abs,
			'-c',
			`<< /PageSize [200 200] >> setpagedevice /Helvetica findfont 24 scalefont setfont ${body}`,
		],
		{ nice: false },
	);
}

beforeAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
});
afterAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
});

describe('image processing (real ImageMagick)', () => {
	const identity: MediaIdentity = {
		componentTipo: 'rsc29',
		sectionTipo: 'rsc170',
		sectionId: 5,
		lang: null,
	};

	test.if(HAVE_MAGICK)(
		'regenerateImage builds default quality + thumb + svg envelope',
		async () => {
			// A large original well over the 1.5MB pixel budget.
			await makeImage('/image/original/rsc29_rsc170_5.jpg', '3000x2000', 'red');
			const created = await regenerateImage(image, identity, pathOpts);
			// default quality + thumb + the SVG envelope (the edit view's display wrapper).
			expect(created.length).toBe(3);
			expect(created.some((p) => p.endsWith('.svg'))).toBe(true);

			// Default quality exists, is a REAL jpeg (not the source format under a .jpg
			// name — the temp-extension guard), and is resized within the pixel budget.
			const webPath = `${ROOT}/image/1.5MB/rsc29_rsc170_5.jpg`;
			expect(existsSync(webPath)).toBe(true);
			const webResult = await runBinary([resolveMagick(), 'identify', '-format', '%m', webPath], {
				nice: false,
			});
			expect(webResult.stdout.trim()).toBe('JPEG');
			const webDims = await getDimensions(webPath);
			expect(webDims.width * webDims.height).toBeLessThanOrEqual(525000 * 1.05); // budget + slack
			expect(webDims.width).toBeLessThan(3000); // downscaled

			// Thumb exists and fits within the thumb box (shrink-only).
			const thumbPath = `${ROOT}/image/thumb/rsc29_rsc170_5.jpg`;
			expect(existsSync(thumbPath)).toBe(true);
			const thumbDims = await getDimensions(thumbPath);
			expect(thumbDims.width).toBeLessThanOrEqual(222);
			expect(thumbDims.height).toBeLessThanOrEqual(148);

			// The SVG envelope embeds the default-quality raster via xlink:href.
			const svg = await Bun.file(`${ROOT}/image/svg/rsc29_rsc170_5.svg`).text();
			expect(svg).toContain('<image');
			expect(svg).toContain('/1.5MB/');
		},
	);

	test.if(HAVE_MAGICK)('never upscales: a small original stays small', async () => {
		const smallId: MediaIdentity = { ...identity, sectionId: 6 };
		await makeImage('/image/original/rsc29_rsc170_6.jpg', '100x80', 'blue');
		await regenerateImage(image, smallId, pathOpts);
		const dims = await getDimensions(`${ROOT}/image/1.5MB/rsc29_rsc170_6.jpg`);
		expect(dims.width).toBeLessThanOrEqual(100);
		expect(dims.height).toBeLessThanOrEqual(80);
	});

	test.if(HAVE_MAGICK)('resolveOriginalSource finds the original file', async () => {
		expect(resolveOriginalSource(image, identity, pathOpts)).toContain(
			'/image/original/rsc29_rsc170_5.jpg',
		);
		const absent: MediaIdentity = { ...identity, sectionId: 999 };
		expect(resolveOriginalSource(image, absent, pathOpts)).toBeNull();
	});
});

/**
 * SCENE SELECTION (2026-08-04). An image file is not necessarily ONE image, and
 * the derivative ladder used to assume it was: a 3-scene Photoshop TIFF made
 * ImageMagick write `<stem>-0/-1/-2.jpg` and never the atomic temp, so the
 * rename threw ENOENT, the record was left with `matrix.media` NULL, and the
 * split files stayed on disk. Every gate below is built on a REAL multi-image
 * fixture and fails on the pre-fix recipes.
 */
describe('multi-image sources: layers, pages and frames (real ImageMagick)', () => {
	const identity: MediaIdentity = {
		componentTipo: 'rsc29',
		sectionTipo: 'rsc170',
		sectionId: 20,
		lang: null,
	};

	test.if(HAVE_MAGICK)(
		'a LAYERED TIFF regenerates whole: one-scene thumb, no split debris, envelope agreeing with the tier',
		async () => {
			// The reported file's shape: scene 0 is a full-canvas composite, scenes 1-2
			// are smaller layers. Pre-fix this threw
			// `ENOENT … rename …tmp.<pid>.<rand>.jpg -> ….jpg` and left three orphans.
			const layered: MediaIdentity = { ...identity, sectionId: 20 };
			const source = `${ROOT}/image/original/rsc29_rsc170_20.tif`;
			await makeMagickFixture('/image/original/rsc29_rsc170_20.tif', [
				'-size',
				'300x200',
				'xc:red',
				'(',
				'-size',
				'60x40',
				'xc:blue',
				')',
				'(',
				'-size',
				'50x30',
				'xc:green',
				')',
			]);
			// The fixture is REALLY a sequence — without this the gate could pass on a
			// single-image file and prove nothing.
			expect((await probeImageSource(source)).sceneCount).toBe(3);

			const created = await regenerateImage(image, layered, pathOpts, 'tif');
			expect(created.length).toBe(3); // default tier + thumb + svg envelope

			const defaultPath = `${ROOT}/image/1.5MB/rsc29_rsc170_20.jpg`;
			const thumbPath = `${ROOT}/image/thumb/rsc29_rsc170_20.jpg`;
			expect(existsSync(defaultPath)).toBe(true);
			expect(existsSync(thumbPath)).toBe(true);
			// ONE image in each derivative: the source sequence was reduced, not split
			// across files and not carried into a container.
			expect((await probeImageSource(defaultPath)).sceneCount).toBe(1);
			expect((await probeImageSource(thumbPath)).sceneCount).toBe(1);
			// Nothing left behind ANYWHERE in the tree — no unrenamed temp, no `-N.jpg`.
			expect(writeDebrisUnder(ROOT)).toEqual([]);

			// The SVG envelope is the edit view's wrapper: it must describe the raster
			// it embeds, or the client renders the image at the wrong size (a blank or
			// clipped box). It is sized from the default tier's CANVAS.
			const dims = await getDimensions(defaultPath);
			const svg = await Bun.file(`${ROOT}/image/svg/rsc29_rsc170_20.svg`).text();
			expect(svg).toContain(`width="${dims.width}" height="${dims.height}"`);
		},
	);

	test.if(HAVE_MAGICK)('a multi-page TIFF thumbnails PAGE 1, not the last page', async () => {
		// The class a blanket `-flatten` gets measurably WRONG: flattening three
		// full-canvas pages stacks them and yields the LAST one. tif is allow-listed
		// for upload, so this is reachable in production, not a lab case.
		const paged: MediaIdentity = { ...identity, sectionId: 21 };
		await makeMagickFixture('/image/original/rsc29_rsc170_21.tif', [
			'-size',
			'200x150',
			'xc:red', // page 1
			'-size',
			'200x150',
			'xc:green', // page 2
			'-size',
			'200x150',
			'xc:blue', // page 3
		]);
		// The fixture really holds three pages — a container writer that collapsed
		// them would leave the colour assertions below proving nothing about selection.
		const source = `${ROOT}/image/original/rsc29_rsc170_21.tif`;
		expect((await probeImageSource(source)).sceneCount).toBe(3);
		const thumb = await buildThumbVersion(image, paged, source, pathOpts);
		expect((await probeImageSource(thumb)).sceneCount).toBe(1);
		const [r, g, b] = await pixelAt(thumb, 100, 74);
		expect(r).toBeGreaterThan(200); // page 1 is RED
		expect(g).toBeLessThan(60); // …not page 2 (green)
		expect(b).toBeLessThan(60); // …and not page 3 (blue), which -flatten yields
	});

	test.if(HAVE_MAGICK)('an ANIMATED GIF thumbnails FRAME 1, not the last frame', async () => {
		const anim: MediaIdentity = { ...identity, sectionId: 22 };
		await makeMagickFixture('/image/original/rsc29_rsc170_22.gif', [
			'-size',
			'200x150',
			'xc:red',
			'-size',
			'200x150',
			'xc:green',
			'-size',
			'200x150',
			'xc:blue',
		]);
		const source = `${ROOT}/image/original/rsc29_rsc170_22.gif`;
		// Same guard as the paged gate: three real frames, or the colour below is
		// simply the only frame there is.
		expect((await probeImageSource(source)).sceneCount).toBe(3);
		const thumb = await buildThumbVersion(image, anim, source, pathOpts);
		expect((await probeImageSource(thumb)).sceneCount).toBe(1);
		const [r, g, b] = await pixelAt(thumb, 100, 74);
		expect(r).toBeGreaterThan(200);
		expect(g).toBeLessThan(60);
		expect(b).toBeLessThan(60);
	});

	test.if(HAVE_MAGICK)('a DELTA-FRAME GIF thumbnails FRAME 1, not the stacked frames', async () => {
		// A delta GIF's later frames are PARTIAL rasters at a page offset. Frame 1 is
		// plain red; a `-flatten` composites the blue patch onto it, producing an
		// image that matches no frame the file actually declares. The probe point
		// (60,50) sits inside that patch, so it is exactly where the two differ.
		const delta: MediaIdentity = { ...identity, sectionId: 23 };
		await makeMagickFixture('/image/original/rsc29_rsc170_23.gif', [
			'-size',
			'200x150',
			'xc:red',
			'(',
			'-size',
			'60x40',
			'xc:blue',
			'-repage',
			'200x150+31+31',
			')',
		]);
		const source = `${ROOT}/image/original/rsc29_rsc170_23.gif`;
		const probe = await probeImageSource(source);
		expect(probe.sceneCount).toBe(2);
		expect(probe.hasRepresentativeScene).toBe(true); // frame 0 IS the full canvas
		const thumb = await buildThumbVersion(image, delta, source, pathOpts);
		const [r, g, b] = await pixelAt(thumb, 60, 50);
		expect(r).toBeGreaterThan(200); // frame 1 is plain RED here
		expect(g).toBeLessThan(60);
		expect(b).toBeLessThan(60); // the composited patch would be BLUE here
	});

	test.if(HAVE_MAGICK)('a TRANSPARENT PNG composites to WHITE in BOTH tiers', async () => {
		// Bare JPEG encoding does NOT composite alpha: it drops the plane and keeps
		// whatever hidden RGB the producing application left underneath — measured as
		// red, black and white on different sources. The thumb recipe had no
		// `-background` at all, so every transparent-PNG thumbnail carried a
		// NONDETERMINISTIC background (this fixture's is black; the reported file's
		// was srgb(254,0,0)). Only `-background X -flatten` fixes it.
		const alpha: MediaIdentity = { ...identity, sectionId: 24 };
		await makeMagickFixture('/image/original/rsc29_rsc170_24.png', [
			'-size',
			'300x200',
			'xc:red',
			'-alpha',
			'transparent',
		]);
		await regenerateImage(image, alpha, pathOpts, 'png');
		for (const tier of ['1.5MB', 'thumb']) {
			const [r, g, b] = await pixelAt(`${ROOT}/image/${tier}/rsc29_rsc170_24.jpg`, 100, 74);
			expect([tier, r > 250, g > 250, b > 250]).toEqual([tier, true, true, true]);
		}
	});

	test.if(HAVE_MAGICK)(
		'regenerateImage builds the THUMB FROM THE DEFAULT TIER, never the raw original',
		async () => {
			// v6 create_thumb read the default-quality file, so the thumb recipe could
			// not meet a sequence at all. The observable proof is the composite warning:
			// this fixture's frame 0 sits at an offset, so it declares NO representative
			// image and every build FROM IT warns. The default tier is a single-scene
			// jpg, so a thumb built from it warns not at all.
			//   thumb from the DEFAULT tier → exactly ONE warning (the tier build).
			//   thumb from the RAW ORIGINAL → two, one naming the thumb quality.
			const offset: MediaIdentity = { ...identity, sectionId: 25 };
			await makeMagickFixture('/image/original/rsc29_rsc170_25.gif', [
				'(',
				'-size',
				'60x40',
				'xc:red',
				'-repage',
				'200x150+31+31',
				')',
				'(',
				'-size',
				'200x150',
				'xc:blue',
				'-repage',
				'200x150+0+0',
				')',
			]);
			const source = `${ROOT}/image/original/rsc29_rsc170_25.gif`;
			const probe = await probeImageSource(source);
			expect(probe.sceneCount).toBe(2);
			expect(probe.hasRepresentativeScene).toBe(false); // the fixture's whole job

			const warnings = await captureWarnings(async () => {
				await regenerateImage(image, offset, pathOpts, 'gif');
			});
			const composite = warnings.filter((line) =>
				line.includes('declares no representative image'),
			);
			expect(composite.length).toBe(1);
			expect(composite[0]).toContain(image.defaultQuality);
			expect(composite[0]).not.toContain(config.media.thumb.quality);
			// And the thumb is still exactly one image.
			const thumbPath = `${ROOT}/image/thumb/rsc29_rsc170_25.jpg`;
			expect((await probeImageSource(thumbPath)).sceneCount).toBe(1);
			expect(writeDebrisUnder(ROOT)).toEqual([]);
		},
	);

	test.if(HAVE_MAGICK)(
		'MIXED-SIZE pages keep page 1 whole — page 2 is not stamped over it',
		async () => {
			// A bound volume with a landscape fold-out: page 1 portrait, page 2
			// landscape. Measured on IM 7.1.2, `-flatten` over this source writes page
			// 1's canvas with page 2 COMPOSITED ON TOP (it covers the whole top
			// 300x300, 75 % of the frame) — a corrupt derivative that looks plausible
			// on a contact sheet. The probe has to keep
			// this class on the representative branch, and the pixel below is where the
			// two answers differ: page 2 covers the top-left corner.
			const mixed: MediaIdentity = { ...identity, sectionId: 26 };
			const source = `${ROOT}/image/original/rsc29_rsc170_26.tif`;
			await makeMagickFixture('/image/original/rsc29_rsc170_26.tif', [
				'-size',
				'300x400',
				'xc:red', // page 1, portrait
				'-size',
				'400x300',
				'xc:blue', // page 2, landscape
			]);
			const probe = await probeImageSource(source);
			expect(probe.sceneCount).toBe(2);
			// The canvas is page 1's box, not an 400x400 union of the two pages: the
			// resize budget and the SVG envelope must describe the file written.
			expect([probe.canvasWidth, probe.canvasHeight]).toEqual([300, 400]);

			await regenerateImage(image, mixed, pathOpts, 'tif');
			const defaultPath = `${ROOT}/image/1.5MB/rsc29_rsc170_26.jpg`;
			const [r, g, b] = await pixelAt(defaultPath, 10, 10);
			expect(r).toBeGreaterThan(200); // page 1 is RED here
			expect(b).toBeLessThan(60); // a stamped page 2 would be BLUE
			expect(g).toBeLessThan(60);
			// And the envelope agrees with the raster it wraps.
			const dims = await getDimensions(defaultPath);
			const svg = await Bun.file(`${ROOT}/image/svg/rsc29_rsc170_26.svg`).text();
			expect(svg).toContain(`width="${dims.width}" height="${dims.height}"`);
			expect(writeDebrisUnder(ROOT)).toEqual([]);
		},
	);

	test.if(HAVE_MAGICK)('a CMYK master converts to sRGB in BOTH tiers', async () => {
		// The CMYK branch injects two ICC profiles BY ABSOLUTE PATH. From the cutover
		// to 2026-08-04 it named `engine/icc/…`, a directory the repo did not contain:
		// ImageMagick then exits 1 and writes NOTHING, so a CMYK master — an ordinary
		// print-archive scan — lost its entire derivative ladder, and after the
		// non-fatal-derivative change it would have done so as a log line on an
		// otherwise successful import. No argv-shape assertion can see that, which is
		// why this gate runs the real recipe end to end.
		const cmyk: MediaIdentity = { ...identity, sectionId: 27 };
		const source = `${ROOT}/image/original/rsc29_rsc170_27.tif`;
		await makeMagickFixture('/image/original/rsc29_rsc170_27.tif', [
			'-size',
			'300x200',
			'gradient:red-blue',
			'-colorspace',
			'CMYK',
			'-depth',
			'8',
		]);
		// The fixture really is CMYK — otherwise the branch under test never runs.
		expect(/cmyk/i.test((await probeImageSource(source)).colorspace)).toBe(true);

		await regenerateImage(image, cmyk, pathOpts, 'tif');
		for (const tier of ['1.5MB', 'thumb']) {
			const path = `${ROOT}/image/${tier}/rsc29_rsc170_27.jpg`;
			expect([tier, existsSync(path)]).toEqual([tier, true]);
			// A CMYK JPEG renders INVERTED in every browser: the tier must be sRGB.
			const colorspace = (await probeImageSource(path)).colorspace;
			expect([tier, /cmyk/i.test(colorspace)]).toEqual([tier, false]);
		}
	});
});

/**
 * The OUTPUT CONTRACT every magick run is held to (runMagickTo). It is not
 * exported — it is exercised through the public runners, which is also the only
 * way to prove the contract holds where callers actually meet it. `rotateImage`
 * is the vehicle: its recipe legitimately has no collapse operator (a rotation
 * must not composite a stack), so a sequence source reaches the post-condition
 * exactly as the pre-fix thumb recipe did.
 */
describe('media write contract: a run must prove it produced ONE file', () => {
	const contractDir = `${ROOT}/contract`;
	const sequenceSource = `${contractDir}/sequence.tif`;

	beforeAll(async () => {
		mkdirSync(contractDir, { recursive: true });
		const result = await runBinary(
			[
				resolveMagick(),
				'-size',
				'120x90',
				'xc:red',
				'-size',
				'120x90',
				'xc:green',
				'-size',
				'120x90',
				'xc:blue',
				sequenceSource,
			],
			{ nice: false },
		);
		if (HAVE_MAGICK && result.exitCode !== 0) {
			throw new Error(
				`sequence fixture build failed (exit ${String(result.exitCode)}): ${result.stderr}`,
			);
		}
	});

	test.if(HAVE_MAGICK)(
		'a sequence written to a per-image target is REFUSED and its split siblings are swept',
		async () => {
			// Measured 2026-08-04: this run exits 0 with EMPTY stderr and writes
			// `<stem>-0.jpg`, `-1`, `-2`. No text check can ever see it, and
			// `existsSync` alone would report success — the target never appears.
			const target = `${contractDir}/rotated.jpg`;
			await expect(rotateImage(sequenceSource, target, 90)).rejects.toThrow(
				/produced no output file/,
			);
			// The diagnostic must NAME the debris it collected, or an operator reading
			// the log has no way to tell this class from a permissions failure.
			await expect(rotateImage(sequenceSource, target, 90)).rejects.toThrow(
				/wrote 3 sequence file\(s\) instead, now removed/,
			);
			expect(existsSync(target)).toBe(false);
			expect(readdirSync(contractDir).filter((n) => /^rotated-\d+\.jpg$/.test(n))).toEqual([]);
		},
	);

	test.if(HAVE_MAGICK)('a CONTAINER target holding 3 scenes is refused and removed', async () => {
		// The same failure against tif/avif: ONE file, three scenes, exit 0 — the case
		// an existence-only post-condition passes. `avif` is a configurable
		// alternative extension, so this is not hypothetical.
		const target = `${contractDir}/rotated.tif`;
		await expect(rotateImage(sequenceSource, target, 90)).rejects.toThrow(
			/wrote 3 images .* was not reduced to one image/,
		);
		expect(existsSync(target)).toBe(false); // unlinked, never shipped
	});

	test.if(HAVE_MAGICK)(
		'a decode-warning source that produced a sound file is NOT failed',
		async () => {
			// A truncated-but-decodable JPEG: ImageMagick prints 'Premature end of JPEG
			// file' / 'Corrupt JPEG data' on stderr and still writes a correct thumbnail.
			// That is a WARNING, and a warning must never fail a conversion — the check is
			// existence-first for exactly this reason.
			//
			// HONEST LIMIT: the sibling arm — a NON-ZERO exit that still wrote a sound
			// file — is not gated here. Five corruption classes were tried against
			// ImageMagick 7.1.2-18 (truncated jpg/png/gif/tif, bad ICC profile, bogus
			// colour); every one that exited non-zero wrote NO file at all, so no public
			// recipe on this build produces that combination.
			const full = `${contractDir}/full.jpg`;
			const truncated = `${contractDir}/truncated.jpg`;
			await runBinary([resolveMagick(), '-size', '400x300', 'gradient:red-blue', full], {
				nice: false,
			});
			const bytes = readFileSync(full);
			writeFileSync(truncated, bytes.subarray(0, Math.floor(bytes.length / 2)));

			const target = `${contractDir}/warned.jpg`;
			await buildThumb(truncated, target, { selection: 'representative', background: '#ffffff' });
			expect(existsSync(target)).toBe(true);
			expect((await probeImageSource(target)).sceneCount).toBe(1);
		},
	);
});

describe('pdf processing (real pdf tools + ImageMagick)', () => {
	const identity: MediaIdentity = {
		componentTipo: 'rsc37',
		sectionTipo: 'rsc176',
		sectionId: 5,
		lang: null,
	};
	// S3-67: binary paths come from config (env-overridable, platform-defaulted).
	const HAVE_PDF = have(config.media.binaries.pdftotext);

	test.if(HAVE_MAGICK && HAVE_PDF && HAVE_GS)(
		'regeneratePdf builds web copy + jpg cover + thumb',
		async () => {
			await makePdf('/pdf/original/rsc37_rsc176_5.pdf');
			const created = await regeneratePdf(pdf, identity, pathOpts);
			expect(created.length).toBe(3);
			expect(existsSync(`${ROOT}/pdf/web/rsc37_rsc176_5.pdf`)).toBe(true);
			expect(existsSync(`${ROOT}/pdf/web/rsc37_rsc176_5.jpg`)).toBe(true); // cover
			expect(existsSync(`${ROOT}/pdf/thumb/rsc37_rsc176_5.jpg`)).toBe(true);
		},
	);

	test.if(HAVE_MAGICK && HAVE_GS)(
		'buildThumbVersion rasterizes ONLY the first page of a multi-page PDF (no -N split → no rename ENOENT)',
		async () => {
			const multiId: MediaIdentity = { ...identity, sectionId: 8 };
			await makeMultiPagePdf('/pdf/original/rsc37_rsc176_8.pdf', 3);
			const source = resolveOriginalSource(pdf, multiId, pathOpts, 'pdf');
			expect(source).not.toBeNull();
			// Before the fix this threw ENOENT: the recipe wrote <stem>-0/-1/-2.jpg
			// (one per page) and the bare temp the rename targets never existed.
			const thumb = await buildThumbVersion(pdf, multiId, source as string, pathOpts);
			expect(existsSync(thumb)).toBe(true);
			// Exactly one file — the per-page split siblings must NOT be produced.
			expect(existsSync(thumb.replace(/\.jpg$/, '-0.jpg'))).toBe(false);
			// …and no unrenamed temp either: eleven `pdf/thumb/…tmp.…-N.jpg` orphans
			// were found in the live tree, because the write had no temp lifecycle at
			// all. The atomic writer now sweeps its own debris in a `finally`.
			expect(readdirSync(`${ROOT}/pdf/thumb`).filter((n) => n.includes('.tmp.'))).toEqual([]);
			const dims = await getDimensions(thumb);
			expect(dims.width).toBeLessThanOrEqual(config.media.thumb.width);
			expect(dims.height).toBeLessThanOrEqual(config.media.thumb.height);
		},
	);

	test.if(HAVE_MAGICK && HAVE_PDF && HAVE_GS)(
		'pdftotext extracts the embedded text + page count',
		async () => {
			await makePdf('/pdf/original/rsc37_rsc176_7.pdf');
			const text = await extractText(`${ROOT}/pdf/original/rsc37_rsc176_7.pdf`, `${ROOT}/out.txt`, {
				method: 'text',
			});
			expect(text).toContain('HELLO');
			expect(await getPageCount(`${ROOT}/pdf/original/rsc37_rsc176_7.pdf`)).toBe(1);
		},
	);
});

describe('av probe (real ffprobe on a generated clip)', () => {
	// S3-67: binary paths come from config (env-overridable, platform-defaulted).
	const ffmpegBin = config.media.binaries.ffmpeg;
	const HAVE_FFMPEG = have(ffmpegBin);

	test.if(HAVE_FFMPEG)('probeStreams reports the video stream shape', async () => {
		mkdirSync(`${ROOT}/av`, { recursive: true });
		const clip = `${ROOT}/av/clip.mp4`;
		// 1s 320x240 test clip.
		await runBinary(
			[ffmpegBin, '-f', 'lavfi', '-i', 'testsrc=size=320x240:duration=1:rate=25', '-y', clip],
			{ nice: false },
		);
		const probe = await probeStreams(clip);
		const video = probe?.streams?.find((s) => s.codec_type === 'video');
		expect(video).toBeDefined();
		expect(video!.width).toBe(320);
		expect(video!.height).toBe(240);
	});
});
