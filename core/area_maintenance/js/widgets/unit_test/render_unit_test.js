// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	// import {object_to_url_vars} from '../../../../common/js/utils/index.js'
	// import {data_manager} from '../../../../common/js/data_manager.js'



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

	// form init new empty test record
		self.caller.init_form({
			submit_label	: 'Truncate test table and Create new empty test record',
			confirm_text	: get_label.sure || 'Sure?',
			body_info		: content_data,
			body_response	: body_response,
			trigger : {
				dd_api	: 'dd_area_maintenance_api',
				action	: 'create_test_record',
				options	: null
			}
		})

	// button_run_long_process
		const button_run_long_process = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_run_long_process',
			inner_html		: 'Run long process',
			parent			: content_data
		})
		button_run_long_process.addEventListener('click', fn_unlock)
		async function fn_unlock(e) {
			e.stopPropagation()

			// prompt
				const seconds = prompt('Seconds');
				if (seconds===null) {
					// user cancel action case
					return
				}

			// lock
				content_data.classList.add('lock')

			// spinner
				const spinner = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'spinner'
				})
				info_node.prepend(spinner)

			// request
				const api_response = await data_manager.request({
					use_worker	: true,
					body		: {
						dd_api	: 'dd_area_maintenance_api',
						action	: 'run_long_process',
						options	: {
							seconds : seconds
						}
					}
				})

				info_node.innerHTML = JSON.stringify({
					action	: 'run_long_process',
					result	: api_response.result,
					msg		: api_response.msg
				}, null, 2)

			// lock
				content_data.classList.remove('lock')
				spinner.remove()
		}//end fn_reset_counter

	// info_node
		const info_node = ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'info_node',
			parent			: content_data
		})


	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit



// @license-end
