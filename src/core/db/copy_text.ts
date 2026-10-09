/**
 * THE src-side codec of PostgreSQL's COPY TEXT format — the rows of a plain
 * `pg_dump` (`COPY public.<t> (<cols>) FROM stdin;` … `\.`) and of the
 * ontology `<tld>.copy.gz` packages (`\copy … TO PROGRAM 'gzip …'`).
 *
 * Format (PostgreSQL docs, COPY › Text Format): one row per line, fields
 * separated by TAB, `\N` is SQL NULL, and a backslash escapes `\\`, `\t`, `\n`,
 * `\r`, `\b`, `\f`, `\v`, an octal byte `\ooo` (1-3 digits) or a hex byte
 * `\xhh` (1-2 digits); any other backslashed character stands for itself.
 * Because TAB and newline are always escaped inside a field, a raw line splits
 * on TAB safely.
 *
 * PURE: no imports, no I/O. Engine code, gates and scripts that read COPY text
 * decode through this module rather than keep a private decoder (the scripts'
 * older private decoders are a ledgered consolidation, not a second law).
 */

/** One COPY block of a dump: its table, column names and RAW (undecoded) row lines. */
export interface CopyBlock {
	/** The table name, schema-unqualified (`matrix_ontology`, not `public.matrix_ontology`). */
	table: string;
	columns: string[];
	/** Raw row lines, undecoded — `splitCopyRow` each one. */
	rows: string[];
}

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = Object.freeze({
	b: '\b',
	f: '\f',
	n: '\n',
	r: '\r',
	t: '\t',
	v: '\v',
});

const ENCODE_ESCAPES: Readonly<Record<string, string>> = Object.freeze({
	'\\': '\\\\',
	'\b': '\\b',
	'\f': '\\f',
	'\n': '\\n',
	'\r': '\\r',
	'\t': '\\t',
	'\v': '\\v',
});

/** One escape sequence, or one run of literal text. */
const TOKEN_RE = /\\(?:([0-7]{1,3})|x([0-9a-fA-F]{1,2})|([\s\S]))|[^\\]+/g;

/** The bytes one token decodes to (numeric escapes are BYTES, the rest UTF-8 text). */
function tokenBytes(match: RegExpMatchArray): Uint8Array {
	const [whole, octal, hex, char] = match;
	if (octal !== undefined) return Uint8Array.of(Number.parseInt(octal, 8) & 0xff);
	if (hex !== undefined) return Uint8Array.of(Number.parseInt(hex, 16));
	if (char !== undefined) return new TextEncoder().encode(SIMPLE_ESCAPES[char] ?? char);
	return new TextEncoder().encode(whole);
}

/** Decode one COPY field: `\N` → null, escapes resolved. */
export function decodeCopyField(field: string): string | null {
	if (field === '\\N') return null;
	if (!field.includes('\\')) return field;
	const parts = [...field.matchAll(TOKEN_RE)].map(tokenBytes);
	return new TextDecoder().decode(Buffer.concat(parts));
}

/** Encode one value as a COPY field: null → `\N`, backslash and control characters escaped. */
export function encodeCopyField(value: string | null): string {
	if (value === null) return '\\N';
	return value.replace(/[\\\b\f\n\r\t\v]/g, (char) => ENCODE_ESCAPES[char] as string);
}

/** Split one raw COPY row line into its decoded fields. */
export function splitCopyRow(line: string): (string | null)[] {
	return line.split('\t').map(decodeCopyField);
}

/** `COPY [schema.]table (col, …) FROM stdin;` — identifiers optionally double-quoted. */
const COPY_HEADER_RE = /^COPY\s+(?:"?[\w]+"?\.)?"?([\w]+)"?\s*\(([^)]*)\)\s+FROM\s+stdin;\s*$/;

/** The column list of a COPY header, unquoted. */
function headerColumns(list: string): string[] {
	return list
		.split(',')
		.map((column) => column.trim().replace(/^"|"$/g, ''))
		.filter((column) => column !== '');
}

/** A header line opened as an empty block, or null when the line is not one. */
function openBlock(line: string): CopyBlock | null {
	const match = COPY_HEADER_RE.exec(line);
	if (match === null) return null;
	return { table: match[1] as string, columns: headerColumns(match[2] as string), rows: [] };
}

/**
 * Every COPY block of a plain-format dump, in dump order. A block ends at its
 * `\.` line; a block the text ends inside is returned with the rows it has.
 */
export function copyBlocks(dumpText: string): CopyBlock[] {
	const blocks: CopyBlock[] = [];
	let current: CopyBlock | null = null;
	for (const line of dumpText.split('\n')) {
		if (current === null) {
			current = openBlock(line);
			if (current !== null) blocks.push(current);
		} else if (line === '\\.') {
			current = null;
		} else {
			current.rows.push(line);
		}
	}
	return blocks;
}

/** One block's rows as `{column: decoded value}` records (null = SQL NULL). */
export function copyBlockRecords(block: CopyBlock): Record<string, string | null>[] {
	return block.rows.map((line) => {
		const fields = splitCopyRow(line);
		return Object.fromEntries(
			block.columns.map((column, index) => [column, fields[index] ?? null]),
		);
	});
}
