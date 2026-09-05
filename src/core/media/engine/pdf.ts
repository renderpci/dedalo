/**
 * PDF ADAPTER — argv recipes ported from PHP component_pdf + media_docs config.
 *
 * pure `build*Argv` + `run*` over the spawn discipline. Text/HTML extraction
 * uses XPDF/Poppler `pdftotext`/`pdftohtml`; OCR uses `ocrmypdf`; page count via
 * `pdfinfo`. The PDF→jpg cover is rendered by `engine/ghostscript.ts` (the engine
 * spawns Ghostscript itself; ImageMagick only encodes the raster it produces) and
 * the page box that render is refused on is read here, by `readPdfPageSize`.
 *
 * PHP anchors: get_text_from_pdf (:743, command :831), OCR (:1003-1006),
 * transcription/ocr engine consts (media_docs.php :100/:109).
 */

import { config } from '../../../config/config.ts';
import { DedaloError } from '../../errors/dedalo_error.ts';
import { describeSpawnFailure, runBinary } from './spawn.ts';

export interface PdfExtractOptions {
	method: 'text' | 'html';
	pageIn?: number | null;
	pageOut?: number | null;
}

/**
 * Text/HTML extraction argv (PHP :808-831):
 * `<engine> -enc UTF-8 [-f <in>] [-l <out>] [html: -i -p -noframes -layout] <src> <out_file>`.
 * Text mode uses pdftotext; html mode uses pdftohtml.
 */
export function buildExtractArgv(
	source: string,
	outFile: string,
	options: PdfExtractOptions,
): string[] {
	const engine =
		options.method === 'html' ? config.media.binaries.pdftohtml : config.media.binaries.pdftotext;
	const argv: string[] = [engine, '-enc', 'UTF-8'];
	if (options.pageIn != null) argv.push('-f', String(options.pageIn));
	if (options.pageOut != null) argv.push('-l', String(options.pageOut));
	if (options.method === 'html') {
		argv.push('-i', '-p', '-noframes', '-layout');
	}
	argv.push(source, outFile);
	return argv;
}

/**
 * Tesseract language codes (L11): 3-letter ISO 639-2, optional script suffix
 * (chi_sim), '+'-combined (eng+spa). Validated even though spawn is argv-safe —
 * a bad code should fail fast rather than load a surprising language pack.
 */
const OCR_LANG_PATTERN = /^[a-z]{3}(_[a-z]+)?(\+[a-z]{3}(_[a-z]+)?)*$/;

/** OCR argv (PHP :1003-1006): in-place PDF/A, lossless images, forced OCR. */
export function buildOcrArgv(source: string, target: string, lang: string): string[] {
	if (!OCR_LANG_PATTERN.test(lang)) {
		throw new DedaloError('request.invalid_options', {
			message: `ocr: invalid language code '${lang}' (expected Tesseract codes like 'eng' or 'eng+spa')`,
			publicMessage:
				"ocr: invalid language code (expected Tesseract codes like 'eng' or 'eng+spa')",
		});
	}
	return [
		config.media.binaries.ocrmypdf,
		'--pdfa-image-compression',
		'lossless',
		'-l',
		lang,
		'--force-ocr',
		source,
		target,
	];
}

/** pdfinfo argv (page count / metadata). */
export function buildPdfInfoArgv(source: string): string[] {
	return [config.media.binaries.pdfinfo, source];
}

/**
 * pdfinfo argv for ONE page's box: `-f N -l N` restricts the report to that page,
 * which is what makes `Page N size:` appear instead of the document-wide
 * `Page size:` (a PDF may declare a different MediaBox per page).
 */
export function buildPdfPageSizeArgv(source: string, page: number): string[] {
	return [config.media.binaries.pdfinfo, '-f', String(page), '-l', String(page), source];
}

/** A PDF page box, in PDF user-space points (1/72 inch) — never pixels. */
export interface PdfPageSize {
	readonly widthPoints: number;
	readonly heightPoints: number;
}

/**
 * The page box of ONE page, read with poppler.
 *
 * THIS IS THE MEASUREMENT THE PDF RASTERIZER REFUSES ON (engine/ghostscript.ts,
 * audit MEDIA-01): a 441-byte PDF may declare a 200000x200000-point page, and the
 * only cheap place to see that is a header read. poppler is used rather than
 * ImageMagick because `identify` on a PDF is not a header read at all — it invokes
 * the Ghostscript DELEGATE, which is the unbounded child this whole path exists to
 * stop (measured: refused outright under the shipped policy, which denies `gs`).
 *
 * IT THROWS RATHER THAN DEGRADING, unlike `getPageCount` next door, and the
 * difference is what the answer is FOR: an unknown page count costs a metadata
 * field, an unknown page box would mean rendering an untrusted document with no
 * idea how large it is. No geometry, no render.
 */
export async function readPdfPageSize(source: string, page = 1): Promise<PdfPageSize> {
	const result = await runBinary(buildPdfPageSizeArgv(source, page), { nice: false });
	if (!result.ok) {
		throw new DedaloError('media.operation_failed', {
			message: `pdf page size: pdfinfo failed for ${source} page ${String(page)}: ${describeSpawnFailure(result)}`,
			publicMessage: 'The page geometry of this PDF could not be read.',
		});
	}
	// `Page 1 size: 612 x 792 pts (letter)` — the trailing paper name is optional.
	const match = result.stdout.match(/^Page\s+\d+\s+size:\s*([0-9.]+)\s*x\s*([0-9.]+)\s*pts/m);
	if (match === null) {
		throw new DedaloError('media.operation_failed', {
			message: `pdf page size: pdfinfo reported no page box for ${source} page ${String(page)}: ${
				result.stdout.slice(0, 400) || '<empty stdout>'
			}`,
			publicMessage: 'The page geometry of this PDF could not be read.',
		});
	}
	const widthPoints = Number(match[1]);
	const heightPoints = Number(match[2]);
	if (!Number.isFinite(widthPoints) || !Number.isFinite(heightPoints)) {
		throw new DedaloError('media.operation_failed', {
			message: `pdf page size: unparseable page box '${String(match[0])}' for ${source} page ${String(page)}`,
			publicMessage: 'The page geometry of this PDF could not be read.',
		});
	}
	return { widthPoints, heightPoints };
}

// -------- runners --------

/**
 * Extract text (or html) from a PDF into `outFile`, then read and clean it.
 * Returns the cleaned UTF-8 string. Mirrors PHP's validate + iconv-IGNORE clean.
 */
export async function extractText(
	source: string,
	outFile: string,
	options: PdfExtractOptions,
): Promise<string> {
	const result = await runBinary(buildExtractArgv(source, outFile, options));
	if (/error/i.test(result.stderr) && result.exitCode !== 0) {
		throw new Error(`pdf extraction failed: ${result.stderr}`);
	}
	const raw = await Bun.file(outFile).text();
	return cleanUtf8(raw);
}

/** Page count via pdfinfo (parses the 'Pages:' line). Returns null when unknown. */
export async function getPageCount(source: string): Promise<number | null> {
	const result = await runBinary(buildPdfInfoArgv(source), { nice: false });
	const match = result.stdout.match(/^Pages:\s*(\d+)/m);
	return match ? Number(match[1]) : null;
}

/**
 * UTF-8 cleanup (PHP utf8_clean): drop invalid sequences and control chars.
 * TextDecoder with fatal:false already substitutes U+FFFD for invalid bytes;
 * we then strip control chars except tab/newline/carriage-return.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control chars IS the point — this strips them (PHP utf8_clean)
const CONTROL_AND_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFD]/g;

export function cleanUtf8(text: string): string {
	return text.replace(CONTROL_AND_INVALID, '');
}
