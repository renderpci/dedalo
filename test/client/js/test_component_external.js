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



// element options for component_external
	const element = elements.find(el => el.model==='component_external')
	if (!element) {
		console.error('Error: component_external not found in elements');
	}

	const section_tipo	= element.section_tipo
	const section_id	= element.section_id
	const tipo			= element.tipo  // test215
	const lang			= element.lang



// DOM containers
const container = document.getElementById('content');

const component_container = ui.create_dom_element({
	element_type	: 'div',
	class_name		: 'component_container',
	parent			: container
})



// mode/view matrix for component_external
// edit: default, line, mini
// list: default, line, text
	const mode_view_pairs = [
		{ mode: 'edit',	view: 'default'	},
		{ mode: 'edit',	view: 'line'	},
		{ mode: 'edit',	view: 'mini'	},
		{ mode: 'list',	view: 'default'	},
		{ mode: 'list',	view: 'line'	},
		{ mode: 'list',	view: 'text'	}
	]



describe(`COMPONENT_EXTERNAL LIFECYCLE`, function() {

	this.timeout(15000);



	// LIFECYCLE TESTS: init, build, render, destroy across all mode/view pairs
	for (let i = 0; i < mode_view_pairs.length; i++) {

		const pair = mode_view_pairs[i]

		describe(`${pair.mode} / ${pair.view}`, function() {

			let instance = null
			let node	 = null

			it(`init → build → render`, async function() {

				const options = {
					model			: 'component_external',
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

					assert.equal(instance.model, 'component_external', 'model expected component_external')
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

				component_container.appendChild(node)

				// mode-specific assertions
					if (pair.mode==='edit' && pair.view==='default') {
						// edit default: content_data exists
						assert.isOk(node.querySelector('.content_data'), 'expected content_data in edit/default')
					}

					if (pair.mode==='edit' && pair.view==='line') {
						// edit line: content_data exists, view_line class
						assert.isOk(node.querySelector('.content_data'), 'expected content_data in edit/line')
						assert.isOk(node.classList.contains('view_line'), 'expected view_line class')
					}

					if (pair.mode==='edit' && pair.view==='mini') {
						// edit mini: same as default (no special mini class)
						assert.isOk(node.querySelector('.content_data'), 'expected content_data in edit/mini')
					}

					if (pair.mode==='list' && pair.view==='default') {
						// list default: wrapper with list mode class
						assert.isOk(node.classList.contains('list'), 'expected list class in list/default')
					}

					if (pair.mode==='list' && pair.view==='line') {
						// list line: span element
						assert.equal(node.nodeName, 'SPAN', 'expected SPAN node in list/line')
					}

					if (pair.mode==='list' && pair.view==='text') {
						// list text: span element
						assert.equal(node.nodeName, 'SPAN', 'expected SPAN node in list/text')
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



describe(`COMPONENT_EXTERNAL DATA OPERATIONS`, function() {

	this.timeout(15000);

	let instance	= null
	let node		= null



	it(`init → build → render (edit mode, permissions=2)`, async function() {

		const options = {
			model			: 'component_external',
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

		assert.equal(instance.model, 'component_external', 'model expected component_external')
		assert.equal(instance.status, 'rendered', 'status expected rendered')
		assert.isOk(instance.datum, 'datum expected')
		assert.isOk(instance.context, 'context expected')
		assert.isOk(instance.data, 'data expected')
		// entries may be empty array or undefined if remote API is unavailable
		if (instance.data.entries) {
			assert.isOk(Array.isArray(instance.data.entries), 'data.entries expected array')
		}
	});



	it(`data structure`, async function() {

		const data		= instance.data || {}
		const entries	= data.entries || []

		// component_external entries are strings
		if (entries.length > 0) {
			assert.isOk(typeof entries[0] === 'string', 'entry expected string type')
		}
	});



	it(`is_empty returns boolean`, async function() {

		const result = is_empty(instance)

		assert.equal(typeof result, 'boolean', 'is_empty expected boolean')
	});



	it(`instance id is set`, async function() {

		assert.isOk(instance.id, 'instance.id expected to be set')
		assert.equal(typeof instance.id, 'string', 'instance.id expected string')
	});



	it(`refresh rebuilds component`, async function() {

		await instance.refresh()

		assert.equal(instance.status, 'rendered', 'status expected rendered after refresh')
		assert.isOk(instance.node instanceof Element, 'node expected DOM Element after refresh')
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
