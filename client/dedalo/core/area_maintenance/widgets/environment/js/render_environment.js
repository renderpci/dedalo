// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_ENVIRONMENT
* Client-side render module for the `environment` maintenance widget.
*
* The environment widget is a diagnostic tool in `area_maintenance` that gives
* administrators two things:
*   1. A button to open the raw `environment.js.php` bootstrap file in a new
*      browser tab, letting them inspect the live server-side configuration that
*      is served to every page load (constants, `page_globals` values, etc.).
*   2. A pretty-printed dump of the current `page_globals` object so the admin
*      can verify runtime state without leaving the maintenance area.
*
* This module exports one constructor (`render_environment`) whose `list`
* prototype method is wired to both `environment.prototype.edit` and
* `environment.prototype.list` by the host widget (`environment.js`).
* The actual DOM construction is delegated to the private helper
* `get_content_data_edit`.
*
* Widget data flow:
*   widget_common.load() → self.value is populated (may be empty for this widget)
*   → widget_common.render() → render_environment.prototype.list(options)
*   → get_content_data_edit(self) → returns content_data <div>
*   → ui.widget.build_wrapper_edit wraps content_data into the final wrapper
*
* The `value` property is not meaningfully used by this widget — all output is
* derived from the already-available global `page_globals` object.
*
* @module render_environment
*/



/**
* RENDER_ENVIRONMENT
* Constructor function (empty shell). Dédalo prototype-assign pattern: the real
* render methods are attached to `render_environment.prototype` below and then
* copied onto the host `environment.prototype` in `environment.js`.
* @returns {boolean} Always true — nothing to initialise in the constructor.
*/
export const render_environment = function() {

	return true
}//end render_environment



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param {Object} options
* 	Sample:
* 	{
*		render_level : "full"
		render_mode : "list"
*   }
* @returns {HTMLElement} wrapper
* 	To append to the widget body node (area_maintenance)
*/
render_environment.prototype.list = async function(options) {

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
* Builds the inner content DOM for the environment widget.
*
* Produces a <div> containing:
*   - A "Open environment file" button that opens `../common/js/environment.js.php`
*     in a new browser tab, allowing admins to inspect the raw PHP-generated JS
*     bootstrap (page_globals, DEDALO_CORE_URL, get_label, etc.) at runtime.
*   - A <pre> block showing a formatted JSON dump of the current `page_globals`
*     global object (injected into every page by environment.js.php).
*
* Note: the URL `../common/js/environment.js.php` is relative to the current
* page's location, not to this JS module. This relies on the browser resolving
* it from `window.location`; if the maintenance area is ever served from a
* different path depth the URL will break.
*
* @param {Object} self - The `environment` widget instance. `self.value` is
*   read but is unused in practice; all output comes from `page_globals`.
* @returns {HTMLElement} content_data - A <div> containing the button and the
*   page_globals dump; intended to be passed to `ui.widget.build_wrapper_edit`.
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value = self.value || {}

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// button_open
		const button_open = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light',
			inner_html		: `Open environment file`,
			parent			: content_data
		})
		button_open.addEventListener('click', function(e) {
			e.stopPropagation()

			// url
			const url = `../common/js/environment.js.php`

			window.open(url)
		})

	// page_globals
		const list_page_globals = ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'list_page_globals',
			inner_html		: JSON.stringify(page_globals, null, 2),
			parent			: content_data
		})

	return content_data
}//end get_content_data_edit



// @license-end
