/**
 * Phase C gate: the processing engines run REAL binaries (ImageMagick/ffmpeg/
 * pdf tools) on generated fixtures. Parity is REALISTIC, not byte-equality —
 * encoder builds differ across versions (engineering/MEDIA_SPEC.md §7 Phase C): we
 * assert dimensions/format/colorspace via identify, pdftotext text content, and
 * ffprobe stream shape. Skipped honestly when a binary is absent.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { config } from '../../src/config/config.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import { probeStreams } from '../../src/core/media/engine/ffmpeg.ts';
import { getDimensions, resolveMagick } from '../../src/core/media/engine/imagemagick.ts';
import { extractText, getPageCount } from '../../src/core/media/engine/pdf.ts';
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
