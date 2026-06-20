// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* MOVE_LOCATOR (module)
*
* Client-side controller for the `move_locator` maintenance widget.
*
* Purpose:
*   Provides a UI for administrators to execute bulk ontology-locator
*   transformation jobs across all Dédalo matrix tables.  The operation reads
*   JSON mapping files stored on the server at
*   `dedalo/core/base/transform_definition_files/move_locator/` and rewrites
*   every matching tipo reference in all matrix tables (matrix, matrix_nexus,
*   matrix_hierarchy, etc.) to the new target locator values.
*
*   Because the operation can touch millions of records it runs as a
*   long-running background CLI process on the server.  The widget submits the
*   job and then polls `update_process_status` to track progress in the browser
*   without blocking the HTTP layer.
*
* Architecture:
*   This module is the thin constructor/controller layer.  All rendering is
*   delegated to `render_move_locator` (render_move_locator.js).
*   The shared widget lifecycle (init → build → render → destroy) is inherited
*   from `widget_common` via direct prototype assignment.
*
* Exports:
*   move_locator — constructor function; instances are created by
*                  area_maintenance and mounted into the widget body node.
*
* Server peers:
*   core/area_maintenance/widgets/move_locator/class.move_locator.php
*     - get_value() — returns the informational text and the list of available
*       JSON definition files.
*     - move_locator($options) — validates the selected file names and spawns
*       the background `transform_data::changes_in_locators()` process.
*
* API flow:
*   1. area_maintenance calls `get_value` via `dd_area_maintenance_api::get_widget_value`
*      to populate `self.value` with the file list shown in the UI.
*   2. On form submit, `exec_move_locator` sends a `widget_request` action to
*      `dd_area_maintenance_api` with `prevent_lock: true` and a 1-hour timeout,
*      receiving a response with `{ pid, pfile }` that `update_process_status`
*      can then poll.
*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_move_locator} from './render_move_locator.js'



/**
* MOVE_LOCATOR
* Constructor for the move_locator maintenance widget instance.
*
* Declares all instance properties with `undefined` (or literal defaults) so
* that downstream lifecycle methods and the render layer can rely on their
* existence.  Actual values are seeded by `widget_common.prototype.init`.
*
* Property inventory:
*   id            {string}         - Unique instance identifier, set by init().
*   section_tipo  {string}         - Ontology tipo of the owning section.
*   section_id    {string|number}  - Record id within the owning section.
*   lang          {string}         - Active language tag, e.g. 'lg-eng'.
*   mode          {string}         - Render mode: 'edit' | 'list'.
*   value         {Object|null}    - Payload from server get_value(); shape:
*                                    { body: string, files: Array<{file_name, content}> }
*   node          {HTMLElement}    - Root DOM node created by render(); null until built.
*   events_tokens {Array}          - PubSub token handles; drained on destroy().
*   ar_instances  {Array}          - Child widget/component instances.
*   status        {string}         - Lifecycle phase string; updated by lifecycle methods.
*/
export const move_locator = function() {

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
}//end move_locator



/**
* COMMON FUNCTIONS
* Inherit the shared widget lifecycle from widget_common and the render
* implementation from render_move_locator.
*
* Lifecycle methods (from widget_common):
*   init    — seeds all instance properties from an options bag.
*   build   — transitions to 'built'; for this widget the value is loaded via
*             the area_maintenance autoload path (not the component_info path).
*   render  — dispatches to this.edit() or this.list() based on this.mode.
*   destroy — unsubscribes events_tokens and optionally removes the DOM node.
*
* Render methods (from render_move_locator):
*   edit / list — both map to `render_move_locator.prototype.list`, which
*                 builds the file-selection form and wires the submit handler.
*                 The widget has no distinct edit-vs-list appearance; `edit` is
*                 aliased to `list` because area_maintenance always opens widgets
*                 in 'edit' mode.
*/
// prototypes assign
	// lifecycle
	move_locator.prototype.init		= widget_common.prototype.init
	move_locator.prototype.build	= widget_common.prototype.build
	move_locator.prototype.render	= widget_common.prototype.render
	move_locator.prototype.destroy	= widget_common.prototype.destroy
	// render
	move_locator.prototype.edit		= render_move_locator.prototype.list
	move_locator.prototype.list		= render_move_locator.prototype.list



/**
* EXEC_MOVE_LOCATOR
* Dispatches the bulk locator-transformation job to the server via the
* `dd_area_maintenance_api` endpoint and returns the server response.
*
* The job runs as a background CLI process (options.background_running = true),
* so the server returns immediately with a `{ pid, pfile }` payload rather than
* waiting for the full transformation to complete.  The caller (render layer) is
* responsible for passing those values to `update_process_status` to display
* live progress in the UI.
*
* Guard: returns undefined early when `files_selected` is empty, preventing
* a no-op server call.  The render layer validates selection before calling
* this method, but this guard acts as a second line of defence.
*
* API request body shape:
*   {
*     dd_api       : 'dd_area_maintenance_api',
*     action       : 'widget_request',
*     prevent_lock : true,             // skip the global edit-lock mechanism
*     source : {
*       type   : 'widget',
*       model  : 'move_locator',       // targets class.move_locator.php
*       action : 'move_locator'        // calls move_locator::move_locator()
*     },
*     options : {
*       background_running : true,     // server spawns a detached CLI process
*       files_selected     : string[]  // file names to process, e.g. ['finds_numisdata279_to_tchi1.json']
*     }
*   }
*
* The request is configured with:
*   retries : 1   — only one HTTP attempt; the long job must not be duplicated.
*   timeout : 3 600 000 ms (1 hour) — generous ceiling for the server to launch
*             the background process and return its pid before the fetch times out.
*
* @param {Array} files_selected - Non-empty array of JSON definition file names
*   selected by the administrator in the UI (e.g. ['finds_numisdata279_to_tchi1.json']).
*   Each name is validated against the server-side definitions directory.
* @returns {Promise<Object>|undefined} Resolves to the server response object
*   `{ result, msg, errors, pid, pfile }` on success, or undefined when
*   `files_selected` is empty.
*/
move_locator.prototype.exec_move_locator = async (files_selected) => {

	if (!files_selected.length) {
		return
	}

	// move_locator process fire
	const response = await data_manager.request({
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'move_locator',
				action	: 'move_locator'
			},
			options : {
				background_running	: true, // set run in background CLI
				files_selected		: files_selected // array e.g. ['finds_numisdata279_to_tchi1.json']
			}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})

	return response
}//end exec_move_locator



// @license-end
