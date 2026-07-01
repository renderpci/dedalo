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
* Widget value shape (set on `self.value` by get_value in the PHP class):
*   {
*     server   : { reachable: boolean, checks: { server, php_api, sql }|null, msg: string }
*     processes: Array<{ process_id, is_running, data: { counter, total, msg } }>
*     config   : { endpoint_in_use, internal_token_configured, service_cmd_configured,
*                  langs, resolve_levels }
*     pending  : number|null   // pending unpublish deletions; null when not applicable
*     is_admin : boolean       // true = current user is a global administrator
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
* fast-path used when reloading only the widget body (e.g. after a lifecycle action).
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
*   1. Status block   — overall server state + per-subsystem health checks
*   2. Lifecycle block — Start / Stop / Restart buttons (admin + cmd-configured only)
*   3. Processes block — list of in-flight diffusion processes with Cancel buttons
*   4. Pending block   — pending unpublish-deletion count + Retry button
*   5. Config block    — read-only diagnostics (endpoint, token, langs, levels)
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

	// status + health block
		build_status_block(value, content_data)

	// lifecycle controls (start / stop / restart)
		build_lifecycle_block(self, value, content_data)

	// in-flight processes
		build_processes_block(self, value, content_data)

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
* Reusable two-column label/value row builder used by every status and config block.
*
* The `label` string is injected via `inner_html` (trusted widget-internal copy).
* The `row_value` string is assigned via `.textContent` — server-sourced strings are
* never parsed as HTML (SEC-XSS guard).
*
* An optional `class_name` token is applied to the inner badge (.dd_badge) so the
* status chip hugs its own text instead of stretching the grid cell. Callers use
* it for semantic states: `pill_danger`/`pill_warning`/`pill_ok` (the
* server pill), `state_ok`/`state_warning`/`state_danger`
* (health chips), or `mono` (machine strings: endpoints, lang codes).
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
* Renders the overall server reachability + per-subsystem health check breakdown.
*
* Source: `value.server` — populated by diffusion_api_client::call('get_diffusion_status')
* in the PHP class. Shape:
*   { reachable: boolean, checks: { server, php_api, sql }|null, msg: string }
*
* Three display states:
*   - "Stopped / unreachable" (pill_danger)  — server.reachable === false
*   - "Running (degraded)"   (pill_warning)  — reachable but at least one subsystem check failed
*   - "Running"              (pill_ok)        — reachable and all checks passed
*
* When the engine returns a `checks` object the function iterates the three fixed
* subsystem keys in display order and adds one row per available check. The fixed
* iteration order (server → php_api → sql) matches the logical dependency chain
* (Bun must be up before PHP can reach it; PHP must be up before SQL is accessible).
*
* @param {Object}      value  - the full widget value snapshot (see module header)
* @param {HTMLElement} parent - container to append the status block to
* @returns {HTMLElement} the populated status_block div
*/
const build_status_block = function(value, parent) {

	const server = value.server || {}

	const status_block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_readout',
		parent			: parent
	})

	// overall state
		const reachable	= server.reachable===true
		const checks	= server.checks || null
		// degraded = reachable but one of the checks failed
		let degraded = false
		if (reachable && checks) {
			degraded = ['server','php_api','sql'].some(k => checks[k] && checks[k].result===false)
		}
		const state_label = !reachable
			? 'Stopped / unreachable'
			: (degraded ? 'Running (degraded)' : 'Running')
		// server-state pill, mapped to the shared kit pill vocabulary
		const state_class = !reachable
			? 'pill_danger'
			: (degraded ? 'pill_warning' : 'pill_ok')
		add_row(status_block, 'Server', state_label, state_class)
		if (server.msg) {
			add_row(status_block, 'Detail', server.msg)
		}

	// per-check health breakdown
	// check keys are fixed (server / php_api / sql); absent keys are silently skipped
	// so that older engine versions that don't report all three checks still render.
		if (checks) {
			const check_labels = {
				server	: 'Bun server',
				php_api	: 'PHP API',
				sql		: 'SQL database'
			}
			for (const key of ['server','php_api','sql']) {
				const check = checks[key]
				if (!check) {
					continue
				}
				add_row(
					status_block,
					check_labels[key] || key,
					(check.result===true ? 'OK' : 'FAIL') + (check.msg ? ' — ' + check.msg : ''),
					check.result===true ? 'state_ok' : 'state_danger'
				)
			}
		}


	return status_block
}//end build_status_block



/**
* BUILD_LIFECYCLE_BLOCK
* Renders the Start / Stop / Restart control buttons for the diffusion server process.
*
* Two pre-flight guards exit early with an explanatory note instead of buttons:
*   1. Non-admin user — lifecycle control is global-admin only (enforced server-side too;
*      the client guard is UX, not security).
*   2. DEDALO_DIFFUSION_SERVICE_CMD not configured — the PHP side reports this via
*      `value.config.service_cmd_configured`. Status monitoring still works regardless.
*
* Each button calls the corresponding `self.<action_key>()` prototype method
* (defined in diffusion_server_control.js), which dispatches a widget_request to the
* server. The confirmation dialog is shown BEFORE run_action so that run_action can
* assume the user has already approved (no double-confirm).
*
* `parent` (the content_data node) is passed to run_action so it can locate the
* `.body_response` pre element and trigger reload_widget on success.
*
* @param {Object}      self   - the diffusion_server_control widget instance
* @param {Object}      value  - the full widget value snapshot (see module header)
* @param {HTMLElement} parent - content_data node (needed by run_action for reload)
* @returns {HTMLElement} the lifecycle_block div (may contain buttons or a note only)
*/
const build_lifecycle_block = function(self, value, parent) {

	const is_admin		= value.is_admin===true
	const config		= value.config || {}
	const cmd_ready		= config.service_cmd_configured===true

	const lifecycle_block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'diffusion_server_control_lifecycle',
		parent			: parent
	})

	// gating notes
		if (!is_admin) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'dd_note',
				inner_html		: 'Only global administrators can start, stop or restart the diffusion server.',
				parent			: lifecycle_block
			})
			return lifecycle_block
		}
		if (!cmd_ready) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'dd_note state_warning',
				inner_html		: 'Lifecycle control is disabled: set DEDALO_DIFFUSION_SERVICE_CMD in config.php (e.g. "systemctl --user %action% dedalo-diffusion") to enable start/stop/restart. Status monitoring works regardless.',
				parent			: lifecycle_block
			})
			return lifecycle_block
		}

	// action buttons
	// The action.key must exactly match a prototype method name on `self` and a key
	// in the server-side API_ACTIONS allowlist (class.diffusion_server_control.php).
		const actions = [
			{ key: 'start_server',		label: 'Start',		css: 'success' },
			{ key: 'stop_server',		label: 'Stop',		css: 'danger' },
			{ key: 'restart_server',	label: 'Restart',	css: 'warning' }
		]
		for (const action of actions) {
			const button = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light button_' + action.key + ' ' + action.css,
				inner_html		: action.label,
				parent			: lifecycle_block
			})
			button.addEventListener('click', async (e) => {
				e.stopPropagation()
				if (!confirm((get_label.sure || 'Sure?') + '\n' + action.label + ' the diffusion server?')) {
					return
				}
				await run_action(self, parent, lifecycle_block, () => self[action.key]())
			})
		}


	return lifecycle_block
}//end build_lifecycle_block



/**
* BUILD_PROCESSES_BLOCK
* Renders a list of currently in-flight diffusion processes, each with a Cancel
* button for global administrators.
*
* Source: `value.processes` — populated by diffusion_api_client::call('list_processes')
* in the PHP class. The server only queries the engine when `server.reachable` is
* true, so this array is always empty when the engine is down.
*
* Each process item shape:
*   { process_id: string, is_running: boolean, data: { counter: number, total: number, msg?: string } }
*
* The Cancel button is intentionally shown only for processes where `is_running` is
* true: finished processes cannot be cancelled and showing the button would confuse
* the operator. The cancel call passes `proc.process_id` — a server-generated
* identifier, not user input.
*
* All process text (process_id, msg) is set via `.textContent` to prevent XSS
* in case the engine ever surfaces user-influenced strings in process metadata.
*
* @param {Object}      self   - the diffusion_server_control widget instance
* @param {Object}      value  - the full widget value snapshot (see module header)
* @param {HTMLElement} parent - content_data node (needed by run_action for reload)
* @returns {HTMLElement} the processes_block div
*/
const build_processes_block = function(self, value, parent) {

	const is_admin	= value.is_admin===true
	const processes	= Array.isArray(value.processes) ? value.processes : []

	const processes_block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'diffusion_server_control_processes',
		parent			: parent
	})

	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'dd_eyebrow',
		inner_html		: 'In-flight processes',
		parent			: processes_block
	})

	if (processes.length===0) {
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_note',
			inner_html		: 'No diffusion processes are currently running.',
			parent			: processes_block
		})
		return processes_block
	}

	const list = ui.create_dom_element({
		element_type	: 'ul',
		class_name		: 'diffusion_server_control_process_list',
		parent			: processes_block
	})

	for (const proc of processes) {
		const data		= proc.data || {}
		const counter	= data.counter ?? 0
		const total		= data.total ?? 0
		const running	= proc.is_running===true

		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'diffusion_server_control_process',
			parent			: list
		})
		// description (textContent: server strings never parsed as HTML)
		const desc = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'diffusion_server_control_process_desc',
			parent			: li
		})
		desc.textContent = (proc.process_id || 'unknown')
			+ ' — ' + (running ? 'running' : 'finished')
			+ ' (' + counter + '/' + total + ')'
			+ (data.msg ? ' — ' + data.msg : '')

		// cancel button (admin + running only)
		if (is_admin && running) {
			const button_cancel = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light button_cancel danger',
				inner_html		: get_label.cancel || 'Cancel',
				parent			: li
			})
			button_cancel.addEventListener('click', async (e) => {
				e.stopPropagation()
				if (!confirm((get_label.sure || 'Sure?') + '\nCancel process ' + (proc.process_id || '') + '?')) {
					return
				}
				await run_action(self, parent, processes_block, () => self.cancel_process(proc.process_id))
			})
		}
	}


	return processes_block
}//end build_processes_block



/**
* BUILD_PENDING_BLOCK
* Renders the pending-unpublish-deletions count and a Retry button.
*
* Source: `value.pending` — an integer count from dd_diffusion_api::retry_pending_deletions
* called with `count_only: true` in the PHP class. It is `null` when the diffusion
* ontology is not installed or the count query failed (not an error; simply not applicable
* in all deployments), so the UI shows "unknown" instead of "0" to distinguish the two.
*
* The Retry button triggers `self.retry_pending_deletions()`, which calls the PHP-side
* retry_pending_deletions without `count_only` — it actually attempts to re-propagate
* each pending deletion to the diffusion targets. The operation can be long-running
* (widget_request timeout is set to 1 hour in diffusion_server_control.js).
*
* The `state_warning` chip is applied when pending > 0 to draw operator attention;
* a count of 0 is a healthy state and receives no additional styling.
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
* Renders a read-only diagnostics panel showing the effective runtime configuration
* that the PHP side would use to reach the diffusion engine.
*
* Source: `value.config` — populated by class.diffusion_server_control.php::get_config_info().
* No secrets are exposed: only presence/absence flags are reported for the internal
* token and service command (not their values).
*
* Rows rendered:
*   - Endpoint in use        — "unix socket: <path>" | "http: <url>" | "none (…)"
*   - Internal token         — "configured" | "not configured"
*   - Service command        — "configured" | "not configured" (state_warning when absent)
*   - Publication languages  — comma-separated list from DEDALO_DIFFUSION_LANGS, or "none"
*   - Resolve levels         — integer from DEDALO_DIFFUSION_RESOLVE_LEVELS, or "unknown"
*
* The inner grid reuses the shared `dd_readout` CSS class (two-column
* key/value layout) so it is visually consistent with the status block.
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

	add_row(grid, 'Endpoint in use', config.endpoint_in_use || 'unknown', 'mono')
	add_row(grid, 'Internal token', config.internal_token_configured===true ? 'configured' : 'not configured',
		config.internal_token_configured===true ? 'state_ok' : '')
	add_row(grid, 'Service command', config.service_cmd_configured===true ? 'configured' : 'not configured',
		config.service_cmd_configured===true ? 'state_ok' : 'state_warning')
	add_row(grid, 'Publication languages', Array.isArray(config.langs) ? (config.langs.join(', ') || 'none') : 'none',
		Array.isArray(config.langs) && config.langs.length ? 'mono' : '')
	add_row(grid, 'Resolve levels', config.resolve_levels!==null && config.resolve_levels!==undefined ? String(config.resolve_levels) : 'unknown')


	return config_block
}//end build_config_block



/**
* RUN_ACTION
* Shared orchestrator for all mutating API calls (lifecycle, cancel, retry).
* Callers MUST show a confirmation dialog BEFORE calling this function;
* run_action does not prompt — it executes immediately.
*
* Sequence:
*   1. Locks the entire content_data node (CSS `lock` class disables pointer events).
*   2. Appends a spinner element inside `anchor` (the sub-block that owns the button).
*   3. Awaits the `api_call` thunk; any thrown exception is caught and normalised into
*      a failed api_response so the rest of the flow always completes cleanly.
*   4. Removes the spinner and releases the lock.
*   5. Writes a JSON summary of the response to the `.body_response` <pre> element
*      (found by querying content_data). The summary includes result, msg, action,
*      exit_code, output, and errors fields from the api_response.
*   6. On success (`result === true` or a non-null object), calls reload_widget to
*      re-fetch the server state and re-render. On failure, shows an alert.
*
* The `ok` check accepts `typeof result === 'object' && result !== null` in addition to
* `result === true` because some API actions (e.g. retry_pending_deletions) return a
* result object instead of a boolean on success.
*
* (!) Uses `alert()` for error feedback — this is intentional for this admin widget
* where a prominent blocking dialog is appropriate. Do not replace with console.warn.
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
			result		: api_response.result===true || (typeof api_response.result === 'object'),
			msg			: api_response.msg || null,
			action		: api_response.action ?? null,
			exit_code	: api_response.exit_code ?? null,
			output		: api_response.output ?? null,
			errors		: api_response.errors || []
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
