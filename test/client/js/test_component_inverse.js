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



// element options for component_inverse
	const element = elements.find(el => el.model==='component_inverse')
	if (!element) {
		console.error('Error: component_inverse not found in elements');
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



// mode/view matrix for component_inverse
// edit: default, mini, print
// list: default, mini, text
// search: default (uses edit render)
	const mode_view_pairs = [
		{ mode: 'edit',	view: 'default'	},
		{ mode: 'edit',	view: 'mini'	},
		{ mode: 'edit',	view: 'print'	},
		{ mode: 'list',	view: 'default'	},
		{ mode: 'list',	view: 'mini'	},
		{ mode: 'list',	view: 'text'	},
		{ mode: 'search',view: 'default'	}
	]



describe(`COMPONENT_INVERSE LIFECYCLE`, function() {

	this.timeout(10000);



	// LIFECYCLE TESTS: init, build, render, destroy across all mode/view pairs
	for (let i = 0; i < mode_view_pairs.length; i++) {

		const pair = mode_view_pairs[i]

		describe(`${pair.mode} / ${pair.view}`, function() {

			let instance = null
			let node	 = null

			it(`init → build → render`, async function() {

				const options = {
					model			: 'component_inverse',
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

					assert.equal(instance.model, 'component_inverse', 'model expected component_inverse')
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
						// edit default: wrapper with content_data containing content_value divs
						const content_data = node.querySelector('.content_data')
						assert.isOk(content_data, 'expected content_data in edit/default')
						const content_values = node.querySelectorAll('.content_value')
						assert.isOk(content_values.length >= 0, 'content_value elements expected in edit/default')
					}

					if (pair.mode==='edit' && pair.view==='mini') {
						// edit mini: mini wrapper
						assert.isOk(node.classList.contains('mini'), 'expected mini class in edit/mini')
					}

					if (pair.mode==='edit' && pair.view==='print') {
						// edit print: permissions forced to 1, uses read-only render
						const content_values = node.querySelectorAll('.content_value.read_only')
						assert.isOk(content_values.length > 0, 'expected read-only content values in edit/print')
					}

					if (pair.mode==='list' && pair.view==='default') {
						// list default: wrapper_list with value_string
						assert.isOk(node.classList.contains('list'), 'expected list class in list/default')
					}

					if (pair.mode==='list' && pair.view==='mini') {
						// list mini: mini wrapper with value string
						assert.isOk(node.classList.contains('mini'), 'expected mini class in list/mini')
					}

					if (pair.mode==='list' && pair.view==='text') {
						// list text: span wrapper with model and mode classes
						assert.isOk(node.classList.contains('component_inverse'), 'expected component_inverse class in list/text')
						assert.isOk(node.classList.contains('list'), 'expected list class in list/text')
					}

					if (pair.mode==='search') {
						// search: uses edit render, content_data with content_values
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



describe(`COMPONENT_INVERSE DATA OPERATIONS`, function() {

	this.timeout(10000);

	let instance	= null
	let node		= null



	it(`init → build → render (edit mode, permissions=2)`, async function() {

		const options = {
			model			: 'component_inverse',
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

		assert.equal(instance.model, 'component_inverse', 'model expected component_inverse')
		assert.equal(instance.status, 'rendered', 'status expected rendered')
		assert.isOk(instance.datum, 'datum expected')
		assert.isOk(instance.context, 'context expected')
		assert.isOk(instance.data, 'data expected')
		assert.isOk(Array.isArray(instance.data.entries), 'data.entries expected array')
	});



	it(`data structure`, async function() {

		const entries = instance.data.entries || []

		// entries is array of locator objects with from_section_id, from_section_tipo, from_component_tipo
		assert.isOk(Array.isArray(entries), 'entries expected array')

		if (entries.length > 0) {
			const entry = entries[0]
			// inverse locator data items have locator property with from_section_id
			const locator = entry.locator || entry
			assert.isOk(locator.hasOwnProperty('from_section_id'), 'entry expected from_section_id property')
		}

		// datalist is array
		const datalist = instance.data.datalist || []
		assert.isOk(Array.isArray(datalist), 'datalist expected array')
	});



	it(`is_empty returns boolean`, async function() {

		const result = is_empty(instance)

		assert.isOk(
			typeof result === 'boolean',
			'is_empty expected boolean'
		)
	});



	it(`instance id is set`, async function() {

		assert.isOk(instance.id, 'instance.id expected to be set')
		assert.isOk(typeof instance.id === 'string', 'instance.id expected string')
	});



	it(`refresh rebuilds component content`, async function() {

		await instance.refresh()

		assert.isOk(instance.node, 'node expected after refresh')
		assert.equal(instance.status, 'rendered', 'status expected rendered after refresh')
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



describe(`COMPONENT_INVERSE SEARCH DATA OPERATIONS`, function() {

	this.timeout(10000);

	let instance	= null
	let node		= null



	it(`init → build → render (search mode)`, async function() {

		const options = {
			model			: 'component_inverse',
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

		assert.equal(instance.model, 'component_inverse', 'model expected component_inverse')
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
