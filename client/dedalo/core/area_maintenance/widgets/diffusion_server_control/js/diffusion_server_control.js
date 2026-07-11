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
* Client-side controller for the area_maintenance widget that observes and
* controls the NATIVE diffusion engine. This is the model layer; all DOM work
* lives in render_diffusion_server_control.js.
*
* The native engine has no separate daemon: it IS the main server, backed by a
* durable Postgres job queue + an in-process scheduler + spawned per-job
* runners. So there is nothing to "start/stop/restart" — instead the widget
* controls the QUEUE and the FLOW.
*
* Responsibilities:
*  - Lifecycle: inherits init/render/refresh/destroy from widget_common.
*  - Data loading: inherits get_value from area_maintenance (fires
*    dd_area_maintenance_api::get_widget_value → the server get_value handler).
*  - Job control: cancel an active job, requeue a terminal/interrupted job,
*    purge aged terminal jobs.
*  - Flow control: pause / resume the scheduler's job dispatch.
*  - Deletion recovery: retry pending unpublish deletions logged in dd1758.
*
* Every mutating action is gated to global administrators by the server-side
* widget dispatch gate; the client does not duplicate those checks.
*
* Data shape received by get_value (stored in this.value):
*  {
*    engine    : { state, title, checks: { engine, formats } }   // native advisory
*    scheduler : { running, max_runners, queued, stale_after_seconds, paused }
*    jobs      : Array<{ job_id, process_id, state, element_tipo, section_tipo,
*                        type, counter, total, msg, attempt, max_attempts, ... }>
*    pending   : number | null   // null if diffusion ontology not available
*    config    : { native, native_elements, resolve_levels, langs, batch_rows,
*                  batch_records, target_db_socket, target_db_host,
*                  target_db_user_configured, formats }
*    is_admin  : boolean
*  }
*
* Server peer:  src/core/resolve/widget_request.ts (diffusion_server_control handlers)
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
* retries is fixed at 1 (one attempt only) because mutating actions (cancel,
* requeue, purge, set_scheduler) must not be executed twice on a transient
* network error.
*
* @param {string}  action            - Server method name (e.g. 'requeue_job').
*   Must be present in the diffusion_server_control server-side API_ACTIONS.
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
* CANCEL_PROCESS
* Cancels a single active diffusion job (queued or running) by its client
* process_id. The server marks the durable queue row cancelled (admin scope);
* a running runner honors the flag between batches, a queued job finalizes at
* once. Global-admin gated server-side.
* @param {string} process_id - The client process id shown in this.value.jobs[n].process_id.
* @returns {Promise<Object>} api_response { result: boolean, msg: string, errors: Array }
*/
diffusion_server_control.prototype.cancel_process = async function(process_id) {
	return this.widget_request('cancel_process', { process_id : process_id })
}//end cancel_process



/**
* REQUEUE_JOB
* Re-runs a terminal or interrupted job (failed / cancelled / interrupted) by
* its durable job_id: the server resets it to 'queued' with a fresh attempt
* budget and kicks the scheduler. Global-admin gated server-side.
* @param {string} job_id - The durable job id shown in this.value.jobs[n].job_id.
* @returns {Promise<Object>} api_response { result: boolean, msg: string, errors: Array }
*/
diffusion_server_control.prototype.requeue_job = async function(job_id) {
	return this.widget_request('requeue_job', { job_id : job_id })
}//end requeue_job



/**
* PURGE_JOBS
* Housekeeping: deletes terminal job rows (completed / failed / cancelled)
* finished before the given age. Global-admin gated server-side.
* @param {number} [older_than_hours=24] - Age cutoff in hours.
* @returns {Promise<Object>} api_response { result: boolean, msg: string, errors: Array }
*/
diffusion_server_control.prototype.purge_jobs = async function(older_than_hours=24) {
	return this.widget_request('purge_jobs', { older_than_hours : older_than_hours })
}//end purge_jobs



/**
* SET_SCHEDULER
* Pauses or resumes the scheduler's job DISPATCH. While paused no new jobs are
* claimed (in-flight runners finish, queued jobs wait); crash-recovery keeps
* running. In-memory state — resets to running on a server restart.
* Global-admin gated server-side.
* @param {string} action - 'pause' | 'resume'.
* @returns {Promise<Object>} api_response { result: boolean, msg: string, errors: Array }
*/
diffusion_server_control.prototype.set_scheduler = async function(action) {
	return this.widget_request('set_scheduler', { action : action })
}//end set_scheduler



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
