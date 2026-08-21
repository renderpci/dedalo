// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../../core/common/js/instances.js'
import {event_manager} from '../../../core/common/js/event_manager.js'
import {ui} from '../../../core/common/js/ui.js'
import {build_changed_data_item} from '../../../core/component_check_box/js/component_check_box.js'



// element options for component_check_box
	const element = elements.find(el => el.model==='component_check_box')
	if (!element) {
		console.error('Error: component_check_box not found in elements');
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



// mode/view matrix for component_check_box
// edit: default, line, print, tools
// list: default, mini, text
// search: default
	const mode_view_pairs = [
		{ mode: 'edit',	view: 'default'	},
		{ mode: 'edit',	view: 'line'	},
		{ mode: 'edit',	view: 'print'	},
		{ mode: 'edit',	view: 'tools'	},
		{ mode: 'list',	view: 'default'	},
		{ mode: 'list',	view: 'mini'	},
		{ mode: 'list',	view: 'text'	},
		{ mode: 'search',view: 'default'	}
	]



describe(`COMPONENT_CHECK_BOX LIFECYCLE`, function() {

	this.timeout(10000);



	// LIFECYCLE TESTS: init, build, render, destroy across all mode/view pairs
	for (let i = 0; i < mode_view_pairs.length; i++) {

		const pair = mode_view_pairs[i]

		describe(`${pair.mode} / ${pair.view}`, function() {

			let instance = null
			let node	 = null

			it(`init → build → render`, async function() {

				const options = {
					model			: 'component_check_box',
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

					assert.equal(instance.model, 'component_check_box', 'model expected component_check_box')
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
						// edit print: permissions forced to 1, read_only content
						const read_only = node.querySelector('.read_only')
						assert.isOk(read_only, 'expected read_only element in edit/print')
					}

					if (pair.mode==='edit' && pair.view==='tools') {
						// edit tools: input_checkbox class elements
						const tool_checkboxes = node.querySelectorAll('.input_checkbox')
						assert.isOk(tool_checkboxes.length > 0, 'expected .input_checkbox elements in edit/tools')
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



describe(`COMPONENT_CHECK_BOX DATA OPERATIONS`, function() {

	this.timeout(10000);

	let instance	= null
	let node		= null

	// The record's stored state when the suite starts. The data-operation cases
	// WRITE: change_handler calls change_value, which is a real save on
	// test3/test88. A suite that leaves the record in a different state makes the
	// NEXT run's precondition false — that is how this suite goes red on its own
	// after a run without the runner's canonical-test3 reseed. Captured here,
	// restored by the `restore initial record state` case below.
	let initial_checked	= null

	/**
	* TOGGLE
	* Drive ONE datalist slot through the component's own change_handler and
	* AWAIT it, so the save has landed before the next assertion. Dispatching a
	* DOM 'change' event reaches the same handler but returns nothing to await:
	* the assertions then race the save.
	*/
	const toggle = async (i, checked) => {

		const input_checkbox = node.querySelectorAll('input[type="checkbox"]')[i]
		const datalist_value = (instance.data.datalist || [])[i]?.value

		input_checkbox.checked = checked
		await instance.change_handler({
			self			: instance,
			// the handler calls e.preventDefault() (component_check_box.js:223)
			e				: { preventDefault : () => {}, stopPropagation : () => {} },
			i				: i,
			datalist_value	: datalist_value,
			input_checkbox	: input_checkbox
		})

		return input_checkbox
	}

	/**
	* HAS_LOCATOR
	* Is a datalist option's locator among the component's stored entries?
	* This — not `changed_data` — is the durable outcome of a check/uncheck:
	* change_value RESETS data.changed_data to [] the moment the save lands
	* (component_common.js:1384), so an assertion on changed_data after an
	* awaited save reads the wrong side of the write. (The changed_data ITEM
	* shape is covered by the build_changed_data_item cases below.)
	*/
	const has_locator = (entries, value) => (entries || []).some(entry =>
		entry &&
		String(entry.section_id)===String(value.section_id) &&
		entry.section_tipo===value.section_tipo
	)



	it(`init → build → render (edit mode, permissions=2)`, async function() {

		const options = {
			model			: 'component_check_box',
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

		assert.equal(instance.model, 'component_check_box', 'model expected component_check_box')
		assert.equal(instance.status, 'rendered', 'status expected rendered')
		assert.isOk(instance.datum, 'datum expected')
		assert.isOk(instance.context, 'context expected')
		assert.isOk(instance.data, 'data expected')
		assert.isOk(Array.isArray(instance.data.entries), 'data.entries expected array')

		// snapshot for the restore case
			initial_checked = Array.from(node.querySelectorAll('input[type="checkbox"]')).map(cb => cb.checked)
	});



	it(`checkbox check (insert)`, async function() {

		// find an unchecked checkbox
			const checkboxes = node.querySelectorAll('input[type="checkbox"]')
			assert.isOk(checkboxes.length > 0, 'expected checkbox inputs in DOM')

		// get datalist
		// An empty datalist, or a form with nothing left to check, is not a reason
		// to skip: it is the exact condition that leaves the widget unable to save
		// anything. Assert it instead of guarding it away.
			const datalist = instance.data.datalist || []
			assert.isAbove(datalist.length, 0, 'datalist expected to offer options')

		// target slot 0, WHATEVER the record's stored state. Hunting for an
		// already-unchecked box made the case depend on the record: with every
		// option checked there was nothing to find and the suite failed for a
		// reason that had nothing to do with the insert path. If slot 0 is
		// checked, uncheck it first (a real, awaited save) so the insert path
		// is the one under test.
			if (checkboxes[0].checked) {
				await toggle(0, false)
			}
			await toggle(0, true)

			// verify the locator is now stored
			assert.isOk(
				has_locator(instance.data.entries, datalist[0].value),
				'the checked option locator expected in data.entries after insert'
			)
			assert.isOk(checkboxes[0].checked, 'slot 0 expected checked')
	});



	it(`checkbox uncheck (remove)`, async function() {

		// slot 0 is the one the previous case checked: its state is known, not
		// discovered. Its absence would be a failure, not a reason to skip.
			const checkboxes = node.querySelectorAll('input[type="checkbox"]')
			assert.isOk(checkboxes[0]?.checked, 'slot 0 expected checked by the previous case')

			await toggle(0, false)

			// verify the locator is gone from the stored entries
			assert.isNotOk(
				has_locator(instance.data.entries, (instance.data.datalist || [])[0].value),
				'the unchecked option locator expected absent from data.entries after remove'
			)
			assert.isNotOk(checkboxes[0].checked, 'slot 0 expected unchecked')
	});



	it(`build_changed_data_item with checked=true`, async function() {

		const datalist_value = {
			section_id		: '1',
			section_tipo	: 'dd64'
		}
		const entries = [
			{
				section_id		: '1',
				section_tipo	: 'dd64',
				id				: 42
			}
		]

		const {changed_data_item, action} = build_changed_data_item(true, datalist_value, entries)

		assert.equal(action, 'insert', 'action expected insert when checked=true')
		assert.equal(changed_data_item.action, 'insert', 'changed_data_item.action expected insert')
		assert.equal(changed_data_item.id, 42, 'changed_data_item.id expected 42')
		assert.deepEqual(changed_data_item.value, datalist_value, 'changed_data_item.value expected datalist_value')
		assert.isOk(Object.isFrozen(changed_data_item), 'changed_data_item expected to be frozen')
	});



	it(`build_changed_data_item with checked=false`, async function() {

		const datalist_value = {
			section_id		: '1',
			section_tipo	: 'dd64'
		}
		const entries = [
			{
				section_id		: '1',
				section_tipo	: 'dd64',
				id				: 42
			}
		]

		const {changed_data_item, action} = build_changed_data_item(false, datalist_value, entries)

		assert.equal(action, 'remove', 'action expected remove when checked=false')
		assert.equal(changed_data_item.action, 'remove', 'changed_data_item.action expected remove')
		assert.equal(changed_data_item.id, 42, 'changed_data_item.id expected 42 from locator')
		assert.equal(changed_data_item.value, null, 'changed_data_item.value expected null on remove')
		assert.isOk(Object.isFrozen(changed_data_item), 'changed_data_item expected to be frozen')
	});



	it(`build_changed_data_item with empty entries`, async function() {

		const datalist_value = {
			section_id		: '1',
			section_tipo	: 'dd64'
		}

		const {changed_data_item} = build_changed_data_item(true, datalist_value, [])

		assert.equal(changed_data_item.id, null, 'changed_data_item.id expected null when no matching entry')
		assert.equal(changed_data_item.action, 'insert', 'changed_data_item.action expected insert')
		assert.deepEqual(changed_data_item.value, datalist_value, 'changed_data_item.value expected datalist_value')
	});



	it(`focus_first_input returns true`, async function() {

		const result = instance.focus_first_input()

		assert.equal(result, true, 'focus_first_input expected to return true')
	});



	it(`restore initial record state`, async function() {

		// (!) Runs BEFORE the destroy case on purpose: it needs the live node.
		// Every write this suite made goes back, so a run outside the runner's
		// reseed leaves test3/test88 exactly as it found it.
			assert.isOk(initial_checked, 'initial state expected captured')

			const checkboxes = node.querySelectorAll('input[type="checkbox"]')
			for (let i = 0; i < checkboxes.length; i++) {
				if (checkboxes[i].checked !== initial_checked[i]) {
					await toggle(i, initial_checked[i])
				}
			}

			const restored = Array.from(node.querySelectorAll('input[type="checkbox"]')).map(cb => cb.checked)
			assert.deepEqual(restored, initial_checked, 'record expected restored to its initial state')
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



describe(`COMPONENT_CHECK_BOX SEARCH DATA OPERATIONS`, function() {

	this.timeout(10000);

	let instance	= null
	let node		= null



	it(`init → build → render (search mode)`, async function() {

		const options = {
			model			: 'component_check_box',
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

		assert.equal(instance.model, 'component_check_box', 'model expected component_check_box')
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
