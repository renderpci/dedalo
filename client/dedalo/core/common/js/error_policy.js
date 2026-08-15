// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEBUG */
/*eslint no-undef: "error"*/



/**
* ERROR_POLICY
* PURE table: which UI action an ApiError code calls for. No DOM, no page
* globals — the actions are executed by error_dispatch.js.
*
* Resolution: exact code → `<domain>.*` → `'*'`. Tools/areas register their own
* domains at module load with `register_error_policy` (additive; a core code
* can never be overridden — a tool that wants to soften `auth.not_logged` is a
* bug, and it throws under SHOW_DEBUG so it is found in development).
*
* Actions:
*   relogin        the session died under a working page → re-login overlay, then retry
*   no_access_page the user holds no grant → full no-access page (label no_access_page)
*   page_panel     the page itself cannot be built (bad tipo/context) → error panel
*   csrf_retry     transport-level: data_manager already resent once; nothing to show
*   toast          transient bubble (severity from the entry, else the error's)
*   modal          the user must acknowledge (record in use, …)
*   inline         message inside the caller's own wrapper (validation)
*   silent         nothing to show (caller aborts, lock-state chatter)
*
* COMPAT: the bare v1 tokens (`not_logged`, `csrf_failed`, `not_authorized`)
* alias their v2 codes for the window in which the server still emits them.
* REMOVAL CONDITION: client_error_contract_tripwire census = 0.
*/

export const ERROR_ACTIONS = Object.freeze([
	'relogin', 'no_access_page', 'page_panel', 'csrf_retry', 'toast', 'modal', 'inline', 'silent'
])

/**
* CORE_POLICY
* code | `<domain>.*` | '*' → {action, label?, severity?}
*/
export const CORE_POLICY = Object.freeze({
	// session
	'auth.not_logged'			: {action:'relogin'},
	'not_logged'				: {action:'relogin'},			// COMPAT v1 alias
	'auth.csrf_failed'			: {action:'csrf_retry'},
	'csrf_failed'				: {action:'csrf_retry'},		// COMPAT v1 alias
	// permission
	'perm.denied'				: {action:'no_access_page', label:'no_access_page'},
	'not_authorized'			: {action:'no_access_page', label:'no_access_page'},	// COMPAT v1 alias
	'perm.*'					: {action:'no_access_page', label:'no_access_page'},
	// the page cannot be built
	'request.invalid_tipo'		: {action:'page_panel'},
	'request.invalid_context'	: {action:'page_panel'},
	// conflicts the user must see
	'record.in_use'				: {action:'modal'},
	// NOTICE code (a SUCCESS carries it): the record stayed because a child
	// refused to go. Inline next to the list that still shows it when the caller
	// gives a wrapper (section.js delete); the page subscriber has none, so the
	// generic path degrades to a warning toast — the label carries the ids.
	'record.delete_children_refused' : {action:'inline', severity:'warning'},
	// caller-data faults belong next to the field
	'validation.*'				: {action:'inline'},
	// transport
	'client.network'			: {action:'toast', severity:'warning'},
	'client.timeout'			: {action:'toast', severity:'warning'},
	'client.offline'			: {action:'toast', severity:'warning'},
	'client.aborted'			: {action:'silent'},
	// background chatter
	'lock.update_state'			: {action:'silent'},
	// everything else
	'*'							: {action:'toast'}
})

// registered (tool/area) entries — additive, never shadowing CORE_POLICY
const registered_policy = new Map()



/**
* RESOLVE_ERROR_POLICY
* @param {ApiError|Object|string} api_error - an ApiError (or a bare code string)
* @return Object {action, label?, severity?, matched:string} — never null
*/
export const resolve_error_policy = (api_error) => {

	const code = typeof api_error==='string'
		? api_error
		: String(api_error?.code || '')

	const candidates = [code]
	const dot = code.indexOf('.')
	if (dot > 0) {
		candidates.push(code.slice(0, dot) + '.*')
	}
	candidates.push('*')

	for (const key of candidates) {
		const entry = CORE_POLICY[key] || registered_policy.get(key)
		if (entry) {
			return {...entry, matched:key}
		}
	}

	// unreachable ('*' is in CORE_POLICY) — kept so a broken table still answers
	return {action:'toast', matched:'*'}
}//end resolve_error_policy



/**
* REGISTER_ERROR_POLICY
* Additive registration for a tool/area domain (`site_builder.*`, `transcription.*`,
* an exact `transcription.model_missing`, …). Attempting to override a CORE
* key throws under SHOW_DEBUG and warns otherwise; the core entry stays.
* @param {Object} entries - {code|pattern: {action, label?, severity?}}
* @return number entries actually registered
*/
export const register_error_policy = (entries) => {

	if (!entries || typeof entries!=='object') {
		return 0
	}
	let count = 0
	for (const [key, entry] of Object.entries(entries)) {
		if (Object.prototype.hasOwnProperty.call(CORE_POLICY, key)) {
			const msg = `register_error_policy: '${key}' is a core policy and cannot be overridden`
			if (typeof SHOW_DEBUG!=='undefined' && SHOW_DEBUG===true) {
				throw new Error(msg)
			}
			console.warn(msg)
			continue
		}
		if (!entry || typeof entry!=='object' || !ERROR_ACTIONS.includes(entry.action)) {
			const msg = `register_error_policy: '${key}' needs an action in ${ERROR_ACTIONS.join('|')}`
			if (typeof SHOW_DEBUG!=='undefined' && SHOW_DEBUG===true) {
				throw new Error(msg)
			}
			console.warn(msg)
			continue
		}
		registered_policy.set(key, {...entry})
		count++
	}

	return count
}//end register_error_policy



/**
* UNREGISTER_ERROR_POLICY
* Test/teardown helper: forget registered (non-core) keys.
* @param {Array<string>} keys
*/
export const unregister_error_policy = (keys = []) => {
	for (const key of keys) {
		registered_policy.delete(key)
	}
}//end unregister_error_policy



// @license-end
