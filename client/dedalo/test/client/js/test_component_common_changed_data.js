// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

import {component_common} from '../../../core/component_common/js/component_common.js'



/**
* COMPONENT_COMMON CHANGED_DATA ID/KEY
* Drives the SHIPPED `component_common.prototype.update_data_value` — the real
* function out of the real module, called on a plain object as `this`. It used to
* be driven against a hand-copied mock of that function living in this file: the
* copy went on asserting the pre-2026-08-30 contract (a remove with a null id
* WIPED every entry) while the shipped function was fixed, so this suite stayed
* green on a behaviour the engine no longer has. A copy is not a gate.
*
* THE CONTRACT (DATA-06 / P0-8,
* `engineering/wire_contract/WC-2026-08-30-remove-requires-item-id.md`):
* a remove NAMES the item it removes; emptying the component is the separate,
* explicit `clear` action. A null/undefined/empty id is not a caller saying
* "all" — it is every caller's UNKNOWN-ID SENTINEL (an unsaved row, the
* `item.id || null` idiom, an omitted MCP item_id), and honouring it destroyed
* curated values in languages nobody was editing. ONE carve-out, asserted below:
* a SEARCH instance is a transient filter model with no save path, so emptying it
* is not a delete.
*
* Server twin (the same law, at the write door):
* `test/unit/remove_sentinel_native.test.ts`.
*/
describe("COMPONENT_COMMON CHANGED_DATA ID/KEY", async function() {

	this.timeout(5000);


	/**
	* build_component
	* A minimal `this` for update_data_value: the shipped function reads only
	* self.data.entries plus the identity fields it names in its refusal.
	* @param array entries
	* @param string|null mode = 'edit'
	* @return object
	*/
	function build_component(entries, mode) {
		return {
			data			: { entries : entries },
			// EXPLICIT: the remove guard branches on the instance's OWN mode — a
			// search instance is a transient filter model, not a record (see the
			// search-mode case below).
			mode			: mode || 'edit',
			model			: 'component_input_text',
			tipo			: 'test66',
			section_tipo	: 'test3',
			section_id		: 1,
			label			: 'Test component',
			id				: 'test66_test3_1_edit',

			update_data_value : component_common.prototype.update_data_value
		}
	}


	/**
	* with_stubbed_alert
	* The refusal path calls alert(): a real modal FREEZES the headless run, and
	* the message itself is part of the contract (the curator clicked delete and
	* must be told that nothing was deleted).
	* @param function fn
	* @return array messages
	*/
	function with_stubbed_alert(fn) {
		const original	= window.alert
		const messages	= []
		window.alert = (msg) => { messages.push(msg) }
		try {
			fn(messages)
		} finally {
			window.alert = original
		}
		return messages
	}



	describe('update_data_value() - update action', async function() {

		it('should update entry by id', async function() {
			const component = build_component([
				{ value: 'first', id: 101 },
				{ value: 'second', id: 102 },
				{ value: 'third', id: 103 }
			])

			const result = component.update_data_value({
				action: 'update',
				id: 102,
				value: { value: 'UPDATED second', id: 102 }
			});

			assert.strictEqual(result, true);
			assert.strictEqual(component.data.entries.length, 3);

			const updated = component.data.entries.find(e => e.id === 102);
			assert.isDefined(updated);
			assert.strictEqual(updated.value, 'UPDATED second');

			assert.strictEqual(component.data.entries[0].value, 'first');
			assert.strictEqual(component.data.entries[2].value, 'third');
		});

		it('should append entry when id not found', async function() {
			const component = build_component([
				{ value: 'existing', id: 201 }
			])

			component.update_data_value({
				action: 'update',
				id: 999,
				value: { value: 'new via update', id: 999 }
			});

			assert.strictEqual(component.data.entries.length, 2);

			const lastEntry = component.data.entries[1];
			assert.strictEqual(lastEntry.value, 'new via update');
			assert.strictEqual(lastEntry.id, 999);
		});

		it('should append entry when id is null', async function() {
			const component = build_component([
				{ value: 'existing', id: 301 }
			])

			component.update_data_value({
				action: 'update',
				id: null,
				value: { value: 'appended', id: null }
			});

			assert.strictEqual(component.data.entries.length, 2);

			const lastEntry = component.data.entries[1];
			assert.strictEqual(lastEntry.value, 'appended');
		});

		it('should preserve entry order when updating', async function() {
			const component = build_component([
				{ value: 'pos_0', id: 401 },
				{ value: 'pos_1', id: 402 },
				{ value: 'pos_2', id: 403 },
				{ value: 'pos_3', id: 404 }
			])

			component.update_data_value({
				action: 'update',
				id: 402,
				value: { value: 'UPDATED pos_1', id: 402 }
			});

			assert.strictEqual(component.data.entries[0].id, 401);
			assert.strictEqual(component.data.entries[1].id, 402);
			assert.strictEqual(component.data.entries[2].id, 403);
			assert.strictEqual(component.data.entries[3].id, 404);

			assert.strictEqual(component.data.entries[1].value, 'UPDATED pos_1');
		});

		it('should handle empty entries array', async function() {
			const component = build_component([])

			component.update_data_value({
				action: 'update',
				id: 501,
				value: { value: 'should be appended', id: 501 }
			});

			assert.strictEqual(component.data.entries.length, 1);
			assert.strictEqual(component.data.entries[0].value, 'should be appended');
		});

	});



	describe('update_data_value() - remove action', async function() {

		it('should remove single entry by id', async function() {
			const component = build_component([
				{ value: 'keep 1', id: 601 },
				{ value: 'remove', id: 602 },
				{ value: 'keep 2', id: 603 }
			])

			const result = component.update_data_value({
				action: 'remove',
				id: 602,
				value: null
			});

			assert.strictEqual(result, true);
			assert.strictEqual(component.data.entries.length, 2);

			const ids = component.data.entries.map(e => e.id);
			assert.include(ids, 601);
			assert.include(ids, 603);
			assert.notInclude(ids, 602);
		});

		it('should remove entry id 0 — a real id, not an absence', async function() {
			// The `item.id || null` idiom collapses 0, so the refusal below must key
			// on null/undefined ONLY: a guard that also refused 0 would make the
			// first item of a legacy component undeletable.
			const component = build_component([
				{ value: 'zero', id: 0 },
				{ value: 'one', id: 1 }
			])

			const messages = with_stubbed_alert(() => {
				assert.strictEqual(component.update_data_value({
					action: 'remove',
					id: 0,
					value: null
				}), true);
			});

			assert.strictEqual(component.data.entries.length, 1);
			assert.strictEqual(component.data.entries[0].id, 1);
			assert.strictEqual(messages.length, 0, 'a legitimate remove must not alert');
		});

		it('should REFUSE a remove with a null id, and tell the user', async function() {
			// THE DEFECT THIS FENCES (DATA-06): this shape used to clear every entry
			// locally and post a wipe the server applied to every language.
			const component = build_component([
				{ value: 'first', id: 701 },
				{ value: 'second', id: 702 },
				{ value: 'third', id: 703 }
			])

			const messages = with_stubbed_alert(() => {
				// false aborts change_value BEFORE save(), so nothing reaches the wire.
				assert.strictEqual(component.update_data_value({
					action: 'remove',
					id: null,
					value: null
				}), false);
			});

			assert.strictEqual(component.data.entries.length, 3);
			assert.strictEqual(messages.length, 1, 'a silent refusal would leave the user believing the row is gone');
			assert.include(messages[0], 'nothing was deleted');
		});

		it('should REFUSE a remove with an omitted id', async function() {
			// The shape JSON.stringify produces from `id : undefined`.
			const component = build_component([
				{ value: 'only entry', id: 801 }
			])

			const messages = with_stubbed_alert(() => {
				assert.strictEqual(component.update_data_value({
					action: 'remove',
					value: null
				}), false);
			});

			assert.strictEqual(component.data.entries.length, 1);
			assert.strictEqual(messages.length, 1);
		});

		it('should REFUSE a remove whose id is an empty string', async function() {
			// SAME DOOR, SAME SET. The server predicate (unnamedRemoveRefusal,
			// src/core/section/record/save_component.ts) refuses null, undefined AND
			// '' — an empty form field and the `|| null` idiom both produce ''. If
			// this door accepted it, the delete would pass both client guards and die
			// at the wire as a failed save, far from the user who clicked. The two
			// doors are asserted to agree in test/unit/remove_sentinel_native.test.ts.
			const component = build_component([
				{ value: 'first', id: 901 },
				{ value: 'second', id: 902 }
			])

			const messages = with_stubbed_alert(() => {
				assert.strictEqual(component.update_data_value({
					action: 'remove',
					id: '',
					value: null
				}), false);
			});

			assert.strictEqual(component.data.entries.length, 2);
			assert.strictEqual(messages.length, 1);
		});

		it('should REFUSE a remove that names a key instead of an id', async function() {
			// The component_input_text / component_email `_do_remove(id, key)` shape
			// for an unsaved row. A key is a POSITION in the rendered array; no branch
			// of the write engine resolves one to an item.
			const component = build_component([
				{ value: 'first', id: 1001 },
				{ value: 'second', id: 1002 }
			])

			const messages = with_stubbed_alert(() => {
				assert.strictEqual(component.update_data_value({
					action: 'remove',
					id: null,
					key: 0,
					value: null
				}), false);
			});

			assert.strictEqual(component.data.entries.length, 2);
			assert.strictEqual(messages.length, 1);
		});

		it('should handle remove with non-existent id as a local no-op', async function() {
			// NOT a refusal and NOT a wipe: entries can be a paginated slice, so the
			// server owns the whole array and answers for an id it does not hold.
			const component = build_component([
				{ value: 'only entry', id: 1101 }
			])

			const messages = with_stubbed_alert(() => {
				assert.strictEqual(component.update_data_value({
					action: 'remove',
					id: 999,
					value: null
				}), true);
			});

			assert.strictEqual(component.data.entries.length, 1);
			assert.strictEqual(component.data.entries[0].id, 1101);
			assert.strictEqual(messages.length, 0);
		});

		it('should still empty a SEARCH instance on an id-less remove', async function() {
			// THE LEGITIMATE GESTURE the guard must not break. A search instance's
			// `data` is a transient FILTER model with no save path — the shared
			// handlers call update_data_value INSTEAD of change_value when
			// self.mode==='search' — and its entries carry no id at all, so clearing
			// the filter can only be spelled as an id-less remove. Refusing it would
			// leave the cleared filter standing in the model and run the search with
			// it: wrong results, not a wasted click. It never reaches the wire, and
			// the server door refuses that shape in every mode regardless.
			const component = build_component([
				{ value: 'filter a' },
				{ value: 'filter b' }
			], 'search')

			const messages = with_stubbed_alert(() => {
				assert.strictEqual(component.update_data_value({
					action: 'remove',
					id: null,
					value: null
				}), true);
			});

			assert.strictEqual(component.data.entries.length, 0);
			assert.strictEqual(messages.length, 0, 'nothing was lost, so nothing to alert about');
		});

	});



	describe('update_data_value() - clear action', async function() {

		it('should empty every entry — the ONE deliberate wildcard', async function() {
			// The gesture the "All"/reset buttons mean. It says so, instead of
			// borrowing remove + a null id, which is what an accidental unresolved
			// single-row delete also looks like.
			const component = build_component([
				{ value: 'first', id: 1201 },
				{ value: 'second', id: 1202 },
				{ value: 'third', id: 1203 }
			])

			const messages = with_stubbed_alert(() => {
				assert.strictEqual(component.update_data_value({
					action: 'clear',
					value: null
				}), true);
			});

			assert.strictEqual(component.data.entries.length, 0);
			assert.strictEqual(messages.length, 0);
		});

		it('should clear without an id key at all', async function() {
			const component = build_component([
				{ value: 'only', id: 1301 }
			])

			assert.strictEqual(component.update_data_value({ action: 'clear' }), true);
			assert.strictEqual(component.data.entries.length, 0);
		});

	});



	describe('update_data_value() - insert action', async function() {

		it('should append new entry', async function() {
			const component = build_component([
				{ value: 'existing', id: 1401 }
			])

			component.update_data_value({
				action: 'insert',
				id: null,
				value: { value: 'new entry', id: null }
			});

			assert.strictEqual(component.data.entries.length, 2);

			const lastEntry = component.data.entries[1];
			assert.strictEqual(lastEntry.value, 'new entry');
		});

		it('should create first entry on empty data', async function() {
			const component = build_component([])

			component.update_data_value({
				action: 'insert',
				id: null,
				value: { value: 'first entry', id: null }
			});

			assert.strictEqual(component.data.entries.length, 1);
			assert.strictEqual(component.data.entries[0].value, 'first entry');
		});

	});



	describe('update_data_value() - set_data action', async function() {

		it('should replace all entries', async function() {
			const component = build_component([
				{ value: 'old1', id: 1501 },
				{ value: 'old2', id: 1502 }
			])

			const newData = [
				{ value: 'new1', id: 2001 },
				{ value: 'new2', id: 2002 },
				{ value: 'new3', id: 2003 }
			];

			component.update_data_value({
				action: 'set_data',
				id: null,
				value: newData
			});

			assert.strictEqual(component.data.entries.length, 3);

			const ids = component.data.entries.map(e => e.id);
			assert.notInclude(ids, 1501);
			assert.notInclude(ids, 1502);
			assert.include(ids, 2001);
			assert.include(ids, 2002);
			assert.include(ids, 2003);
		});

		it('should handle empty set_data', async function() {
			const component = build_component([
				{ value: 'data', id: 1601 }
			])

			component.update_data_value({
				action: 'set_data',
				id: null,
				value: []
			});

			assert.strictEqual(component.data.entries.length, 0);
		});

	});



	describe('update_data_value() - data flow simulation', async function() {

		it('should simulate multi-step update flow', async function() {
			const component = build_component([
				{ value: 'alpha', id: 3001 },
				{ value: 'beta', id: 3002 },
				{ value: 'gamma', id: 3003 }
			])

			component.update_data_value({
				action: 'update',
				id: 3002,
				value: { value: 'BETA UPDATED', id: 3002 }
			});

			assert.strictEqual(component.data.entries.length, 3);
			assert.strictEqual(component.data.entries[1].value, 'BETA UPDATED');

			component.update_data_value({
				action: 'remove',
				id: 3003,
				value: null
			});

			assert.strictEqual(component.data.entries.length, 2);

			const ids = component.data.entries.map(e => e.id);
			assert.include(ids, 3001);
			assert.include(ids, 3002);
		});

		it('should handle complex value objects (date-like)', async function() {
			const component = build_component([
				{
					id: 4001,
					value: { day: 15, month: 3, year: 2024 }
				}
			])

			component.update_data_value({
				action: 'update',
				id: 4001,
				value: {
					id: 4001,
					value: { day: 20, month: 5, year: 2025 }
				}
			});

			assert.strictEqual(component.data.entries.length, 1);
			assert.strictEqual(component.data.entries[0].value.day, 20);
			assert.strictEqual(component.data.entries[0].value.month, 5);
			assert.strictEqual(component.data.entries[0].value.year, 2025);
		});

		it('should handle component_iri style entries', async function() {
			const component = build_component([
				{
					id: 5001,
					value: { title: 'Example IRI', uri: 'http://example.com/1' }
				},
				{
					id: 5002,
					value: { title: 'Another IRI', uri: 'http://example.com/2' }
				}
			])

			component.update_data_value({
				action: 'update',
				id: 5002,
				value: {
					id: 5002,
					value: { title: 'UPDATED IRI', uri: 'http://example.com/updated' }
				}
			});

			assert.strictEqual(component.data.entries.length, 2);
			assert.strictEqual(component.data.entries[1].value.title, 'UPDATED IRI');
			assert.strictEqual(component.data.entries[1].value.uri, 'http://example.com/updated');
		});

	});

});



// @license-end
