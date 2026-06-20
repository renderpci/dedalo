// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_move_to_portal} from './render_move_to_portal.js'



/**
* MOVE_TO_PORTAL
* Area-maintenance widget that re-maps ("portalizes") Dédalo section data from
* one section tipo to another, then stitches the migrated records together with
* a portal component.
*
* This widget is designed for bulk, one-off data-migration tasks such as moving
* "Use and function" component records from a legacy section to a new section
* type and wiring them up via a portal (e.g. qdp443 → rsc1340).  The migration
* definition is driven by JSON map files stored on the server under
* /dedalo/core/base/transform_definition_files/move_to_portal/; this widget
* presents the available files, lets the operator select one or more, and then
* dispatches the long-running PHP job via the maintenance API.
*
* The operation is CPU- and I/O-intensive (it walks every record in every
* affected table), so it runs as a background CLI process whose progress is
* tracked via update_process_status and a local IndexedDB status key.
*
* Lifecycle (inherited from widget_common):
*   init() → build() → render() → [exec_move_to_portal() on user submit] → destroy()
*
* Server peer:   core/area_maintenance/widgets/move_to_portal/class.move_to_portal.php
* Render module: render_move_to_portal (render_move_to_portal.js)
*
* Exported:
*   move_to_portal — constructor (prototype-assignment style)
*/



/**
* MOVE_TO_PORTAL
* Constructor for the move_to_portal widget instance.
*
* Declares all well-known instance properties so they are visible on the object
* from the moment of construction.  Actual values are populated by
* widget_common.prototype.init() during the lifecycle init phase.
*
* Properties:
*   id            — unique instance identifier string (set by init)
*   section_tipo  — ontology tipo of the parent section (set by init)
*   section_id    — record identifier within the parent section (set by init)
*   lang          — active language tag, e.g. 'lg-eng' (set by init)
*   mode          — render mode: 'edit' | 'list' (set by init)
*   value         — widget payload from the server; shape:
*                   { body: string (HTML description), files: Array<{file_name, content}> }
*   node          — root DOM node created by render (set by render)
*   events_tokens — accumulated event subscription tokens for teardown in destroy()
*   ar_instances  — child widget/component instances (used for nested lifecycles)
*   status        — current lifecycle state string (managed by lifecycle methods)
*/
export const move_to_portal = function() {

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
}//end move_to_portal



/**
* COMMON FUNCTIONS
* Extend the move_to_portal prototype with shared lifecycle and render methods
* from widget_common and render_move_to_portal.
*
* Lifecycle methods (from widget_common):
*   init    — seeds all instance properties from the options bag supplied by
*             the parent area_maintenance renderer.
*   build   — advances status to 'built'; for this widget the value is already
*             inlined by the server (class.move_to_portal::get_value), so no
*             additional API fetch is needed inside build().
*   render  — dispatches to this.edit() or this.list() based on this.mode.
*   destroy — unsubscribes all events_tokens and removes the DOM node.
*
* Render methods (from render_move_to_portal):
*   edit / list — both point to render_move_to_portal.prototype.list, which
*                 builds the file-selection form and the live process-status
*                 display.  There is no separate edit view for this widget.
*/
// prototypes assign
	// lifecycle
	move_to_portal.prototype.init		= widget_common.prototype.init
	move_to_portal.prototype.build	= widget_common.prototype.build
	move_to_portal.prototype.render	= widget_common.prototype.render
	move_to_portal.prototype.destroy	= widget_common.prototype.destroy
	// render
	move_to_portal.prototype.edit		= render_move_to_portal.prototype.list
	move_to_portal.prototype.list		= render_move_to_portal.prototype.list



/**
* EXEC_MOVE_TO_PORTAL
* Dispatches the 'move_to_portal' action to the server-side maintenance API and
* returns the initial response object.
*
* The operation is deliberately fire-and-track: the PHP handler launches a
* background CLI process (background_running: true) and immediately returns a
* process handle ({ pid, pfile }).  The caller (render_move_to_portal's submit
* handler) then feeds that handle to update_process_status() so the UI can poll
* for completion without blocking the browser.
*
* The request uses a dedicated timeout of 1 hour (3 600 000 ms) because the
* portalization walk can span millions of records.  retries is set to 1 (one
* attempt only) to avoid accidentally triggering duplicate migrations if the
* network hiccups partway through the long-poll period.
*
* API route:
*   dd_api  : 'dd_area_maintenance_api'
*   action  : 'widget_request'
*   source  : { type: 'widget', model: 'move_to_portal', action: 'move_to_portal' }
*
* Server handler: class.move_to_portal::move_to_portal()
*   Resolves the file names against the definitions directory, then delegates to
*   transform_data::portalize_data($ar_file_name).
*
* (!) This method uses an arrow function (`= async (files_selected) =>`), so
*     `this` inside the body is the enclosing module scope, NOT the widget
*     instance.  The method therefore cannot access instance properties such as
*     `this.section_tipo`.  All required inputs must be passed via the
*     `files_selected` argument or captured from the API request body literals.
*
* @param {Array<string>} files_selected - Names of the JSON definition files to
*   process, e.g. ['finds_numisdata279_to_tchi1.json'].  Must be non-empty;
*   the function returns undefined immediately if the array is empty.
* @returns {Promise<Object>|undefined} The raw API response object on success,
*   or undefined when files_selected is empty.
*   Response shape (from class.move_to_portal::move_to_portal):
*   { result: boolean|*, msg: string, errors: Array, pid: string, pfile: string }
*/
move_to_portal.prototype.exec_move_to_portal = async (files_selected) => {

	if (!files_selected.length) {
		return
	}

	// move_to_portal process fire
	const response = await data_manager.request({
		body : {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'move_to_portal',
				action	: 'move_to_portal'
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
}//end exec_move_to_portal



// @license-end
