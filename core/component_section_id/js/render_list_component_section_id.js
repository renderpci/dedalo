/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_LIST_COMPONENT_SECTION_ID
* Manage the components logic and appearance in client side
*/
export const render_list_component_section_id = function(component) {


	return true
};//end render_list_component_section_id



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_list_component_section_id.prototype.list = function() {

	const self = this

	// short vars
		const context 	= self.context
		const data 		= self.data

	// Value as string
		const value_string = data.value

	// Node create
		const node = ui.create_dom_element({
			element_type	: "div",
			class_name		: self.model + '_list ' + self.tipo,
			text_content	: value_string
		})

	// Debug
		//console.log("++ context", context);
		//console.log("++ data:", data);

	return node
};//end list


