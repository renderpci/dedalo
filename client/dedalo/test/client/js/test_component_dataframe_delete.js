// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, afterEach, assert */
/*eslint no-undef: "error"*/

/**
 * TEST_COMPONENT_DATAFRAME_DELETE
 * The client half of the dataframe DELETE door
 * (engineering/wire_contract/WC-2026-09-06-dataframe-delete-policy-on-slot.md).
 *
 * The client removes the frame LOCATOR only; what happens to the frame target
 * record is the server's, from the slot node's delete policy. Two client facts
 * make that door work, and each regressed silently once:
 *
 *  1. `delete_dataframe` must hand `unlink_record` the STORED frame entries —
 *     the ones carrying an `id`, selected by their PAIRING (id_key +
 *     main_component_tipo). `unlink_record` builds each `remove` from `el.id`,
 *     so a locator without one removes nothing. Until 2026-09-06 it passed
 *     `{paginated_key, row_key, section_id}` (no id): the button reported
 *     success and the frame stayed on the record. A lookup by the HOST's
 *     section_id (the only id the callers know) is the second wrong shape, and
 *     it is asserted against too: the frame target's id is unrelated to it.
 *  2. The modal's second confirm — the "the record goes" grammar — switches on
 *     the SERVER-resolved `context.delete_policy` and on nothing else. The
 *     ontology properties are not re-read here: one reader, one meaning.
 *
 * NO BACKEND, BY CONSTRUCTION. The frame instance is a plain object registered
 * in the shared instance registry under the exact identity `delete_dataframe`
 * looks up (model/tipo/section_tipo/section_id + data.id_key/main_component_tipo),
 * with a spy `unlink_record`. Nothing is read from the ontology or the API.
 */

// imports
import { add_instance, delete_instance } from '../../../core/common/js/instances.js';
import { delete_dataframe } from '../../../core/component_common/js/dataframe.js';
import { needs_double_confirm } from '../../../core/component_dataframe/js/view_default_list_dataframe.js';

// fixtures
const HOST_TIPO = 'test6099';
const HOST_ID = 7;
const MAIN_TIPO = 'test6117';
const SLOT_TIPO = 'test6744';
const FRAME_TIPO = 'test6100';
const REGISTRY_KEY = 'test_component_dataframe_delete__fake_frame';

// the caller (main component) as delete_dataframe reads it
const make_main = function () {
	return {
		tipo: MAIN_TIPO,
		request_config_object: {
			show: {
				ddo_map: [
					{ tipo: MAIN_TIPO, model: 'component_autocomplete', section_tipo: HOST_TIPO },
					{ tipo: SLOT_TIPO, model: 'component_dataframe', section_tipo: HOST_TIPO },
				],
			},
		},
	};
};

// a stored dd490 entry as the server serves it in data.entries
const entry = function (id, id_key, target_id) {
	return {
		id: id,
		type: 'dd490',
		section_id: target_id,
		section_tipo: FRAME_TIPO,
		from_component_tipo: SLOT_TIPO,
		main_component_tipo: MAIN_TIPO,
		id_key: id_key,
	};
};

// the live frame instance: the identity the lookup asks for + a spy unlink
const register_frame = function (entries, id_key) {
	const calls = [];
	const frame = {
		model: 'component_dataframe',
		tipo: SLOT_TIPO,
		section_tipo: HOST_TIPO,
		section_id: HOST_ID,
		data: {
			id_key: id_key,
			main_component_tipo: MAIN_TIPO,
			entries: entries,
		},
		unlink_record: async function (locator) {
			calls.push(locator);
			return true;
		},
		destroy: async function () {
			return true;
		},
	};
	add_instance(REGISTRY_KEY, frame);
	return calls;
};

describe('component_dataframe — the DELETE door (client half)', function () {
	afterEach(function () {
		delete_instance(REGISTRY_KEY);
	});

	it('delete_dataframe hands unlink_record the STORED entries paired to (id_key, main_component_tipo), with their ids', async function () {
		// two frames on the record: item 1 → target 501, item 2 → target 502
		const calls = register_frame([entry(1, 1, 501), entry(2, 2, 502)], 1);

		const removed = await delete_dataframe({
			self: make_main(),
			section_id: HOST_ID, // the HOST record — the only id the caller knows
			section_tipo: HOST_TIPO,
			id_key: 1,
			main_component_tipo: MAIN_TIPO,
		});

		assert.strictEqual(removed, true);
		assert.strictEqual(calls.length, 1, 'exactly one unlink call');
		const passed = calls[0];
		assert.ok(Array.isArray(passed), 'unlink_record receives the entries as an array');
		assert.strictEqual(passed.length, 1, 'only the frame paired to item 1');
		assert.strictEqual(
			passed[0].id,
			1,
			'the STORED entry, with its id — a remove without an id removes nothing',
		);
		assert.strictEqual(passed[0].section_id, 501, 'the frame TARGET address, not the host id');
		assert.strictEqual(passed[0].id_key, 1);
	});

	it('a frame whose target id happens to equal the host id is still selected by pairing, never by section_id', async function () {
		// target 7 === HOST_ID on item 2; item 1's target is 501. Asking for item 1
		// must NOT pick item 2's entry because its section_id matches the host.
		const calls = register_frame([entry(1, 1, 501), entry(2, 2, HOST_ID)], 1);
		await delete_dataframe({
			self: make_main(),
			section_id: HOST_ID,
			section_tipo: HOST_TIPO,
			id_key: 1,
			main_component_tipo: MAIN_TIPO,
		});
		assert.strictEqual(calls.length, 1);
		assert.deepStrictEqual(
			calls[0].map((el) => el.id),
			[1],
		);
	});

	it('refuses (false, no unlink) when no paired entry carries an id', async function () {
		const calls = register_frame([{ ...entry(1, 1, 501), id: undefined }], 1);
		const removed = await delete_dataframe({
			self: make_main(),
			section_id: HOST_ID,
			section_tipo: HOST_TIPO,
			id_key: 1,
			main_component_tipo: MAIN_TIPO,
		});
		assert.strictEqual(removed, false);
		assert.strictEqual(calls.length, 0, 'nothing is unlinked without an id');
	});

	it('refuses (false, no unlink) when the pairing keys are missing', async function () {
		const calls = register_frame([entry(1, 1, 501)], 1);
		const removed = await delete_dataframe({
			self: make_main(),
			section_id: HOST_ID,
			section_tipo: HOST_TIPO,
		});
		assert.strictEqual(removed, false);
		assert.strictEqual(calls.length, 0);
	});

	it('the second confirm switches on the server-resolved context.delete_policy only', function () {
		assert.strictEqual(needs_double_confirm({ delete_policy: 'delete_target_record' }), true);
		assert.strictEqual(needs_double_confirm({ delete_policy: 'delete_target' }), false);
		assert.strictEqual(needs_double_confirm({ delete_policy: 'unlink' }), false);
		assert.strictEqual(needs_double_confirm({}), false);
		assert.strictEqual(needs_double_confirm(null), false);
		// the ontology properties are NOT a source: one reader, on the server
		assert.strictEqual(needs_double_confirm({ properties: { hard_delete: true } }), false);
		assert.strictEqual(
			needs_double_confirm({
				properties: { dataframe: { delete_policy: 'delete_target_record' } },
			}),
			false,
		);
	});
});

// @license-end
