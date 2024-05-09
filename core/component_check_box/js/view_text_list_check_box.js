// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_CHECK_BOX
* Manage the components logic and appearance in client side
*/
export const view_text_list_check_box = function() {

	return true
}//end view_text_list_check_box



/**
* RENDER
* Render node to be used by service autocomplete or any datalist
* @param object self
* 	Instance of current component
* @return HTMLElement wrapper
*/
view_text_list_check_box.render = async function(self) {

	// short vars
		const data	= self.data
		const value	= data.value || []

	// fields_separator
		const fields_separator = self.context.fields_separator || ', '

	// Value as string
		const value_string = value.join( fields_separator )

		// const text_node = document.createTextNode(value_string)

	// wrapper. Set as span to preserve html tags like mark, etc.
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
