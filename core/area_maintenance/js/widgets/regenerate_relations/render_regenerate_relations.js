/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_regenerate_relations
* Manages the component's logic and appearance in client side
*/
export const render_regenerate_relations = function() {

	return true
}//end render_regenerate_relations



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
render_regenerate_relations.prototype.list = async function(options) {

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
		const body					= value.body
		const structure_from_server	= value.structure_from_server
		const structure_server_url	= value.structure_server_url
		const structure_server_code	= value.structure_server_code
		const prefix_tipos			= value.prefix_tipos || []
		const confirm_text			= value.confirm_text || 'Sure?'


	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// info
		const info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: body,
			parent			: content_data
		})

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// form init
		self.caller.init_form({
			submit_label	: 'Regenerate relations table data',
			confirm_text	: confirm_text,
			body_info		: content_data,
			body_response	: body_response,
			inputs			: [{
				type		: 'text',
				name		: 'tables',
				label		: 'Table name/s like "matrix,matrix_hierarchy" or "*" for all',
				mandatory	: true
			}],
			trigger : {
				dd_api	: 'dd_area_maintenance_api',
				action	: 'regenerate_relations',
				options	: null
			}
		})


	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit
