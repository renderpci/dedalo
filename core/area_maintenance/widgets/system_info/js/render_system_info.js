// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* RENDER_SYSTEM_INFO
* Client-side rendering layer for the `system_info` maintenance widget.
*
* This module builds and populates the visual output for the System Info card
* shown in the Dédalo maintenance area (`area_maintenance`).  It is paired with:
*   - `system_info.js`           — lifecycle (init / build / render / destroy)
*   - `class.system_info.php`    — server-side data: assembles `requeriments_list`,
*                                  `system_list`, and any runtime `errors`.
*   - `render_area_maintenance.js` — host shell; provides `set_widget_label_style`.
*
* Widget data shape (self.value, produced by `class.system_info::get_value`)
* -------------------------------------------------------------------------
*   {
*     requeriments_list : Array<{ name: string, value: boolean|string, info: string }>,
*     system_list       : Array<{ name: string, value: string|Object }>,
*     errors            : string[]   // non-empty when server-side collection failed
*   }
*
* Three sub-lists are rendered inside `datalist_container`:
*   1. health_list       — live API round-trip checks (5 × check_server_health +
*                          1 × get_environment), executed asynchronously in the browser.
*   2. requeriments_list — PHP-collected system requirements check results.
*   3. system_list       — low-level OS/hardware overview (OS, CPU, RAM, disk …).
*
* The widget card label is coloured `danger` (red) when any requirement fails or
* when any health check fails, via `set_widget_label_style`.
*
* Public exports
* --------------
*   render_system_info  — prototype constructor; `edit` and `list` are assigned from
*                         this prototype onto `system_info` in system_info.js.
*
* (!) `when_in_viewport` is imported but is not called anywhere in this module.
*     It may have been intended for lazy-triggering `render_datalist` once the
*     card scrolls into view, but the call was never added.
*/

// imports
	import {ui} from '../../../../common/js/ui.js'
 	import {dd_request_idle_callback,when_in_viewport} from '../../../../common/js/events.js'
 	import {check_server_health,data_manager} from '../../../../common/js/data_manager.js'
	import {set_widget_label_style} from '../../../js/render_area_maintenance.js'



/**
* RENDER_SYSTEM_INFO
* Prototype constructor for the system_info render module.
*
* Intentionally a no-op; all rendering logic lives in the prototype methods.
* `system_info.js` assigns:
*   system_info.prototype.edit = render_system_info.prototype.list
*   system_info.prototype.list = render_system_info.prototype.list
*
* Never instantiate `render_system_info` directly; always call through a
* `system_info` instance.
* @returns {boolean} Always true.
*/
export const render_system_info = function() {

	return true
}//end render_system_info



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
*
* Entry point for both `edit` and `list` render modes (both are aliased to this
* method in `system_info.js`).  Builds the wrapper shell via the shared
* `ui.widget.build_wrapper_edit` helper, then delegates the inner content to
* `render_content_data`.
*
* When `render_level === 'content'`, only the inner content_data element is
* returned (used during refresh / re-render cycles initiated by
* `widget_common.load`).
*
* @param {Object} options
* 	Sample:
* 	{
*		render_level : "full"
		render_mode : "list"
*   }
* @returns {Promise<HTMLElement>} wrapper (full) or content_data (content-only)
* 	To append to the widget body node (area_maintenance)
*/
render_system_info.prototype.list = async function(options) {

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
* Builds the root content element for the system_info widget.
*
* Creates three child areas:
*   1. An optional error banner — shown when `self.value.errors` is non-empty
*      (i.e. the PHP data collection threw an exception).
*   2. `datalist_container` — placeholder div initialised with a loading message;
*      replaced by `render_datalist` immediately if `self.value` is already set.
*      (When value is not yet set, `widget_common.load` will re-render at
*       `render_level: 'content'` once the fetch completes, and the next call
*       will hit `render_datalist`.)
*   3. `body_response` — empty container reserved for future action-response
*      feedback (e.g. from form submissions inside the widget).
*
* @param {Object} self - The `system_info` widget instance.
* @returns {Promise<HTMLElement>} content_data root div element.
*/
const render_content_data = async function(self) {

	// short vars
		const value		= self.value || {}
		const errors	= value.errors || []

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

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

	// datalist_container
		const datalist_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'datalist_container',
			inner_html		: 'Collecting system info. Please wait..',
			parent			: content_data
		})

		// render from value when loaded. The host triggers the background/open
		// load (widget_common.load), which fetches self.value then re-renders
		// content (render_level 'content'); render_datalist clears the placeholder.
		if (self.value) {
			render_datalist(self, datalist_container)
		}

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end render_content_data



/**
* RENDER_DATALIST
* Populates `datalist_container` with the three sub-list sections.
*
* Clears the placeholder text, builds three sub-containers (health, requirements,
* system overview) in a `DocumentFragment`, then replaces the container's content
* in a single DOM operation.
*
* Also schedules (via `dd_request_idle_callback`) a CSS danger-class update on
* the outer widget card label so it turns red when `errors` is non-empty.
*
* @param {Object} self - The `system_info` widget instance carrying `self.value`.
* @param {HTMLElement} datalist_container - Target container to populate.
* @returns {boolean} Always true.
*/
const render_datalist = (self, datalist_container) => {

	// short vars
		const value				= self.value || {}
		const system_list		= value.system_list || []
		const requeriments_list	= value.requeriments_list || []
		const errors			= value.errors || []

	// set widget container label color style
		dd_request_idle_callback(
			() => {
				if (errors.length) {
					set_widget_label_style(self, 'danger', 'add', datalist_container)
				}else{
					set_widget_label_style(self, 'danger', 'remove', datalist_container)
				}
			}
		)

	const fragment = new DocumentFragment()

	// Dédalo health_list
		const health_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_container health_list_container',
			parent			: fragment
		})
		health_list_container.appendChild(
			render_health_list(self, datalist_container)
		)

	// Dédalo requeriments_list
		const requeriments_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_container requeriments_list_container',
			parent			: fragment
		})
		requeriments_list_container.appendChild(
			render_requeriments_list(requeriments_list, self, datalist_container)
		)

	// System overview system_list
		const system_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_container system_list_container',
			parent			: fragment
		})
		system_list_container.appendChild(
			render_system_list(system_list)
		)

	// clean node
		while (datalist_container.firstChild) {
			datalist_container.removeChild(datalist_container.firstChild);
		}

	// append to datalist_container
		datalist_container.appendChild(fragment)


	return true
}//end render_datalist



/**
* RENDER_HEALTH_LIST
* Builds the live API health-check section.
*
* Fires `checks_list.length` (currently 6) asynchronous API probes in parallel
* and appends a DOM row for each.  Five probes use `check_server_health` (the
* lightweight PHP health endpoint); the sixth calls `get_environment` (a full
* `dd_core_api` round-trip that verifies database connectivity and
* core bootstrapping).
*
* Row anatomy: [ check name | result icon + raw JSON | timing + URL info ]
*   - result column:  a green check icon on success, a red cancel icon on failure.
*   - info column:    elapsed time in ms; adds class `warning` when slow
*                     (>150 ms for health, >300 ms for environment calls).
*
* Timing: `performance.now()` captures the start just before the async call is
* dispatched, so the elapsed time includes only the network round-trip and
* micro-task scheduling overhead, not DOM creation time.
*
* (!) The `checks_list` array repeats `'check_server_health'` five times.  This
*     is intentional: it measures API round-trip variance across multiple
*     independent fetches rather than caching the first result.
*
* @param {Object} self - The `system_info` widget instance (used for
*     `set_widget_label_style` calls via the failed_list guard).
* @param {HTMLElement} datalist_container - The container node used as the
*     positional anchor for `set_widget_label_style`.
* @returns {DocumentFragment} Fragment containing the header row and one row per
*     health probe; rows complete asynchronously after the fragment is returned.
*/
const render_health_list = function (self, datalist_container) {

	const fragment = new DocumentFragment()

	const api_health_url = data_manager.health_url

	// environment
	// Sends a full dd_core_api 'get_environment' request.
	// prevent_lock: true skips advisory section locks; retries is 1 so the check
	// fails fast rather than blocking the UI for multiple retry cycles.
	// timeout is set to 1 hour because this path may be reached during a slow
	// initial server warm-up (opcache cold start, large PostgreSQL connection pool).
	const get_environment = async () => {
		return data_manager.request({
			body : {
				dd_api			: 'dd_core_api',
				action			: 'get_environment',
				prevent_lock	: true,
			},
			retries : 1, // one try only
			timeout : 3600 * 1000 // 1 hour waiting response
		})
	}

	// failed_list
		const failed_list = []

	// header
		// info_item
		const info_item = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_item header',
			parent			: fragment
		})
		// Check label
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: 'Check',
			parent			: info_item
		})
		// result label
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: 'Result',
			parent			: info_item
		})
		// info label
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: 'Info',
			parent			: info_item
		})

	// checks_list drives the loop: the first 5 entries stress-test the raw health
	// endpoint (measuring round-trip variance), the last entry verifies the full
	// API stack via get_environment.
	const checks_list = [
		'check_server_health',
		'check_server_health',
		'check_server_health',
		'check_server_health',
		'check_server_health',
		'get_environment',
	]
	const total_tries = checks_list.length
	for (let i = 0; i < total_tries; i++) {

		const check_name = checks_list[i]

		// info_item
		const info_item = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_item',
			parent			: fragment
		})
		// name
		const name_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'name',
			inner_html		: 'Loading..',
			parent			: info_item
		})

		// value
		const value_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'value',
			parent			: info_item
		})

		// info text
		const info_column = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'info',
			parent			: info_item
		})

		const start_time = performance.now();

		switch (check_name) {

			case 'check_server_health':
				check_server_health()
				.then(function(result){

					// SEC-XSS-010: all values are plain text; textContent avoids HTML parsing.
					name_node.textContent = `API health call ${i+1}`

					const total_time = performance.now() - start_time;

					value_node.textContent = JSON.stringify(result, null, 2)

					// icon success / failed
					if (result) {
						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'button icon check success',
							parent			: value_node
						})
					}else{
						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'button icon cancel error',
							parent			: value_node
						})

						failed_list.push('Health API check ', i+1)
					}

					info_column.textContent = `The API health endpoint (${api_health_url}) check takes ${total_time.toFixed(2)}ms.`
					// Warn when the health endpoint takes longer than 150 ms — it is an
					// extremely lightweight PHP file and should never be this slow unless
					// the web server or network is under load.
					if (total_time > 150) {
						info_column.classList.add('warning')
					}
				})
				break;

			case 'get_environment':
				get_environment()
				.then(function(response){

					// SEC-XSS-010
					name_node.textContent = 'API environment call'

					const total_time = performance.now() - start_time;

					value_node.textContent = JSON.stringify(response.result!==false, null, 2)

					// icon success / failed
					if (response.result!==false) {
						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'button icon check success',
							parent			: value_node
						})
					}else{
						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'button icon cancel error',
							parent			: value_node
						})

						failed_list.push('Environment API check ', i+1)
					}

					info_column.textContent = `The API environment check takes ${total_time.toFixed(2)}ms.`
					// 300 ms threshold for the full environment call (connects to Postgres,
					// bootstraps core) — slower than the raw health endpoint is expected.
					if (total_time > 300) {
						info_column.classList.add('warning')
					}
				})
				break;
		}//end switch (check_name)
	}//end for (let i = 0; i < total_tries; i++)

	// failed list
	// `datalist_container` is received as a parameter (mirroring
	// `render_requeriments_list`) so this guard can apply the danger style.
	// Note: the health probes above resolve asynchronously, so this synchronous
	// guard runs before they settle; failed_list is typically empty at this point.
	if (failed_list.length>0) {
		dd_request_idle_callback(
			() => {
				set_widget_label_style(self, 'danger', 'add', datalist_container)
			}
		)
	}


	return fragment
}//end render_health_list



/**
* RENDER_REQUERIMENTS_LIST
* Builds the PHP-collected system requirements check section.
*
* Iterates `requeriments_list` (assembled server-side by `class.system_info::get_value`)
* and creates one row per requirement.  Each row has three columns:
*   - name  : human-readable requirement label (e.g. "PHP Supported version").
*   - value : JSON-stringified check result; receives class `success` (green) or
*             `failed` (red) when the item value is a boolean, plus a matching
*             icon span inside the value column.
*   - info  : explanatory text including the detected and minimum required values
*             (e.g. "Version: 8.3.4 - minimum: 8.3.0").
*
* When any item fails (value === false), the item name is added to `failed_list`
* and, on idle, the outer widget card label is flagged `danger` via
* `set_widget_label_style`.
*
* @param {Array<{name: string, value: boolean|string, info: string}>} requeriments_list
*     Server-supplied array of requirement check results.
* @param {Object} self - The `system_info` widget instance.
* @param {HTMLElement} datalist_container - The container node used as the
*     positional anchor for `set_widget_label_style`.
* @returns {DocumentFragment} Fragment with a header row and one row per requirement.
*/
const render_requeriments_list = function (requeriments_list, self, datalist_container) {

	const fragment = new DocumentFragment()

	// failed_list
		const failed_list = []

	// header
		// info_item
		const info_item = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_item header',
			parent			: fragment
		})
		// Check label
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: 'Check',
			parent			: info_item
		})
		// result label
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: 'Result',
			parent			: info_item
		})
		// info label
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: 'Info',
			parent			: info_item
		})

	const requeriments_list_length = requeriments_list.length
	for (let i = 0; i < requeriments_list_length; i++) {

		const item = requeriments_list[i]

		const name	= item.name
		const value	= item.value
		const info	= item.info

		// info_item
		const info_item = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_item',
			parent			: fragment
		})

		// name
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'name',
			inner_html		: name,
			parent			: info_item
		})

		// value
		// Derive the CSS modifier from the boolean type check: non-boolean values
		// (e.g. version strings) receive no colour modifier — only pass/fail booleans do.
		const class_add = (typeof value === 'boolean')
			? (value===true ? ' success' : ' failed')
			: ''
		const value_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'value' + class_add,
			inner_html		: JSON.stringify(value, null, 2),
			parent			: info_item
		})

		// icon success / failed
		if (class_add===' success') {
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button icon check success',
				parent			: value_node
			})
		}else if(class_add===' failed') {
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button icon cancel error',
				parent			: value_node
			})

			failed_list.push(name)
		}

		// info text
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'info',
			inner_html		: info,
			parent			: info_item
		})
	}

	// failed list
	if (failed_list.length>0) {
		dd_request_idle_callback(
			() => {
				set_widget_label_style(self, 'danger', 'add', datalist_container)
			}
		)
	}


	return fragment
}//end render_requeriments_list



/**
* RENDER_SYSTEM_LIST
* Builds the server hardware/OS overview section.
*
* Iterates `system_list` (assembled server-side by `class.system_info::get_value`
* using the `linfo` library) and creates a two-column row per item:
*   - name  : human-readable label (e.g. "os", "cpu", "ram", "hd", "uptime" …).
*   - value : rendered inside a `<pre>` element so that complex nested objects
*             (e.g. mount point arrays, network interface maps) retain their
*             JSON indentation.  Plain string values are used as-is; all other
*             types are JSON-stringified with 2-space indent.
*
* This section is read-only and has no pass/fail semantics — no icon or colour
* coding is applied.
*
* @param {Array<{name: string, value: string|Object}>} system_list
*     Server-supplied array of OS/hardware snapshot items.
* @returns {DocumentFragment} Fragment with a header row and one row per system item.
*/
const render_system_list = function (system_list) {

	const fragment = new DocumentFragment()

	// header
		// info_item
		const info_item = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_item header',
			parent			: fragment
		})
		// Check label
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: 'Server info',
			parent			: info_item
		})
		// info label
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: 'Value',
			parent			: info_item
		})

	const system_list_length = system_list.length
	for (let i = 0; i < system_list_length; i++) {

		const item = system_list[i]

		const name	= item.name
		const value	= item.value

		// info_item
		const info_item = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_item',
			parent			: fragment
		})

		// name
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'name',
			inner_html		: name,
			parent			: info_item
		})

		// value
		// Use the raw string when available; fall back to JSON for objects/arrays
		// so complex linfo structures (mounts, net interfaces) render readably.
		const value_string = typeof value==='string'
			? value
			: JSON.stringify(value, null, 2)
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'value',
			inner_html		: value_string,
			parent			: info_item
		})
	}


	return fragment
}//end render_system_list



// @license-end
