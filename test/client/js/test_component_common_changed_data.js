// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global assert */
/*eslint no-undef: "error"*/

import {get_instance} from '../../../core/common/js/instances.js'



describe("COMPONENT_COMMON CHANGED_DATA ID/KEY", async function() {

	this.timeout(5000);


	/**
	 * Helper: create a mock component-like object with update_data_value
	 * to test the JS logic without full instantiation
	 */
	function createMockComponent() {
		return {
			data: { entries: [] },

			update_data_value: function(changed_data_item) {
				const self = this;

				const action			= changed_data_item.action;
				const changed_value		= changed_data_item.value;
				const changed_id		= typeof changed_data_item.id!=='undefined'
					? changed_data_item.id
					: null;

				self.data = self.data || {};

				if(action==='set_data'){
					self.data.entries = changed_value || [];
					return true;
				}

				let data_key = null;
				let id_not_found = false;
				if (changed_id !== null) {
					const idx = self.data.entries?.findIndex(entry => entry?.id === changed_id) ?? -1;
					if (idx !== -1) {
						data_key = idx;
					}else{
						id_not_found = true;
					}
				}

				if (action==='remove' && data_key===null && changed_value===null && !id_not_found) {
					self.data.entries = [];
				}else if (data_key===false && changed_value===null) {
					self.data.entries = [];
				}else if (data_key === null) {
					if (changed_value !== null) {
						self.data.entries = self.data.entries || [];
						self.data.entries.push(changed_value);
					}
				}else{
					if (changed_value===null && self.data.entries) {
						self.data.entries.splice(data_key, 1);
					}else{
						self.data.entries = self.data.entries || [];
						self.data.entries[data_key] = changed_value;
					}
				}

				return true;
			}
		};
	}



	describe('update_data_value() - update action', async function() {

		it('should update entry by id', async function() {
			const component = createMockComponent();
			component.data.entries = [
				{ value: 'first', id: 101 },
				{ value: 'second', id: 102 },
				{ value: 'third', id: 103 }
			];

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
			const component = createMockComponent();
			component.data.entries = [
				{ value: 'existing', id: 201 }
			];

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
			const component = createMockComponent();
			component.data.entries = [
				{ value: 'existing', id: 301 }
			];

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
			const component = createMockComponent();
			component.data.entries = [
				{ value: 'pos_0', id: 401 },
				{ value: 'pos_1', id: 402 },
				{ value: 'pos_2', id: 403 },
				{ value: 'pos_3', id: 404 }
			];

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
			const component = createMockComponent();
			component.data.entries = [];

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
			const component = createMockComponent();
			component.data.entries = [
				{ value: 'keep 1', id: 601 },
				{ value: 'remove', id: 602 },
				{ value: 'keep 2', id: 603 }
			];

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

		it('should clear all entries when id is null', async function() {
			const component = createMockComponent();
			component.data.entries = [
				{ value: 'first', id: 701 },
				{ value: 'second', id: 702 },
				{ value: 'third', id: 703 }
			];

			component.update_data_value({
				action: 'remove',
				id: null,
				value: null
			});

			assert.strictEqual(component.data.entries.length, 0);
		});

		it('should handle remove with non-existent id', async function() {
			const component = createMockComponent();
			component.data.entries = [
				{ value: 'only entry', id: 801 }
			];

			component.update_data_value({
				action: 'remove',
				id: 999,
				value: null
			});

			assert.strictEqual(component.data.entries.length, 1);
			assert.strictEqual(component.data.entries[0].id, 801);
		});

	});



	describe('update_data_value() - insert action', async function() {

		it('should append new entry', async function() {
			const component = createMockComponent();
			component.data.entries = [
				{ value: 'existing', id: 901 }
			];

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
			const component = createMockComponent();
			component.data.entries = [];

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
			const component = createMockComponent();
			component.data.entries = [
				{ value: 'old1', id: 1001 },
				{ value: 'old2', id: 1002 }
			];

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
			assert.notInclude(ids, 1001);
			assert.notInclude(ids, 1002);
			assert.include(ids, 2001);
			assert.include(ids, 2002);
			assert.include(ids, 2003);
		});

		it('should handle empty set_data', async function() {
			const component = createMockComponent();
			component.data.entries = [
				{ value: 'data', id: 1101 }
			];

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
			const component = createMockComponent();
			component.data.entries = [
				{ value: 'alpha', id: 3001 },
				{ value: 'beta', id: 3002 },
				{ value: 'gamma', id: 3003 }
			];

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
			const component = createMockComponent();
			component.data.entries = [
				{
					id: 4001,
					value: { day: 15, month: 3, year: 2024 }
				}
			];

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
			const component = createMockComponent();
			component.data.entries = [
				{
					id: 5001,
					value: { title: 'Example IRI', uri: 'http://example.com/1' }
				},
				{
					id: 5002,
					value: { title: 'Another IRI', uri: 'http://example.com/2' }
				}
			];

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
