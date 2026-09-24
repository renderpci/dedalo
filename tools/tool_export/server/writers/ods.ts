/**
 * ODS — an OpenDocument spreadsheet (ODF 1.3), STREAMED: `content.xml` is
 * written row by row through DEFLATE straight into the sink
 * (src/core/files/zip.ts `openZipStream`, the engine's one ZIP
 * writer); memory is bounded by one row, whatever the export's size.
 *
 * Package: `mimetype` FIRST, STORED, no extra field, no data descriptor (ODF
 * 1.3 part 2 §3.3 — how readers sniff the type), then META-INF/manifest.xml,
 * styles.xml, content.xml.
 *
 * - Every cell is a STRING cell (`office:value-type="string"`): leading zeros
 *   and number-like text survive.
 * - Each sheet (table) starts with the header row (bold, in
 *   table:table-header-rows); split / column limit / XML hygiene:
 *   writers/spreadsheet.ts — the same sheet geometry as XLSX, so the two files
 *   of one export match sheet for sheet.
 * - ODF collapses white space inside text:p, so the text is encoded to keep
 *   it: runs of spaces as text:s, TAB as text:tab, a line break as
 *   text:line-break — the cell shows exactly its text.
 */

import { openZipStream, type ZipStreamWriter } from '../../../../src/core/files/zip.ts';
import {
	escapeXml,
	planSpreadsheet,
	type SpreadsheetPlan,
	sheetRows,
	spreadsheetZipOptions,
} from './spreadsheet.ts';
import type { ExportWriter } from './types.ts';
import { throwIfCancelled } from './types.ts';

export const ODS_MIMETYPE = 'application/vnd.oasis.opendocument.spreadsheet';

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
const NS =
	'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"';

/** A run of `n` spaces as text:s. */
function spaces(n: number): string {
	return n === 1 ? '<text:s/>' : `<text:s text:c="${n}"/>`;
}

/**
 * Cell text → the inside of one text:p, white space kept: a space run at the
 * start, after a tab/line break, or at the end is all text:s; elsewhere its
 * first space stays literal and the rest are text:s.
 */
export function odsParagraphContent(text: string): string {
	let out = '';
	const tokens = text.replace(/\r\n?/g, '\n').split(/( +|\t|\n)/);
	let lastToken = tokens.length - 1;
	while (lastToken > 0 && tokens[lastToken] === '') lastToken--;
	let atBoundary = true;
	for (let k = 0; k < tokens.length; k++) {
		const token = tokens[k] as string;
		if (token === '') continue;
		if (token === '\t') {
			out += '<text:tab/>';
			atBoundary = true;
		} else if (token === '\n') {
			out += '<text:line-break/>';
			atBoundary = true;
		} else if (token[0] === ' ') {
			if (atBoundary || k === lastToken) out += spaces(token.length);
			else out += token.length === 1 ? ' ' : ` ${spaces(token.length - 1)}`;
			atBoundary = false;
		} else {
			out += escapeXml(token);
			atBoundary = false;
		}
	}
	return out;
}

/** One row of cells; empty runs repeated, trailing empties dropped. */
function rowXml(cells: string[], styleName: string | null): string {
	const style = styleName ? ` table:style-name="${styleName}"` : '';
	let out = '<table:table-row>';
	let empties = 0;
	for (const text of cells) {
		if (text === '') {
			empties++;
			continue;
		}
		if (empties > 0) {
			out +=
				empties === 1
					? '<table:table-cell/>'
					: `<table:table-cell table:number-columns-repeated="${empties}"/>`;
			empties = 0;
		}
		out += `<table:table-cell office:value-type="string"${style}><text:p>${odsParagraphContent(text)}</text:p></table:table-cell>`;
	}
	if (out === '<table:table-row>') out += '<table:table-cell/>';
	return `${out}</table:table-row>`;
}

function tableOpenXml(plan: SpreadsheetPlan, n: number): string {
	const columns = Math.max(1, plan.order.length);
	return `<table:table table:name="Sheet${n + 1}"><table:table-column table:number-columns-repeated="${columns}"/><table:table-header-rows>${rowXml(plan.header, 'ce1')}</table:table-header-rows>`;
}

function manifestXml(): string {
	return `${XML_HEADER}<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${ODS_MIMETYPE}"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>`;
}

function stylesXml(): string {
	return `${XML_HEADER}<office:document-styles ${NS} office:version="1.3"><office:styles/></office:document-styles>`;
}

const CONTENT_OPEN_XML = `${XML_HEADER}<office:document-content ${NS} office:version="1.3"><office:automatic-styles><style:style style:name="ce1" style:family="table-cell"><style:text-properties fo:font-weight="bold"/></style:style></office:automatic-styles><office:body><office:spreadsheet>`;
const CONTENT_CLOSE_XML = '</office:spreadsheet></office:body></office:document-content>';

export const odsWriter: ExportWriter = async (input, sink, signal) => {
	const plan = await planSpreadsheet('ods', input);
	throwIfCancelled(signal);
	const zip: ZipStreamWriter = openZipStream(sink, spreadsheetZipOptions(input.options));
	try {
		await zip.addEntry('mimetype', ODS_MIMETYPE, { method: 'store' });
		await zip.addEntry('META-INF/manifest.xml', manifestXml());
		await zip.addEntry('styles.xml', stylesXml());

		// No ZIP64 declaration from a size guess (see xlsx.ts; Excel opens ODS
		// too): a real >4 GiB content.xml takes the undeclared overflow path.
		const content = await zip.openEntry('content.xml');
		await content.write(CONTENT_OPEN_XML);
		await content.write(tableOpenXml(plan, 0));
		let sheet = 0;
		let rows = 0;
		for await (const row of sheetRows('ods', input, plan, signal)) {
			if (row.sheet !== sheet) {
				sheet = row.sheet;
				await content.write(`</table:table>${tableOpenXml(plan, sheet)}`);
			}
			await content.write(rowXml(row.cells, null));
			rows++;
		}
		await content.write(`</table:table>${CONTENT_CLOSE_XML}`);
		await content.close();
		await zip.finish();
		return { bytes: sink.bytes, rows };
	} catch (error) {
		zip.abort();
		throw error;
	}
};
