// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals */
/*eslint no-undef: "error"*/

import { elements } from './elements.js'
import {get_instance} from '../../../core/common/js/instances.js'
import {event_manager} from '../../../core/common/js/event_manager.js'
import {is_empty} from '../../../core/component_common/js/component_common.js'
import {ui} from '../../../core/common/js/ui.js'



// element options for component_geolocation
	const element = elements.find(el => el.model==='component_geolocation')
	if (!element) {
		console.error('Error: component_geolocation not found in elements');
	}

	const section_tipo	= element.section_tipo
	const section_id	= element.section_id
	const tipo			= element.tipo  // test100
	const lang			= element.lang



// DOM containers
	const container = document.getElementById('content');

	const component_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'component_container',
		parent			: container
	})



// mode/view matrix for component_geolocation
// edit: default, line, print
// list: default, mini, text
// search: default
	const mode_view_pairs = [
		{ mode: 'edit',	view: 'default'	},
		{ mode: 'edit',	view: 'line'	},
		{ mode: 'edit',	view: 'print'	},
		{ mode: 'list',	view: 'default'	},
		{ mode: 'list',	view: 'mini'	},
		{ mode: 'list',	view: 'text'	},
		{ mode: 'search',view: 'default'	}
	]



describe(`COMPONENT_GEOLOCATION LIFECYCLE`, function() {

	this.timeout(15000);



	// LIFECYCLE TESTS: init, build, render, destroy across all mode/view pairs
	for (let i = 0; i < mode_view_pairs.length; i++) {

		const pair = mode_view_pairs[i]

		describe(`${pair.mode} / ${pair.view}`, function() {

			let instance = null
			let node	 = null

			it(`init → build → render`, async function() {

				const options = {
					model			: 'component_geolocation',
					tipo			: tipo,
					section_tipo	: section_tipo,
					section_id		: section_id,
					lang			: lang,
					mode			: pair.mode,
					view			: pair.view,
					id_variant		: pair.mode + '_' + pair.view + '_' + Math.random()
				}

				// init
					instance = await get_instance(options)

					assert.equal(instance.model, 'component_geolocation', 'model expected component_geolocation')
					assert.equal(instance.tipo, tipo, `tipo expected ${tipo}`)
					assert.equal(instance.section_tipo, section_tipo, `section_tipo expected ${section_tipo}`)
					assert.equal(instance.section_id, section_id, `section_id expected ${section_id}`)
					assert.equal(instance.mode, pair.mode, `mode expected ${pair.mode}`)
					assert.equal(instance.lang, lang, `lang expected ${lang}`)

				// build
					await instance.build(true)
					assert.equal(instance.status, 'built', 'status expected built after build')
					assert.isOk(instance.datum, 'datum expected after build')
					assert.isOk(instance.context, 'context expected after build')

				// render
					node = await instance.render()
					assert.equal(instance.status, 'rendered', 'status expected rendered after render')
					assert.isOk(node instanceof Element, 'node expected DOM Element')
			});



			it(`render output structure for ${pair.mode}/${pair.view}`, async function() {

				// insert in DOM for search mode
					if (pair.mode==='search') {
						const search_component = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'search_component',
							parent			: component_container
						})
						search_component.appendChild(node)
					}else{
						component_container.appendChild(node)
					}

				// mode-specific assertions
					if (pair.mode==='edit' && pair.view==='default') {
						// edit default: content_value, map_inputs, leaflet_map
						assert.isOk(node.querySelector('.content_value'), 'expected content_value in edit/default')
						assert.isOk(node.querySelector('.map_inputs'), 'expected map_inputs in edit/default')
						assert.isOk(node.querySelector('.leaflet_map'), 'expected leaflet_map in edit/default')
						// inputs: lat, lon, zoom, alt
						assert.isOk(node.querySelector('.geo_active_input.lat'), 'expected lat input in edit/default')
						assert.isOk(node.querySelector('.geo_active_input.lon'), 'expected lon input in edit/default')
						assert.isOk(node.querySelector('.geo_active_input.zoom'), 'expected zoom input in edit/default')
						assert.isOk(node.querySelector('.altitude'), 'expected alt input in edit/default')
						// buttons: save, fullscreen, refresh
						assert.isOk(node.querySelector('.buttons_container'), 'expected buttons_container in edit/default')
					}

					if (pair.mode==='edit' && pair.view==='line') {
						// edit line: content_data exists, view_line class
						assert.isOk(node.querySelector('.content_data'), 'expected content_data in edit/line')
						assert.isOk(node.classList.contains('view_line'), 'expected view_line class')
					}

					if (pair.mode==='edit' && pair.view==='print') {
						// edit print: permissions forced to 1, read_only content
						const read_only = node.querySelector('.read_only')
						assert.isOk(read_only, 'expected read_only element in edit/print')
					}

					if (pair.mode==='list' && pair.view==='default') {
						// list default: wrapper with list mode class
						assert.isOk(node.classList.contains('list'), 'expected list class in list/default')
					}

					if (pair.mode==='list' && pair.view==='mini') {
						// list mini: mini wrapper
						assert.isOk(node.classList.contains('mini'), 'expected mini class in list/mini')
					}

					if (pair.mode==='list' && pair.view==='text') {
						// list text: span element
						assert.equal(node.nodeName, 'SPAN', 'expected SPAN node in list/text')
					}

					if (pair.mode==='search') {
						// search: content_data (q_operator not created by geolocation search render - under construction)
						assert.isOk(node.querySelector('.content_data'), 'expected content_data in search/default')
					}
			});



			it(`destroy`, async function() {

				if (instance) {
					await instance.destroy(true)
				}

				assert.equal(instance.status, 'destroyed', 'status expected destroyed after destroy')
				assert.equal(instance.node, null, 'node expected null after destroy')
			});
		});
	}//end for (mode_view_pairs)
});



describe(`COMPONENT_GEOLOCATION DATA OPERATIONS`, function() {

	this.timeout(15000);

	let instance	= null
	let node		= null



	it(`init → build → render (edit mode, permissions=2)`, async function() {

		const options = {
			model			: 'component_geolocation',
			tipo			: tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: lang,
			mode			: 'edit',
			view			: 'default',
			id_variant		: 'data_ops_' + Math.random()
		}

		instance = await get_instance(options)
		await instance.build(true)
		instance.permissions = 2
		node = await instance.render()

		component_container.appendChild(node)

		assert.equal(instance.model, 'component_geolocation', 'model expected component_geolocation')
		assert.equal(instance.status, 'rendered', 'status expected rendered')
		assert.isOk(instance.datum, 'datum expected')
		assert.isOk(instance.context, 'context expected')
		assert.isOk(instance.data, 'data expected')
		// entries may be undefined/null when component has no stored data
		const entries = instance.data?.entries
		assert.isOk(entries === undefined || entries === null || Array.isArray(entries), 'data.entries expected array, null, or undefined')
	});



	it(`data structure`, async function() {

		const entries = instance.data.entries || []

		// geolocation entries have lat, lon, zoom, alt (no 'value' key)
		if (entries.length > 0) {
			const entry = entries[0]
			assert.isOk('lat' in entry, 'expected lat property in entry')
			assert.isOk('lon' in entry, 'expected lon property in entry')
			assert.isOk('zoom' in entry, 'expected zoom property in entry')
			assert.isOk('alt' in entry, 'expected alt property in entry')
			// geolocation data does NOT have a 'value' key
			assert.isUndefined(entry.value, 'geolocation entry should NOT have value key')
		}
	});



	it(`add data via change_value (set_data)`, async function() {

		const key	= 0
		const data	= instance.data || {}
		const entries = data.entries || []

		const new_value = {
			lat		: 40.416775,
			lon		: -3.703790,
			zoom	: 10,
			alt		: 650
		}

		const changed_data_item = Object.freeze({
			action	: 'update',
			id		: entries[key]?.id || null,
			value	: new_value
		})

		await instance.change_value({
			changed_data	: [changed_data_item],
			refresh			: false
		})

		// verify entries updated
		const updated_entries = instance.data.entries
		assert.isOk(updated_entries, 'entries expected after change_value')
		assert.equal(updated_entries[0].lat, 40.416775, 'expected lat 40.416775 after change')
		assert.equal(updated_entries[0].lon, -3.703790, 'expected lon -3.703790 after change')
	});



	it(`change data via change_value (update)`, async function() {

		const key	= 0
		const data	= instance.data || {}
		const entries = data.entries || []

		const item = entries[key]
			? JSON.parse(JSON.stringify(entries[key]))
			: {}
		item.lat = 41.3851
		item.lon = 2.1734

		const changed_data_item = Object.freeze({
			action	: 'update',
			id		: entries[key]?.id || null,
			value	: item
		})

		await instance.change_value({
			changed_data	: [changed_data_item],
			refresh			: false
		})

		const updated_entries = instance.data.entries
		assert.equal(updated_entries[0].lat, 41.3851, 'expected lat 41.3851 after update')
		assert.equal(updated_entries[0].lon, 2.1734, 'expected lon 2.1734 after update')
	});



	it(`remove data via change_value (remove)`, async function() {

		const key	= 0
		const data	= instance.data || {}
		const entries = data.entries || []

		const changed_data_item = Object.freeze({
			action	: 'update',
			id		: entries[key]?.id || null,
			value	: null
		})

		await instance.change_value({
			changed_data	: [changed_data_item],
			refresh			: false
		})
	});



	it(`refresh rebuilds component`, async function() {

		await instance.refresh()

		assert.equal(instance.status, 'rendered', 'status expected rendered after refresh')
		assert.isOk(instance.node, 'node expected after refresh')
	});



	it(`is_empty returns boolean`, async function() {

		const result = is_empty(instance)
		assert.isOk(typeof result === 'boolean', 'is_empty expected boolean return')
	});



	it(`instance id is set`, async function() {

		assert.isOk(instance.id, 'instance.id expected to be set')
		assert.isOk(instance.id.length > 0, 'instance.id expected non-empty string')
	});



	it(`component-specific properties`, async function() {

		// geolocation has default_value
		assert.isOk(instance.default_value, 'default_value expected')
		assert.isOk('lat' in instance.default_value, 'default_value.lat expected')
		assert.isOk('lon' in instance.default_value, 'default_value.lon expected')
		assert.isOk('zoom' in instance.default_value, 'default_value.zoom expected')
		assert.isOk('alt' in instance.default_value, 'default_value.alt expected')

		// geolocation has current_value array
		assert.isOk(Array.isArray(instance.current_value), 'current_value expected array')

		// geo_provider from context features
		const geo_provider = instance.context?.features?.geo_provider
		assert.isOk(geo_provider, 'geo_provider expected in context.features')
	});



	it(`handle_coord_change updates current_value and is_data_changed`, async function() {

		instance.handle_coord_change(0, 'lat', 39.468)

		assert.equal(instance.current_value[0].lat, 39.468, 'lat expected 39.468 after handle_coord_change')
		assert.isTrue(instance.is_data_changed, 'is_data_changed expected true after handle_coord_change')
	});



	it(`build_changed_data_item creates frozen object`, async function() {

		const changed_data_item = instance.build_changed_data_item(0)

		assert.isOk(Object.isFrozen(changed_data_item), 'changed_data_item expected frozen')
		assert.equal(changed_data_item.action, 'update', 'action expected update')
		assert.isOk(changed_data_item.value, 'value expected in changed_data_item')
	});



	it(`destroy after data operations`, async function() {

		if (instance) {
			await instance.destroy(true)
		}

		assert.equal(instance.status, 'destroyed', 'status expected destroyed')
		assert.equal(instance.node, null, 'node expected null after destroy')

		// clean DOM
			while (component_container.firstChild) {
				component_container.removeChild(component_container.firstChild)
			}
	});
});



describe(`COMPONENT_GEOLOCATION SEARCH DATA OPERATIONS`, function() {

	this.timeout(15000);

	let instance	= null
	let node		= null



	it(`init → build → render (search mode)`, async function() {

		const options = {
			model			: 'component_geolocation',
			tipo			: tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: lang,
			mode			: 'search',
			view			: 'default',
			id_variant		: 'search_' + Math.random()
		}

		instance = await get_instance(options)
		await instance.build(true)

		// insert in search container
		const search_component = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'search_component',
			parent			: component_container
		})

		node = await instance.render()
		search_component.appendChild(node)

		assert.equal(instance.status, 'rendered', 'status expected rendered')
		assert.equal(instance.mode, 'search', 'mode expected search')
	});



	it(`search mode data structure`, async function() {

		const data = instance.data || {}
		const entries = data.entries || []

		// search mode may have empty entries or default data
		assert.isOk(Array.isArray(entries), 'entries expected array in search mode')
	});



	it(`destroy search instance`, async function() {

		if (instance) {
			await instance.destroy(true)
		}

		assert.equal(instance.status, 'destroyed', 'status expected destroyed')
		assert.equal(instance.node, null, 'node expected null after destroy')

		// clean DOM
			while (component_container.firstChild) {
				component_container.removeChild(component_container.firstChild)
			}
	});
});



// @license-end
