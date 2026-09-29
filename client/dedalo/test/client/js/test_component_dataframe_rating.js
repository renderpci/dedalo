// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

/**
 * TEST_COMPONENT_DATAFRAME_RATING
 * The rating chip of a dataframe slot in a LIST reads ITS OWN ROW's frame child
 * (WC-2026-09-29-tm-preview-frame-children-as-of, "the history list").
 *
 * A list's datum is ONE bag shared by every row. The server emits a frame
 * target's children once per listed row that links it, stamped with the row
 * (`row_section_id`) — and in the time machine history list each copy is read
 * AS OF its own row, so two rows linking the same target carry DIFFERENT
 * ratings under an otherwise identical identity (tipo, section_tipo,
 * section_id, from_component_tipo). `get_rating` used to ignore the row: every
 * row showed the first-emitted copy (the newest row's, i.e. the live value),
 * never its own historical one.
 *
 * NO BACKEND, BY CONSTRUCTION. The slot is a plain object carrying exactly what
 * get_rating reads (request_config_object, data, datum, tipo), with
 * component_dataframe.prototype.get_rating called on it.
 */

// imports
import { ui } from '../../../core/common/js/ui.js';
import { component_dataframe } from '../../../core/component_dataframe/js/component_dataframe.js';
import { view_default_list_dataframe } from '../../../core/component_dataframe/js/view_default_list_dataframe.js';
import { view_mini_list_dataframe } from '../../../core/component_dataframe/js/view_mini_list_dataframe.js';

// fixtures
const SLOT_TIPO = 'test6744';
const RATING_TIPO = 'test6746';
const FRAME_TIPO = 'test6100';
const TARGET_ID = 585;

// a rating frame child as the server emits it into the shared list datum
const rating_item = (row_section_id, value) => {
	const item = {
		tipo: RATING_TIPO,
		section_tipo: FRAME_TIPO,
		section_id: TARGET_ID,
		from_component_tipo: SLOT_TIPO,
		mode: 'list',
		entries: [{ value: value }],
	};
	if (row_section_id !== undefined) item.row_section_id = row_section_id;
	return item;
};

// a slot of one listed row, sharing `datum` with every other row
const make_slot = (datum, row_section_id) => {
	const data = {
		entries: [{ section_tipo: FRAME_TIPO, section_id: TARGET_ID, id_key: 1 }],
	};
	if (row_section_id !== undefined) data.row_section_id = row_section_id;
	return {
		tipo: SLOT_TIPO,
		section_id: row_section_id,
		request_config_object: {
			hide: { ddo_map: [{ tipo: RATING_TIPO, role: 'rating' }] },
		},
		data: data,
		datum: datum,
	};
};

const get_rating = (slot) => component_dataframe.prototype.get_rating.call(slot);

describe('component_dataframe — the rating chip reads its own row', () => {
	it('two listed rows sharing a frame target each read THEIR copy of the rating (row_section_id)', () => {
		// newest-first list: row 102's copy (the live value) is emitted first
		const datum = { data: [rating_item(102, 'live'), rating_item(101, 'as_of_101')] };

		const newest = get_rating(make_slot(datum, 102));
		const older = get_rating(make_slot(datum, 101));

		assert.ok(newest, 'the newest row finds its rating');
		assert.ok(older, 'the older row finds its rating');
		assert.strictEqual(newest.entries[0].value, 'live');
		assert.strictEqual(
			older.entries[0].value,
			'as_of_101',
			"the older row must show its OWN as-of rating, not the first-emitted row's",
		);
	});

	it('the row key compares ids across number/string shapes', () => {
		const datum = { data: [rating_item(102, 'live'), rating_item('101', 'as_of_101')] };
		assert.strictEqual(get_rating(make_slot(datum, 101)).entries[0].value, 'as_of_101');
	});

	it("a row with no copy of its own gets NO rating, never another row's", () => {
		const datum = { data: [rating_item(102, 'live')] };
		assert.strictEqual(get_rating(make_slot(datum, 101)), undefined);
	});

	it('without row stamps (either side) the lookup is the unscoped one', () => {
		const unstamped = { data: [rating_item(undefined, 'only')] };
		assert.strictEqual(get_rating(make_slot(unstamped, 101)).entries[0].value, 'only');
		const stamped = { data: [rating_item(102, 'live')] };
		assert.strictEqual(get_rating(make_slot(stamped, undefined)).entries[0].value, 'live');
	});
});

/**
 * ONE RATING, EMITTED ONCE PER DDO (the tool_time_machine apply crash).
 * The server emits the rating component once per ddo naming it
 * (WC-2026-08-05-multi-engine-ddo-expansion): the show ddo in mode 'edit' WITH a
 * datalist and the hide `role:"rating"` ddo in mode 'solved', which may come
 * WITHOUT one. After a time machine apply the portal refresh merged them into
 * the datum reversed (solved first), get_rating took the first match and the
 * chip threw `rating_data.datalist.find` on undefined, killing the refresh.
 */
const DATALIST_A = [{ section_id: 3, hide: [{ literal: '#ff0000' }] }];
const DATALIST_B = [{ section_id: 3, hide: [{ literal: '#00ff00' }] }];

// the same frame child emitted in `mode`, optionally with a datalist
const moded_item = (mode, datalist) => {
	const item = {
		tipo: RATING_TIPO,
		section_tipo: FRAME_TIPO,
		section_id: TARGET_ID,
		from_component_tipo: SLOT_TIPO,
		mode: mode,
		entries: [{ section_tipo: 'test6200', section_id: 3 }],
	};
	if (datalist) item.datalist = datalist;
	return item;
};

// a slot whose rating ddo declares `mode` (undefined: no mode declared)
const moded_slot = (datum, mode) => {
	const slot = make_slot(datum, undefined);
	const ddo = { tipo: RATING_TIPO, role: 'rating' };
	if (mode !== undefined) ddo.mode = mode;
	slot.request_config_object = { hide: { ddo_map: [ddo] } };
	return slot;
};

describe('component_dataframe — the rating emitted once per ddo (edit + solved)', () => {
	it('solved FIRST (no datalist), edit second: the datalist-bearing item is chosen', () => {
		const datum = { data: [moded_item('solved'), moded_item('edit', DATALIST_A)] };
		for (const mode of ['solved', undefined]) {
			const found = get_rating(moded_slot(datum, mode));
			assert.ok(found, `found (ddo mode ${mode})`);
			assert.strictEqual(found.mode, 'edit', `ddo mode ${mode}: the item WITH a datalist`);
			assert.strictEqual(found.datalist, DATALIST_A);
		}
	});

	it("a mode-matched item WITH a datalist wins over another mode's", () => {
		const datum = { data: [moded_item('edit', DATALIST_A), moded_item('solved', DATALIST_B)] };
		const found = get_rating(moded_slot(datum, 'solved'));
		assert.strictEqual(found.mode, 'solved');
		assert.strictEqual(found.datalist, DATALIST_B);
	});

	it('no item carries a datalist: the mode-matched one is still returned (the view guards)', () => {
		const datum = { data: [moded_item('edit'), moded_item('solved')] };
		assert.strictEqual(get_rating(moded_slot(datum, 'solved')).mode, 'solved');
		assert.strictEqual(get_rating(moded_slot(datum, undefined)).mode, 'edit');
	});
});

describe('component_dataframe — a rating without datalist paints the default colour', () => {
	// a live list slot whose get_rating returns `rating_data`
	const render_slot = (rating_data) => ({
		model: 'component_dataframe',
		type: 'component',
		mode: 'list',
		tipo: SLOT_TIPO,
		section_tipo: 'test6099',
		section_id: 7,
		permissions: 2,
		show_interface: {},
		context: {},
		properties: { label: 'R' },
		target_section: [{ tipo: FRAME_TIPO, label: 'Frame' }],
		request_config_object: { hide: { ddo_map: [] } },
		data: { entries: [{ section_tipo: FRAME_TIPO, section_id: TARGET_ID, id_key: 1 }] },
		datum: { data: [] },
		get_rating() {
			return rating_data;
		},
	});

	// the browser-normalized form of a CSS colour
	const normalized = (color) => {
		const probe = document.createElement('span');
		probe.style.backgroundColor = color;
		return probe.style.backgroundColor;
	};
	const default_color = () => normalized(ui.css_var('--color_blue_3', '#006ed2'));

	const views = {
		view_default_list_dataframe: view_default_list_dataframe,
		view_mini_list_dataframe: view_mini_list_dataframe,
	};

	for (const [name, view] of Object.entries(views)) {
		const chip_color = async (rating_data) => {
			const node = await view.render(render_slot(rating_data), { render_level: 'content' });
			return node.querySelector('.button.activate').style.backgroundColor;
		};

		it(`${name}: control — a datalist option paints its literal`, async () => {
			assert.strictEqual(await chip_color(moded_item('edit', DATALIST_A)), 'rgb(255, 0, 0)');
		});

		it(`${name}: a set rating WITHOUT datalist does not throw and paints the default`, async () => {
			assert.strictEqual(await chip_color(moded_item('solved')), default_color());
		});
	}
});

// @license-end
