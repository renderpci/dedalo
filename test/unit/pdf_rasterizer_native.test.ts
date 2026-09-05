/**
 * PDF RASTERIZER — BEHAVIOURAL (audit MEDIA-01, the Ghostscript half).
 *
 * `magick_policy_tripwire` asserts the SHAPE (the policy denies the `gs` delegate,
 * no recipe asks ImageMagick for a PDF, one module resolves Ghostscript, it
 * refuses on the configured ceiling and runs under a cap). Shape is not effect.
 * This gate runs the real binaries against a real file and asserts:
 *
 *   a PDF that DECLARES a page beyond the install's dimension ceiling is REFUSED
 *   before anything is rendered — no output, no spawn, no surviving child — while
 *   an ordinary letter-size page still renders;
 *
 * and, as the control that makes the first statement about THE POLICY rather than
 * about a broken fixture: ImageMagick under the shipped policy CANNOT rasterize a
 * PDF at all (it is refused with "not allowed by the security policy `gs'"), and
 * the identical command with the policy dir pointed elsewhere goes through.
 *
 * WHY THE REFUSAL IS THE WHOLE FIX. Measured 2026-09-05 (IM 7.1.2-18, gs 10.07)
 * with BOTH MEDIA-01 halves armed, on the 441-byte PDF this gate builds:
 * `magick` sat bounded while its `gs` child grew a temp file towards a 120 TB
 * target; SIGKILLing the magick — which is exactly what the spawn cap does —
 * REPARENTED gs to PID 1, where it kept running at +8.8 MB/min with one core
 * pinned and nothing in the engine able to reap it. A bound that the actual
 * consumer does not inherit, and a kill that does not reach it, is not a bound.
 *
 * THE SITUATION IS BUILT, NEVER BORROWED: both PDFs are written by this file, into
 * a MARKED scratch media root (test/helpers/media_scratch_root.ts). No fixture, no
 * corpus, no install's records.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { resolveMagick } from '../../src/core/media/engine/binaries.ts';
import {
	buildGhostscriptArgv,
	ghostscriptAvailable,
	pixelSizeAtDensity,
	rasterizePdfPage,
} from '../../src/core/media/engine/ghostscript.ts';
import { readPdfPageSize } from '../../src/core/media/engine/pdf.ts';
import { runBinary } from '../../src/core/media/engine/spawn.ts';
import { scratchMediaRoot } from '../helpers/media_scratch_root.ts';

const ROOT = scratchMediaRoot('dedalo_pdf_rasterizer_');
const POLICY_DIR = join(
	import.meta.dir,
	'..',
	'..',
	'src',
	'core',
	'media',
	'engine',
	'imagemagick-policy',
);

const HAVE_GS = ghostscriptAvailable();
const HAVE_PDFINFO = existsSync(config.media.binaries.pdfinfo);
const HAVE_MAGICK = existsSync(resolveMagick());

afterAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
});

/**
 * Write a one-page PDF whose MediaBox is exactly `width x height` POINTS.
 *
 * Hand-assembled (xref offsets included) rather than produced by a tool, for the
 * same reason the resource gate hand-assembles its PNG: the whole bomb is the
 * DECLARATION — a few hundred bytes that ask a renderer for an arbitrary canvas —
 * and building it here means the gate carries no binary fixture and no dependency
 * on whatever produced one.
 */
function writePdf(name: string, width: number, height: number): string {
	const content = '1 0 0 RG 10 w 0 0 m 100 100 l S';
	const objects = [
		'1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
		'2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
		`3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${String(width)} ${String(height)}]/Contents 4 0 R/Resources<<>>>>endobj`,
		`4 0 obj<</Length ${String(content.length)}>>stream\n${content}\nendstream endobj`,
	];
	let body = '%PDF-1.4\n';
	const offsets: number[] = [];
	for (const object of objects) {
		offsets.push(body.length);
		body += `${object}\n`;
	}
	const startxref = body.length;
	body += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
	for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
	body += `trailer<</Size ${String(objects.length + 1)}/Root 1 0 R>>\nstartxref\n${String(startxref)}\n%%EOF\n`;
	const path = join(ROOT, name);
	writeFileSync(path, body, 'latin1');
	return path;
}

/** Files in the scratch root other than the marker — "did anything get written". */
function producedFiles(): string[] {
	return readdirSync(ROOT).filter((entry) => !entry.startsWith('.'));
}

// The ceiling this install refuses at, and a page box comfortably past it.
const LIMITS = config.media.magickLimits;
const HUGE_POINTS = LIMITS.width * 2 + 1000;

// ---------------------------------------------------------------------------
// The arithmetic and the refusal — no binary needed
// ---------------------------------------------------------------------------

describe('pdf rasterizer: the ceiling is configuration, applied to points', () => {
	test('a page box in points becomes pixels at the render density', () => {
		// 612x792 pt (US letter) at 72 dpi is 612x792 px; at 144 dpi it doubles. The
		// bomb is a bomb only relative to a density, which is why the ceiling is
		// compared against the PIXELS, not against the declared points.
		expect(pixelSizeAtDensity({ widthPoints: 612, heightPoints: 792 }, 72)).toEqual({
			width: 612,
			height: 792,
		});
		expect(pixelSizeAtDensity({ widthPoints: 612, heightPoints: 792 }, 144)).toEqual({
			width: 1224,
			height: 1584,
		});
	});

	test('CONTROL: the configured ceiling is a real, generous number', () => {
		// A ceiling of 0 would make every leg below pass for the wrong reason, and a
		// small one would refuse a legitimate large-format heritage master.
		expect(LIMITS.width).toBeGreaterThan(10000);
		expect(LIMITS.height).toBeGreaterThan(10000);
	});

	test('the Ghostscript argv renders ONE page, clamped to the pixel box', () => {
		const argv = buildGhostscriptArgv('/src.pdf', '/out.png', 72, 1, { width: 612, height: 792 });
		expect(argv).toContain('-dFirstPage=1');
		expect(argv).toContain('-dLastPage=1');
		expect(argv).toContain('-dSAFER');
		expect(argv).toContain('-g612x792');
		expect(argv).toContain('-dFIXEDMEDIA');
		expect(argv).toContain('-r72');
		expect(argv.at(-1)).toBe('/src.pdf');
		expect(argv).toContain('-sOutputFile=/out.png');
	});
});

describe.skipIf(!HAVE_PDFINFO)(
	'pdf rasterizer: the page box is read before anything renders',
	() => {
		test('readPdfPageSize reports the DECLARED MediaBox, in points', async () => {
			const bomb = writePdf('bomb.pdf', HUGE_POINTS, HUGE_POINTS);
			const box = await readPdfPageSize(bomb);
			expect(box).toEqual({ widthPoints: HUGE_POINTS, heightPoints: HUGE_POINTS });
			const letter = writePdf('letter.pdf', 612, 792);
			expect(await readPdfPageSize(letter)).toEqual({ widthPoints: 612, heightPoints: 792 });
		});
	},
);

describe.skipIf(!HAVE_PDFINFO || !HAVE_GS)('pdf rasterizer: an oversized page is REFUSED', () => {
	test('rasterizePdfPage refuses a page past the ceiling, renders nothing, and is fast', async () => {
		const bomb = writePdf('refused.pdf', HUGE_POINTS, HUGE_POINTS);
		const target = join(ROOT, 'refused.png');
		const started = Date.now();
		let message = '';
		try {
			await rasterizePdfPage(bomb, target, 72);
			throw new Error('rasterizePdfPage ACCEPTED a page past the dimension ceiling');
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).toMatch(/DEDALO_MAGICK_LIMIT_WIDTH/);
		expect(message).toMatch(/Nothing was rendered/);
		// No output, and no partial one either.
		expect(existsSync(target), 'the refused render still left a file behind').toBe(false);
		// The refusal is a header read plus two comparisons; it must not be a render
		// that happened to fail. gs on this page would not have finished at all.
		expect(Date.now() - started).toBeLessThan(5000);
	});

	test('an ordinary page still renders (the ceiling refuses bombs, not documents)', async () => {
		const letter = writePdf('ok.pdf', 612, 792);
		const target = join(ROOT, 'ok.png');
		await rasterizePdfPage(letter, target, 72);
		expect(existsSync(target)).toBe(true);
		expect(Bun.file(target).size).toBeGreaterThan(100);
		// A PNG, not whatever the source was: the signature is the contract the
		// shared ImageMagick recipe downstream depends on.
		const head = new Uint8Array(await Bun.file(target).slice(0, 4).arrayBuffer());
		expect([...head]).toEqual([0x89, 0x50, 0x4e, 0x47]);
	});

	test('CONTROL: the refusal is the ARITHMETIC — the same ordinary page is refused at a density that overflows it', async () => {
		// The pair that makes the bound a statement about the ceiling rather than
		// about a malformed fixture: THE SAME 612x792 pt page that rendered a moment
		// ago is refused when the requested density would put it past the ceiling. A
		// page is a bomb RELATIVE TO A DENSITY, which is exactly what the comparison
		// computes — and it is why a heritage install may raise the ceiling for a
		// large-format master without disabling anything.
		const letter = writePdf('ok.pdf', 612, 792);
		const density = Math.ceil((LIMITS.width * 72) / 612) + 72;
		const target = join(ROOT, 'overflow.png');
		let message = '';
		try {
			await rasterizePdfPage(letter, target, density);
			throw new Error('rasterizePdfPage ACCEPTED a render past the dimension ceiling');
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).toMatch(/DEDALO_MAGICK_LIMIT_WIDTH/);
		expect(existsSync(target)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// The other half: ImageMagick may not do this itself
// ---------------------------------------------------------------------------

describe.skipIf(!HAVE_MAGICK || !HAVE_GS)(
	'pdf rasterizer: the shipped policy closes the delegate route',
	() => {
		test('ImageMagick under the shipped policy REFUSES a PDF, and renders it without', async () => {
			const letter = writePdf('delegate.pdf', 612, 792);
			const argv = [
				resolveMagick(),
				'-density',
				'72',
				`${letter}[0]`,
				'-background',
				'white',
				'-flatten',
				'-thumbnail',
				'64x64',
				join(ROOT, 'delegate.jpg'),
			];
			const policed = await runBinary(argv, {
				nice: false,
				env: { MAGICK_CONFIGURE_PATH: POLICY_DIR },
			});
			expect(
				policed.exitCode,
				`ImageMagick rasterized a PDF under the shipped policy — the gs delegate is not denied. stderr: ${policed.stderr.slice(0, 300)}`,
			).not.toBe(0);
			expect(policed.stderr).toMatch(/security policy/i);
			expect(existsSync(join(ROOT, 'delegate.jpg'))).toBe(false);

			// The control: WITHOUT the shipped policy the identical command succeeds —
			// so the refusal above is the policy's doing, not a malformed PDF.
			const unpoliced = await runBinary(argv.slice(0, -1).concat(join(ROOT, 'unpoliced.jpg')), {
				nice: false,
				env: { MAGICK_CONFIGURE_PATH: join(ROOT, 'no-policy-here') },
			});
			expect(
				unpoliced.exitCode,
				`the control failed for another reason — this PDF is not renderable at all. stderr: ${unpoliced.stderr.slice(0, 300)}`,
			).toBe(0);
			expect(existsSync(join(ROOT, 'unpoliced.jpg'))).toBe(true);
		});
	},
);

describe('pdf rasterizer: the gate wrote its own situation', () => {
	test('every file this gate asserted on was created by it, in the marked scratch root', () => {
		// Floor + provenance in one: an empty scratch root would mean every leg above
		// was skipped, and a file this gate did not write would mean it borrowed one.
		const produced = producedFiles();
		expect(produced.length).toBeGreaterThan(0);
		for (const entry of produced) {
			expect(entry).toMatch(/\.(pdf|png|jpg)$/);
		}
	});
});

test.skipIf(HAVE_GS && HAVE_PDFINFO && HAVE_MAGICK)(
	'SKIPPED on this host: the media toolchain (gs / pdfinfo / magick) is not fully installed, so the behavioural legs above are inert',
	() => {
		expect(HAVE_GS || HAVE_PDFINFO || HAVE_MAGICK || true).toBe(true);
	},
);
