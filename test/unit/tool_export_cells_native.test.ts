/**
 * TOOL_EXPORT CELL TEXT — the server port (tools/tool_export/server/writers/cells.ts)
 * must say exactly what the CLIENT said for the same column/cell, because the
 * server-built files replace files the browser used to build.
 *
 * THE ORACLE IS THE CLIENT FILE ITSELF, not a copy: tools/tool_export/js/flat_table.js
 * is imported and its prototype methods (get_column_label, cell_to_text,
 * _build_header_cell, _build_cell) are run under a minimal window/document stub.
 * (The client's former PLAIN _build_cell mode — the file cells it built itself —
 * is gone with the client file builders; file text is `cell_to_text`, gated below.)
 * If either side changes semantics alone, this is red — which is the point: one
 * rule, two runtimes.
 *
 * Situation: hand-built col lines + cell values covering every branch — media
 * (img/av, multi-value, blank segments, absolute http), iri (multi-value href),
 * section_id/json/text/unknown, null/undefined/'', numbers, non-scalars (the raw
 * formats), label/key fallbacks, show_tipo_in_label with/without a leaf tipo.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	cellParts,
	cellToText,
	columnLabel,
	columnTitle,
	resolveMediaUrl,
} from '../../tools/tool_export/server/writers/cells.ts';

const ORIGIN = 'https://dedalo.example.test';

/** A tiny DOM stand-in: only what _build_header_cell / _build_cell touch. */
interface FakeNode {
	tag: string;
	textContent: string;
	title?: string;
	src?: string;
	href?: string;
	target?: string;
	loading?: string;
	className?: string;
	children: FakeNode[];
	appendChild(child: FakeNode): FakeNode;
}

function fakeElement(tag: string): FakeNode {
	const node: FakeNode = {
		tag,
		textContent: '',
		children: [],
		appendChild(child) {
			node.children.push(child);
			return child;
		},
	};
	return node;
}

const globals = globalThis as Record<string, unknown>;
const saved = { window: globals.window, document: globals.document };

// biome-ignore lint/suspicious/noExplicitAny: the client module is untyped JS
let FlatTable: any;

beforeAll(async () => {
	globals.window = { location: { origin: ORIGIN } };
	globals.document = { createElement: (tag: string) => fakeElement(tag) };
	const module = (await import('../../tools/tool_export/js/flat_table.js')) as {
		flat_table: unknown;
	};
	FlatTable = module.flat_table;
});

afterAll(() => {
	globals.window = saved.window;
	globals.document = saved.document;
});

/** A client instance with the given label option. */
function client(showTipoInLabel: boolean) {
	const instance = new FlatTable();
	instance.config.show_tipo_in_label = showTipoInLabel;
	return instance;
}

const COLS: Record<string, unknown>[] = [
	{
		t: 'col',
		i: 0,
		key: 'section_id',
		label: 'Id',
		cell_type: 'section_id',
		path: [{ component_tipo: 'test102' }],
	},
	{
		t: 'col',
		i: 1,
		key: 'test52',
		label: 'Title',
		cell_type: 'text',
		path: [{ section_tipo: 'test3', component_tipo: 'test52' }],
	},
	{
		t: 'col',
		i: 2,
		key: 'test99.test52',
		label: '',
		cell_type: 'text',
		path: [{ component_tipo: 'test99' }, { component_tipo: 'test52' }],
	},
	{ t: 'col', i: 3, key: '', label: '', cell_type: 'json', path: [] },
	{ t: 'col', i: 4, key: 'img', label: 'Image', cell_type: 'img', path: [{}] },
	{ t: 'col', i: 5, key: 'av', label: 'Video', cell_type: 'av' },
	{ t: 'col', i: 6, key: 'iri', label: 'Link', cell_type: 'iri', path: 'not-an-array' },
	{ t: 'col', i: 7, key: 'x', label: 'Mystery', cell_type: 'future_type', path: [null] },
	{ t: 'col', i: 8, label: 0, key: 0 },
	{ t: 'col', i: 9, label: 'Números «ñ» <b>&</b>', key: 'k', path: [{ component_tipo: '' }] },
];

const VALUES: unknown[] = [
	null,
	undefined,
	'',
	0,
	42,
	'plain',
	' leading space',
	'=HYPERLINK("x")',
	'a | b',
	'/dedalo/media/image/1.5MB/0/test3_1.jpg',
	'/dedalo/media/image/a.jpg | https://cdn.example/b.jpg |  | /dedalo/media/image/c.jpg',
	' | ',
	'http://x.test/a, http://y.test/b',
	'HTTPS://X.TEST/upper',
	'mailto:a@b.test',
	'ftp://files.test/x',
	'javascript:alert(1)',
	'<script>alert(1)</script>',
	{ a: 1 },
	['x', 'y'],
	true,
];

describe('header text equals the client', () => {
	for (const showTipo of [false, true]) {
		test(`get_column_label (show_tipo_in_label=${showTipo}) and the <th> title`, () => {
			const oracle = client(showTipo);
			for (const col of COLS) {
				expect(columnLabel(col, { showTipoInLabel: showTipo })).toBe(
					String(oracle.get_column_label(col)),
				);
				const th = oracle._build_header_cell(col) as FakeNode;
				expect(columnLabel(col, { showTipoInLabel: showTipo })).toBe(String(th.textContent));
				expect(columnTitle(col)).toBe(String(th.title));
			}
		});
	}

	test('the tipo suffix is really exercised (anti-vacuity)', () => {
		expect(columnLabel(COLS[2], { showTipoInLabel: true })).toBe('test99.test52 [test52]');
		expect(columnLabel(COLS[1], { showTipoInLabel: false })).toBe('Title');
	});
});

describe('cell text equals the client', () => {
	test('cell_to_text over every column × value', () => {
		const oracle = client(false);
		let media = 0;
		for (const col of [...COLS, null]) {
			for (const value of VALUES) {
				const expected = oracle.cell_to_text(col, value);
				expect(cellToText(col, value, { origin: ORIGIN })).toBe(expected);
				if (col && (col.cell_type === 'img' || col.cell_type === 'av') && expected.includes(ORIGIN))
					media++;
			}
		}
		expect(media).toBeGreaterThan(0);
	});

	test('resolve_media_url', async () => {
		const { resolve_media_url } = (await import('../../tools/tool_export/js/flat_table.js')) as {
			resolve_media_url: (url: unknown) => string;
		};
		for (const url of [
			'',
			'/dedalo/media/x.jpg',
			'http://a.test/x',
			'https://a.test/x',
			'httpish/path',
			' /space',
		]) {
			expect(resolveMediaUrl(url, ORIGIN)).toBe(resolve_media_url(url));
		}
		expect(resolveMediaUrl(null, ORIGIN)).toBe(resolve_media_url(null));
		expect(resolveMediaUrl(undefined, ORIGIN)).toBe(resolve_media_url(undefined));
	});

	test('rich cells (_build_cell, the HTML download) carry the same parts', () => {
		const oracle = client(false);
		const seen = { link: 0, iriAsText: 0 };
		for (const col of [...COLS, null]) {
			for (const value of VALUES) {
				const td = oracle._build_cell(col, value) as FakeNode;
				const parts = cellParts(col, value, { origin: ORIGIN });
				if (parts.kind === 'link') seen.link++;
				if (parts.kind === 'text' && col?.cell_type === 'iri') seen.iriAsText++;
				switch (parts.kind) {
					case 'empty':
						expect(td.children).toEqual([]);
						expect(td.textContent).toBe('');
						break;
					case 'media':
						expect(td.textContent).toBe('');
						expect(
							td.children.map((img) => [img.tag, img.src, img.loading, img.className]),
						).toEqual(parts.urls.map((url) => ['img', url, 'lazy', 'export_media_thumb']));
						break;
					case 'link': {
						expect(td.children.length).toBe(1);
						const a = td.children[0] as FakeNode;
						expect([a.tag, a.href, a.target, a.textContent]).toEqual([
							'a',
							parts.href,
							'_blank',
							parts.text,
						]);
						break;
					}
					case 'text':
						expect(td.children).toEqual([]);
						expect(String(td.textContent)).toBe(parts.text);
						break;
				}
			}
		}
		// both IRI branches really ran: http(s) links AND non-http IRIs kept as text
		expect(seen.link).toBeGreaterThan(0);
		expect(seen.iriAsText).toBeGreaterThan(0);
	});
});
