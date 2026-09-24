/**
 * HTML — the printable download: ONE standalone, full HTML document holding a
 * table of the WHOLE export, built on the server from the ended spool.
 *
 * It replaces the client's "clone the live preview DOM into a data: URL"
 * (render_tool_export.js button_export_html), which could only ever hold what
 * the browser had rendered. Here nothing is copied from any DOM: the markup is
 * generated from the protocol lines, mirroring the preview's shape
 * (flat_table.js render_table, rich mode):
 *
 *   <table class="export_flat_table">
 *     <tr class="row_header"><th title="{col.key}">{columnLabel}</th>…</tr>
 *     <tr [class="sub_row" when sub > 0]><td>{cellParts}</td>…</tr>…
 *
 * in end.columns order; a column the row does not carry is an empty <td>.
 * Cell CONTENT comes from writers/cells.ts `cellParts` (media → <img>, iri →
 * <a>, else text); EVERY interpolated string goes through the shared server escaper
 * (src/core/security/html_escape.ts) — text, attribute values, URLs, title.
 *
 * Hardening past the old client file (a downloaded file is opened from disk,
 * outside the application's CSP):
 *   - a URL is emitted as an href/src only when it is relative or its scheme is
 *     http(s)/ftp/mailto — a `javascript:`/`data:` IRI stays visible TEXT, and
 *     so does a PROTOCOL-RELATIVE one (`//host/x`, `\\host\x`): opened from
 *     disk it resolves to `file://host/x` — a UNC/SMB fetch on Windows that
 *     hands the recipient's IP (and possibly NTLM credentials) to a host a
 *     record editor chose;
 *   - the document carries its own CSP meta (no script, no object, no base),
 *     and IMAGES only from the export's own captured origin (+ data:) — never
 *     `*`: an external media value would otherwise be fetched automatically,
 *     from wherever a record points, the moment the file is opened.
 *
 * Streaming: one pass over the spool rows, output buffered to FLUSH_CHARS
 * before each sink write; cancellation checked once per row.
 *
 * Gate: test/unit/tool_export_delimited_html_writers_native.test.ts.
 */

import { escapeHtml } from '../../../../src/core/security/html_escape.ts';
import { type CellParts, cellParts, columnLabel, columnTitle } from './cells.ts';
import type { ExportWriter } from './types.ts';
import { throwIfCancelled } from './types.ts';

/** Characters buffered before one sink write. */
const FLUSH_CHARS = 64 * 1024;

/**
 * The document's own policy: images (from the captured origin only) and
 * inline style — never script. `origin` is validOrigin's output
 * (`scheme://host[:port]` or ''), so it is a well-formed CSP source.
 */
export function documentCsp(origin: string): string {
	const images = origin === '' ? 'data:' : `${origin} data:`;
	return `default-src 'none'; img-src ${images}; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`;
}

const DOCUMENT_STYLE =
	'body{font-family:sans-serif;font-size:13px;margin:16px}' +
	'table.export_flat_table{border-collapse:collapse}' +
	'.export_flat_table th,.export_flat_table td{border:1px solid #bbb;padding:3px 6px;vertical-align:top;text-align:left}' +
	'.export_flat_table tr.row_header th{background:#eee}' +
	'.export_flat_table tr.sub_row td{border-top-color:transparent}' +
	'img.export_media_thumb{max-height:80px;max-width:120px;margin:1px}';

/** Schemes a link/image in the downloaded file may carry. */
const SAFE_SCHEME = /^(https?|ftp|mailto):/i;

/**
 * True when `url` may be an href/src: relative (no scheme before the first
 * `/ ? #`) or an allowed scheme. Control characters and whitespace are
 * stripped first, as a browser would, so `java\tscript:` is still a scheme.
 */
export function isSafeDocumentUrl(url: string): boolean {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: browsers drop these inside a scheme
	const probe = url.replace(/[\u0000- ]+/g, '');
	if (probe === '') return false;
	// protocol-relative (a browser reads '\\' as '/'): another HOST, not a path
	if (/^[\\/]{2}/.test(probe)) return false;
	const scheme = /^([^/?#]*?):/.exec(probe);
	if (scheme === null) return true;
	return SAFE_SCHEME.test(probe);
}

/** One <td>'s inner HTML. */
export function cellHtml(parts: CellParts): string {
	switch (parts.kind) {
		case 'empty':
			return '';
		case 'media': {
			let html = '';
			for (const url of parts.urls) {
				html += isSafeDocumentUrl(url)
					? `<img class="export_media_thumb" loading="lazy" src="${escapeHtml(url)}" alt="">`
					: escapeHtml(url);
			}
			return html;
		}
		case 'link':
			return isSafeDocumentUrl(parts.href)
				? `<a href="${escapeHtml(parts.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(parts.text)}</a>`
				: escapeHtml(parts.text);
		default:
			return escapeHtml(parts.text);
	}
}

export const htmlWriter: ExportWriter = async ({ spool, manifest, options }, sink, signal) => {
	const end = await spool.requireEnd();
	const cols = await spool.readCols();
	throwIfCancelled(signal);

	const columns = end.columns.map((ordinal) => ({ key: String(ordinal), col: cols.get(ordinal) }));
	const textOptions = { origin: options.origin };

	let buffer = '';
	const push = async (text: string): Promise<void> => {
		buffer += text;
		if (buffer.length >= FLUSH_CHARS) {
			const chunk = buffer;
			buffer = '';
			await sink.write(chunk);
		}
	};

	const title = `${manifest.section_tipo} export`;
	await push(
		'<!doctype html>\n<html><head><meta charset="utf-8">' +
			`<meta http-equiv="Content-Security-Policy" content="${escapeHtml(documentCsp(options.origin))}">` +
			`<title>${escapeHtml(title)}</title><style>${DOCUMENT_STYLE}</style></head>\n<body>\n` +
			'<table class="export_flat_table">\n<tr class="row_header">',
	);
	for (const { col } of columns) {
		await push(
			`<th title="${escapeHtml(columnTitle(col))}">${escapeHtml(
				columnLabel(col, { showTipoInLabel: options.showTipoInLabel }),
			)}</th>`,
		);
	}
	await push('</tr>\n');

	let rows = 0;
	for await (const row of spool.rows({ signal })) {
		throwIfCancelled(signal);
		const cells = row.c ?? {};
		let line = row.sub > 0 ? '<tr class="sub_row">' : '<tr>';
		for (const { key, col } of columns) {
			line += `<td>${cellHtml(cellParts(col, cells[key], textOptions))}</td>`;
		}
		await push(`${line}</tr>\n`);
		rows++;
	}
	throwIfCancelled(signal);
	await push('</table>\n</body></html>\n');
	if (buffer !== '') await sink.write(buffer);
	return { bytes: sink.bytes, rows };
};
