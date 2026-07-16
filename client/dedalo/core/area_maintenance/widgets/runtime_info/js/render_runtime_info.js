// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_RUNTIME_INFO
* Client renderer for the runtime_info maintenance widget (WC-030 merge of the
* former php_info + php_runtime slots).
*
* The panel surfaces the RUNNING ENGINE's runtime — the TS/Bun server, not a
* PHP interpreter. It renders exactly the payload src/core/area_maintenance/
* widgets/runtime_info.ts emits from getValue:
*   self.value = {
*     info : { engine, version, pid, platform, memory_rss, memory_heap_used, uptime_seconds },
*     environment : 'production' | 'development' | …
*   }
* plus the two working maintenance actions the server registers as apiActions
* (clear_cache_files → { cleared:[…] }, clear_session_files → { pruned:N }).
*
* There is no phpinfo(), opcache, realpath cache, PHP error-log / session-path
* or upload-chunk surface on this engine, so none of those PHP-era sections are
* rendered — the whole point of the merge was to stop the panel reading as PHP.
*/
export const render_runtime_info = function() {

	return true
}//end render_runtime_info



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param object options
* 	Sample:
* 	{
*		render_level : "full"
		render_mode : "list"
*   }
* @return HTMLElement wrapper
* 	To append to the widget body node (area_maintenance)
*/
render_runtime_info.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end list



/**
* FORMAT_RUNTIME_SUMMARY
* One human-readable line from the Bun runtime facts, e.g.
* "bun 1.3.14 · pid 4821 · darwin · RSS 96 MB · heap 41 MB · up 3h 12m".
* Falls back gracefully when a field is missing.
* @param object info
* @return string
*/
const format_runtime_summary = function(info) {

	const mb = (bytes) => {
		const n = Number(bytes)
		return isFinite(n) && n > 0 ? `${Math.round(n / (1024 * 1024))} MB` : null
	}
	const uptime = (seconds) => {
		const s = Number(seconds)
		if (!isFinite(s) || s < 0) { return null }
		const h = Math.floor(s / 3600)
		const m = Math.floor((s % 3600) / 60)
		const sec = Math.floor(s % 60)
		return h > 0 ? `${h}h ${m}m` : (m > 0 ? `${m}m ${sec}s` : `${sec}s`)
	}

	const parts = [
		info.engine && info.version ? `${info.engine} ${info.version}` : (info.engine || info.version),
		info.pid!==undefined ? `pid ${info.pid}` : null,
		info.platform || null,
		mb(info.memory_rss) ? `RSS ${mb(info.memory_rss)}` : null,
		mb(info.memory_heap_used) ? `heap ${mb(info.memory_heap_used)}` : null,
		uptime(info.uptime_seconds) ? `up ${uptime(info.uptime_seconds)}` : null
	].filter(Boolean)

	return parts.join(' · ')
}//end format_runtime_summary



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value			= self.value || {}
		const info			= value.info || {}
		const environment	= value.environment || ''

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// engine runtime — human-readable summary + full JSON detail
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'runtime_label',
			inner_html		: get_label.runtime_info || 'Engine runtime',
			parent			: content_data
		})
		const summary = format_runtime_summary(info)
		if (summary) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'runtime_summary',
				inner_html		: summary,
				parent			: content_data
			})
		}
		const info_pre = ui.create_dom_element({
			element_type	: 'pre',
			class_name		: '',
			inner_html		: JSON.stringify(info, null, 2),
			parent			: content_data
		})

	// environment (a scalar tag on this engine, not the PHP ini dump)
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'runtime_label',
			inner_html		: get_label.environment || 'Environment',
			parent			: content_data
		})
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: '',
			inner_html		: String(environment),
			parent			: content_data
		})

	// caches & sessions (in-memory cache purge + expired-session pruning actions)
		const runtime_actions = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'runtime_actions',
			parent			: content_data
		})
		render_maintenance_section(self, runtime_actions, info_pre)


	return content_data
}//end get_content_data_edit



/**
* ADD_ACTION_BUTTON
* Shared button factory: confirm → call the API → print msg → on success run
* an optional callback (typically an in-place section refresh).
* @param object o
* 	{
*		parent       : HTMLElement,   // where the button is appended
*		body_response: HTMLElement,   // where the result message is printed
*		label        : string,
*		run          : async () => api_response,   // returns {result, msg}
*		on_success   : async () => void            // optional
* 	}
* @return HTMLElement button
*/
const add_action_button = function(o) {

	const fn_submit = async (e) => {
		e.stopPropagation()

		if (!confirm(get_label.sure || 'Sure?')) {
			return
		}

		// blur button
		document.activeElement.blur()

		const api_response = await o.run()

		// SUCCESS is a truthy `result` (the TS widget_request returns
		// result:{cleared:[…]} / {pruned:N} on success and result:false on
		// failure — NOT the boolean `true` the PHP-era check assumed).
		const ok = !!(api_response && api_response.result)

		// run the success refresh FIRST (it only updates the data panel, leaving
		// body_response untouched) so the message printed below survives.
		if (ok && typeof o.on_success==='function') {
			await o.on_success()
		}

		// clear any previous message so repeated clicks don't stack
		ui.update_node_content(o.body_response, '')

		if (!ok) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'error',
				inner_html		: (api_response && api_response.msg) || ('Error: failed ' + o.label),
				parent			: o.body_response
			})
			return
		}

		// message OK
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'ok',
			inner_html		: api_response.msg || ('OK. ' + o.label),
			parent			: o.body_response
		})
	}//end fn_submit

	const button = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'light button_submit',
		inner_html		: o.label,
		parent			: o.parent
	})
	button.addEventListener('click', fn_submit)


	return button
}//end add_action_button



/**
* RENDER_MAINTENANCE_SECTION
* Builds the caches & sessions maintenance controls: the two engine-native
* actions the server registers (clear_cache_files → flush the in-memory
* ontology/tools/datalist/area/structure caches; clear_session_files → prune
* expired sessions from the TS session store). After a successful action the
* engine-runtime <pre> is refreshed in place (memory / uptime move) while the
* result message printed into body_response survives.
*
* NOTE: the PHP-era opcache reset, realpath-cache reset and upload-chunk
* cleanup buttons are gone — the Bun/TS engine has no such surfaces, so there
* is no server handler to call (WC-030).
* @param object self
* @param HTMLElement container
* @param HTMLElement info_pre - the engine-runtime <pre>, repainted after an action
* @return void
*/
const render_maintenance_section = function(self, container, info_pre) {

	// title
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'runtime_label',
			inner_html		: get_label.caches_and_sessions || 'Caches & sessions',
			parent			: container
		})

	// body_response (messages)
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// refresh helper: re-fetch the runtime facts and repaint the info <pre> so
	// memory / uptime reflect the post-action state.
		const refresh = async () => {
			self.value = await self.get_value()
			if (info_pre) {
				ui.update_node_content(info_pre, JSON.stringify((self.value||{}).info || {}, null, 2))
			}
		}

	// clear in-memory caches
		add_action_button({
			parent			: container,
			body_response	: body_response,
			label			: get_label.clear_cache_files || 'Clear caches',
			run				: () => self.clear_cache_files(),
			on_success		: refresh
		})

	// prune expired sessions
		add_action_button({
			parent			: container,
			body_response	: body_response,
			label			: get_label.clear_session_files || 'Clear expired sessions',
			run				: () => self.clear_session_files(),
			on_success		: refresh
		})

	// container
		container.appendChild(body_response)
}//end render_maintenance_section



// @license-end
