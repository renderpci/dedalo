// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {data_manager} from '../../../../common/js/data_manager.js'



/**
* RENDER_EXPORT_HIERARCHY
* Manages the component's logic and appearance in client side
*/
export const render_export_hierarchy = function() {

	return true
}//end render_export_hierarchy



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
render_export_hierarchy.prototype.list = async function(options) {

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
		const value					= self.value || {}
		const export_hierarchy_path	= value.export_hierarchy_path || null
		const confirm_text			= value.confirm_text || 'Sure?'

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// export_hierarchy_path check
		if (!export_hierarchy_path) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'info_text',
				inner_html		: `To enable exporting, define var EXPORT_HIERARCHY_PATH in the configuration file`,
				parent			: content_data
			})
			return content_data
		}

	// info
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: `Creates files like es1.copy.gz in /install/import/hierarchy (for MASTER toponymy export)`,
			parent			: content_data
		})

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

		// config_grid
			const config_grid = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'config_grid',
				parent			: content_data
			})
			const add_to_grid = (label, value) => {
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'label',
					inner_html		: label,
					parent			: config_grid
				})
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'value',
					inner_html		: value,
					parent			: config_grid
				})
			}
			// add lines to config_grid container
			add_to_grid('Config:', '')
			add_to_grid('export_hierarchy_path: ', export_hierarchy_path)

	// form init
		self.caller.init_form({
			submit_label	: 'Export hierarchy',
			confirm_text	: confirm_text,
			body_info		: content_data,
			body_response	: body_response,
			inputs			: [{
				type		: 'text',
				name		: 'section_tipo',
				label		: 'section tipo like es1,es2 or * for all active', // placeholder
				mandatory	: true,
				value		: ''
			}],
			on_submit	: (e, values) => {

				const input			= values.find(el => el.name==='section_tipo')
				const section_tipo	= input?.value // string like '*'

				const form_container = content_data.querySelector('.form_container')

				// clean
					while (body_response.firstChild) {
						body_response.removeChild(body_response.firstChild);
					}

				// spinner
					const spinner = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'spinner'
					})
					body_response.prepend(spinner)
					form_container.classList.add('lock')

				// counter long process fire
				data_manager.request({
					body		: {
						dd_api	: 'dd_area_maintenance_api',
						action	: 'class_request',
						source	: {
							action	: 'export_hierarchy',
						},
						options : {
							section_tipo : section_tipo // string like '*' or 'es1,es2'
						}
					}
				})
				.then(function(response){
					console.log('response:', response);
					form_container.classList.remove('lock')
					spinner.remove()

					ui.create_dom_element({
						element_type	: 'pre',
						inner_html		: JSON.stringify(response, null, 2),
						parent			: body_response
					})


				})
			}
		})

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit



// @license-end
