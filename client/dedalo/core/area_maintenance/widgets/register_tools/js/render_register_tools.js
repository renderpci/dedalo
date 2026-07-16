// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* RENDER_REGISTER_TOOLS
* Client-side rendering layer for the `register_tools` maintenance widget.
*
* This widget displays all discovered Dédalo tool directories in a tabular view
* and lets an administrator trigger the `register_tools` API action, which calls
* `tools_register::import_tools()` on the server to synchronise the tool registry
* with the current on-disk state.
*
* Data source
* -----------
* `self.value` is populated by the server via `register_tools::get_value()`:
*   {
*     datalist : Array<{
*       name              : {string}        — directory name of the tool
*       version           : {string|null}   — version declared in register.json
*       developer         : {string|null}   — developer name from register.json
*       installed_version : {string|null}   — version stored in the ontology DB (null = not yet registered)
*       warning           : {string|null}   — pre-composed server-side warning (e.g. missing register.json)
*     }>,
*     errors : {Array<string>|null}         — fatal errors (e.g. outdated ontology)
*   }
*
* Widget render flow (prototype chain)
* -------------------------------------
* 1. `register_tools.prototype.list` (wired to `render_register_tools.prototype.list`)
*    is called by `widget_common` after a successful `load()`.
* 2. `render_content_data` builds the column header row, the datalist container,
*    an optional error banner, and initialises the submit form via `caller.init_form`.
* 3. `render_datalist` populates (or re-populates) the tool rows inside the datalist
*    container, applying visual warnings for outdated or unregistered tools.
* 4. After a successful form submit the `on_done` callback refreshes `self.value`
*    and calls `render_datalist` again in place so only the list repaints.
*
* Visual state
* ------------
* The outer widget card label is coloured `danger` (via `set_widget_label_style`)
* when any tool has a version mismatch or when `errors` is non-empty.  The class
* is removed once everything is in sync.
*
* Column layout (5-column CSS grid, defined in register_tools.less)
* ----------------------------------------------------------------
*   Name | Developer | Installed | Version | Info
*
* Server peer: core/area_maintenance/widgets/register_tools/class.register_tools.php
* Lifecycle:   core/area_maintenance/widgets/register_tools/js/register_tools.js
* Styles:      core/area_maintenance/widgets/register_tools/css/register_tools.less
*
* Public exports: render_register_tools (prototype constructor)
*/

// imports
	import {ui} from '../../../../common/js/ui.js'
	import {set_widget_label_style} from '../../../js/render_area_maintenance.js'



/**
* RENDER_REGISTER_TOOLS
* Prototype constructor for the register_tools render layer.
*
* Instances are never created directly; their prototype methods (`list`) are copied
* onto the `register_tools` constructor in register_tools.js so the standard
* widget lifecycle (init → build → render → list/edit) works transparently.
*
* @returns {boolean} Always returns true (no-op constructor body).
*/
export const render_register_tools = function() {

	return true
}//end render_register_tools



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
*
* This is the entry point for both `edit` and `list` render modes (both prototype
* slots point here in register_tools.js).  When `render_level` is `'content'` the
* raw content_data element is returned without the outer widget wrapper, which is
* used by refresh flows that want to swap only the inner content.
*
* @param {Object} options
*   @param {string} [options.render_level="full"] - `'full'` returns the full
*     `wrapper` element; `'content'` returns only the inner `content_data` element.
*   @param {string} [options.render_mode="list"] - Render mode hint (unused here;
*     kept for interface parity with other widget render methods).
* @returns {Promise<HTMLElement>} `wrapper` (full mode) or `content_data` (content mode)
*   to be appended to the widget body node managed by area_maintenance.
*/
render_register_tools.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await render_content_data(self)
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
* RENDER_CONTENT_DATA
* Builds the full interior of the register_tools widget:
*   1. A 5-column header row (Name / Developer / Installed / Version / Info).
*   2. A `datalist_container` populated immediately by `render_datalist`.
*   3. An optional `info_text error` banner when `self.value.errors` is non-empty
*      (e.g. when the ontology is outdated and the Developer term dd1644 is missing).
*   4. A `body_response` container for API response output.
*   5. The submit form wired to `dd_area_maintenance_api::widget_request` with
*      source action `register_tools`.  On success the `on_done` callback fetches
*      fresh data and re-renders the datalist in place.
*
* The form is initialised via `self.caller.init_form` (an alias for `build_form`
* exposed on the `area_maintenance` instance).  If `self.caller` does not implement
* `init_form` (defensive check) the form is silently skipped.
*
* @param {Object} self - The `register_tools` widget instance.
*   Expected properties:
*     self.value   {Object}   — widget value object (see module header for shape).
*     self.caller  {Object}   — area_maintenance instance exposing `init_form`.
*     self.name    {string}   — widget name, used as submit button fallback label.
*     self.get_value {Function} — async method to re-fetch the widget value from the server.
* @returns {Promise<HTMLElement>} The constructed `content_data` container element.
*/
const render_content_data = async function(self) {

	// short vars
		const value		= self.value || {}
		const errors	= value.errors || []

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// datalist
		// header
			const tool_item = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'dd_tr header',
				parent			: content_data
			})
			// name
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'dd_th',
				inner_html		: get_label.name || 'Name',
				parent			: tool_item
			})

			// developer
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'dd_th',
				inner_html		: get_label.developer || 'Developer',
				parent			: tool_item
			})

			// installed_version
			const installed_version_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'dd_th num',
				inner_html		: get_label.installed || 'Installed',
				parent			: tool_item
			})

			// available version
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'dd_th num',
				inner_html		: get_label.version || 'Version',
				parent			: tool_item
			})

			// warning
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'dd_th',
				// (!) label key is 'informacion' (Spanish legacy key); displays as 'Info'
				inner_html		: get_label.information || 'Info',
				parent			: tool_item
			})

		// datalist_container holds the live tool rows; render_datalist populates it
		// and can replace its contents on subsequent calls (e.g. after registration)
			const datalist_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'datalist_container dd_table',
				parent			: content_data
			})
			render_datalist(self, datalist_container)

	// info errors
		if (errors.length) {
			const text = `Errors found. Fix this errors before continue: <br>` + errors.join('<br>')
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: text,
				class_name		: 'info_text error',
				parent			: content_data
			})
		}

	// body_response
		// NOTE: body_response is NOT appended to content_data here; it is added at
		// the bottom after init_form so the response area appears below the form.
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// form init
		// `self.caller.init_form` is `area_maintenance.prototype.init_form`, which
		// delegates to `build_form` in render_area_maintenance.js.
		// The trigger dispatches to `dd_area_maintenance_api` → `widget_request` →
		// `register_tools::register_tools()` (server-side), which calls
		// `tools_register::import_tools()` to write or update all tool records.
		if (self.caller?.init_form) {
			self.caller.init_form({
				submit_label	: get_label.register_tools || self.name,
				confirm_text	: get_label.sure || 'Sure?',
				body_info		: content_data,
				body_response	: body_response,
				trigger : {
					dd_api	: 'dd_area_maintenance_api',
					action	: 'widget_request',
					prevent_lock	: true,
					source	: {
						type	: 'widget',
						model	: 'register_tools',
						action : 'register_tools'
					},
					options	: {}
				},
				on_done : async () => {

					// get and update value
					self.value = await self.get_value()

					// render datalist again
					render_datalist(self, datalist_container)
				}
			})
		}

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end render_content_data



/**
* RENDER_DATALIST
* Builds (or re-builds) the rows inside `datalist_container` from the current
* `self.value.datalist` array.
*
* Called once during initial render and again from the `on_done` callback after a
* successful registration request, replacing the old row nodes in place.
*
* Per-row visual logic
* --------------------
* - If `installed_version !== version` the installed-version cell receives the
*   `'warning'` CSS class (red badge), alerting the admin to re-register.
* - If either `version` or `installed_version` is falsy, a plain-text warning is
*   pushed into `ar_warning` and displayed in the Info column.
* - A server-level warning (e.g. '(!) Missing register.json') is pre-loaded from
*   `item.warning` and displayed as the first entry in `ar_warning`.
*
* Widget-card badge
* -----------------
* `set_widget_label_style(self, 'danger', …)` is called to add/remove the `danger`
* CSS class on the outer widget card label, giving a red badge whenever any tool
* needs attention.  The call is deferred to `requestAnimationFrame` internally so
* it is safe to call before `self.node` is mounted (the helper queues via
* `when_in_dom` in that case).
*
* DOM update strategy
* -------------------
* Rows are built into a `DocumentFragment` first, then the container is cleared
* with a `while/removeChild` loop (safe across all browsers) and the fragment is
* appended in a single operation, minimising reflows.
*
* @param {Object} self - The `register_tools` widget instance.
*   Expected properties:
*     self.value {Object} — current widget value (see module header for datalist shape).
*     self.node  {HTMLElement|undefined} — widget root node (may be absent on first call).
* @param {HTMLElement} datalist_container - The container element to (re-)populate.
* @returns {boolean} Always returns true.
*/
const render_datalist = (self, datalist_container) => {

	// short vars
		const value		= self.value || {}
		const datalist	= value.datalist || []
		const errors	= value.errors || []

	// check versions
		// collect tools whose on-disk version differs from the installed (registered) version
		const outdated = datalist.reduce((carry, value) => {
			if (value.version !== value.installed_version) {
				carry.push(value)
			}
			return carry
		}, [])

	// set widget container label color style
		// mark the card red if there are fatal errors OR any outdated tools
		if (errors.length || outdated.length) {
			set_widget_label_style(self, 'danger', 'add', datalist_container)
		}else{
			set_widget_label_style(self, 'danger', 'remove', datalist_container)
		}

	const fragment = new DocumentFragment()

	const datalist_length = datalist.length
	for (let i = 0; i < datalist_length; i++) {

		const item = datalist[i]

		const name				= item.name
		const version			= item.version
		const developer			= item.developer
		const installed_version	= item.installed_version
		// seed ar_warning with the server-side warning (if any); client-side checks append below
		const ar_warning		= item.warning
			? [item.warning]
			: []

		// tool_item
		const tool_item = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_tr',
			parent			: fragment
		})

		// name
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_td',
			inner_html		: name,
			parent			: tool_item
		})

		// developer
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_td',
			inner_html		: developer,
			parent			: tool_item
		})

		// installed_version
		const installed_version_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_td num',
			inner_html		: installed_version,
			parent			: tool_item
		})
		// highlight the installed version cell when it does not match the current on-disk version
		if (installed_version!==version) {
			installed_version_node.classList.add('alert')
		}

		// available version
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_td num',
			inner_html		: version,
			parent			: tool_item
		})

		// warning
		// append client-side diagnostic messages after any server-supplied warning
		if (!version) {
			ar_warning.push('Tool version not defined')
		}
		if (!installed_version) {
			ar_warning.push('Installed version not defined')
		}
		const warning_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_td',
			parent			: tool_item
		})
		if (ar_warning.length) {
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'dd_badge state_warning',
				inner_html		: ar_warning.join('<br>'),
				parent			: warning_node
			})
		}
	}

	// clean node
	// removeChild loop is used instead of innerHTML='' to avoid triggering
	// event-listener leaks or unexpected mutation observer callbacks
	while (datalist_container.children.length > 1) {
		datalist_container.removeChild(datalist_container.lastChild);
	}

	// append
	datalist_container.appendChild(fragment)


	return true
}//end render_datalist



// @license-end
