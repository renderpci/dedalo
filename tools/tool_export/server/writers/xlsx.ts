/**
 * XLSX — a minimal, valid SpreadsheetML (OOXML) workbook, STREAMED: the spool
 * is read once, each worksheet's XML goes through DEFLATE straight into the
 * sink (src/core/files/zip.ts `openZipStream`, the engine's one ZIP
 * writer). Memory is bounded by one row, whatever the export's size. No
 * SheetJS: the server writes the parts itself.
 *
 * Parts: [Content_Types].xml, _rels/.rels, xl/workbook.xml,
 * xl/_rels/workbook.xml.rels, xl/styles.xml, xl/worksheets/sheetN.xml.
 *
 * - Every cell is an INLINE-STRING cell (`t="inlineStr"`) styled with the Text
 *   number format (@, numFmtId 49): leading zeros, long digit runs and
 *   date-like text survive, and a user editing the cell keeps text.
 * - Row 1 is the header (bold), frozen; a split sheet repeats it.
 * - Sheet split / column limit / XML hygiene: writers/spreadsheet.ts.
 * - A cell longer than 32,767 characters — Excel's hard cell limit; a longer
 *   one makes Excel "repair" (i.e. drop) the sheet — is REFUSED with
 *   `export.format_limit` (format xlsx, limit 32767): the file is never
 *   silently truncated. ODS and CSV have no such limit.
 * - OOXML reads `_xHHHH_` inside a string as an escaped character; a literal
 *   one is protected as `_x005F_xHHHH_` (ECMA-376 ST_Xstring), so the cell
 *   shows exactly its text.
 */

import { DedaloError } from '../../../../src/core/errors/index.ts';
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

/** Excel's maximum characters in one cell. */
export const XLSX_MAX_CELL_CHARS = 32_767;

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** cellXfs index of a data cell (Text format) and of a header cell (Text, bold). */
const STYLE_TEXT = 1;
const STYLE_HEADER = 2;

/** 0 → A, 25 → Z, 26 → AA … 16383 → XFD. */
export function xlsxColumnName(index: number): string {
	let name = '';
	let n = index + 1;
	while (n > 0) {
		const rem = (n - 1) % 26;
		name = String.fromCharCode(65 + rem) + name;
		n = Math.floor((n - 1) / 26);
	}
	return name;
}

/**
 * Protect a literal `_xHHHH_` from OOXML's escape decoding, then XML-escape.
 * EVERY underscore that starts an escape is protected (lookahead, so the
 * closing `_` of one lookalike can still start the next: `_x0041_x0042_` →
 * `_x005F_x0041_x005F_x0042_`); consuming it would leave `_x0042_` exposed.
 */
function xlsxText(text: string): string {
	return escapeXml(text.replace(/_(?=x[0-9A-Fa-f]{4}_)/g, '_x005F_'));
}

function assertCellLength(text: string, coordinates: Record<string, unknown>): void {
	if (text.length > XLSX_MAX_CELL_CHARS) {
		throw new DedaloError('export.format_limit', {
			details: { format: 'xlsx', limit: XLSX_MAX_CELL_CHARS },
			coordinates: { ...coordinates, length: text.length },
		});
	}
}

function cellXml(ref: string, text: string, style: number): string {
	return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xlsxText(text)}</t></is></c>`;
}

function contentTypesXml(sheets: number): string {
	let overrides = '';
	for (let n = 1; n <= sheets; n++) {
		overrides += `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
	}
	return `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`;
}

function rootRelsXml(): string {
	return `${XML_HEADER}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${REL_TYPE}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function workbookXml(sheets: number): string {
	let list = '';
	for (let n = 1; n <= sheets; n++) {
		list += `<sheet name="Sheet${n}" sheetId="${n}" r:id="rId${n}"/>`;
	}
	return `${XML_HEADER}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><bookViews><workbookView/></bookViews><sheets>${list}</sheets></workbook>`;
}

function workbookRelsXml(sheets: number): string {
	let list = '';
	for (let n = 1; n <= sheets; n++) {
		list += `<Relationship Id="rId${n}" Type="${REL_TYPE}/worksheet" Target="worksheets/sheet${n}.xml"/>`;
	}
	list += `<Relationship Id="rId${sheets + 1}" Type="${REL_TYPE}/styles" Target="styles.xml"/>`;
	return `${XML_HEADER}<Relationships xmlns="${NS_PKG_REL}">${list}</Relationships>`;
}

function stylesXml(): string {
	return `${XML_HEADER}<styleSheet xmlns="${NS_MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function sheetOpenXml(plan: SpreadsheetPlan, refs: string[]): string {
	const pane =
		plan.order.length > 0
			? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
			: '';
	let header = '<row r="1">';
	plan.header.forEach((label, k) => {
		assertCellLength(label, { row: 'header', column: k });
		if (label !== '') header += cellXml(`${refs[k]}1`, label, STYLE_HEADER);
	});
	header += '</row>';
	return `${XML_HEADER}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">${pane}<sheetData>${header}`;
}

const SHEET_CLOSE_XML = '</sheetData></worksheet>';

export const xlsxWriter: ExportWriter = async (input, sink, signal) => {
	const plan = await planSpreadsheet('xlsx', input);
	throwIfCancelled(signal);
	const refs = plan.order.map((_, k) => xlsxColumnName(k));
	const zip: ZipStreamWriter = openZipStream(sink, spreadsheetZipOptions(input.options));
	try {
		await zip.addEntry('[Content_Types].xml', contentTypesXml(plan.sheets));
		await zip.addEntry('_rels/.rels', rootRelsXml());
		await zip.addEntry('xl/workbook.xml', workbookXml(plan.sheets));
		await zip.addEntry('xl/_rels/workbook.xml.rels', workbookRelsXml(plan.sheets));
		await zip.addEntry('xl/styles.xml', stylesXml());

		// NO ZIP64 declaration (no sizeHint): a sheet's size is not known up
		// front, and Excel prompts "repair" for a part with a ZIP64 local extra,
		// so a guess would flag every large, ordinary download. A sheet that
		// really passes 4 GiB takes zip.ts's undeclared overflow path (central
		// ZIP64 + 8-byte descriptor). Gate: tool_export_spreadsheet_native E2.
		const openSheet = async (n: number) => {
			const entry = await zip.openEntry(`xl/worksheets/sheet${n + 1}.xml`);
			await entry.write(sheetOpenXml(plan, refs));
			return entry;
		};

		let sheet = 0;
		let entry = await openSheet(0);
		let rows = 0;
		for await (const row of sheetRows('xlsx', input, plan, signal)) {
			if (row.sheet !== sheet) {
				await entry.write(SHEET_CLOSE_XML);
				await entry.close();
				sheet = row.sheet;
				entry = await openSheet(sheet);
			}
			const r = row.index + 2;
			let xml = `<row r="${r}">`;
			for (let k = 0; k < row.cells.length; k++) {
				const text = row.cells[k] as string;
				if (text === '') continue;
				assertCellLength(text, { row: rows + 1, column: k });
				xml += cellXml(`${refs[k]}${r}`, text, STYLE_TEXT);
			}
			await entry.write(`${xml}</row>`);
			rows++;
		}
		await entry.write(SHEET_CLOSE_XML);
		await entry.close();
		// planned sheets that received no rows cannot exist: sheetRows proved rows == plan.rows
		await zip.finish();
		return { bytes: sink.bytes, rows };
	} catch (error) {
		zip.abort();
		throw error;
	}
};
