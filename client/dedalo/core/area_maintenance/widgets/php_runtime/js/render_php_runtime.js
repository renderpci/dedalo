// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_PHP_RUNTIME
* Manages the component's logic and appearance in client side
*/
export const render_php_runtime = function() {

	return true
}//end render_php_runtime



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
render_php_runtime.prototype.list = async function(options) {

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
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value					= self.value || {}
		const info					= value.info || {}
		const php_error_log_path	= value.php_error_log_path || ''
		const php_session_path		= value.php_session_path || ''
		const name					= info.name || ''

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// version
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: '',
			inner_html		: `PHP user ${name}`,
			parent			: content_data
		})

	// info
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: '',
			inner_html		: JSON.stringify(info, null, 2),
			parent			: content_data
		})

	// PHP error log path
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: '',
			inner_html		: `<br>PHP error log path:`,
			parent			: content_data
		})
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: '',
			inner_html		: php_error_log_path,
			parent			: content_data
		})

	// PHP session path
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: '',
			inner_html		: `<br>PHP session path:`,
			parent			: content_data
		})
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: '',
			inner_html		: php_session_path,
			parent			: content_data
		})

	// PHP environment (version / SAPI / JIT / limits / extensions) — display only
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: '',
			inner_html		: `<br>PHP environment:`,
			parent			: content_data
		})
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: '',
			inner_html		: JSON.stringify(value.environment || {}, null, 2),
			parent			: content_data
		})

	// opcache section (status panel + reset action)
		const opcache_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'opcache_container',
			parent			: content_data
		})
		render_opcache_section(self, opcache_container)

	// caches & directories section (health panel + clear actions)
		const directories_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'directories_container',
			parent			: content_data
		})
		render_directories_section(self, directories_container)


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

		if (!confirm(get_label.seguro || 'Sure?')) {
			return
		}

		// blur button
		document.activeElement.blur()

		const api_response = await o.run()

		// run the success refresh FIRST (it only updates the data panel, leaving
		// body_response untouched) so the message printed below survives.
		if (api_response && api_response.result===true && typeof o.on_success==='function') {
			await o.on_success()
		}

		// clear any previous message so repeated clicks don't stack
		ui.update_node_content(o.body_response, '')

		if (!api_response || api_response.result!==true) {
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
* RENDER_OPCACHE_SECTION
* Builds the opcache status panel and the reset button. The skeleton is built
* once; only the data panel is refreshed after a reset so the result message
* (printed into body_response) survives the refresh.
* @param object self
* @param HTMLElement container
* @return void
*/
const render_opcache_section = function(self, container) {

	// title
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: '',
			inner_html		: `<br>PHP opcache:`,
			parent			: container
		})

	// status panel (read-only display)
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: '',
			inner_html		: JSON.stringify((self.value||{}).opcache || {}, null, 2),
			parent			: container
		})

	// NOTE: the opcache reset / realpath-cache buttons were removed — the Bun/TS
	// engine has no PHP opcache or realpath cache, so those actions have no
	// server handler. The panel above stays as a read-only status display.
}//end render_opcache_section



/**
* RENDER_DIRECTORIES_SECTION
* Builds the caches & directories health panel and the clear-cache /
* clear-sessions / clear-chunks action buttons. The skeleton is built once;
* only the data panel is refreshed after an action so the result message
* (printed into body_response) survives the refresh.
* @param object self
* @param HTMLElement container
* @return void
*/
const render_directories_section = function(self, container) {

	// title
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: '',
			inner_html		: `<br>Caches & directories:`,
			parent			: container
		})

	// health panel (refreshed in place)
		const panel = ui.create_dom_element({
			element_type	: 'pre',
			class_name		: '',
			inner_html		: JSON.stringify((self.value||{}).directories || {}, null, 2),
			parent			: container
		})

	// body_response (messages)
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response',
			parent			: container
		})

	// refresh helper shared by all three actions: update only the data panel
		const refresh = async () => {
			self.value = await self.get_value()
			ui.update_node_content(panel, JSON.stringify((self.value||{}).directories || {}, null, 2))
		}

	// clear old cache files
		add_action_button({
			parent			: container,
			body_response	: body_response,
			label			: get_label.clear_cache_files || 'Clear old cache files',
			run				: () => self.clear_cache_files(),
			on_success		: refresh
		})

	// clear old session files
		add_action_button({
			parent			: container,
			body_response	: body_response,
			label			: get_label.clear_session_files || 'Clear old session files',
			run				: () => self.clear_session_files(),
			on_success		: refresh
		})

	// NOTE: the "remove old upload chunks" button was removed — chunk cleanup has
	// no server handler on the Bun/TS engine (only chunk ASSEMBLY is ported).
}//end render_directories_section



// @license-end
