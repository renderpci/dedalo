// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, beforeEach, afterEach, get_label */
/*eslint no-undef: "error"*/
'use strict';



import {ui} from '../../../core/common/js/ui.js'
import {data_manager} from '../../../core/common/js/data_manager.js'
// (!) ORDER MATTERS: inspector.js first (see test_inspector_loading.js).
import '../../../core/inspector/js/inspector.js'
import {
	load_record_info,
	fill_record_info_nodes,
	format_record_info_date
} from '../../../core/inspector/js/render_inspector.js'



/**
* TEST_INSPECTOR_RECORD_INFO
* The inspector's Created / Modified / Published rows load from their OWN
* request (dd_utils_api::get_record_info) after the section renders — never from
* the section read. Pins: the request shape, text-only rendering (a user name is
* data, never markup), the state line, the per-record cache, the reserved row height (no
* jump) released on fill AND on failure, and that a response
* landing after the panel moved on is dropped.
* Backend-free: data_manager.request patched on the shared singleton.
*/



describe(`INSPECTOR RECORD INFO`, function() {

	this.timeout(5000)

	let container = null
	let original_request = null
	const make_nodes = () => {
		const node = () => ui.create_dom_element({ element_type: 'span', parent: container })
		return { created: node(), modified: node(), published: node() }
	}
	const make_self = (section_id) => ({
		caller : { section_tipo: 'test3', section_id, mode: 'edit' },
		element_info_container : { record_info_nodes: make_nodes() }
	})
	const payload = {
		created		: { date: '2026-01-02 03:04:05', user_id: 7, user_name: '<b>ann</b>' },
		modified	: null,
		publication	: {
			first	: { date: '2025-12-31 00:00:00', user_id: 8, user_name: null },
			last	: { date: '2026-02-01 10:00:00', user_id: 9, user_name: 'bob' },
			state	: 'unpublished'
		}
	}

	beforeEach(() => {
		container = ui.create_dom_element({ element_type: 'div', parent: document.getElementById('content') })
		original_request = data_manager.request
	})
	afterEach(() => {
		data_manager.request = original_request
		container.remove()
	})


	it(`formats the server stamp as DD-MM-YYYY HH:MM:SS`, function() {
		assert.equal(format_record_info_date('2026-01-02 03:04:05'), '02-01-2026 03:04:05')
		assert.equal(format_record_info_date('2026-01-02'), '02-01-2026')
		assert.isNull(format_record_info_date(null))
	})


	it(`fills text only — markup in a user name is not parsed`, function() {
		const nodes = make_nodes()
		fill_record_info_nodes(nodes, payload)
		assert.isNull(nodes.created.querySelector('b'), 'no element from the user name')
		assert.include(nodes.created.textContent, '<b>ann</b>')
		assert.include(nodes.created.textContent, '02-01-2026 03:04:05')
		assert.equal(nodes.modified.textContent, '-')
		assert.include(nodes.published.textContent, '#8', 'unnamed user shown by id')
		assert.include(nodes.published.textContent, 'bob')
		assert.include(nodes.published.textContent, get_label.unpublished || 'Unpublished')
	})


	it(`no ledger rows → Never`, function() {
		const nodes = make_nodes()
		fill_record_info_nodes(nodes, { created: null, modified: null, publication: { first: null, last: null, state: null } })
		assert.equal(nodes.published.textContent, get_label.never || 'Never')
	})


	it(`one request per record; the cache answers the second call`, async function() {
		const calls = []
		data_manager.request = async (options) => {
			calls.push(options.body)
			return { data: true, record_info: payload }
		}
		const self = make_self(5)
		await load_record_info(self)
		await load_record_info(self)
		assert.equal(calls.length, 1)
		assert.equal(calls[0].dd_api, 'dd_utils_api')
		assert.equal(calls[0].action, 'get_record_info')
		assert.deepEqual(calls[0].options, { section_tipo: 'test3', section_id: 5 })
		assert.include(self.element_info_container.record_info_nodes.created.textContent, 'ann')
	})


	it(`a response for a record the inspector left is dropped`, async function() {
		let resolve_request
		data_manager.request = () => new Promise(resolve => { resolve_request = resolve })
		const self = make_self(5)
		const nodes = self.element_info_container.record_info_nodes
		const pending = load_record_info(self)
		self.caller.section_id = 6 // paginated away while in flight
		resolve_request({ data: true, record_info: payload })
		assert.isNull(await pending)
		assert.equal(nodes.created.textContent, '', 'stale payload not written')
	})


	it(`fill releases the reserved height (no stuck min-height / loading)`, function() {
		const nodes = make_nodes()
		for (const node of Object.values(nodes)) {
			node.classList.add('loading')
			node.style.minHeight = '40px'
		}
		fill_record_info_nodes(nodes, payload)
		for (const node of Object.values(nodes)) {
			assert.isFalse(node.classList.contains('loading'))
			assert.equal(node.style.minHeight, '')
		}
	})


	it(`only a row waiting on screen fades in`, function() {
		const nodes = make_nodes() // attached: a row waiting on screen
		nodes.created.classList.add('loading')
		nodes.modified.remove()
		nodes.modified.classList.add('loading') // detached: the cache path
		fill_record_info_nodes(nodes, payload)
		assert.isTrue(nodes.created.classList.contains('fade_in'), 'attached + waiting → fade')
		assert.isFalse(nodes.modified.classList.contains('fade_in'), 'detached → at once')
		assert.isFalse(nodes.published.classList.contains('fade_in'), 'not waiting → at once')
	})


	it(`a failed load releases the reservation to the empty values`, async function() {
		data_manager.request = async () => ({ data: false })
		const self = make_self(5)
		const nodes = self.element_info_container.record_info_nodes
		nodes.published.classList.add('loading')
		assert.isNull(await load_record_info(self))
		assert.isFalse(nodes.published.classList.contains('loading'))
		assert.equal(nodes.published.textContent, get_label.never || 'Never')
	})


	it(`unsaved record / non-edit mode → no request`, async function() {
		let called = false
		data_manager.request = async () => { called = true; return {} }
		assert.isNull(await load_record_info(make_self(null)))
		const self = make_self(3)
		self.caller.mode = 'list'
		assert.isNull(await load_record_info(self))
		assert.isFalse(called)
	})
})
