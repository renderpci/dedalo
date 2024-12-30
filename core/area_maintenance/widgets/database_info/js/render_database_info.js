// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {data_manager} from '../../../../common/js/data_manager.js'



/**
* RENDER_DATABASE_INFO
* Manages the component's logic and appearance in client side
*/
export const render_database_info = function() {

	return true
}//end render_database_info



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
render_database_info.prototype.list = async function(options) {

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
		const value		= self.value || {}
		const info		= value.info || {}
		const database	= info.IntervalStyle || ''
		const server	= info.server || ''
		const host		= info.host || ''

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// Database info
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: '',
			inner_html		: `Database ${database} ${server} ${host}`,
			parent			: content_data
		})

	// version_info
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'version_info',
			inner_html		: JSON.stringify(info, null, 2),
			parent			: content_data
		})

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// form init
		if (self.caller?.init_form) {
			self.caller.init_form({
				submit_label	: 'Re-build indexes',
				confirm_text	: get_label.seguro || 'Sure?',
				body_info		: content_data,
				body_response	: body_response,
				on_submit	: async (e) => {

					// clean body_response nodes
						while (body_response.firstChild) {
							body_response.removeChild(body_response.firstChild);
						}

					// loading add
						e.target.classList.add('lock')
						const spinner = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'spinner'
						})
						body_response.prepend(spinner)

					// API worker call
						const api_response = await data_manager.request({
							use_worker	: true,
							body		: {
								dd_api	: 'dd_area_maintenance_api',
								action	: 'class_request',
								source	: {
									action : 'rebuild_db_indexes'
								},
								options	: {}
							}
						})

					// loading  remove
						spinner.remove()
						e.target.classList.remove('lock')

					// remove annoying rqo_string from object
						if (api_response && api_response.debug && api_response.debug.rqo_string) {
							delete api_response.debug.rqo_string
						}

					// response_node pre JSON response
						if (api_response) {
							ui.create_dom_element({
								element_type	: 'pre',
								class_name		: 'response_node',
								inner_html		: JSON.stringify(api_response, null, 2),
								parent			: body_response
							})
						}
				}
			})

			self.caller.init_form({
				submit_label	: 'Consolidate tables',
				confirm_text	: get_label.seguro || 'Sure?',
				body_info		: content_data,
				body_response	: body_response,
				on_submit	: async (e) => {

					// clean body_response nodes
						while (body_response.firstChild) {
							body_response.removeChild(body_response.firstChild);
						}

					// loading add
						e.target.classList.add('lock')
						const spinner = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'spinner'
						})
						body_response.prepend(spinner)

					// API worker call
						const api_response = await data_manager.request({
							use_worker	: true,
							body		: {
								dd_api	: 'dd_area_maintenance_api',
								action	: 'class_request',
								source	: {
									action : 'consolidate_tables'
								},
								options	: {}
							}
						})

					// loading  remove
						spinner.remove()
						e.target.classList.remove('lock')

					// remove annoying rqo_string from object
						if (api_response && api_response.debug && api_response.debug.rqo_string) {
							delete api_response.debug.rqo_string
						}

					// response_node pre JSON response
						if (api_response) {
							ui.create_dom_element({
								element_type	: 'pre',
								class_name		: 'response_node',
								inner_html		: JSON.stringify(api_response, null, 2),
								parent			: body_response
							})
						}
				}
			})
		}

	// add body_response at end
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit



// @license-end
