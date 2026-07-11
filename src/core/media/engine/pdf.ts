/**
 * PDF ADAPTER — argv recipes ported from PHP component_pdf + media_docs config.
 *
 * pure `build*Argv` + `run*` over the spawn discipline. Text/HTML extraction
 * uses XPDF/Poppler `pdftotext`/`pdftohtml`; OCR uses `ocrmypdf`; page count via
 * `pdfinfo`. The PDF→jpg cover is produced by the ImageMagick adapter with a
 * rasterization density (see imagemagick.buildConvertArgv pdfDensity).
 *
 * PHP anchors: get_text_from_pdf (:743, command :831), OCR (:1003-1006),
 * transcription/ocr engine consts (media_docs.php :100/:109).
 */

import { config } from '../../../config/config.ts';
import { runBinary } from './spawn.ts';

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
		throw new Error(
			`ocr: invalid language code '${lang}' (expected Tesseract codes like 'eng' or 'eng+spa')`,
		);
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
