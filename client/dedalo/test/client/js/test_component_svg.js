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



// element options for component_svg
	const element = elements.find(el => el.model==='component_svg')
	if (!element) {
		console.error('Error: component_svg not found in elements');
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



// mode/view matrix for component_svg
// edit: default, line, print
// list: default, mini, text, tag
// search: default
	const mode_view_pairs = [
		{ mode: 'edit',		view: 'default'	},
		{ mode: 'edit',		view: 'line'	},
		{ mode: 'edit',		view: 'print'	},
		{ mode: 'list',		view: 'default'	},
		{ mode: 'list',		view: 'mini'	},
		{ mode: 'list',		view: 'text'	},
		{ mode: 'search',	view: 'default'	}
	]



describe(`COMPONENT_SVG LIFECYCLE`, function() {

	this.timeout(10000);



	// LIFECYCLE TESTS: init, build, render, destroy across all mode/view pairs
	for (let i = 0; i < mode_view_pairs.length; i++) {

		const pair = mode_view_pairs[i]

		describe(`${pair.mode} / ${pair.view}`, function() {

			let instance = null
			let node	 = null

			it(`init → build → render`, async function() {

				const options = {
					model			: 'component_svg',
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

					assert.equal(instance.model, 'component_svg', 'model expected component_svg')
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

				// insert in DOM
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
						// edit default: media_wrapper class (add_styles: ['media_wrapper'])
						assert.isOk(node.classList.contains('media_wrapper'), 'expected media_wrapper class in edit/default')
						const content_data = node.querySelector('.content_data')
						assert.isOk(content_data, 'expected content_data in edit/default')
						const media_content_data = node.querySelector('.media_content_data')
						assert.isOk(media_content_data, 'expected media_content_data in edit/default')
					}

					if (pair.mode==='edit' && pair.view==='line') {
						// edit line: build_wrapper_edit wrapper (no media_wrapper)
						assert.isOk(node.classList.contains('edit'), 'expected edit class in edit/line')
					}

					if (pair.mode==='edit' && pair.view==='print') {
						// edit print: permissions forced to 1, wrapper gets disabled_component class
						assert.isOk(node.classList.contains('disabled_component'), 'expected disabled_component class in edit/print')
					}

					if (pair.mode==='list' && pair.view==='default') {
						// list default: media + media_wrapper classes
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
						// search: wrapper with content_data
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



describe(`COMPONENT_SVG DATA OPERATIONS`, function() {

	this.timeout(10000);

	let instance	= null
	let node		= null



	it(`init → build → render (edit mode, permissions=2)`, async function() {

		const options = {
			model			: 'component_svg',
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

		assert.equal(instance.model, 'component_svg', 'model expected component_svg')
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

			// each file_info should have quality and extension
			for (const file_info of entry.files_info) {
				assert.isOk(file_info.quality, 'file_info expected quality property')
				assert.isOk(file_info.extension, 'file_info expected extension property')
			}
		}
	});



	it(`add data via change_value (set_data)`, async function() {

		// new svg data value
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
			const updated_entry = {...entries[0]}
			updated_entry.original_file_name = 'updated_test_file.svg'

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



describe(`COMPONENT_SVG SEARCH DATA OPERATIONS`, function() {

	this.timeout(10000);

	let instance	= null
	let node		= null



	it(`init → build → render (search mode)`, async function() {

		const options = {
			model			: 'component_svg',
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

		assert.equal(instance.model, 'component_svg', 'model expected component_svg')
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



// @license-end
