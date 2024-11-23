// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {object_to_url_vars} from '../../../../common/js/utils/index.js'



/**
* RENDER_PUBLICATION_API
* Manages the component's logic and appearance in client side
*/
export const render_publication_api = function() {

	return true
}//end render_publication_api



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
render_publication_api.prototype.list = async function(options) {

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
		const value							= self.value || {}
		const api_web_user_code_multiple	= value.api_web_user_code_multiple || []

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// api_web_user_code_multiple iterate
		const api_web_user_code_multiple_length = api_web_user_code_multiple.length
		for (let i = 0; i < api_web_user_code_multiple_length; i++) {

			const item = api_web_user_code_multiple[i]

			// button_open
				const button_open = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'light',
					inner_html		: `Open Swagger UI ${item.db_name}`,
					parent			: content_data
				})
				// click event
				const click_handler = (e) => {
					e.stopPropagation()

					// url
						const url_vars = object_to_url_vars({
							code	: item.code,
							db_name	: item.db_name,
							lang	: page_globals.dedalo_application_lang
						})

					// api_ui. Normally is in the same server, but it is possible to define other in config.php
					const api_ui = item.api_ui
						? item.api_ui
						: `${DEDALO_ROOT_WEB}/publication/server_api/v1/docu/ui/`

					const url = api_ui + '?' + url_vars

					window.open(url)
				}
				button_open.addEventListener('click', click_handler)
		}

	// diffusion_values (from config file)
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: '',
			inner_html		: JSON.stringify(value, null, 2),
			parent			: content_data
		})

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})
		// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit


// @license-end
