/**
 * PDF RASTERIZER — the one place a PDF page becomes pixels, and the one place
 * Ghostscript is spawned.
 *
 * WHY IT IS NOT IMAGEMAGICK, which rasterizes every other raster source here.
 * ImageMagick cannot read a PDF by itself: it hands the file to Ghostscript as a
 * DELEGATE — a second process, forked by ImageMagick, that this engine never sees.
 * That is not a stylistic objection, it is the measured hole audit MEDIA-01 left
 * open after the resource bound landed (2026-09-05, IM 7.1.2-18 / gs 10.07 on this
 * box), with a 441-byte PDF whose MediaBox declares 200000x200000:
 *
 *   magick <policy + every -limit> -density 72 'bomb.pdf[0]' … thumb.jpg
 *     → still running at 5 min; `magick` (bounded) waiting on `gs` (bounded by
 *       nothing), gs writing an intermediate that grows monotonically towards a
 *       120 TB target, i.e. it stops when the FILESYSTEM does.
 *   kill -9 <the magick we spawned>          (what spawn.ts's cap does)
 *     → gs REPARENTS TO PID 1 and keeps running: +8.8 MB/min, one core pinned,
 *       forever. The request path reported a clean failure to the user while the
 *       actual resource consumer survived it. K uploads = K permanent orphans,
 *       and nothing in this tree ever reaps them.
 *
 * Neither half of the MEDIA-01 bound can reach that child: the `-limit` argv
 * govern the ImageMagick process, and the policy's `domain="resource"` block
 * governs ImageMagick processes — gs is neither. A delegate is, by construction,
 * a process the engine did not spawn and therefore cannot bound, cannot kill and
 * cannot even name.
 *
 * SO THE ENGINE SPAWNS IT. This is the same decision `engine/svg.ts` made for
 * librsvg and for the same shape of reason — the renderer that reads an untrusted
 * document is a program WE start, under the spawn discipline, with our cap:
 *
 *  - the page box is read FIRST, with poppler's `pdfinfo` (`readPdfPageSize`,
 *    engine/pdf.ts), which parses a header and rasterizes nothing;
 *  - a page whose pixel size at the requested density exceeds the install's
 *    DEDALO_MAGICK_LIMIT_WIDTH / _HEIGHT ceiling is REFUSED BEFORE ANY RENDER —
 *    the same ceiling ImageMagick refuses a raster bomb at, applied to the one
 *    source class ImageMagick never gets to judge;
 *  - the render runs through `runBinary`, so it carries the total cap and, when
 *    that cap fires, the process killed IS the process doing the work;
 *  - the PNG it writes is an INTERMEDIATE. The cover and the thumb are still
 *    produced by the shared ImageMagick recipe from that raster, so a PDF
 *    derivative keeps the same box, background, scene contract and atomic write
 *    as every other one — and the file the record indexes is still written under
 *    the hardened policy and the resource bound.
 *
 * The policy denies the `gs` delegate outright (imagemagick-policy/policy.xml), so
 * this is not merely the preferred route, it is the only one: an ImageMagick asked
 * for a PDF now fails with "not allowed by the security policy `gs'" instead of
 * quietly forking an unbounded child.
 *
 * PHP anchor: component_pdf::create_thumb / create_alternative_version — same
 * intent (first page, density, flatten onto white), different renderer for the
 * reason above.
 */

import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../../../config/config.ts';
import { DedaloError } from '../../errors/dedalo_error.ts';
import { withConverterSlot } from './admission.ts';
import { readPdfPageSize } from './pdf.ts';
import { assertSpawnOk, runBinary } from './spawn.ts';

/** True when Ghostscript is installed where the config says (boot/gear probe). */
export function ghostscriptAvailable(): boolean {
	return existsSync(config.media.binaries.ghostscript);
}

/**
 * What an operator has to do when it is missing — kept beside the probe for the
 * same reason `RSVG_MISSING_HINT` is: "no rasterizer" alone is not actionable,
 * and a PDF with no cover is an INSTALL fact, not a bad file.
 */
export const GHOSTSCRIPT_MISSING_HINT =
	"PDF rasterization needs Ghostscript's 'gs' (ImageMagick cannot do it — the hardened policy denies the gs delegate, because a delegate child is a process the engine can neither bound nor kill)";

/** Points per inch — the PDF user-space unit. A page box is measured in these. */
const POINTS_PER_INCH = 72;

/** Pixel size of a page box rendered at `density` dpi, rounded up like gs does. */
export function pixelSizeAtDensity(
	page: { widthPoints: number; heightPoints: number },
	density: number,
): { width: number; height: number } {
	const scale = density / POINTS_PER_INCH;
	return {
		width: Math.ceil(page.widthPoints * scale),
		height: Math.ceil(page.heightPoints * scale),
	};
}

/**
 * The Ghostscript argv. Pure, like every other `build*Argv` in this engine, so the
 * recipe can be asserted without spawning anything.
 *
 * `-dSAFER` (default since gs 9.50, stated anyway — this reads untrusted uploads),
 * `-dBATCH -dNOPAUSE -dNOPROMPT -q` for a non-interactive single run,
 * `-dFirstPage/-dLastPage` for the ONE page asked for (never the whole document:
 * a 4000-page PDF cover is one page's worth of work), `-sDEVICE=png16m` for a
 * 24-bit RGB raster the shared recipe can take from here, and `-g<w>x<h>` +
 * `-dFIXEDMEDIA -dPDFFitPage` so the render is CLAMPED to the pixel box this
 * module already refused to exceed — a page that lies about its own MediaBox in a
 * way pdfinfo did not see still cannot allocate more than the box.
 */
export function buildGhostscriptArgv(
	source: string,
	target: string,
	density: number,
	page: number,
	box: { width: number; height: number },
): string[] {
	if (!Number.isFinite(density) || density <= 0) {
		throw new DedaloError('request.invalid_options', {
			message: `rasterizePdfPage: invalid density '${String(density)}'`,
			publicMessage: 'The requested render density is not valid.',
		});
	}
	if (!Number.isInteger(page) || page < 1) {
		throw new DedaloError('request.invalid_options', {
			message: `rasterizePdfPage: invalid page '${String(page)}'`,
			publicMessage: 'The requested page number is not valid.',
		});
	}
	return [
		config.media.binaries.ghostscript,
		'-q',
		'-dSAFER',
		'-dBATCH',
		'-dNOPAUSE',
		'-dNOPROMPT',
		'-dNumRenderingThreads=1',
		`-dFirstPage=${String(page)}`,
		`-dLastPage=${String(page)}`,
		'-sDEVICE=png16m',
		`-r${String(density)}`,
		`-g${String(box.width)}x${String(box.height)}`,
		'-dFIXEDMEDIA',
		'-dPDFFitPage',
		'-dTextAlphaBits=4',
		'-dGraphicsAlphaBits=4',
		`-sOutputFile=${target}`,
		source,
	];
}

/**
 * Rasterize ONE page of a PDF into `target` (a `.png`), or throw.
 *
 * THE REFUSAL IS THE POINT and it happens before the spawn: a page box that
 * renders past the install's dimension ceiling is a decode bomb whichever program
 * would have drawn it, and the cheapest place to say so is here, holding two
 * numbers out of a header. `media.engine_unavailable` is not that case — that is
 * the install lacking gs — so an oversized page raises `media.invalid_source`,
 * which is what the operator has to see on the record.
 */
export async function rasterizePdfPage(
	source: string,
	target: string,
	density: number,
	page = 1,
): Promise<string> {
	if (!ghostscriptAvailable()) {
		// Operator disclosure: the remedy names a filesystem path, so it stays in the
		// log; the wire says only "not available on this server".
		throw new DedaloError('media.engine_unavailable', {
			message: `rasterizePdfPage: ${GHOSTSCRIPT_MISSING_HINT} — not found at '${config.media.binaries.ghostscript}'. Install Ghostscript (brew install ghostscript / apt install ghostscript) or set DEDALO_GS_PATH.`,
			coordinates: { binary: config.media.binaries.ghostscript },
		});
	}
	const limits = config.media.magickLimits;
	const pageBox = await readPdfPageSize(source, page);
	const box = pixelSizeAtDensity(pageBox, density);
	if (box.width > limits.width || box.height > limits.height) {
		throw new DedaloError('media.too_large', {
			message: `rasterizePdfPage: page ${String(page)} of ${source} is ${String(pageBox.widthPoints)}x${String(pageBox.heightPoints)} points, which is ${String(box.width)}x${String(box.height)} pixels at ${String(density)} dpi — above this install's ceiling of ${String(limits.width)}x${String(limits.height)} (DEDALO_MAGICK_LIMIT_WIDTH / DEDALO_MAGICK_LIMIT_HEIGHT). Nothing was rendered.`,
			publicMessage: 'This PDF declares a page too large to be rendered on this server.',
			coordinates: {
				widthPixels: box.width,
				heightPixels: box.height,
				limitWidth: limits.width,
				limitHeight: limits.height,
			},
		});
	}
	// A CONVERTER PERMIT (engine/admission.ts): the pre-render refusal and the spawn
	// cap bound THIS render; the permit bounds how many run at once, which is what a
	// request path multiplies.
	const result = await withConverterSlot('ghostscript', () =>
		runBinary(buildGhostscriptArgv(source, target, density, page, box), {
			nice: true,
			// A BOUNDED command under a TOTAL budget, not the idle policy: a page render
			// is expected to finish, and the budget is the SAME configured seconds
			// ImageMagick gets (`-limit time`), so one key bounds the whole rasterization
			// of a document however it is drawn.
			timeoutMs: limits.time * 1000,
			// Ghostscript's own scratch (band buffers, the intermediate raster) follows
			// TMPDIR. Pointed at the target's directory — inside the media root, created
			// by the atomic writer that owns `target` — so a spill lands on the media
			// filesystem instead of the operating system's temp dir, which on both
			// shipped compose stacks is the volume the DATABASE lives on.
			env: { TMPDIR: dirname(target) },
		}),
	);
	// The B2 law, in the shape invariant 7a demands: a KILLED gs wrote a truncated
	// PNG, and `existsSync` cannot tell that from a good one.
	assertSpawnOk(result, `rasterizePdfPage: Ghostscript failed for ${source}`);
	if (!existsSync(target)) {
		throw new DedaloError('media.operation_failed', {
			message: `rasterizePdfPage: Ghostscript produced no output file for ${source} (exit 0) — ${result.stderr.trim()}`,
			publicMessage: 'This PDF page could not be rendered.',
		});
	}
	return target;
}
