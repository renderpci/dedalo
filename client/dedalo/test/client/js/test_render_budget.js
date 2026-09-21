// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, before, after, assert */
/*eslint no-undef: "error"*/

import { data_manager } from '../../../core/common/js/data_manager.js';
import { get_instance } from '../../../core/common/js/instances.js';
import { create_row_window, ROW_WINDOW_MAX_ROWS } from '../../../core/common/js/row_window.js';
import {
	bound_sqo_limit,
	ENGINE_DEFAULT_MAX_LIMIT,
	max_page_limit,
} from '../../../core/common/js/sqo_limit.js';
import { ui } from '../../../core/common/js/ui.js';
import { ts_object } from '../../../core/ts_object/js/ts_object.js';

/**
 * TEST_RENDER_BUDGET
 * The browser must not build without bound (audit P2-31 / CLI-29 / CLI-30).
 *
 * The behavioural half of test/unit/client_render_budget_native.test.ts: a list
 * handed RENDER_BUDGET_ENTRIES (5,000) locator entries paints at most
 * ROW_WINDOW_MAX_ROWS section_record rows and registers at most that many row
 * instances; each portal EDIT view (the show-all door) does the same; a
 * thesaurus node handed 5,000 children materializes at most
 * ROW_WINDOW_MAX_ROWS of them; revealing the LAST row still respects the bound;
 * destroying the owner disconnects the window. The entries are synthetic on
 * purpose: a real server page is capped at DEDALO_SEARCH_CLIENT_MAX_LIMIT
 * (DEC-07, 1000), so the renderer's own bound is proved with in-browser
 * entries — the server's bound is the sqo/children-door gates' business.
 *
 * Plus the client limit bound (sqo_limit.js): the page_globals ceiling is what
 * the server published, bound_sqo_limit never yields 0, and the two suites that
 * used to send 0 now send the ceiling (test_component_portal_pagination,
 * test_open_related_data).
 *
 * Runs on the SUITE database: the list block builds the real test3 section
 * (context + columns from the server) and then REPLACES its page with the
 * synthetic entries; the tree block mocks data_manager.request the way
 * test_ts_object does (node fixtures, no server), restored in after().
 */

// RENDER_BUDGET_ENTRIES. The bun half reads this constant: it must be >= 5000.
const RENDER_BUDGET_ENTRIES = 5000;

// DOM container
const container = document.getElementById('content');
const test_container = ui.create_dom_element({
	element_type: 'div',
	class_name: 'container render_budget',
	parent: container,
});

describe('RENDER BUDGET — sqo_limit', () => {
	it('max_page_limit is the SERVER ceiling published in page_globals, a positive integer', () => {
		assert.equal(
			typeof page_globals.dedalo_search_client_max_limit,
			'number',
			'page_globals.dedalo_search_client_max_limit must be served (WC-2026-09-04-client-limit-bound)',
		);
		assert.equal(max_page_limit(), page_globals.dedalo_search_client_max_limit);
		assert.equal(Number.isInteger(max_page_limit()) && max_page_limit() >= 1, true);
	});

	it('bound_sqo_limit never yields 0 or more than the ceiling', () => {
		const max = max_page_limit();
		assert.equal(bound_sqo_limit(0), max, '0 ("all") is the ceiling');
		assert.equal(bound_sqo_limit(-5), max);
		assert.equal(bound_sqo_limit('all'), max);
		assert.equal(bound_sqo_limit(undefined), max);
		assert.equal(bound_sqo_limit(max + 1), max);
		assert.equal(bound_sqo_limit(10), 10, 'a page size within the bound passes through');
		assert.equal(bound_sqo_limit('7'), 7);
	});

	it('a page without the key falls back LOUDLY to the engine default', () => {
		const saved = page_globals.dedalo_search_client_max_limit;
		const errors = [];
		const original_error = console.error;
		console.error = (...args) => errors.push(args);
		try {
			page_globals.dedalo_search_client_max_limit = undefined;
			assert.equal(max_page_limit(), ENGINE_DEFAULT_MAX_LIMIT);
			assert.equal(errors.length >= 1, true, 'the fallback must be reported, never silent');
		} finally {
			console.error = original_error;
			page_globals.dedalo_search_client_max_limit = saved;
		}
	});
});

describe('RENDER BUDGET — row_window (pure)', () => {
	it(`materializes at most ROW_WINDOW_MAX_ROWS of ${RENDER_BUDGET_ENTRIES} items, and reveal keeps the bound`, async () => {
		const host = ui.create_dom_element({
			element_type: 'div',
			parent: test_container,
		});
		const items = Array.from({ length: RENDER_BUDGET_ENTRIES }, (_, i) => ({ i }));
		let built = 0;
		let released = 0;
		const owner = {};
		const row_window = create_row_window({
			owner: owner,
			container: host,
			items: items,
			materialize: (item) => {
				built++;
				const node = document.createElement('div');
				node.className = 'budget_row';
				node.dataset.i = item.i;
				return node;
			},
			release: () => {
				released++;
			},
		});
		await row_window.fill();

		assert.equal(owner.row_window, row_window, 'the window is stored on its owner');
		assert.equal(host.querySelectorAll('.budget_row').length, ROW_WINDOW_MAX_ROWS);
		assert.equal(built, ROW_WINDOW_MAX_ROWS);
		assert.equal(row_window.range().total, RENDER_BUDGET_ENTRIES);
		assert.equal(row_window.range().end, ROW_WINDOW_MAX_ROWS);
		assert.equal(
			host.querySelector('.row_window_spacer.bottom').hidden,
			false,
			'the rows not built are represented by the spacer',
		);

		// reveal the LAST item: the window re-centres, the bound holds
		const last = await row_window.reveal(RENDER_BUDGET_ENTRIES - 1);
		assert.equal(last instanceof Element, true);
		assert.equal(last.dataset.i, String(RENDER_BUDGET_ENTRIES - 1));
		assert.equal(
			host.querySelectorAll('.budget_row').length <= ROW_WINDOW_MAX_ROWS,
			true,
			'reveal must not grow the window past the bound',
		);
		assert.equal(released, ROW_WINDOW_MAX_ROWS, 'the first window was released');
		assert.equal(host.querySelector('.row_window_spacer.bottom').hidden, true);
		assert.equal(host.querySelector('.row_window_spacer.top').hidden, false);

		// append extends the total without exceeding the bound
		await row_window.append([{ i: RENDER_BUDGET_ENTRIES }]);
		assert.equal(row_window.range().total, RENDER_BUDGET_ENTRIES + 1);
		assert.equal(host.querySelectorAll('.budget_row').length <= ROW_WINDOW_MAX_ROWS, true);

		// destroy disconnects and forgets
		row_window.destroy();
		assert.equal(owner.row_window, null);
		assert.equal(host.querySelector('.row_window_spacer'), null, 'spacers leave with the window');
	});

	it('a caller may LOWER max_rows, never raise it', async () => {
		const host = ui.create_dom_element({ element_type: 'div', parent: test_container });
		const items = Array.from({ length: 50 }, (_, i) => ({ i }));
		const lowered = create_row_window({
			container: host,
			items: items,
			max_rows: 5,
			materialize: () => document.createElement('div'),
		});
		await lowered.fill();
		assert.equal(host.children.length - 2, 5, '5 rows + 2 spacers');
		lowered.destroy();
		const raised = create_row_window({
			container: host,
			items: items,
			max_rows: ROW_WINDOW_MAX_ROWS * 10,
			materialize: () => document.createElement('div'),
		});
		assert.equal(raised.max_rows, ROW_WINDOW_MAX_ROWS);
		raised.destroy();
	});
});

describe('RENDER BUDGET — section list view', function () {
	this.timeout(60000);

	let section;

	it(`a ${RENDER_BUDGET_ENTRIES}-row page paints at most ROW_WINDOW_MAX_ROWS section_record rows`, async () => {
		section = await get_instance({
			model: 'section',
			tipo: 'test3',
			section_tipo: 'test3',
			mode: 'list',
			id_variant: 'render_budget',
		});
		await section.build(true);

		// the synthetic page: 5,000 locators of the generic test section. The
		// datum holds no data for them — every cell renders empty, which is
		// exactly the cost this measures (instances + DOM per row, not values)
		section.data = section.data || {};
		section.data.entries = Array.from({ length: RENDER_BUDGET_ENTRIES }, (_, i) => ({
			section_tipo: 'test3',
			section_id: i + 1,
			paginated_key: i,
		}));

		const node = await section.render();
		test_container.appendChild(node);

		const content_data = node.content_data || node.querySelector('.content_data');
		assert.equal(content_data instanceof Element, true, 'content_data expected');

		const rows = content_data.querySelectorAll(':scope > .section_record');
		assert.equal(rows.length > 0, true, 'the first window must be painted when render resolves');
		assert.equal(
			rows.length <= ROW_WINDOW_MAX_ROWS,
			true,
			`painted ${rows.length} rows for a ${RENDER_BUDGET_ENTRIES}-entry page; the bound is ${ROW_WINDOW_MAX_ROWS}`,
		);

		const row_instances = section.ar_instances.filter((el) => el.model === 'section_record');
		assert.equal(
			row_instances.length <= ROW_WINDOW_MAX_ROWS,
			true,
			`ar_instances holds ${row_instances.length} section_records; only the MATERIALIZED rows may live`,
		);

		assert.equal(section.row_window?.range().total, RENDER_BUDGET_ENTRIES);
		assert.equal(content_data.querySelector('.row_window_spacer.bottom').hidden, false);
	});

	it('revealing the last row keeps the bound and materializes that row', async () => {
		const node = await section.row_window.reveal(RENDER_BUDGET_ENTRIES - 1);
		assert.equal(node instanceof Element, true, 'the last row must materialize on reveal');
		const content_data = section.node.content_data || section.node.querySelector('.content_data');
		const rows = content_data.querySelectorAll(':scope > .section_record');
		assert.equal(rows.length <= ROW_WINDOW_MAX_ROWS, true);
		assert.equal(
			section.ar_instances.filter((el) => el.model === 'section_record').length <=
				ROW_WINDOW_MAX_ROWS,
			true,
		);
	});

	it('destroying the section stops the window', async () => {
		await section.destroy(true, true, true);
		assert.equal(section.row_window, null);
	});
});

/**
 * PORTAL EDIT VIEWS
 * The paginator — hence "show all", the ceiling page — exists only in portal
 * EDIT mode (component_portal.js build), so the edit views are the door CLI-29
 * reproduced through. Each one is built for real on the suite database (test3
 * record 2, portal test80) and then handed the synthetic page: at most
 * ROW_WINDOW_MAX_ROWS section_record rows painted and materialized.
 * The mosaic view builds THREE records per row (tile, hover, alt) through a
 * custom materialize; its instance bound is 3 × ROW_WINDOW_MAX_ROWS.
 */
const PORTAL_EDIT_VIEWS = [
	{ view: 'default', instances_per_row: 1 },
	{ view: 'content', instances_per_row: 1 },
	{ view: 'line', instances_per_row: 1 },
	{ view: 'tree', instances_per_row: 1 },
	{ view: 'indexation', instances_per_row: 1 },
	{ view: 'mosaic', instances_per_row: 3 },
];

for (const portal_view of PORTAL_EDIT_VIEWS) {
	describe(`RENDER BUDGET — portal edit view ${portal_view.view}`, function () {
		this.timeout(60000);

		let component;

		it(`a ${RENDER_BUDGET_ENTRIES}-row page paints at most ROW_WINDOW_MAX_ROWS rows`, async () => {
			component = await get_instance({
				model: 'component_portal',
				tipo: 'test80',
				section_tipo: 'test3',
				section_id: 2,
				mode: 'edit',
				view: portal_view.view,
				id_variant: `render_budget_${portal_view.view}`,
			});
			await component.build(true);
			// the dispatcher reads self.view || self.context.view
			component.view = portal_view.view;
			if (component.context) {
				component.context.view = portal_view.view;
			}

			// the synthetic page: 5,000 locators of the generic test section
			component.data = component.data || {};
			component.data.entries = Array.from({ length: RENDER_BUDGET_ENTRIES }, (_, i) => ({
				section_tipo: 'test3',
				section_id: i + 1,
				paginated_key: i,
			}));

			const node = await component.render();
			test_container.appendChild(node);

			const content_data = node.content_data || node.querySelector('.content_data');
			assert.equal(content_data instanceof Element, true, 'content_data expected');

			const rows = content_data.querySelectorAll(':scope > .section_record');
			assert.equal(rows.length > 0, true, 'the first window must be painted when render resolves');
			assert.equal(
				rows.length <= ROW_WINDOW_MAX_ROWS,
				true,
				`painted ${rows.length} rows for a ${RENDER_BUDGET_ENTRIES}-entry page; the bound is ${ROW_WINDOW_MAX_ROWS}`,
			);

			const row_instances = component.ar_instances.filter((el) => el.model === 'section_record');
			const instance_bound = ROW_WINDOW_MAX_ROWS * portal_view.instances_per_row;
			assert.equal(
				row_instances.length > 0 && row_instances.length <= instance_bound,
				true,
				`ar_instances holds ${row_instances.length} section_records; only the MATERIALIZED rows may live (bound ${instance_bound})`,
			);

			assert.equal(component.row_window?.range().total, RENDER_BUDGET_ENTRIES);
			assert.equal(content_data.querySelector('.row_window_spacer.bottom').hidden, false);
		});

		it('revealing the last row keeps the bound', async () => {
			const node = await component.row_window.reveal(RENDER_BUDGET_ENTRIES - 1);
			assert.equal(node instanceof Element, true, 'the last row must materialize on reveal');
			const content_data =
				component.node.content_data || component.node.querySelector('.content_data');
			assert.equal(
				content_data.querySelectorAll(':scope > .section_record').length <= ROW_WINDOW_MAX_ROWS,
				true,
			);
			assert.equal(
				component.ar_instances.filter((el) => el.model === 'section_record').length <=
					ROW_WINDOW_MAX_ROWS * portal_view.instances_per_row,
				true,
			);
		});

		it('destroying the portal stops the window', async () => {
			await component.destroy(true, true, true);
			assert.equal(component.row_window, null);
		});
	});
}

/**
 * TOOL MOSAIC VIEWS
 * The two mosaics a TOOL injects through `render_views` — outside the core
 * view files, on the same 1000-row page (audit P2-31 residue). They are the
 * same measurement as PORTAL_EDIT_VIEWS above with one difference that is the
 * whole point of measuring them: each materialized row builds TWO
 * section_records, the tile and its hover overlay, so the instance bound is
 * 2 x ROW_WINDOW_MAX_ROWS. The bun half (client_render_budget_native.test.ts)
 * can only SCAN them for window_section_rows; this block runs them.
 *
 * Two hosts, because that is what the two tools are:
 *   - tool_cataloging's mosaic is a SECTION view in list mode (it reads the
 *     ordinary list's saved pagination key);
 *   - the coins mosaic is a component_portal EDIT view (behind "show all").
 * Each is registered on the instance exactly as its tool registers it — a
 * render_views entry with the module path — and then handed the synthetic page.
 *
 * (!) Their own info columns (the cataloging drag handle, the coins
 * original/copy control) are callback columns bound to their tool's caller,
 * which this generic test3 situation does not provide. section_record's
 * render_callback CATCHES a throwing callback and renders the column empty, so
 * the row still materializes and the count this block measures — instances and
 * rows per window — is unaffected. Building a tool caller here would mean
 * naming an install's tipos, which a generic gate never does.
 */
const TOOL_MOSAIC_VIEWS = [
	{
		host: 'section',
		mode: 'list',
		view: 'tool_cataloging_mosaic',
		render: 'view_tool_cataloging_mosaic',
		path: '../../../tools/tool_cataloging/js/view_tool_cataloging_mosaic.js',
		instances_per_row: 2,
	},
	{
		host: 'portal',
		mode: 'edit',
		view: 'coins_mosaic',
		render: 'view_coins_mosaic_portal',
		path: '../../../tools/tool_numisdata_order_coins/js/view_coins_mosaic_portal.js',
		instances_per_row: 2,
	},
];

for (const mosaic_view of TOOL_MOSAIC_VIEWS) {
	describe(`RENDER BUDGET — tool mosaic view ${mosaic_view.view}`, function () {
		this.timeout(60000);

		let instance;

		it(`a ${RENDER_BUDGET_ENTRIES}-row page paints at most ROW_WINDOW_MAX_ROWS rows, 2 records each`, async () => {
			instance =
				mosaic_view.host === 'section'
					? await get_instance({
							model: 'section',
							tipo: 'test3',
							section_tipo: 'test3',
							mode: 'list',
							id_variant: `render_budget_${mosaic_view.view}`,
						})
					: await get_instance({
							model: 'component_portal',
							tipo: 'test80',
							section_tipo: 'test3',
							section_id: 2,
							mode: 'edit',
							view: mosaic_view.view,
							id_variant: `render_budget_${mosaic_view.view}`,
						});
			await instance.build(true);

			// the tool's own registration: a render_views entry with the module path
			instance.render_views = instance.render_views || [];
			instance.render_views.push({
				view: mosaic_view.view,
				mode: mosaic_view.mode,
				render: mosaic_view.render,
				path: mosaic_view.path,
			});
			// the dispatcher reads self.view || self.context.view (portal) /
			// self.context.view || self.view (section list)
			instance.view = mosaic_view.view;
			if (instance.context) {
				instance.context.view = mosaic_view.view;
			}

			// the columns the mosaic slices: both views filter the columns_map by
			// `in_mosaic` (tile) and `hover` (overlay), and build ONE record per set
			const columns_map = instance.columns_map || [];
			for (const column of columns_map) {
				column.in_mosaic = true;
				column.hover = true;
			}

			// the synthetic page: 5,000 locators of the generic test section
			instance.data = instance.data || {};
			instance.data.entries = Array.from({ length: RENDER_BUDGET_ENTRIES }, (_, i) => ({
				section_tipo: 'test3',
				section_id: i + 1,
				paginated_key: i,
			}));

			const node = await instance.render();
			test_container.appendChild(node);

			const content_data = node.content_data || node.querySelector('.content_data');
			assert.equal(content_data instanceof Element, true, 'content_data expected');

			// the painted rows, read from the WINDOW rather than counted as direct
			// DOM children: a mosaic tile is the row, and the hover record lives
			// INSIDE it, so a `:scope >` count would measure the nesting, not the bound
			assert.equal(Boolean(instance.row_window), true, 'the view did not open a row window');
			const range = instance.row_window.range();
			const painted = range.end - range.start;
			assert.equal(painted > 0, true, 'the first window must be painted when render resolves');
			assert.equal(
				painted <= ROW_WINDOW_MAX_ROWS,
				true,
				`painted ${painted} rows for a ${RENDER_BUDGET_ENTRIES}-entry page; the bound is ${ROW_WINDOW_MAX_ROWS}`,
			);
			assert.equal(range.total, RENDER_BUDGET_ENTRIES);

			const instance_bound = ROW_WINDOW_MAX_ROWS * mosaic_view.instances_per_row;
			const row_instances = instance.ar_instances.filter((el) => el.model === 'section_record');
			assert.equal(
				row_instances.length > 0 && row_instances.length <= instance_bound,
				true,
				`ar_instances holds ${row_instances.length} section_records; only the MATERIALIZED rows may live (bound ${instance_bound})`,
			);
			// the pair itself: a mosaic row is TWO records (tile + hover overlay), so
			// more records than rows is the shape, and 2 x the bound is the ceiling —
			// this is what makes the ceiling a measurement instead of a scan
			assert.equal(
				row_instances.length > painted,
				true,
				`a mosaic row builds ${mosaic_view.instances_per_row} records; ${row_instances.length} for ${painted} rows is not the pair`,
			);

			// and the same in the DOM: the hover record is prepended INTO its tile
			const dom_records = content_data.querySelectorAll('.section_record');
			assert.equal(
				dom_records.length <= instance_bound,
				true,
				`${dom_records.length} section_record nodes; the bound is ${instance_bound}`,
			);

			assert.equal(content_data.querySelector('.row_window_spacer.bottom').hidden, false);
		});

		it('revealing the last row keeps the bound', async () => {
			const node = await instance.row_window.reveal(RENDER_BUDGET_ENTRIES - 1);
			assert.equal(node instanceof Element, true, 'the last row must materialize on reveal');
			const range = instance.row_window.range();
			assert.equal(
				range.end - range.start <= ROW_WINDOW_MAX_ROWS,
				true,
				'reveal must not grow the window past the bound',
			);
			assert.equal(
				instance.ar_instances.filter((el) => el.model === 'section_record').length <=
					ROW_WINDOW_MAX_ROWS * mosaic_view.instances_per_row,
				true,
				'the released rows must have taken their record pairs with them',
			);
		});

		it('destroying the owner stops the window', async () => {
			await instance.destroy(true, true, true);
			assert.equal(instance.row_window, null);
		});
	});
}

describe('RENDER BUDGET — thesaurus tree', function () {
	this.timeout(60000);

	// node fixtures, mocked the way test_ts_object.js does (no server)
	const original_request = data_manager.request;
	const ROOT = { section_tipo: 'test3', section_id: '1' };
	const child_fixture = (i) => ({
		ts_id: `test3_${i}`,
		ts_parent: 'test3_1',
		section_tipo: 'test3',
		section_id: String(i),
		order: i,
		is_descriptor: true,
		is_indexable: true,
		has_descriptor_children: false,
		children_tipo: 'test71',
		permissions_button_new: 3,
		permissions_button_delete: 3,
		permissions_indexation: 3,
		ar_elements: [
			{
				type: 'term',
				tipo: 'test71_term',
				value: `Term ${i}`,
				model: 'component_input_text',
			},
		],
	});

	before(() => {
		data_manager.request = async (options) => {
			const body = options.body;
			const source = body?.source || {};
			if (body?.action === 'get_node_data' && String(source.section_id) === ROOT.section_id) {
				return {
					ok: true,
					data: { ...child_fixture(1), ts_parent: null, has_descriptor_children: true },
				};
			}
			return { ok: true, data: true };
		};
	});
	after(() => {
		data_manager.request = original_request;
	});

	let instance;

	it(`a node handed ${RENDER_BUDGET_ENTRIES} children materializes at most ROW_WINDOW_MAX_ROWS`, async () => {
		instance = await ts_object.get_instance({
			area_model: 'area_thesaurus',
			caller: {
				filter: {},
				build_options: {},
				id: 'render_budget_caller',
				id_base: 'test3__test3',
				model: 'area_thesaurus',
			},
			children_tipo: 'test71',
			is_ontology: false,
			is_root_node: false,
			linker: undefined,
			section_id: ROOT.section_id,
			section_tipo: ROOT.section_tipo,
			thesaurus_mode: 'default',
			thesaurus_view_mode: null,
		});
		await instance.build(true);
		const node = await instance.render();
		test_container.appendChild(node);
		assert.equal(
			instance.children_container instanceof Element,
			true,
			'children_container expected',
		);

		const ar_children_data = Array.from({ length: RENDER_BUDGET_ENTRIES }, (_, i) =>
			child_fixture(i + 2),
		);
		instance.children_data = { ar_children_data, pagination: null };
		const result = await instance.render_children({
			clean_children_container: true,
			children_data: instance.children_data,
		});
		assert.equal(result, true);

		const wrappers = instance.children_container.querySelectorAll(':scope > .wrap_ts_object');
		assert.equal(
			wrappers.length > 0,
			true,
			'the first window of children must be in the tree when render_children resolves',
		);
		assert.equal(
			wrappers.length <= ROW_WINDOW_MAX_ROWS,
			true,
			`built ${wrappers.length} children for ${RENDER_BUDGET_ENTRIES}; the bound is ${ROW_WINDOW_MAX_ROWS}`,
		);
		assert.equal(
			instance.ar_instances.filter((el) => el.model === 'ts_object').length <= ROW_WINDOW_MAX_ROWS,
			true,
		);
		assert.equal(instance.row_window.range().total, RENDER_BUDGET_ENTRIES);
	});

	it('reveal_child materializes a far child (the search-hierarchization door) within the bound', async () => {
		const far = `test3_${RENDER_BUDGET_ENTRIES + 1}`;
		const node = await instance.reveal_child(far);
		assert.equal(node instanceof Element, true, 'the far child must be in the tree after reveal');
		assert.equal(instance.children_container.contains(node), true);
		const wrappers = instance.children_container.querySelectorAll(':scope > .wrap_ts_object');
		assert.equal(wrappers.length <= ROW_WINDOW_MAX_ROWS, true);
		assert.equal(await instance.reveal_child('test3_nope'), null, 'not a child → null');
	});

	it('virtual_order is index-based across the window', () => {
		// the revealed last child carries its DATA position, not a DOM count
		const last = instance.ar_instances.find(
			(el) => el.model === 'ts_object' && el.ts_id === `test3_${RENDER_BUDGET_ENTRIES + 1}`,
		);
		assert.equal(Boolean(last), true);
		assert.equal(last.virtual_order, RENDER_BUDGET_ENTRIES);
	});

	it('destroying the node stops the window', async () => {
		await instance.destroy(true, true, true);
		assert.equal(instance.row_window, null);
	});
});

// @license-end
