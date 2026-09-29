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
import { component_dataframe } from '../../../core/component_dataframe/js/component_dataframe.js';

// fixtures
const SLOT_TIPO = 'test6744';
const RATING_TIPO = 'test6746';
const FRAME_TIPO = 'test6100';
const TARGET_ID = 585;

// a rating frame child as the server emits it into the shared list datum
const rating_item = function (row_section_id, value) {
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
const make_slot = function (datum, row_section_id) {
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

describe('component_dataframe — the rating chip reads its own row', function () {
	it('two listed rows sharing a frame target each read THEIR copy of the rating (row_section_id)', function () {
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

	it('the row key compares ids across number/string shapes', function () {
		const datum = { data: [rating_item(102, 'live'), rating_item('101', 'as_of_101')] };
		assert.strictEqual(get_rating(make_slot(datum, 101)).entries[0].value, 'as_of_101');
	});

	it("a row with no copy of its own gets NO rating, never another row's", function () {
		const datum = { data: [rating_item(102, 'live')] };
		assert.strictEqual(get_rating(make_slot(datum, 101)), undefined);
	});

	it('without row stamps (either side) the lookup is the unscoped one', function () {
		const unstamped = { data: [rating_item(undefined, 'only')] };
		assert.strictEqual(get_rating(make_slot(unstamped, 101)).entries[0].value, 'only');
		const stamped = { data: [rating_item(102, 'live')] };
		assert.strictEqual(get_rating(make_slot(stamped, undefined)).entries[0].value, 'live');
	});
});

// @license-end
