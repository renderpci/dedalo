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
* Also owns the NOTICE half of the contract (ERRORS_SPEC §3): a SUCCESS
* envelope's `notices[]` go through `handle_api_notice` / `handle_api_notices`,
* the same policy table at severity 'warning' and never a page-level action —
* the request succeeded, so nothing may take the page away from the user.
*/

// imports
	import {event_manager} from './event_manager.js'
	import {ApiError, is_api_error} from './api_error.js'
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
* THE single page-level error slot: one ApiError, read by
* common.prototype.render to draw the page panel.
* @param {ApiError} api_error
*/
const set_page_error = (api_error) => {
	const pg = globals()
	if (!pg) return
	pg.page_error = api_error
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
			set_page_error(api_error)
			if (ctx.wrapper && typeof ctx.wrapper.appendChild==='function') {
				ctx.wrapper.appendChild(render_error_panel(api_error))
			}
			return {recovered:false, action}
		}

		case 'page_panel': {
			set_page_error(api_error)
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
* HANDLE_API_NOTICE
* The notice half of the contract (ERRORS_SPEC §3): a SUCCESS envelope may
* carry `notices:[{code, label_key, retryable, details}]` — a coded fact that is
* NOT a failure (a refused child delete, a degraded external source, a login
* soft warning). The request succeeded; something the caller should know did
* not go the obvious way.
*
* A notice is dispatched through the SAME policy table an ApiError is, so a
* tool/area silences or re-routes its own domain with `register_error_policy`
* (e.g. `external.*` → `silent`, because the autocomplete chip already renders
* the degradation from `source_status`). The default for a code with no entry
* of its own is the `'*'` row — a toast — at severity `warning`: a notice is
* never red.
*
* The notice is turned into an ApiError-shaped object (same fields, same
* renderer) rather than a second model: `error_text` resolves `label_key` +
* `details` exactly as it does for a failure, and every surface (toast, inline,
* modal) keeps working unchanged.
*
* @param {Object} notice - {code, label_key?, retryable?, details?}
* @param {Object} [ctx] - {wrapper?:HTMLElement, request_id?:string, silent?:bool}
* @return Promise<{recovered:boolean, action:string}>
*/
export const handle_api_notice = async (notice, ctx = {}) => {

	const api_error = api_error_from_notice(notice, ctx)
	if (!api_error) {
		console.warn('handle_api_notice: not a notice', notice)
		return {recovered:false, action:'silent'}
	}

	const entry		= resolve_error_policy(api_error)
	// A notice never re-logs-in, never takes over the page and never blocks:
	// those actions belong to a FAILED request. Anything the table answers with
	// that is not a showable surface degrades to a toast.
	const showable	= ['toast', 'modal', 'inline', 'silent']
	const action	= ctx.silent===true
		? 'silent'
		: (showable.includes(entry.action) ? entry.action : 'toast')

	if (typeof SHOW_DEBUG!=='undefined' && SHOW_DEBUG===true) {
		console.warn(`handle_api_notice [${api_error.code}] → ${action}`, notice, ctx)
	}

	switch (action) {

		case 'modal':
			render_error_modal(api_error)
			return {recovered:false, action}

		case 'inline':
			if (ctx.wrapper) {
				render_error_inline(ctx.wrapper, api_error)
				return {recovered:false, action}
			}
			deduped_toast(api_error, {severity:'warning'})
			return {recovered:false, action:'toast'}

		case 'toast':
			deduped_toast(api_error, {severity: entry.severity || 'warning'})
			return {recovered:false, action}

		case 'silent':
		default:
			return {recovered:false, action:'silent'}
	}
}//end handle_api_notice



/**
* API_ERROR_FROM_NOTICE
* Builds the ApiError-shaped carrier a notice renders through. Exported because
* a caller that renders the notice in its OWN wrapper (section.js delete) needs
* the same text resolution without going through the policy table.
* @param {Object} notice
* @param {Object} [ctx] - {request_id?:string}
* @return ApiError|null
*/
export const api_error_from_notice = (notice, ctx = {}) => {

	if (!notice || typeof notice!=='object' || typeof notice.code!=='string' || !notice.code.length) {
		return null
	}

	return new ApiError({
		code		: notice.code,
		label_key	: typeof notice.label_key==='string' ? notice.label_key : null,
		details		: notice.details,
		retryable	: notice.retryable===true,
		request_id	: typeof ctx.request_id==='string' ? ctx.request_id : null,
		severity	: 'warning',
		transport	: false,
		source		: 'envelope',
		raw			: notice
	})
}//end api_error_from_notice



/**
* HANDLE_API_NOTICES
* The page-level subscriber body: dispatch every notice of one envelope.
* @param {Object} payload - {notices:Array, api_response:Object}
* @return Promise<Array>
*/
export const handle_api_notices = async (payload = {}) => {

	const notices = Array.isArray(payload.notices) ? payload.notices : []
	const ctx = {request_id: payload.api_response?.request_id}

	const outcomes = []
	for (const notice of notices) {
		outcomes.push(await handle_api_notice(notice, ctx))
	}

	return outcomes
}//end handle_api_notices



/**
* RESET_ERROR_DISPATCH_STATE
* Test helper: forget the pending relogin and the toast dedupe window.
*/
export const reset_error_dispatch_state = () => {
	relogin_pending = null
	recent_toasts.clear()
}//end reset_error_dispatch_state



// @license-end
