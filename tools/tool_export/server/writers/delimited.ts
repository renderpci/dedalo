/**
 * CSV + TSV — the delimited downloads, built on the server from the ended
 * spool, BYTE-COMPATIBLE with what the browser used to build (the retired
 * flat_table.js `to_delimited` + the render_tool_export.js buttons that
 * prefixed the UTF-8 BOM — both deleted when files moved server-side):
 *
 *   file   = BOM (EF BB BF) + header + ('\n' + row)*      — no trailing newline
 *   header = the column labels (writers/cells.ts columnLabel) in end.columns order
 *   row    = each column's cellToText in end.columns order; a column the row
 *            does not carry is an empty field (the client's sparse-cell rule)
 *   CSV    = ';'-separated, EVERY field double-quoted, '"' doubled
 *   TSV    = TAB-separated, unquoted, every run of [\t\n\r] collapsed to ' '
 *
 * THE FORMULA RULE IS THE ENGINE'S, imported, never re-typed:
 * `neutralizeSpreadsheetFormula` (src/core/files/spreadsheet_formula.ts — the same
 * function the diffusion csvField runs). It runs FIRST, on the raw text, in
 * both formats: the leading character is what the spreadsheet reads, and
 * quoting does not make a field literal.
 *
 * Streaming: one pass over the spool rows, output buffered to
 * `FLUSH_CHARS` before each sink write — memory is one buffer plus the column
 * map, never the grid. Cancellation is checked once per row.
 *
 * Gate: test/unit/tool_export_delimited_html_writers_native.test.ts — the
 * retired client `to_delimited` grammar is frozen THERE as the byte oracle,
 * fed by the LIVE client's get_column_label / cell_to_text.
 */

import { neutralizeSpreadsheetFormula } from '../../../../src/core/files/spreadsheet_formula.ts';
import { cellToText, columnLabel } from './cells.ts';
import type { ExportWriter, ExportWriterInput, ExportWriterResult, FileSink } from './types.ts';
import { throwIfCancelled } from './types.ts';

/** UTF-8 byte order mark — makes Excel read the file as UTF-8 (DATA-09). */
export const UTF8_BOM = String.fromCharCode(0xfeff);

/** Characters buffered before one sink write. */
const FLUSH_CHARS = 64 * 1024;

/** The retired client to_delimited `format`, CSV branch (quote=true). */
export function csvCell(text: string): string {
	return `"${neutralizeSpreadsheetFormula(text).replace(/"/g, '""')}"`;
}

/** The retired client to_delimited `format`, TSV branch (quote=false). */
export function tsvCell(text: string): string {
	return neutralizeSpreadsheetFormula(text).replace(/[\t\n\r]+/g, ' ');
}

interface DelimitedDialect {
	separator: string;
	cell: (text: string) => string;
}

/** A string buffer that writes to the sink in bounded chunks. */
function bufferedSink(sink: FileSink) {
	let buffer = '';
	const flush = async (): Promise<void> => {
		if (buffer === '') return;
		const chunk = buffer;
		buffer = '';
		await sink.write(chunk);
	};
	return {
		flush,
		async push(text: string): Promise<void> {
			buffer += text;
			if (buffer.length >= FLUSH_CHARS) await flush();
		},
	};
}

async function writeDelimited(
	{ spool, options }: ExportWriterInput,
	sink: FileSink,
	signal: AbortSignal,
	dialect: DelimitedDialect,
): Promise<ExportWriterResult> {
	const end = await spool.requireEnd();
	const cols = await spool.readCols();
	throwIfCancelled(signal);

	const order = end.columns;
	const columns = order.map((ordinal) => ({ key: String(ordinal), col: cols.get(ordinal) }));
	const textOptions = { origin: options.origin };
	const out = bufferedSink(sink);

	await out.push(
		UTF8_BOM +
			columns
				.map(({ col }) =>
					dialect.cell(columnLabel(col, { showTipoInLabel: options.showTipoInLabel })),
				)
				.join(dialect.separator),
	);

	let rows = 0;
	for await (const row of spool.rows({ signal })) {
		throwIfCancelled(signal);
		const cells = row.c ?? {};
		let line = '\n';
		for (let index = 0; index < columns.length; index++) {
			const { key, col } = columns[index] as (typeof columns)[number];
			if (index > 0) line += dialect.separator;
			line += dialect.cell(cellToText(col, cells[key], textOptions));
		}
		await out.push(line);
		rows++;
	}
	throwIfCancelled(signal);
	await out.flush();
	return { bytes: sink.bytes, rows };
}

export const csvWriter: ExportWriter = (input, sink, signal) =>
	writeDelimited(input, sink, signal, { separator: ';', cell: csvCell });

export const tsvWriter: ExportWriter = (input, sink, signal) =>
	writeDelimited(input, sink, signal, { separator: '\t', cell: tsvCell });
