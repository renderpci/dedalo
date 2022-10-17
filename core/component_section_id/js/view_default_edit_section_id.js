/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'
	// import {event_manager} from '../../common/js/event_manager.js'



/**
* VIEW_DEFAULT_EDIT_SECTION_ID
* Manage the components logic and appearance in client side
*/
export const view_default_edit_section_id = function() {

	return true
}//end view_default_edit_section_id



/**
* RENDER
* Render node for use in edit
* @return DOM node
*/
view_default_edit_section_id.render = async function(self, options) {

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
}//end render



/**
* CONTENT_DATA_EDIT
* Note that this component it's editable only in search mode
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
