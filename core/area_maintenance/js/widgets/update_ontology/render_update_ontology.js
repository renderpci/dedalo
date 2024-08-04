// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_UPDATE_ONTOLOGY
* Manages the component's logic and appearance in client side
*/
export const render_update_ontology = function() {

	return true
}//end render_update_ontology



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
render_update_ontology.prototype.list = async function(options) {

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
		const current_ontology		= value.current_ontology
		const ontology_db			= value.ontology_db
		const structure_from_server	= value.structure_from_server
		const structure_server_url	= value.structure_server_url
		const structure_server_code	= value.structure_server_code
		const prefix_tipos			= value.prefix_tipos || []
		const confirm_text			= value.confirm_text || 'Sure?'

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// info_text
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: `Current Ontology version: <b>${current_ontology}</b>`,
			parent			: content_data
		})

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// dedalo_entity check
		if (ontology_db) {
			// message development
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'info_text warning',
				inner_html		: 'Disabled update Ontology. You are using config ONTOLOGY_DB !',
				parent			: content_data
			})
		}else{
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
				// structure_from_server
					add_to_grid('Config:', '')
					add_to_grid('STRUCTURE_FROM_SERVER', structure_from_server)
					add_to_grid('STRUCTURE_SERVER_URL', structure_server_url)
					add_to_grid('STRUCTURE_SERVER_CODE', structure_server_code)
					add_to_grid('DEDALO_PREFIX_TIPOS', prefix_tipos.join(', '))


			// form init
				self.caller.init_form({
					submit_label	: 'Update Dédalo Ontology to the latest version',
					confirm_text	: confirm_text,
					body_info		: content_data,
					body_response	: body_response,
					inputs			: [{
						type		: 'text',
						name		: 'dedalo_prefix_tipos',
						label		: 'TLD list to update',
						mandatory	: true,
						value		: prefix_tipos
					}],
					trigger : {
						dd_api	: 'dd_area_maintenance_api',
						action	: 'update_ontology',
						options	: null
					}
				})
		}//end if (ontology_db)

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit



// @license-end
