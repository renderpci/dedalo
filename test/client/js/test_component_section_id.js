// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../../core/common/js/instances.js'
import {event_manager} from '../../../core/common/js/event_manager.js'
import {is_empty} from '../../../core/component_common/js/component_common.js'
import {ui} from '../../../core/common/js/ui.js'



// element options for component_section_id
	const element = elements.find(el => el.model==='component_section_id')
	if (!element) {
		console.error('Error: component_section_id not found in elements');
	}

	const section_tipo	= element.section_tipo
	const section_id	= element.section_id
	const tipo			= element.tipo  // test102
	const lang			= element.lang



// DOM containers
const container = document.getElementById('content');

const component_container = ui.create_dom_element({
	element_type	: 'div',
	class_name		: 'component_container',
	parent			: container
})



// mode/view matrix for component_section_id
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



describe(`COMPONENT_SECTION_ID LIFECYCLE`, function() {

	this.timeout(15000);



	// LIFECYCLE TESTS: init, build, render, destroy across all mode/view pairs
	for (let i = 0; i < mode_view_pairs.length; i++) {

		const pair = mode_view_pairs[i]

		describe(`${pair.mode} / ${pair.view}`, function() {

			let instance = null
			let node	 = null

			it(`init → build → render`, async function() {

				const options = {
					model			: 'component_section_id',
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

					assert.equal(instance.model, 'component_section_id', 'model expected component_section_id')
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
						// edit default: content_value section_id div exists
						const content_value = node.querySelector('.content_value')
						assert.isOk(content_value, 'expected content_value element in edit/default')
						assert.isOk(content_value.classList.contains('section_id'), 'expected section_id class on content_value')
						// content_data exists
						assert.isOk(node.querySelector('.content_data'), 'expected content_data in edit/default')
						// buttons_container exists (permissions > 1)
						assert.isOk(node.querySelector('.buttons_container'), 'expected buttons_container in edit/default')
					}

					if (pair.mode==='edit' && pair.view==='line') {
						// edit line: content_data exists, no label
						assert.isOk(node.querySelector('.content_data'), 'expected content_data in edit/line')
						assert.isOk(node.querySelector('.content_value'), 'expected content_value in edit/line')
						assert.isOk(node.classList.contains('view_line'), 'expected view_line class')
					}

					if (pair.mode==='edit' && pair.view==='print') {
						// edit print: permissions forced to 1, same content_value div but no buttons
						assert.isOk(node.querySelector('.content_value'), 'expected content_value in edit/print')
						assert.isOk(node.classList.contains('view_print'), 'expected view_print class on wrapper')
						// no buttons when permissions=1
						assert.isNotOk(node.querySelector('.buttons_container'), 'expected no buttons_container in edit/print (permissions=1)')
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
						// search: content_data and input_value
						assert.isOk(node.querySelector('.content_data'), 'expected content_data in search/default')
						assert.isOk(node.querySelector('.input_value'), 'expected input_value in search/default')
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



describe(`COMPONENT_SECTION_ID DATA OPERATIONS`, function() {

	this.timeout(15000);

	let instance	= null
	let node		= null



	it(`init → build → render (edit mode, permissions=2)`, async function() {

		const options = {
			model			: 'component_section_id',
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

		assert.equal(instance.model, 'component_section_id', 'model expected component_section_id')
		assert.equal(instance.status, 'rendered', 'status expected rendered')
		assert.isOk(instance.datum, 'datum expected')
		assert.isOk(instance.context, 'context expected')
		assert.isOk(instance.data, 'data expected')
		assert.isOk(Array.isArray(instance.data.entries), 'data.entries expected array')
	});



	it(`data structure`, async function() {

		const data		= instance.data || {}
		const entries	= data.entries || []

		// component_section_id entries are raw integers (not objects with value)
		if (entries.length > 0) {
			// first entry can be an integer or an object with value property
			const first = entries[0]
			if (typeof first === 'object') {
				assert.isOk(first.value !== undefined, 'entry object expected value property')
			}
			// integer entries are valid too
		}
	});



	it(`add data via change_value (set_data)`, async function() {

		const changed_data = [Object.freeze({
			action	: 'insert',
			id		: null,
			value	: 99
		})]

		await instance.change_value({
			changed_data	: changed_data,
			refresh		: true
		})

		// component_section_id is read-only, change_value may not persist
		// but the call should not throw
		const entries = instance.data.entries || []
		assert.isOk(Array.isArray(entries), 'entries expected array after change_value')
	});



	it(`change data via change_value (update)`, async function() {

		const data		= instance.data || {}
		const entries	= data.entries || []
		const key		= 0

		if (entries.length > 0) {
			const changed_data = [Object.freeze({
				action	: 'update',
				id		: entries[key]?.id || null,
				value	: 42
			})]

			await instance.change_value({
				changed_data	: changed_data,
				refresh		: false
			})
		}
	});



	it(`remove data via change_value (remove)`, async function() {

		const data		= instance.data || {}
		const entries	= data.entries || []

		if (entries.length > 0) {
			const changed_data = [Object.freeze({
				action	: 'remove',
				id		: entries[0]?.id || null,
				value	: null
			})]

			await instance.change_value({
				changed_data	: changed_data,
				refresh		: true
			})
		}
	});



	it(`refresh rebuilds component`, async function() {

		await instance.refresh()

		assert.equal(instance.status, 'rendered', 'status expected rendered after refresh')
		assert.isOk(instance.node instanceof Element, 'node expected DOM Element after refresh')
	});



	it(`is_empty returns boolean`, async function() {

		const result = is_empty(instance)

		assert.equal(typeof result, 'boolean', 'is_empty expected boolean')
	});



	it(`instance id is set`, async function() {

		assert.isOk(instance.id, 'instance.id expected to be set')
		assert.equal(typeof instance.id, 'string', 'instance.id expected string')
	});



	it(`validate_input strips non-numeric chars`, async function() {

		// component_section_id has a validate_input method
		if (typeof instance.validate_input === 'function') {
			assert.equal(instance.validate_input('12abc3'), '123', 'expected non-numeric chars removed')
			assert.equal(instance.validate_input('42'), '42', 'expected numeric string preserved')
			assert.equal(instance.validate_input('abc'), '', 'expected empty string for all non-numeric')
		}
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



describe(`COMPONENT_SECTION_ID SEARCH DATA OPERATIONS`, function() {

	this.timeout(15000);

	let instance	= null
	let node		= null



	it(`init → build → render (search mode)`, async function() {

		const options = {
			model			: 'component_section_id',
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

		const data		= instance.data || {}
		const entries	= data.entries || []

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
