// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {dd_request_idle_callback} from '../../../../common/js/events.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {render_counters_status} from './render_counters_status.js'



/**
* COUNTERS_STATUS
* Widget controller for the "Counter status" panel in the maintenance area.
*
* Purpose:
*   Displays a tabular view of every Dédalo section's auto-increment counter
*   alongside the highest recorded section_id, so an administrator can spot and
*   repair counters that have fallen out of sync (e.g. after a direct DB import,
*   a failed migration, or a counter reset).
*
* Lifecycle:
*   Follows the standard Dédalo widget lifecycle:
*     init() → build() → render() → [refresh cycles] → destroy()
*   `init`, `render`, `refresh`, and `destroy` are inherited directly from
*   widget_common.  `build` has a minimal custom override (see below).
*   Both `edit` and `list` modes are mapped to
*   `render_counters_status.prototype.list`, so the widget renders identically
*   regardless of the parent area's mode setting.
*
* Data flow:
*   The widget's value payload (stored in `this.value`) is fetched lazily by
*   the parent area_maintenance on `open` via `area_maintenance.get_value`.
*   The payload shape is:
*     {
*       datalist : Array<{
*         section_tipo   : string,  // ontology tipo for the section (e.g. 'oh1')
*         label          : string,  // human-readable section name
*         counter_value  : number,  // current DB counter value
*         last_section_id: number   // highest recorded id in that section's table
*       }>,
*       errors : Array<string>      // non-fatal diagnostic messages, may be absent
*     }
*   When `counter_value !== last_section_id` the row is flagged "out of sync"
*   and the "Fix counter" button becomes active.
*
* Maintenance operations:
*   `modify_counter` sends an async worker request to the server with one of:
*     - action 'fix'   — sets the counter to `last_section_id + 1`.
*     - action 'reset' — deletes/resets the counter entirely (destructive).
*   After a successful response, `this.value.datalist` is updated in-place and
*   the widget is refreshed via `dd_request_idle_callback`.
*
* Server peer:  core/area_maintenance/widgets/counters_status/class.counters_status.php
*   (API action 'modify_counter' handled by dd_area_maintenance_api)
* Render peer:  core/area_maintenance/widgets/counters_status/js/render_counters_status.js
*
* Main exports: `counters_status` (constructor).
*
* @see widget_common          — shared widget base (init/build/render/refresh/destroy)
* @see area_maintenance       — parent area; provides get_value (alias used as prototype)
* @see render_counters_status — DOM construction for the counter table
*/
export const counters_status = function() {

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node

	this.events_tokens	= []
	this.ar_instances	= []

	this.status
}//end counters_status



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	counters_status.prototype.init		= widget_common.prototype.init
	// counters_status.prototype.build	= widget_common.prototype.build
	counters_status.prototype.render	= widget_common.prototype.render
	counters_status.prototype.refresh	= widget_common.prototype.refresh
	counters_status.prototype.destroy	= widget_common.prototype.destroy
	counters_status.prototype.get_value	= area_maintenance.prototype.get_value
	// // render
	counters_status.prototype.edit		= render_counters_status.prototype.list
	counters_status.prototype.list		= render_counters_status.prototype.list



/**
* BUILD
* Custom build overwrites common widget method
*
* Calls the shared `widget_common.prototype.build` to perform the standard
* widget-build sequence (status transitions, optional autoload via
* `component_info` caller path), then returns its result.
*
* Data loading note:
*   Counter data is NOT fetched here.  Instead the parent area_maintenance
*   widget-loader calls `this.get_value()` (inherited from
*   `area_maintenance.prototype.get_value`) when the widget panel is opened,
*   and the result is placed in `this.value` before `render` is invoked.
*   The try/catch block below is a safety net for future widget-specific
*   setup code; currently the body is intentionally empty.
*
* @param {boolean} [autoload=false] - Passed to widget_common.prototype.build.
*   When true the base implementation fires a 'get_widget_data' request via
*   component_info (only relevant when caller === 'component_info').
*   For the maintenance-area path this widget relies on the unified widget
*   load triggered by area_maintenance on open, so autoload stays false.
* @returns {Promise<boolean>} The return value of widget_common.prototype.build
*   — true on success.
*/
counters_status.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await widget_common.prototype.build.call(this, autoload);

	try {

		// data now loads on open via the unified widget load() (see render_area_maintenance)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* MODIFY_COUNTER
* Execute counter maintenance operations: reset|fix
*
* Sends a long-lived worker request to the server-side
* `dd_area_maintenance_api::modify_counter` handler and handles both the
* success and error paths in the UI.
*
* Supported `counter_action` values:
*   'fix'   — Synchronises the section counter with its actual last section_id
*             (sets counter = last_section_id + 1).  Safe to run repeatedly.
*   'reset' — Deletes/resets the counter for the given section.  This is
*             destructive and irreversible; the caller should present the user
*             with two confirmation dialogs before invoking this action.
*
* On success:
*   1. Writes `api_response.msg` to `body_response` via `textContent` (XSS-safe).
*   2. Updates `this.value.datalist` with the fresh datalist from the response
*      so the in-memory state reflects the DB state.
*   3. Schedules a DOM-only `refresh` via `dd_request_idle_callback` so the
*      table re-renders with updated sync status without a full network reload.
*   4. Shows `api_response.msg` in a browser `alert()` dialog.
*      (!) `alert()` blocks the main thread — this is intentional to force the
*      administrator to acknowledge the result before proceeding.
*
* On error:
*   Writes the error message to `body_response` and shows it in an `alert()`.
*
* Timeout: 1 hour — a 'fix' on a very large section can take many minutes.
* Retries: 1 (one attempt only; counter ops must not be retried automatically).
*
* @param {Object} options - Parameters for the operation.
* @param {HTMLElement} options.body_response - DOM node that receives the
*   status/error message text.  Written via `textContent` to prevent XSS
*   (SEC-XSS-011: api response may contain raw DB / counter text).
* @param {string} options.section_tipo - Ontology tipo of the target section
*   (e.g. 'oh1').
* @param {string} options.counter_action - Operation to perform: 'fix' | 'reset'.
* @returns {Promise<boolean>} Always resolves to true after handling the
*   server response; errors are surfaced via alert() and body_response text.
*/
counters_status.prototype.modify_counter = async function(options) {

	// options
		const body_response		= options.body_response
		const section_tipo		= options.section_tipo
		const counter_action	= options.counter_action

	// self
		const self = this

	// content_data
		const content_data = self.node.content_data

	// data_manager
		const api_response = await data_manager.request({
			use_worker	: true,
			body		: {
				dd_api			: 'dd_area_maintenance_api',
				action			: 'widget_request',
				prevent_lock	: true,
				source	: {
					type	: 'widget',
					model	: 'counters_status',
					action	: 'modify_counter'
				},
				options	: {
					section_tipo	: section_tipo,
					counter_action	: counter_action
				}
			},
			retries : 1, // one try only
			timeout : 3600 * 1000 // 1 hour waiting response
		})
		if(SHOW_DEBUG===true) {
			console.log('modify_counter api_response:', api_response);
		}

		if (api_response.result===true) {

			// success

			// SEC-XSS-011: api_response.msg may contain DB / counter text; textContent avoids HTML parsing.
			body_response.textContent = api_response.msg

			// update datalist value
			self.value.datalist = api_response.datalist

			dd_request_idle_callback(
				() => {
					// refresh DOM only
					self.refresh({
						build_autoload	: false, // default is true
						destroy			: true // default is true
					})
				}
			)

			alert(api_response.msg)

		}else{
			// error

			// SEC-XSS-011
			body_response.textContent = api_response.msg || 'Unknown error'

			alert('Error! \n' + (api_response.msg || 'Unknown error'))
		}


	return true
}//end counters_status.prototype.modify_counter



// @license-end
