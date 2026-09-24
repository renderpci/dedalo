/**
 * SPREADSHEET PLUMBING shared by the XLSX and ODS writers (xlsx.ts, ods.ts):
 * the plan (column order, header text, sheet split), the row walk that says
 * which sheet a row lands on, and the XML-text hygiene both formats need.
 *
 * TEXT CELLS ONLY. Every value is written as a string cell — "007" stays
 * "007", "1e3" stays "1e3", a date-like "03/04" stays itself. The text is the
 * client's (writers/cells.ts `cellToText`, header `columnLabel`), so a
 * spreadsheet says what the CSV says.
 *
 * LIMITS. A sheet holds 1,048,576 rows (Excel, LibreOffice): one header row +
 * 1,048,575 data rows. More rows SPLIT into further sheets, header repeated —
 * never a truncated file. Columns cannot be split around: more than 16,384
 * (XFD) is refused with `export.format_limit` before a byte is written. The
 * per-sheet row cap is injectable (`options.sheetRowCap`) so a gate can drive
 * the split with a handful of rows.
 *
 * XML 1.0 cannot carry C0 controls other than TAB/LF/CR, lone surrogates or
 * U+FFFE/U+FFFF — a cell holding one would make the whole file unreadable.
 * They are stripped (`sanitizeXmlText`); nothing else is altered.
 */

import { DedaloError } from '../../../../src/core/errors/index.ts';
import type { ZipStreamOptions } from '../../../../src/core/files/zip.ts';
import type { ExportFormat } from '../artifact_store.ts';
import { SPOOL_FILES } from '../artifact_store.ts';
import type { SpoolColLine } from '../spool_reader.ts';
import { cellToText, columnLabel } from './cells.ts';
import type { ExportWriterInput } from './types.ts';
import { assertFormatLimit, throwIfCancelled } from './types.ts';

/** Columns per sheet (Excel XFD; LibreOffice since 7.4). */
export const SPREADSHEET_MAX_COLUMNS = 16_384;
/** Data rows per sheet: 1,048,576 rows minus the header. */
export const SPREADSHEET_MAX_DATA_ROWS_PER_SHEET = 1_048_575;

/** Rows between two cancellation checks. */
const CHECK_EVERY = 256;

// C0 controls except TAB/LF/CR, U+FFFE/U+FFFF, and unpaired surrogates.
const INVALID_XML_CHARS =
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping the controls XML 1.0 cannot carry IS the purpose
	/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Drop the characters XML 1.0 cannot carry (see module header). */
export function sanitizeXmlText(text: string): string {
	return text.replace(INVALID_XML_CHARS, '');
}

/** Escape for an XML text node or a double-quoted attribute. */
export function escapeXml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/\r/g, '&#13;');
}

/** The per-sheet data-row cap: `options.sheetRowCap` (gate seam, 1..max) or the format's. */
export function sheetRowCap(options: Record<string, unknown>): number {
	const requested = options.sheetRowCap;
	if (
		typeof requested === 'number' &&
		Number.isSafeInteger(requested) &&
		requested >= 1 &&
		requested <= SPREADSHEET_MAX_DATA_ROWS_PER_SHEET
	) {
		return requested;
	}
	return SPREADSHEET_MAX_DATA_ROWS_PER_SHEET;
}

/**
 * The ZIP writer options of a spreadsheet: only the gate seam
 * `options.zip64Limits` (lower ZIP64 thresholds, so a small file drives every
 * ZIP64 record); production passes nothing and gets the format's limits.
 */
export function spreadsheetZipOptions(options: Record<string, unknown>): ZipStreamOptions {
	const limits = options.zip64Limits;
	if (limits === null || typeof limits !== 'object') return {};
	const { size, count } = limits as { size?: unknown; count?: unknown };
	const zip64Limits: { size?: number; count?: number } = {};
	if (typeof size === 'number' && Number.isSafeInteger(size) && size > 0) zip64Limits.size = size;
	if (typeof count === 'number' && Number.isSafeInteger(count) && count > 0)
		zip64Limits.count = count;
	return { zip64Limits };
}

export interface SpreadsheetPlan {
	/** Column ordinals in the end line's order. */
	order: number[];
	/** Header text per column (sanitized, unescaped). */
	header: string[];
	/** Data rows the spool holds (end.rows). */
	rows: number;
	/** Data rows per sheet. */
	cap: number;
	/** Sheets the rows need (at least 1: an empty export is a header-only sheet). */
	sheets: number;
	/** Bytes of the spool grid (a size hint for the ZIP64 declaration). */
	gridBytes: number;
}

/** Read the ended spool's shape and refuse what the format cannot hold. */
export async function planSpreadsheet(
	format: ExportFormat,
	input: ExportWriterInput,
): Promise<SpreadsheetPlan> {
	const end = await input.spool.requireEnd();
	const order = [...end.columns];
	assertFormatLimit(format, order.length, SPREADSHEET_MAX_COLUMNS);
	const cols = await input.spool.readCols();
	const header = order.map((ordinal) =>
		sanitizeXmlText(
			columnLabel(cols.get(ordinal), { showTipoInLabel: input.options.showTipoInLabel }),
		),
	);
	const cap = sheetRowCap(input.options);
	const rows = end.rows;
	return {
		order,
		header,
		rows,
		cap,
		sheets: Math.max(1, Math.ceil(rows / cap)),
		gridBytes: Bun.file(`${input.spool.dir}/${SPOOL_FILES.grid}`).size,
	};
}

export interface SheetRow {
	/** 0-based sheet the row lands on. */
	sheet: number;
	/** 0-based data-row index inside its sheet. */
	index: number;
	/** Cell text per plan column ('' = empty cell), sanitized, unescaped. */
	cells: string[];
}

/**
 * Walk the spool's rows once, in order, placing each on its sheet. Refuses a
 * spool whose row count disagrees with its end line (the sheets were planned
 * from it) — `internal.invariant`, never a file that silently lost rows.
 */
export async function* sheetRows(
	format: ExportFormat,
	input: ExportWriterInput,
	plan: SpreadsheetPlan,
	signal: AbortSignal,
): AsyncGenerator<SheetRow> {
	const cols = await input.spool.readCols();
	const columns = plan.order.map((ordinal) => ({
		key: String(ordinal),
		col: cols.get(ordinal) as SpoolColLine | undefined,
	}));
	const textOptions = { origin: input.options.origin };
	let count = 0;
	for await (const row of input.spool.rows({ signal })) {
		if (count % CHECK_EVERY === 0) throwIfCancelled(signal);
		if (count >= plan.rows) throw rowCountMismatch(format, `more than ${plan.rows}`, plan.rows);
		const cells = columns.map(({ key, col }) =>
			sanitizeXmlText(cellToText(col, row.c[key], textOptions)),
		);
		yield { sheet: Math.floor(count / plan.cap), index: count % plan.cap, cells };
		count++;
	}
	throwIfCancelled(signal);
	if (count !== plan.rows) throw rowCountMismatch(format, String(count), plan.rows);
}

function rowCountMismatch(format: ExportFormat, held: string, declared: number): DedaloError {
	return new DedaloError('internal.invariant', {
		message: `tool_export ${format}: the spool holds ${held} rows, its end line says ${declared}`,
	});
}
