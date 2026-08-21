// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals, L */
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



// HELPERS (shared by the empty-record suites)

	/**
	* BUILD_EMPTY_INSTANCE
	* Builds an edit instance and forces the engine's empty shape (WC-001 `entries: []`)
	* so the suites below assert the "record has no stored geolocation" contract on a
	* real element (test100) without depending on a second, unstored fixture record.
	* @param {string} id_variant
	* @returns {Promise<Object>} built (not rendered) instance with data.entries = []
	*/
	const build_empty_instance = async function(id_variant) {

		const instance = await get_instance({
			model			: 'component_geolocation',
			tipo			: tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: lang,
			mode			: 'edit',
			view			: 'default',
			id_variant		: id_variant + '_' + Math.random()
		})
		await instance.build(true)

		// the engine's empty shape: a record with no stored geolocation
		instance.data.entries	= []
		instance.permissions	= 2

		return instance
	}//end build_empty_instance


	/**
	* STUB_CHANGE_VALUE
	* Replaces change_value with a counting stub. Keeps the interaction tests
	* client-only: no save request, no write to the shared test3 record.
	* @param {Object} instance
	* @returns {Object} spy: {calls:Array, restore:Function}
	*/
	const stub_change_value = function(instance) {

		const original	= instance.change_value
		const calls		= []

		instance.change_value = function(options) {
			calls.push(options)
			return Promise.resolve(true)
		}

		return {
			calls	: calls,
			restore	: () => { instance.change_value = original }
		}
	}//end stub_change_value


	/** Flush pending microtasks/timers so click handlers settle before asserting. */
	const tick = () => new Promise(resolve => setTimeout(resolve, 0))


	/** Explicit, sized map container — lazy_in_viewport is not deterministic under the runner. */
	const create_map_holder = function(parent, key=0) {

		const map_holder = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'leaflet_map',
			dataset			: { key : key },
			parent			: parent
		})
		map_holder.style.width	= '400px'
		map_holder.style.height	= '300px'

		return map_holder
	}//end create_map_holder



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

	// The canonical single entry of test100 on this suite's own record (test3/14,
	// manifest.ts SUITE_ISOLATION_RECORDS[14]).
	const canonical_entry = {
		alt		: 0,
		lat		: 39.45952823913757,
		lon		: -0.3274998574173816,
		zoom	: 16
	}

	/**
	* SET_SINGLE_ENTRY
	* Puts the component back to EXACTLY one entry via 'set_data'.
	* The write cases below address key 0, and a save whose target key holds no id
	* APPENDS while a remove leaves a null hole — so without this the geo array
	* grows [null,{…},null,…] across runs and key 0 eventually reads null. Used as
	* both the precondition of the write chain and its teardown.
	*/
	async function set_single_entry(target, value) {
		await target.change_value({
			changed_data	: [Object.freeze({
				action	: 'set_data',
				value	: [ {...value} ]
			})],
			refresh			: false
		})
	}

	after(async function() {
		this.timeout(15000)
		// on its OWN instance: the last case of this block destroys `instance`, so
		// a teardown reusing it would silently no-op and leave the record holding
		// the cleared slot the remove case wrote.
		const cleaner = await get_instance({
			model			: 'component_geolocation',
			tipo			: tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: lang,
			mode			: 'edit',
			view			: 'default',
			id_variant		: 'data_ops_teardown_' + Math.random()
		})
		await cleaner.build(true)
		cleaner.permissions = 2
		await set_single_entry(cleaner, canonical_entry)
		await cleaner.destroy(true, true, true)
	})



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



	it(`get_stored_entry / get_view on a record WITH data`, async function() {

		const entries = instance.data.entries || []

		if (entries.length > 0) {
			// stored entry read: the raw entry, no fallback
			assert.deepEqual(instance.get_stored_entry(0), entries[0], 'get_stored_entry expected the stored entry')
			// view read: the stored framing (lat/lon/zoom), not the camera default
			const view = instance.get_view(0)
			assert.equal(view.lat, entries[0].lat, 'get_view.lat expected the stored lat')
			assert.equal(view.lon, entries[0].lon, 'get_view.lon expected the stored lon')
			assert.equal(view.zoom, entries[0].zoom, 'get_view.zoom expected the stored zoom')
		}else{
			assert.isNull(instance.get_stored_entry(0), 'get_stored_entry expected null with no stored entry')
			assert.deepEqual(instance.get_view(0), instance.default_view, 'get_view expected default_view with no stored entry')
		}

		// out-of-range key is absence, never a throw
		assert.isNull(instance.get_stored_entry(99), 'get_stored_entry expected null for an absent key')
		assert.deepEqual(instance.get_view(99), instance.default_view, 'get_view expected default_view for an absent key')
	});



	it(`add data via change_value (set_data)`, async function() {

		// start from EXACTLY one entry, so key 0 addresses a real slot: an update
		// against a key that holds no id appends instead, and the case would then
		// assert key 0 while the value landed at the end of the array.
		await set_single_entry(instance, canonical_entry)

		const key	= 0
		const entries = instance.data.entries || []
		assert.isOk(entries[key], 'setup: exactly one stored entry expected at key 0')

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
		assert.equal(updated_entries.length, 1, 'an update must REPLACE the entry, never append a second one')
		assert.equal(updated_entries[0].lat, 40.416775, 'expected lat 40.416775 after change')
		assert.equal(updated_entries[0].lon, -3.703790, 'expected lon -3.703790 after change')
	});



	it(`change data via change_value (update)`, async function() {

		const key	= 0
		const entries = instance.data.entries || []
		assert.isOk(entries[key], 'setup: the previous case must have left one entry at key 0')

		const item = JSON.parse(JSON.stringify(entries[key]))
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
		assert.equal(updated_entries.length, 1, 'an update must REPLACE the entry, never append a second one')
		assert.equal(updated_entries[0].lat, 41.3851, 'expected lat 41.3851 after update')
		assert.equal(updated_entries[0].lon, 2.1734, 'expected lon 2.1734 after update')
	});



	it(`remove data via change_value (remove)`, async function() {

		const key	= 0
		const entries = instance.data.entries || []
		assert.isOk(entries[key], 'setup: the previous case must have left one entry at key 0')

		const changed_data_item = Object.freeze({
			action	: 'update',
			id		: entries[key]?.id || null,
			value	: null
		})

		await instance.change_value({
			changed_data	: [changed_data_item],
			refresh			: false
		})

		// the case used to assert NOTHING. A null value clears the slot, so the
		// stored coordinate must be gone — not merely "the call returned".
		assert.isNotOk(
			(instance.data.entries || []).some(el => el && el.lat!==undefined),
			'no stored coordinate expected after the remove'
		)
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

		// geolocation has default_view: a CAMERA (opening map position), never a value.
		// It replaces the old default_value: no alt (a camera has no altitude) and no
		// magic sentinel — the stored value and the view are different things.
		assert.isOk(instance.default_view, 'default_view expected')
		assert.isOk('lat' in instance.default_view, 'default_view.lat expected')
		assert.isOk('lon' in instance.default_view, 'default_view.lon expected')
		assert.isOk('zoom' in instance.default_view, 'default_view.zoom expected')
		assert.isUndefined(instance.default_view.alt, 'default_view.alt expected undefined (camera has no altitude)')
		assert.isUndefined(instance.default_value, 'default_value expected removed (replaced by default_view)')

		// no fabricated value: the Valencia sentinel must not survive anywhere
		assert.notEqual(instance.default_view.lat, 39.462571, 'default_view.lat must not be the Valencia sentinel')
		assert.notEqual(instance.default_view.lon, -0.376295, 'default_view.lon must not be the Valencia sentinel')

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



// EMPTY RECORD — ABSENCE IS STRUCTURAL
// The engine ALWAYS emits an array for data.entries — `[]` where the PHP oracle
// emitted null (WC-001). A record with no stored geolocation has NO value, and the
// client must not invent one: the four inputs render empty, current_value[0] stays
// undefined and the save button sends nothing. Opening a record and pressing save
// used to store the Valencia sentinel (39.462571 / -0.376295), which the diffusion
// parsers then had to hardcode as "no location" — a magic coordinate in the data.
//
// The map's opening position is a CAMERA (self.default_view: lat/lon/zoom, no alt,
// from context.features.default_view, hard fallback {20, 0, 2}). Resolving it
// stores nothing: the FIRST user action (drag, zoom, typing, drawing) is what
// creates the value, and only an explicit save commits it.
// Reported against numisdata6/564 (component numisdata264).
describe(`COMPONENT_GEOLOCATION EMPTY RECORD (no stored value)`, function() {

	this.timeout(15000);

	let instance	= null
	let node		= null
	let map_holder	= null



	it(`default_view is the camera; get_stored_entry reports absence`, async function() {

		instance = await build_empty_instance('empty_entries')

		assert.isOk(is_empty(instance), 'instance expected empty with entries: []')

		// camera shape: lat/lon/zoom, NO alt
		const default_view = instance.default_view
		assert.isOk(default_view, 'default_view expected')
		assert.isUndefined(default_view.alt, 'default_view.alt expected undefined (camera has no altitude)')

		// The camera is SERVER-configured: the full edit context always carries
		// features.default_view (structure_context.ts; gate:
		// test/unit/structure_context_geolocation_features.test.ts), and the
		// instance takes it verbatim. Asserted unconditionally — a branch on the
		// key's presence would pass whether or not the server emits it.
		const context_default_view = instance.context?.features?.default_view
		assert.isOk(context_default_view, 'context.features.default_view expected from the server')
		assert.equal(default_view.lat, context_default_view.lat, 'default_view.lat expected from context.features.default_view')
		assert.equal(default_view.lon, context_default_view.lon, 'default_view.lon expected from context.features.default_view')
		assert.equal(default_view.zoom, context_default_view.zoom, 'default_view.zoom expected from context.features.default_view')

		// absence, not a fabricated entry
		assert.isNull(instance.get_stored_entry(0), 'get_stored_entry(0) expected null with no stored value')
		assert.deepEqual(instance.get_view(0), default_view, 'get_view(0) expected default_view with no stored value')

		// get_entries is REPLACED — it existed only to fabricate the fallback entry
		assert.isUndefined(instance.get_entries, 'get_entries expected removed (replaced by get_stored_entry/get_view)')
	});



	it(`renders the four inputs EMPTY and fabricates no value`, async function() {

		node = await instance.render()
		component_container.appendChild(node)

		assert.equal(instance.status, 'rendered', 'status expected rendered')
		assert.isOk(node.querySelector('.leaflet_map'), 'expected leaflet_map container')

		const lat_node	= node.querySelector('.geo_active_input.lat')
		const lon_node	= node.querySelector('.geo_active_input.lon')
		const zoom_node	= node.querySelector('.geo_active_input.zoom')
		const alt_node	= node.querySelector('.altitude')
		assert.isOk(lat_node, 'expected lat input')
		assert.isOk(lon_node, 'expected lon input')
		assert.isOk(zoom_node, 'expected zoom input')
		assert.isOk(alt_node, 'expected alt input')

		assert.equal(lat_node.value, '', 'lat input expected empty on a record with no value')
		assert.equal(lon_node.value, '', 'lon input expected empty on a record with no value')
		assert.equal(zoom_node.value, '', 'zoom input expected empty on a record with no value')
		assert.equal(alt_node.value, '', 'alt input expected empty on a record with no value')

		// (!) the defect: the view seeded current_value[0] at render time
		assert.isUndefined(instance.current_value[0], 'current_value[0] expected undefined until the user acts')
	});



	it(`build_changed_data_item(0) returns null on an untouched empty record`, async function() {

		assert.isNull(instance.build_changed_data_item(0), 'build_changed_data_item expected null with no value to send')
	});



	it(`the save button is a NO-OP on an untouched empty record`, async function() {

		const spy = stub_change_value(instance)

		const save_node = node.querySelector('.button.save')
		assert.isOk(save_node, 'expected save button (permissions=2, show_interface.button_save)')

		save_node.click()
		await tick()

		assert.equal(spy.calls.length, 0, 'save expected to send nothing when there is no value')

		spy.restore()
	});



	it(`get_map opens the map on default_view (camera, not a value)`, async function() {

		// explicit container: the view defers get_map until the node enters the
		// viewport (lazy_in_viewport), which is not deterministic under the runner
		map_holder = create_map_holder(component_container, 0)

		await instance.get_map(map_holder, 0)

		assert.isOk(instance.map, 'Leaflet map expected after get_map on an empty record')
		assert.equal(instance.map.getCenter().lat, instance.default_view.lat, 'map centre lat expected default_view.lat')
		assert.equal(instance.map.getCenter().lng, instance.default_view.lon, 'map centre lon expected default_view.lon')
		assert.equal(instance.map.getZoom(), instance.default_view.zoom, 'map zoom expected default_view.zoom')
		assert.isOk(map_holder.children.length > 0, 'expected Leaflet DOM inside the map container')

		// opening the map is not editing: still no value, still nothing to send
		assert.isUndefined(instance.current_value[0], 'current_value[0] expected still undefined after get_map')
		assert.isNull(instance.build_changed_data_item(0), 'build_changed_data_item expected still null after get_map')
	});



	it(`typing a coordinate creates the value (first user action)`, async function() {

		instance.handle_coord_change(0, 'lat', 41.6523)

		assert.isOk(instance.current_value[0], 'current_value[0] expected created by the first coordinate entry')
		assert.equal(instance.current_value[0].lat, 41.6523, 'lat expected 41.6523')
		assert.isTrue(instance.is_data_changed, 'is_data_changed expected true')

		const changed_data_item = instance.build_changed_data_item(0)
		assert.isNotNull(changed_data_item, 'build_changed_data_item expected non-null once a value exists')
		assert.equal(changed_data_item.value.lat, 41.6523, 'changed_data_item.value.lat expected 41.6523')
	});



	it(`0 is a legal coordinate, not absence`, async function() {

		instance.handle_coord_change(0, 'lat', 0)
		instance.handle_coord_change(0, 'lon', 0)

		const changed_data_item = instance.build_changed_data_item(0)
		assert.isNotNull(changed_data_item, 'build_changed_data_item expected non-null with 0/0 (Gulf of Guinea)')
		assert.strictEqual(changed_data_item.value.lat, 0, 'lat 0 expected preserved')
		assert.strictEqual(changed_data_item.value.lon, 0, 'lon 0 expected preserved')
	});



	it(`map_update_coordinates ignores a caller with empty entries`, async function() {

		// the update_value observer (e.g. numisdata585 → numisdata264): an empty
		// caller portal emits `[]`, which must be a no-op, not a TypeError
		const caller = {
			data					: { entries: [] },
			datum					: { data: [] },
			request_config_object	: {}
		}

		await instance.map_update_coordinates({ caller: caller })
	});



	it(`refresh restores absence and stays absent after the map animation window`, async function() {

		// state carried from the tests above: current_value[0] holds 0/0
		assert.isOk(instance.current_value[0], 'precondition: a value exists before refresh')

		const refresh_node = node.querySelector('.map_reload')
		assert.isOk(refresh_node, 'expected refresh button')

		refresh_node.click()

		assert.isUndefined(instance.current_value[0], 'current_value[0] expected deleted by refresh (the record stores nothing)')
		assert.isFalse(instance.is_data_changed, 'is_data_changed expected false right after refresh')

		// (!) THE REGRESSION THIS PINS: the camera used to be moved with
		// panTo + setZoom. setZoom fires zoomend ASYNCHRONOUSLY (~250ms) and that
		// handler calls update_input_values, which re-creates current_value[0] from
		// the map CENTRE and re-marks the component dirty — AFTER fn_refresh has
		// returned. The camera (20/0) silently became a saveable value again.
		await new Promise(resolve => setTimeout(resolve, 700))

		assert.isUndefined(instance.current_value[0], 'current_value[0] expected STILL undefined after the zoom animation window')
		assert.isFalse(instance.is_data_changed, 'is_data_changed expected STILL false after the zoom animation window')
		assert.isNull(instance.build_changed_data_item(0), 'build_changed_data_item expected null after refresh')
		assert.equal(node.querySelector('.geo_active_input.lat').value, '', 'lat input expected blank after refresh')
	});



	it(`destroy empty-record instance`, async function() {

		if (instance) {
			await instance.destroy(true)
		}

		assert.equal(instance.status, 'destroyed', 'status expected destroyed')

		// clean DOM
			while (component_container.firstChild) {
				component_container.removeChild(component_container.firstChild)
			}
	});
});



// FIRST-VALUE CREATION ON AN EMPTY RECORD
// Every path below writes into current_value[key] on a record that has NO value yet.
// With the fabricated render-time seed gone, current_value[key] is undefined here and
// each of these paths needs its own creation guard. These are the exact call sites:
// update_draw_data (drawing/create_point), layer_data_change (geo-tag insert), and
// map_update_coordinates from a POPULATED caller.
describe(`COMPONENT_GEOLOCATION EMPTY RECORD FIRST-VALUE CREATION`, function() {

	this.timeout(20000);



	it(`drawing a shape on an empty record creates the value`, async function() {

		const instance	= await build_empty_instance('empty_draw')
		const node		= await instance.render()
		component_container.appendChild(node)

		const map_holder = create_map_holder(component_container, 0)
		await instance.get_map(map_holder, 0)
		assert.isOk(instance.map, 'Leaflet map expected')

		// seed the active FeatureGroup directly: the layer control is provider-dependent
		// and whenReady's layers_loader is not deterministic under the runner
		instance.ar_layer_loaded = [{
			layer_id	: instance.active_layer_id,
			layer_data	: []
		}]
		instance.FeatureGroup[instance.active_layer_id] = new L.FeatureGroup().addTo(instance.map)

		// the geometry path: create_point → update_draw_data
		// (!) update_draw_data writes current_value[key].lib_data — undefined here
		instance.create_point({ lat: 41.7665, lng: -2.4790 })

		assert.isOk(instance.current_value[0], 'current_value[0] expected created by the first drawn geometry')
		assert.isOk(Array.isArray(instance.current_value[0].lib_data), 'lib_data expected array')

		const layer = instance.current_value[0].lib_data.find(item => item.layer_id===instance.active_layer_id)
		assert.isOk(layer, 'expected the active layer in lib_data')
		assert.equal(layer.layer_data.features.length, 1, 'expected one drawn feature')

		assert.isTrue(instance.is_data_changed, 'is_data_changed expected true after drawing')

		const changed_data_item = instance.build_changed_data_item(0)
		assert.isNotNull(changed_data_item, 'build_changed_data_item expected non-null after drawing')
		assert.isOk(changed_data_item.value.lib_data, 'changed_data_item.value.lib_data expected')

		await instance.destroy(true)
		while (component_container.firstChild) {
			component_container.removeChild(component_container.firstChild)
		}
	});



	it(`geo-tag insert on an empty record creates the value`, async function() {

		const instance	= await build_empty_instance('empty_tag')
		const node		= await instance.render()
		component_container.appendChild(node)

		const map_holder = create_map_holder(component_container, 0)
		await instance.get_map(map_holder, 0)

		// layer_data_change('insert') renders the new layer: it needs a layer control
		// and an initialised ar_layer_loaded, both provider/timing dependent here
		instance.ar_layer_loaded	= []
		instance.layer_control		= instance.layer_control || L.control.layers({}).addTo(instance.map)
		// the post-save snapshot sync touches db_data.value[key]
		instance.db_data			= instance.db_data || { value : [] }

		const spy = stub_change_value(instance)

		// the component_text_area tag bridge: inserting a geo-tag on an empty record
		// (!) writes current_value[key].lib_data — undefined here
		instance.layer_data_change({
			action	: 'insert',
			tag_id	: 7,
			type	: 'geo'
		})
		await tick()

		assert.isOk(instance.current_value[0], 'current_value[0] expected created by the geo-tag insert')
		assert.isOk(Array.isArray(instance.current_value[0].lib_data), 'lib_data expected array')
		assert.isOk(
			instance.current_value[0].lib_data.find(item => item.layer_id===7),
			'expected the inserted layer 7 in lib_data'
		)
		assert.equal(spy.calls.length, 1, 'expected one change_value call for the inserted layer')

		spy.restore()
		await instance.destroy(true)
		while (component_container.firstChild) {
			component_container.removeChild(component_container.firstChild)
		}
	});



	it(`map_update_coordinates copies a POPULATED caller onto an empty record`, async function() {

		const instance	= await build_empty_instance('empty_observer')
		const node		= await instance.render()
		component_container.appendChild(node)

		// the real view container: map_update_coordinates → update_input_values reads
		// node.content_data[key].map_container and its sibling inputs
		const map_container = node.content_data[0].map_container
		await instance.get_map(map_container, 0)
		assert.isOk(instance.map, 'Leaflet map expected')

		const spy = stub_change_value(instance)

		// the numisdata585 → numisdata264 update_value observer shape: the caller portal
		// holds the selected record, its datum carries that record's geolocation data
		const caller = {
			data					: { entries : [ { section_tipo: 'test3', section_id: 2 } ] },
			datum					: { data : [ {
				tipo		: 'hierarchy31', // the default target_geolocation_tipo
				section_id	: 2,
				entries		: [ { lat: 41.6523, lon: -4.7245, zoom: 9, alt: 0 } ]
			} ] },
			request_config_object	: {}
		}

		await instance.map_update_coordinates({ caller: caller })

		assert.isOk(instance.current_value[0], 'current_value[0] expected created by the observer update')
		assert.equal(instance.current_value[0].lat, 41.6523, 'lat expected copied from the caller')
		assert.equal(instance.current_value[0].lon, -4.7245, 'lon expected copied from the caller')
		assert.equal(instance.current_value[0].zoom, 9, 'zoom expected copied from the caller')

		// the map actually MOVED to the borrowed point.
		// (!) THE REGRESSION THIS PINS: the move was panTo + setZoom, and the zoom
		// cancels the pan animation — the map never left the camera. Worse, the
		// map's own zoomend handler then wrote that camera centre back into
		// current_value, so the observer stored 20/0 instead of the borrowed
		// coordinates. One setView({animate:false}), before the value is written.
		assert.closeTo(instance.map.getCenter().lat, 41.6523, 0.0001, 'map centre lat expected the borrowed lat')
		assert.closeTo(instance.map.getCenter().lng, -4.7245, 0.0001, 'map centre lon expected the borrowed lon')
		assert.equal(instance.map.getZoom(), 9, 'map zoom expected the borrowed zoom')

		// inputs reflect the borrowed coordinates
		const lat_node = node.querySelector('.geo_active_input.lat')
		assert.equal(parseFloat(lat_node.value), 41.6523, 'lat input expected updated')

		// and the borrowed value IS a value: it is sent
		assert.equal(spy.calls.length, 1, 'expected one change_value call')
		assert.equal(spy.calls[0].changed_data[0].value.lat, 41.6523, 'changed_data value.lat expected 41.6523')

		spy.restore()
		await instance.destroy(true)
		while (component_container.firstChild) {
			component_container.removeChild(component_container.firstChild)
		}
	});
});



// SETTING THE VIEW IS DATA
// lat/lon/zoom are THE VIEW — the map framing an operator chose — and they are
// savable data, independent of any drawn feature (lib_data). Panning and zooming
// is how the view gets set, and the input fields track it live because reading
// the coordinates while moving the map is how an operator approximates a
// position. So a gesture CREATES the view on an empty record, marks the
// component dirty, and the save button commits it.
//
// The defect this suite pins is the refusal that used to sit here: a previous
// revision classified pan/zoom as "navigation, not data entry" and refused to
// write from it, so on a record with no stored value the view could never be
// created and the save button logged "the record has no value to send". The
// intent parameter and its guard are deleted.
//
// What still stops a FABRICATED value, and is asserted below:
//  a) rendering/opening a record seeds nothing — an untouched record yields null
//     from build_changed_data_item;
//  b) a gesture only marks dirty, it never commits;
//  c) the component's OWN camera moves (move_camera / fit_camera_to_geometry)
//     run under camera_is_moving and write nothing at all.
describe(`COMPONENT_GEOLOCATION SETTING THE VIEW IS DATA`, function() {

	this.timeout(20000);

	/** Leaflet fires zoomend/dragend asynchronously (~250ms) for animated moves. */
	const settle = () => new Promise(resolve => setTimeout(resolve, 700))

	/** Builds a rendered empty instance with a live map on the REAL view container. */
	const build_mapped_instance = async function(id_variant) {

		const instance	= await build_empty_instance(id_variant)
		const node		= await instance.render()
		component_container.appendChild(node)

		const map_container = node.content_data[0].map_container
		await instance.get_map(map_container, 0)
		assert.isOk(instance.map, 'Leaflet map expected')

		return { instance, node, map_container }
	}

	const teardown = async function(instance) {
		await instance.destroy(true)
		while (component_container.firstChild) {
			component_container.removeChild(component_container.firstChild)
		}
	}



	it(`an UNTOUCHED record still stores nothing`, async function() {

		// (a): rendering the component and creating the map is not the operator
		// acting. No gesture ran, so no entry exists and there is nothing to send.
		// Map creation and the lazy init must not fire an UNMASKED dragend/zoomend
		// either — that is what this settle window checks.
		const { instance, node } = await build_mapped_instance('view_untouched')

		await settle()

		assert.isUndefined(instance.current_value[0], 'current_value[0] expected undefined on an untouched record')
		assert.notStrictEqual(instance.is_data_changed, true, 'is_data_changed expected not true without a gesture')
		assert.isNull(instance.build_changed_data_item(0), 'build_changed_data_item expected null on an untouched record')
		assert.equal(node.querySelector('.geo_active_input.lat').value, '', 'lat input expected blank')
		assert.equal(node.querySelector('.geo_active_input.lon').value, '', 'lon input expected blank')
		assert.equal(node.querySelector('.geo_active_input.zoom').value, '', 'zoom input expected blank')

		await teardown(instance)
	});



	it(`a map ZOOM on an empty record CREATES the view`, async function() {

		// THE REPORTED BUG: this used to be refused, so a record with no stored
		// value could never save the framing an operator set by hand.
		const { instance, node } = await build_mapped_instance('view_zoom_empty')

		assert.isUndefined(instance.current_value[0], 'precondition: no value')

		instance.map.setZoom(instance.map.getZoom() + 1)
		await settle()
		// belt and braces: fire the event directly too, in case the runner's
		// headless container swallowed the animated one
		instance.map.fire('zoomend')

		assert.isOk(instance.current_value[0], 'current_value[0] expected CREATED by the zoom')
		assert.strictEqual(instance.current_value[0].zoom, instance.map.getZoom(), 'zoom expected taken from the map')
		assert.closeTo(instance.current_value[0].lat, instance.map.getCenter().lat, 0.0001, 'lat expected taken from the map centre')
		assert.closeTo(instance.current_value[0].lon, instance.map.getCenter().lng, 0.0001, 'lon expected taken from the map centre')
		assert.isTrue(instance.is_data_changed, 'is_data_changed expected true: setting the view is real work')

		// and it is savable: both save-button gates now pass
		const changed_data_item = instance.build_changed_data_item(0)
		assert.isNotNull(changed_data_item, 'build_changed_data_item expected non-null after a zoom')
		assert.closeTo(changed_data_item.value.lat, instance.map.getCenter().lat, 0.0001, 'the sent value expected to carry the view')

		// the inputs TRACK the map live — that readout is the point of the gesture
		assert.equal(parseFloat(node.querySelector('.geo_active_input.zoom').value), instance.map.getZoom(), 'zoom input expected updated')
		assert.closeTo(parseFloat(node.querySelector('.geo_active_input.lat').value), instance.map.getCenter().lat, 0.0001, 'lat input expected updated')

		// (b) nothing auto-saved: only the save button commits
		assert.isOk(Array.isArray(instance.data.changed_data)===false || instance.data.changed_data.length===0, 'no changed_data expected: a gesture does not commit')

		await teardown(instance)
	});



	it(`a map DRAG on an empty record CREATES the view`, async function() {

		const { instance, node } = await build_mapped_instance('view_drag_empty')

		instance.map.panBy([120, 90], {animate:false})
		instance.map.fire('dragend')
		await settle()

		assert.isOk(instance.current_value[0], 'current_value[0] expected CREATED by the drag')
		assert.closeTo(instance.current_value[0].lat, instance.map.getCenter().lat, 0.0001, 'lat expected taken from the map centre')
		assert.isTrue(instance.is_data_changed, 'is_data_changed expected true after a drag')
		assert.isNotNull(instance.build_changed_data_item(0), 'build_changed_data_item expected non-null after a drag')
		assert.closeTo(parseFloat(node.querySelector('.geo_active_input.lat').value), instance.map.getCenter().lat, 0.0001, 'lat input expected updated')

		await teardown(instance)
	});



	it(`a PROGRAMMATIC move writes nothing (camera_is_moving)`, async function() {

		// (c): move_camera is the component's own door, not the operator's. Its
		// dragend/zoomend feedback is masked, so it can neither create a view on
		// an empty record nor overwrite one with Leaflet's rounded centre.
		const { instance } = await build_mapped_instance('view_programmatic_move')

		instance.move_camera(41.6523, -4.7245, 9)
		await settle()

		assert.isUndefined(instance.current_value[0], 'current_value[0] expected STILL undefined after a programmatic move')
		assert.notStrictEqual(instance.is_data_changed, true, 'is_data_changed expected not true after a programmatic move')
		assert.isNull(instance.build_changed_data_item(0), 'build_changed_data_item expected null after a programmatic move')
		assert.isFalse(instance.camera_is_moving, 'camera_is_moving expected lowered after the move')

		await teardown(instance)
	});



	it(`a map zoom on a record that HAS a coordinate UPDATES the view`, async function() {

		// the live readout on a populated record: the same gesture, same law
		const { instance, node } = await build_mapped_instance('view_zoom_valued')

		instance.handle_coord_change(0, 'lat', 41.6523)
		instance.handle_coord_change(0, 'lon', -4.7245)
		instance.is_data_changed = false

		instance.map.setZoom(9)
		instance.map.fire('zoomend')
		await settle()

		assert.isOk(instance.current_value[0], 'current_value[0] expected to survive')
		assert.equal(instance.current_value[0].zoom, instance.map.getZoom(), 'zoom expected re-framed from the camera')
		assert.closeTo(instance.current_value[0].lat, instance.map.getCenter().lat, 0.0001, 'lat expected re-framed from the camera')
		assert.isTrue(instance.is_data_changed, 'is_data_changed expected true: re-framing a value is real work')
		assert.equal(parseFloat(node.querySelector('.geo_active_input.zoom').value), instance.map.getZoom(), 'zoom input expected updated')

		await teardown(instance)
	});



	it(`a map zoom on a record that carries FEATURES sets the view and leaves them alone`, async function() {

		// the view and the features are INDEPENDENT: the gesture writes lat/lon/
		// zoom and does not touch, derive from, or drop lib_data.
		const { instance } = await build_mapped_instance('view_zoom_features')

		const lib_data = [{
			layer_id	: instance.active_layer_id,
			layer_data	: { type:'FeatureCollection', features:[{
				type		: 'Feature',
				properties	: {},
				geometry	: { type:'Point', coordinates:[3.14754, 41.858199] }
			}]}
		}]
		instance.current_value[0] = { lib_data : lib_data }
		instance.is_data_changed = false

		instance.map.setZoom(7)
		instance.map.fire('zoomend')
		await settle()

		assert.isOk(Number.isFinite(instance.current_value[0].lat), 'lat expected written as the view')
		assert.strictEqual(instance.current_value[0].zoom, instance.map.getZoom(), 'zoom expected the map zoom')
		assert.isTrue(instance.is_data_changed, 'is_data_changed expected true')
		assert.deepEqual(instance.current_value[0].lib_data, lib_data, 'the drawn features expected untouched by a view change')

		await teardown(instance)
	});



	it(`update_input_values writes on a plain 3-argument call`, async function() {

		// the intent parameter is DELETED: there is no caller that may not write.
		// A fourth argument, if any survived somewhere, must change nothing.
		const { instance, map_container } = await build_mapped_instance('view_no_intent_param')

		const written = instance.update_input_values(0, {lat:20, lon:0, zoom:2}, map_container)

		assert.isTrue(written, 'a 3-argument call expected to write')
		assert.equal(instance.current_value[0].lat, 20, 'lat expected written on a record that had no value')
		assert.isTrue(instance.is_data_changed, 'is_data_changed expected true')

		assert.strictEqual(instance.update_input_values.length, 3, 'update_input_values expected exactly three parameters (no intent switch)')

		await teardown(instance)
	});



	it(`typing lat then zoom KEEPS the typed coordinate (no rounded camera write-back)`, async function() {

		const { instance, node } = await build_mapped_instance('nav_typed_coord')

		// the real sequence: the user types into the input, whose change event calls
		// handle_coord_change. The input text must be set here too — it is what the
		// camera write-back used to overwrite, and handle_coord_change never writes
		// it back (the input IS the event source).
		const lat_node	= node.querySelector('.geo_active_input.lat')
		const lon_node	= node.querySelector('.geo_active_input.lon')
		lat_node.value	= '41.6523'
		instance.handle_coord_change(0, 'lat', 41.6523)
		lon_node.value	= '-4.7245'
		instance.handle_coord_change(0, 'lon', -4.7245)
		node.querySelector('.geo_active_input.zoom').value = '9'
		instance.handle_coord_change(0, 'zoom', 9)

		await settle()

		// strict, not closeTo: the defect was Leaflet's PIXEL-ROUNDED getCenter()
		// (41.6523 → 41.65229…) being written back over the exact typed value by an
		// async zoomend. move_camera + camera_is_moving is what makes this hold.
		assert.strictEqual(instance.current_value[0].lat, 41.6523, 'typed lat expected preserved EXACTLY')
		assert.strictEqual(instance.current_value[0].lon, -4.7245, 'typed lon expected preserved EXACTLY')
		assert.strictEqual(instance.current_value[0].zoom, 9, 'typed zoom expected preserved')
		assert.strictEqual(lat_node.value, '41.6523', 'lat input expected untouched by the camera')
		assert.strictEqual(lon_node.value, '-4.7245', 'lon input expected untouched by the camera')

		await teardown(instance)
	});



	it(`build_changed_data_item RECOVERS the id from the stored entry (second save REPLACES)`, async function() {

		// the client half of the append-vs-replace contract: component_geolocation is
		// not translatable, so the server's applyUpdate takes the non-sliced branch —
		// an id-less 'update' APPENDS. The first save's id lands in self.data (the
		// server stamps it), never in the client's current_value buffer, so without
		// this recovery the second save doubled the item and the map reloaded at the
		// stale first position. Server twin: test/unit/save_component_geolocation_item_id.test.ts
		const instance = await build_empty_instance('nav_id_recovery')

		// the shape after a first save: the server returned the item WITH an id
		instance.data.entries	= [ {id:7, lat:41.6523, lon:-4.7245, zoom:9, alt:null} ]
		// the client's own buffer, edited since, still id-less
		instance.current_value[0] = {lat:42.1, lon:-3.9, zoom:10, alt:null}

		const changed_data_item = instance.build_changed_data_item(0)

		assert.isNotNull(changed_data_item, 'changed_data_item expected')
		assert.strictEqual(changed_data_item.id, 7, 'id expected recovered from the stored entry')
		assert.strictEqual(instance.current_value[0].id, 7, 'id expected stamped back into current_value for later saves')
		assert.equal(changed_data_item.value.lat, 42.1, 'the EDITED value expected sent, not the stored one')

		// and a genuinely new value still sends id null — the server owns allocation
		const fresh = await build_empty_instance('nav_id_fresh')
		fresh.current_value[0] = {lat:0, lon:0, zoom:2, alt:null}
		assert.isNull(fresh.build_changed_data_item(0).id, 'a first save expected id null (server allocates)')

		await fresh.destroy(true)
		await instance.destroy(true)
	});
});



// GEOMETRY FRAMES ITSELF
// A record whose value is a drawn shape and NO coordinate is the normal product
// of the new law (update_draw_data creates `{lib_data:[…]}`; the import path's
// geometry-only branch creates the same shape). The old client could not produce
// it: it always fabricated a centre, so a coordinate always rode along.
//
// Two consequences this suite pins:
//  a) the map must OPEN on the drawing. Opening on the world camera put the
//     operator's own work off-screen — it read as lost work (P2-F4). The centre
//     is DERIVED (bbox of every feature across every lib_data layer, the same
//     rule the migration uses) and it is CAMERA ONLY: nothing here is ever
//     stored, sent, or marked dirty.
//  b) absence must RENDER EMPTY. A geometry-only entry has no lat/lon/zoom, and
//     assigning undefined to an input node renders the literal string
//     'undefined' in the VALUE fields, which fn_click_add_point and
//     handle_coord_change read straight back (P2-F10).
//
// The framing law's other half is the server's: when an item carries lib_data
// features, all three publication paths take the GEOMETRY as the record's
// location and the stored centre is framing, never a coordinate claim
// (src/diffusion/resolve/default_value.ts, parsers/parser_misc.ts geoGeojson,
// resolve/ddo_fns.ts buildGeojsonLayers). Server twin:
// test/unit/diffusion_geo_precedence.test.ts.
describe(`COMPONENT_GEOLOCATION GEOMETRY FRAMES ITSELF`, function() {

	this.timeout(20000);

	/** Leaflet fires zoomend/dragend asynchronously (~250ms) for animated moves. */
	const settle = () => new Promise(resolve => setTimeout(resolve, 700))

	/** A drawn single Point — bbox centre IS the point, returned verbatim/unrounded. */
	const POINT_LON = 3.14754
	const POINT_LAT = 41.858199
	const point_geometry = () => [{
		layer_id	: 'geolocation_layer',
		layer_data	: { type:'FeatureCollection', features:[{
			type		: 'Feature',
			properties	: {},
			geometry	: { type:'Point', coordinates:[POINT_LON, POINT_LAT] }
		}]}
	}]

	/** A drawn LineString — a real bbox: centre is neither vertex. */
	const line_geometry = () => [{
		layer_id	: 'geolocation_layer',
		layer_data	: { type:'FeatureCollection', features:[{
			type		: 'Feature',
			properties	: {},
			geometry	: { type:'LineString', coordinates:[[-2.246499, 41.34355], [-1.246381, 41.877469]] }
		}]}
	}]

	/**
	* Builds a rendered instance whose STORED value is `entry` (data.entries), with
	* a live map. Mirrors build_mapped_instance but seeds the stored side.
	*/
	const build_stored_instance = async function(id_variant, entry) {

		const instance = await build_empty_instance(id_variant)
		instance.data.entries = [entry]

		const node = await instance.render()
		component_container.appendChild(node)

		const map_container = node.content_data[0].map_container
		await instance.get_map(map_container, 0)
		assert.isOk(instance.map, 'Leaflet map expected')

		return { instance, node, map_container }
	}

	const teardown = async function(instance) {
		await instance.destroy(true)
		while (component_container.firstChild) {
			component_container.removeChild(component_container.firstChild)
		}
	}



	it(`a GEOMETRY-ONLY record opens ON its geometry, not the world view`, async function() {

		// no map needed: get_view/get_geometry_bounds are pure camera maths
		const instance = await build_empty_instance('geo_frame_view')
		instance.data.entries = [ {id:11, lib_data:point_geometry()} ]

		const view = instance.get_view(0)

		assert.strictEqual(view.lat, POINT_LAT, 'camera lat expected the drawn point (verbatim, unrounded)')
		assert.strictEqual(view.lon, POINT_LON, 'camera lon expected the drawn point (verbatim, unrounded)')
		assert.notStrictEqual(view.lat, instance.default_view.lat, 'camera expected NOT the world view lat')
		assert.notStrictEqual(view.lon, instance.default_view.lon, 'camera expected NOT the world view lon')
		assert.strictEqual(view.zoom, instance.default_view.zoom, 'zoom expected the default: the entry carries none')

		// the bbox of a single point is the point itself, in Leaflet [[S,W],[N,E]]
		assert.deepEqual(
			instance.get_geometry_bounds(0),
			[[POINT_LAT, POINT_LON], [POINT_LAT, POINT_LON]],
			'get_geometry_bounds expected the point own bbox'
		)

		// a real extent: the centre is neither vertex, and it matches the
		// migration script fitViewToGeometry byte-for-byte (tchi1 numbers)
		const line_instance = await build_empty_instance('geo_frame_view_line')
		line_instance.data.entries = [ {id:12, lib_data:line_geometry()} ]
		const line_view = line_instance.get_view(0)
		assert.strictEqual(line_view.lat, 41.61051, 'LineString camera lat expected the bbox centre')
		assert.strictEqual(line_view.lon, -1.74644, 'LineString camera lon expected the bbox centre')

		// and absence is still absence: no geometry, no coordinate → world view
		const empty_instance = await build_empty_instance('geo_frame_view_empty')
		assert.strictEqual(empty_instance.get_view(0), empty_instance.default_view, 'a valueless record expected the world view')
		assert.isNull(empty_instance.get_geometry_bounds(0), 'no entry expected null bounds')

		await empty_instance.destroy(true)
		await line_instance.destroy(true)
		await instance.destroy(true)
	});



	it(`the derived camera is NEVER stored`, async function() {

		// the whole point of deriving in get_view instead of writing a centre:
		// the record must stay geometry-only until the operator decides otherwise
		const { instance } = await build_stored_instance('geo_frame_not_stored', {id:13, lib_data:point_geometry()})

		// get_map already framed it; do it again explicitly
		assert.isTrue(instance.fit_camera_to_geometry(0), 'fit expected to run on a coordinate-less geometry record')
		await settle()

		assert.isUndefined(instance.current_value[0].lat, 'current_value lat expected STILL undefined')
		assert.isUndefined(instance.current_value[0].lon, 'current_value lon expected STILL undefined')
		assert.notStrictEqual(instance.is_data_changed, true, 'is_data_changed expected not true: framing is not an edit')

		const changed_data_item = instance.build_changed_data_item(0)
		assert.isUndefined(changed_data_item?.value?.lat, 'the sent value expected to carry NO lat')
		assert.isUndefined(changed_data_item?.value?.lon, 'the sent value expected to carry NO lon')

		// the stored side is untouched too
		assert.isUndefined(instance.data.entries[0].lat, 'the stored entry expected untouched')

		await teardown(instance)
	});



	it(`fitBounds does not feed itself back as data`, async function() {

		// a fit is the component's OWN move, not the operator's, so it must write
		// nothing. camera_is_moving is what makes it inert, and it must be raised
		// for the whole fit.
		const { instance } = await build_stored_instance('geo_frame_no_feedback', {id:14, lib_data:line_geometry()})

		// move away first, through the component own guarded door, so the fit
		// really changes the view (and so this move writes nothing either)
		instance.move_camera(20, 0, 2)
		await settle()
		instance.is_data_changed = false

		const observed = []
		const record_guard = () => observed.push(instance.camera_is_moving)
		instance.map.on('zoomend', record_guard)
		instance.map.on('moveend', record_guard)

		assert.isTrue(instance.fit_camera_to_geometry(0), 'fit expected to run')

		// a synchronous feedback event fired INSIDE the fit must see the guard up
		assert.isAbove(observed.length, 0, 'expected at least one map event during the fit')
		assert.deepEqual(
			observed.filter(flag => flag!==true),
			[],
			'camera_is_moving expected TRUE for every map event fired during the fit'
		)
		assert.isFalse(instance.camera_is_moving, 'camera_is_moving expected lowered after the fit')

		await settle()
		instance.map.off('zoomend', record_guard)
		instance.map.off('moveend', record_guard)

		assert.isUndefined(instance.current_value[0].lat, 'the fitted centre expected NOT written as data')
		assert.notStrictEqual(instance.is_data_changed, true, 'is_data_changed expected not true after a fit')

		await teardown(instance)
	});



	it(`a stored coordinate on a geometry record WINS over the derived one`, async function() {

		// the D1 framing law, client half: on a geometry record the stored lat/lon
		// is the operator OWN chosen framing (publication reads the geometry as the
		// location), so it is obeyed as-is and never re-derived.
		const { instance } = await build_stored_instance('geo_frame_stored_wins', {
			id			: 15,
			lat			: 40.416775,
			lon			: -3.703790,
			zoom		: 11,
			lib_data	: point_geometry()
		})

		const view = instance.get_view(0)
		assert.strictEqual(view.lat, 40.416775, 'stored lat expected to win over the derived centre')
		assert.strictEqual(view.lon, -3.703790, 'stored lon expected to win over the derived centre')
		assert.strictEqual(view.zoom, 11, 'stored zoom expected to win')
		assert.notStrictEqual(view.lat, POINT_LAT, 'the derived centre expected NOT used')

		assert.isFalse(instance.fit_camera_to_geometry(0), 'fit expected REFUSED when the entry has a coordinate')

		// the bounds are still readable — refusing to fit is a policy, not blindness
		assert.isNotNull(instance.get_geometry_bounds(0), 'geometry bounds expected still resolvable')

		await teardown(instance)
	});



	it(`refresh on a GEOMETRY-ONLY record leaves the inputs EMPTY`, async function() {

		// P2-F10: `input.value = undefined` renders the literal string 'undefined'
		// in the VALUE fields. fn_click_add_point and handle_coord_change read those
		// fields back, so a rendered 'undefined' is one click away from the record.
		const { instance, node } = await build_stored_instance('geo_frame_refresh', {id:16, lib_data:point_geometry()})

		// dirty the inputs the way a user would, so refresh has something to restore
		const lat_node	= node.querySelector('.geo_active_input.lat')
		const lon_node	= node.querySelector('.geo_active_input.lon')
		const zoom_node	= node.querySelector('.geo_active_input.zoom')
		const alt_node	= node.querySelector('.altitude')
		lat_node.value	= '41.6523'
		lon_node.value	= '-4.7245'
		zoom_node.value	= '9'
		alt_node.value	= '120'

		node.querySelector('.map_reload').click()
		await settle()

		const rendered = [lat_node.value, lon_node.value, zoom_node.value, alt_node.value]
		assert.deepEqual(rendered, ['', '', '', ''], 'all four inputs expected EMPTY after refreshing a geometry-only record')
		assert.deepEqual(
			rendered.filter(value => String(value).indexOf('undefined')!==-1),
			[],
			'no input expected to render the string undefined'
		)

		// and the buffer is the stored entry verbatim — absence is not persisted as ''
		assert.isUndefined(instance.current_value[0].lat, 'current_value lat expected undefined, never an empty string')
		assert.isOk(instance.current_value[0].lib_data, 'the drawn geometry expected preserved by refresh')
		assert.isFalse(instance.is_data_changed, 'refresh expected to leave the component clean')

		await teardown(instance)
	});



	it(`update_input_values renders absence as EMPTY and 0 as '0'`, async function() {

		// the unit-level twin of the refresh gate, both directions. 0 is a LEGAL
		// coordinate under the new law, so it must survive the emptiness guard.
		const { instance, node, map_container } = await build_stored_instance('geo_frame_input_values', {id:17, lib_data:point_geometry()})

		const lat_node	= node.querySelector('.geo_active_input.lat')
		const lon_node	= node.querySelector('.geo_active_input.lon')
		const zoom_node	= node.querySelector('.geo_active_input.zoom')

		// absence, in all three flavours the callers actually produce
		assert.isTrue(
			instance.update_input_values(0, {lat:undefined, lon:null, zoom:undefined}, map_container),
			'the call expected to write'
		)
		assert.deepEqual([lat_node.value, lon_node.value, zoom_node.value], ['', '', ''], 'absence expected rendered EMPTY')
		assert.notStrictEqual(instance.current_value[0].lat, '', 'the BUFFER expected to keep the raw absence, not an empty string')

		// 0 is a value, not absence
		instance.update_input_values(0, {lat:0, lon:0, zoom:0}, map_container)
		assert.deepEqual([lat_node.value, lon_node.value, zoom_node.value], ['0', '0', '0'], '0 expected rendered as 0')
		assert.strictEqual(instance.current_value[0].lat, 0, '0 expected kept in the buffer')

		await teardown(instance)
	});



	it(`map_update_coordinates does not borrow the CALLER item id`, async function() {

		// P2-F9: the borrowed entries are the OTHER record stored items and carry
		// its ids. Keeping one made this record save target a foreign id, which
		// applyUpdate (save_component.ts, non-sliced branch) cannot match — it
		// APPENDS, so the record ends up holding two geo items, reloads at the
		// stale first one, and publishes both points.
		const { instance } = await build_stored_instance('geo_frame_observer_id', {id:1, lat:40, lon:-3, zoom:8, alt:null})

		const spy = stub_change_value(instance)

		const caller = {
			data					: { entries : [ { section_tipo: 'test3', section_id: 2 } ] },
			datum					: { data : [ {
				tipo		: 'hierarchy31',
				section_id	: 2,
				entries		: [ { id: 3, lat: 41.5, lon: 2.1, zoom: 12, alt: null } ]
			} ] },
			request_config_object	: {}
		}

		await instance.map_update_coordinates({ caller: caller })

		assert.equal(spy.calls.length, 1, 'expected one change_value call')
		const sent = spy.calls[0].changed_data[0]
		assert.strictEqual(sent.id, 1, 'expected THIS record own item id, recovered from the stored entry')
		assert.notStrictEqual(sent.id, 3, 'the caller item id expected NOT borrowed')
		assert.strictEqual(sent.value.id, 1, 'the sent value expected stamped with this record id')
		assert.equal(sent.value.lat, 41.5, 'the borrowed coordinate expected sent')
		assert.equal(sent.action, 'update', 'expected an update, so the server REPLACES instead of appending')

		spy.restore()
		await teardown(instance)
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
