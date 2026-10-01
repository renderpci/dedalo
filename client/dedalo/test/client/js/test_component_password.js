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



// element options for component_password
	const element = elements.find(el => el.model==='component_password')
	if (!element) {
		console.error('Error: component_password not found in elements');
	}

	const section_tipo	= element.section_tipo
	const section_id	= element.section_id
	const tipo			= element.tipo  // test152
	const lang			= element.lang



// DOM containers
const container = document.getElementById('content');

const component_container = ui.create_dom_element({
	element_type	: 'div',
	class_name		: 'component_container',
	parent			: container
})



// mode/view matrix for component_password
// edit: default, line, print
// list: default, mini, text
// search: default (uses list render)
	const mode_view_pairs = [
		{ mode: 'edit',	view: 'default'	},
		{ mode: 'edit',	view: 'line'	},
		{ mode: 'edit',	view: 'print'	},
		{ mode: 'list',	view: 'default'	},
		{ mode: 'list',	view: 'mini'	},
		{ mode: 'list',	view: 'text'	},
		{ mode: 'search',view: 'default'	}
	]



describe(`COMPONENT_PASSWORD LIFECYCLE`, function() {

	this.timeout(15000);



	// LIFECYCLE TESTS: init, build, render, destroy across all mode/view pairs
	for (let i = 0; i < mode_view_pairs.length; i++) {

		const pair = mode_view_pairs[i]

		describe(`${pair.mode} / ${pair.view}`, function() {

			let instance = null
			let node	 = null

			it(`init → build → render`, async function() {

				const options = {
					model			: 'component_password',
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

					assert.equal(instance.model, 'component_password', 'model expected component_password')
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
						// edit default: password_value input exists
						const password_value = node.querySelector('.password_value')
						assert.isOk(password_value, 'expected password_value input in edit/default')
						// content_data exists
						assert.isOk(node.querySelector('.content_data'), 'expected content_data in edit/default')
						// buttons_container exists (permissions > 1)
						assert.isOk(node.querySelector('.buttons_container'), 'expected buttons_container in edit/default')
					}

					if (pair.mode==='edit' && pair.view==='line') {
						// edit line: content_data exists, view_line class
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
						assert.equal(node.type, 'password', 'expected type=password in list/default')
					}

					if (pair.mode==='list' && pair.view==='mini') {
						// list mini: mini wrapper
						assert.isOk(node.classList.contains('mini'), 'expected mini class in list/mini')
						assert.equal(node.type, 'password', 'expected type=password in list/mini')
					}

					if (pair.mode==='list' && pair.view==='text') {
						// list text: span element
						assert.equal(node.nodeName, 'SPAN', 'expected SPAN node in list/text')
					}

					if (pair.mode==='search') {
						// search: password uses list render, no q_operator
						// wrapper has search class from mode
						assert.isOk(node.classList.contains('search') || node.type==='password', 'expected search class or password type in search/default')
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



describe(`COMPONENT_PASSWORD DATA OPERATIONS`, function() {

	this.timeout(15000);

	let instance	= null
	let node		= null



	it(`init → build → render (edit mode, permissions=2)`, async function() {

		const options = {
			model			: 'component_password',
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

		assert.equal(instance.model, 'component_password', 'model expected component_password')
		assert.equal(instance.status, 'rendered', 'status expected rendered')
		assert.isOk(instance.datum, 'datum expected')
		assert.isOk(instance.context, 'context expected')
		assert.isOk(instance.data, 'data expected')
		assert.isOk(Array.isArray(instance.data.entries), 'data.entries expected array')
	});



	it(`data structure`, async function() {

		const data		= instance.data || {}
		const entries	= data.entries || []

		// component_password entries have value (string, encrypted)
		if (entries.length > 0) {
			assert.isOk(entries[0].value !== undefined, 'entry expected value property')
		}
	});



	it(`add data via change_value (set_data)`, async function() {

		const changed_data = [Object.freeze({
			action	: 'insert',
			id		: null,
			value	: {
				value	: 'N3wP4ssw0rd!'
			}
		})]

		await instance.change_value({
			changed_data	: changed_data,
			refresh		: true
		})

		// verify entry was added
		const entries = instance.data.entries || []
		assert.isOk(entries.length > 0, 'expected at least 1 entry after insert')
	});



	it(`change data via change_value (update)`, async function() {

		const data		= instance.data || {}
		const entries	= data.entries || []
		const key		= 0

		if (entries.length > 0) {
			const changed_data = [Object.freeze({
				action	: 'update',
				id		: entries[key]?.id || null,
				value	: {
					value	: 'Upd4tedP4ss!'
				}
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
				refresh			: true,
				remove_dialog 	: () => true
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



	it(`validate_password_format validates correctly`, async function() {

		// valid password (meets every rule of the one policy: password_policy.js)
		assert.equal(instance.validate_password_format('V4l1dP4ss').valid, true, 'expected valid password')
		// invalid password (too short)
		assert.equal(instance.validate_password_format('Ab1').valid, false, 'expected too short password invalid')
		// invalid password (no uppercase)
		assert.equal(instance.validate_password_format('lower1').valid, false, 'expected no uppercase invalid')
		// invalid password (no numeric)
		assert.equal(instance.validate_password_format('NoNumber').valid, false, 'expected no numeric invalid')
		// empty password (allowed, ignored validation)
		assert.equal(instance.validate_password_format('').valid, true, 'expected empty password allowed')
		// bad word
		assert.equal(instance.validate_password_format('Password1').valid, false, 'expected bad word invalid')
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



describe(`COMPONENT_PASSWORD EDITOR (policy checklist + explicit save)`, function() {

	this.timeout(15000);

	let instance	= null
	let node		= null

	const type_into = (input, value) => {
		input.value = value
		input.dispatchEvent(new Event('input', {bubbles:true}))
	}
	const q = (sel) => node.querySelector(sel)

	it(`renders an EMPTY field, a checklist of every policy rule + match, and a disabled Save`, async function() {

		instance = await get_instance({
			model			: 'component_password',
			tipo			: tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: lang,
			mode			: 'edit',
			view			: 'default',
			id_variant		: 'editor_' + Math.random()
		})
		await instance.build(true)
		node = await instance.render()
		component_container.appendChild(node)

		assert.equal(q('.password_value').value, '', 'field expected empty (the stored hash is never a value)')
		const rules = [...node.querySelectorAll('.password_rule')].map(el => el.dataset.rule)
		assert.deepEqual(rules, ['length','lower','upper','digit','banned_chars','banned_words','sequence','match'], 'every rule expected, in policy order')
		assert.isOk(rules.every(id => node.querySelector(`[data-rule="${id}"]`).textContent.length > 0), 'every rule expected to have text')
		assert.isOk(!node.querySelector('.password_rule').textContent.includes('${'), 'rule text expected with placeholders filled')
		assert.equal(q('.password_save').disabled, true, 'Save expected disabled with nothing typed')
		assert.equal(q('.password_status').dataset.state, 'idle', 'status expected idle')
	});

	it(`paints each rule live and names the draft as not saved`, async function() {

		type_into(q('.password_value'), 'clave1234')

		const state = (id) => node.querySelector(`[data-rule="${id}"]`).dataset.state
		assert.equal(state('length'), 'ok')
		assert.equal(state('upper'), 'fail')
		assert.equal(state('banned_words'), 'fail')
		assert.equal(state('sequence'), 'fail')
		assert.equal(state('match'), 'pending', 'match expected pending until the confirm field is typed')
		assert.equal(q('.password_save').disabled, true, 'Save expected disabled while a rule fails')
		assert.equal(q('.password_status').dataset.state, 'draft', 'status expected draft (not saved yet)')
		assert.equal(window.unsaved_data, true, 'a draft expected to arm the unsaved guard')
		assert.equal((instance.data.changed_data || []).length, 0, 'a draft must NOT be changed_data (the auto-save sweep would commit it)')
	});

	it(`a mismatch keeps Save disabled; Enter refuses with the reason`, async function() {

		type_into(q('.password_value'), 'Museo-Norte-97')
		type_into(q('.password_confirm_value'), 'Museo-Norte-96')
		assert.equal(node.querySelector('[data-rule="match"]').dataset.state, 'fail')
		assert.equal(q('.password_save').disabled, true)

		q('.password_confirm_value').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}))
		assert.equal(q('.password_status').dataset.state, 'error', 'Enter on an unacceptable draft expected an error status')
	});

	it(`Save stores it and says so`, async function() {

		type_into(q('.password_confirm_value'), 'Museo-Norte-97')
		assert.equal(q('.password_save').disabled, false, 'Save expected enabled: all rules pass and both fields match')

		q('.password_save').click()
		// wait for the round trip
		for (let i = 0; i < 50 && q('.password_status').dataset.state!=='saved' && q('.password_status').dataset.state!=='error'; i++) {
			await new Promise(r => setTimeout(r, 100))
		}
		assert.equal(q('.password_status').dataset.state, 'saved', 'status expected saved: ' + q('.password_status').textContent)
		assert.equal(q('.password_value').value, '', 'field expected cleared after save')
		// the stored credential is never served: the save echo carries the mask, not the hash
		assert.equal(instance.data.entries?.[0]?.value, '****************', 'saved value expected served as the mask')
		assert.isOk(!JSON.stringify(instance.data).includes('$argon2'), 'no hash expected in client data')
	});

	it(`the server refuses a weak password with validation.password_policy`, async function() {

		const response = await instance.change_value({
			changed_data	: [Object.freeze({action:'update', id:instance.data.entries?.[0]?.id ?? null, value:{value:'weak'}})],
			refresh			: false
		})
		assert.equal(response?.ok, false, 'weak password expected refused')
		assert.equal(response?.error?.code, 'validation.password_policy')
		assert.equal(response?.error?.details?.rule, 'length')
		instance.data.changed_data = []
	});

	it(`destroy editor`, async function() {

		await instance.destroy(true)
		assert.equal(instance.status, 'destroyed')
		while (component_container.firstChild) {
			component_container.removeChild(component_container.firstChild)
		}
	});
});



describe(`COMPONENT_PASSWORD SEARCH DATA OPERATIONS`, function() {

	this.timeout(15000);

	let instance	= null
	let node		= null



	it(`init → build → render (search mode)`, async function() {

		const options = {
			model			: 'component_password',
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



	it(`search mode uses list render (no q_operator)`, async function() {

		// password search uses list render, no q_operator input
		const q_operator = node.querySelector('.q_operator')
		assert.equal(q_operator, null, 'expected no q_operator in password search mode')
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
