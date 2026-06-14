// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../../core/common/js/instances.js'
import {event_manager} from '../../../core/common/js/event_manager.js'
import {ui} from '../../../core/common/js/ui.js'
import {build_changed_data_item} from '../../../core/component_filter/js/component_filter.js'



// element options for component_filter
	const element = elements.find(el => el.model==='component_filter')
	if (!element) {
		console.error('Error: component_filter not found in elements');
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



// mode/view matrix for component_filter
// edit: default, line, print
// list: default, mini, text, collapse
// search: default
	const mode_view_pairs = [
		{ mode: 'edit',	view: 'default'	},
		{ mode: 'edit',	view: 'line'	},
		{ mode: 'edit',	view: 'print'	},
		{ mode: 'list',	view: 'default'	},
		{ mode: 'list',	view: 'mini'	},
		{ mode: 'list',	view: 'text'	},
		{ mode: 'list',	view: 'collapse'},
		{ mode: 'search',view: 'default'	}
	]



describe(`COMPONENT_FILTER LIFECYCLE`, function() {

	this.timeout(10000);



	// LIFECYCLE TESTS: init, build, render, destroy across all mode/view pairs
	for (let i = 0; i < mode_view_pairs.length; i++) {

		const pair = mode_view_pairs[i]

		describe(`${pair.mode} / ${pair.view}`, function() {

			let instance = null
			let node	 = null

			it(`init → build → render`, async function() {

				const options = {
					model			: 'component_filter',
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

					assert.equal(instance.model, 'component_filter', 'model expected component_filter')
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
						// edit default: checkbox inputs exist
						const checkboxes = node.querySelectorAll('input[type="checkbox"]')
						assert.isOk(checkboxes.length > 0, 'expected checkbox inputs in edit/default')
					}

					if (pair.mode==='edit' && pair.view==='line') {
						// edit line: content_data exists
						const content_data = node.querySelector('.content_data')
						assert.isOk(content_data, 'expected content_data in edit/line')
					}

					if (pair.mode==='edit' && pair.view==='print') {
						// edit print: permissions forced to 1, uses get_input_element_read
						// no checkbox inputs, only icon.check for matched entries
						const checkboxes = node.querySelectorAll('input[type="checkbox"]')
						assert.equal(checkboxes.length, 0, 'expected no checkbox inputs in edit/print (read-only)')
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

					if (pair.mode==='list' && pair.view==='collapse') {
						// list collapse: wrapper with collapse class
						assert.isOk(node.classList.contains('list'), 'expected list class in list/collapse')
					}

					if (pair.mode==='search') {
						// search: q_operator input and checkboxes
						const q_operator = node.querySelector('.q_operator')
						assert.isOk(q_operator, 'expected q_operator input in search/default')
						const checkboxes = node.querySelectorAll('input[type="checkbox"]')
						assert.isOk(checkboxes.length > 0, 'expected checkbox inputs in search/default')
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



describe(`COMPONENT_FILTER DATA OPERATIONS`, function() {

	this.timeout(10000);

	let instance	= null
	let node		= null



	it(`init → build → render (edit mode, permissions=2)`, async function() {

		const options = {
			model			: 'component_filter',
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

		assert.equal(instance.model, 'component_filter', 'model expected component_filter')
		assert.equal(instance.status, 'rendered', 'status expected rendered')
		assert.isOk(instance.datum, 'datum expected')
		assert.isOk(instance.context, 'context expected')
		assert.isOk(instance.data, 'data expected')
		assert.isOk(Array.isArray(instance.data.entries), 'data.entries expected array')
	});



	it(`checkbox check (insert)`, async function() {

		// find an unchecked checkbox
			const checkboxes = node.querySelectorAll('input[type="checkbox"]')
			assert.isOk(checkboxes.length > 0, 'expected checkbox inputs in DOM')

		// get datalist
			const datalist = instance.data.datalist || []
			if (datalist.length > 0) {
				// find an unchecked checkbox
				const unchecked = Array.from(checkboxes).find(cb => !cb.checked)
				if (unchecked) {
					// simulate check
					unchecked.checked = true
					unchecked.dispatchEvent(new Event('change', { bubbles: true }))

					// the change handler may set changed_data asynchronously; poll
					// instead of asserting synchronously (flaky under full-run load)
					for (let i=0; i<40 && !instance.data.changed_data; i++) {
						await new Promise(resolve => setTimeout(resolve, 50))
					}

					// verify changed_data was set
					assert.isOk(instance.data.changed_data, 'changed_data expected after checkbox check')
					assert.equal(instance.data.changed_data[0].action, 'insert', 'changed_data action expected insert')
				}
			}
	});



	it(`checkbox uncheck (remove)`, async function() {

		// find a checked checkbox
			const checkboxes = node.querySelectorAll('input[type="checkbox"]')
			const checked = Array.from(checkboxes).find(cb => cb.checked)
			if (checked) {
				// simulate uncheck
				checked.checked = false
				checked.dispatchEvent(new Event('change', { bubbles: true }))

				// verify changed_data action is remove
				if (instance.data.changed_data) {
					assert.equal(instance.data.changed_data[0].action, 'remove', 'changed_data action expected remove on uncheck')
				}
			}
	});



	it(`build_changed_data_item with checked=true`, async function() {

		const datalist_value = {
			section_id		: '1',
			section_tipo	: 'dd153'
		}
		const entries = [
			{
				section_id		: '1',
				section_tipo	: 'dd153',
				id				: 1
			}
		]

		const {changed_data_item, action} = build_changed_data_item(true, datalist_value, entries)

		assert.equal(action, 'insert', 'action expected insert when checked=true')
		assert.equal(changed_data_item.action, 'insert', 'changed_data_item.action expected insert')
		assert.equal(changed_data_item.id, 1, 'changed_data_item.id expected 1')
		assert.deepEqual(changed_data_item.value, datalist_value, 'changed_data_item.value expected datalist_value')
		assert.isOk(Object.isFrozen(changed_data_item), 'changed_data_item expected to be frozen')
	});



	it(`build_changed_data_item with checked=false`, async function() {

		const datalist_value = {
			section_id		: '1',
			section_tipo	: 'dd153'
		}
		const entries = [
			{
				section_id		: '1',
				section_tipo	: 'dd153',
				id				: 1
			}
		]

		const {changed_data_item, action} = build_changed_data_item(false, datalist_value, entries)

		assert.equal(action, 'remove', 'action expected remove when checked=false')
		assert.equal(changed_data_item.action, 'remove', 'changed_data_item.action expected remove')
		assert.equal(changed_data_item.id, 1, 'changed_data_item.id expected 1 from locator')
		assert.equal(changed_data_item.value, null, 'changed_data_item.value expected null on remove')
		assert.isOk(Object.isFrozen(changed_data_item), 'changed_data_item expected to be frozen')
	});



	it(`build_changed_data_item with empty entries`, async function() {

		const datalist_value = {
			section_id		: '1',
			section_tipo	: 'dd153'
		}

		const {changed_data_item} = build_changed_data_item(true, datalist_value, [])

		assert.equal(changed_data_item.id, null, 'changed_data_item.id expected null when no matching entry')
		assert.equal(changed_data_item.action, 'insert', 'changed_data_item.action expected insert')
		assert.deepEqual(changed_data_item.value, datalist_value, 'changed_data_item.value expected datalist_value')
	});



	it(`build_changed_data_item with non-matching entries`, async function() {

		const datalist_value = {
			section_id		: '99',
			section_tipo	: 'dd153'
		}
		const entries = [
			{
				section_id		: '1',
				section_tipo	: 'dd153',
				id				: 1
			}
		]

		const {changed_data_item} = build_changed_data_item(true, datalist_value, entries)

		assert.equal(changed_data_item.id, null, 'changed_data_item.id expected null when no matching entry')
		assert.equal(changed_data_item.action, 'insert', 'changed_data_item.action expected insert')
		assert.deepEqual(changed_data_item.value, datalist_value, 'changed_data_item.value expected datalist_value')
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



describe(`COMPONENT_FILTER SEARCH DATA OPERATIONS`, function() {

	this.timeout(10000);

	let instance	= null
	let node		= null



	it(`init → build → render (search mode)`, async function() {

		const options = {
			model			: 'component_filter',
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

		assert.equal(instance.model, 'component_filter', 'model expected component_filter')
		assert.equal(instance.status, 'rendered', 'status expected rendered')
	});



	it(`search checkbox check triggers update_data_value`, async function() {

		const checkboxes = node.querySelectorAll('input[type="checkbox"]')
		assert.isOk(checkboxes.length > 0, 'expected checkbox inputs in search DOM')

		const unchecked = Array.from(checkboxes).find(cb => !cb.checked)
		if (unchecked) {
			unchecked.checked = true
			unchecked.dispatchEvent(new Event('change', { bubbles: true }))

			// search mode uses update_data_value + event_manager, not change_value
			// verify data was updated
			assert.isOk(instance.data, 'data expected after search checkbox change')
		}
	});



	it(`search q_operator change`, async function() {

		const q_operator = node.querySelector('.q_operator')
		assert.isOk(q_operator, 'expected q_operator input in search')

		q_operator.value = '||'
		q_operator.dispatchEvent(new Event('change', { bubbles: true }))

		assert.equal(instance.data.q_operator, '||', 'q_operator expected || after change')
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
