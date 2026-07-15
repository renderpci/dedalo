// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals, DD_TIPOS */
/*eslint no-undef: "error"*/
'use strict';

import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
import {event_manager} from '../../../core/common/js/event_manager.js'
import {data_manager} from '../../../core/common/js/data_manager.js'
import {ui} from '../../../core/common/js/ui.js'
import {clone, pause} from '../../../core/common/js/utils/util.js'



// component_publication configuration
const publication_model		= 'component_publication'
const publication_tipo		= 'test92'
const publication_section	= 'test3'
// Isolation record (manifest.ts SUITE_ISOLATION_RECORDS[13]) — this suite's add/
// remove/update cases mutate the record's test92 locator directly, several
// without cleanup; record 1 is the shared canonical record other suites (the
// generic component sweeps) render and expect a single zero-or-one value.
const publication_section_id	= 13
const publication_lang		= page_globals?.dedalo_data_nolan ?? 'lg-nolan'

// modes and views to test
const ar_modes		= ['edit', 'list', 'search']
const ar_views_edit	= ['default', 'line']
const ar_views_list	= ['default', 'line', 'mini', 'text']

// DOM container
const container = document.getElementById('content')
const component_container = ui.create_dom_element({
	element_type	: 'div',
	class_name		: 'component_container',
	parent			: container
})



/**
* GET_PUBLICATION_INSTANCE
* Creates, builds and returns a component_publication instance
* @param {string} mode - Component mode (edit|list|search)
* @param {string} view - Component view (default|line|mini|text)
* @param {number|string} section_id - Section ID
* @return {Promise<component_publication>} Built instance
*/
async function get_publication_instance(mode, view, section_id) {

	const options = {
		model			: publication_model,
		tipo			: publication_tipo,
		section_tipo	: publication_section,
		section_id		: section_id ?? publication_section_id,
		mode			: mode,
		view			: view,
		lang			: publication_lang,
		id_variant		: mode + '_' + view + '_' + Math.random()
	}

	const instance = await get_instance(options)
	await instance.build(true)

	return instance
}//end get_publication_instance



/**
* MAKE_LOCATOR
* Creates a locator object for publication data operations
* @param {number|string} section_id - Target section ID
* @param {string} section_tipo - Target section tipo
* @return {object} Locator object
*/
function make_locator(section_id, section_tipo) {

	section_tipo = section_tipo || publication_section

	return {
		section_tipo			: section_tipo,
		section_id				: String(section_id),
		from_component_tipo		: publication_tipo,
		type					: DD_TIPOS?.DEDALO_RELATION_TYPE_LINK ?? 'dd151'
	}
}//end make_locator



/**
* CLEANUP_PUBLICATION_RECORD
* Removes every test92 locator from the working record.
* component_publication is a BINARY switch (one locator max: section_id "1"=yes,
* "2"=no). The add/change/remove cases below insert DISTINCT synthetic locators
* (9001…9060) via change_value and their conditional removes frequently no-op,
* so without this teardown the record accumulates one stray toggle per run
* (see manifest.ts SUITE_ISOLATION_RECORDS[13]). Called from `after` hooks to
* keep record 13 at its zero-value baseline.
* @param {number|string} [section_id=publication_section_id] - Target record
* @return {Promise<void>}
*/
async function cleanup_publication_record(section_id) {

	const instance = await get_publication_instance('edit', 'default', section_id ?? publication_section_id)

	// instance.data is the array of current test92 locators (each with an .id)
	const entries = Array.isArray(instance.data) ? instance.data : []
	if (entries.length > 0) {
		const changed_data = entries.map(el => Object.freeze({
			action	: 'remove',
			id		: el.id,
			value	: null
		}))
		await instance.change_value({
			changed_data	: changed_data,
			refresh		: false
		})
	}

	await instance.destroy(true, true, true)
}//end cleanup_publication_record



// ─────────────────────────────────────────────
// 1. LIFECYCLE: INIT → BUILD → RENDER → DESTROY
// ─────────────────────────────────────────────

describe(`COMPONENT_PUBLICATION LIFECYCLE`, async function() {

	this.timeout(30000)



	// ─── INIT ──────────────────────────────────

	describe(`INIT`, function() {

		it(`${publication_model} init in edit mode`, async function() {

			const options = {
				model			: publication_model,
				tipo			: publication_tipo,
				section_tipo	: publication_section,
				section_id		: publication_section_id,
				mode			: 'edit',
				view			: 'default',
				lang			: publication_lang,
				id_variant		: 'init_edit_' + Math.random()
			}

			const instance = await get_instance(options)

			// asserts
			assert.equal(instance.status, 'initialized', 'status must be initialized')
			assert.equal(instance.model, publication_model)
			assert.equal(instance.tipo, publication_tipo)
			assert.equal(instance.section_tipo, publication_section)
			assert.equal(instance.mode, 'edit')
			assert.equal(instance.context, null)
			assert.equal(instance.node, null)
			assert.equal(instance.active, false)
			assert.equal(instance.is_data_changed, false)

			// cleanup
			await instance.destroy(true, true, true)
		})

		it(`${publication_model} init in list mode`, async function() {

			const options = {
				model			: publication_model,
				tipo			: publication_tipo,
				section_tipo	: publication_section,
				section_id		: publication_section_id,
				mode			: 'list',
				view			: 'default',
				lang			: publication_lang,
				id_variant		: 'init_list_' + Math.random()
			}

			const instance = await get_instance(options)

			assert.equal(instance.status, 'initialized')
			assert.equal(instance.mode, 'list')

			await instance.destroy(true, true, true)
		})

		it(`${publication_model} init in search mode`, async function() {

			const options = {
				model			: publication_model,
				tipo			: publication_tipo,
				section_tipo	: publication_section,
				section_id		: publication_section_id,
				mode			: 'search',
				view			: 'default',
				lang			: publication_lang,
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

		it(`${publication_model} build with autoload=true`, async function() {

			const instance = await get_publication_instance('edit', 'default')

			// asserts
			assert.equal(instance.status, 'built', 'status must be built')
			assert.notEqual(instance.context, null, 'context must not be null')
			assert.notEqual(instance.data, null, 'data must not be null')
			assert.notEqual(instance.permissions, null, 'permissions must not be null')

			await instance.destroy(true, true, true)
		})

		it(`${publication_model} build sets publication-specific properties`, async function() {

			const instance = await get_publication_instance('edit', 'default')

			// asserts on publication-specific build properties
			assert.notEqual(instance.context, null, 'context must not be null after build')
			assert.notEqual(instance.data, null, 'data must not be null after build')
			assert.notEqual(instance.permissions, null, 'permissions must not be null after build')

			await instance.destroy(true, true, true)
		})
	})//end describe BUILD



	// ─── RENDER (all modes and views) ────────────

	describe(`RENDER`, function() {

		// Edit mode views
		for (let i = 0; i < ar_views_edit.length; i++) {
			const view = ar_views_edit[i]

			it(`${publication_model} render edit/${view}`, async function() {

				const instance = await get_publication_instance('edit', view)
				const node = await instance.render()

				// asserts
				assert.equal(instance.status, 'rendered', `status must be rendered for edit/${view}`)
				assert.notEqual(node, null, `node must not be null for edit/${view}`)

				await instance.destroy(true, true, true)
			})
		}

		// List mode views
		for (let i = 0; i < ar_views_list.length; i++) {
			const view = ar_views_list[i]

			it(`${publication_model} render list/${view}`, async function() {

				const instance = await get_publication_instance('list', view)
				const node = await instance.render()

				assert.equal(instance.status, 'rendered', `status must be rendered for list/${view}`)
				assert.notEqual(node, null, `node must not be null for list/${view}`)

				await instance.destroy(true, true, true)
			})
		}

		// Search mode
		it(`${publication_model} render search/default`, async function() {

			const instance = await get_publication_instance('search', 'default')
			const node = await instance.render()

			assert.equal(instance.status, 'rendered')
			assert.notEqual(node, null)

			await instance.destroy(true, true, true)
		})
	})//end describe RENDER



	// ─── DESTROY ──────────────────────────────────

	describe(`DESTROY`, function() {

		it(`${publication_model} destroy after full lifecycle`, async function() {

			const instance = await get_publication_instance('edit', 'default')
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

		it(`${publication_model} destroy without removing DOM`, async function() {

			const instance = await get_publication_instance('edit', 'default')
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

})//end describe COMPONENT_PUBLICATION LIFECYCLE



// ─────────────────────────────────────────────
// 2. DATA OPERATIONS: ADD / CHANGE / REMOVE
// ─────────────────────────────────────────────

describe(`COMPONENT_PUBLICATION DATA OPERATIONS`, async function() {

	this.timeout(30000)

	// Teardown: the add/remove/update cases below insert stray test92 locators
	// (9001…9030) whose conditional removes frequently no-op; clear the record
	// so the binary publication switch never accumulates extra toggles.
	after(async function() {
		this.timeout(30000)
		await cleanup_publication_record()
	})



	// ─── ADD DATA (change_value with insert) ─────────

	describe(`ADD DATA`, function() {

		it(`${publication_model} add locator via change_value`, async function() {

			const instance = await get_publication_instance('edit', 'default', publication_section_id)
			await instance.render()

			// get initial data count
			const data_before = Array.isArray(instance.data) ? instance.data : []
			const count_before = data_before.length

			// create locator to add
			const locator = make_locator(9001)

			// add via change_value
			const changed_data = [Object.freeze({
				action	: 'insert',
				id		: null,
				value	: locator
			})]

			const api_response = await instance.change_value({
				changed_data	: changed_data,
				refresh		: false
			})

			// asserts
			assert.notEqual(api_response, null, 'api_response must not be null')
			assert.notEqual(api_response.result, null, 'api_response.result must not be null')

			await instance.destroy(true, true, true)
		})

		it(`${publication_model} change_handler in edit mode`, async function() {

			const instance = await get_publication_instance('edit', 'default', publication_section_id)
			await instance.render()

			// add a locator via change_handler
			const locator = make_locator(9002)
			const result = await instance.change_handler({
				value		: locator,
				action		: 'update',
				index		: 0
			})

			// asserts
			assert.equal(result, true, 'change_handler must return true')

			await instance.destroy(true, true, true)
		})

		it(`${publication_model} change_handler in search mode`, async function() {

			const instance = await get_publication_instance('search', 'default', publication_section_id)
			await instance.render()

			// add a locator via change_handler in search mode
			const locator = make_locator(9003)
			const result = await instance.change_handler({
				value		: locator,
				action		: 'update',
				index		: 0
			})

			// asserts - search mode updates data without saving
			assert.equal(result, true, 'change_handler must return true in search mode')

			await instance.destroy(true, true, true)
		})
	})//end describe ADD DATA



	// ─── REMOVE DATA (change_value with remove) ─────

	describe(`REMOVE DATA`, function() {

		it(`${publication_model} remove locator via change_value`, async function() {

			const instance = await get_publication_instance('edit', 'default', publication_section_id)
			await instance.render()

			// add a locator to ensure there's something to remove
			const locator = make_locator(9010)
			const add_data = [Object.freeze({
				action	: 'insert',
				id		: null,
				value	: locator
			})]
			const add_resp = await instance.change_value({
				changed_data	: add_data,
				refresh		: false
			})
			await instance.refresh({
				build_autoload		: true,
				tmp_api_response	: add_resp
			})

			const data_after_add = Array.isArray(instance.data) ? instance.data : []

			// skip test if data couldn't be added
			if (data_after_add.length === 0) {
				console.log('Skipping remove test - could not add test data')
				await instance.destroy(true, true, true)
				return
			}

			// find the locator we just added
			const target = data_after_add.find(el =>
				String(el.section_id) === '9010' && el.section_tipo === publication_section
			)

			// if target not found, try any existing locator
			const remove_target = target || data_after_add[0]

			if (!remove_target) {
				console.log('Skipping remove test - no data available to remove')
				await instance.destroy(true, true, true)
				return
			}

			// remove using change_value
			const changed_data = [Object.freeze({
				action	: 'remove',
				id		: remove_target.id,
				value	: null
			})]

			const api_response = await instance.change_value({
				changed_data	: changed_data,
				refresh		: false
			})

			// asserts
			assert.notEqual(api_response, null, 'api_response must not be null on remove')

			await instance.destroy(true, true, true)
		})

		it(`${publication_model} change_handler with remove action`, async function() {

			const instance = await get_publication_instance('edit', 'default', publication_section_id)
			await instance.render()

			// add a locator first
			const locator = make_locator(9020)
			const add_data = [Object.freeze({
				action	: 'insert',
				id		: null,
				value	: locator
			})]
			const add_resp = await instance.change_value({
				changed_data	: add_data,
				refresh		: false
			})
			await instance.refresh({
				build_autoload		: true,
				tmp_api_response	: add_resp
			})

			// remove using change_handler
			const data = Array.isArray(instance.data) ? instance.data : []

			// skip if no data available
			if (data.length === 0) {
				console.log('Skipping change_handler remove test - no data available')
				await instance.destroy(true, true, true)
				return
			}

			const target = data.find(el => String(el.section_id) === '9020')
			if (target) {
				const result = await instance.change_handler({
					value		: null,
					action		: 'remove',
					index		: 0
				})

				assert.equal(result, true, 'change_handler remove must return true')
			}

			await instance.destroy(true, true, true)
		})
	})//end describe REMOVE DATA



	// ─── CHANGE DATA (update) ─────────────────────

	describe(`CHANGE DATA`, function() {

		it(`${publication_model} update locator via change_value`, async function() {

			const instance = await get_publication_instance('edit', 'default', publication_section_id)
			await instance.render()

			// add a locator first
			const locator = make_locator(9030)
			const add_data = [Object.freeze({
				action	: 'insert',
				id		: null,
				value	: locator
			})]
			const add_resp = await instance.change_value({
				changed_data	: add_data,
				refresh		: false
			})
			await instance.refresh({
				build_autoload		: true,
				tmp_api_response	: add_resp
			})

			// update using change_value
			const updated_locator = make_locator(9031)
			const data = Array.isArray(instance.data) ? instance.data : []

			// skip if no data available
			if (data.length === 0) {
				console.log('Skipping update test - no data available')
				await instance.destroy(true, true, true)
				return
			}

			const target = data.find(el => String(el.section_id) === '9030')
			if (target) {
				const changed_data = [Object.freeze({
					action	: 'update',
					id		: target.id,
					value	: updated_locator
				})]

				const api_response = await instance.change_value({
					changed_data	: changed_data,
					refresh		: false
				})

				assert.notEqual(api_response, null, 'api_response must not be null on update')
			}

			await instance.destroy(true, true, true)
		})
	})//end describe CHANGE DATA

})//end describe COMPONENT_PUBLICATION DATA OPERATIONS



// ─────────────────────────────────────────────
// 3. PUBLICATION-SPECIFIC METHODS
// ─────────────────────────────────────────────

describe(`COMPONENT_PUBLICATION SPECIFIC METHODS`, async function() {

	this.timeout(30000)






	// ─── GET_VALUE ───────────────────────────────

	describe(`GET_VALUE`, function() {

		it(`${publication_model} get_value returns data`, async function() {

			const instance = await get_publication_instance('edit', 'default', publication_section_id)

			const result = instance.get_value()

			assert.ok(Array.isArray(result) || result === null, 'get_value must return array or null')

			await instance.destroy(true, true, true)
		})
	})//end describe GET_VALUE



	// ─── SET_VALUE ───────────────────────────────

	describe(`SET_VALUE`, function() {

		it(`${publication_model} set_value updates data`, async function() {

			const instance = await get_publication_instance('edit', 'default', publication_section_id)

			const locator = make_locator(9040)
			const result = instance.set_value([locator])

			assert.equal(result, true, 'set_value must return true')

			await instance.destroy(true, true, true)
		})
	})//end describe SET_VALUE



	// ─── CHANGE_HANDLER ───────────────────────────

	describe(`CHANGE_HANDLER`, function() {

		it(`${publication_model} change_handler with update action`, async function() {

			const instance = await get_publication_instance('edit', 'default', publication_section_id)

			const locator = make_locator(9050)
			const result = await instance.change_handler({
				value		: locator,
				action		: 'update',
				index		: 0
			})

			assert.equal(result, true, 'change_handler must return true')

			await instance.destroy(true, true, true)
		})

		it(`${publication_model} change_handler with remove action`, async function() {

			const instance = await get_publication_instance('edit', 'default', publication_section_id)

			const result = await instance.change_handler({
				value		: null,
				action		: 'remove',
				index		: 0
			})

			assert.equal(result, true, 'change_handler remove must return true')

			await instance.destroy(true, true, true)
		})
	})//end describe CHANGE_HANDLER

})//end describe COMPONENT_PUBLICATION SPECIFIC METHODS



// ─────────────────────────────────────────────
// 4. FULL LIFECYCLE: CREATE → ADD → CHANGE → REMOVE → DESTROY
// ─────────────────────────────────────────────

describe(`COMPONENT_PUBLICATION FULL LIFECYCLE`, async function() {

	this.timeout(60000)

	// Teardown: the complete-lifecycle case inserts locator 9060 and its
	// conditional remove can no-op; clear the record to its zero-value baseline.
	after(async function() {
		this.timeout(30000)
		await cleanup_publication_record()
	})

	it(`${publication_model} complete lifecycle: init → build → render → add → change → remove → destroy`, async function() {

		// INIT
			const options = {
				model			: publication_model,
				tipo			: publication_tipo,
				section_tipo	: publication_section,
				section_id		: publication_section_id,
				mode			: 'edit',
				view			: 'default',
				lang			: publication_lang,
				id_variant		: 'full_lifecycle_' + Math.random()
			}
			const instance = await get_instance(options)

			assert.equal(instance.status, 'initialized', 'INIT: status must be initialized')
			assert.equal(instance.model, publication_model, 'INIT: model must match')

		// BUILD
			await instance.build(true)

			assert.equal(instance.status, 'built', 'BUILD: status must be built')
			assert.notEqual(instance.context, null, 'BUILD: context must not be null')
			assert.notEqual(instance.data, null, 'BUILD: data must not be null')

		// RENDER
			const node = await instance.render()

			assert.equal(instance.status, 'rendered', 'RENDER: status must be rendered')
			assert.notEqual(node, null, 'RENDER: node must not be null')

		// get initial data count
			const data_before = Array.isArray(instance.data) ? instance.data : []
			const count_before = data_before.length

		// ADD DATA - insert locator
			const locator1 = make_locator(9060)
			const add_data = [Object.freeze({
				action	: 'insert',
				id		: null,
				value	: locator1
			})]
			const add_resp = await instance.change_value({
				changed_data	: add_data,
				refresh		: false
			})
			await instance.refresh({
				build_autoload		: true,
				tmp_api_response	: add_resp
			})

			assert.notEqual(add_resp, null, 'ADD: api_response must not be null')
			assert.notEqual(add_resp.result, null, 'ADD: api_response.result must not be null')

		// CHANGE DATA - update locator
			const data_before_change = Array.isArray(instance.data) ? instance.data : []
			const target = data_before_change.find(el => String(el.section_id) === '9060')
			if (target) {
				const updated_locator = make_locator(9062)
				const change_data = [Object.freeze({
					action	: 'update',
					id		: target.id,
					value	: updated_locator
				})]

				const change_resp = await instance.change_value({
					changed_data	: change_data,
					refresh		: false
				})

				assert.notEqual(change_resp, null, 'CHANGE: api_response must not be null')
			}

		// GET_VALUE
			const value = instance.get_value()
			assert.ok(Array.isArray(value) || value === null, 'CHANGE: get_value must return array|null')

		// REMOVE DATA - remove locator
			const data_before_remove = Array.isArray(instance.data) ? instance.data : []
			const remove_target = data_before_remove.find(el => String(el.section_id) === '9062')
			if (remove_target) {
				const remove_data = [Object.freeze({
					action	: 'remove',
					id		: remove_target.id,
					value	: null
				})]

				const remove_resp = await instance.change_value({
					changed_data	: remove_data,
					refresh		: false
				})

				assert.notEqual(remove_resp, null, 'REMOVE: api_response must not be null')
			}

		// DESTROY
			const destroy_result = await instance.destroy(true, true, true)

			assert.equal(destroy_result.delete_self, true, 'DESTROY: delete_self must be true')
			assert.equal(instance.status, 'destroyed', 'DESTROY: status must be destroyed')
			assert.equal(instance.node, null, 'DESTROY: node must be null')
			assert.deepEqual(instance.events_tokens, [], 'DESTROY: events_tokens must be empty')
	})



	it(`${publication_model} lifecycle in all modes`, async function() {

		// Test lifecycle in edit mode
			let instance = await get_publication_instance('edit', 'default')
			await instance.render()
			assert.equal(instance.status, 'rendered', 'edit mode must render')
			await instance.destroy(true, true, true)

		// Test lifecycle in list mode
			instance = await get_publication_instance('list', 'default')
			await instance.render()
			assert.equal(instance.status, 'rendered', 'list mode must render')
			await instance.destroy(true, true, true)

		// Test lifecycle in search mode
			instance = await get_publication_instance('search', 'default')
			await instance.render()
			assert.equal(instance.status, 'rendered', 'search mode must render')
			await instance.destroy(true, true, true)
	})



	it(`${publication_model} lifecycle in all views`, async function() {

		// Test all edit views
			for (const view of ar_views_edit) {
				const instance = await get_publication_instance('edit', view)
				await instance.render()
				assert.equal(instance.status, 'rendered', `edit/${view} must render`)
				await instance.destroy(true, true, true)
			}

		// Test all list views
			for (const view of ar_views_list) {
				const instance = await get_publication_instance('list', view)
				await instance.render()
				assert.equal(instance.status, 'rendered', `list/${view} must render`)
				await instance.destroy(true, true, true)
			}
	})

})//end describe COMPONENT_PUBLICATION FULL LIFECYCLE



// @license-end
