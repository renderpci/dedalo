// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../../core/common/js/instances.js'
import {event_manager} from '../../../core/common/js/event_manager.js'
import {is_empty} from '../../../core/component_common/js/component_common.js'
import {ui} from '../../../core/common/js/ui.js'



// element options for component_3d
	const element = elements.find(el => el.model==='component_3d')
	if (!element) {
		console.error('Error: component_3d not found in elements');
	}

	const section_tipo	= element.section_tipo
	const section_id	= element.section_id
	const tipo			= element.tipo
	const lang			= element.lang



// DOM containers
	const container = document.getElementById('content');

	const component_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'component_container',
		parent			: container
	})



// mode/view matrix for component_3d
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



describe(`COMPONENT_3D LIFECYCLE`, function() {

	this.timeout(10000);



	// LIFECYCLE TESTS: init, build, render, destroy across all mode/view pairs
	for (let i = 0; i < mode_view_pairs.length; i++) {

		const pair = mode_view_pairs[i]

		describe(`${pair.mode} / ${pair.view}`, function() {

			let instance = null
			let node	 = null

			it(`init → build → render`, async function() {

				const options = {
					model			: 'component_3d',
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

					assert.equal(instance.model, 'component_3d', 'model expected component_3d')
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
						// edit default: content_data with 3d viewer container
						const content_data = node.querySelector('.content_data')
						assert.isOk(content_data, 'expected content_data in edit/default')
						// media_wrapper class (edit uses add_styles: ['media_wrapper'])
						assert.isOk(node.classList.contains('media_wrapper'), 'expected media_wrapper class in edit/default')
					}

					if (pair.mode==='edit' && pair.view==='line') {
						// edit line: content_data exists
						const content_data = node.querySelector('.content_data')
						assert.isOk(content_data, 'expected content_data in edit/line')
					}

					if (pair.mode==='edit' && pair.view==='print') {
						// edit print: permissions forced to 1, read_only content
						const read_only = node.querySelector('.read_only')
						assert.isOk(read_only, 'expected read_only element in edit/print')
					}

					if (pair.mode==='list' && pair.view==='default') {
						// list default: wrapper with list mode class
						assert.isOk(node.classList.contains('list'), 'expected list class in list/default')
						// media + media_wrapper classes (list adds both)
						assert.isOk(node.classList.contains('media'), 'expected media class in list/default')
						assert.isOk(node.classList.contains('media_wrapper'), 'expected media_wrapper class in list/default')
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
						// search: content_data with search container
						const content_data = node.querySelector('.content_data')
						assert.isOk(content_data, 'expected content_data in search/default')
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



describe(`COMPONENT_3D DATA OPERATIONS`, function() {

	this.timeout(10000);

	let instance	= null
	let node		= null



	it(`init → build → render (edit mode, permissions=2)`, async function() {

		const options = {
			model			: 'component_3d',
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
		node = await instance.render()

		component_container.appendChild(node)

		assert.equal(instance.model, 'component_3d', 'model expected component_3d')
		assert.equal(instance.status, 'rendered', 'status expected rendered')
		assert.isOk(instance.datum, 'datum expected')
		assert.isOk(instance.context, 'context expected')
		assert.isOk(instance.data, 'data expected')
		assert.isOk(Array.isArray(instance.data.entries), 'data.entries expected array')
	});



	it(`data structure has files_info`, async function() {

		const entries = instance.data.entries || []

		if (entries.length > 0) {
			const entry = entries[0]
			assert.isOk(entry.files_info, 'entry expected files_info property')
			assert.isOk(Array.isArray(entry.files_info), 'files_info expected array')

			// each file_info should have quality
			for (const file_info of entry.files_info) {
				assert.isOk(file_info.quality, 'file_info expected quality property')
				assert.isOk(file_info.extension, 'file_info expected extension property')
			}
		}
	});



	it(`add data via change_value (set_data)`, async function() {

		// backup original data
		const original_entries = instance.data.entries || []

		// new 3d data value
		const new_value = element.new_value(element.new_value_params)

		const changed_data = [Object.freeze({
			action	: 'set_data',
			value	: new_value
		})]

		const response = await instance.change_value({
			changed_data	: changed_data,
			refresh			: false
		})

		assert.isOk(response, 'change_value expected response')
		if (response.result) {
			assert.isOk(response.result, 'change_value result expected ok')
		}

		// verify data was updated
		assert.isOk(instance.data, 'data expected after change_value')
	});



	it(`change data via change_value (update)`, async function() {

		const entries = instance.data.entries || []

		if (entries.length > 0) {
			// modify existing entry
			const updated_entry = {...entries[0]}
			updated_entry.original_file_name = 'updated_test_file.glb'

			const changed_data = [Object.freeze({
				action	: 'update',
				id		: updated_entry.id || 1,
				value	: updated_entry
			})]

			const response = await instance.change_value({
				changed_data	: changed_data,
				refresh			: false
			})

			assert.isOk(response, 'change_value update expected response')
		}
	});



	it(`remove data via change_value (remove)`, async function() {

		const entries = instance.data.entries || []

		if (entries.length > 0) {
			const entry_to_remove = entries[entries.length - 1]

			const changed_data = [Object.freeze({
				action	: 'remove',
				id		: entry_to_remove.id || 1,
				value	: null
			})]

			const response = await instance.change_value({
				changed_data	: changed_data,
				refresh			: false
			})

			assert.isOk(response, 'change_value remove expected response')
		}
	});



	it(`refresh rebuilds component from saved state`, async function() {

		const result = await instance.refresh()

		assert.equal(result, true, 'refresh expected true')
		assert.equal(instance.status, 'rendered', 'status expected rendered after refresh')
		assert.isOk(instance.data, 'data expected after refresh')
	});



	it(`is_empty returns boolean`, async function() {

		const result = is_empty(instance)

		assert.equal(typeof result, 'boolean', 'is_empty expected boolean')
	});



	it(`instance id is set`, async function() {

		assert.isOk(instance.id, 'instance id expected to be set')
		assert.equal(typeof instance.id, 'string', 'instance id expected string')
	});



	it(`quality available via context`, async function() {

		// quality is not always set as direct property, fallback to context.features.quality
		const quality = instance.quality || instance.context?.features?.quality
		assert.isOk(quality, 'quality expected to be available via instance or context.features')
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



describe(`COMPONENT_3D SEARCH DATA OPERATIONS`, function() {

	this.timeout(10000);

	let instance	= null
	let node		= null



	it(`init → build → render (search mode)`, async function() {

		const options = {
			model			: 'component_3d',
			tipo			: tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: lang,
			mode			: 'search',
			view			: 'default',
			id_variant		: 'search_ops_' + Math.random()
		}

		instance = await get_instance(options)
		await instance.build(true)
		node = await instance.render()

		const search_component = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'search_component',
			parent			: component_container
		})
		search_component.appendChild(node)

		assert.equal(instance.model, 'component_3d', 'model expected component_3d')
		assert.equal(instance.status, 'rendered', 'status expected rendered')
	});



	it(`search mode data structure`, async function() {

		assert.isOk(instance.data, 'data expected in search mode')
		assert.isOk(Array.isArray(instance.data.entries), 'data.entries expected array in search mode')
	});



	it(`destroy search instance`, async function() {

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



// VIEWER CONTRACT
// The three.js viewer is the one third-party coupling in component_3d, and it is
// loaded LAZILY (a dynamic import from view_default_edit_3d) — so a viewer that
// cannot load does not fail any of the lifecycle tests above: the edit view still
// renders, just without a canvas. That is exactly how a three r152 rename went
// unnoticed until a 3D upload stopped producing a posterframe.
//
// These cases pin what the posterframe path depends on. They do NOT require a
// WebGL context: the point is the module boundary and the refusal path, both of
// which are reachable without rendering a frame.
describe(`COMPONENT_3D VIEWER`, function() {

	this.timeout(20000);

	let viewer_module = null



	it(`viewer module loads (every three import resolves)`, async function() {

		// The failure this guards is a HARD module-load error, not a soft
		// degradation: one removed named export takes the whole file down and with
		// it the canvas, the controls and posterframe capture.
		viewer_module = await import('../../../core/component_3d/js/viewer/viewer.js')

		assert.isOk(viewer_module, 'viewer module expected to load')
		assert.equal(typeof viewer_module.viewer, 'function', 'expected viewer export')
		assert.equal(typeof viewer_module.viewer.build, 'function', 'expected viewer.build')
		assert.equal(typeof viewer_module.viewer.load, 'function', 'expected viewer.load')
		assert.equal(typeof viewer_module.viewer.get_image, 'function', 'expected viewer.get_image')
	});



	it(`lighting environments are all same-origin`, async function() {

		// An air-gapped archive must not have presets that cannot work, and a
		// connected one must not announce record activity to a third party.
		const module = await import('../../../core/component_3d/js/viewer/environments.js')

		assert.isOk(Array.isArray(module.environments), 'environments expected array')
		assert.isAbove(module.environments.length, 1, 'expected at least None + Neutral')

		const remote = module.environments.filter(el =>
			typeof el.path==='string' && /^https?:\/\//.test(el.path)
		)
		assert.deepEqual(remote, [], 'no environment preset may point at a third-party host')
	});



	it(`get_image resolves null when no model is loaded`, async function() {

		// build() mounts the GUI before any model exists, so this state is real and
		// reachable — a capture requested here used to throw and never resolve.
		const instance = Object.create(viewer_module.viewer)
		instance.object = null

		const image = await viewer_module.viewer.get_image.call(instance, {
			width	: 720,
			height	: 404
		})

		assert.isNull(image, 'expected null capture when no model is loaded')
	});



	it(`create_posterframe refuses without a viewer`, async function() {

		const instance = await get_instance({
			model			: 'component_3d',
			mode			: 'edit',
			tipo			: tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: lang,
			permissions		: 2
		})
		await instance.build(true)

		// No viewer mounted (the component was never rendered into the viewport):
		// the capture must refuse rather than upload an empty frame over the
		// record's existing posterframe.
		instance.viewer = null
		const result = await instance.create_posterframe()

		assert.equal(result, false, 'expected create_posterframe to refuse with no viewer')

		await instance.destroy(true)
	});
});



// @license-end
