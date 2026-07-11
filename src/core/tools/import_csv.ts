/**
 * CSV import planner (PHP tool_import_dedalo_csv::import_dedalo_csv_file). Parses
 * a CSV and, against a resolved column map, produces a per-record PLAN of conformed
 * component datos — pure (no DB), so the row→column→conform mapping is testable in
 * isolation. The tool module executes the plan (createSectionRecord +
 * saveComponentData). The conform engine (import_data.ts) guarantees the raw-export
 * round-trip.
 */

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
	const rows = parseCsv(text, delimiter);
	const header = rows[0];
	if (header === undefined || header.length === 0) return null;
	const sample_data = rows.slice(0, 10).map((row) => row.map(unescapeCell));
	const sample_data_errors: string[][] = [];
	for (const line of rows) {
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
}

export interface PlannedColumn {
	tipo: string;
	model: string;
	conform: ConformResult;
}

export interface PlannedRecord {
	/** section_id from the section_id column (match/update), or null (create new). */
	sectionId: number | null;
	columns: PlannedColumn[];
}

/**
 * Build the import plan from data rows + a column map aligned to the columns.
 * The section_id column (model component_section_id) is used for matching, NOT
 * conformed (PHP keeps it a plain int). Every other cell is unwrapped + conformed.
 */
export function planCsvImport(
	dataRows: readonly string[][],
	columns: readonly (CsvColumn | null)[],
): PlannedRecord[] {
	const plan: PlannedRecord[] = [];
	for (const row of dataRows) {
		let sectionId: number | null = null;
		const plannedColumns: PlannedColumn[] = [];
		for (let c = 0; c < columns.length; c++) {
			const column = columns[c];
			if (column == null) continue;
			const cell = row[c] ?? '';
			if (column.model === 'component_section_id') {
				const parsed = Number.parseInt(cell, 10);
				sectionId = Number.isFinite(parsed) ? parsed : null;
				continue;
			}
			const unwrapped = unwrapDedaloData(cell);
			const conform = conformImportData({
				model: column.model,
				importValue: unwrapped.value,
				columnName: column.columnName,
				sectionId: sectionId ?? 0,
				componentTipo: column.tipo,
			});
			plannedColumns.push({ tipo: column.tipo, model: column.model, conform });
		}
		plan.push({ sectionId, columns: plannedColumns });
	}
	return plan;
}
