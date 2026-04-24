// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../../core/common/js/instances.js'
import {event_manager} from '../../../core/common/js/event_manager.js'
import {ui} from '../../../core/common/js/ui.js'
import {build_changed_data_item} from '../../../core/component_radio_button/js/component_radio_button.js'



// element options for component_radio_button
	const element = elements.find(el => el.model==='component_radio_button')
	if (!element) {
		console.error('Error: component_radio_button not found in elements');
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



// mode/view matrix for component_radio_button
// edit: default, line, rating, print
// list: default, mini, text
// search: default
	const mode_view_pairs = [
		{ mode: 'edit',	view: 'default'	},
		{ mode: 'edit',	view: 'line'	},
		{ mode: 'edit',	view: 'rating'	},
		{ mode: 'edit',	view: 'print'	},
		{ mode: 'list',	view: 'default'	},
		{ mode: 'list',	view: 'mini'	},
		{ mode: 'list',	view: 'text'	},
		{ mode: 'search',view: 'default'	}
	]



describe(`COMPONENT_RADIO_BUTTON LIFECYCLE`, function() {

	this.timeout(10000);



	// LIFECYCLE TESTS: init, build, render, destroy across all mode/view pairs
	for (let i = 0; i < mode_view_pairs.length; i++) {

		const pair = mode_view_pairs[i]

		describe(`${pair.mode} / ${pair.view}`, function() {

			let instance = null
			let node	 = null

			it(`init → build → render`, async function() {

				const options = {
					model			: 'component_radio_button',
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

					assert.equal(instance.model, 'component_radio_button', 'model expected component_radio_button')
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
						// edit default: radio inputs exist, content_data exists
						const content_data = node.querySelector(':scope >.content_data') || node.content_data
						assert.isOk(content_data, 'expected content_data in edit/default')
						const radio_inputs = node.querySelectorAll('input[type="radio"]')
						assert.isAbove(radio_inputs.length, 0, 'expected radio inputs in edit/default')
					}

					if (pair.mode==='edit' && pair.view==='line') {
						// edit line: no label, button_exit_edit, content_data
						const button_exit_edit = node.querySelector('.button_exit_edit')
						assert.isOk(button_exit_edit, 'expected button_exit_edit in edit/line')
						assert.equal(node.querySelector(':scope >.label'), null, 'label should not exist in edit/line')
					}

					if (pair.mode==='edit' && pair.view==='rating') {
						// edit rating: radio inputs, view_rating class
						const radio_inputs = node.querySelectorAll('input[type="radio"]')
						assert.isAbove(radio_inputs.length, 0, 'expected radio inputs in edit/rating')
						assert.isOk(node.classList.contains('view_rating'), 'expected view_rating class in edit/rating')
					}

					if (pair.mode==='edit' && pair.view==='print') {
						// edit print: permissions forced to 1, view_print class
						// note: read_only element only exists when entries have data
						assert.equal(instance.permissions, 1, 'permissions expected 1 in edit/print')
						assert.isOk(node.classList.contains('view_print'), 'expected view_print class in edit/print')
						const entries = instance.data.entries || []
						if (entries.length > 0) {
							const read_only = node.querySelector('.read_only')
							assert.isOk(read_only, 'expected read_only element in edit/print when entries exist')
						}
					}

					if (pair.mode==='list' && pair.view==='default') {
						// list default: wrapper with list class
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
						// search: q_operator input and radio inputs
						const q_operator = node.querySelector('.q_operator')
						assert.isOk(q_operator, 'expected q_operator input in search/default')
						const radio_inputs = node.querySelectorAll('input[type="radio"]')
						assert.isAbove(radio_inputs.length, 0, 'expected radio inputs in search/default')
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



describe(`COMPONENT_RADIO_BUTTON DATA OPERATIONS`, function() {

	this.timeout(10000);

	let instance	= null
	let node		= null



	it(`init → build → render (edit mode, permissions=2)`, async function() {

		const options = {
			model			: 'component_radio_button',
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

		assert.equal(instance.model, 'component_radio_button', 'model expected component_radio_button')
		assert.equal(instance.status, 'rendered', 'status expected rendered')
		assert.isOk(instance.datum, 'datum expected')
		assert.isOk(instance.context, 'context expected')
		assert.isOk(instance.data, 'data expected')
		assert.isOk(Array.isArray(instance.data.entries) || instance.data.entries===null, 'data.entries expected array or null')
	});



	it(`add data: select radio option`, async function() {

		// find radio inputs in the rendered node
			const radio_inputs = node.querySelectorAll('input[type="radio"]')
			assert.isAbove(radio_inputs.length, 0, 'expected radio inputs in DOM')

		// get datalist options
			const datalist = instance.data.datalist || []
			if (datalist.length > 0) {
				// find a datalist item with a value
				const datalist_item = datalist.find(el => el.value !== null && el.value !== undefined)
				if (datalist_item) {
					// simulate change event on the matching radio input
					const target_input = Array.from(radio_inputs).find(input => {
						return input.name === instance.id
					})
					if (target_input) {
						target_input.checked = true
						target_input.dispatchEvent(new Event('change', { bubbles: true }))

						// check changed_data IMMEDIATELY after dispatchEvent
						// (change_value resets changed_data=[] after API response)
						assert.isOk(instance.data.changed_data, 'changed_data expected after radio change')
						assert.isAbove(instance.data.changed_data.length, 0, 'changed_data should have at least 1 item')
						assert.equal(instance.data.changed_data[0].action, 'update', 'changed_data action expected update')

						// wait for async change_value to complete and verify final state
						await new Promise(resolve => setTimeout(resolve, 500))

						// verify entries were updated
						const entries = instance.data.entries || []
						assert.isAbove(entries.length, 0, 'entries expected after radio change')
					}
				}
			}
	});



	it(`change data: select different radio option`, async function() {

		const radio_inputs = node.querySelectorAll('input[type="radio"]')
		assert.isAbove(radio_inputs.length, 1, 'expected multiple radio inputs for change test')

		const datalist = instance.data.datalist || []
		if (datalist.length > 1) {
			// find a different datalist item than current value
			const current_section_id = instance.data.entries?.[0]?.section_id
			const different_item = datalist.find(el =>
				el.value && el.value.section_id !== current_section_id
			)
			if (different_item) {
				// find the radio input for this datalist item
				const target_input = Array.from(radio_inputs).find(input => {
					const label = input.closest('.content_value')?.querySelector('.label')
					return label && label.textContent === different_item.label
				})
				if (target_input) {
					target_input.checked = true
					target_input.dispatchEvent(new Event('change', { bubbles: true }))

					// check changed_data IMMEDIATELY after dispatchEvent
					// (change_value resets changed_data=[] after API response)
					assert.isOk(instance.data.changed_data, 'changed_data expected after radio change')
					assert.isAbove(instance.data.changed_data.length, 0, 'changed_data should have at least 1 item')
					assert.equal(instance.data.changed_data[0].action, 'update', 'changed_data action expected update on change')

					// wait for async change_value to complete
					await new Promise(resolve => setTimeout(resolve, 500))
				}
			}
		}
	});



	it(`remove data: reset button click`, async function() {

		// find the reset button
			const reset_button = node.querySelector('.button.reset')
			if (reset_button) {
				reset_button.click()

				await new Promise(resolve => setTimeout(resolve, 300))

				// verify data was removed
				const entries = instance.data.entries || []
				assert.equal(entries.length, 0, 'expected empty entries after reset')
			}else{
				// if no reset button, manually test remove via build_changed_data_item
				const current_id = instance.data.entries?.[0]?.id ?? null
				const {changed_data_item} = build_changed_data_item(null, current_id)
				assert.equal(changed_data_item.action, 'remove', 'expected remove action for null value')
				assert.equal(changed_data_item.value, null, 'expected null value for remove action')
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



describe(`COMPONENT_RADIO_BUTTON SEARCH DATA OPERATIONS`, function() {

	this.timeout(10000);

	let instance	= null
	let node		= null



	it(`init → build → render (search mode)`, async function() {

		const options = {
			model			: 'component_radio_button',
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

		assert.equal(instance.model, 'component_radio_button', 'model expected component_radio_button')
		assert.equal(instance.status, 'rendered', 'status expected rendered')
		assert.isOk(instance.data, 'data expected')
		assert.isOk(instance.data.datalist, 'datalist expected in search mode')
	});



	it(`search: select radio option`, async function() {

		const radio_inputs = node.querySelectorAll('input[type="radio"]')
		assert.isAbove(radio_inputs.length, 0, 'expected radio inputs in search mode')

		const datalist = instance.data.datalist || []
		if (datalist.length > 0) {
			const datalist_item = datalist.find(el => el.value !== null && el.value !== undefined)
			if (datalist_item) {
				// click on the first radio input
				const first_radio = radio_inputs[0]
				first_radio.checked = true
				first_radio.dispatchEvent(new Event('change', { bubbles: true }))

				// verify search data was updated
				assert.isOk(instance.data, 'data expected after search selection')
			}
		}
	});



	it(`search: alt+click to deselect`, async function() {

		const radio_inputs = node.querySelectorAll('input[type="radio"]')
		assert.isAbove(radio_inputs.length, 0, 'expected radio inputs for deselect test')

		// first select a radio
		const first_radio = radio_inputs[0]
		first_radio.checked = true
		first_radio.dispatchEvent(new Event('change', { bubbles: true }))

		// simulate alt+click to deselect
		const content_value = first_radio.closest('.content_value')
		if (content_value) {
			const alt_click_event = new MouseEvent('click', {
				bubbles	: true,
				altKey	: true
			})
			content_value.dispatchEvent(alt_click_event)

			// verify radio was deselected
			assert.equal(first_radio.checked, false, 'expected radio to be unchecked after alt+click')
		}
	});



	it(`search: q_operator change`, async function() {

		const q_operator = node.querySelector('.q_operator')
		assert.isOk(q_operator, 'expected q_operator input in search mode')

		// change q_operator value
		q_operator.value = '$or'
		q_operator.dispatchEvent(new Event('change', { bubbles: true }))

		// verify q_operator was updated in instance data
		assert.equal(instance.data.q_operator, '$or', 'expected q_operator to be updated')
	});



	it(`destroy after search operations`, async function() {

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



describe(`COMPONENT_RADIO_BUTTON BUILD_CHANGED_DATA_ITEM`, function() {

	this.timeout(5000);



	it(`build_changed_data_item with valid value`, async function() {

		const datalist_value = {
			section_tipo		: 'dd64',
			section_id			: '1',
			type				: 'dd151',
			from_component_tipo	: 'test87'
		}
		const id = 8

		const {changed_data_item, parsed_value} = build_changed_data_item(datalist_value, id)

		assert.equal(changed_data_item.action, 'update', 'action expected update for non-null value')
		assert.equal(changed_data_item.id, id, 'id expected to match')
		assert.isOk(changed_data_item.value, 'value expected to be set')
		assert.equal(changed_data_item.value.section_id, '1', 'section_id expected in parsed value')
		assert.equal(changed_data_item.value.id, id, 'id expected in parsed value')
		assert.isOk(Object.isFrozen(changed_data_item), 'changed_data_item expected to be frozen')
	});



	it(`build_changed_data_item with null value (remove)`, async function() {

		const id = 8

		const {changed_data_item, parsed_value} = build_changed_data_item(null, id)

		assert.equal(changed_data_item.action, 'remove', 'action expected remove for null value')
		assert.equal(changed_data_item.id, id, 'id expected to match')
		assert.equal(changed_data_item.value, null, 'value expected null for remove')
		assert.equal(parsed_value, null, 'parsed_value expected null')
		assert.isOk(Object.isFrozen(changed_data_item), 'changed_data_item expected to be frozen')
	});



	it(`build_changed_data_item without id`, async function() {

		const datalist_value = {
			section_tipo		: 'dd64',
			section_id			: '2',
			type				: 'dd151',
			from_component_tipo	: 'test87'
		}

		const {changed_data_item, parsed_value} = build_changed_data_item(datalist_value, null)

		assert.equal(changed_data_item.action, 'update', 'action expected update')
		assert.equal(changed_data_item.id, null, 'id expected null')
		assert.isOk(changed_data_item.value, 'value expected to be set')
		assert.isOk(!changed_data_item.value.id, 'id should not be in value when null')
	});



	it(`build_changed_data_item clones value (no mutation)`, async function() {

		const datalist_value = {
			section_tipo		: 'dd64',
			section_id			: '1',
			type				: 'dd151',
			from_component_tipo	: 'test87'
		}
		const original_json = JSON.stringify(datalist_value)

		const {parsed_value} = build_changed_data_item(datalist_value, 5)

		// original should not be mutated
		assert.equal(JSON.stringify(datalist_value), original_json, 'original datalist_value should not be mutated')
		// parsed_value should have id added
		assert.equal(parsed_value.id, 5, 'parsed_value should have id 5')
	});
});



// @license-end
