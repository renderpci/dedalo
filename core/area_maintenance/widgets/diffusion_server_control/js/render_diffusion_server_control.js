// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {dd_request_idle_callback} from '../../../../common/js/events.js'



/**
* RENDER_DIFFUSION_SERVER_CONTROL
* Manages the widget's logic and appearance in client side
*/
export const render_diffusion_server_control = function() {

	return true
}//end render_diffusion_server_control



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param object options
* @return HTMLElement wrapper
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
* @param object self
* @return HTMLElement content_data
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

	// refresh button
		const button_refresh = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_refresh',
			inner_html		: get_label.refresh || 'Refresh',
			parent			: content_data
		})
		button_refresh.addEventListener('click', async (e) => {
			e.stopPropagation()
			await reload_widget(self, content_data)
		})

	// body_response (action results)
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'body_response',
			parent			: content_data
		})


	return content_data
}//end get_content_data_edit



/**
* ADD_ROW
* Label + value row helper. label is fixed widget text; row_value goes in as
* textContent (SEC-XSS: server strings are never parsed as HTML).
* @return HTMLElement row
*/
const add_row = function(parent, label, row_value, class_name='') {

	const row = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'diffusion_server_control_row',
		parent			: parent
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'diffusion_server_control_label',
		inner_html		: label,
		parent			: row
	})
	const value_node = ui.create_dom_element({
		element_type	: 'span',
		class_name		: ('diffusion_server_control_value ' + class_name).trim(),
		parent			: row
	})
	value_node.textContent = row_value

	return row
}//end add_row



/**
* BUILD_STATUS_BLOCK
* Overall server state + per-check health breakdown
* @return HTMLElement status_block
*/
const build_status_block = function(value, parent) {

	const server = value.server || {}

	const status_block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'diffusion_server_control_status',
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
		const state_class = !reachable
			? 'state_stopped'
			: (degraded ? 'state_degraded' : 'state_running')
		add_row(status_block, 'Server', state_label, state_class)
		if (server.msg) {
			add_row(status_block, 'Detail', server.msg)
		}

	// per-check health breakdown
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
					check.result===true ? 'check_ok' : 'check_fail'
				)
			}
		}


	return status_block
}//end build_status_block



/**
* BUILD_LIFECYCLE_BLOCK
* Start / Stop / Restart buttons. Disabled (with guidance) when the user is
* not an admin or the supervisor command is not configured.
* @return HTMLElement lifecycle_block
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
				class_name		: 'diffusion_server_control_note',
				inner_html		: 'Only global administrators can start, stop or restart the diffusion server.',
				parent			: lifecycle_block
			})
			return lifecycle_block
		}
		if (!cmd_ready) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'diffusion_server_control_note warning_text',
				inner_html		: 'Lifecycle control is disabled: set DEDALO_DIFFUSION_SERVICE_CMD in config.php (e.g. "systemctl --user %action% dedalo-diffusion") to enable start/stop/restart. Status monitoring works regardless.',
				parent			: lifecycle_block
			})
			return lifecycle_block
		}

	// action buttons
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
* Table of in-flight diffusion processes with a per-row Cancel button.
* @return HTMLElement processes_block
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
		class_name		: 'diffusion_server_control_label',
		inner_html		: 'In-flight processes',
		parent			: processes_block
	})

	if (processes.length===0) {
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'diffusion_server_control_note',
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
* Pending unpublish-deletions badge with a Retry button.
* @return HTMLElement pending_block
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
		count_known && pending>0 ? 'warning_text' : ''
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
* Read-only diagnostics (endpoint, token/command configured, langs, levels).
* @return HTMLElement config_block
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
		class_name		: 'diffusion_server_control_label',
		inner_html		: 'Configuration',
		parent			: config_block
	})

	const grid = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'diffusion_server_control_status',
		parent			: config_block
	})

	add_row(grid, 'Endpoint in use', config.endpoint_in_use || 'unknown')
	add_row(grid, 'Internal token', config.internal_token_configured===true ? 'configured' : 'not configured')
	add_row(grid, 'Service command', config.service_cmd_configured===true ? 'configured' : 'not configured',
		config.service_cmd_configured===true ? '' : 'warning_text')
	add_row(grid, 'Publication languages', Array.isArray(config.langs) ? (config.langs.join(', ') || 'none') : 'none')
	add_row(grid, 'Resolve levels', config.resolve_levels!==null && config.resolve_levels!==undefined ? String(config.resolve_levels) : 'unknown')


	return config_block
}//end build_config_block



/**
* RUN_ACTION
* Shared action runner: confirm-already-done by caller; locks the content,
* shows a spinner, awaits the api call, prints the response and reloads the
* widget value on success.
* @param object self
* @param HTMLElement content_data - the widget content (for body_response + reload)
* @param HTMLElement anchor - block to attach the spinner to
* @param function api_call - returns a promise resolving to api_response
* @return void
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
* Reloads the widget value from the server and re-renders the body.
* @param object self
* @param HTMLElement content_data
* @return void
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
