// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* MOVE_TLD (module)
*
* Client-side controller for the move_tld area_maintenance widget.
*
* Purpose:
*   Provides the constructor and API-call layer for the "Move TLD" maintenance
*   tool, which replaces ontology tipos (TLD = Top-Level Descriptor) across all
*   Dédalo matrix tables using JSON definition files stored under
*   /dedalo/core/base/transform_definition_files/move_tld/.
*
*   The tool is exposed inside area_maintenance as a standard widget: the user
*   selects one or more JSON definition files from the list, submits the form,
*   and the server-side `transform_data::changes_in_tipos` method is dispatched
*   as a long-running background CLI process.  Progress is tracked via
*   `update_process_status` (SSE stream), whose state is also persisted in
*   local IndexedDB under the key 'process_move_tld' so a page reload can
*   resume polling an already-running job.
*
*   A typical use case is remapping all records that reference a tipo from one
*   TLD domain to another (e.g. 'numisdata279' → 'tchi1') after a project
*   ontology restructuring.  Because the operation iterates every relevant row
*   across all matrix tables it can take hours, hence the 1-hour API timeout
*   and the background process pattern.
*
* Architecture:
*   move_tld (this file)         — constructor + exec_move_tld API call
*   render_move_tld.js           — render/view methods (list, get_content_data_edit)
*   class.move_tld.php           — server peer: get_value, move_tld API_ACTIONS
*   dd_area_maintenance_api      — API router that dispatches widget_request
*
* Lifecycle (delegated from widget_common / common):
*   init() → build() → render() → [refresh cycles] → destroy()
*
* Exports:
*   move_tld — the widget constructor function
*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_move_tld} from './render_move_tld.js'



/**
* MOVE_TLD
*
* Constructor for the move_tld widget instance.
*
* Declares the standard widget property set used throughout the lifecycle.
* All properties start as `undefined` (or an empty Array literal for
* collections) and are populated during `init()` from the options bag supplied
* by the parent component_info / area_maintenance controller.
*
* Property contract:
*   id             {string}        - Unique instance identifier (set by init).
*   section_tipo   {string}        - Ontology tipo of the parent section (e.g. 'oh1').
*   section_id     {string|number} - Record id within the parent section.
*   lang           {string}        - Active language tag (e.g. 'lg-spa').
*   mode           {string}        - Render mode: 'edit' | 'list'.
*   value          {Object}        - Widget payload from the server:
*                                    { body: string, files: Array<{file_name, content}> }
*                                    Populated by widget_common.build() via get_widget_value.
*   node           {HTMLElement}   - Root DOM node for this widget instance.
*   events_tokens  {Array}         - Event subscription tokens for cleanup in destroy().
*   ar_instances   {Array}         - Child component instances managed by this widget.
*   status         {string}        - Lifecycle status string (set by lifecycle methods).
*/
export const move_tld = function() {

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
}//end move_tld



/**
* COMMON FUNCTIONS
* Inherits the standard widget lifecycle and render dispatch from widget_common.
*
* All four lifecycle methods are delegated directly to widget_common, which in
* turn delegates destroy/refresh/render to common.  This means move_tld follows
* the canonical Dédalo lifecycle without any overrides:
*
*   init()    — seeds instance properties from the caller's options bag.
*   build()   — fires a 'get_widget_value' API request and stores the result
*               in self.value ({ body, files }).
*   render()  — dispatches to this.edit() or this.list() based on this.mode.
*   destroy() — unsubscribes all event tokens and removes the DOM node.
*
* Both render modes (edit and list) map to the same render_move_tld.prototype.list
* implementation because this widget has no distinct "edit" UI — the form is
* always the interactive file-selection + submit view.
*/
// prototypes assign
	// lifecycle
	move_tld.prototype.init		= widget_common.prototype.init
	move_tld.prototype.build	= widget_common.prototype.build
	move_tld.prototype.render	= widget_common.prototype.render
	move_tld.prototype.destroy	= widget_common.prototype.destroy
	// render
	move_tld.prototype.edit		= render_move_tld.prototype.list
	move_tld.prototype.list		= render_move_tld.prototype.list



/**
* EXEC_MOVE_TLD
*
* Fires the server-side `move_tld` action via the area_maintenance API and
* returns the response once the server has spawned the background process.
*
* The server dispatches `transform_data::changes_in_tipos` across all matrix
* tables as a long-running CLI process (background_running: true).  The
* immediate response therefore contains process identifiers for progress
* polling — not the final result:
*
*   response.pid   {string|number} - OS process id of the spawned CLI worker.
*   response.pfile {string}        - Server-side path to the process status file
*                                    read by update_process_status (SSE stream).
*
* The caller (render_move_tld → on_submit) pipes these values into
* `update_process_status` to display a live status feed while the job runs.
*
* Request options:
*   retries : 1       — no automatic retry; the process may already be running.
*   timeout : 3600 s  — large timeout to accommodate very long database sweeps
*                       across all matrix tables.
*
* (!) `prevent_lock: true` is set so that no section record lock is acquired for
*     this maintenance operation, which touches many records across many tables.
*
* (!) This method is defined as an arrow function on the prototype, so `this`
*     inside the body refers to the enclosing module scope, not the widget
*     instance.  The method does not use `this`, which makes the binding
*     irrelevant in practice, but callers should be aware of the pattern.
*
* @param {Array<string>} files_selected - Non-empty array of JSON definition
*        file names to process, e.g. ['finds_numisdata279_to_tchi1.json'].
*        The server validates each name against the known definition files
*        returned by area_maintenance::get_definitions_files('move_tld').
* @returns {Promise<Object|undefined>} Resolves to the API response object on
*        success, or `undefined` if `files_selected` is empty (early return).
*/
move_tld.prototype.exec_move_tld = async (files_selected) => {

	if (!files_selected.length) {
		return
	}

	// move_tld process fire
	const response = await data_manager.request({
		body : {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'move_tld',
				action	: 'move_tld'
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
}//end exec_move_tld



// @license-end
