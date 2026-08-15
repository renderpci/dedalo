/**
 * CSV import PLANNER (PHP tool_import_dedalo_csv::import_dedalo_csv_file, the
 * read half). Parses a CSV and, against a resolved column map, produces a
 * per-record PLAN of conformed component values.
 *
 * The plan is DB-free apart from the conform facets' own ontology lookups, so
 * the row→column→conform mapping is testable without a write, and the executor
 * (import_csv_execute.ts) is a pure "apply the plan" step.
 */

import { DedaloError } from '../errors/index.ts';
import { type ConformResult, conformImportData, unwrapDedaloData } from './import_data.ts';

/**
 * Parse CSV text into rows of cells. Default delimiter ';' (the fixture format);
 * doubled-quote escaping inside quoted fields; quoted fields may span newlines.
 */
export function parseCsv(text: string, delimiter = ';'): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	let i = 0;
	const pushField = () => {
		row.push(field);
		field = '';
	};
	const pushRow = () => {
		pushField();
		rows.push(row);
		row = [];
	};
	// Normalize CRLF → LF so newline handling is uniform.
	const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	while (i < src.length) {
		const ch = src[i];
		if (inQuotes) {
			if (ch === '"') {
				if (src[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i += 1;
				continue;
			}
			field += ch;
			i += 1;
			continue;
		}
		if (ch === '"') {
			inQuotes = true;
			i += 1;
			continue;
		}
		if (ch === delimiter) {
			pushField();
			i += 1;
			continue;
		}
		if (ch === '\n') {
			pushRow();
			i += 1;
			continue;
		}
		field += ch;
		i += 1;
	}
	// Flush the trailing field/row unless the file ended on a bare newline.
	if (field !== '' || row.length > 0) pushRow();
	return rows;
}

/** Un-escape a literal ';' stored as U+003B (the CSV field-escape, PHP parity). */
export function unescapeCell(value: string): string {
	return value.replaceAll('U+003B', ';');
}

/** The per-file column analysis get_csv_files renders (minus the ontology column map). */
export interface CsvAnalysis {
	header: string[];
	n_records: number;
	n_columns: number;
	sample_data: string[][];
	sample_data_errors: string[][];
}

/**
 * Compute the get_csv_files summary from CSV text — pure and CPU-bound, so it runs
 * OFF the serving event loop in csv_worker.ts (audit S3-42). Returns only the header
 * + counts + a bounded preview + the malformed-JSON-cell rows, NOT the full row set,
 * so the worker→main structured clone stays tiny even for a 200MB file. Returns null
 * for an empty/headerless file (caller ledgers the read error).
 */
export function analyzeCsv(text: string, delimiter?: string): CsvAnalysis | null {
	// DOS-04 (2026-07-28 audit): parseCsv materializes every cell as a separate
	// JS string (~39× the source bytes), so an oversized upload OOMs the analysis
	// worker. Reject beyond a hard ceiling — a real ontology import is far under
	// it, and a 200 MB+ file is either a mistake or an availability attack.
	const MAX_CSV_BYTES = 64 * 1024 * 1024;
	if (text.length > MAX_CSV_BYTES) {
		const sentence = `CSV exceeds the ${Math.round(MAX_CSV_BYTES / 1024 / 1024)} MB import-analysis limit`;
		// Public: the sentence is the ceiling itself — no caller data, no path.
		throw new DedaloError('request.invalid_options', {
			message: sentence,
			publicMessage: sentence,
		});
	}
	const rows = parseCsv(text, delimiter);
	const header = rows[0];
	if (header === undefined || header.length === 0) return null;
	const sample_data = rows.slice(0, 10).map((row) => row.map(unescapeCell));
	// The preview of malformed-JSON rows is a SAMPLE, not the full set — cap it
	// (the docblock promised "bounded" but it collected EVERY bad row, so a file
	// of all-malformed rows returned the whole file to the client, DOS-04).
	const SAMPLE_ERROR_CAP = 100;
	const sample_data_errors: string[][] = [];
	for (const line of rows) {
		if (sample_data_errors.length >= SAMPLE_ERROR_CAP) break;
		let bad = false;
		for (const raw of line) {
			const value = unescapeCell(raw);
			if (value === '' || (!value.startsWith('[') && !value.startsWith('{'))) continue;
			try {
				JSON.parse(value);
			} catch {
				bad = true;
				break;
			}
		}
		if (bad) sample_data_errors.push(line);
	}
	return {
		header,
		n_records: Math.max(0, rows.length - 1),
		n_columns: header.length,
		sample_data,
		sample_data_errors,
	};
}

/** A resolved CSV column → its target component (null = header not matched, skip). */
export interface CsvColumn {
	tipo: string;
	model: string;
	/** The raw header string (may carry a suffix like tipo_dmy / tipo_sectiontipo). */
	columnName: string;
	/** The component's save lang, resolved from the ontology `translatable` flag. */
	lang: string;
	/** The column map's decimal separator (component_number). */
	decimal?: string;
}

export interface PlannedColumn {
	tipo: string;
	model: string;
	/** The component's save lang ('lg-nolan' when not translatable). */
	lang: string;
	conform: ConformResult;
	/** Frames from a LEGACY {data, dataframe} envelope — written after the component data.
	 * Current exports give each dataframe slot its own column, so this is null there. */
	dataframe: unknown[] | null;
	/** False when the envelope carried ONLY frames: do not touch the component's data. */
	hasData: boolean;
}

export interface PlannedRecord {
	/** section_id from the section_id column (match/update), or null (skip the row). */
	sectionId: number | null;
	/** 1-based CSV row number (the header is row 1) — for "go look at line N". */
	row: number;
	columns: PlannedColumn[];
}

/**
 * Build the import plan from data rows + a column map aligned to the columns.
 * The section_id column is the record KEY: it is used for matching and never
 * conformed or written (PHP keeps it a plain int).
 */
export async function planCsvImport(
	dataRows: readonly string[][],
	columns: readonly (CsvColumn | null)[],
	/** The section being imported INTO (relation columns resolve their targets against it). */
	sectionTipo: string,
	/** The CSV row number of dataRows[0] (the header is 1, so data starts at 2). */
	firstRowNumber = 2,
): Promise<PlannedRecord[]> {
	const plan: PlannedRecord[] = [];
	for (const [rowIndex, row] of dataRows.entries()) {
		let sectionId: number | null = null;
		const plannedColumns: PlannedColumn[] = [];

		// The key column first: every conform reports issues against this section_id,
		// so it must be known before any cell of the row is conformed.
		for (let c = 0; c < columns.length; c++) {
			const column = columns[c];
			if (column?.model !== 'component_section_id') continue;
			const parsed = Number.parseInt(row[c] ?? '', 10);
			sectionId = Number.isFinite(parsed) ? parsed : null;
			break;
		}

		for (let c = 0; c < columns.length; c++) {
			const column = columns[c];
			if (column == null || column.model === 'component_section_id') continue;
			// The cell: PHP trims and un-escapes the ';' placeholder before anything else.
			const cell = unescapeCell((row[c] ?? '').trim());
			const unwrapped = unwrapDedaloData(cell);
			const conform = await conformImportData({
				model: column.model,
				importValue: unwrapped.value,
				columnName: column.columnName,
				sectionTipo,
				sectionId: sectionId ?? 0,
				componentTipo: column.tipo,
				lang: column.lang,
				wrapped: unwrapped.wrapped,
				decimal: column.decimal,
			});
			plannedColumns.push({
				tipo: column.tipo,
				model: column.model,
				lang: column.lang,
				conform,
				dataframe: unwrapped.dataframe,
				hasData: unwrapped.hasData,
			});
		}
		plan.push({ sectionId, row: firstRowNumber + rowIndex, columns: plannedColumns });
	}
	return plan;
}
