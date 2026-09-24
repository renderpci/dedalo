/**
 * GATE — the browser must not build without bound (P2-31 / CLI-29 / CLI-30).
 *
 * The list views built one section_record per row for the WHOLE page (measured
 * by the audit: ~11 instances, ~57 DOM nodes and 5 <img> per row, so the
 * 1000-row page DEC-07 permits was ~11,000 instances built synchronously), and
 * a thesaurus node expansion built every child the same way. ONE engine now
 * bounds what is materialized: `client/dedalo/core/common/js/row_window.js`
 * (`ROW_WINDOW_MAX_ROWS`), reached by the list views through
 * `section.js window_section_rows` and by the tree through `render_children`.
 *
 * This is the bun half — an invariant scan (hermetic), despite the `_native`
 * suffix the lead named it by: the BEHAVIOURAL half (5,000 entries → ≤ N rows,
 * reveal keeps the bound, destroy stops the window) is the browser suite
 * `test_render_budget` inside `bun run test:client`, on the suite database.
 *
 * Legs:
 *   1. ROW_WINDOW_MAX_ROWS is pinned, SHRINK-ONLY (N recorded here).
 *   2. TOTAL census of the row loops, derived from the tree: every file that
 *      turns page entries into section_record rows — a caller of
 *      `get_section_records(` or `window_section_rows(` — either routes through
 *      the window (calls window_section_rows and never get_section_records
 *      directly) or is ENUMERATED with the reason its page is bounded another
 *      way. The tree's render_children routes its children through
 *      create_row_window. Positive control: an offender source is classified
 *      as one.
 *   3. The show-all door: the views the portal EDIT dispatcher imports (the
 *      paginator, hence "show all", exists only in edit mode) are windowed or
 *      ENUMERATED, and the one show-all subscriber sends the bound.
 *   3b. The INJECTED door: a tool pushes its own view module into `render_views`
 *      and it renders the same page without passing any dispatcher's imports
 *      (measured 2026-09-04: both tool mosaics built 2 instances per row for the
 *      whole page while claiming an exemption). That set is DERIVED from the
 *      `path:` of every render_views entry in the tree, and windowed or
 *      ENUMERATED like the rest.
 *   4. Every owner class of a window releases it in its destroy
 *      (component_teardown_tripwire's rule: an observer stored and disconnected).
 *   5. The browser suite is registered and drives ≥ 5,000 entries — for the
 *      section list, the portal edit views and the tree.
 *   6. tool_export's preview is ONE PAGE, bounded by the same N (the tool used
 *      to keep every NDJSON row and draw them all — 300k rows × 20 columns was
 *      6M+ <td>). Measured, not read: the server's page clamp is ≤ N at every
 *      input; a spool of 3N+ records (breakdown sub-rows included) read at a
 *      requested page size of 10^9 yields ≤ N records, whole records only, and
 *      the last page is reachable; flat_table (run under a counting DOM stub)
 *      draws exactly the rows it is given (plus one counted marker per record
 *      the server's row budget elided) and keeps NOTHING row-sized between
 *      pages. The browser half (`test_tool_export`, registered) observes the
 *      live preview container through a MutationObserver over an export larger
 *      than one page and asserts the DOM never held more than the page size.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
	clampPageSize,
	openSpoolReader,
	PREVIEW_PAGE_SIZE_MAX,
} from '../../tools/tool_export/server/spool_reader.ts';
import { browserSources } from '../helpers/browser_corpus.ts';
import {
	type ExportProtocolLine,
	endedExportJob,
	scratchExportStore,
} from '../helpers/export_writer_fixture.ts';
import { stripComments } from '../helpers/strip_comments.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const ROW_WINDOW = 'client/dedalo/core/common/js/row_window.js';
const SECTION = 'client/dedalo/core/section/js/section.js';
const TREE_VIEW = 'client/dedalo/core/ts_object/js/view_default_edit_ts_object.js';
const SUITE = 'client/dedalo/test/client/js/test_render_budget.js';
const REGISTRY = 'client/dedalo/test/client/js/test_registry.js';
const EXPORT_FLAT_TABLE = 'tools/tool_export/js/flat_table.js';
const EXPORT_SUITE = 'client/dedalo/test/client/js/test_tool_export.js';

/** The recorded bound. SHRINK-ONLY: lower it here when the module lowers it. */
const RECORDED_MAX_ROWS = 200;

const code = (rel: string): string => stripComments(readFileSync(join(REPO_ROOT, rel), 'utf8'));

/**
 * The brace-balanced body of a top-level function VALUE, whatever spelling it
 * carries: `name = function`, `= async function`, or either arrow form. The
 * gate asserts what the body DOES; pinning one spelling would make a lint fix
 * (`useArrowFunction`) read as a missing function — a gate must measure the
 * outcome, never the wording.
 */
const functionBody = (source: string, opening: string): string => {
	let start = source.indexOf(opening);
	if (start === -1 && opening.endsWith(' = function')) {
		const name = opening.slice(0, -' = function'.length);
		for (const form of [`${name} = async function`, `${name} = (`, `${name} = async (`]) {
			start = source.indexOf(form);
			if (start !== -1) break;
		}
	}
	if (start === -1 && opening.endsWith(' = async function')) {
		const name = opening.slice(0, -' = async function'.length);
		start = source.indexOf(`${name} = async (`);
	}
	expect(start, `not found: ${opening}`).toBeGreaterThan(-1);
	const open = source.indexOf('{', start);
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		if (source[i] === '{') depth++;
		else if (source[i] === '}') {
			depth--;
			if (depth === 0) return source.slice(open, i);
		}
	}
	throw new Error(`unterminated: ${opening}`);
};

/**
 * How a row-loop file materializes its rows.
 *   'window'  — routes through window_section_rows and never calls
 *               get_section_records directly.
 *   'eager'   — calls get_section_records directly (builds the whole page).
 *   'none'    — neither (not a row loop).
 */
const classify = (source: string): 'window' | 'eager' | 'none' => {
	const eager = /\bget_section_records\s*\(/.test(source);
	const windowed = /\bwindow_section_rows\s*\(/.test(source);
	if (eager) return 'eager';
	if (windowed) return 'window';
	return 'none';
};

/**
 * SHRINK-ONLY. Row loops whose page is bounded by something other than the
 * window, each with the reason. A file that adopts the window leaves the list.
 */
const EAGER_EXEMPT: ReadonlyArray<{ file: string; reason: string }> = [
	{
		file: SECTION,
		reason:
			'defines get_section_records and window_section_rows themselves (the window calls the factory one entry at a time)',
	},
	{
		file: 'client/dedalo/core/section/js/view_default_edit_section.js',
		reason: 'edit mode: one record per page (the edit read is limit 1)',
	},
	{
		file: 'client/dedalo/core/section/js/view_tm_list_section.js',
		reason:
			'the TM inspector panels (mini/history) pre-build LINE rows for a compact panel; the tool shape delegates to view_default_list_section (windowed)',
	},
	{
		file: 'client/dedalo/core/section/js/view_graph_list_section.js',
		reason: 'graph view: rows are graph nodes drawn by d3, bounded by its own per-view limit',
	},
	{
		file: 'client/dedalo/core/section/js/view_search_user_presets.js',
		reason:
			"the saved-presets picker: one user's presets, a compact list read with its own small limit",
	},
	{
		file: 'client/dedalo/core/section/js/view_export_user_presets.js',
		reason: 'the export-presets picker: same shape as the search presets picker',
	},
	{
		file: 'client/dedalo/core/component_portal/js/render_search_component_portal.js',
		reason: 'search mode: the portal renders the search form, not a record page',
	},
	{
		file: 'client/dedalo/core/component_portal/js/view_text_list_portal.js',
		reason:
			'text list: renders the linked records as text fragments (no per-row DOM tree), paged by the portal',
	},
	{
		file: 'client/dedalo/core/component_portal/js/view_mini_portal.js',
		reason: 'mini: a compact summary of the first entries, its own small limit',
	},
	{
		file: 'client/dedalo/core/component_portal/js/view_line_list_portal.js',
		reason: 'line list (inside a list row): paged by the portal request_config limit',
	},
	{
		file: 'client/dedalo/core/services/service_autocomplete/js/view_default_autocomplete.js',
		reason: 'autocomplete: the dropdown reads its own bounded page (the datalist limit)',
	},
];

describe('client_render_budget', () => {
	test('ROW_WINDOW_MAX_ROWS is pinned and shrink-only', () => {
		const source = code(ROW_WINDOW);
		// anchored to the end of the statement: `= 200 * 5` is not a literal
		const match = /^export const ROW_WINDOW_MAX_ROWS\s*=\s*(\d+)\s*;?\s*$/m.exec(source);
		expect(match, 'ROW_WINDOW_MAX_ROWS not exported as a bare integer literal').not.toBeNull();
		const bound = Number(match?.[1]);
		expect(bound).toBeGreaterThan(0);
		expect(
			bound,
			'the row bound may only SHRINK — lower RECORDED_MAX_ROWS with it',
		).toBeLessThanOrEqual(RECORDED_MAX_ROWS);
		// a caller may lower it, never raise it: the constructor clamps max_rows to the export
		const create = functionBody(source, 'export const create_row_window = function');
		expect(create).toMatch(/Math\.min\(ROW_WINDOW_MAX_ROWS,/);
		// the window stores its observer and disconnects it in destroy (teardown law)
		expect(create).toMatch(/new IntersectionObserver\(/);
		expect(create).toMatch(/observer\.disconnect\(\)/);
	});

	test('TOTAL census: every row loop routes through the window or is ENUMERATED with a reason (shrink-only)', () => {
		const files = browserSources();
		expect(files.length, 'the client census found almost no files').toBeGreaterThan(300);

		const loops = files
			.map((file) => ({ file, kind: classify(code(file)) }))
			.filter((entry) => entry.kind !== 'none');
		// the floor: the row-loop census is not almost empty
		expect(loops.length, 'the row-loop census found almost none').toBeGreaterThanOrEqual(20);

		// positive controls: the views this gate was born for are windowed — the
		// section list views, and EVERY portal edit view: the paginator (hence
		// "show all", the ceiling page) exists only in portal edit mode, so these
		// are the door CLI-29 reproduced through
		for (const file of [
			'client/dedalo/core/section/js/view_default_list_section.js',
			'client/dedalo/core/section/js/view_base_list_section.js',
			'client/dedalo/core/section/js/view_thesaurus_list_section.js',
			'client/dedalo/core/component_portal/js/view_default_list_portal.js',
			'client/dedalo/core/component_portal/js/view_default_edit_portal.js',
			'client/dedalo/core/component_portal/js/view_mosaic_edit_portal.js',
			'client/dedalo/core/component_portal/js/view_line_edit_portal.js',
			'client/dedalo/core/component_portal/js/view_content_edit_portal.js',
			'client/dedalo/core/component_portal/js/view_indexation_edit_portal.js',
			'client/dedalo/core/component_portal/js/view_tree_edit_portal.js',
			// the TOOL mosaics: injected views, same page as the views above
			// (measured 2026-09-04: the cataloging mosaic built 2 instances per
			// row for a 1000-row page, the coins mosaic the same behind show-all)
			'tools/tool_cataloging/js/view_tool_cataloging_mosaic.js',
			'tools/tool_numisdata_order_coins/js/view_coins_mosaic_portal.js',
		]) {
			expect(loops.find((l) => l.file === file)?.kind, `${file} left the window`).toBe('window');
		}

		const offenders = loops
			.filter((l) => l.kind === 'eager' && !EAGER_EXEMPT.some((e) => e.file === l.file))
			.map((l) => l.file);
		expect(
			offenders,
			'a row loop builds its whole page eagerly — route it through window_section_rows, or ENUMERATE it with the reason its page is bounded',
		).toEqual([]);

		// every exemption is live: a file that adopted the window (or vanished) leaves the list
		expect(EAGER_EXEMPT.length, 'this list is shrink-only').toBeLessThanOrEqual(11);
		for (const exempt of EAGER_EXEMPT) {
			expect(
				loops.find((l) => l.file === exempt.file)?.kind,
				`stale exemption: ${exempt.file} (${exempt.reason})`,
			).toBe('eager');
		}

		// the tree: render_children routes its descriptor children through the window
		const tree = code(TREE_VIEW);
		const renderChildren = functionBody(tree, 'export const render_children = async function');
		expect(renderChildren).toMatch(/create_row_window\(/);
		expect(renderChildren).toMatch(/row_window\.append\(/);
		expect(renderChildren, 'children_number must be index-based, never a DOM count').not.toMatch(
			/childNodes\]\.filter/,
		);
		expect(tree).toMatch(/export const reveal_child = async function/);
	});

	test('the show-all door: every view the portal EDIT dispatcher reaches is windowed (or ENUMERATED), and "all" is the bound', () => {
		// the paginator (hence "show all", the ceiling page) exists only in portal
		// edit mode; the views its dispatcher can reach are derived from its imports
		const dispatcher = 'client/dedalo/core/component_portal/js/render_edit_component_portal.js';
		const imported = [...code(dispatcher).matchAll(/from\s+'\.\/(view_[a-z_]+)\.js'/g)].map(
			(m) => `client/dedalo/core/component_portal/js/${m[1]}.js`,
		);
		expect(imported.length, 'the edit dispatcher imports almost no views').toBeGreaterThanOrEqual(
			6,
		);
		const eagerDoors = imported.filter(
			(file) => classify(code(file)) === 'eager' && !EAGER_EXEMPT.some((e) => e.file === file),
		);
		expect(
			eagerDoors,
			'a portal edit view builds its whole page eagerly — show-all reaches the ceiling through it',
		).toEqual([]);
		// the windowed ones are the majority of the door, not one
		expect(
			imported.filter((file) => classify(code(file)) === 'window').length,
		).toBeGreaterThanOrEqual(6);

		// the ONLY subscriber of the paginator's show-all sends the bound, never 0
		const subscribers = browserSources().filter(
			(f) => !f.includes('/paginator/js/') && /paginator_show_all_/.test(code(f)),
		);
		expect(subscribers).toEqual(['client/dedalo/core/component_portal/js/component_portal.js']);
		const handler = functionBody(
			code(subscribers[0] ?? ''),
			'const paginator_show_all_handler = function',
		);
		expect(handler).toMatch(/sqo\.limit\s*=[^\n]*max_page_limit\(\)/);
	});

	test('the injected-view door: every view a render_views entry points at is windowed (or ENUMERATED)', () => {
		// A tool does not have to go through a dispatcher's static imports: it
		// PUSHES its own view into `self.render_views` with the module's path, and
		// the section/portal then renders the tool's file over the SAME page (the
		// cataloging mosaic reads the ordinary list's saved pagination key; the
		// coins mosaic sits behind the portal paginator's show-all). That door is
		// derived here from the tree — never listed — so a new injected view is
		// measured the day it is written.
		const files = browserSources();
		const injected = new Set<string>();
		for (const file of files) {
			const source = code(file);
			for (const at of [...source.matchAll(/render_views/g)].map((m) => m.index ?? 0)) {
				const entry = source.slice(at, at + 600);
				for (const m of entry.matchAll(/path\s*:\s*'([^']+\.js)'/g)) {
					const rel = m[1];
					if (rel === undefined) continue;
					injected.add(join(dirname(file), rel));
				}
			}
		}
		// the floor: the derivation is not empty (a rename that silently empties
		// it would make this leg vacuous)
		expect([...injected].sort()).toEqual([
			// core's own path-carrying entry; not a row loop (kept here so the
			// derivation is asserted whole, not filtered to what it should find)
			'client/dedalo/core/section/js/view_graph_edit_section.js',
			'tools/tool_cataloging/js/view_tool_cataloging_mosaic.js',
			'tools/tool_numisdata_order_coins/js/view_coins_mosaic_portal.js',
		]);
		const eagerDoors = [...injected].filter(
			(file) => classify(code(file)) === 'eager' && !EAGER_EXEMPT.some((e) => e.file === file),
		);
		expect(
			eagerDoors,
			'a view injected through render_views builds its whole page eagerly — route it through window_section_rows (see view_mosaic_edit_portal for a multi-record row), or ENUMERATE it with the reason its page is bounded',
		).toEqual([]);
	});

	test('positive control: the classifier tells an eager loop from a windowed one', () => {
		expect(classify('const rows = await get_section_records({caller: self})')).toBe('eager');
		expect(classify('await window_section_rows({caller: self, container, rows})')).toBe('window');
		// a file that does both still builds eagerly somewhere
		expect(classify('await window_section_rows({})\nawait get_section_records({})')).toBe('eager');
		expect(classify('const x = 1')).toBe('none');
	});

	test('every window owner releases it in destroy', () => {
		const owners: Array<{ file: string; opening: string }> = [
			{ file: SECTION, opening: 'section.prototype.destroy = async function' },
			{
				file: 'client/dedalo/core/component_portal/js/component_portal.js',
				opening: 'component_portal.prototype.destroy = async function',
			},
			{
				file: 'client/dedalo/core/ts_object/js/ts_object.js',
				opening: 'ts_object.prototype.destroy\t= async function',
			},
		];
		for (const owner of owners) {
			const body = functionBody(code(owner.file), owner.opening);
			expect(body, `${owner.file}: destroy does not stop the row window`).toMatch(
				/row_window\.destroy\(\)/,
			);
		}
		// window_section_rows hands the window to its caller as `row_window` — the
		// property those destroys release
		const windowRows = functionBody(
			code(SECTION),
			'export const window_section_rows = async function',
		);
		expect(windowRows).toMatch(/owner\s*:\s*self/);
	});

	test('the browser half is registered and drives at least 5,000 entries', () => {
		const suite = code(SUITE);
		const entries = /const RENDER_BUDGET_ENTRIES\s*=\s*(\d+)/.exec(suite);
		expect(entries, 'RENDER_BUDGET_ENTRIES not found').not.toBeNull();
		expect(Number(entries?.[1])).toBeGreaterThanOrEqual(5000);
		expect(suite).toMatch(/ROW_WINDOW_MAX_ROWS/);
		expect(suite).toMatch(/render_children\(/);
		expect(suite).toMatch(/reveal_child\(/);
		const registry = code(REGISTRY);
		expect(
			registry,
			'test_render_budget is not registered — an unregistered suite never runs',
		).toMatch(/'test_render_budget'/);
	});
});

// ---------------------------------------------------------------------------
// 6. tool_export: the preview is one page, bounded by the row window
// ---------------------------------------------------------------------------

/** ROW_WINDOW_MAX_ROWS as row_window.js exports it (leg 1 pins it as a bare literal). */
const rowWindowMaxRows = (): number => {
	const match = /^export const ROW_WINDOW_MAX_ROWS\s*=\s*(\d+)\s*;?\s*$/m.exec(code(ROW_WINDOW));
	expect(match).not.toBeNull();
	return Number(match?.[1]);
};

/** A DOM just big enough for flat_table, counting every element it creates. */
class StubElement {
	children: StubElement[] = [];
	classes = new Set<string>();
	textContent = '';
	[key: string]: unknown;
	constructor(readonly tagName: string) {}
	classList = {
		add: (...names: string[]) => {
			for (const name of names) this.classes.add(name);
		},
	};
	appendChild(child: StubElement): StubElement {
		if (child.tagName === '#fragment') this.children.push(...child.children);
		else this.children.push(child);
		return child;
	}
	count(tag: string): number {
		return this.children.reduce(
			(sum, child) => sum + (child.tagName === tag ? 1 : 0) + child.count(tag),
			0,
		);
	}
}

describe('client_render_budget: tool_export preview', () => {
	const scratch = mkdtempSync(join(tmpdir(), 'dedalo_render_budget_export_'));
	afterAll(() => {
		rmSync(scratch, { recursive: true, force: true });
	});

	test('the server page clamp never exceeds the row window, whatever is asked', () => {
		const bound = rowWindowMaxRows();
		expect(
			PREVIEW_PAGE_SIZE_MAX,
			'the preview page may not exceed the row window',
		).toBeLessThanOrEqual(bound);
		for (const asked of [
			undefined,
			null,
			0,
			-1,
			'abc',
			bound + 1,
			1e9,
			Number.MAX_SAFE_INTEGER,
			Infinity,
		]) {
			const size = clampPageSize(asked);
			expect(size, `clampPageSize(${String(asked)})`).toBeGreaterThanOrEqual(1);
			expect(size, `clampPageSize(${String(asked)})`).toBeLessThanOrEqual(bound);
		}
	});

	test('a spool of 3N+ records read at page_size 10^9 yields at most N whole records per page', async () => {
		const bound = rowWindowMaxRows();
		const records = bound * 3 + 7;
		const lines: ExportProtocolLine[] = [
			{ t: 'meta', v: 1, data_format: 'standard', breakdown: 'rows', section_tipo: 'test3' },
			{ t: 'col', i: 0, key: 'value', label: 'Value', cell_type: 'text', after: null },
		];
		let rows = 0;
		for (let rec = 1; rec <= records; rec++) {
			// every 5th record breaks down into 3 rows: a page must never split one
			const subs = rec % 5 === 0 ? 3 : 1;
			for (let sub = 0; sub < subs; sub++) {
				lines.push({ t: 'row', rec, sub, c: { '0': `r${rec}.${sub}` } });
				rows++;
			}
		}
		lines.push({ t: 'end', columns: [0], rows, records });
		const store = scratchExportStore(scratch);
		const job = await endedExportJob(store, lines);
		const reader = openSpoolReader(job.dir, { indexEvery: 4 });

		const seen = new Set<number>();
		let page = 0;
		for (;;) {
			const result = await reader.readPage({ page, pageSize: 1e9 });
			const recs = new Set(result.rows.map((row) => Number(row.rec)));
			expect(result.page_size, 'the served page size').toBeLessThanOrEqual(bound);
			expect(recs.size, `page ${page}: records`).toBeLessThanOrEqual(bound);
			expect(result.records).toBe(recs.size);
			for (const rec of recs) {
				expect(seen.has(rec), `record ${rec} split across pages`).toBe(false);
				seen.add(rec);
				// whole records only: every sub-row of the record is on this page
				expect(result.rows.filter((row) => Number(row.rec) === rec).length).toBe(
					rec % 5 === 0 ? 3 : 1,
				);
			}
			if (!result.has_more) break;
			page++;
			expect(page, 'the pager never runs past the last page').toBeLessThan(10);
		}
		// the last page is reachable, and together the pages are the whole export
		expect(page).toBe(Math.ceil(records / Math.min(bound, PREVIEW_PAGE_SIZE_MAX)) - 1);
		expect(seen.size).toBe(records);
	});

	test('flat_table draws exactly one page and keeps nothing row-sized between pages', async () => {
		const globals = globalThis as Record<string, unknown>;
		const saved = { document: globals.document, window: globals.window };
		const created = { count: 0 };
		globals.window = { location: { origin: 'https://render-budget.example.test' } };
		globals.document = {
			createElement: (tag: string) => {
				created.count++;
				return new StubElement(tag);
			},
			createDocumentFragment: () => new StubElement('#fragment'),
		};
		try {
			const module = (await import(join(REPO_ROOT, EXPORT_FLAT_TABLE))) as {
				flat_table: new (
					config?: object,
				) => {
					render_page(page: { cols: unknown[]; rows: unknown[] }): StubElement;
				};
			};
			const cols = [0, 1, 2].map((i) => ({
				t: 'col',
				i,
				key: `k${i}`,
				label: `L${i}`,
				cell_type: 'text',
			}));
			const page = (from: number, n: number) => ({
				cols,
				rows: Array.from({ length: n }, (_, k) => ({
					t: 'row',
					rec: from + k,
					sub: 0,
					c: { '0': 'a', '1': 'b', '2': 'c' },
				})),
			});
			const bound = rowWindowMaxRows();
			const table = new module.flat_table();

			const first = table.render_page(page(1, bound));
			expect(first.count('tr')).toBe(1 + bound);
			expect(first.count('td')).toBe(bound * cols.length);

			// the next page REPLACES: a fresh table holding the new page only
			created.count = 0;
			const second = table.render_page(page(bound + 1, 7));
			expect(second).not.toBe(first);
			expect(second.count('tr')).toBe(1 + 7);
			// the DOM built for page 2 is page 2 (table + header row + 3 th + 7 × (tr + 3 td))
			expect(created.count).toBe(1 + 1 + cols.length + 7 * (1 + cols.length));

			// an ELIDED record (the server's row budget): one marker row right after
			// the record's served rows, spanning every column, carrying the count
			const withElided = table.render_page({
				cols,
				rows: [
					{ t: 'row', rec: 1, sub: 0, c: {} },
					{ t: 'row', rec: 1, sub: 1, c: {} },
					{ t: 'row', rec: 2, sub: 0, c: {} },
				],
				elided: [{ rec: 1, rows: 1998, after: 1 }],
			} as { cols: unknown[]; rows: unknown[] });
			const bodyRows = withElided.children.slice(1);
			expect(bodyRows.length).toBe(4);
			const marker = bodyRows[2] as StubElement;
			expect(marker.classes.has('rows_elided')).toBe(true);
			expect(marker.children[0]?.colSpan).toBe(cols.length);
			expect(marker.children[0]?.textContent).toContain('+');
			expect(String(marker.children[0]?.textContent).replace(/\D/g, '')).toBe('1998');
			expect((bodyRows[3] as StubElement).classes.has('rows_elided')).toBe(false);

			// placed by POSITION: an export of two sections repeats a section_id on
			// one page (rec is the bare id), so a marker keyed by rec would also land
			// after the OTHER section's record 1, whose rows were all served
			const twoSections = table.render_page({
				cols,
				rows: [
					{ t: 'row', rec: 1, sub: 0, c: {} },
					{ t: 'row', rec: 1, sub: 0, c: {} },
					{ t: 'row', rec: 1, sub: 1, c: {} },
				],
				elided: [{ rec: 1, rows: 7, after: 2 }],
			} as { cols: unknown[]; rows: unknown[] });
			const twoSectionRows = twoSections.children.slice(1) as StubElement[];
			expect(twoSectionRows.map((row) => row.classes.has('rows_elided'))).toEqual([
				false,
				false,
				false,
				true,
			]);

			// no accumulator: no own property of the instance grows with the rows seen
			for (const [name, value] of Object.entries(table)) {
				const size =
					value instanceof Map || value instanceof Set
						? value.size
						: Array.isArray(value)
							? value.length
							: 0;
				expect(size, `flat_table.${name} grows with the rows`).toBeLessThanOrEqual(cols.length);
			}
		} finally {
			globals.document = saved.document;
			globals.window = saved.window;
		}
	});

	test('the browser half is registered and observes the DOM over more than one page', () => {
		const suite = code(EXPORT_SUITE);
		const records = Number(/const EXPORT_RECORDS\s*=\s*(\d+)/.exec(suite)?.[1]);
		const pageSize = Number(/const PAGE_SIZE\s*=\s*(\d+)/.exec(suite)?.[1]);
		expect(records, 'EXPORT_RECORDS not found').toBeGreaterThan(0);
		expect(pageSize, 'PAGE_SIZE not found').toBeGreaterThan(0);
		expect(records, 'the browser export must span more than one page').toBeGreaterThan(pageSize);
		expect(pageSize).toBeLessThanOrEqual(rowWindowMaxRows());
		expect(suite).toMatch(/new MutationObserver\(/);
		expect(suite).toMatch(/max_rows\s*<=\s*PAGE_SIZE/);
		expect(code(REGISTRY), 'test_tool_export is not registered').toMatch(/'test_tool_export'/);
	});
});
