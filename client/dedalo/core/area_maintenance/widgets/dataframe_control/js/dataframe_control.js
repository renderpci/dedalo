// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_dataframe_control} from './render_dataframe_control.js'



/**
* DATAFRAME_CONTROL
* Maintenance widget: dataframe pairing integrity report and orphan cleanup.
*
* This widget surfaces the server-side dataframe_control::run_check /
* run_fix actions through the area_maintenance UI. It gives the operator a
* one-click way to:
*   1. Scan every dd490 frame locator stored across all sections and identify
*      those whose paired main data item no longer exists ("orphans").
*   2. Detect legacy frames that predate the v7 unified id_key contract and
*      still use the old pairing key shape.
*   3. Optionally delete orphan frame locators (frame TARGET records are never
*      touched — the time-machine needs them).
*
* Lifecycle (inherited from widget_common):
*   init() → build() → render() → [refresh cycles] → destroy()
*
* Data flow:
*   build()          — shell only. No get_value exists on this widget (WC-071),
*                      so widget_common.prototype.load() is a no-op and NOTHING
*                      is fetched on page load or accordion open.
*   run_action()     — the ONLY server round-trip. Called directly from the UI
*                      buttons in
*                      render_dataframe_control when the operator triggers a
*                      check or fix; calls dd_area_maintenance_api /
*                      widget_request → run_check or run_fix on the server.
*   render/edit/list — both mode aliases forward to
*                      render_dataframe_control.prototype.list, which builds
*                      the report DOM and wires the action buttons.
*
* Server peer: src/core/area_maintenance/widgets/dataframe_control.ts
* Render peer: render_dataframe_control.js
*
* Exported:
*   dataframe_control — constructor function (used via prototype assignment)
*/
export const dataframe_control = function() {

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
}//end dataframe_control



/**
* COMMON FUNCTIONS
* Extend the dataframe_control instance with shared prototype methods from
* widget_common, area_maintenance, and render_dataframe_control.
*
* Lifecycle methods (init, render, refresh, destroy) are provided entirely by
* widget_common — no custom overrides are needed for this widget.
* (!) This widget deliberately has NO `get_value` (WC-071). Every other
* area_maintenance widget borrows area_maintenance.prototype.get_value so the
* framework's lazy loader can fetch a panel value on open — but this widget's
* value IS a full-database integrity scan (every matrix% table, end to end),
* which on a scale install is minutes of DB work that cannot complete inside
* the statement timeout. It ran on every page load, per admin, in both views.
* The scan is an OPERATOR action now: `run_action({action:'run_check'})` from
* the Check button, nothing on load. Because widget_common.prototype.load()
* no-ops when `typeof self.get_value!=='function'`, dropping this one
* assignment is what actually disarms the load path — the server module
* dropped its matching `getValue` in the same change.
*
* Both edit and list mode resolve to render_dataframe_control.prototype.list
* because this widget has a single, combined check+fix view with no separate
* read-only list.
*/
// prototypes assign
	// lifecycle
	dataframe_control.prototype.init		= widget_common.prototype.init
	dataframe_control.prototype.render		= widget_common.prototype.render
	dataframe_control.prototype.refresh		= widget_common.prototype.refresh
	dataframe_control.prototype.destroy		= widget_common.prototype.destroy
	// render
	dataframe_control.prototype.edit		= render_dataframe_control.prototype.list
	dataframe_control.prototype.list		= render_dataframe_control.prototype.list



/**
* BUILD
* Custom build that delegates to the shared widget_common build and then
* performs any widget-specific post-build work.
*
* This widget has no get_value (WC-071), so `autoload` is inert here: there is
* no value to fetch and the widget renders a "not run" state until the operator
* presses Check. No additional async work is required; the try/catch block is
* kept as a scaffold for future widget-specific initialization steps.
*
* @param {boolean} autoload - forwarded to widget_common.prototype.build for
*   signature compatibility; has no effect on this widget (nothing to autoload).
* @returns {Promise<boolean>} resolves with the boolean result of
*   widget_common.prototype.build (true on success, false on failure)
*/
dataframe_control.prototype.build = async function(autoload=false) {

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
}//end build



/**
* RUN_ACTION
* Dispatches a dataframe integrity action (check or fix) to the server and
* returns the raw API response.
*
* Called by the UI buttons rendered in render_dataframe_control — not by
* the lifecycle methods. The caller is responsible for toggling the loading
* state on the DOM before and after this call.
*
* API route: dd_area_maintenance_api / widget_request → dataframe_control::<action>
*   - run_check: read-only scan; returns orphan counts and a capped orphan_items list.
*   - run_fix:   same scan but also deletes orphan frame locators in place.
*
* The request uses a 1-hour timeout because integrity scans on large databases
* can take several minutes. prevent_lock:true tells the server not to acquire
* a record lock for this read-heavy operation.
*
* (!) run_fix performs irreversible deletions of frame locator records.
*   The render layer is expected to require a user confirmation before calling
*   this method with action='run_fix'.
*
* @param {Object} options - action descriptor
* @param {string} options.action - one of 'run_check' | 'run_fix'
* @returns {Promise<Object|null>} api_response — shape:
*   {
*     result: {
*       scanned:          {number}   sections scanned,
*       frames_checked:   {number}   dd490 frame locators examined,
*       orphans:          {number}   unresolved (orphan) frame locators found,
*       orphan_items:     {Array}    capped list of orphan locator strings,
*       legacy_unmigrated:{number}   frames still using the pre-v7 key shape,
*       orphans_fixed:    {number}   orphan locators deleted (0 for run_check),
*       errors:           {Array}    scan-time error strings
*     },
*     msg:    {string}  human-readable summary,
*     errors: {Array}   mirrors result.errors for top-level error inspection
*   }
*/
dataframe_control.prototype.run_action = async function(options) {

	const self = this

	const action = options.action

	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source	: {
				type	: 'widget',
				model	: 'dataframe_control',
				action	: action
			},
			options	: {}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})
	if(SHOW_DEBUG===true) {
		console.log('dataframe_control '+action+' api_response:', api_response);
	}

	return api_response
}//end run_action



// @license-end
