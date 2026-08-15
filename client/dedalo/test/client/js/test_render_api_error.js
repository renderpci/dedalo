// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, get_label */
/*eslint no-undef: "error"*/
'use strict';

/**
* TEST_RENDER_API_ERROR
* The one renderer (core/common/js/render_api_error.js): text resolution and
* the four surfaces.
*
* WHY THESE ASSERTIONS. (1) The user reads the LABEL, not the server's English:
* `error_text` is asserted label → `${param}` / `%s` filled → message → code, in
* that order, with the label planted on `get_label` and removed again. (2) XSS:
* an `error.message` is server text and a `details` value can be typed by a
* user, so every surface is asserted to render `<img src=x onerror=…>` as TEXT —
* the DOM contains no <img> and the exact string is the textContent. (3) The
* panel always shows the request_id line: it is the only join key with the
* server log. (4) The debug suffix appears ONLY under SHOW_DEBUG.
*/

import {
	error_text,
	error_debug_suffix,
	render_error_toast,
	render_error_inline,
	render_error_panel,
	render_error_modal
} from '../../../core/common/js/render_api_error.js'
import {ApiError, CLIENT_ERROR} from '../../../core/common/js/api_error.js'
import {event_manager} from '../../../core/common/js/event_manager.js'



const XSS = '<img src=x onerror="window.__xss_fired=true">'

// with_label — plant a label on the page global for the duration of fn
	const with_label = async (key, value, fn) => {
		const had = Object.prototype.hasOwnProperty.call(get_label, key)
		const old = get_label[key]
		get_label[key] = value
		try {
			await fn()
		} finally {
			if (had) get_label[key] = old
			else delete get_label[key]
		}
	}

// with_debug — flip SHOW_DEBUG for the duration of fn
	const with_debug = async (value, fn) => {
		const old = window.SHOW_DEBUG
		window.SHOW_DEBUG = value
		try {
			await fn()
		} finally {
			window.SHOW_DEBUG = old
		}
	}



describe('RENDER_API_ERROR — error_text', function() {

	it('label wins: get_label[label_key] with ${param} and %s filled from details', async function() {
		await with_label('error_test_client_gate', 'Record ${section_id} of ${section_tipo} is locked', async () => {
			const text = error_text(new ApiError({code: 'record.in_use', label_key: 'error_test_client_gate', message: 'English', details: {section_id: 12, section_tipo: 'oh1'}}))
			assert.equal(text, 'Record 12 of oh1 is locked')
		})
		await with_label('error_test_client_gate', 'Field %s: %s', async () => {
			const text = error_text(new ApiError({code: 'validation.x', label_key: 'error_test_client_gate', details: {field: 'date', reason: 'not a date'}}))
			assert.equal(text, 'Field date: not a date')
		})
		await with_label('error_test_client_gate', 'Missing ${nope}', async () => {
			assert.equal(error_text(new ApiError({code: 'x.y', label_key: 'error_test_client_gate', details: {}})), 'Missing ${nope}', 'unknown placeholders stay visible')
		})
	})

	it('falls back to the English message, then to the code / client fallback', async function() {
		assert.equal(error_text(new ApiError({code: 'perm.denied', label_key: 'no_such_label_in_catalog_xyz', message: 'Insufficient permissions'})), 'Insufficient permissions')
		assert.equal(error_text(new ApiError({code: 'some.code', message: ''})), 'some.code')
		// the catalog normally HAS error_client_network; blank it to reach the built-in English
		await with_label('error_client_network', '', async () => {
			assert.equal(error_text(new ApiError({code: CLIENT_ERROR.NETWORK})), 'Network connection failed')
		})
		assert.equal(error_text(null), '')
		assert.equal(error_text('plain'), 'plain')
	})

	it('client codes resolve their error_client_* label when the catalog has it', async function() {
		await with_label('error_client_timeout', 'Tiempo agotado', async () => {
			assert.equal(error_text(new ApiError({code: CLIENT_ERROR.TIMEOUT})), 'Tiempo agotado')
		})
	})

	it('debug suffix [code · request_id] only under SHOW_DEBUG', async function() {
		const api_error = new ApiError({code: 'perm.denied', request_id: 'rq-42'})
		await with_debug(false, async () => assert.equal(error_debug_suffix(api_error), ''))
		await with_debug(true, async () => {
			assert.equal(error_debug_suffix(api_error), ' [perm.denied · rq-42]')
			assert.equal(error_debug_suffix(new ApiError({code: 'perm.denied'})), ' [perm.denied]')
		})
	})
})



describe('RENDER_API_ERROR — surfaces render text, never HTML', function() {

	// SHOW_DEBUG appends ` [code · request_id]`; the dev server ships it true, so
	// it is pinned false for the exact-text assertions and restored after each test
	let original_debug
	beforeEach(function() {
		original_debug		= window.SHOW_DEBUG
		window.SHOW_DEBUG	= false
	})
	afterEach(function() {
		window.SHOW_DEBUG = original_debug
		delete window.__xss_fired
	})

	it('render_error_toast publishes the notification event with the text (and the ApiError)', async function() {
		const seen	= []
		const token	= event_manager.subscribe('notification', (payload) => seen.push(payload))
		try {
			const payload = render_error_toast(new ApiError({code: 'x.y', message: XSS}), {remove_time: 5})
			assert.equal(seen.length, 1)
			assert.strictEqual(seen[0], payload)
			assert.equal(payload.msg, XSS)
			assert.equal(payload.type, 'error')
			assert.equal(payload.remove_time, 5)
			assert.equal(payload.api_error.code, 'x.y')
			// what page.js does with it: render_node_info is text-only — assert the
			// bubble it builds carries the string as text
			const {render_node_info} = await import('../../../core/common/js/utils/notifications.js')
			const bubble = render_node_info(payload)
			assert.isNull(bubble.querySelector('img'))
			assert.include(bubble.textContent, XSS)
		} finally {
			event_manager.unsubscribe(token)
		}
	})

	it('render_error_inline renders the message as text inside the wrapper', function() {
		const wrapper = document.createElement('div')
		document.body.appendChild(wrapper)
		try {
			render_error_inline(wrapper, new ApiError({code: 'validation.x', message: XSS}))
			const text_node = wrapper.querySelector('.component_message .text')
			assert.ok(text_node)
			assert.equal(text_node.textContent, XSS)
			assert.isNull(wrapper.querySelector('img'))
			assert.notOk(window.__xss_fired)
		} finally {
			wrapper.remove()
		}
		assert.isNull(render_error_inline(null, new ApiError({code: 'x'})))
	})

	it('render_error_panel: text-only message, ALWAYS a request_id line, reload for auth.*, home otherwise', function() {
		const panel = render_error_panel(new ApiError({code: 'perm.denied', message: XSS, request_id: 'rq-77'}))
		assert.isTrue(panel.classList.contains('page_error_container'))
		assert.equal(panel.dataset.code, 'perm.denied')
		assert.equal(panel.querySelector('h1').textContent, XSS)
		// the logo is the only <img>, and it is ours
		const imgs = panel.querySelectorAll('img')
		assert.equal(imgs.length, 1)
		assert.isTrue(imgs[0].classList.contains('icon_dedalo'))
		assert.equal(panel.querySelector('.request_id').textContent, 'request_id: rq-77')
		assert.ok(panel.querySelector('a.link.home'))
		assert.isNull(panel.querySelector('a.link.reload'))
		assert.isTrue(panel.classList.contains('no_access_error'))

		const auth = render_error_panel(new ApiError({code: 'auth.not_logged'}))
		assert.ok(auth.querySelector('a.link.reload'))
		assert.isNull(auth.querySelector('a.link.home'))
		assert.equal(auth.querySelector('.request_id').textContent, 'request_id: -', 'no server answer → still a line')

		const compat = render_error_panel(new ApiError({code: 'not_logged'}))
		assert.ok(compat.querySelector('a.link.reload'), 'COMPAT token gets the same affordance')
	})

	it('render_error_modal: text-only body with the request_id, closes cleanly', function() {
		const modal = render_error_modal(new ApiError({code: 'record.in_use', message: XSS, request_id: 'rq-m'}))
		try {
			const body = modal.querySelector('.api_error_modal') || document.querySelector('.api_error_modal')
			assert.ok(body, 'modal body rendered')
			assert.equal(body.querySelector('.text').textContent, XSS)
			assert.isNull(body.querySelector('img'))
			assert.include(body.querySelector('.request_id').textContent, 'rq-m')
			assert.notOk(window.__xss_fired)
		} finally {
			modal.remove()
		}
	})

	it('a details value with markup is rendered as text too (label path)', async function() {
		await with_label('error_test_client_gate', 'Value ${value} refused', async () => {
			const panel = render_error_panel(new ApiError({code: 'validation.x', label_key: 'error_test_client_gate', details: {value: XSS}}))
			assert.equal(panel.querySelector('h1').textContent, `Value ${XSS} refused`)
			assert.equal(panel.querySelectorAll('img').length, 1, 'only the logo')
		})
	})
})



// @license-end
