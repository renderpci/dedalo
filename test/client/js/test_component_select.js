// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../../core/common/js/instances.js'
import {event_manager} from '../../../core/common/js/event_manager.js'
import {ui} from '../../../core/common/js/ui.js'



// element options for component_select
	const element = elements.find(el => el.model==='component_select')
	if (!element) {
		console.error('Error: component_select not found in elements');
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



// mode/view matrix for component_select
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



describe(`COMPONENT_SELECT LIFECYCLE`, function() {

	this.timeout(10000);



	// LIFECYCLE TESTS: init, build, render, destroy across all mode/view pairs
	for (let i = 0; i < mode_view_pairs.length; i++) {

		const pair = mode_view_pairs[i]

		describe(`${pair.mode} / ${pair.view}`, function() {

			let instance = null
			let node	 = null

			it(`init → build → render`, async function() {

				const options = {
					model			: 'component_select',
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

					assert.equal(instance.model, 'component_select', 'model expected component_select')
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
						// edit default: select element exists
						const select_el = node.querySelector('.select')
						assert.isOk(select_el, 'expected select element in edit/default')
					}

					if (pair.mode==='edit' && pair.view==='line') {
						// edit line: view_line class or button_exit_edit
						const button_exit_edit = node.querySelector('.button_exit_edit')
						assert.isOk(button_exit_edit, 'expected button_exit_edit in edit/line')
					}

					if (pair.mode==='edit' && pair.view==='print') {
						// edit print: permissions forced to 1, read_only content
						const read_only = node.querySelector('.read_only')
						assert.isOk(read_only, 'expected read_only element in edit/print')
					}

					if (pair.mode==='list' && pair.view==='default') {
						// list default: wrapper_component with list mode class
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
						// search: q_operator input and select
						const q_operator = node.querySelector('.q_operator')
						assert.isOk(q_operator, 'expected q_operator input in search/default')
						const select_el = node.querySelector('.select')
						assert.isOk(select_el, 'expected select element in search/default')
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



describe(`COMPONENT_SELECT DATA OPERATIONS`, function() {

	this.timeout(10000);

	let instance	= null
	let node		= null



	it(`init → build → render (edit mode, permissions=2)`, async function() {

		const options = {
			model			: 'component_select',
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

		assert.equal(instance.model, 'component_select', 'model expected component_select')
		assert.equal(instance.status, 'rendered', 'status expected rendered')
		assert.isOk(instance.datum, 'datum expected')
		assert.isOk(instance.context, 'context expected')
		assert.isOk(instance.data, 'data expected')
		assert.isOk(Array.isArray(instance.data.entries), 'data.entries expected array')
	});



	it(`select change value`, async function() {

		// find the select element in the rendered node
			const select_el = node.querySelector('.select')
			assert.isOk(select_el, 'expected select element in DOM')

		// get datalist options
			const datalist = instance.data.datalist || []
			if (datalist.length > 0) {
				// find a non-empty datalist item
				const datalist_item = datalist.find(el => el.value !== null)
				if (datalist_item) {
					// simulate change event by setting select value and dispatching
					select_el.value = JSON.stringify(datalist_item.value)
					select_el.dispatchEvent(new Event('change', { bubbles: true }))
					// verify changed_data was set
					assert.isOk(instance.data.changed_data, 'changed_data expected after select change')
					assert.equal(instance.data.changed_data[0].action, 'update', 'changed_data action expected update')

				}
			}
	});



	it(`select change to empty (remove)`, async function() {

		const select_el = node.querySelector('.select')
		assert.isOk(select_el, 'expected select element in DOM')

		// select empty option (first option with null value)
		select_el.value = ''
		select_el.dispatchEvent(new Event('change', { bubbles: true }))

		// verify changed_data action is remove
		if (instance.data.changed_data) {
			assert.equal(instance.data.changed_data[0].action, 'remove', 'changed_data action expected remove on empty select')
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



// @license-end
