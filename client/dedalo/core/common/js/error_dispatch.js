// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, get_label, SHOW_DEBUG */
/*eslint no-undef: "error"*/



/**
* ERROR_DISPATCH
* Executes the policy for an ApiError: `handle_api_error(api_error, ctx)` →
* Promise<{recovered:boolean}>. Callers that can retry (component save,
* build_autoload) just `await` it: `recovered:true` means the cause is gone
* (the user re-logged in) and the call may be repeated; `false` means it was
* shown/handled and the caller stops.
*
* Owns the relogin-then-retry recovery: ONE overlay per session loss no matter
* how many requests failed at once, resolved for all of them by the single
* 'login_successful' event.
*
* COMPAT (REMOVAL CONDITION: client_error_contract_tripwire census = 0):
* page.js / common.js still read `page_globals.api_errors[]` (legacy
* `{error, msg, trace}` entries) to draw the page panel, so the page-level
* actions ALSO push the legacy shape next to the new `page_globals.page_error`.
*/

// imports
	import {event_manager} from './event_manager.js'
	import {is_api_error} from './api_error.js'
	import {resolve_error_policy} from './error_policy.js'
	import {
		error_text,
		render_error_toast,
		render_error_inline,
		render_error_panel,
		render_error_modal
	} from './render_api_error.js'



// relogin_pending: the ONE in-flight relogin recovery (null when none)
let relogin_pending = null

// toast dedupe: identical toasts (same code + text) within TOAST_DEDUPE_MS
// collapse into one — data_manager did the same through request_message.
const TOAST_DEDUPE_MS	= 3000
const recent_toasts		= new Map()



/**
* GLOBALS
* page_globals is a page global set by set_environment; a Worker or a bare test
* has none.
*/
const globals = () => (typeof page_globals!=='undefined' && page_globals && typeof page_globals==='object') ? page_globals : null



/**
* SET_PAGE_ERROR
* The single page-level error slot + the legacy api_errors entry (COMPAT).
* @param {ApiError} api_error
* @param {string} legacy_type - the legacy discriminator page.js/render_common expect
* @param {string} msg
*/
const set_page_error = (api_error, legacy_type, msg) => {
	const pg = globals()
	if (!pg) return
	pg.page_error = api_error
	// COMPAT: legacy page panel input (REMOVAL: census 0)
	if (!Array.isArray(pg.api_errors)) {
		pg.api_errors = []
	}
	pg.api_errors.push({
		error	: legacy_type,
		msg		: msg,
		trace	: api_error.code + (api_error.request_id ? ' · ' + api_error.request_id : '')
	})
}//end set_page_error



/**
* DEDUPED_TOAST
* @return bool true when a toast was actually published
*/
const deduped_toast = (api_error, entry) => {
	const now	= Date.now()
	const key	= api_error.code + '|' + error_text(api_error)
	for (const [k, at] of recent_toasts) {
		if (now - at > TOAST_DEDUPE_MS) recent_toasts.delete(k)
	}
	if (recent_toasts.has(key)) {
		return false
	}
	recent_toasts.set(key, now)
	render_error_toast(api_error, entry.severity ? {type: entry.severity==='warning' ? 'warning' : 'error'} : {})
	return true
}//end deduped_toast



/**
* RELOGIN
* Opens the re-login overlay once (never a SECOND login: a page that loaded
* logged-out is already showing the form) and resolves recovered:true after the
* next 'login_successful'. Concurrent failures share the same pending promise.
* @return Promise<{recovered:boolean}>
*/
const relogin = async () => {

	const pg = globals()
	// page_globals.is_logged is the boot snapshot: a session that expires mid-use
	// still reaches the overlay — that is the whole point.
	if (!pg || pg.is_logged!==true) {
		return {recovered:false}
	}
	if (relogin_pending) {
		return relogin_pending
	}

	relogin_pending = new Promise((resolve) => {
		let token = null
		const login_successful_handler = () => {
			if (token) event_manager.unsubscribe(token)
			relogin_pending = null
			resolve({recovered:true})
		}
		token = event_manager.subscribe('login_successful', login_successful_handler)

		// dynamic import: render_login pulls the whole login family; the dispatch
		// module must stay importable by data_manager without dragging it in
		import('../../login/js/render_login.js')
			.then((module) => module.render_relogin())
			.catch((error) => {
				console.error('error_dispatch relogin: render_relogin failed', error)
				if (token) event_manager.unsubscribe(token)
				relogin_pending = null
				resolve({recovered:false})
			})
	})

	return relogin_pending
}//end relogin



/**
* HANDLE_API_ERROR
* @param {ApiError|Object} api_error
* @param {Object} [ctx] - {wrapper?:HTMLElement (inline/panel target), scope?:string, silent?:bool}
* @return Promise<{recovered:boolean, action:string}>
*/
export const handle_api_error = async (api_error, ctx = {}) => {

	if (!is_api_error(api_error)) {
		console.warn('handle_api_error: not an ApiError', api_error)
		return {recovered:false, action:'silent'}
	}

	const entry		= resolve_error_policy(api_error)
	const action	= ctx.silent===true ? 'silent' : entry.action

	if (typeof SHOW_DEBUG!=='undefined' && SHOW_DEBUG===true) {
		console.warn(`handle_api_error [${api_error.code}] → ${action}`, api_error, ctx)
	}

	switch (action) {

		case 'relogin': {
			const outcome = await relogin()
			return {...outcome, action}
		}

		case 'no_access_page': {
			const labels	= (typeof get_label!=='undefined' && get_label) ? get_label : {}
			const msg		= (entry.label && labels[entry.label]) || error_text(api_error)
			set_page_error(api_error, 'not_authorized', msg)
			if (ctx.wrapper && typeof ctx.wrapper.appendChild==='function') {
				ctx.wrapper.appendChild(render_error_panel(api_error))
			}
			return {recovered:false, action}
		}

		case 'page_panel': {
			set_page_error(api_error, 'invalid_page_element', error_text(api_error))
			if (ctx.wrapper && typeof ctx.wrapper.appendChild==='function') {
				ctx.wrapper.appendChild(render_error_panel(api_error))
			}
			return {recovered:false, action}
		}

		case 'modal': {
			render_error_modal(api_error)
			return {recovered:false, action}
		}

		case 'inline': {
			if (ctx.wrapper) {
				render_error_inline(ctx.wrapper, api_error)
			} else {
				deduped_toast(api_error, entry)
			}
			return {recovered:false, action}
		}

		case 'toast': {
			deduped_toast(api_error, entry)
			return {recovered:false, action}
		}

		case 'csrf_retry':	// data_manager already resent once; nothing to show
		case 'silent':
		default:
			return {recovered:false, action}
	}
}//end handle_api_error



/**
* RESET_ERROR_DISPATCH_STATE
* Test helper: forget the pending relogin and the toast dedupe window.
*/
export const reset_error_dispatch_state = () => {
	relogin_pending = null
	recent_toasts.clear()
}//end reset_error_dispatch_state



// @license-end
