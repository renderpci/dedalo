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
*      area_maintenance, which fires a long-lived worker request to
*      dd_area_maintenance_api::get_widget_value.
*   3. Expose two async methods that drive the two-phase update workflow:
*      - `get_code_update_info`  — interrogates a remote Dédalo distribution
*        server and returns the list of available release zips plus metadata about
*        the current running version.
*      - `update_code`           — triggers the actual server-side extraction and
*        file replacement, using a web worker to avoid blocking the main thread.
*
* The DOM layer (modal, file-selection radio list, incremental/clean toggle,
* progress/error display, build-from-git buttons) is handled entirely by
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
*   - `beta_update`: boolean toggled by the beta-checkbox in the modal; controls
*     whether "development" version entries are visible in the file picker.
*     Defaults to false (hidden) when the modal closes.
*   - `update_mode`: the active extraction strategy, one of:
*       'incremental' — only changed files are replaced (faster, lower risk).
*       'clean'       — the entire code directory is removed and replaced
*                       (required when a version enforces force_update_mode:'clean').
*     Must be explicitly chosen by the operator before the update button is enabled.
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
*   @property {string}    value.dedalo_source_version_local_dir - Local path of the current source.
*   @property {boolean}   value.is_a_code_server             - True when this node is a
*                                                              Dédalo distribution server.
* @property {HTMLElement} node          - Root DOM node after render.
* @property {boolean}     beta_update   - Whether beta/development releases are visible.
* @property {string}      update_mode   - Chosen update strategy: 'incremental' | 'clean'.
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

	// bool beta_update
	this.beta_update

	// string update_mode : incremental | clean
	this.update_mode

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
* release archives and the metadata of the currently-running installation.
*
* This is Phase 1 of the two-step update workflow.  The result is passed
* to render_update_code.js::render_info_modal so the operator can inspect
* available versions and choose one before committing to an update.
*
* The request is sent directly to the distribution server URL (not through
* the local API) using `data_manager.request` with a 1-hour timeout, because
* the remote server may itself need time to build or sign the release list.
*
* The `prevent_lock` flag ensures the request does not acquire a Dédalo record
* lock on either side.
*
* @param {Object} server - Active distribution server descriptor.
* @param {string} server.code - Server authentication / identifier code passed
*   to the remote API so it can scope the response to this installation.
* @param {string} server.url  - Full URL of the remote dd_utils_api endpoint.
* @returns {Promise<Object>} api_response — direct API envelope from the remote
*   server:
*   {
*     result : {
*       files : Array<{
*         version : string,   // e.g. "6.4.0" or "development"
*         url     : string,   // download URL for the zip archive
*         date    : string,   // ISO 8601 build timestamp
*         active  : boolean,  // true after the operator selects this entry
*         force_update_mode : string|undefined  // 'clean' when mandated
*       }>,
*       info : {
*         version      : string,  // e.g. "6.4.0"
*         date         : string,
*         entity_id    : number,
*         entity       : string,
*         entity_label : string,
*         host         : string,
*         tool_names   : string[]
*       }
*     },
*     msg    : string,
*     errors : string[]
*   }
*/
update_code.prototype.get_code_update_info = async ( server ) => {

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
				code	: code
			}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})
	if(SHOW_DEBUG===true) {
		console.log('))) get_code_update_info update_code api_response:', api_response);
	}


	return api_response
}//end get_code_update_info



/**
* UPDATE_CODE
* Triggers the server-side code replacement process for the selected release.
*
* This is Phase 2 of the two-step update workflow; it is only called after the
* operator has reviewed the available versions in the modal
* (render_update_code.js::render_info_modal), selected a release zip, and chosen
* an update mode.
*
* The request is routed to the local PHP API (`dd_area_maintenance_api`,
* `widget_request` action) — NOT to the remote distribution server — and
* delegated server-side to the `update_code` action of
* `class.update_code.php::update_code`.  The PHP handler downloads the chosen
* zip, verifies it, and either:
*   - extracts only changed files ('incremental'), or
*   - removes the entire code directory and replaces it ('clean').
*
* Because extraction and file I/O can take minutes on large installations, the
* request is dispatched through a dedicated web worker (`use_worker: true`) to
* keep the main thread responsive during the wait.
*
* A 1-hour timeout and single-retry policy mirror get_code_update_info; the
* `prevent_lock` flag avoids the record-lock mechanism on both ends.
*
* After a successful response the caller (render_update_code.js) schedules
* `force_quit()` to log out and bust the browser's ES-module cache, which is
* necessary because the newly-installed PHP and JS files may differ from what
* the browser has cached.
*
* @param {Object} options - Update parameters assembled by the modal.
* @param {Object} options.info - Version/entity metadata from Phase 1:
*   {
*     version      : string,  // e.g. "6.4.0"
*     date         : string,
*     entity_id    : number,
*     entity       : string,
*     entity_label : string,
*     host         : string,
*     tool_names   : string[]
*   }
* @param {Object} options.file_active - The release zip entry selected by the
*   operator (the entry whose `active` flag was set to true in the modal):
*   {
*     version          : string,  // e.g. "development"
*     url              : string,  // download URL sent to the PHP handler
*     active           : boolean, // always true when passed here
*     force_update_mode: string|undefined
*   }
* @param {string} options.update_mode - Extraction strategy chosen by the
*   operator: 'incremental' | 'clean'.
* @returns {Promise<Object>} api_response — standard Dédalo API envelope:
*   {
*     result : boolean|Object,  // truthy on success
*     msg    : string,
*     errors : string[]
*   }
*/
update_code.prototype.update_code = async ( options ) => {

	// options
	const file_active	= options.file_active
	const update_mode	= options.update_mode
	const info			= options.info

	const api_response = await data_manager.request({
		use_worker	: true,
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
				file		: file_active,
				update_mode	: update_mode,
				info		: info
			}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})
	if(SHOW_DEBUG===true) {
		console.log('))) update_code update_code api_response:', api_response);
	}


	return api_response
}//end update_code



// @license-end
