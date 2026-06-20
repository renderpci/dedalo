// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_move_to_table} from './render_move_to_table.js'



/**
* MOVE_TO_TABLE
* Area-maintenance widget that moves Dédalo section data between PostgreSQL matrix
* tables using JSON transformation-definition files.
*
* A typical use-case is migrating legacy toponym data stored in a flat table such
* as `utoponymy1` into the hierarchical `matrix_hierarchy` table.  The mapping is
* described by JSON files held under:
*   /dedalo/core/base/transform_definition_files/move_to_table/
* The widget lists those files (via `get_value` → PHP `move_to_table::get_value`),
* lets the administrator select one or more, and then triggers the transformation
* via `exec_move_to_table` (→ PHP `move_to_table::move_to_table` →
* `transform_data::move_data_between_matrix_tables`).
*
* Widget lifecycle (inherited from widget_common):
*   init() → build() → render() → [edit|list] → destroy()
*
* Both `edit` and `list` render modes delegate to the same
* `render_move_to_table.prototype.list` method, which builds a file-selection
* checklist and a submit form with a long-running background process monitor.
*
* The transformation can take up to one hour; `exec_move_to_table` therefore sets
* `timeout: 3600 * 1000` and `retries: 1` to avoid duplicate executions on
* transient network errors.  Progress is tracked asynchronously via the shared
* `update_process_status` / IndexedDB mechanism defined in render_move_to_table.js.
*
* Server peer:   core/area_maintenance/widgets/move_to_table/class.move_to_table.php
* API handler:   dd_area_maintenance_api (action: widget_request)
* Transform engine: core/base/upgrade/class.transform_data.php
*
* @exports {Function} move_to_table
*/
export const move_to_table = function() {

	// {string} Unique widget instance identifier (matches the server-side model name).
	this.id

	// {string} Section tipo (ontology descriptor) this widget is attached to.
	this.section_tipo
	// {string|number} Section record identifier.
	this.section_id
	// {string} Active language code (e.g. 'lg-eng').
	this.lang
	// {string} Current render mode: 'edit' or 'list' (both map to the same render).
	this.mode

	// {Object} Widget value payload populated by get_value on first load. Shape:
	//   {
	//     body  : string  — HTML description shown above the file checklist,
	//     files : Array   — objects with { file_name: string, content: Object }
	//                       representing each available JSON definition file.
	//   }
	this.value

	// {HTMLElement} Root DOM node for this widget instance once rendered.
	this.node

	// {Array} Subscribed event tokens for cleanup in destroy().
	this.events_tokens	= []
	// {Array} Child widget instances managed by this widget.
	this.ar_instances	= []

	// {string|null} Last error status, set when build() catches an exception.
	this.status
}//end move_to_table



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	move_to_table.prototype.init		= widget_common.prototype.init
	move_to_table.prototype.build	= widget_common.prototype.build
	move_to_table.prototype.render	= widget_common.prototype.render
	move_to_table.prototype.destroy	= widget_common.prototype.destroy
	// render — both modes show the same file-selection + process panel
	move_to_table.prototype.edit		= render_move_to_table.prototype.list
	move_to_table.prototype.list		= render_move_to_table.prototype.list



/**
* EXEC_MOVE_TO_TABLE
* Sends the 'move_to_table' action to the server-side widget handler and triggers
* the background data-migration process.
*
* The call dispatches to:
*   dd_area_maintenance_api → widget_request → move_to_table::move_to_table (PHP)
*   → transform_data::move_data_between_matrix_tables
*
* `background_running: true` instructs the PHP layer to spawn a detached CLI
* process so that the HTTP connection does not need to stay open for the full
* duration.  The response therefore returns quickly with a `pid` and `pfile`
* that the caller passes to `update_process_status` for async progress polling.
*
* `prevent_lock: true` prevents the request from acquiring a record-write lock,
* which is inappropriate for a bulk migration task.
*
* (!) This method is defined as an arrow function (`async (files_selected) =>`),
* which means `this` inside the body is lexically bound to the module scope, not
* to the widget instance.  Any future code that needs `this` inside this method
* must convert it to a regular function.
*
* @param {Array} files_selected - Non-empty array of JSON definition file names to
*   process, e.g. ['location_ubication1_to_hierarchy.json'].  Each name must match
*   a file returned by the server's `get_value` call.
* @returns {Promise<Object>} API response object with shape:
*   { result: boolean|Object, msg: string, errors: Array, pid: number, pfile: string }
*   Returns `undefined` (early return) if `files_selected` is empty or nullish.
*/
move_to_table.prototype.exec_move_to_table = async (files_selected) => {

	if (!files_selected?.length) {
		console.error('No files selected');
		return
	}

	// move_to_table process fire
	const response = await data_manager.request({
		body : {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'move_to_table',
				action	: 'move_to_table'
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
}//end exec_move_to_table



// @license-end
