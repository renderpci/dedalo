// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* UPDATE_CODE
* Widget controller for the "Update code" maintenance panel.
*
* This module implements the model layer for the code-update widget inside the
* area_maintenance dashboard.  Its role is to:
*
*   1. Provide the standard Dédalo widget lifecycle (init → build → render →
*      destroy) by delegating those prototype methods to widget_common.
*   2. Provide `get_value` (loading this widget's server-side data payload) from
*      area_maintenance (dd_area_maintenance_api::get_widget_value).
*   3. Expose two async methods that drive the two-phase update workflow:
*      - `get_code_update_info`  — interrogates a remote Dédalo distribution
*        server and returns the list of available release zips plus metadata about
*        the current running version.
*      - `update_code`           — submits the server-side update as a BACKGROUND
*        JOB; the response returns immediately with `pid` + `pfile` extension
*        keys and the render layer follows the job's status stream.
*
* The DOM layer (modal, file-selection radio list, phase-track progress,
* error display, build-from-git buttons) is handled entirely by
* render_update_code.js.
*
* Lifecycle:
*   init()      → widget_common.prototype.init   (seeds properties, sets status)
*   build()     → widget_common.prototype.build  (calls get_value, populates self.value)
*   render()    → widget_common.prototype.render (dispatches to this.list())
*   destroy()   → widget_common.prototype.destroy
*   list/edit() → render_update_code.prototype.list (the DOM factory)
*
* Main export: `update_code` (constructor).
*
* @see core/area_maintenance/widgets/update_code/js/render_update_code.js — DOM rendering
* @see core/area_maintenance/js/area_maintenance.js — get_value + init_form contracts
* @see core/widgets/widget_common/js/widget_common.js — shared widget lifecycle base
*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {render_update_code} from './render_update_code.js'



/**
* UPDATE_CODE
* Constructor for the update_code widget instance.
*
* All properties are declared here as undefined (the Dédalo convention for
* declaring the instance shape in the constructor body).  They are populated
* during the lifecycle:
*
*   - `id`, `section_tipo`, `section_id`, `lang`, `mode`, `node`, `status`:
*     seeded by widget_common.prototype.init from the options bag.
*   - `value`:  populated by build() after get_value() returns the server
*     payload (servers list, local-dir path, is_a_code_server flag, etc.).
*   - `events_tokens`: array of subscription tokens registered via event_manager;
*     destroyed in widget_common.prototype.destroy.
*   - `ar_instances`: child instances managed by this widget (unused in current
*     implementation but kept for lifecycle symmetry with other widgets).
*
* @property {string}      id            - Unique instance identifier.
* @property {string}      section_tipo  - Ontology tipo of the parent section.
* @property {string}      section_id    - Row id of the parent section record.
* @property {string}      lang          - Active UI language code.
* @property {string}      mode          - Render mode ('edit' or 'list').
* @property {Object}      value         - Data payload from the server:
*   @property {Array}     value.servers                      - Available distribution servers.
*   @property {boolean}   value.is_a_code_server             - True when this node is a
*                                                              Dédalo distribution server.
* @property {HTMLElement} node          - Root DOM node after render.
* @property {Array}       events_tokens - Subscribed event tokens (cleaned up on destroy).
* @property {Array}       ar_instances  - Child widget instances.
* @property {string}      status        - Lifecycle state managed by widget_common.
*/
export const update_code = function() {

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
}//end update_code



/**
* COMMON FUNCTIONS
* Prototype assignments that wire the standard widget and area_maintenance
* lifecycle into update_code.
*
* Lifecycle (from widget_common):
*   init    — seeds all declared properties from the options bag; sets
*             status = 'initializing' → 'initialized'.
*   build   — calls this.get_value() to fetch the server-side data payload and
*             stores it in this.value; sets status = 'building' → 'built'.
*   render  — dispatches to this.edit() or this.list() depending on this.mode.
*   destroy — unsubscribes all events_tokens, removes the DOM node.
*
* Data (from area_maintenance):
*   get_value — fires a worker request to dd_area_maintenance_api::get_widget_value
*               with this widget's id as source.model; returns the raw API result.
*               The 1-hour timeout and single-retry policy are inherited unchanged.
*
* Render (from render_update_code):
*   edit / list — both point to render_update_code.prototype.list, which builds
*                 the full widget wrapper (version info, server selector, update
*                 button, optional build-from-git controls).
*/
// prototypes assign
	// lifecycle
	update_code.prototype.init		= widget_common.prototype.init
	update_code.prototype.build		= widget_common.prototype.build
	update_code.prototype.render	= widget_common.prototype.render
	update_code.prototype.destroy	= widget_common.prototype.destroy
	update_code.prototype.get_value	= area_maintenance.prototype.get_value
	// render
	update_code.prototype.edit		= render_update_code.prototype.list
	update_code.prototype.list		= render_update_code.prototype.list



/**
* GET_CODE_UPDATE_INFO
* Queries a remote Dédalo distribution server for the list of available
* release archives and the metadata of the serving installation.
*
* Phase 1 of the two-step update workflow. The result is passed to
* render_update_code.js::render_info_modal so the operator can inspect
* available versions and choose one before committing to an update.
*
* The request is sent directly to the distribution server URL (not through
* the local API) using `data_manager.request`. The remote lists an existing
* manifest — it does not build one — so a normal 60 s timeout is enough.
*
* The `prevent_lock` flag ensures the request does not acquire a Dédalo record
* lock on either side.
*
* @param {Object} server - Active distribution server descriptor.
* @param {string} server.code - Server authentication / identifier code passed
*   to the remote API so it can scope the response to this installation.
* @param {string} server.url  - Full URL of the remote dd_utils_api endpoint.
* @param {string} [channel] - 'dev' to ALSO ask for developer builds (the panel's
*   "Developer builds" switch); anything else asks for published releases only.
* @returns {Promise<Object>} api_response — envelope from the remote server:
*   {
*     data : {
*       files : Array<{
*         version : string,   // numeric release, e.g. "6.4.0"
*         url     : string,   // download URL for the zip archive
*         date    : string,   // ISO 8601 build timestamp
*         active  : boolean   // true after the operator selects this entry
*       }>,
*       info : {
*         version   : string, // e.g. "6.4.0"
*         date      : string,
*         entity_id : number,
*         entity    : string,
*         host      : string
*       }
*     },
*     msg    : string,
*     errors : string[]
*   }
*/
update_code.prototype.get_code_update_info = async function ( server, channel ) {

	// short vars
		const code				= server.code
		const url				= server.url
		const dedalo_version	= page_globals.dedalo_version

	const api_response = await data_manager.request({
		url		: url,
		body	: {
			dd_api			: 'dd_utils_api',
			action			: 'get_code_update_info',
			prevent_lock	: true,
			source			: {},
			options			: {
				version	: dedalo_version,
				code	: code,
				// 'dev' asks the master to ALSO offer developer builds (branch
				// builds, same version — no bump). It is an ask, not a right: a
				// master that did not opt in answers exactly as it does for
				// 'master'. Anything but 'dev' is the release channel.
				channel	: channel==='dev' ? 'dev' : 'master'
			}
		},
		retries : 1, // one try only
		timeout : 60 * 1000 // it lists an existing manifest
	})
	if(SHOW_DEBUG===true) {
		console.log('))) get_code_update_info update_code api_response:', api_response);
	}


	return api_response
}//end get_code_update_info



/**
* UPDATE_CODE
* Submits the server-side code replacement as a BACKGROUND JOB.
*
* Phase 2 of the two-step update workflow; called after the operator has
* selected a release in the modal (render_update_code.js::render_info_modal)
* and accepted the confirm dialog.
*
* The request is routed to the local API (`dd_area_maintenance_api`,
* `widget_request` action → the `update_code` widget action). The server
* verifies the request, SUBMITS the job and answers immediately: the response
* carries `pid` + `pfile` extension keys and the render layer follows the
* job's status stream (update_process_status), including the mid-job server
* restart and the /health polling that ends it.
*
* The `prevent_lock` flag avoids the record-lock mechanism on both ends.
*
* @param {Object} options - Update parameters assembled by the modal.
* @param {Object} options.info - Version/entity metadata from Phase 1:
*   { version, date, entity_id, entity, host }
* @param {Object} options.file_active - The release zip entry selected by the
*   operator: { version, url, date, active }
* @returns {Promise<Object>} api_response — envelope with `pid` + `pfile`
*   extension keys on success (the job handle), `error` on failure.
*/
update_code.prototype.update_code = async function ( options ) {

	// options
	const file_active	= options.file_active
	const info			= options.info

	const api_response = await data_manager.request({
		body		: {
			dd_api		: 'dd_area_maintenance_api',
			action		: 'widget_request',
			prevent_lock	: true,
			source		: {
				type	: 'widget',
				model	: 'update_code',
				action	: 'update_code'
			},
			options	: {
				file	: file_active,
				info	: info
			}
		},
		retries : 1, // one try only
		timeout : 60 * 1000 // the job is submitted, not awaited
	})
	if(SHOW_DEBUG===true) {
		console.log('))) update_code update_code api_response:', api_response);
	}


	return api_response
}//end update_code



// @license-end
