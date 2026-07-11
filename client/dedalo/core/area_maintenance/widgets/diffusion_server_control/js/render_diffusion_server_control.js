// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {dd_request_idle_callback} from '../../../../common/js/events.js'



/**
* RENDER_DIFFUSION_SERVER_CONTROL
* Client-side render module for the diffusion_server_control area_maintenance widget.
*
* This module is the view layer. The companion diffusion_server_control.js owns the
* constructor and prototype wiring; this file owns every DOM-building function that
* produces the widget UI from the `value` snapshot returned by the server.
*
* The widget targets the NATIVE diffusion engine (no separate daemon). Widget value
* shape (set on `self.value` by the server get_value handler):
*   {
*     engine    : { state, title, checks: { engine, formats } }   // native advisory
*     scheduler : { running, max_runners, queued, stale_after_seconds, paused }
*     jobs      : Array<{ job_id, process_id, state, element_tipo, section_tipo,
*                         type, counter, total, msg, attempt, max_attempts, ... }>
*     pending   : number|null   // pending unpublish deletions; null when not applicable
*     config    : { native, native_elements, resolve_levels, langs, batch_rows,
*                   batch_records, target_db_socket, target_db_host,
*                   target_db_user_configured, formats }
*     is_admin  : boolean
*   }
*
* The module exports only the constructor stub `render_diffusion_server_control`;
* the real entry point is `render_diffusion_server_control.prototype.list`, which
* diffusion_server_control.js assigns to both `.edit` and `.list`.
*
* All private helpers (get_content_data_edit, build_* functions, run_action,
* reload_widget) are module-scope constants — not exported, not prototype members.
*/



/**
* RENDER_DIFFUSION_SERVER_CONTROL
* Constructor stub for the render module. Exists solely to anchor prototype
* methods that are assigned to the main diffusion_server_control instance by
* diffusion_server_control.js (prototype-mixin pattern used throughout Dédalo widgets).
* The constructor itself performs no work.
*/
export const render_diffusion_server_control = function() {

	return true
}//end render_diffusion_server_control



/**
* LIST
* Entry point for both 'edit' and 'list' render modes (diffusion_server_control.js
* assigns this prototype method to both `.edit` and `.list`). Builds the full widget
* DOM from the pre-loaded `self.value` snapshot.
*
* When `options.render_level` is 'content' the function returns the inner
* content_data node directly, bypassing the outer wrapper shell. This is the
* fast-path used when reloading only the widget body (e.g. after an action).
*
* @param {Object} options - render options forwarded by widget_common
* @param {string} [options.render_level='full'] - 'full' = wrapper+content; 'content' = content only
* @returns {HTMLElement} wrapper (render_level 'full') or content_data (render_level 'content')
*/
render_diffusion_server_control.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end list



/**
* GET_CONTENT_DATA_EDIT
* Assembles the full widget content node from the current `self.value` snapshot.
* Delegates each visual region to a dedicated build_* helper so this function
* stays a structural overview only.
*
* Layout order (top to bottom):
*   1. Status block    — native engine advisory (state + served formats)
*   2. Scheduler block — running/max, queued backlog, stale window + pause/resume
*   3. Jobs block      — durable job queue table with cancel/requeue + purge control
*   4. Pending block   — pending unpublish-deletion count + Retry button
*   5. Config block    — read-only diagnostics (native flags, langs, levels, target DB)
*   6. Refresh button  — re-fetches value from the server without a full page reload
*   7. body_response   — <pre> element; updated by run_action after each API call
*
* The returned node is detached from the document; the caller (list) attaches it
* inside the wrapper produced by ui.widget.build_wrapper_edit.
*
* @param {Object} self - the diffusion_server_control widget instance
* @returns {Promise<HTMLElement>} the populated content_data div
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value = self.value || {}

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'diffusion_server_control_content'
		})

	// status + advisory block
		build_status_block(value, content_data)

	// scheduler status + flow control (pause / resume)
		build_scheduler_block(self, value, content_data)

	// durable job queue
		build_jobs_block(self, value, content_data)

	// pending deletions
		build_pending_block(self, value, content_data)

	// config / diagnostics block
		build_config_block(value, content_data)

	// refresh button (footer action: re-reads server state)
		const footer = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'diffusion_server_control_footer',
			parent			: content_data
		})
		const button_refresh = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_refresh',
			inner_html		: get_label.refresh || 'Refresh',
			parent			: footer
		})
		button_refresh.addEventListener('click', async (e) => {
			e.stopPropagation()
			await reload_widget(self, content_data)
		})

	// body_response (action results)
	// <pre> is populated by run_action with a JSON summary of the last API response,
	// giving the admin immediate feedback without opening dev-tools.
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'body_response',
			parent			: content_data
		})


	return content_data
}//end get_content_data_edit



/**
* ADD_ROW
* Reusable two-column label/value row builder used by the status and config blocks.
*
* The `label` string is injected via `inner_html` (trusted widget-internal copy).
* The `row_value` string is assigned via `.textContent` — server-sourced strings are
* never parsed as HTML (SEC-XSS guard).
*
* An optional `class_name` token is applied to the inner badge (.dd_badge) so the
* status chip hugs its own text instead of stretching the grid cell. Callers use
* it for semantic states: `pill_danger`/`pill_warning`/`pill_ok` (the advisory
* pill), `state_ok`/`state_warning`/`state_danger` (health chips), or `mono`
* (machine strings: hosts, lang codes, formats).
*
* @param {HTMLElement} parent     - container to append the row to
* @param {string}      label      - human-readable field name (trusted, set as innerHTML)
* @param {string}      row_value  - field value (untrusted; set as textContent)
* @param {string}      [class_name=''] - state token for the value badge
* @returns {HTMLElement} the newly created row div
*/
const add_row = function(parent, label, row_value, class_name='') {

	const row = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_row',
		parent			: parent
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'dd_k',
		inner_html		: label,
		parent			: row
	})
	const value_node = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'dd_v',
		parent			: row
	})
	const value_badge = ui.create_dom_element({
		element_type	: 'span',
		class_name		: ('dd_badge ' + class_name).trim(),
		parent			: value_node
	})
	value_badge.textContent = row_value

	return row
}//end add_row



/**
* BUILD_STATUS_BLOCK
* Renders the native diffusion engine advisory.
*
* Source: `value.engine` — the server buildEngineAdvisory() payload. Shape:
*   { state: 'ok'|'warning'|'error', title: string, checks: { engine, formats[] } }
*
* The native engine is in-process (no separate daemon to be "down"): `state` is
* 'ok' whenever this code is answering. The block shows the advisory pill, its
* title, the engine kind ("native") and the served writer formats.
*
* @param {Object}      value  - the full widget value snapshot (see module header)
* @param {HTMLElement} parent - container to append the status block to
* @returns {HTMLElement} the populated status_block div
*/
const build_status_block = function(value, parent) {

	const engine = value.engine || {}
	const checks = engine.checks || {}

	const status_block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_readout',
		parent			: parent
	})

	// advisory state → pill vocabulary
		const state = typeof engine.state === 'string' ? engine.state : 'error'
		const state_map = { ok: 'pill_ok', warning: 'pill_warning', error: 'pill_danger' }
		const state_label_map = { ok: 'Ready', warning: 'Degraded', error: 'Down' }
		add_row(status_block, 'Engine', state_label_map[state] || state, state_map[state] || 'pill_danger')
		if (engine.title) {
			add_row(status_block, 'Detail', engine.title)
		}

	// engine kind + served formats
		add_row(status_block, 'Kind', checks.engine ? String(checks.engine) : 'native', 'mono')
		const formats = Array.isArray(checks.formats) ? checks.formats : []
		add_row(status_block, 'Writer formats', formats.length ? formats.join(', ') : 'none',
			formats.length ? 'mono' : 'state_warning')


	return status_block
}//end build_status_block



/**
* BUILD_SCHEDULER_BLOCK
* Renders the scheduler status and the flow-control pause/resume toggle.
*
* Source: `value.scheduler` — { running, max_runners, queued, stale_after_seconds,
* paused }. The scheduler claims queued jobs up to `max_runners` and spawns one
* runner process per claim; while `paused` no new jobs are dispatched (in-flight
* runners finish, queued jobs wait). Pausing is in-memory and resets to running
* on a server restart.
*
* @param {Object}      self   - the diffusion_server_control widget instance
* @param {Object}      value  - the full widget value snapshot (see module header)
* @param {HTMLElement} parent - content_data node (needed by run_action for reload)
* @returns {HTMLElement} the scheduler_block div
*/
const build_scheduler_block = function(self, value, parent) {

	const is_admin	= value.is_admin===true
	const scheduler	= value.scheduler || {}
	const paused	= scheduler.paused===true

	const scheduler_block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'diffusion_server_control_scheduler',
		parent			: parent
	})

	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'dd_eyebrow',
		inner_html		: 'Scheduler',
		parent			: scheduler_block
	})

	const grid = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_readout',
		parent			: scheduler_block
	})

	const running	= scheduler.running ?? 0
	const max		= scheduler.max_runners ?? 0
	const queued	= scheduler.queued ?? 0

	add_row(grid, 'Dispatch', paused ? 'Paused' : 'Running', paused ? 'pill_warning' : 'pill_ok')
	add_row(grid, 'Runners', running + ' / ' + max, 'mono')
	add_row(grid, 'Queued backlog', String(queued), queued>0 ? 'state_warning' : '')
	add_row(grid, 'Stale after', (scheduler.stale_after_seconds ?? '?') + ' s', 'mono')

	// pause / resume toggle (admin only)
	if (is_admin) {
		const button_toggle = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_scheduler ' + (paused ? 'success' : 'warning'),
			inner_html		: paused ? 'Resume dispatch' : 'Pause dispatch',
			parent			: scheduler_block
		})
		button_toggle.addEventListener('click', async (e) => {
			e.stopPropagation()
			const next = paused ? 'resume' : 'pause'
			if (!confirm((get_label.sure || 'Sure?') + '\n' + next + ' the diffusion scheduler?')) {
				return
			}
			await run_action(self, parent, scheduler_block, () => self.set_scheduler(next))
		})
	}


	return scheduler_block
}//end build_scheduler_block



/**
* BUILD_JOBS_BLOCK
* Renders the durable job queue as a table (admin scope: all jobs, 24h window),
* with per-row Cancel / Requeue buttons and a block-level Purge control.
*
* Source: `value.jobs` — projected durable job rows. Each item shape:
*   { job_id, process_id, state, element_tipo, section_tipo, type, counter,
*     total, msg, attempt, max_attempts, cancel_requested, created_at,
*     started_at, finished_at, errors }
*
* Buttons (admin only):
*   - Cancel  when state ∈ { queued, running }  → self.cancel_process(process_id)
*   - Requeue when state ∈ { failed, interrupted, cancelled } → self.requeue_job(job_id)
*   - Purge terminal jobs (block-level, hours input) → self.purge_jobs(hours)
*
* All server-sourced strings are set via `.textContent` (SEC-XSS guard).
*
* @param {Object}      self   - the diffusion_server_control widget instance
* @param {Object}      value  - the full widget value snapshot (see module header)
* @param {HTMLElement} parent - content_data node (needed by run_action for reload)
* @returns {HTMLElement} the jobs_block div
*/
const build_jobs_block = function(self, value, parent) {

	const is_admin	= value.is_admin===true
	const jobs		= Array.isArray(value.jobs) ? value.jobs : []

	const jobs_block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'diffusion_server_control_jobs',
		parent			: parent
	})

	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'dd_eyebrow',
		inner_html		: 'Job queue',
		parent			: jobs_block
	})

	// active states (cancelable) and terminal states (requeueable)
	const CANCELABLE	= ['queued','running']
	const REQUEUEABLE	= ['failed','interrupted','cancelled']
	// state badge vocabulary
	const state_class = {
		queued		: 'state_warning',
		running		: 'state_ok',
		completed	: 'state_ok',
		failed		: 'state_danger',
		cancelled	: '',
		interrupted	: 'state_warning'
	}

	if (jobs.length===0) {
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_note',
			inner_html		: 'No diffusion jobs in the last 24 hours.',
			parent			: jobs_block
		})
	} else {
		const table = ui.create_dom_element({
			element_type	: 'table',
			class_name		: 'diffusion_server_control_job_table',
			parent			: jobs_block
		})
		const thead = ui.create_dom_element({ element_type:'thead', parent:table })
		const head_row = ui.create_dom_element({ element_type:'tr', parent:thead })
		for (const heading of ['Process','Target','State','Progress','Attempt','']) {
			const th = ui.create_dom_element({ element_type:'th', parent:head_row })
			th.textContent = heading
		}
		const tbody = ui.create_dom_element({ element_type:'tbody', parent:table })

		for (const job of jobs) {
			const state	= String(job.state || 'unknown')
			const tr = ui.create_dom_element({
				element_type	: 'tr',
				class_name		: 'diffusion_server_control_job state_' + state,
				parent			: tbody
			})

			// process id
			const td_proc = ui.create_dom_element({ element_type:'td', parent:tr })
			td_proc.textContent = job.process_id || job.job_id || 'unknown'

			// element → section (+ type)
			const td_target = ui.create_dom_element({ element_type:'td', parent:tr })
			td_target.textContent = (job.element_tipo || '?') + ' → ' + (job.section_tipo || '?')
				+ (job.type ? ' (' + job.type + ')' : '')

			// state badge
			const td_state = ui.create_dom_element({ element_type:'td', parent:tr })
			const badge = ui.create_dom_element({
				element_type	: 'span',
				class_name		: ('dd_badge ' + (state_class[state] || '')).trim(),
				parent			: td_state
			})
			badge.textContent = state + (job.cancel_requested===true ? ' (cancelling)' : '')

			// progress counter/total (+ msg)
			const td_progress = ui.create_dom_element({ element_type:'td', parent:tr })
			td_progress.textContent = (job.counter ?? 0) + '/' + (job.total ?? 0)
				+ (job.msg ? ' — ' + job.msg : '')

			// attempt/max
			const td_attempt = ui.create_dom_element({ element_type:'td', parent:tr })
			td_attempt.textContent = (job.attempt ?? 0) + '/' + (job.max_attempts ?? 0)

			// actions
			const td_actions = ui.create_dom_element({ element_type:'td', class_name:'job_actions', parent:tr })
			if (is_admin && CANCELABLE.includes(state)) {
				const button_cancel = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'light button_cancel danger',
					inner_html		: get_label.cancel || 'Cancel',
					parent			: td_actions
				})
				button_cancel.addEventListener('click', async (e) => {
					e.stopPropagation()
					if (!confirm((get_label.sure || 'Sure?') + '\nCancel ' + (job.process_id || '') + '?')) {
						return
					}
					await run_action(self, parent, jobs_block, () => self.cancel_process(job.process_id))
				})
			}
			if (is_admin && REQUEUEABLE.includes(state)) {
				const button_requeue = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'light button_requeue warning',
					inner_html		: 'Requeue',
					parent			: td_actions
				})
				button_requeue.addEventListener('click', async (e) => {
					e.stopPropagation()
					if (!confirm((get_label.sure || 'Sure?') + '\nRequeue ' + (job.process_id || job.job_id || '') + '?')) {
						return
					}
					await run_action(self, parent, jobs_block, () => self.requeue_job(job.job_id))
				})
			}
		}
	}

	// block-level purge control (admin only)
	if (is_admin) {
		const purge_bar = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'diffusion_server_control_purge',
			parent			: jobs_block
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'dd_k',
			inner_html		: 'Purge terminal jobs older than (hours):',
			parent			: purge_bar
		})
		const input_hours = ui.create_dom_element({
			element_type	: 'input',
			class_name		: 'purge_hours',
			parent			: purge_bar
		})
		input_hours.type	= 'number'
		input_hours.min		= '0'
		input_hours.value	= '24'
		const button_purge = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_purge',
			inner_html		: 'Purge',
			parent			: purge_bar
		})
		button_purge.addEventListener('click', async (e) => {
			e.stopPropagation()
			const hours = Number(input_hours.value)
			const older_than_hours = Number.isFinite(hours) && hours>=0 ? hours : 24
			if (!confirm((get_label.sure || 'Sure?') + '\nPurge terminal jobs older than ' + older_than_hours + 'h?')) {
				return
			}
			await run_action(self, parent, purge_bar, () => self.purge_jobs(older_than_hours))
		})
	}


	return jobs_block
}//end build_jobs_block



/**
* BUILD_PENDING_BLOCK
* Renders the pending-unpublish-deletions count and a Retry button.
*
* Source: `value.pending` — an integer count of dd1758 unpublish_pending rows.
* It is `null` when the diffusion ontology is not installed (not an error;
* simply not applicable), so the UI shows "unknown" instead of "0".
*
* The Retry button triggers `self.retry_pending_deletions()`, which re-propagates
* each pending deletion to the diffusion targets. The operation can be
* long-running (widget_request timeout is 1 hour in diffusion_server_control.js).
*
* @param {Object}      self   - the diffusion_server_control widget instance
* @param {Object}      value  - the full widget value snapshot (see module header)
* @param {HTMLElement} parent - content_data node (needed by run_action for reload)
* @returns {HTMLElement} the pending_block div
*/
const build_pending_block = function(self, value, parent) {

	const is_admin	= value.is_admin===true
	const pending	= value.pending // int | null

	const pending_block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'diffusion_server_control_pending',
		parent			: parent
	})

	const count_known	= typeof pending === 'number'
	const count_label	= !count_known
		? 'unknown (no diffusion ontology / not applicable)'
		: String(pending)
	add_row(
		pending_block,
		'Pending unpublish deletions',
		count_label,
		count_known && pending>0 ? 'state_warning' : ''
	)

	// retry button (admin + pending>0)
	if (is_admin && count_known && pending>0) {
		const button_retry = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_retry warning',
			inner_html		: 'Retry pending deletions',
			parent			: pending_block
		})
		button_retry.addEventListener('click', async (e) => {
			e.stopPropagation()
			await run_action(self, parent, pending_block, () => self.retry_pending_deletions())
		})
	}


	return pending_block
}//end build_pending_block



/**
* BUILD_CONFIG_BLOCK
* Renders a read-only diagnostics panel showing the effective NATIVE engine
* configuration.
*
* Source: `value.config`. No secrets are exposed: only presence flags are
* reported for the target DB user; the socket/host are shown as configured.
*
* Rows rendered:
*   - Native routing      — on/off (DEDALO_DIFFUSION_NATIVE)
*   - Native elements     — csv|'all'|none (DEDALO_DIFFUSION_NATIVE_ELEMENTS)
*   - Resolve levels      — integer (DEDALO_DIFFUSION_RESOLVE_LEVELS)
*   - Publication languages — comma list (DEDALO_DIFFUSION_LANGS)
*   - Batch rows/records  — integers
*   - Target DB           — socket / host presence + user configured flag
*   - Writer formats      — the formats the native engine can write
*
* @param {Object}      value  - the full widget value snapshot (see module header)
* @param {HTMLElement} parent - container to append the config block to
* @returns {HTMLElement} the config_block div
*/
const build_config_block = function(value, parent) {

	const config = value.config || {}

	const config_block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'diffusion_server_control_config',
		parent			: parent
	})

	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'dd_eyebrow',
		inner_html		: 'Configuration',
		parent			: config_block
	})

	const grid = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_readout',
		parent			: config_block
	})

	add_row(grid, 'Native routing', config.native===true ? 'on' : 'off',
		config.native===true ? 'state_ok' : 'state_warning')
	add_row(grid, 'Native elements', config.native_elements ? String(config.native_elements) : 'none (permissive)', 'mono')
	add_row(grid, 'Resolve levels', config.resolve_levels!==null && config.resolve_levels!==undefined ? String(config.resolve_levels) : 'unknown')
	add_row(grid, 'Publication languages', Array.isArray(config.langs) ? (config.langs.join(', ') || 'none') : 'none',
		Array.isArray(config.langs) && config.langs.length ? 'mono' : '')
	add_row(grid, 'Batch rows / records',
		(config.batch_rows ?? '?') + ' / ' + (config.batch_records ?? '?'), 'mono')

	// target MariaDB transport (presence only; the DB name is resolved per element)
	const target_bits = []
	if (config.target_db_socket===true) target_bits.push('socket')
	if (config.target_db_host) target_bits.push('host: ' + config.target_db_host)
	add_row(grid, 'Target DB', target_bits.length ? target_bits.join(', ') : 'not configured',
		target_bits.length ? 'mono' : 'state_warning')
	add_row(grid, 'Target DB user', config.target_db_user_configured===true ? 'configured' : 'not configured',
		config.target_db_user_configured===true ? 'state_ok' : 'state_warning')
	add_row(grid, 'Writer formats', Array.isArray(config.formats) ? (config.formats.join(', ') || 'none') : 'none', 'mono')


	return config_block
}//end build_config_block



/**
* RUN_ACTION
* Shared orchestrator for all mutating API calls (cancel, requeue, purge,
* set_scheduler, retry). Callers MUST show a confirmation dialog BEFORE calling
* this function; run_action does not prompt — it executes immediately.
*
* Sequence:
*   1. Locks the entire content_data node (CSS `lock` class disables pointer events).
*   2. Appends a spinner element inside `anchor` (the sub-block that owns the button).
*   3. Awaits the `api_call` thunk; any thrown exception is caught and normalised into
*      a failed api_response so the rest of the flow always completes cleanly.
*   4. Removes the spinner and releases the lock.
*   5. Writes a JSON summary of the response to the `.body_response` <pre> element.
*   6. On success (`result === true` or a non-null object), calls reload_widget to
*      re-fetch the server state and re-render. On failure, shows an alert.
*
* The `ok` check accepts `typeof result === 'object' && result !== null` in addition to
* `result === true` because some API actions (e.g. retry_pending_deletions) return a
* result object instead of a boolean on success.
*
* (!) Uses `alert()` for error feedback — intentional for this admin widget where a
* prominent blocking dialog is appropriate. Do not replace with console.warn.
*
* @param {Object}      self         - the diffusion_server_control widget instance
* @param {HTMLElement} content_data - top-level widget content node (lock target + body_response host)
* @param {HTMLElement} anchor       - sub-block to attach the spinner to during the call
* @param {Function}    api_call     - zero-argument async thunk returning a Promise<Object> api_response
* @returns {Promise<void>}
*/
const run_action = async function(self, content_data, anchor, api_call) {

	const body_response = content_data.querySelector('.body_response')
	content_data.classList.add('lock')
	const spinner = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'spinner'
	})
	anchor.appendChild(spinner)

	let api_response
	try {
		api_response = await api_call()
	} catch (error) {
		console.error(error)
		api_response = { result: false, msg: (error && error.message) || 'Unknown error' }
	}

	spinner.remove()
	content_data.classList.remove('lock')

	// SEC-XSS: textContent prevents any HTML parsing of server strings
	if (body_response) {
		const summary = {
			result	: api_response.result===true || (typeof api_response.result === 'object'),
			msg		: api_response.msg || null,
			errors	: api_response.errors || []
		}
		body_response.textContent = JSON.stringify(summary, null, 2)
	}

	const ok = api_response.result===true || (typeof api_response.result === 'object' && api_response.result!==null)
	if (ok) {
		await reload_widget(self, content_data)
	} else {
		alert('Error! \n' + (api_response.msg || 'Unknown error'))
	}
}//end run_action



/**
* RELOAD_WIDGET
* Re-fetches the widget value from the server and schedules a full re-render via
* `self.refresh()`, replacing the entire widget DOM with a fresh build.
*
* The lock class is applied to the content_data node during the value fetch so the
* user cannot trigger additional actions while the data is in flight.
*
* `self.get_value()` is `area_maintenance.prototype.get_value` (assigned by
* diffusion_server_control.js); it calls widget_request('get_value') and returns
* the api_response. `self.value` is set to the full api_response so that the render
* functions receive the same shape they would on the initial load.
*
* `dd_request_idle_callback` defers the DOM rebuild to browser idle time, avoiding
* layout thrashing while the widget is being used. `build_autoload: false` skips the
* redundant get_value call inside refresh since value is already current.
* `destroy: true` tears down the old node before creating the new one.
*
* @param {Object}      self         - the diffusion_server_control widget instance
* @param {HTMLElement} content_data - the widget content node (locked during fetch)
* @returns {Promise<void>}
*/
const reload_widget = async function(self, content_data) {

	content_data.classList.add('lock')
	try {
		self.value = await self.get_value()
	} catch (error) {
		console.error(error)
	}
	dd_request_idle_callback(
		() => {
			self.refresh({
				build_autoload	: false, // value is already updated
				destroy			: true
			})
		}
	)
}//end reload_widget



// @license-end
