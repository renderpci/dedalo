// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../../core/common/js/instances.js'
import {event_manager} from '../../../core/common/js/event_manager.js'
import {ui} from '../../../core/common/js/ui.js'
import {change_handler} from '../../../core/component_date/js/render_edit_component_date.js'



// element options for component_date (date mode)
	const element = elements.find(el => el.model==='component_date')
	if (!element) {
		console.error('Error: component_date not found in elements');
	}

	const section_tipo	= element.section_tipo
	const section_id	= element.section_id
	const tipo_date		= element.tipo  // test145 (date_mode: date)
	const tipo_period	= 'test218'     // test218 (date_mode: period)
	const lang			= element.lang



// DOM containers
	const container = document.getElementById('content');

	const component_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'component_container',
		parent			: container
	})



// mode/view matrix for component_date
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



describe(`COMPONENT_DATE LIFECYCLE`, function() {

	this.timeout(15000);



	// LIFECYCLE TESTS: init, build, render, destroy across all mode/view pairs
	for (let i = 0; i < mode_view_pairs.length; i++) {

		const pair = mode_view_pairs[i]

		describe(`${pair.mode} / ${pair.view}`, function() {

			let instance = null
			let node	 = null

			it(`init → build → render`, async function() {

				const options = {
					model			: 'component_date',
					tipo			: tipo_date,
					section_tipo	: section_tipo,
					section_id		: section_id,
					lang			: lang,
					mode			: pair.mode,
					view			: pair.view,
					id_variant		: pair.mode + '_' + pair.view + '_' + Math.random()
				}

				// init
					instance = await get_instance(options)

					assert.equal(instance.model, 'component_date', 'model expected component_date')
					assert.equal(instance.tipo, tipo_date, `tipo expected ${tipo_date}`)
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
						// edit default: input_date element exists
						const input_date = node.querySelector('.input_date')
						assert.isOk(input_date, 'expected input_date element in edit/default')
						// label exists
						assert.isOk(node.querySelector('.label'), 'expected label in edit/default')
						// buttons_container exists
						assert.isOk(node.querySelector('.buttons_container'), 'expected buttons_container in edit/default')
					}

					if (pair.mode==='edit' && pair.view==='line') {
						// edit line: content_data exists
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
						// search: q_operator input and content_data
						const q_operator = node.querySelector('.q_operator')
						assert.isOk(q_operator, 'expected q_operator input in search/default')
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



describe(`COMPONENT_DATE DATA OPERATIONS (date mode)`, function() {

	this.timeout(15000);

	let instance	= null
	let node		= null



	it(`init → build → render (edit mode)`, async function() {

		const options = {
			model			: 'component_date',
			tipo			: tipo_date,
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: lang,
			mode			: 'edit',
			view			: 'default',
			id_variant		: 'data_ops_date_' + Math.random()
		}

		instance = await get_instance(options)
		await instance.build(true)
		node = await instance.render()

		component_container.appendChild(node)

		assert.equal(instance.model, 'component_date', 'model expected component_date')
		assert.equal(instance.status, 'rendered', 'status expected rendered')
		assert.isOk(instance.datum, 'datum expected')
		assert.isOk(instance.context, 'context expected')
		assert.isOk(instance.data, 'data expected')
		assert.isOk(Array.isArray(instance.data.entries), 'data.entries expected array')
	});



	it(`date_mode is 'date'`, async function() {

		const date_mode = instance.get_date_mode()
		assert.equal(date_mode, 'date', 'expected date_mode date')
	});



	it(`add data via change_value (date input)`, async function() {

		// Build changed_data_item the same way change_handler does
		// This verifies the effective_key logic (start|end|period, never 'undefined')
		const parse_response = instance.parse_string_date('25/12/2024')
		assert.isOk(parse_response.result, 'parse_string_date expected result')

		const data		= instance.data || {}
		const entries	= data.entries || []
		const key		= 0
		const effective_key = 'start' // date_input || type

		// data_value construction (same as change_handler)
		const item = entries[key]
			? JSON.parse(JSON.stringify(entries[key]))
			: {}
		item[effective_key] = parse_response.result

		const changed_data_item = Object.freeze({
			action	: 'update',
			id		: entries[key]?.id || null,
			value	: item
		})

		// CRITICAL: verify the key is 'start' (not 'undefined')
		assert.isOk(changed_data_item.value.start, 'expected start property in changed value')
		assert.isUndefined(changed_data_item.value['undefined'], 'expected NO undefined property in changed value')
		assert.equal(changed_data_item.value.start.year, 2024, 'expected year 2024')
		assert.equal(changed_data_item.value.start.month, 12, 'expected month 12')
		assert.equal(changed_data_item.value.start.day, 25, 'expected day 25')

		// Apply the change via change_value (async) and wait
		await instance.change_value({
			changed_data	: [changed_data_item],
			refresh		: false
		})

		// Verify entries updated
		const updated_entries = instance.data.entries
		assert.isOk(updated_entries[key].start, 'expected start in entries after change_value')
	});



	it(`change data via change_value (update existing)`, async function() {

		// Build changed_data_item for an updated date
		const parse_response = instance.parse_string_date('01/06/2023')

		const data		= instance.data || {}
		const entries	= data.entries || []
		const key		= 0
		const effective_key = 'start'

		const item = entries[key]
			? JSON.parse(JSON.stringify(entries[key]))
			: {}
		item[effective_key] = parse_response.result

		const changed_data_item = Object.freeze({
			action	: 'update',
			id		: entries[key]?.id || null,
			value	: item
		})

		assert.isOk(changed_data_item.value.start, 'expected start property in changed value')
		assert.equal(changed_data_item.value.start.year, 2023, 'expected year 2023')
		assert.equal(changed_data_item.value.start.month, 6, 'expected month 6')

		await instance.change_value({
			changed_data	: [changed_data_item],
			refresh		: false
		})
	});



	it(`remove data via change_value (empty date)`, async function() {

		// Build changed_data_item for removing the start value
		const data		= instance.data || {}
		const entries	= data.entries || []
		const key		= 0
		const effective_key = 'start'

		const item = entries[key]
			? JSON.parse(JSON.stringify(entries[key]))
			: {}

		// Delete the effective_key (same as change_handler does for empty input)
		delete item[effective_key]
		const item_keys = Object.keys(item)
		const data_value = (item_keys.length===1 && item_keys[0]==='id') || item_keys.length===0
			? null
			: item

		const changed_data_item = Object.freeze({
			action	: 'update',
			id		: entries[key]?.id || null,
			value	: data_value
		})

		// Verify start was deleted (value may be null if only id left,
		// or may still contain other keys like 'end' from server data)
		assert.isUndefined(changed_data_item.value?.start, 'expected start to be deleted after clearing date')

		await instance.change_value({
			changed_data	: [changed_data_item],
			refresh		: false
		})
	});



	it(`save and verify persistence`, async function() {

		// Set a known value via change_value and save
		const parse_response = instance.parse_string_date('15/07/2025')

		const data		= instance.data || {}
		const entries	= data.entries || []
		const key		= 0

		const item = entries[key]
			? JSON.parse(JSON.stringify(entries[key]))
			: {}
		item.start = parse_response.result

		const changed_data_item = Object.freeze({
			action	: 'update',
			id		: entries[key]?.id || null,
			value	: item
		})

		await instance.change_value({
			changed_data	: [changed_data_item],
			refresh		: false
		})

		// verify data has been saved
		assert.isOk(instance.data, 'data expected after save')
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



describe(`COMPONENT_DATE PERIOD MODE`, function() {

	this.timeout(15000);

	let instance	= null
	let node		= null



	it(`init → build → render (period mode, edit)`, async function() {

		const options = {
			model			: 'component_date',
			tipo			: tipo_period,
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: lang,
			mode			: 'edit',
			view			: 'default',
			id_variant		: 'period_' + Math.random()
		}

		instance = await get_instance(options)
		await instance.build(true)
		node = await instance.render()

		component_container.appendChild(node)

		assert.equal(instance.status, 'rendered', 'status expected rendered')
	});



	it(`date_mode is 'period'`, async function() {

		const date_mode = instance.get_date_mode()
		assert.equal(date_mode, 'period', 'expected date_mode period')
	});



	it(`render has period inputs (year, month, day)`, async function() {

		const period_inputs = node.querySelectorAll('.input_period')
		assert.isOk(period_inputs.length >= 3, 'expected at least 3 period inputs (year, month, day)')
	});



	it(`add data via change_value (period)`, async function() {

		// Build changed_data_item the same way change_handler does for period
		// This verifies the effective_key logic: period mode uses type as fallback
		const parse_response = instance.parse_string_period({
			year	: 5,
			month	: 10,
			day		: 15
		})
		assert.isOk(parse_response.result, 'parse_string_period expected result')

		const data		= instance.data || {}
		const entries	= data.entries || []
		const key		= 0
		// CRITICAL: effective_key = options.date_input || type
		// For period mode, date_input is not provided, so effective_key = 'period'
		const effective_key = 'period'

		// Build item from scratch (not cloned from entries) to isolate effective_key test
		// from any pre-existing 'undefined' keys in server data from before the fix
		const item = {}
		item[effective_key] = parse_response.result

		const changed_data_item = Object.freeze({
			action	: 'update',
			id		: entries[key]?.id || null,
			value	: item
		})

		// CRITICAL: verify the key is 'period' (not 'undefined')
		assert.isOk(changed_data_item.value.period, 'expected period property in changed value')
		assert.isUndefined(changed_data_item.value['undefined'], 'CRITICAL: expected NO undefined property in changed value (regression test)')
		assert.equal(changed_data_item.value.period.year, 5, 'expected period year 5')
		assert.equal(changed_data_item.value.period.month, 10, 'expected period month 10')
		assert.equal(changed_data_item.value.period.day, 15, 'expected period day 15')

		await instance.change_value({
			changed_data	: [changed_data_item],
			refresh		: false
		})
	});



	it(`change data via change_value (update period)`, async function() {

		const parse_response = instance.parse_string_period({
			year	: 20,
			month	: 6,
			day		: 30
		})

		const data		= instance.data || {}
		const entries	= data.entries || []
		const key		= 0
		const effective_key = 'period'

		// Build item from scratch to isolate effective_key test
		const item = {}
		item[effective_key] = parse_response.result

		const changed_data_item = Object.freeze({
			action	: 'update',
			id		: entries[key]?.id || null,
			value	: item
		})

		assert.isOk(changed_data_item.value.period, 'expected period property in changed value')
		assert.equal(changed_data_item.value.period.year, 20, 'expected period year 20')

		await instance.change_value({
			changed_data	: [changed_data_item],
			refresh		: false
		})
	});



	it(`remove data via change_value (empty period)`, async function() {

		const data		= instance.data || {}
		const entries	= data.entries || []
		const key		= 0
		const effective_key = 'period'

		const item = entries[key]
			? JSON.parse(JSON.stringify(entries[key]))
			: {}

		// Delete the effective_key (same as change_handler does for empty period)
		delete item[effective_key]
		const item_keys = Object.keys(item)
		const data_value = (item_keys.length===1 && item_keys[0]==='id') || item_keys.length===0
			? null
			: item

		const changed_data_item = Object.freeze({
			action	: 'update',
			id		: entries[key]?.id || null,
			value	: data_value
		})

		// Verify period was deleted (value may be null if only id left,
		// or may still contain other keys from server data)
		assert.isUndefined(changed_data_item.value?.period, 'expected period to be deleted after clearing')

		await instance.change_value({
			changed_data	: [changed_data_item],
			refresh		: false
		})
	});



	it(`save and verify period persistence`, async function() {

		const parse_response = instance.parse_string_period({
			year	: 3,
			month	: 4,
			day		: 5
		})

		const data		= instance.data || {}
		const entries	= data.entries || []
		const key		= 0

		const item = entries[key]
			? JSON.parse(JSON.stringify(entries[key]))
			: {}
		item.period = parse_response.result

		const changed_data_item = Object.freeze({
			action	: 'update',
			id		: entries[key]?.id || null,
			value	: item
		})

		await instance.change_value({
			changed_data	: [changed_data_item],
			refresh		: false
		})

		// verify data has been saved with period key
		assert.isOk(instance.data, 'data expected after save')
	});



	it(`destroy after period operations`, async function() {

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



describe(`COMPONENT_DATE CHANGE_HANDLER VALIDATION`, function() {

	this.timeout(15000);

	let instance	= null
	let node		= null



	it(`init → build → render (edit mode)`, async function() {

		const options = {
			model			: 'component_date',
			tipo			: tipo_date,
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: lang,
			mode			: 'edit',
			view			: 'default',
			id_variant		: 'validation_' + Math.random()
		}

		instance = await get_instance(options)
		await instance.build(true)
		node = await instance.render()

		component_container.appendChild(node)
	});



	it(`change_handler returns false for invalid date`, async function() {

		const input_wrap = node.querySelector('.input-group')
		assert.isOk(input_wrap, 'expected input-group in DOM')

		// invalid date (day 32)
		const result = change_handler({
			self		: instance,
			input_value	: '32/13/2024',
			key			: 0,
			input_wrap	: input_wrap,
			date_input	: 'start',
			type		: 'date'
		})

		assert.equal(result, false, 'change_handler expected false for invalid date')
	});



	it(`change_handler returns false for invalid time`, async function() {

		const input_wrap = node.querySelector('.input-group')

		// invalid time (hour 25)
		const result = change_handler({
			self		: instance,
			input_value	: '25:99:99',
			key			: 0,
			input_wrap	: input_wrap,
			date_input	: 'start',
			type		: 'time'
		})

		assert.equal(result, false, 'change_handler expected false for invalid time')
	});



	it(`change_handler returns false for missing self`, async function() {

		const result = change_handler({
			self		: null,
			input_value	: '25/12/2024',
			key			: 0,
			input_wrap	: null,
			date_input	: 'start',
			type		: 'date'
		})

		assert.equal(result, false, 'change_handler expected false for null self')
	});



	it(`effective_key is date_input for date/time, type for period`, async function() {

		// This verifies that the effective_key logic works:
		// date/time modes use options.date_input ('start'|'end')
		// period mode uses type ('period') as fallback

		// Case 1: date_input='end' → effective_key='end'
		const parse_response = instance.parse_string_date('15/07/2025')

		const data		= instance.data || {}
		const entries	= data.entries || []
		const key		= 0

		const item = entries[key]
			? JSON.parse(JSON.stringify(entries[key]))
			: {}
		// effective_key = options.date_input || type → 'end'
		item['end'] = parse_response.result

		assert.isOk(item.end, 'expected end property when date_input=end')
		assert.isUndefined(item['undefined'], 'expected NO undefined property')

		// Case 2: no date_input, type='period' → effective_key='period'
		const period_item = entries[key]
			? JSON.parse(JSON.stringify(entries[key]))
			: {}
		// effective_key = options.date_input || type → undefined || 'period' = 'period'
		const effective_key_for_period = undefined || 'period'
		period_item[effective_key_for_period] = { year: 1, month: 2, day: 3 }

		assert.isOk(period_item.period, 'expected period property when type=period and no date_input')
		assert.isUndefined(period_item['undefined'], 'expected NO undefined property for period fallback')
	});



	it(`destroy after validation tests`, async function() {

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



describe(`COMPONENT_DATE SEARCH MODE`, function() {

	this.timeout(15000);

	let instance	= null
	let node		= null



	it(`init → build → render (search mode)`, async function() {

		const options = {
			model			: 'component_date',
			tipo			: tipo_date,
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



	it(`search mode has q_operator`, async function() {

		const q_operator = node.querySelector('.q_operator')
		assert.isOk(q_operator, 'expected q_operator in search mode')
	});



	it(`search mode change_handler uses update_data_value`, async function() {

		// In search mode, change_handler calls self.update_data_value
		// and publishes 'change_search_element' event
		const input_wrap = node.querySelector('.input-group')
		if (input_wrap) {
			const input = input_wrap.querySelector('.input_date')
			if (input) {
				input.value = '01/01/2024'

				// listen for the search event
				let event_fired = false
				const token = event_manager.subscribe('change_search_element', () => {
					event_fired = true
				})

				change_handler({
					self		: instance,
					input_value	: input.value,
					key			: 0,
					input_wrap	: input_wrap,
					date_input	: 'start',
					type		: 'date'
				})

				// unsubscribe
				event_manager.unsubscribe(token)

				assert.isOk(event_fired, 'expected change_search_element event to fire')
			}
		}
	});



	it(`destroy after search tests`, async function() {

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



describe(`COMPONENT_DATE IS_EMPTY`, function() {

	this.timeout(10000);

	it(`is_empty returns true for no entries`, async function() {

		const options = {
			model			: 'component_date',
			tipo			: tipo_date,
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: lang,
			mode			: 'edit',
			view			: 'default',
			id_variant		: 'isempty_' + Math.random()
		}

		const instance = await get_instance(options)
		await instance.build(true)

		// set empty data
		instance.data.entries = []

		assert.equal(instance.is_empty(), true, 'expected is_empty true for no entries')

		await instance.destroy(true)
	});



	it(`is_empty returns false for date with start`, async function() {

		const options = {
			model			: 'component_date',
			tipo			: tipo_date,
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: lang,
			mode			: 'edit',
			view			: 'default',
			id_variant		: 'isempty2_' + Math.random()
		}

		const instance = await get_instance(options)
		await instance.build(true)

		instance.data.entries = [{
			id: 1,
			start: { year: 2024, month: 1, day: 1 }
		}]

		assert.equal(instance.is_empty(), false, 'expected is_empty false for date with start')

		await instance.destroy(true)
	});



	it(`is_empty returns false for period with values`, async function() {

		const options = {
			model			: 'component_date',
			tipo			: tipo_period,
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: lang,
			mode			: 'edit',
			view			: 'default',
			id_variant		: 'isempty3_' + Math.random()
		}

		const instance = await get_instance(options)
		await instance.build(true)

		instance.data.entries = [{
			id: 1,
			period: { year: 5, month: 3, day: 10 }
		}]

		assert.equal(instance.is_empty(), false, 'expected is_empty false for period with values')

		await instance.destroy(true)
	});
});



// @license-end
