// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {update_process_status} from '../../../../common/js/common.js'



/**
* RENDER_MAKE_BACKUP
* Manages the widget logic and appearance in client side
*/
export const render_make_backup = function() {

	return true
}//end render_make_backup



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
render_make_backup.prototype.list = async function(options) {

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
* HANDLE_SUBMIT
* @param HTMLElement body_response - Target div for the API response messages
* @param HTMLElement target_lock - DIV to lock until execution
* @param callable api_call - API call function
* @return void
*/
const handle_submit = async (body_response, target_lock, api_call) => {

	if (!body_response) {
		console.error('Body response div is mandatory.');
		return
	}

	if (!target_lock) {
		console.error('Target lock div is mandatory.');
		return
	}

	if (typeof api_call !== 'function') {
		console.error('Invalid api_call. Expected valid function.');
		return
	}

	// clean body_response nodes
	while (body_response.firstChild) {
		body_response.removeChild(body_response.firstChild);
	}

	// loading add
	target_lock.classList.add('lock')
	const spinner = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'spinner'
	})
	body_response.prepend(spinner)

	try {
		// API worker call
		const api_response = await api_call();

		// response_node pre JSON response
		if (api_response) {
			ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'response_node',
				inner_html		: JSON.stringify(api_response, null, 2),
				parent			: body_response
			})
		}else{
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'response_node error',
				inner_html		: 'Unknown error calling API',
				parent			: body_response
			})
		}
	} catch (error) {
		console.error('Error calling API:', error);
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'response_node error',
			inner_html		: 'Unknown error calling API',
			parent			: body_response
		})
	} finally {
		// loading remove
		spinner.remove()
		target_lock.classList.remove('lock')
	}
}//end handle_submit



/**
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	// short vars
		const value					= self.value || {}
		const dedalo_db_management	= value.dedalo_db_management
		const backup_path			= value.backup_path
		const file_name				= value.file_name
		const mysql_db				= value.mysql_db

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// dedalo_db_management
		if (dedalo_db_management===false) {
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: 'Dédalo backup if not allow by config DEDALO_DB_MANAGEMENT',
				class_name		: 'info_text comment',
				parent			: content_data
			})
			return content_data
		}

	// info text
		const text = `Force to make a full backup now like:<br><div>${backup_path}/<br>${file_name}</div>`
		const info = ui.create_dom_element({
			element_type	: 'div',
			inner_html		: text,
			class_name		: 'info_text',
			parent			: content_data
		})

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response',
			parent			: content_data
		})

	// check process status always
		const check_process_data = () => {
			data_manager.get_local_db_data(
				'process_make_backup',
				'status'
			)
			.then(function(local_data){
				if (local_data && local_data.value) {
					update_process_status(
						'process_make_backup',
						local_data.value.pid,
						local_data.value.pfile,
						body_response
					)
				}
			})
		}
		check_process_data()

	// fn_submit
		const fn_submit = async (e) => {
			e.stopPropagation()

			// prevent multiple calls
			const local_db_data = await data_manager.get_local_db_data(
				'process_make_backup',
				'status'
			)
			if (local_db_data) {
				alert("Busy!");
				return
			}

			if (!confirm(get_label.seguro || 'Sure?')) {
				return
			}

			// blur button
			document.activeElement.blur()

			// call API to fire process and get PID
			const api_response = await self.make_backup()

			if (!api_response || !api_response.result) {
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'error',
					inner_html		: 'Error: failed make_backup',
					parent			: body_response
				})
				return
			}

			// fire update_process_status
			update_process_status(
				'process_make_backup',
				api_response.pid,
				api_response.pfile,
				body_response
			)
		}//end fn_submit

	// button submit (make backup)
		const button_submit = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_submit',
			inner_html		: self.name,
			parent			: content_data
		})
		content_data.button_submit = button_submit
		button_submit.addEventListener('click', fn_submit)

	// add at end body_response
		content_data.appendChild(body_response)

	// backup_files
		const backup_files_container = render_psql_backup_files(self)
		content_data.appendChild(backup_files_container)

	// form backup MySQL DDBB
		if (mysql_db && mysql_db[0] && mysql_db[0].db_name) {

			// mysql_body_response
			const mysql_body_response = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'body_response'
			})

			// form init
			self.caller.init_form({
				submit_label	: 'Backup MySQL DDBB: ' + mysql_db.map(el => el.db_name).join(', '),
				confirm_text	: get_label.sure || 'Sure?',
				body_info		: content_data,
				body_response	: mysql_body_response,
				on_submit		: async (e) => {
					await handle_submit(
						mysql_body_response,
						e.target,
						self.make_mysql_backup
					)
				}
			})

			// add at end body_response
			content_data.appendChild(mysql_body_response)

			// mysql_backup_files
			const backup_files_container = render_mysql_backup_files(self)
			content_data.appendChild(backup_files_container)
		}


	return content_data
}//end get_content_data



/**
* REFRESH_FILES_LIST
* Get and print the files list of selected type
* @param object self
* @param string type
* 	psql|mysql
* @param HTMLElement container
* 	DOM node where print the result JSON list
* @return void
*/
const refresh_files_list = async (self, type, container) => {

	const psql_backup_files		= (type==='psql')
	const mysql_backup_files	= (type==='mysql')

	// get files list updated
	const api_response = await self.get_backup_files({
		max_files			: 20,
		psql_backup_files	: psql_backup_files,
		mysql_backup_files	: mysql_backup_files
	})

	// message from API response
	const msg = api_response?.result || ['Unknown error']
	// print list
	ui.update_node_content(container, JSON.stringify(msg, null, 2))
}//end refresh_files_list



/**
* RENDER_PSQL_BACKUP_FILES
* Render Dédalo backup files list
* Refresh the list every 2 sec
* @param object self widget instance
* @return HTMLElement backup_files_container
*/
const render_psql_backup_files = function(self) {

	// container
	const backup_files_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'backup_files_container'
	})

	let interval = null

	// button backup_toggle_button
	const backup_toggle_button = ui.create_dom_element({
		element_type	: 'div',
		inner_html		: get_label.show_last_files || 'Show last files',
		class_name		: 'backup_toggle_button unselectable',
		parent			: backup_files_container
	})
	const click_handler = async (e) => {
		e.stopPropagation()
		// toggle backup_files_list visibility
		backup_files_list.classList.toggle('hide')
		// clean previous intervals
		if (interval) {
			clearInterval(interval);
		}
		// if hiding, return
		if (backup_files_list.classList.contains('hide')) {
			return
		}
		// call API and refresh the list
		refresh_files_list(self, 'psql', backup_files_list)
		// activate interval to refresh after 2 sec
		interval = setInterval(()=>{
			// check if widget body is hidden, if true, clear interval
			const widget_body = self.node.parentNode
			if (widget_body && widget_body.classList.contains('hide')) {
				// fire click_handler event to hide the list and stop interval
				backup_toggle_button.click()
				return
			}
			refresh_files_list(self, 'psql', backup_files_list)
		}, 2000);
	}
	backup_toggle_button.addEventListener('click', click_handler)

	// files list container (JSON array of objects) as
	// [{ "name": "2024-04-02_223514.dedalo6_development.postgresql_-1_forced_dbv6-1-4.custom.backup", "size": "5.34 GB"}]
	const backup_files_list = ui.create_dom_element({
		element_type	: 'pre',
		class_name		: 'backup_files_list hide',
		parent			: backup_files_container
	})


	return backup_files_container
}//end render_psql_backup_files



/**
* RENDER_MYSQL_BACKUP_FILES
* Render MySQL backup files list
* Refresh the list every 2 sec
* @param object self widget instance
* @return HTMLElement backup_files_container
*/
const render_mysql_backup_files = function(self) {

	// container
	const backup_files_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'backup_files_container'
	})

	let interval = null

	// button toggle
	const mysql_backup_toggle = ui.create_dom_element({
		element_type	: 'div',
		inner_html		: get_label.show_last_files || 'Show last files',
		class_name		: 'backup_toggle_button unselectable',
		parent			: backup_files_container
	})
	const click_handler = async (e) => {
		e.stopPropagation()
		// toggle backup_files_list visibility
		mysql_backup_files_list.classList.toggle('hide')
		// clean previous intervals
		if (interval) {
			clearInterval(interval);
		}
		// if hiding, return
		if (mysql_backup_files_list.classList.contains('hide')) {
			return
		}
		// call API and refresh the list
		refresh_files_list(self, 'mysql', mysql_backup_files_list)
		// activate interval to refresh after 2 sec
		interval = setInterval(()=> {
			// check if widget body is hidden, if true, clear interval
			const widget_body = self.node.parentNode
			if (widget_body && widget_body.classList.contains('hide')) {
				// fire click_handler event to hide the list and stop interval
				mysql_backup_toggle.click()
				return
			}
			refresh_files_list(self, 'mysql', mysql_backup_files_list)
		}, 2000);
	}
	mysql_backup_toggle.addEventListener('click', click_handler)

	// files list container (JSON array of objects) as
	// [{ "name": "2024-04-02_223514.dedalo6_development.postgresql_-1_forced_dbv6-1-4.custom.backup", "size": "5.34 GB"}]
	const mysql_backup_files_list = ui.create_dom_element({
		element_type	: 'pre',
		class_name		: 'mysql_backup_files_list hide',
		parent			: backup_files_container
	})


	return backup_files_container
}//end render_mysql_backup_files



// @license-end
