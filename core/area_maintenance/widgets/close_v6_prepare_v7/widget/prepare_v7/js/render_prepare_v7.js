// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_PREPARE_V7
* Manages the widget logic and appearance in client side
*/
export const render_prepare_v7 = function() {

	return true
}//end render_prepare_v7



// poll interval of the migration log (ms) and the safety stop (1 hour)
	const POLL_INTERVAL	= 5000
	const POLL_MAX		= 720

// terminal lines written by run/run_prepare_v7.php
	const RUN_FINISHED = /Preflight (PASSED|FAILED)|DEEP PREFLIGHT (PASSED|:)|PREPARE V7: DONE|Migration FAILED in phase|ABORT after phase|DATABASE migration DONE|Nothing to do/



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param object options
* 	Sample:
* 	{
*		render_level : "full"
		render_mode : "list"
*   }
* @return HTMLElement wrapper
* 	To append to the widget body node (area_maintenance)
*/
render_prepare_v7.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
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
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	// short vars
		const value				= self.value || {}
		const is_superuser		= value.is_superuser===true
		const maintenance_mode	= value.maintenance_mode===true
		const engine_present	= value.engine_present===true
		const runner_present	= value.runner_present===true
		const php_cli_ok		= value.php_cli_ok===true
		const package_ready		= engine_present && runner_present && php_cli_ok

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'prepare_v7'
		})

	// info. What this widget does
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: 'Rewrites this v6 database into the v7 data model, running the bundled '
								+ 'v7 engine as an isolated background process. A full backup is made first.',
			parent			: content_data
		})

	// install info
		const info_table = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'prepare_v7_info',
			parent			: content_data
		})
		add_info_row(info_table, 'Database', value.database)
		add_info_row(info_table, 'Data version in DB', value.data_version)
		add_info_row(info_table, 'Dédalo code version', value.dedalo_version)
		add_info_row(info_table, 'Migration package', value.package_root)
		add_info_row(info_table, 'Bundled engine', value.engine_root)
		add_info_row(info_table, 'PHP CLI binary', value.php_cli_version
			? value.php_binary + ' (' + value.php_cli_version + ')'
			: value.php_binary)

	// requirements check list
		const checks = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'prepare_v7_checks',
			parent			: content_data
		})
		add_check_row(checks, 'Superuser session', is_superuser)
		add_check_row(checks, 'Maintenance mode', maintenance_mode)
		add_check_row(checks, 'Bundled engine present', engine_present)
		add_check_row(checks, 'Runner present', runner_present)
		add_check_row(checks, 'PHP CLI binary usable', php_cli_ok)

	// summary node. The verdict of the last run, lifted out of the log so it does not
	// scroll away behind progress lines. Hidden until a run has produced one.
		const summary_node = ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'prepare_v7_summary',
			inner_html		: value.run_summary || ''
		})
		summary_node.style.display = value.run_summary ? '' : 'none'
		if (value.engine_log) {
			summary_node.title = 'Engine-level detail: ' + value.engine_log
		}

	// log node (filled by the poller)
		const log_node = ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'prepare_v7_log',
			inner_html		: value.log_tail || '(no log yet)'
		})
		log_node.summary_node = summary_node

	// actions. Rendered ONLY in maintenance mode: with users online neither the migration
	// (which rewrites the database) nor the preflight (which reads every row of it) may be
	// launched, so the buttons are not offered at all.
		if (maintenance_mode) {

			// buttons container
			const buttons = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'prepare_v7_buttons',
				parent			: content_data
			})

			// button preflight. Safe, no writes
			const button_preflight = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light button_preflight',
				inner_html		: 'Run preflight (safe, no writes)',
				parent			: buttons
			})
			button_preflight.disabled = !package_ready
			button_preflight.addEventListener('click', (e) => {
				e.stopPropagation()
				launch(self, log_node, buttons, {
					mode : 'preflight'
				})
			})

			// button deep preflight. Writes the ontology (pre_update) but never the matrix data
			const button_deep = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'warning button_deep_preflight',
				inner_html		: 'Deep preflight (backup + ontology, then data review)',
				parent			: buttons
			})
			button_deep.disabled = !(package_ready && is_superuser)
			button_deep.title = button_deep.disabled
				? 'Requires superuser + the bundled package'
				: 'Backs up, creates the v7 ontology from jer_dd, then reviews the data with the '
					+ 'models resolved. Stops before the matrix rewrite.'
			button_deep.addEventListener('click', (e) => {
				e.stopPropagation()
				const confirm_text = 'This BACKS UP the database and creates the v7 ontology (pre_update).'
					+ '\nIt adds the new jer_dd columns and the dd_ontology table — the original v6 data'
					+ '\nstays, and the matrix tables are NOT rewritten.'
					+ '\n\nIt then reports the real data issues, which the plain preflight cannot see.'
					+ '\n\nDatabase: ' + (value.database || '?')
					+ '\n\nProceed?'
				if (!confirm(confirm_text)) {
					return
				}
				launch(self, log_node, buttons, {
					mode : 'deep'
				})
			})

			// button migrate. Real run
			const button_migrate = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'danger button_migrate',
				inner_html		: 'Prepare installation for v7 (migrate)',
				parent			: buttons
			})
			button_migrate.disabled = !(package_ready && is_superuser)
			button_migrate.title = button_migrate.disabled
				? 'Requires superuser + the bundled package'
				: ''
			button_migrate.addEventListener('click', (e) => {
				e.stopPropagation()
				const confirm_text = 'This will BACK UP and then REWRITE the database into the v7 data model.'
					+ '\nThe backup runs first and the migration aborts if it fails.'
					+ '\n\nDatabase: ' + (value.database || '?')
					+ '\n\nProceed?'
				if (!confirm(confirm_text)) {
					return
				}
				launch(self, log_node, buttons, {
					mode : 'migrate'
				})
			})

			// button refresh log
			const button_log = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light button_refresh_log',
				inner_html		: 'Refresh log',
				parent			: buttons
			})
			button_log.addEventListener('click', (e) => {
				e.stopPropagation()
				refresh_log(self, log_node)
			})
		}

	// warnings
		if (!maintenance_mode) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'warning',
				inner_html		: 'Dédalo is not in maintenance mode: all actions are hidden. '
									+ 'Enable maintenance mode to run the preflight or the migration.',
				parent			: content_data
			})
		}else if (!is_superuser) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'warning',
				inner_html		: 'Only the Dédalo superuser can run the migration (preflight is still available).',
				parent			: content_data
			})
		}
		if (!engine_present || !runner_present) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'warning',
				inner_html		: 'The migration package is incomplete (engine or runner missing) at '
									+ (value.package_root || '?'),
				parent			: content_data
			})
		}
		if (!php_cli_ok) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'warning',
				inner_html		: 'No usable PHP CLI binary: ' + (value.php_binary || '?')
									+ '. The runner is a CLI script and the web SAPI binary (php-fpm) cannot run it. '
									+ 'Set PHP_BIN_PATH in the v6 config to the php CLI binary.',
				parent			: content_data
			})
		}

	// summary + log at the end
		content_data.appendChild(summary_node)
		content_data.appendChild(log_node)


	return content_data
}//end get_content_data



/**
* ADD_INFO_ROW
* @param HTMLElement parent
* @param string label
* @param string|null value
* @return HTMLElement row
*/
const add_info_row = function(parent, label, value) {

	const row = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'prepare_v7_row',
		parent			: parent
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'vkey',
		inner_html		: label,
		parent			: row
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'vkey_value',
		inner_html		: (value===null || value===undefined || value==='') ? '-' : value,
		parent			: row
	})

	return row
}//end add_info_row



/**
* ADD_CHECK_ROW
* @param HTMLElement parent
* @param string label
* @param bool ok
* @return HTMLElement row
*/
const add_check_row = function(parent, label, ok) {

	const row = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'prepare_v7_row',
		parent			: parent
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'vkey',
		inner_html		: label,
		parent			: row
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: ok ? 'vkey_value success_text' : 'vkey_value error_text',
		inner_html		: ok ? 'yes' : 'NO',
		parent			: row
	})

	return row
}//end add_check_row



/**
* LAUNCH
* Fires the server launch endpoint and starts polling the log
* @param object self
* @param HTMLElement log_node
* @param HTMLElement buttons
* @param object options
* 	{ mode: 'preflight'|'migrate' }
* @return bool
*/
const launch = async function(self, log_node, buttons, options) {

	// lock the action buttons while the request is in flight
		const ar_button = [...buttons.querySelectorAll('button')]
		ar_button.forEach(el => el.disabled = true)

	log_node.textContent = 'Launching ' + options.mode + '…'

	let api_response
	try {
		api_response = await self.launch(options)
	} catch (error) {
		log_node.textContent = 'Error: ' + error.message
		ar_button.forEach(el => el.disabled = false)
		return false
	}

	const msg = api_response?.msg || ''
	if (api_response?.result!==true) {
		log_node.textContent = msg || 'Error. The runner could not be launched'
		ar_button.forEach(el => el.disabled = false)
		return false
	}

	log_node.textContent = msg + '\n'

	// stream the log until the runner writes a terminal line
		poll_log(self, log_node, () => {
			ar_button.forEach(el => el.disabled = false)
		})


	return true
}//end launch



/**
* REFRESH_LOG
* One-shot log read
* @param object self
* @param HTMLElement log_node
* @return bool
*/
const refresh_log = async function(self, log_node) {

	const value = await self.get_value()

	log_node.textContent = value?.log_tail || '(no log yet)'
	log_node.scrollTop = log_node.scrollHeight
	update_summary(log_node, value)


	return true
}//end refresh_log



/**
* UPDATE_SUMMARY
* Shows the run verdict block returned by the server, hiding the node while there is none
* @param HTMLElement log_node
* @param object value
* @return bool
*/
const update_summary = function(log_node, value) {

	const summary_node = log_node.summary_node
	if (!summary_node) {
		return false
	}

	const summary = value?.run_summary || ''
	summary_node.textContent = summary
	summary_node.style.display = summary ? '' : 'none'
	if (value?.engine_log) {
		summary_node.title = 'Engine-level detail: ' + value.engine_log
	}

	return true
}//end update_summary



/**
* POLL_LOG
* Polls get_value() and prints the log tail until a terminal line shows up
* @param object self
* @param HTMLElement log_node
* @param function on_end
* @return bool
*/
const poll_log = function(self, log_node, on_end) {

	let count = 0

	const timer = setInterval(async () => {

		count++

		// widget destroyed / node detached
		if (!log_node.isConnected) {
			clearInterval(timer)
			return
		}

		let value
		try {
			value = await self.get_value()
		} catch (error) {
			console.error(error)
			return
		}

		const log_tail = value?.log_tail || ''
		if (log_tail.length) {
			log_node.textContent = log_tail
			log_node.scrollTop = log_node.scrollHeight
		}
		update_summary(log_node, value)

		if (RUN_FINISHED.test(log_tail) || count>=POLL_MAX) {
			clearInterval(timer)
			if (typeof on_end==='function') {
				on_end()
			}
		}

	}, POLL_INTERVAL)


	return true
}//end poll_log



// @license-end
