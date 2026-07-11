// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals, DD_TIPOS */
/*eslint no-undef: "error"*/
'use strict';

import {get_instance} from '../../../core/common/js/instances.js'
import {event_manager} from '../../../core/common/js/event_manager.js'
import {is_empty} from '../../../core/component_common/js/component_common.js'
import {ui} from '../../../core/common/js/ui.js'



// component_relation_related configuration (alias of component_portal)
	const related_model		= 'component_relation_related'
	const related_tipo		= 'test54'
	const related_section	= 'test3'
	const related_section_id	= 1
	const related_lang		= page_globals?.dedalo_data_nolan ?? 'lg-nolan'

// modes and views
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
* GET_RELATED_INSTANCE
* @param {string} mode - Component mode (edit|list|search)
* @param {string} view - Component view
* @param {number|string} section_id - Section ID
* @return {Promise<component_relation_related>} Built instance
*/
async function get_related_instance(mode, view, section_id) {

	const options = {
		model			: related_model,
		tipo			: related_tipo,
		section_tipo	: related_section,
		section_id		: section_id ?? related_section_id,
		mode			: mode,
		view			: view,
		lang			: related_lang,
		id_variant		: mode + '_' + view + '_' + Math.random()
	}
	const instance = await get_instance(options)
	await instance.build(true)
	return instance
}//end get_related_instance



/**
* MAKE_LOCATOR
* @param {number|string} section_id - Target section ID
* @param {string} [section_tipo] - Target section tipo
* @return {object} Locator object
*/
function make_locator(section_id, section_tipo) {

	section_tipo = section_tipo || related_section

	return {
		section_tipo			: section_tipo,
		section_id				: String(section_id),
		from_component_tipo		: related_tipo,
		type					: DD_TIPOS?.DEDALO_RELATION_TYPE_RELATED_TIPO ?? 'dd89',
		type_rel				: DD_TIPOS?.DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO ?? 'dd620'
	}
}//end make_locator



// ─────────────────────────────────────────────
// 1. LIFECYCLE: INIT → BUILD → RENDER → DESTROY
// ─────────────────────────────────────────────

describe(`COMPONENT_RELATION_RELATED LIFECYCLE`, async function() {

	this.timeout(30000)

	describe(`INIT`, function() {

		it(`${related_model} init in edit mode`, async function() {
			const options = {
				model			: related_model,
				tipo			: related_tipo,
				section_tipo	: related_section,
				section_id		: related_section_id,
				mode			: 'edit',
				view			: 'default',
				lang			: related_lang,
				id_variant		: 'init_edit_' + Math.random()
			}
			const instance = await get_instance(options)

			assert.equal(instance.status, 'initialized')
			assert.equal(instance.model, related_model)
			assert.equal(instance.tipo, related_tipo)
			assert.equal(instance.section_tipo, related_section)
			assert.equal(instance.mode, 'edit')
			assert.equal(instance.context, null)
			assert.equal(instance.node, null)
			assert.equal(instance.active, false)
			assert.equal(instance.is_data_changed, false)

			await instance.destroy(true, true, true)
		})

		it(`${related_model} init in list mode`, async function() {
			const options = {
				model			: related_model,
				tipo			: related_tipo,
				section_tipo	: related_section,
				section_id		: related_section_id,
				mode			: 'list',
				view			: 'default',
				lang			: related_lang,
				id_variant		: 'init_list_' + Math.random()
			}
			const instance = await get_instance(options)
			assert.equal(instance.status, 'initialized')
			assert.equal(instance.mode, 'list')
			await instance.destroy(true, true, true)
		})

		it(`${related_model} init in search mode`, async function() {
			const options = {
				model			: related_model,
				tipo			: related_tipo,
				section_tipo	: related_section,
				section_id		: related_section_id,
				mode			: 'search',
				view			: 'default',
				lang			: related_lang,
				id_variant		: 'init_search_' + Math.random()
			}
			const instance = await get_instance(options)
			assert.equal(instance.status, 'initialized')
			assert.equal(instance.mode, 'search')
			await instance.destroy(true, true, true)
		})
	})//end INIT

	describe(`BUILD`, function() {

		it(`${related_model} build with autoload=true`, async function() {
			const instance = await get_related_instance('edit', 'default')

			assert.equal(instance.status, 'built')
			assert.notEqual(instance.context, null)
			assert.notEqual(instance.data, null)
			assert.notEqual(instance.permissions, null)
			assert.notEqual(instance.rqo, null)
			assert.notEqual(instance.request_config_object, null)
			// portal-inherited properties
			assert.notEqual(instance.columns_map, null)
			assert.equal(instance.autocomplete, null)
			assert.equal(instance.autocomplete_active, false)

			await instance.destroy(true, true, true)
		})

		it(`${related_model} build sets portal-inherited properties`, async function() {
			const instance = await get_related_instance('edit', 'line')

			assert.notEqual(instance.columns_map, null)
			assert.equal(instance.fixed_columns_map, false)
			assert.ok(instance.show_interface && typeof instance.show_interface === 'object')
			assert.notEqual(instance.db_data, null)

			await instance.destroy(true, true, true)
		})
	})//end BUILD

	describe(`RENDER`, function() {

		// Edit mode views
		for (let i = 0; i < ar_views_edit.length; i++) {
			const view = ar_views_edit[i]
			it(`${related_model} render edit/${view}`, async function() {
				const instance = await get_related_instance('edit', view)
				const node = await instance.render()
				assert.equal(instance.status, 'rendered')
				assert.notEqual(node, null)
				if (view==='default' || view==='line') {
					assert.notEqual(node.querySelector('.content_data'), null)
				}
				await instance.destroy(true, true, true)
			})
		}

		// List mode views
		for (let i = 0; i < ar_views_list.length; i++) {
			const view = ar_views_list[i]
			it(`${related_model} render list/${view}`, async function() {
				const instance = await get_related_instance('list', view)
				const node = await instance.render()
				assert.equal(instance.status, 'rendered')
				assert.notEqual(node, null)
				await instance.destroy(true, true, true)
			})
		}

		// Search mode
		it(`${related_model} render search/default`, async function() {
			const instance = await get_related_instance('search', 'default')
			const node = await instance.render()
			assert.equal(instance.status, 'rendered')
			assert.notEqual(node, null)
			await instance.destroy(true, true, true)
		})
	})//end RENDER

	describe(`DESTROY`, function() {

		it(`${related_model} destroy after full lifecycle`, async function() {
			const instance = await get_related_instance('edit', 'default')
			await instance.render()
			const destroy_result = await instance.destroy(true, true, true)

			assert.equal(destroy_result.delete_self, true)
			assert.equal(destroy_result.delete_dependencies, true)
			assert.equal(instance.status, 'destroyed')
			assert.deepEqual(instance.ar_instances, [])
			assert.equal(instance.node, null)
			assert.deepEqual(instance.events_tokens, [])
		})

		it(`${related_model} destroy without removing DOM`, async function() {
			const instance = await get_related_instance('edit', 'default')
			await instance.render()
			const destroy_result = await instance.destroy(true, true, false)

			assert.equal(destroy_result.delete_self, true)
			assert.equal(instance.status, 'destroyed')
		})
	})//end DESTROY

})//end LIFECYCLE



// ─────────────────────────────────────────────
// 2. DATA OPERATIONS
// ─────────────────────────────────────────────

describe(`COMPONENT_RELATION_RELATED DATA OPERATIONS`, async function() {

	this.timeout(30000)

	describe(`DATA STRUCTURE`, function() {

		it(`${related_model} data exists (entries can be array, null or undefined)`, async function() {
			const instance = await get_related_instance('edit', 'default', related_section_id)

			assert.notEqual(instance.data, null)
			const entries = instance.data?.entries
			assert.ok(
				entries === undefined || entries === null || Array.isArray(entries),
				`data.entries must be array, null or undefined. Got: ${typeof entries}`
			)
			await instance.destroy(true, true, true)
		})

		it(`${related_model} entries contain locator objects with type and type_rel (when present)`, async function() {
			const instance = await get_related_instance('edit', 'default', related_section_id)
			const entries = instance.data?.entries

			if (entries && entries.length > 0) {
				for (const entry of entries) {
					assert.ok(entry.section_tipo, 'entry must have section_tipo')
					assert.ok(entry.section_id, 'entry must have section_id')
					assert.ok(entry.from_component_tipo, 'entry must have from_component_tipo')
					assert.ok(entry.type, 'entry must have type')
					assert.ok(entry.type_rel, 'entry must have type_rel')
				}
			} else {
				assert.ok(true, 'no entries to validate (valid state)')
			}
			await instance.destroy(true, true, true)
		})

		it(`${related_model} references are resolved in non-search modes`, async function() {
			const instance = await get_related_instance('edit', 'default', related_section_id)
			const references = instance.data?.references
			if (references) {
				assert.ok(Array.isArray(references), 'references must be an array when present')
			}
			await instance.destroy(true, true, true)
		})
	})//end DATA STRUCTURE

	describe(`ADD DATA (link_record)`, function() {

		it(`${related_model} link_record method exists (inherited from portal)`, async function() {
			const instance = await get_related_instance('edit', 'default', related_section_id)
			assert.equal(typeof instance.link_record, 'function')
			await instance.destroy(true, true, true)
		})

		it(`${related_model} link_record returns boolean`, async function() {
			const instance = await get_related_instance('edit', 'default', related_section_id)
			await instance.render()

			const locator = make_locator(99999)
			const result = await instance.link_record(locator)
			assert.equal(typeof result, 'boolean')
			assert.equal(result, true)

			await instance.unlink_record(locator)
			await instance.destroy(true, true, true)
		})

		it(`${related_model} link_record rejects duplicate`, async function() {
			const instance = await get_related_instance('edit', 'default', related_section_id)
			await instance.render()

			const existing_entries = instance.data?.entries
			if (existing_entries && existing_entries.length > 0) {
				const duplicate = { ...existing_entries[0] }
				const result = await instance.link_record(duplicate)
				assert.equal(result, false, 'link_record must reject duplicate locator')
			} else {
				assert.ok(true, 'no existing entries to test duplicate rejection')
			}
			await instance.destroy(true, true, true)
		})
	})//end ADD DATA

	describe(`REMOVE DATA (unlink_record)`, function() {

		it(`${related_model} unlink_record method exists`, async function() {
			const instance = await get_related_instance('edit', 'default', related_section_id)
			assert.equal(typeof instance.unlink_record, 'function')
			await instance.destroy(true, true, true)
		})

		it(`${related_model} unlink_record returns boolean`, async function() {
			const instance = await get_related_instance('edit', 'default', related_section_id)
			await instance.render()

			const fake_locator = make_locator(99999)
			const result = await instance.unlink_record(fake_locator)
			assert.equal(typeof result, 'boolean')
			await instance.destroy(true, true, true)
		})
	})//end REMOVE DATA

	describe(`CHANGE DATA (change_value)`, function() {

		it(`${related_model} change_value with set_data clears entries`, async function() {
			const instance = await get_related_instance('edit', 'default', related_section_id)
			await instance.render()

			const changed_data = [Object.freeze({
				action	: 'set_data',
				id		: null,
				value	: null
			})]
			const api_response = await instance.change_value({
				changed_data	: changed_data,
				refresh		: false
			})

			assert.notEqual(api_response, null)
			const entries = instance.data?.entries
			assert.ok(
				entries === null || entries === undefined || (Array.isArray(entries) && entries.length === 0),
				`entries must be null/undefined/empty after set_data(null). Got: ${JSON.stringify(entries)}`
			)
			await instance.destroy(true, true, true)
		})

		it(`${related_model} change_value with insert returns api_response`, async function() {
			const instance = await get_related_instance('edit', 'default', related_section_id)
			await instance.render()

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

			assert.notEqual(api_response, null)
			assert.ok(api_response.result)
			await instance.destroy(true, true, true)
		})
	})//end CHANGE DATA

	describe(`REFRESH`, function() {

		it(`${related_model} refresh rebuilds component`, async function() {
			const instance = await get_related_instance('edit', 'default', related_section_id)
			await instance.render()
			assert.equal(instance.status, 'rendered')

			await instance.refresh({ build_autoload : true })
			assert.equal(instance.status, 'rendered')
			await instance.destroy(true, true, true)
		})
	})//end REFRESH

	describe(`IS_EMPTY`, function() {

		it(`${related_model} is_empty (standalone) returns boolean`, async function() {
			const instance = await get_related_instance('edit', 'default', related_section_id)
			const result = is_empty(instance)
			assert.equal(typeof result, 'boolean')
			await instance.destroy(true, true, true)
		})

		it(`${related_model} is_empty (standalone) true when no entries`, async function() {
			const instance = await get_related_instance('edit', 'default', related_section_id)
			instance.data = { entries: [] }
			const result = is_empty(instance)
			assert.equal(result, true)
			await instance.destroy(true, true, true)
		})

		it(`${related_model} instance.is_empty returns boolean`, async function() {
			const instance = await get_related_instance('edit', 'default', related_section_id)
			const result = instance.is_empty()
			assert.equal(typeof result, 'boolean')
			await instance.destroy(true, true, true)
		})

		it(`${related_model} instance.is_empty true when no entries`, async function() {
			const instance = await get_related_instance('edit', 'default', related_section_id)
			instance.data = { entries: [] }
			const result = instance.is_empty()
			assert.equal(result, true)
			await instance.destroy(true, true, true)
		})
	})//end IS_EMPTY

	describe(`INSTANCE ID`, function() {

		it(`${related_model} instance id is set`, async function() {
			const instance = await get_related_instance('edit', 'default', related_section_id)
			assert.ok(instance.id)
			assert.ok(typeof instance.id === 'string')
			await instance.destroy(true, true, true)
		})
	})//end INSTANCE ID

	describe(`SHOW_INTERFACE`, function() {

		it(`${related_model} show_interface.button_add is false (overridden by JSON handler)`, async function() {
			const instance = await get_related_instance('edit', 'default', related_section_id)
			const show_interface = instance.context?.properties?.show_interface
			assert.ok(show_interface, 'show_interface must exist in context properties')
			assert.equal(show_interface.button_add, false, 'button_add must be false (JSON handler override)')
			await instance.destroy(true, true, true)
		})
	})//end SHOW_INTERFACE

})//end DATA OPERATIONS



// ─────────────────────────────────────────────
// 3. SEARCH DATA OPERATIONS
// ─────────────────────────────────────────────

describe(`COMPONENT_RELATION_RELATED SEARCH DATA OPERATIONS`, async function() {

	this.timeout(30000)

	it(`${related_model} search mode data structure`, async function() {
		const instance = await get_related_instance('search', 'default')
		assert.equal(instance.mode, 'search')
		assert.notEqual(instance.data, null)
		await instance.destroy(true, true, true)
	})

	it(`${related_model} search mode does not include references`, async function() {
		const instance = await get_related_instance('search', 'default')
		// references are skipped in search mode (see JSON handler)
		const references = instance.data?.references
		assert.equal(references, undefined, 'references must not be present in search mode')
		await instance.destroy(true, true, true)
	})

	it(`${related_model} destroy search instance`, async function() {
		const instance = await get_related_instance('search', 'default')
		const destroy_result = await instance.destroy(true, true, true)
		assert.equal(destroy_result.delete_self, true)
		assert.equal(instance.status, 'destroyed')
	})

})//end SEARCH DATA OPERATIONS



// @license-end
