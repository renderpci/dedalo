// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals */
/*eslint no-undef: "error"*/
'use strict';

/**
* TEST_ERROR_POLICY
* The pure policy table (core/common/js/error_policy.js) and its executor
* (error_dispatch.js `handle_api_error`).
*
* WHY THESE ASSERTIONS. The table is what turns a CODE into what the user sees;
* the wrong row is a session loss shown as a toast, or a validation message
* shown as a full-page panel. So: exact → `<domain>.*` → `'*'` resolution is
* asserted per row the plan names, the COMPAT v1 aliases are asserted to land
* on the SAME action as their v2 code (so the window can close without a
* behaviour change), and the additive registration is asserted to refuse core
* overrides — a tool that softens `auth.not_logged` is a bug, not a feature.
*
* handle_api_error is exercised without a backend: the page-level actions only
* set `page_globals.page_error` (+ the COMPAT api_errors entry), the toast goes
* through the 'notification' event (captured, and asserted deduped), the relogin
* action is asserted NOT to open when the page is not logged in (the "never a
* SECOND login" rule) — a real overlay needs the login context from the server.
*/

import {
	CORE_POLICY,
	ERROR_ACTIONS,
	resolve_error_policy,
	register_error_policy,
	unregister_error_policy
} from '../../../core/common/js/error_policy.js'
import {handle_api_error, reset_error_dispatch_state} from '../../../core/common/js/error_dispatch.js'
import {ApiError, CLIENT_ERROR} from '../../../core/common/js/api_error.js'
import {event_manager} from '../../../core/common/js/event_manager.js'



describe('ERROR_POLICY — resolution', function() {

	it('every core entry names a known action', function() {
		for (const [key, entry] of Object.entries(CORE_POLICY)) {
			assert.include(ERROR_ACTIONS, entry.action, key)
		}
	})

	it('resolves the plan\'s rows: exact code → action', function() {
		const expected = {
			'auth.not_logged'			: 'relogin',
			'auth.csrf_failed'			: 'csrf_retry',
			'perm.denied'				: 'no_access_page',
			'request.invalid_tipo'		: 'page_panel',
			'request.invalid_context'	: 'page_panel',
			'record.in_use'				: 'modal',
			'client.network'			: 'toast',
			'client.timeout'			: 'toast',
			'client.aborted'			: 'silent',
			'lock.update_state'			: 'silent'
		}
		for (const [code, action] of Object.entries(expected)) {
			assert.equal(resolve_error_policy(code).action, action, code)
			assert.equal(resolve_error_policy(new ApiError({code})).action, action, code + ' (ApiError)')
		}
		assert.equal(resolve_error_policy('perm.denied').label, 'no_access_page')
		assert.equal(resolve_error_policy('client.network').severity, 'warning')
	})

	it('COMPAT v1 aliases land on the same action as their v2 code', function() {
		assert.equal(resolve_error_policy('not_logged').action, resolve_error_policy('auth.not_logged').action)
		assert.equal(resolve_error_policy('csrf_failed').action, resolve_error_policy('auth.csrf_failed').action)
		assert.equal(resolve_error_policy('not_authorized').action, resolve_error_policy('perm.denied').action)
	})

	it('falls through exact → <domain>.* → *', function() {
		assert.equal(resolve_error_policy('validation.date_format').action, 'inline')
		assert.equal(resolve_error_policy('validation.date_format').matched, 'validation.*')
		assert.equal(resolve_error_policy('perm.section_read').action, 'no_access_page')
		assert.equal(resolve_error_policy('internal.unexpected').action, 'toast')
		assert.equal(resolve_error_policy('internal.unexpected').matched, '*')
		assert.equal(resolve_error_policy('').matched, '*')
		assert.equal(resolve_error_policy(null).matched, '*')
	})

	it('register_error_policy is additive, wins for its own domain, and cannot override a core code', function() {
		const keys = ['site_builder.*', 'site_builder.publish_failed']
		try {
			const count = register_error_policy({
				'site_builder.*'				: {action: 'toast', severity: 'warning'},
				'site_builder.publish_failed'	: {action: 'modal'}
			})
			assert.equal(count, 2)
			assert.equal(resolve_error_policy('site_builder.publish_failed').action, 'modal')
			assert.equal(resolve_error_policy('site_builder.other').action, 'toast')
			assert.equal(resolve_error_policy('site_builder.other').matched, 'site_builder.*')

			// core override: throws under SHOW_DEBUG, warns otherwise — either way the core row stays
			const original_debug = window.SHOW_DEBUG
			try {
				window.SHOW_DEBUG = true
				assert.throws(() => register_error_policy({'auth.not_logged': {action: 'silent'}}))
				window.SHOW_DEBUG = false
				assert.equal(register_error_policy({'auth.not_logged': {action: 'silent'}}), 0)
				assert.equal(register_error_policy({'*': {action: 'silent'}}), 0)
			} finally {
				window.SHOW_DEBUG = original_debug
			}
			assert.equal(resolve_error_policy('auth.not_logged').action, 'relogin')
			assert.equal(resolve_error_policy('whatever.else').action, 'toast')

			// an unknown action is refused too
			window.SHOW_DEBUG = false
			assert.equal(register_error_policy({'x.y': {action: 'explode'}}), 0)
			window.SHOW_DEBUG = original_debug
		} finally {
			unregister_error_policy(keys.concat(['x.y']))
		}
		assert.equal(resolve_error_policy('site_builder.other').matched, '*', 'unregistered again')
	})
})



describe('ERROR_DISPATCH — handle_api_error', function() {

	// capture 'notification' events published while fn runs
	const with_notifications = async (fn) => {
		const seen	= []
		const token	= event_manager.subscribe('notification', (payload) => seen.push(payload))
		try {
			await fn(seen)
		} finally {
			event_manager.unsubscribe(token)
		}
		return seen
	}

	// SHOW_DEBUG appends ` [code · request_id]` to every rendered text; the dev
	// server ships it true, so it is pinned false here and restored after each test
	let original_debug
	beforeEach(function() {
		reset_error_dispatch_state()
		page_globals.api_errors	= []
		page_globals.page_error	= null
		original_debug			= window.SHOW_DEBUG
		window.SHOW_DEBUG		= false
	})
	afterEach(function() {
		window.SHOW_DEBUG = original_debug
	})

	it('refuses a non-ApiError (silent, not recovered)', async function() {
		assert.deepEqual(await handle_api_error({code: 'x'}), {recovered: false, action: 'silent'})
	})

	it('toast: publishes ONE notification and dedupes the identical toast within 3s', async function() {
		const seen = await with_notifications(async () => {
			const api_error = new ApiError({code: 'internal.unexpected', message: 'Something broke', request_id: 'rq'})
			assert.deepEqual(await handle_api_error(api_error), {recovered: false, action: 'toast'})
			await handle_api_error(api_error)
			await handle_api_error(new ApiError({code: 'internal.unexpected', message: 'Something broke'}))
		})
		assert.equal(seen.length, 1)
		assert.equal(seen[0].msg, 'Something broke')
		assert.equal(seen[0].type, 'error')
		assert.equal(seen[0].api_error.code, 'internal.unexpected')
	})

	it('toast severity from the policy row: client.network is a warning', async function() {
		const seen = await with_notifications(async () => {
			await handle_api_error(new ApiError({code: CLIENT_ERROR.NETWORK}))
		})
		assert.equal(seen.length, 1)
		assert.equal(seen[0].type, 'warning')
	})

	it('silent: client.aborted and lock.update_state show nothing', async function() {
		const seen = await with_notifications(async () => {
			assert.equal((await handle_api_error(new ApiError({code: CLIENT_ERROR.ABORTED}))).action, 'silent')
			assert.equal((await handle_api_error(new ApiError({code: 'lock.update_state'}))).action, 'silent')
		})
		assert.equal(seen.length, 0)
	})

	it('ctx.silent forces silence for any code', async function() {
		const seen = await with_notifications(async () => {
			assert.equal((await handle_api_error(new ApiError({code: 'internal.unexpected'}), {silent: true})).action, 'silent')
		})
		assert.equal(seen.length, 0)
	})

	it('no_access_page: sets page_globals.page_error and the COMPAT api_errors entry {error:not_authorized}', async function() {
		const api_error = new ApiError({code: 'perm.denied', message: 'Insufficient permissions', request_id: 'rq-p'})
		const outcome = await handle_api_error(api_error)
		assert.deepEqual(outcome, {recovered: false, action: 'no_access_page'})
		assert.strictEqual(page_globals.page_error, api_error)
		assert.equal(page_globals.api_errors.length, 1)
		assert.equal(page_globals.api_errors[0].error, 'not_authorized')
		assert.include(page_globals.api_errors[0].trace, 'perm.denied')
		assert.include(page_globals.api_errors[0].trace, 'rq-p')
	})

	it('no_access_page / page_panel render the panel into ctx.wrapper when given (text only)', async function() {
		const wrapper = document.createElement('div')
		await handle_api_error(new ApiError({code: 'request.invalid_tipo', message: 'Invalid tipo <b>x</b>'}), {wrapper})
		const panel = wrapper.querySelector('.page_error_container')
		assert.ok(panel)
		assert.equal(panel.dataset.code, 'request.invalid_tipo')
		assert.equal(panel.querySelector('h1').textContent, 'Invalid tipo <b>x</b>')
		assert.isNull(panel.querySelector('b'))
		assert.equal(page_globals.api_errors[0].error, 'invalid_page_element')
	})

	it('inline: renders into ctx.wrapper via ui.show_message; falls back to a toast without a wrapper', async function() {
		const wrapper = document.createElement('div')
		document.body.appendChild(wrapper)
		try {
			const outcome = await handle_api_error(new ApiError({code: 'validation.date_format', message: 'Bad date'}), {wrapper})
			assert.equal(outcome.action, 'inline')
			assert.equal(wrapper.querySelector('.component_message .text').textContent, 'Bad date')
		} finally {
			wrapper.remove()
		}
		const seen = await with_notifications(async () => {
			await handle_api_error(new ApiError({code: 'validation.other', message: 'No wrapper'}))
		})
		assert.equal(seen.length, 1)
	})

	it('relogin: never a SECOND login — resolves recovered:false without opening when the page is not logged in', async function() {
		const original = page_globals.is_logged
		try {
			page_globals.is_logged = false
			assert.deepEqual(await handle_api_error(new ApiError({code: 'auth.not_logged'})), {recovered: false, action: 'relogin'})
			assert.deepEqual(await handle_api_error(new ApiError({code: 'not_logged'})), {recovered: false, action: 'relogin'}, 'COMPAT alias')
			assert.isNull(document.querySelector('.login .overlay'), 'no overlay was appended')
		} finally {
			page_globals.is_logged = original
		}
	})

	it('csrf_retry is a no-op here (data_manager already resent once)', async function() {
		assert.deepEqual(await handle_api_error(new ApiError({code: 'auth.csrf_failed'})), {recovered: false, action: 'csrf_retry'})
	})
})



// @license-end
