// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {render_diffusion_server_control} from './render_diffusion_server_control.js'



/**
* DIFFUSION_SERVER_CONTROL
* Client-side controller for the area_maintenance widget that manages the
* Bun/TypeScript diffusion server. This is the model layer; all DOM work lives
* in render_diffusion_server_control.js.
*
* Responsibilities:
*  - Lifecycle: inherits init/render/refresh/destroy from widget_common.
*  - Data loading: inherits get_value from area_maintenance (fires
*    dd_area_maintenance_api::get_widget_value which calls the server-side
*    class.diffusion_server_control.php::get_value).
*  - Server control: start / stop / restart the Bun process via the OS
*    supervisor command configured in DEDALO_DIFFUSION_SERVICE_CMD (PHP side).
*  - Process management: cancel a single in-flight diffusion process by its
*    server-generated process_id.
*  - Deletion recovery: trigger a retry of pending unpublish deletions logged
*    in the dd1758 activity table.
*
* All mutating actions (start_server, stop_server, restart_server,
* cancel_process) are gated to global administrators on the server side via
* security::is_global_admin(). retry_pending_deletions is similarly gated
* inside dd_diffusion_api. The client does not duplicate those checks.
*
* Data shape received by get_value (stored in this.value):
*  {
*    server    : { reachable: boolean, checks: {server,php_api,sql}, msg: string }
*    processes : Array<{ process_id: string, is_running: boolean, data: {...} }>
*    config    : { endpoint_in_use, socket_path, api_url, internal_token_configured,
*                  service_cmd_configured, langs, resolve_levels }
*    pending   : number | null   // null if diffusion ontology not available
*    is_admin  : boolean
*  }
*
* Server peer:  core/area_maintenance/widgets/diffusion_server_control/class.diffusion_server_control.php
* Render peer:  core/area_maintenance/widgets/diffusion_server_control/js/render_diffusion_server_control.js
* API route:    dd_area_maintenance_api::widget_request → diffusion_server_control::<action>
*/
export const diffusion_server_control = function() {

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	// value holds the snapshot returned by get_value: server health, processes,
	// config diagnostics, pending deletion count, and admin flag.
	this.value

	this.node

	this.events_tokens	= []
	this.ar_instances	= []

	this.status
}//end diffusion_server_control



/**
* COMMON FUNCTIONS
* Prototype assignments that wire the shared lifecycle and render methods onto
* this widget. Dédalo widgets delegate their lifecycle to widget_common and
* their render methods to the companion render_* module, rather than inheriting
* via ES6 class extends.
*/
// prototypes assign
	// lifecycle
	diffusion_server_control.prototype.init		= widget_common.prototype.init
	diffusion_server_control.prototype.render	= widget_common.prototype.render
	diffusion_server_control.prototype.refresh	= widget_common.prototype.refresh
	diffusion_server_control.prototype.destroy	= widget_common.prototype.destroy
	// get_value issues a dd_area_maintenance_api::get_widget_value request; the
	// server delegates to diffusion_server_control::get_value() and the resolved
	// object is stored in this.value before the render cycle.
	diffusion_server_control.prototype.get_value	= area_maintenance.prototype.get_value
	// render
	// both 'edit' and 'list' modes render the same full control panel
	diffusion_server_control.prototype.edit		= render_diffusion_server_control.prototype.list
	diffusion_server_control.prototype.list		= render_diffusion_server_control.prototype.list



/**
* BUILD
* Custom build that delegates to widget_common.prototype.build for the standard
* widget boot sequence (status tracking, autoload guard). Data loading for this
* widget is deferred and handled by the area_maintenance open/load flow (see
* render_area_maintenance) — no extra data fetch is needed here.
* @param {boolean} [autoload=false] - When true the common build issues a
*   get_value request before rendering. For this widget the area open handler
*   calls get_value explicitly, so autoload is typically false.
* @returns {Promise<boolean>} Resolves to the return value of the common build.
*/
diffusion_server_control.prototype.build = async function(autoload=false) {

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
* WIDGET_REQUEST
* Shared transport helper: wraps data_manager.request to dispatch any action
* listed in diffusion_server_control::API_ACTIONS to the server via the
* dd_area_maintenance_api::widget_request route.
*
* The PHP side validates that `source.model === 'diffusion_server_control'` and
* that `source.action` is in the API_ACTIONS allowlist before dispatching,
* so any unrecognised action is rejected at the server without reaching PHP
* application code (SEC-044).
*
* retries is fixed at 1 (one attempt only) because lifecycle commands (start,
* stop, restart) must not be executed twice on a transient network error.
*
* @param {string}  action            - Server method name (e.g. 'start_server').
*   Must be present in class.diffusion_server_control.php::API_ACTIONS.
* @param {Object}  [options={}]      - Action-specific payload forwarded as-is
*   to the PHP action handler (e.g. { process_id } for cancel_process).
* @param {number}  [timeout=60000]   - Per-request timeout in milliseconds.
*   Long-running actions (retry_pending_deletions) pass a higher value.
* @returns {Promise<Object>} Resolves to the raw api_response object
*   { result, msg, errors, ... } from the PHP handler.
*/
diffusion_server_control.prototype.widget_request = async function(action, options={}, timeout=60*1000) {

	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'diffusion_server_control',
				action	: action
			},
			options	: options
		},
		retries : 1, // one try only
		timeout : timeout
	})
	if(SHOW_DEBUG===true) {
		console.log('diffusion_server_control ' + action + ' api_response:', api_response);
	}

	return api_response
}//end widget_request



/**
* START_SERVER
* Requests the PHP side to invoke the supervisor command with the 'start'
* keyword (DEDALO_DIFFUSION_SERVICE_CMD with %action%=start).
* Global-admin gated server-side. Uses the default 60 s timeout.
* @returns {Promise<Object>} api_response from the server
*   { result: boolean, msg: string, exit_code: number, output: string, errors: Array }
*/
diffusion_server_control.prototype.start_server = async function() {
	return this.widget_request('start_server')
}//end start_server

/**
* STOP_SERVER
* Requests the PHP side to invoke the supervisor command with the 'stop'
* keyword (DEDALO_DIFFUSION_SERVICE_CMD with %action%=stop).
* Global-admin gated server-side. Uses the default 60 s timeout.
* @returns {Promise<Object>} api_response from the server
*   { result: boolean, msg: string, exit_code: number, output: string, errors: Array }
*/
diffusion_server_control.prototype.stop_server = async function() {
	return this.widget_request('stop_server')
}//end stop_server

/**
* RESTART_SERVER
* Requests the PHP side to invoke the supervisor command with the 'restart'
* keyword (DEDALO_DIFFUSION_SERVICE_CMD with %action%=restart).
* Global-admin gated server-side. Uses the default 60 s timeout.
* @returns {Promise<Object>} api_response from the server
*   { result: boolean, msg: string, exit_code: number, output: string, errors: Array }
*/
diffusion_server_control.prototype.restart_server = async function() {
	return this.widget_request('restart_server')
}//end restart_server



/**
* CANCEL_PROCESS
* Cancels a single in-flight diffusion process on the Bun engine by delegating
* to diffusion_api_client::call('cancel_process', { process_id }) on the PHP
* side. The process_id is a server-generated opaque string; it is validated as
* a non-empty string in the PHP handler before being forwarded to the engine.
* Global-admin gated server-side.
* @param {string} process_id - The opaque process identifier returned by the
*   server's list_processes engine action and stored in this.value.processes[n].process_id.
* @returns {Promise<Object>} api_response from the server
*   { result: boolean, msg: string, errors: Array }
*/
diffusion_server_control.prototype.cancel_process = async function(process_id) {
	return this.widget_request('cancel_process', { process_id : process_id })
}//end cancel_process



/**
* RETRY_PENDING_DELETIONS
* Triggers a full retry of all pending unpublish-deletion records stored in the
* dd1758 activity log. The operation can be long-running for large backlogs, so
* the timeout is raised to 3 600 000 ms (1 hour). The server-side handler
* delegates to dd_diffusion_api::retry_pending_deletions and is itself
* global-admin gated.
* @returns {Promise<Object>} api_response from the server
*   { result: boolean, msg: string, count?: number, errors: Array }
*/
diffusion_server_control.prototype.retry_pending_deletions = async function() {
	// (!) 3 600 000 ms = 1 hour timeout — retry can be very slow for large backlogs
	return this.widget_request('retry_pending_deletions', {}, 3600 * 1000)
}//end retry_pending_deletions



// @license-end
