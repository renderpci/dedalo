// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {object_to_url_vars} from '../../../../common/js/utils/index.js'



/**
* RENDER_EXPORT_ONTOLOGY_TO_JSON
* Manages the widget logic and appearance in client side
*/
export const render_export_ontology_to_json = function() {

	return true
}//end render_export_ontology_to_json



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
render_export_ontology_to_json.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await render_content_data(self)
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
* RENDER_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const render_content_data = async function(self) {

	// short vars
		const value		= self.value || {}
		const file_name	= value.file_name
		const file_path	= value.file_path
		const tipos		= value.tipos

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// info
		const text = `Target: <em>${file_path}/${file_name}</em>`
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
		if (self.caller?.init_form) {
			self.caller.init_form({
				submit_label	: self.name,
				confirm_text	: get_label.sure || 'Sure?',
				body_info		: content_data,
				body_response	: body_response,
				inputs			: [{
					type		: 'text',
					name		: 'dedalo_prefix_tipos',
					label		: 'Dédalo prefix tipos to export',
					mandatory	: true,
					value		: tipos.join(',')
				}],
				trigger			: {
					dd_api	: 'dd_area_maintenance_api',
					action	: 'structure_to_json',
					options	: null
				}
			})
		}

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end render_content_data



// @license-end
