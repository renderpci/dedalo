// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_ar_raw_data_value} from './render_edit_component_date.js'


/**
* VIEW_TEXT_LIST_DATE
* Manages the component's logic to get the values of the data without DOM elements or structure
*/
export const view_text_list_date = function() {

	return true
}//end view_text_list_date



/**
* RENDER
* Output component value to use as raw text
* @return DOM textNode text_node
*/
view_text_list_date.render = async function(self, options) {

	const ar_value		= get_ar_raw_data_value(self)
	const value_string	= ar_value.join(self.context.fields_separator)

	// wrapper. Set as span
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
