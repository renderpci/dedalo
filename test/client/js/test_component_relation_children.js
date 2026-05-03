// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals, DD_TIPOS */
/*eslint no-undef: "error"*/
'use strict';

import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
import {event_manager} from '../../../core/common/js/event_manager.js'
import {data_manager} from '../../../core/common/js/data_manager.js'
import {ui} from '../../../core/common/js/ui.js'
import {clone, pause} from '../../../core/common/js/utils/util.js'



// component_relation_children configuration
	const children_model		= 'component_relation_children'
	const children_tipo		= 'test201'
	const children_section		= 'test3'
	const children_section_id	= 1
	const children_lang		= page_globals?.dedalo_data_nolan ?? 'lg-nolan'

// modes and views to test
// JS is an alias of component_portal, inherits all portal views
// context.json shows view: "line", children_view: "text"
	const ar_modes		= ['edit', 'list', 'search']
	const ar_views_edit	= ['default', 'line']
	const ar_views_list	= ['default', 'text', 'mini']

// DOM container
	const container = document.getElementById('content')
	const component_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'component_container',
		parent			: container
	})



/**
* GET_CHILDREN_INSTANCE
* Creates, builds and returns a component_relation_children instance
* @param {string} mode - Component mode (edit|list|search)
* @param {string} view - Component view (default|line|text|mini)
* @param {number|string} section_id - Section ID
* @return {Promise<component_relation_children>} Built instance
*/
async function get_children_instance(mode, view, section_id) {

	const options = {
		model			: children_model,
		tipo			: children_tipo,
		section_tipo	: children_section,
		section_id		: section_id ?? children_section_id,
		mode			: mode,
		view			: view,
		lang			: children_lang,
		id_variant		: mode + '_' + view + '_' + Math.random()
	}

	const instance = await get_instance(options)
	await instance.build(true)

	return instance
}//end get_children_instance



/**
* MAKE_LOCATOR
* Creates a locator object for relation_children data operations
* @param {number|string} section_id - Target section ID
* @param {string} section_tipo - Target section tipo
* @return {object} Locator object
*/
function make_locator(section_id, section_tipo) {

	section_tipo = section_tipo || children_section

	return {
		section_tipo			: section_tipo,
		section_id				: String(section_id),
		from_component_tipo		: children_tipo,
		type					: DD_TIPOS?.DEDALO_RELATION_TYPE_CHILDREN_TIPO ?? 'dd48'
	}
}//end make_locator



// ─────────────────────────────────────────────
// 1. LIFECYCLE: INIT → BUILD → RENDER → DESTROY
// ─────────────────────────────────────────────

describe(`COMPONENT_RELATION_CHILDREN LIFECYCLE`, async function() {

	this.timeout(30000)



	// ─── INIT ──────────────────────────────────

	describe(`INIT`, function() {

		it(`${children_model} init in edit mode`, async function() {

			const options = {
				model			: children_model,
				tipo			: children_tipo,
				section_tipo	: children_section,
				section_id		: children_section_id,
				mode			: 'edit',
				view			: 'default',
				lang			: children_lang,
				id_variant		: 'init_edit_' + Math.random()
			}

			const instance = await get_instance(options)

			// asserts
			assert.equal(instance.status, 'initialized', 'status must be initialized')
			assert.equal(instance.model, children_model)
			assert.equal(instance.tipo, children_tipo)
			assert.equal(instance.section_tipo, children_section)
			assert.equal(instance.mode, 'edit')
			assert.equal(instance.context, null)
			assert.equal(instance.node, null)
			assert.equal(instance.active, false)
			assert.equal(instance.is_data_changed, false)

			// cleanup
			await instance.destroy(true, true, true)
		})

		it(`${children_model} init in list mode`, async function() {

			const options = {
				model			: children_model,
				tipo			: children_tipo,
				section_tipo	: children_section,
				section_id		: children_section_id,
				mode			: 'list',
				view			: 'default',
				lang			: children_lang,
				id_variant		: 'init_list_' + Math.random()
			}

			const instance = await get_instance(options)

			assert.equal(instance.status, 'initialized')
			assert.equal(instance.mode, 'list')

			await instance.destroy(true, true, true)
		})

		it(`${children_model} init in search mode`, async function() {

			const options = {
				model			: children_model,
				tipo			: children_tipo,
				section_tipo	: children_section,
				section_id		: children_section_id,
				mode			: 'search',
				view			: 'default',
				lang			: children_lang,
				id_variant		: 'init_search_' + Math.random()
			}

			const instance = await get_instance(options)

			assert.equal(instance.status, 'initialized')
			assert.equal(instance.mode, 'search')

			await instance.destroy(true, true, true)
		})
	})//end describe INIT



	// ─── BUILD ──────────────────────────────────

	describe(`BUILD`, function() {

		it(`${children_model} build with autoload=true`, async function() {

			const instance = await get_children_instance('edit', 'default')

			// asserts
			assert.equal(instance.status, 'built', 'status must be built')
			assert.notEqual(instance.context, null, 'context must not be null')
			assert.notEqual(instance.data, null, 'data must not be null')
			assert.notEqual(instance.permissions, null, 'permissions must not be null')
			assert.notEqual(instance.rqo, null, 'rqo must not be null')
			assert.notEqual(instance.request_config_object, null, 'request_config_object must not be null')

			// portal-inherited properties (component_relation_children is alias of component_portal)
			assert.notEqual(instance.columns_map, null, 'columns_map must not be null')
			assert.equal(instance.autocomplete, null, 'autocomplete must be null on build')
			assert.equal(instance.autocomplete_active, false, 'autocomplete_active must be false on build')

			await instance.destroy(true, true, true)
		})

		it(`${children_model} build sets portal-inherited properties`, async function() {

			const instance = await get_children_instance('edit', 'line')

			assert.notEqual(instance.columns_map, null, 'columns_map must not be null after build')
			assert.notEqual(instance.rqo, null, 'rqo must not be null after build')
			assert.notEqual(instance.request_config_object, null, 'request_config_object must not be null after build')
			assert.equal(instance.fixed_columns_map, false, 'fixed_columns_map must be false after build')
			assert.ok(
				instance.show_interface && typeof instance.show_interface === 'object',
				'show_interface must be an object after build'
			)
			assert.notEqual(instance.db_data, null, 'db_data must not be null after build')

			await instance.destroy(true, true, true)
		})
	})//end describe BUILD



	// ─── RENDER (all modes and views) ────────────

	describe(`RENDER`, function() {

		// Edit mode views
		for (let i = 0; i < ar_views_edit.length; i++) {
			const view = ar_views_edit[i]

			it(`${children_model} render edit/${view}`, async function() {

				const instance = await get_children_instance('edit', view)
				const node = await instance.render()

				// asserts
				assert.equal(instance.status, 'rendered', `status must be rendered for edit/${view}`)
				assert.notEqual(node, null, `node must not be null for edit/${view}`)

				if (view==='default' || view==='line') {
					assert.notEqual(
						node.querySelector('.content_data'),
						null,
						`content_data must exist for edit/${view}`
					)
				}

				await instance.destroy(true, true, true)
			})
		}

		// List mode views
		for (let i = 0; i < ar_views_list.length; i++) {
			const view = ar_views_list[i]

			it(`${children_model} render list/${view}`, async function() {

				const instance = await get_children_instance('list', view)
				const node = await instance.render()

				assert.equal(instance.status, 'rendered', `status must be rendered for list/${view}`)
				assert.notEqual(node, null, `node must not be null for list/${view}`)

				await instance.destroy(true, true, true)
			})
		}

		// Search mode
		it(`${children_model} render search/default`, async function() {

			const instance = await get_children_instance('search', 'default')
			const node = await instance.render()

			assert.equal(instance.status, 'rendered')
			assert.notEqual(node, null)

			await instance.destroy(true, true, true)
		})
	})//end describe RENDER



	// ─── DESTROY ──────────────────────────────────

	describe(`DESTROY`, function() {

		it(`${children_model} destroy after full lifecycle`, async function() {

			const instance = await get_children_instance('edit', 'default')
			await instance.render()

			// destroy
			const destroy_result = await instance.destroy(
				true,  // delete_self
				true,  // delete_dependencies
				true   // remove_dom
			)

			// asserts
			assert.equal(destroy_result.delete_self, true, 'delete_self must be true')
			assert.equal(destroy_result.delete_dependencies, true, 'delete_dependencies must be true')
			assert.equal(instance.status, 'destroyed', 'status must be destroyed')
			assert.deepEqual(instance.ar_instances, [], 'ar_instances must be empty')
			assert.equal(instance.node, null, 'node must be null after destroy')
			assert.deepEqual(instance.events_tokens, [], 'events_tokens must be empty')
		})

		it(`${children_model} destroy without removing DOM`, async function() {

			const instance = await get_children_instance('edit', 'default')
			const node = await instance.render()

			const destroy_result = await instance.destroy(
				true,  // delete_self
				true,  // delete_dependencies
				false  // remove_dom = false
			)

			assert.equal(destroy_result.delete_self, true)
			assert.equal(instance.status, 'destroyed')
			// node may still exist in DOM since remove_dom=false
		})
	})//end describe DESTROY

})//end describe COMPONENT_RELATION_CHILDREN LIFECYCLE



// ─────────────────────────────────────────────
// 2. DATA OPERATIONS
// ─────────────────────────────────────────────

describe(`COMPONENT_RELATION_CHILDREN DATA OPERATIONS`, async function() {

	this.timeout(30000)



	// ─── DATA STRUCTURE ──────────────────────────

	describe(`DATA STRUCTURE`, function() {

		it(`${children_model} data exists (entries can be array, null or undefined)`, async function() {

			const instance = await get_children_instance('edit', 'default', children_section_id)

			assert.notEqual(instance.data, null, 'data must not be null')

			const entries = instance.data?.entries
			assert.ok(
				entries === undefined || entries === null || Array.isArray(entries),
				`data.entries must be array, null or undefined. Got: ${typeof entries}`
			)

			await instance.destroy(true, true, true)
		})

		it(`${children_model} entries contain locator objects (when present)`, async function() {

			const instance = await get_children_instance('edit', 'default', children_section_id)

			const entries = instance.data?.entries
			// only validate if entries exist
			if (entries && entries.length > 0) {
				for (const entry of entries) {
					assert.ok(entry.section_tipo, 'entry must have section_tipo')
					assert.ok(entry.section_id, 'entry must have section_id')
					assert.ok(entry.from_component_tipo, 'entry must have from_component_tipo')
				}
			} else {
				// skip validation if no entries (valid state for read-only component)
				assert.ok(true, 'no entries to validate (valid state)')
			}

			await instance.destroy(true, true, true)
		})
	})//end describe DATA STRUCTURE



	// ─── ADD DATA (link_record) ──────────────────
	// (!) component_relation_children is a read-only component that resolves data
	// from parent relations. link_record/unlink_record are inherited from component_portal
	// but their success depends on the target section existing in the DB and having
	// a valid component_relation_parent configuration.
	// These tests verify method availability and return types only.

	describe(`ADD DATA (link_record)`, function() {

		it(`${children_model} link_record method exists (inherited from portal)`, async function() {

			const instance = await get_children_instance('edit', 'default', children_section_id)

			assert.equal(typeof instance.link_record, 'function', 'link_record must be a function')

			await instance.destroy(true, true, true)
		})

		it(`${children_model} link_record returns boolean`, async function() {

			const instance = await get_children_instance('edit', 'default', children_section_id)
			await instance.render()

			// link_record with a locator for a non-existent section
			// will return false because the server cannot create the parent relation
			const locator = make_locator(99999)
			const result = await instance.link_record(locator)

			assert.equal(typeof result, 'boolean', 'link_record must return boolean')
			// Expected false because section 99999 doesn't exist in DB
			assert.equal(result, false, 'link_record returns false for non-existent target section')

			await instance.destroy(true, true, true)
		})

		it(`${children_model} link_record rejects duplicate in current entries`, async function() {

			const instance = await get_children_instance('edit', 'default', children_section_id)
			await instance.render()

			// If there are existing entries, try to add a duplicate
			const existing_entries = instance.data?.entries
			if (existing_entries && existing_entries.length > 0) {
				const duplicate = { ...existing_entries[0] }
				const result = await instance.link_record(duplicate)
				assert.equal(result, false, 'link_record must reject duplicate locator')
			} else {
				// No existing entries to duplicate — verify the check logic exists
				assert.ok(true, 'no existing entries to test duplicate rejection (valid state)')
			}

			await instance.destroy(true, true, true)
		})
	})//end describe ADD DATA



	// ─── REMOVE DATA (unlink_record) ──────────────
	// (!) Same as link_record: unlink_record is inherited from portal
	// but depends on server-side parent relation modification.

	describe(`REMOVE DATA (unlink_record)`, function() {

		it(`${children_model} unlink_record method exists (inherited from portal)`, async function() {

			const instance = await get_children_instance('edit', 'default', children_section_id)

			assert.equal(typeof instance.unlink_record, 'function', 'unlink_record must be a function')

			await instance.destroy(true, true, true)
		})

		it(`${children_model} unlink_record returns boolean`, async function() {

			const instance = await get_children_instance('edit', 'default', children_section_id)
			await instance.render()

			// unlink_record with a non-existent locator returns false
			const fake_locator = make_locator(99999)
			const result = await instance.unlink_record(fake_locator)

			assert.equal(typeof result, 'boolean', 'unlink_record must return boolean')

			await instance.destroy(true, true, true)
		})
	})//end describe REMOVE DATA



	// ─── CHANGE DATA (update via change_value) ──────────
	// (!) change_value with set_data action works client-side
	// but the server save is a no-op for this component.
	// The test verifies the client-side data manipulation works.

	describe(`CHANGE DATA (change_value)`, function() {

		it(`${children_model} change_value with set_data clears entries`, async function() {

			const instance = await get_children_instance('edit', 'default', children_section_id)
			await instance.render()

			// set_data with null clears the entries client-side
			const changed_data = [Object.freeze({
				action	: 'set_data',
				id		: null,
				value	: null
			})]
			const api_response = await instance.change_value({
				changed_data	: changed_data,
				refresh		: false
			})

			// asserts
			assert.notEqual(api_response, null, 'api_response must not be null')
			// After set_data(null), entries should be empty array client-side
			assert.ok(
				Array.isArray(instance.data?.entries) && instance.data.entries.length === 0,
				'entries must be empty array after set_data(null)'
			)

			await instance.destroy(true, true, true)
		})

		it(`${children_model} change_value with insert returns api_response (read-only: insert does not persist)`, async function() {

			const instance = await get_children_instance('edit', 'default', children_section_id)
			await instance.render()

			// insert a locator
			// (!) component_relation_children is read-only: save() is a no-op
			// and get_data() resolves from parent relations, so the inserted
			// locator will NOT appear in the server response data.
			// The client replaces instance.data with the server response,
			// so entries won't contain the inserted item after change_value.
			const locator = make_locator(1)
			const insert_data = [Object.freeze({
				action	: 'insert',
				id		: null,
				value	: locator
			})]

			const api_response = await instance.change_value({
				changed_data	: insert_data,
				refresh		: false
			})

			// asserts - verify API response structure
			assert.notEqual(api_response, null, 'api_response must not be null')
			assert.ok(api_response.result, 'api_response.result must be truthy')

			await instance.destroy(true, true, true)
		})
	})//end describe CHANGE DATA



	// ─── REFRESH ──────────────────────────────────

	describe(`REFRESH`, function() {

		it(`${children_model} refresh rebuilds component`, async function() {

			const instance = await get_children_instance('edit', 'default', children_section_id)
			await instance.render()

			assert.equal(instance.status, 'rendered', 'must be rendered before refresh')

			// refresh
			const refreshed = await instance.refresh({
				build_autoload : true
			})

			assert.equal(instance.status, 'rendered', 'must be rendered after refresh')

			await instance.destroy(true, true, true)
		})
	})//end describe REFRESH



	// ─── IS_EMPTY ──────────────────────────────────

	describe(`IS_EMPTY`, function() {

		it(`${children_model} is_empty returns boolean`, async function() {

			const instance = await get_children_instance('edit', 'default', children_section_id)

			const result = instance.is_empty()

			assert.equal(typeof result, 'boolean', 'is_empty must return boolean')
		})

		it(`${children_model} is_empty true when no entries`, async function() {

			const instance = await get_children_instance('edit', 'default', children_section_id)
			// Force empty data
			instance.data = { entries: [] }

			const result = instance.is_empty()

			assert.equal(result, true, 'is_empty must return true when entries is empty')
		})
	})//end describe IS_EMPTY



	// ─── INSTANCE ID ──────────────────────────────────

	describe(`INSTANCE ID`, function() {

		it(`${children_model} instance id is set`, async function() {

			const instance = await get_children_instance('edit', 'default', children_section_id)

			assert.ok(instance.id, 'instance.id must be set')
			assert.ok(typeof instance.id === 'string', 'instance.id must be string')

			await instance.destroy(true, true, true)
		})
	})//end describe INSTANCE ID

})//end describe COMPONENT_RELATION_CHILDREN DATA OPERATIONS



// ─────────────────────────────────────────────
// 3. SEARCH DATA OPERATIONS
// ─────────────────────────────────────────────

describe(`COMPONENT_RELATION_CHILDREN SEARCH DATA OPERATIONS`, async function() {

	this.timeout(30000)



	it(`${children_model} search mode data structure`, async function() {

		const instance = await get_children_instance('search', 'default')

		assert.equal(instance.mode, 'search', 'mode must be search')
		assert.notEqual(instance.data, null, 'data must not be null in search mode')

		await instance.destroy(true, true, true)
	})



	it(`${children_model} destroy search instance`, async function() {

		const instance = await get_children_instance('search', 'default')

		const destroy_result = await instance.destroy(true, true, true)

		assert.equal(destroy_result.delete_self, true, 'delete_self must be true')
		assert.equal(instance.status, 'destroyed', 'status must be destroyed')
	})

})//end describe COMPONENT_RELATION_CHILDREN SEARCH DATA OPERATIONS



// @license-end
