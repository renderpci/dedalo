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
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../js/area_maintenance.js'
	import {exec_move_transform} from '../../../js/move_transform.js'
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
	// data: the panel value (explanation body + the definition files to
	// pick from) is served by the widget's server getValue and fetched
	// LAZILY on panel-open by the unified widget load(). Without this
	// assignment widget_common.load() no-ops and the panel renders with
	// no body and an EMPTY file list — the transform is unusable.
	move_tld.prototype.get_value	= area_maintenance.prototype.get_value
	// render
	move_tld.prototype.edit		= render_move_tld.prototype.list
	move_tld.prototype.list		= render_move_tld.prototype.list



/**
* EXEC_MOVE_TLD
* Fire one move_tld run through the shared move_* flow (move_transform.js). The
* server runs it as a JOB and answers {pid, pfile, dry_run} at once; the
* caller streams it with update_process_status.
*
* @param {Array<string>} files_selected - Non-empty array of definition file names.
* @param {boolean} [dry_run=true] - true = PREVIEW (writes nothing); false =
*        EXECUTE (rewrites stored data — the server mutates only on exactly false).
* @returns {Promise<Object|undefined>} The API response, or `undefined` when
*        `files_selected` is empty.
*/
move_tld.prototype.exec_move_tld = async (files_selected, dry_run=true) => {

	if (!files_selected.length) {
		return
	}

	return exec_move_transform('move_tld', files_selected, dry_run)
}//end exec_move_tld



// @license-end
