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



// element options for component_security_access
	const element = elements.find(el => el.model==='component_security_access')
	if (!element) {
		console.error('Error: component_security_access not found in elements');
	}

	const section_tipo	= element.section_tipo
	const section_id	= element.section_id
	const tipo			= element.tipo  // test157
	const lang			= element.lang



// DOM containers
	const container = document.getElementById('content');

	const component_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'component_container',
		parent			: container
	})



// mode/view matrix for component_security_access
// edit: default, line, print
// list: default, mini, text
// search: default
	const mode_view_pairs = [
		{ mode: 'edit',	view: 'default'	},
		{ mode: 'edit',	view: 'line'		},
		{ mode: 'edit',	view: 'print'		},
		{ mode: 'list',	view: 'default'	},
		{ mode: 'list',	view: 'mini'		},
		{ mode: 'list',	view: 'text'		},
		{ mode: 'search',view: 'default'	}
	]



describe(`COMPONENT_SECURITY_ACCESS LIFECYCLE`, function() {

	this.timeout(15000);



	// LIFECYCLE TESTS: init, build, render, destroy across all mode/view pairs
	for (let i = 0; i < mode_view_pairs.length; i++) {

		const pair = mode_view_pairs[i]

		describe(`${pair.mode} / ${pair.view}`, function() {

			let instance = null
			let node	 = null

			it(`init → build → render`, async function() {

				const options = {
					model			: 'component_security_access',
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

					assert.equal(instance.model, 'component_security_access', 'model expected component_security_access')
					assert.equal(instance.tipo, tipo, `tipo expected ${tipo}`)
					assert.equal(instance.section_tipo, section_tipo, `section_tipo expected ${section_tipo}`)
					assert.equal(instance.section_id, section_id, `section_id expected ${section_id}`)
					assert.equal(instance.mode, pair.mode, `mode expected ${pair.mode}`)
					assert.equal(instance.lang, lang, `lang expected ${lang}`)

				// build
					await instance.build(true)
					assert.equal(instance.status, 'built', 'status expected built after build')

				// render
					node = await instance.render()
					assert.isOk(node instanceof Element, 'node expected DOM Element')
					// status is 'rendered' only when context is available;
					// without context, common.render returns an error node but status stays 'built'
					if (instance.context) {
						assert.equal(instance.status, 'rendered', 'status expected rendered after render (context present)')
					} else {
						assert.equal(instance.status, 'built', 'status expected built when context is null')
					}
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
						// edit default: content_data with tree_root (ul)
						assert.isOk(node.querySelector('.content_data'), 'expected content_data in edit/default')
						assert.isOk(node.querySelector('.tree_root'), 'expected tree_root ul in edit/default')
						assert.isOk(node.querySelector('.li_item'), 'expected li_item nodes in edit/default')
						// buttons_container exists (permissions > 1)
						assert.isOk(node.querySelector('.buttons_container'), 'expected buttons_container in edit/default')
					}

					if (pair.mode==='edit' && pair.view==='line') {
						// edit line: content_data exists, no label
						assert.isOk(node.querySelector('.content_data'), 'expected content_data in edit/line')
						assert.isOk(node.classList.contains('view_line'), 'expected view_line class')
					}

					if (pair.mode==='edit' && pair.view==='print') {
						// edit print: permissions forced to 1, renders default tree in read-only mode
						assert.isOk(node.classList.contains('view_print'), 'expected view_print class in edit/print')
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
						// search: content_data
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



describe(`COMPONENT_SECURITY_ACCESS DATA OPERATIONS`, function() {

	this.timeout(15000);

	let instance	= null
	let node		= null



	it(`init → build → render (edit mode, permissions=2)`, async function() {

		const options = {
			model			: 'component_security_access',
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

		assert.equal(instance.model, 'component_security_access', 'model expected component_security_access')
		assert.equal(instance.status, 'rendered', 'status expected rendered')
		// datum and context may be null for component_security_access in test env
		assert.isOk(instance.data !== undefined, 'data expected')
	});



	it(`data structure`, async function() {

		const data		= instance.data || {}
		const entries	= data.entries || []
		const datalist	= data.datalist || []

		// component_security_access entries have tipo, section_tipo, value
		if (entries.length > 0) {
			assert.isOk(entries[0].tipo !== undefined, 'entry expected tipo property')
			assert.isOk(entries[0].section_tipo !== undefined, 'entry expected section_tipo property')
			assert.isOk(entries[0].value !== undefined, 'entry expected value property')
		}

		// datalist should be present (ontology tree)
		if (datalist.length > 0) {
			assert.isOk(datalist[0].tipo !== undefined, 'datalist item expected tipo property')
			assert.isOk(datalist[0].section_tipo !== undefined, 'datalist item expected section_tipo property')
			assert.isOk(datalist[0].model !== undefined, 'datalist item expected model property')
		}
	});



	it(`filled_value is populated on build`, async function() {

		// component_security_access creates filled_value in build
		// merging datalist with entries, filling missing items with value 0
		assert.isOk(Array.isArray(instance.filled_value), 'filled_value expected array')
	});



	it(`update_value method works`, async function() {

		// update_value adds/updates a permission item
		const item = {
			tipo			: 'test45',
			section_tipo	: 'test3',
			ar_parent		: ['test3']
		}
		const input_value = 2

		const result = instance.update_value(item, input_value)

		assert.isOk(Array.isArray(result), 'update_value expected array return')
		// verify the item was added/updated
		const found = result.find(el => el.tipo==='test45' && el.section_tipo==='test3')
		assert.isOk(found, 'expected updated item in result')
		assert.equal(found.value, 2, 'expected value 2 for updated item')
	});



	it(`get_parents method works`, async function() {

		const datalist = instance.data.datalist || []
		if (datalist.length > 0) {
			const item = datalist.find(el => el.ar_parent && el.ar_parent.length > 0)
			if (item) {
				const parents = instance.get_parents(item)
				assert.isOk(Array.isArray(parents), 'get_parents expected array return')
			}
		}
	});



	it(`get_children method works`, async function() {

		const datalist = instance.data.datalist || []
		if (datalist.length > 0) {
			// find an area/section item (tipo===section_tipo) that likely has children
			const item = datalist.find(el => el.tipo===el.section_tipo)
			if (item) {
				const children = instance.get_children(item)
				assert.isOk(Array.isArray(children), 'get_children expected array return')
			}
		}
	});



	it(`save_changes method exists`, async function() {

		assert.equal(typeof instance.save_changes, 'function', 'save_changes expected to be a function')
	});



	it(`update_parents_radio_butons method exists`, async function() {

		assert.equal(typeof instance.update_parents_radio_butons, 'function', 'update_parents_radio_butons expected to be a function')
	});



	it(`is_empty returns boolean`, async function() {

		const result = is_empty(instance)

		assert.equal(typeof result, 'boolean', 'is_empty expected boolean')
	});



	it(`instance id is set`, async function() {

		assert.isOk(instance.id, 'instance.id expected to be set')
		assert.equal(typeof instance.id, 'string', 'instance.id expected string')
	});



	it(`worker_path is set`, async function() {

		assert.isOk(instance.worker_path, 'worker_path expected to be set')
		assert.equal(typeof instance.worker_path, 'string', 'worker_path expected string')
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



describe(`COMPONENT_SECURITY_ACCESS SEARCH DATA OPERATIONS`, function() {

	this.timeout(15000);

	let instance	= null
	let node		= null



	it(`init → build → render (search mode)`, async function() {

		const options = {
			model			: 'component_security_access',
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



	it(`search mode has content_data`, async function() {

		assert.isOk(node.querySelector('.content_data'), 'expected content_data in search mode')
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
