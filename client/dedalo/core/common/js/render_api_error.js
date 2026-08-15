// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



/**
* RENDER_API_ERROR
* The ONE renderer for an ApiError: text resolution (label → English message →
* code) and the four surfaces (toast, inline, full page panel, modal).
*
* LAW: NEVER innerHTML. Every message reaches the DOM through `text_content` /
* text nodes — an `error.message` is server text, a `details` value can be a
* user-typed string, and a stream frame can be anything (DS-1,
* error_report_xss_tripwire). It supersedes the legacy
* `render_common.render_server_response_error` panel (DELETED at the P4 compat
* removal); its affordances (logo, reload on session loss, Home link) are kept,
* its `inner_html` sinks are not.
*/

// imports
	import {ui} from './ui.js'
	import {event_manager} from './event_manager.js'
	import {format_label} from './common.js'
	import {is_api_error, client_error_message_for} from './api_error.js'



/**
* GET_LABELS
* `get_label` is a page global set by set_environment; absent pre-login and in tests.
* @return Object
*/
const get_labels = () => (typeof get_label!=='undefined' && get_label && typeof get_label==='object') ? get_label : {}



/**
* FILL_POSITIONAL
* `%s` placeholders take the `details` values in insertion order (legacy label
* style, still present in a few catalogs). Unknown/absent values leave `%s`
* visible — a visible placeholder is a bug report, a truncated sentence is not.
* @param {string} text
* @param {Object} details
* @return string
*/
const fill_positional = (text, details) => {
	if (!text.includes('%s')) {
		return text
	}
	const values = Object.values(details || {})
	let i = 0
	return text.replace(/%s/g, (match) => (i < values.length ? String(values[i++]) : match))
}//end fill_positional



/**
* ERROR_TEXT
* The sentence to show for an ApiError, in the user's language when the label
* exists: get_label[label_key] → format_label(template, details) (`${param}` and
* `%s`) → English `message` → `code`.
* @param {ApiError|Object} api_error
* @return string
*/
export const error_text = (api_error) => {

	if (!api_error || typeof api_error!=='object') {
		return String(api_error ?? '')
	}

	const labels	= get_labels()
	const details	= (api_error.details && typeof api_error.details==='object') ? api_error.details : {}

	if (api_error.label_key && typeof labels[api_error.label_key]==='string' && labels[api_error.label_key].length) {
		return fill_positional(format_label(labels[api_error.label_key], details), details)
	}

	if (typeof api_error.message==='string' && api_error.message.length) {
		return api_error.message
	}

	return client_error_message_for(api_error.code) || String(api_error.code || '')
}//end error_text



/**
* ERROR_DEBUG_SUFFIX
* Under SHOW_DEBUG, the code and request_id ride along so a screenshot joins the
* server log. Empty string in production.
* @param {ApiError|Object} api_error
* @return string
*/
export const error_debug_suffix = (api_error) => {

	if (typeof SHOW_DEBUG==='undefined' || SHOW_DEBUG!==true || !api_error) {
		return ''
	}
	const parts = [api_error.code, api_error.request_id].filter((item) => typeof item==='string' && item.length)
	return parts.length ? ` [${parts.join(' · ')}]` : ''
}//end error_debug_suffix



/**
* SEVERITY_TYPE
* ApiError.severity → notification bubble type (render_node_info).
*/
const severity_type = (api_error) => {
	switch (api_error?.severity) {
		case 'info'		: return 'success'
		case 'warning'	: return 'warning'
		default			: return 'error'
	}
}//end severity_type



/**
* RENDER_ERROR_TOAST
* Publishes the page 'notification' event (page.js renders it through
* render_node_info, which is text-only) — the same channel data_manager's
* render_msg_to_inspector used, so no new subscriber is needed.
* @param {ApiError|Object} api_error
* @param {Object} [options] - {remove_time:number|null, type:string}
* @return Object the published payload
*/
export const render_error_toast = (api_error, options = {}) => {

	const payload = {
		msg			: error_text(api_error) + error_debug_suffix(api_error),
		type		: options.type || severity_type(api_error),
		remove_time	: options.remove_time===undefined ? 10000 : options.remove_time,
		api_error	: is_api_error(api_error) ? api_error : null
	}
	event_manager.publish('notification', payload)

	return payload
}//end render_error_toast



/**
* RENDER_ERROR_INLINE
* Shows the message inside the caller's own wrapper (component_message node).
* @param {HTMLElement} wrapper
* @param {ApiError|Object} api_error
* @return HTMLElement|null the message wrap
*/
export const render_error_inline = (wrapper, api_error) => {

	if (!wrapper || typeof wrapper.querySelector!=='function') {
		return null
	}
	const type = api_error?.severity==='warning' ? 'warning' : 'error'

	return ui.show_message(wrapper, error_text(api_error) + error_debug_suffix(api_error), type)
}//end render_error_inline



/**
* RENDER_ERROR_PANEL
* Full-page error node (detached; the caller places it). Always shows the
* request_id line — it is the only join key with the server log — and the
* affordance the code calls for: Reload for a lost session (`auth.*`), Home
* otherwise.
* @param {ApiError|Object} api_error
* @return HTMLElement
*/
export const render_error_panel = (api_error) => {

	const labels	= get_labels()
	const code		= String(api_error?.code || '')

	// error_container
		const error_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'page_error_container api_error_panel'
		})
		error_container.dataset.code = code

	// icon_dedalo
		ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'icon_dedalo',
			src				: '../../core/themes/default/dedalo_logo.svg',
			parent			: error_container
		})

	// message
		ui.create_dom_element({
			element_type	: 'h1',
			class_name		: 'server_response_error',
			text_content	: error_text(api_error),
			parent			: error_container
		})

	// request_id (always — empty when the failure never reached the server)
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'request_id',
			text_content	: 'request_id: ' + (api_error?.request_id || '-') + ((typeof SHOW_DEBUG!=='undefined' && SHOW_DEBUG===true) ? ' · ' + code : ''),
			parent			: error_container
		})

	// affordance
		if (code.startsWith('auth.') || code==='not_logged') {
			// a forced reload re-initiates the authentication handshake
			const link = ui.create_dom_element({
				element_type	: 'a',
				class_name		: 'link reload',
				text_content	: labels.reload || 'Reload',
				parent			: error_container
			})
			link.addEventListener('click', (e) => {
				e.stopPropagation()
				location.reload()
			})
			error_container.classList.add('not_logged_error')
		} else {
			const link_home = ui.create_dom_element({
				element_type	: 'a',
				class_name		: 'link home',
				href			: '../../core/page/',
				text_content	: labels.home || 'Home',
				parent			: error_container
			})
			link_home.addEventListener('click', (e) => {
				e.stopPropagation()
			})
			if (code.startsWith('perm.') || code==='not_authorized') {
				error_container.classList.add('no_access_error')
			}
		}

	return error_container
}//end render_error_panel



/**
* RENDER_ERROR_MODAL
* Opens the standard dd-modal with the message; used for answers the user must
* acknowledge (`record.in_use`, …).
* @param {ApiError|Object} api_error
* @param {Object} [options] - passed through to ui.attach_to_modal (size, on_close, …)
* @return HTMLElement the modal container
*/
export const render_error_modal = (api_error, options = {}) => {

	const labels = get_labels()

	const header = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'header content',
		text_content	: labels.error || 'Error'
	})
	const body = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'body content api_error_modal'
	})
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'text',
		text_content	: error_text(api_error),
		parent			: body
	})
	if (api_error?.request_id) {
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'request_id',
			text_content	: 'request_id: ' + api_error.request_id + error_debug_suffix(api_error),
			parent			: body
		})
	}

	return ui.attach_to_modal({
		header	: header,
		body	: body,
		size	: options.size || 'small',
		...options
	})
}//end render_error_modal



// @license-end
