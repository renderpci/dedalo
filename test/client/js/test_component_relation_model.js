// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals, DD_TIPOS */
/*eslint no-undef: "error"*/
'use strict';

import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
import {event_manager} from '../../../core/common/js/event_manager.js'
import {data_manager} from '../../../core/common/js/data_manager.js'
import {ui} from '../../../core/common/js/ui.js'
import {clone, pause} from '../../../core/common/js/utils/util.js'
import {is_empty} from '../../../core/component_common/js/component_common.js'



// component_relation_model configuration
// Note: client-side component_relation_model is an alias of component_select
	const model			= 'component_relation_model'
	const tipo			= 'test169'
	const section_tipo	= 'test3'
	const section_id	= 1
	const lang			= page_globals?.dedalo_data_nolan ?? 'lg-nolan'

// modes and views to test
	const ar_modes			= ['edit', 'list', 'search']
	const ar_views_edit		= ['default', 'line']
	const ar_views_list		= ['default', 'line']

// DOM container
const container = document.getElementById('content')
const component_container = ui.create_dom_element({
	element_type	: 'div',
	class_name		: 'component_container',
	parent			: container
})



/**
* GET_RELATION_MODEL_INSTANCE
* Creates, builds and returns a component_relation_model instance
* @param {string} mode - Component mode (edit|list|search)
* @param {string} view - Component view (default|line)
* @param {number|string} sid - Section ID
* @return {Promise<component_relation_model>} Built instance
*/
async function get_relation_model_instance(mode, view, sid) {

	const options = {
		model			: model,
		tipo			: tipo,
		section_tipo	: section_tipo,
		section_id		: sid ?? section_id,
		mode			: mode,
		view			: view,
		lang			: lang,
		id_variant		: mode + '_' + view + '_' + Math.random()
	}

	const instance = await get_instance(options)
	await instance.build(true)

	return instance
}//end get_relation_model_instance



// ─────────────────────────────────────────────
// 1. LIFECYCLE: INIT → BUILD → RENDER → DESTROY
// ─────────────────────────────────────────────

describe(`COMPONENT_RELATION_MODEL LIFECYCLE`, async function() {

	this.timeout(30000)



	// ─── INIT ──────────────────────────────────

	describe(`INIT`, function() {

		it(`${model} init in edit mode`, async function() {

			const options = {
				model			: model,
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: 'edit',
				view			: 'default',
				lang			: lang,
				id_variant		: 'init_edit_' + Math.random()
			}

			const instance = await get_instance(options)

			// asserts
			assert.equal(instance.status, 'initialized', 'status must be initialized')
			assert.equal(instance.model, model)
			assert.equal(instance.tipo, tipo)
			assert.equal(instance.section_tipo, section_tipo)
			assert.equal(instance.mode, 'edit')
			assert.equal(instance.context, null)
			assert.equal(instance.node, null)
			assert.equal(instance.active, false)
			assert.equal(instance.is_data_changed, false)

			// cleanup
			await instance.destroy(true, true, true)
		})

		it(`${model} init in list mode`, async function() {

			const options = {
				model			: model,
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: 'list',
				view			: 'default',
				lang			: lang,
				id_variant		: 'init_list_' + Math.random()
			}

			const instance = await get_instance(options)

			assert.equal(instance.status, 'initialized')
			assert.equal(instance.mode, 'list')

			await instance.destroy(true, true, true)
		})

		it(`${model} init in search mode`, async function() {

			const options = {
				model			: model,
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: 'search',
				view			: 'default',
				lang			: lang,
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

		it(`${model} build with autoload=true`, async function() {

			const instance = await get_relation_model_instance('edit', 'default')

			// asserts
			assert.equal(instance.status, 'built', 'status must be built')
			assert.notEqual(instance.context, null, 'context must not be null')
			assert.notEqual(instance.permissions, null, 'permissions must not be null')

			await instance.destroy(true, true, true)
		})
	})//end describe BUILD



	// ─── RENDER (all modes and views) ────────────

	describe(`RENDER`, function() {

		// Edit mode views
		for (let i = 0; i < ar_views_edit.length; i++) {
			const view = ar_views_edit[i]

			it(`${model} render edit/${view}`, async function() {

				const instance = await get_relation_model_instance('edit', view)
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

			it(`${model} render list/${view}`, async function() {

				const instance = await get_relation_model_instance('list', view)
				const node = await instance.render()

				assert.equal(instance.status, 'rendered', `status must be rendered for list/${view}`)
				assert.notEqual(node, null, `node must not be null for list/${view}`)

				await instance.destroy(true, true, true)
			})
		}

		// Search mode
		it(`${model} render search/default`, async function() {

			const instance = await get_relation_model_instance('search', 'default')
			const node = await instance.render()

			assert.equal(instance.status, 'rendered')
			assert.notEqual(node, null)

			await instance.destroy(true, true, true)
		})
	})//end describe RENDER



	// ─── DESTROY ──────────────────────────────────

	describe(`DESTROY`, function() {

		it(`${model} destroy after full lifecycle`, async function() {

			const instance = await get_relation_model_instance('edit', 'default')
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
	})//end describe DESTROY

})//end describe COMPONENT_RELATION_MODEL LIFECYCLE



// ─────────────────────────────────────────────
// 2. DATA OPERATIONS
// ─────────────────────────────────────────────

describe(`COMPONENT_RELATION_MODEL DATA OPERATIONS`, async function() {

	this.timeout(30000)



	// ─── GET DATA ──────────────────────────────────

	describe(`GET DATA`, function() {

		it(`${model} get_data returns entries or null`, async function() {

			const instance = await get_relation_model_instance('edit', 'default')

			// data is resolved externally (relation locators)
			const data = instance.data
			assert.ok(
				data === null || typeof data === 'object',
				'data must be null or object'
			)

			await instance.destroy(true, true, true)
		})
	})//end describe GET DATA



	// ─── IS_EMPTY ──────────────────────────────────
	// Note: component_relation_model is an alias of component_select which
	// does not have is_empty as a prototype method. Use the standalone
	// is_empty utility from component_common instead.

	describe(`IS_EMPTY`, function() {

		it(`${model} is_empty returns boolean`, async function() {

			const instance = await get_relation_model_instance('edit', 'default')

			const result = is_empty(instance)
			assert.equal(typeof result, 'boolean', 'is_empty must return boolean')

			await instance.destroy(true, true, true)
		})
	})//end describe IS_EMPTY

})//end describe COMPONENT_RELATION_MODEL DATA OPERATIONS



// ─────────────────────────────────────────────
// 3. SEARCH DATA OPERATIONS
// ─────────────────────────────────────────────

describe(`COMPONENT_RELATION_MODEL SEARCH DATA OPERATIONS`, async function() {

	this.timeout(30000)



	describe(`SEARCH MODE`, function() {

		it(`${model} search mode instance builds correctly`, async function() {

			const instance = await get_relation_model_instance('search', 'default')

			assert.equal(instance.mode, 'search', 'mode must be search')
			assert.equal(instance.status, 'built', 'status must be built')

			await instance.destroy(true, true, true)
		})

		it(`${model} search mode renders correctly`, async function() {

			const instance = await get_relation_model_instance('search', 'default')
			const node = await instance.render()

			assert.equal(instance.status, 'rendered', 'status must be rendered')
			assert.notEqual(node, null, 'node must not be null')

			await instance.destroy(true, true, true)
		})
	})//end describe SEARCH MODE

})//end describe COMPONENT_RELATION_MODEL SEARCH DATA OPERATIONS



// @license-end
