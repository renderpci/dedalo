/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {object_to_url_vars} from '../../../../common/js/utils/index.js'



/**
* RENDER_UNIT_TEST
* Manages the component's logic and appearance in client side
*/
export const render_unit_test = function() {

	return true
}//end render_unit_test



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
render_unit_test.prototype.list = async function(options) {

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

	// button_open
		const button_open = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light',
			inner_html		: `Open alpha unit test`,
			parent			: content_data
		})
		button_open.addEventListener('click', function(e) {
			e.stopPropagation()

			// url
			const url = `${DEDALO_ROOT_WEB}/core/unit_test/`

			window.open(url)
		})

	// list_of_test
		const list_of_test = ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'list_of_test',
			parent			: content_data
		})
		const content = content_data
		import('../../../../unit_test/js/list.js')
		.then(function(module){
			list_of_test.innerHTML = JSON.stringify(module.list_of_test, null, 2)
		})


	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// form init
		self.caller.init_form({
			submit_label	: 'Truncate test table and Create new empty test record',
			confirm_text	: get_label.sure || 'Sure?',
			body_info		: content_data,
			body_response	: body_response,
			trigger : {
				dd_api	: 'dd_utils_api',
				action	: 'create_test_record',
				options	: null
			}
		})




	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit
