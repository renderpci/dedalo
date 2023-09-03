// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	// import {object_to_url_vars} from '../../../../common/js/utils/index.js'



/**
* RENDER_BUILD_INSTALL_VERSION
* Manages the widget logic and appearance in client side
*/
export const render_build_install_version = function() {

	return true
}//end render_build_install_version



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
render_build_install_version.prototype.list = async function(options) {

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
		const value			= self.value || {}
		const source_db		= value.source_db
		const target_db		= value.target_db
		const target_file	= value.target_file

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// info
		const text = `Clone the current database "${source_db}" to "${target_db}" and export it to file: ${target_file}`
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
				dd_api	: 'dd_utils_api',
				action	: 'build_install_version',
				options	: null
			}
		})

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data



// @license-end
