// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../js/area_maintenance.js'
	import {exec_move_transform} from '../../../js/move_transform.js'
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
	// data: the panel value (explanation body + the definition files to
	// pick from) is served by the widget's server getValue and fetched
	// LAZILY on panel-open by the unified widget load(). Without this
	// assignment widget_common.load() no-ops and the panel renders with
	// no body and an EMPTY file list — the transform is unusable.
	move_to_table.prototype.get_value	= area_maintenance.prototype.get_value
	// render — both modes show the same file-selection + process panel
	move_to_table.prototype.edit		= render_move_to_table.prototype.list
	move_to_table.prototype.list		= render_move_to_table.prototype.list



/**
* EXEC_MOVE_TO_TABLE
* Fire one move_to_table run through the shared move_* flow (move_transform.js). The
* server runs it as a JOB and answers {pid, pfile, dry_run} at once; the
* caller streams it with update_process_status.
*
* @param {Array<string>} files_selected - Non-empty array of definition file names.
* @param {boolean} [dry_run=true] - true = PREVIEW (writes nothing); false =
*        EXECUTE (rewrites stored data — the server mutates only on exactly false).
* @returns {Promise<Object|undefined>} The API response, or `undefined` when
*        `files_selected` is empty.
*/
move_to_table.prototype.exec_move_to_table = async (files_selected, dry_run=true) => {

	if (!files_selected.length) {
		return
	}

	return exec_move_transform('move_to_table', files_selected, dry_run)
}//end exec_move_to_table



// @license-end
