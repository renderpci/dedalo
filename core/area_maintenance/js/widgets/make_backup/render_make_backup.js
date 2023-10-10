// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	// import {object_to_url_vars} from '../../../../common/js/utils/index.js'



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

	// info
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
			class_name		: 'body_response'
		})

	// form init
		self.caller.init_form({
			submit_label	: self.name,
			confirm_text	: get_label.sure || 'Sure?',
			body_info		: content_data,
			body_response	: body_response,
			trigger : {
				dd_api	: 'dd_area_maintenance_api',
				action	: 'make_backup',
				options	: null
			}
		})

	// form backup MySQL DDBB
		console.log('mysql_db:', mysql_db);
		if (mysql_db && mysql_db[0] && mysql_db[0].db_name) {

			// form init
			self.caller.init_form({
				submit_label	: 'Backup MySQL DDBB: ' + mysql_db.map(el => el.db_name).join(', '),
				confirm_text	: get_label.sure || 'Sure?',
				body_info		: content_data,
				body_response	: body_response,
				trigger : {
					dd_api	: 'dd_area_maintenance_api',
					action	: 'make_mysql_backup',
					options	: null
				}
			})
		}

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data



// @license-end
