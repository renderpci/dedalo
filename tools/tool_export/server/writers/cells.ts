/**
 * HEADER + CELL TEXT — the server port of the client's export text semantics,
 * so a file built on the server says, byte for byte, what the browser-built
 * file said for the same data.
 *
 * SOURCE OF TRUTH: tools/tool_export/js/flat_table.js —
 *   get_column_label  → `columnLabel`
 *   _build_header_cell (th.title) → `columnTitle`
 *   cell_to_text      → `cellToText`
 *   resolve_media_url → `resolveMediaUrl`
 *   _build_cell (rich, non-plain: the HTML download's cells) → `cellParts`
 * Gate: test/unit/tool_export_cells_native.test.ts runs THE CLIENT FILE ITSELF
 * (the functions above, which the preview still uses) as the oracle over the
 * same cols/cells — a divergence on either side is red.
 *
 * THE ORIGIN. The client made media URLs absolute with `window.location.origin`
 * because the server "cannot know" it. A background job has no window, so the
 * origin the user's browser had is CAPTURED at submit time and passed in
 * (`CellTextOptions.origin`) — the file then carries the same absolute links.
 *
 * FAITHFUL, INCLUDING THE ODD PARTS. `String(value)` is kept as-is: a
 * non-scalar raw cell (data_format `dedalo_raw` / `value`) renders as the
 * client rendered it (`[object Object]`, arrays comma-joined). Changing that is
 * a deliberate output change for both sides, not something a port does.
 */

/** A 'col' protocol line, as far as text rendering reads it. */
export interface ExportColumn {
	i?: number;
	key?: unknown;
	label?: unknown;
	cell_type?: unknown;
	path?: unknown;
	[key: string]: unknown;
}

export interface CellTextOptions {
	/** The public origin media URLs are made absolute with (e.g. 'https://example.org'). */
	origin: string;
}

export interface ColumnLabelOptions {
	/** The tool's "show ontology tipo" option (flat_table config.show_tipo_in_label). */
	showTipoInLabel: boolean;
}

/** JS truthiness, as the client's `a || b` reads it. */
function truthy(value: unknown): boolean {
	return Boolean(value);
}

/** flat_table.js get_column_label. A missing descriptor renders as '' (the client would throw). */
export function columnLabel(
	col: ExportColumn | null | undefined,
	options: ColumnLabelOptions,
): string {
	if (col === null || col === undefined) return '';
	const label: unknown = truthy(col.label) ? col.label : truthy(col.key) ? col.key : '';
	if (options.showTipoInLabel) {
		const path = col.path;
		const leaf =
			Array.isArray(path) && path.length
				? (path[path.length - 1] as Record<string, unknown>)
				: null;
		const tipo = leaf ? leaf.component_tipo : null;
		return truthy(tipo) ? `${String(label)} [${String(tipo)}]` : String(label);
	}
	return String(label);
}

/** flat_table.js _build_header_cell: `th.title = col.key || ''`. */
export function columnTitle(col: ExportColumn | null | undefined): string {
	if (col === null || col === undefined) return '';
	return truthy(col.key) ? String(col.key) : '';
}

/** flat_table.js resolve_media_url, with the captured origin in place of window.location.origin. */
export function resolveMediaUrl(url: unknown, origin: string): string {
	if (!truthy(url) || !(url as { length?: number }).length) return '';
	const text = url as string;
	return text.indexOf('http') === 0 ? text : origin + text;
}

function isMediaColumn(col: ExportColumn | null | undefined): boolean {
	return !!col && (col.cell_type === 'img' || col.cell_type === 'av');
}

/** flat_table.js cell_to_text — the one text chokepoint for file outputs. */
export function cellToText(
	col: ExportColumn | null | undefined,
	value: unknown,
	options: CellTextOptions,
): string {
	if (value === null || value === undefined) return '';
	const text = String(value);
	if (isMediaColumn(col)) {
		return text
			.split(' | ')
			.map((url) => resolveMediaUrl(url, options.origin))
			.filter((url) => url !== '')
			.join(' | ');
	}
	return text;
}

/**
 * What flat_table.js _build_cell (rich mode) puts in a <td>, as data:
 *   empty  — nothing
 *   media  — one lazy <img class="export_media_thumb" src=url> per url
 *   link   — <a href target=_blank>text</a> (href = the first ', '-separated
 *            IRI, ONLY when it is http(s); any other IRI is text)
 *   text   — textContent
 * The HTML writer renders these; escaping is the writer's (the server's one
 * HTML escaper), never here.
 */
export type CellParts =
	| { kind: 'empty' }
	| { kind: 'media'; urls: string[] }
	| { kind: 'link'; href: string; text: string }
	| { kind: 'text'; text: string };

export function cellParts(
	col: ExportColumn | null | undefined,
	value: unknown,
	options: CellTextOptions,
): CellParts {
	if (value === null || value === undefined || value === '') return { kind: 'empty' };
	const cellType = col ? col.cell_type : 'text';
	switch (cellType) {
		case 'img':
		case 'av': {
			const urls: string[] = [];
			for (const url of String(value).split(' | ')) {
				const resolved = resolveMediaUrl(url, options.origin);
				if (!resolved) continue;
				urls.push(resolved);
			}
			return { kind: 'media', urls };
		}
		case 'iri': {
			// Only an http(s) first IRI becomes a link — the preview's exact rule
			// (flat_table.js _build_cell). A scheme-less value ('plain', '0') would
			// otherwise be a RELATIVE href in the file and text in the preview.
			const href = String(value).split(', ')[0] as string;
			return /^https?:\/\//i.test(href)
				? { kind: 'link', href, text: String(value) }
				: { kind: 'text', text: String(value) };
		}
		default:
			return { kind: 'text', text: String(value) };
	}
}
