/**
 * THE spreadsheet formula rule — ONE rule for every delimited file the server
 * writes (diffusion's csv writer csvField, tool_export's CSV/TSV download
 * writers). A kernel rule, so neither subsystem imports the other's internals
 * for it.
 *
 * DIFF-E / EXPORT-CSV-01 (2026-07-28 audit): a published CSV is opened in
 * Excel/Sheets/LibreOffice, where a cell beginning =, +, -, @, TAB or CR is
 * executed as a FORMULA (=HYPERLINK(...), the =cmd|... DDE form). A record
 * value the archive published becomes code in the opener's session. Prefix
 * such a value with a single quote so it stays literal text. Quoting does NOT
 * do this: RFC4180 quotes delimit a field, they do not make its content
 * literal — so this runs FIRST, on the raw value, before any quoting.
 */
export function neutralizeSpreadsheetFormula(value: string): string {
	return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
