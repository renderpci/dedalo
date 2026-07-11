// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* MOVE_LANG (module)
*
* Client-side controller for the move_lang area_maintenance widget.
*
* Purpose:
*   Provides the constructor and API-call layer for the "Move Language" maintenance
*   tool, which converts map items (e.g., a thesaurus hierarchy) between translatable
*   and non-translatable component types using JSON definition files stored under
*   /dedalo/core/base/transform_definition_files/move_lang/.
*
*   The tool is exposed inside area_maintenance as a standard widget: the user selects
*   one or more JSON definition files from the list, submits the form, and the
*   server-side `transform_data::change_data_lang` method is dispatched as a
*   long-running background CLI process.  Progress is tracked via `update_process_status`
*   (SSE stream), whose state is also persisted in local IndexedDB under the key
*   'process_move_lang' so a reload can resume polling an already-running job.
*
* Architecture:
*   move_lang (this file)        — constructor + exec_move_lang API call
*   render_move_lang.js          — render/view methods (list, get_content_data_edit)
*   class.move_lang.php          — server peer: get_value, move_lang API_ACTIONS
*   dd_area_maintenance_api      — API router that dispatches widget_request
*
* Lifecycle (delegated from widget_common / common):
*   init() → build() → render() → [refresh cycles] → destroy()
*
* Exports:
*   move_lang — the widget constructor function
*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_move_lang} from './render_move_lang.js'



/**
* MOVE_LANG
*
* Constructor for the move_lang widget instance.
*
* Declares the standard widget property set used throughout the lifecycle.
* All properties start as `undefined` (or an empty Array/Object literal for
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
*   node           {HTMLElement}   - Root DOM node for this widget instance.
*   events_tokens  {Array}         - Event subscription tokens for cleanup in destroy().
*   ar_instances   {Array}         - Child component instances managed by this widget.
*   status         {string}        - Lifecycle status string (set by lifecycle methods).
*/
export const move_lang = function() {

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
}//end move_lang



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	move_lang.prototype.init	= widget_common.prototype.init
	move_lang.prototype.build	= widget_common.prototype.build
	move_lang.prototype.render	= widget_common.prototype.render
	move_lang.prototype.destroy	= widget_common.prototype.destroy
	// render
	move_lang.prototype.edit		= render_move_lang.prototype.list
	move_lang.prototype.list		= render_move_lang.prototype.list



/**
* EXEC_MOVE_LANG
*
* Fires the server-side `move_lang` action via the area_maintenance API and
* returns the response once the server has spawned the background process.
*
* The server dispatches `transform_data::change_data_lang` as a long-running
* CLI process (background_running: true).  The immediate response therefore
* contains the process identifiers needed for progress polling — not the final
* result:
*
*   response.pid   {string|number} - OS process id of the spawned CLI worker.
*   response.pfile {string}        - Server-side path to the process status file
*                                    read by update_process_status (SSE stream).
*
* The caller (render_move_lang → on_submit) pipes these values into
* `update_process_status` to display a live status feed while the job runs.
*
* Request options:
*   retries : 1       — no automatic retry; the process may already be running.
*   timeout : 3600 s  — large timeout to accommodate very long database sweeps
*                       (the operation iterates all relevant records).
*
* (!) `prevent_lock: true` is set so that no section record lock is acquired for
*     this maintenance operation, which touches many records across multiple tables.
*
* @param {Array<string>} files_selected - Non-empty array of JSON definition
*        file names to process, e.g. ['change_hierarchy89_to_nolan.json'].
*        The server validates each name against the known definition files.
* @returns {Promise<Object|undefined>} Resolves to the API response object on
*        success, or `undefined` if `files_selected` is empty (early return).
*/
move_lang.prototype.exec_move_lang = async (files_selected) => {

	if (!files_selected.length) {
		return
	}

	// move_lang process fire
	const response = await data_manager.request({
		body : {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'move_lang',
				action	: 'move_lang'
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
}//end exec_move_lang



// @license-end
