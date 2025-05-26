// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {render_stream} from '../../../../common/js/render_common.js'



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

	// update_process_status
		const update_process_status = (pid, pfile, container) => {

			// locks the button submit
			button_submit.classList.add('loading')

			// get_process_status from API and returns a SEE stream
			data_manager.request_stream({
				body : {
					dd_api		: 'dd_utils_api',
					action		: 'get_process_status',
					update_rate	: 1000, // int milliseconds
					options		: {
						pid		: pid,
						pfile	: pfile
					}
				}
			})
			.then(function(stream){

				// render base nodes and set functions to manage
				// the stream reader events
				const render_response = render_stream({
					container	: container,
					id			: 'process_make_backup',
					pid			: pid,
					pfile		: pfile
				})

				// on_read event (called on every chunk from stream reader)
				const on_read = (sse_response) => {
					// fire update_info_node on every reader read chunk
					render_response.update_info_node(sse_response)
					// get files list updated with last file only
					update_last_file_info()
				}

				// on_done event (called once at finish or cancel the stream read)
				const on_done = () => {
					// is triggered at the reader's closing
					render_response.done()
					// unlocks the button submit
					button_submit.classList.remove('loading')
				}

				// read stream. Creates ReadableStream that fire
				// 'on_read' function on each stream chunk at update_rate
				// (1 second default) until stream is done (PID is no longer running)
				data_manager.read_stream(stream, on_read, on_done)
			})
		}

	// check process status always
		const check_process_data = () => {
			data_manager.get_local_db_data(
				'process_make_backup',
				'status'
			)
			.then(function(local_data){
				if (local_data && local_data.value) {
					update_process_status(
						local_data.value.pid,
						local_data.value.pfile,
						body_response
					)
				}
			})
		}
		check_process_data()

	// update_last_file_info. CAll API to get updated info about the last updated file
		const update_last_file_info = () => {
			data_manager.request({
				use_worker	: true,
				body		: {
					dd_api	: 'dd_area_maintenance_api',
					action	: 'class_request',
					source	: {
						action : 'get_dedalo_backup_files'
					},
					options	: {
						max_files			: 1,
						psql_backup_files	: true,
						mysql_backup_files	: false
					}
				},
				retries : 1, // one try only
				timeout : 3600 * 1000 // 1 hour waiting response
			})
			.then(function(response){
				// backup_files_info node created once
				const backup_files_info = document.getElementById('backup_files_info') || ui.create_dom_element({
					element_type	: 'pre',
					id				: 'backup_files_info',
					class_name		: 'backup_files_info',
					parent			: body_response
				})
				const msg = response?.result?.psql_backup_files[0]
				ui.update_node_content(backup_files_info, JSON.stringify(msg, null, 2))
			})
		}

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

			// clean up container
			while (body_response.firstChild) {
				body_response.removeChild(body_response.firstChild);
			}

			// call API to fire process and get PID
			const api_response = await data_manager.request({
				use_worker	: true,
				body		: {
					dd_api	: 'dd_area_maintenance_api',
					action	: 'class_request',
					source	: {
						action : 'make_backup'
					},
					options	: {}
				},
				retries : 1, // one try only
				timeout : 3600 * 1000 // 1 hour waiting response
			})

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
		const backup_files_container = render_psql_backup_files()
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
				trigger		: {
					dd_api	: 'dd_area_maintenance_api',
					action	: 'class_request',
					source	: {
						action : 'make_mysql_backup'
					},
					options	: {}
				}
			})

			// add at end body_response
			content_data.appendChild(mysql_body_response)

			// mysql_backup_files
			const backup_files_container = render_mysql_backup_files()
			content_data.appendChild(backup_files_container)
		}


	return content_data
}//end get_content_data



/**
* REFRESH_FILES_LIST
* Get and print the files list of selected type
* @param string type
* 	psql|mysql
* @param HTMLElement container
* 	DOM node where print the result JSON list
* @return void
*/
const refresh_files_list = async (type, container) => {

	const psql_backup_files		= (type==='psql')
	const mysql_backup_files	= (type==='mysql')

	// get files list updated
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api	: 'dd_area_maintenance_api',
			action	: 'class_request',
			source	: {
				action : 'get_dedalo_backup_files'
			},
			options	: {
				max_files			: 20,
				psql_backup_files	: psql_backup_files,
				mysql_backup_files	: mysql_backup_files
			}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})
	// message from API response
	const msg = api_response?.result || ['Unknown error']
	// print list
	ui.update_node_content(container, JSON.stringify(msg, null, 2))
}//end refresh_files_list



/**
* RENDER_PSQL_BACKUP_FILES
* Render Dédalo backup files list
* Refresh the list every 1 sec
* @return HTMLElement backup_files_container
*/
const render_psql_backup_files = function() {

	// container
	const backup_files_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'backup_files_container'
	})

	let interval = null

	// button toggle
	const backup_toggle = ui.create_dom_element({
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
		refresh_files_list('psql', backup_files_list)
		// activate interval to refresh after 1 sec
		interval = setInterval(()=>{
			refresh_files_list('psql', backup_files_list)
		}, 1000);
	}
	backup_toggle.addEventListener('click', click_handler)

	// files list container (JOSN array of objects) as
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
* Refresh the list every 1 sec
* @return HTMLElement backup_files_container
*/
const render_mysql_backup_files = function() {

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
		refresh_files_list('mysql', mysql_backup_files_list)
		// activate interval to refresh after 1 sec
		interval = setInterval(()=> {
			refresh_files_list('mysql', mysql_backup_files_list)
		}, 1000);
	}
	mysql_backup_toggle.addEventListener('click', click_handler)

	// files list container (JOSN array of objects) as
	// [{ "name": "2024-04-02_223514.dedalo6_development.postgresql_-1_forced_dbv6-1-4.custom.backup", "size": "5.34 GB"}]
	const mysql_backup_files_list = ui.create_dom_element({
		element_type	: 'pre',
		class_name		: 'mysql_backup_files_list hide',
		parent			: backup_files_container
	})


	return backup_files_container
}//end render_mysql_backup_files



// @license-end
