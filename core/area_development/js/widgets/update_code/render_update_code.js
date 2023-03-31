/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {object_to_url_vars} from '../../../../common/js/utils/index.js'



/**
* RENDER_update_code
* Manages the component's logic and appearance in client side
*/
export const render_update_code = function() {

	return true
}//end render_update_code



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_development
* @param object options
* 	Sample:
* 	{
*		render_level : "full"
		render_mode : "list"
*   }
* @return HTMLElement wrapper
* 	To append to the widget body node (area_development)
*/
render_update_code.prototype.list = async function(options) {

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
			element_type : 'div'
		})

	// info
		const text = `Current version: <b>${page_globals.dedalo_version}</b><br>Current build: <b>${page_globals.dedalo_build}</b>`
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
			submit_label	: 'Update Dédalo code to the latest version',
			confirm_text	: get_label.sure || 'Sure?',
			body_info		: content_data,
			body_response	: body_response,
			trigger : {
				dd_api	: 'dd_utils_api',
				action	: 'update_code',
				options	: null
			}
		})

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit
