// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, beforeEach, afterEach */
/*eslint no-undef: "error"*/
'use strict';



import {ui} from '../../../core/common/js/ui.js'
// (!) ORDER MATTERS: inspector.js and render_inspector.js are a cycle, and
// inspector.js's top-level `render_inspector.prototype.edit` read needs
// render_inspector.js finished — so the cycle's entry point is imported FIRST
// (a side-effect import). The page always loads it that way; only a test can
// get it backwards.
import '../../../core/inspector/js/inspector.js'
import {load_block} from '../../../core/inspector/js/render_inspector.js'



/**
* TEST_INSPECTOR_LOADING
* The ONE loading affordance of the inspector's server-loaded blocks (relations,
* latest changes, component history) is load_block.
*
* The bug it pins: the blocks emptied or dimmed an EMPTY body and then awaited the
* round trip, so on a busy server or a slow network the click looked dead. The
* contract here is the ORDER — the shared placeholder + spinner are in the DOM
* before the task's promise resolves (on the click tick), not after — plus
* deterministic teardown and the serialization that keeps a queued trigger from
* racing the in-flight one.
*
* And the second half of the same contract: NOT LOADING TWICE. A block's `key`
* names the content it shows, so a re-open of the same identity reuses the DOM
* (or joins the load already in flight) and asks the server nothing; only
* `reload:true` — a save, a section re-render, a page turn — goes back. A failed
* load is not remembered as loaded.
*
* Backend-free: the task is the caller's own promise.
*/



// the placeholder swap happens on a requestAnimationFrame inside the helper
	const next_frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))



describe(`INSPECTOR BLOCK LOADING`, function() {

	this.timeout(5000)

	// scratch container on the test page's content node
	let container = null
	beforeEach(() => {
		container = ui.create_dom_element({
			element_type	: 'div',
			parent			: document.getElementById('content')
		})
	})
	afterEach(() => {
		container.remove()
	})


	it(`placeholder + spinner appear BEFORE the task settles`, async function() {

		let resolve_task
		const pending = new Promise(resolve => { resolve_task = resolve })
		const node = ui.create_dom_element({ element_type: 'span', class_name: 'result', text_content: 'ok' })

		const promise = load_block({ container, label: 'Relations', task: () => pending })

		// synchronous: the click tick already shows the wait
		assert.isOk(container.querySelector('.container_placeholder'), 'placeholder present while the task runs')
		assert.isOk(container.querySelector('.spinner'), 'spinner present while the task runs')
		assert.equal(container.getAttribute('aria-busy'), 'true', 'container reports aria-busy')

		resolve_task(node)
		await promise
		await next_frame()

		assert.isNotOk(container.querySelector('.container_placeholder'), 'placeholder replaced by the result')
		assert.isOk(container.querySelector('.result'), 'the task node is in the container')
		assert.isNull(container.getAttribute('aria-busy'), 'aria-busy released after the load')
	})


	it(`a failed task surfaces the engine error panel and still clears the state`, async function() {

		await load_block({
			container	: container,
			label		: 'Relations',
			task		: async () => { throw new Error('server busy') }
		})
		await next_frame()

		assert.isNotOk(container.querySelector('.container_placeholder'), 'placeholder gone after a failure')
		assert.isNotNull(container.querySelector('.api_error_panel'), 'the error panel took its place')
		assert.isNull(container.getAttribute('aria-busy'), 'aria-busy released after a failure')
	})


	it(`a trigger during an in-flight load is SERIALIZED, not raced`, async function() {

		const order = []
		let resolve_first
		const first = new Promise(resolve => { resolve_first = resolve })

		const a = load_block({
			container	: container,
			label		: 'Relations',
			task		: async () => { order.push('a'); await first; return ui.create_dom_element({ element_type: 'span' }) }
		})
		const b = load_block({
			container	: container,
			label		: 'Relations',
			task		: async () => { order.push('b'); return ui.create_dom_element({ element_type: 'span' }) }
		})

		// the second task must not start while the first is running
		assert.deepEqual(order, ['a'], 'only the first task started')

		resolve_first()
		await Promise.all([a, b])

		assert.deepEqual(order, ['a', 'b'], 'the queued load ran after the first')
		assert.isNull(container.getAttribute('aria-busy'), 'aria-busy released once the queue drained')
	})


	it(`the SAME key is never requested twice: the second open reuses the DOM`, async function() {

		let calls = 0
		const node = ui.create_dom_element({ element_type: 'span', class_name: 'result', text_content: 'ok' })
		const task = () => { calls++; return Promise.resolve(node) }

		await load_block({ container, label: 'Relations', key: 'test3_1', task })
		await next_frame()
		assert.equal(calls, 1, 'first open asked the server')
		assert.isOk(container.querySelector('.result'), 'content is displayed')

		await load_block({ container, label: 'Relations', key: 'test3_1', task })
		assert.equal(calls, 1, 're-opening the SAME record asked nothing')
		assert.isOk(container.querySelector('.result'), 'and the displayed content is still there')
	})


	it(`an in-flight load of the same key is JOINED, not duplicated`, async function() {

		let calls = 0
		let resolve_task
		const pending = new Promise(resolve => { resolve_task = resolve })
		const task = () => { calls++; return pending }

		const first = load_block({ container, label: 'Relations', key: 'test3_1', task })
		const second = load_block({ container, label: 'Relations', key: 'test3_1', task })
		assert.equal(calls, 1, 'one server call for two triggers of the same key')

		resolve_task(ui.create_dom_element({ element_type: 'span' }))
		await Promise.all([first, second])
		await next_frame()
		assert.equal(calls, 1, 'still one call after both settle')
	})


	it(`reload:true bypasses the key, and a different key is a new load`, async function() {

		let calls = 0
		const task = () => { calls++; return Promise.resolve(ui.create_dom_element({ element_type: 'span' })) }

		await load_block({ container, label: 'Relations', key: 'test3_1', task })
		await load_block({ container, label: 'Relations', key: 'test3_1', reload: true, task })
		assert.equal(calls, 2, 'a forced reload asks again')

		await load_block({ container, label: 'Relations', key: 'test3_2', task })
		assert.equal(calls, 3, 'a different record is a new load')
	})


	it(`a FAILED load is not remembered as loaded`, async function() {

		let calls = 0
		const task = () => {
			calls++
			return calls===1
				? Promise.reject(new Error('server busy'))
				: Promise.resolve(ui.create_dom_element({ element_type: 'span', class_name: 'result' }))
		}

		await load_block({ container, label: 'Relations', key: 'test3_1', task })
		await next_frame()
		assert.isNotNull(container.querySelector('.api_error_panel'), 'the failure is on screen')

		await load_block({ container, label: 'Relations', key: 'test3_1', task })
		await next_frame()
		assert.equal(calls, 2, 'the next open asked again instead of reusing the failure')
		assert.isOk(container.querySelector('.result'), 'and recovered')
	})
})
