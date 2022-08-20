/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'
	// import {event_manager} from '../../common/js/event_manager.js'



/**
* RENDER_EDIT_COMPONENT_SECTION_ID
* Manage the components logic and appearance in client side
*/
export const render_edit_component_section_id = function() {

	return true
}//end render_edit_component_section_id



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_edit_component_section_id.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = function(self) {

	const value = self.data.value

	// content_data
		const content_data = ui.component.build_content_data(self)

	// section_id value
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'section_id',
			inner_html		: value,
			parent			: content_data
		})

	return content_data
}//end get_content_data_edit
